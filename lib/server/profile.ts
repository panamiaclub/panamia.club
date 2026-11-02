import {
  addProfileOwner,
  notBusinessListing,
  BUSINESS_INTAKE_SOURCE,
} from '@/lib/server/profile-owners';
import { db } from '@/lib/db';
import { profiles, users } from '@/lib/schema';
import type { AccountType } from '@/lib/schema';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { DIRECTORY_ACCOUNT_TYPES } from '@/lib/accounts';
import { revalidatePath } from 'next/cache';
import { listingPublicPath } from '@/lib/listing-url';
import { normalizeUsZip, readOnlineZipArea } from '@/lib/online-zip';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import {
  ProfileDescriptions,
  ProfileMentoring,
  ProfileSocialsInterface,
} from '@/lib/interfaces';

export interface LegacyProfile {
  id: string;
  name: string;
  details: string | undefined;
  five_words: string | undefined;
  background: string | undefined;
  tags: string | undefined;
  phone_number: unknown;
  /** Set by Pana Mia staff; null means not certified. */
  panaCertifiedAt: Date | null;
  /** Online business without a public storefront; its ZIP may still be local. */
  onlineOnly: boolean;
  primary_address: {
    name: string | undefined;
    street1: string | undefined;
    street2: string | undefined;
    city: string | undefined;
    state: string | undefined;
    zipcode: string | undefined;
    country: string | undefined;
  };
  images: {
    primaryCDN: string | undefined;
    gallery1CDN: string | undefined;
    gallery2CDN: string | undefined;
    gallery3CDN: string | undefined;
  };
  geo: { type: string; coordinates: number[] } | null;
  mentoring: ProfileMentoring | null;
  socials: ProfileSocialsInterface | null;
  // The owning account's type, when this profile is somebody's identity.
  // Null for an unclaimed business listing, which has no linked user.
  accountType: AccountType | null;
  [key: string]: unknown;
}

/**
 * Pull [lng, lat] out of a profile row.
 *
 * address_lat/address_lng are authoritative — they are what the address
 * geocoder writes. The geo JSONB column is read only as a fallback for rows
 * imported before those columns existed.
 *
 * Both are validated rather than trusted: numeric columns arrive from the
 * driver as strings, and a half-populated row (lat set, lng NULL) would
 * otherwise produce a point at the equator.
 */
export function extractCoordinates(
  profile: Record<string, unknown>
): [number, number] | null {
  const lat = Number(profile.addressLat);
  const lng = Number(profile.addressLng);

  if (
    profile.addressLat != null &&
    profile.addressLng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return [lng, lat];
  }

  const geo = profile.geo as { coordinates?: unknown } | null;
  const legacy = Array.isArray(geo?.coordinates) ? geo.coordinates : null;
  if (legacy && legacy.length >= 2) {
    const [legacyLng, legacyLat] = [Number(legacy[0]), Number(legacy[1])];
    if (Number.isFinite(legacyLng) && Number.isFinite(legacyLat)) {
      return [legacyLng, legacyLat];
    }
  }

  return null;
}

/**
 * Transform Drizzle profile to legacy format for page components
 * This provides backward compatibility during migration
 */
function transformToLegacyFormat(
  profile: Record<string, unknown> & {
    descriptions?: unknown;
    mentoring?: unknown;
    accountType?: AccountType | null;
  }
): LegacyProfile {
  const descriptions = profile.descriptions as ProfileDescriptions | null;
  const mentoring = profile.mentoring as ProfileMentoring | null;
  const online = profile.onlineOnly === true;
  const zipArea = online
    ? readOnlineZipArea(profile.geo, profile.addressPostalCode)
    : null;

  return {
    ...profile,
    ...(online
      ? {
          addressName: null,
          addressLine1: null,
          addressLine2: null,
          addressLine3: null,
          addressLat: null,
          addressLng: null,
          addressGooglePlaceId: null,
          addressHours: null,
          addressPostalCode: normalizeUsZip(profile.addressPostalCode),
        }
      : {}),
    // Explicit typed fields (cast from Record<string, unknown>)
    id: profile.id as string,
    name: profile.name as string,
    panaCertifiedAt: (profile.panaCertifiedAt as Date | null) ?? null,
    // Declared explicitly rather than left to the spread so it survives the
    // Record<string, unknown> cast with a real boolean type. Defaults to
    // false: a row that predates the column is a physical business.
    onlineOnly: online,
    // Legacy field mappings
    details: descriptions?.details,
    five_words: descriptions?.fiveWords,
    background: descriptions?.background,
    tags: descriptions?.tags,
    phone_number: profile.phoneNumber,
    // Legacy address format
    primary_address: {
      name: online ? undefined : (profile.addressName as string | undefined),
      street1: online
        ? undefined
        : (profile.addressLine1 as string | undefined),
      street2: online
        ? undefined
        : (profile.addressLine2 as string | undefined),
      city: zipArea?.city ?? (profile.addressLocality as string | undefined),
      state: zipArea?.region ?? (profile.addressRegion as string | undefined),
      zipcode: online
        ? (normalizeUsZip(profile.addressPostalCode) ?? undefined)
        : (profile.addressPostalCode as string | undefined),
      country: profile.addressCountry as string | undefined,
    },
    // Legacy image format. Gallery slots live inside the gallery_images JSONB
    // column as { gallery1CDN, gallery2CDN, ... } — written that way by
    // /api/profile/upload. The previous implementation read gallery1Cdn/
    // gallery2Cdn/gallery3Cdn, which are not columns on this table, so the
    // gallery was unconditionally empty.
    images: (() => {
      const gallery = (profile.galleryImages ?? {}) as Record<
        string,
        string | undefined
      >;
      return {
        primaryCDN: profile.primaryImageCdn as string | undefined,
        gallery1CDN: gallery.gallery1CDN,
        gallery2CDN: gallery.gallery2CDN,
        gallery3CDN: gallery.gallery3CDN,
      };
    })(),
    // Legacy geo format. Reads the authoritative address_lat/address_lng
    // columns; the previous implementation referenced geoLat/geoLng, which are
    // not columns on this table, so geo was unconditionally null and the map
    // and distance never rendered.
    geo: (() => {
      if (online) return null;
      const coordinates = extractCoordinates(profile);
      return coordinates ? { type: 'Point', coordinates } : null;
    })(),
    // Mentoring stays as-is (JSONB)
    mentoring: mentoring,
    // Socials stays as-is (JSONB)
    socials: profile.socials as ProfileSocialsInterface | null,
    accountType: profile.accountType ?? null,
  };
}

/**
 * Get profile by public handle (User.screenname)
 * Returns profile in legacy format for page components
 */
export const getPublicProfile = async (handle: string) => {
  // Resolve profile-first. Business listings own their handle directly and have
  // no linked user, so a users-only lookup would 404 them. Personal profiles
  // are found the same way because screenname/set mirrors the handle onto the
  // profile; the users fallback below covers rows predating that mirror.
  const profile = await db.query.profiles.findFirst({
    where: sql`lower(${profiles.screenname}) = lower(${handle})`,
    with: { user: { columns: { screenname: true, accountType: true } } },
  });

  if (profile) {
    const publicProfile = transformToLegacyFormat({
      ...profile,
      user: { screenname: profile.screenname ?? profile.user?.screenname },
      accountType: profile.user?.accountType ?? null,
    });
    return !isPersonalProfile(publicProfile) && profile.active !== true
      ? null
      : publicProfile;
  }

  const user = await db.query.users.findFirst({
    where: sql`lower(${users.screenname}) = lower(${handle})`,
    with: { profile: true },
  });

  if (!user?.profile) return null;

  const publicProfile = transformToLegacyFormat({
    ...user.profile,
    user: { screenname: user.screenname },
    accountType: user.accountType ?? null,
  });
  return !isPersonalProfile(publicProfile) && user.profile.active !== true
    ? null
    : publicProfile;
};

/** Public ID routes are for approved directory listings, never personal profiles. */
export async function getPublicListing(
  profileId: string
): Promise<LegacyProfile | null> {
  const profile = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      eq(profiles.active, true),
      or(
        isNull(profiles.userId),
        inArray(
          profiles.userId,
          db
            .select({ id: users.id })
            .from(users)
            .where(inArray(users.accountType, DIRECTORY_ACCOUNT_TYPES))
        )
      )
    ),
    with: { user: { columns: { screenname: true, accountType: true } } },
  });
  if (!profile) return null;
  return transformToLegacyFormat({
    ...profile,
    screenname: profile.screenname ?? profile.user?.screenname ?? null,
    accountType: profile.user?.accountType ?? null,
  });
}

/** Unpublished intake listings are readable only after a server-side admin check. */
export async function getAdminListingPreview(
  profileId: string
): Promise<LegacyProfile | null> {
  if (!(await checkAdminAuth())) return null;

  const profile = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      sql`${profiles.status} ->> 'source' = ${BUSINESS_INTAKE_SOURCE}`
    ),
    with: { user: { columns: { screenname: true, accountType: true } } },
  });
  if (!profile) return null;

  return transformToLegacyFormat({
    ...profile,
    screenname: profile.screenname ?? profile.user?.screenname ?? null,
    accountType: profile.user?.accountType ?? null,
  });
}

export function revalidatePublicListing(
  profileId: string,
  screenname?: string | null
) {
  revalidatePath(listingPublicPath({ id: profileId }));
  if (screenname)
    revalidatePath(listingPublicPath({ id: profileId, screenname }));
}

/**
 * Is this handle a person, or a business listing?
 *
 * The personal profile and the directory listing are two different designs, so
 * /p/[user] has to pick one. The test is deliberately conservative: it answers
 * "personal" only on positive evidence, and everything it is unsure about
 * keeps the existing layout. Rendering a business as if it were a person is
 * the more visible and more embarrassing failure, so ambiguity resolves away
 * from the new design rather than into it.
 *
 * Two things disqualify a profile:
 *
 *   - status.source marks it as created by the public business intake form.
 *     Such a row has no linked user at all, so there is no person to render.
 *   - the owning account opted into the directory by choosing directory or
 *     hybrid. The row is otherwise identical to a personal one; the account
 *     type is the only thing that distinguishes "Ana" from "Ana's bakery".
 */
export function isPersonalProfile(profile: LegacyProfile): boolean {
  const status = profile.status as { source?: string } | null | undefined;

  if (status?.source === BUSINESS_INTAKE_SOURCE) return false;

  return profile.accountType === 'personal';
}

/**
 * Get profile by PostgreSQL user ID (cuid format)
 *
 * This is the primary lookup method for authenticated users.
 * After auth migration to PostgreSQL, profiles are linked via userId.
 *
 * @param userId - PostgreSQL User.id (cuid format)
 * @returns Profile document or null if not found
 */
export const getProfileByUserId = async (userId: string) => {
  return await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });
};

/**
 * Ensure a profile exists for a user, optionally claiming an unclaimed profile.
 *
 * This is the "lazy profile creation" pattern for the PostgreSQL
 * architecture. It handles the common case where:
 * 1. User signs in via OAuth/email (PostgreSQL user created)
 * 2. An unclaimed profile may exist from manual admin creation
 * 3. Profile should be linked to the authenticated user
 *
 * NOTE: This does NOT auto-create profiles because profiles require
 * user-provided fields (name, descriptions.fiveWords). Business listings are
 * created by /api/listings/intake, behind /form/get-listed; a member's
 * own profile is created when they claim a screenname.
 *
 * @param userId - PostgreSQL User.id (cuid format)
 * @param email - User's email for claiming unclaimed profiles
 * @returns Profile document or null if no profile exists
 *
 * @see auth.ts signIn callback for automatic claiming at sign-in
 * @see docs/DATABASE-DESIGN.md for architecture details
 */
export const ensureProfile = async (userId: string, email?: string) => {
  // First, try to find profile by userId (including user for screenname)
  const userProfile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
    with: { user: { columns: { screenname: true } } },
  });

  if (userProfile) {
    // Add screenname to returned profile for legacy compatibility
    return {
      ...userProfile,
      screenname: userProfile.user?.screenname,
    };
  }

  // If email provided, try to claim an unclaimed profile
  if (email) {
    const unclaimedProfile = await db.query.profiles.findFirst({
      where: and(
        eq(profiles.email, email.toLowerCase()),
        isNull(profiles.userId),
        // Same exclusion as auth.ts: an unclaimed *business* listing must not
        // become this user's personal profile. See lib/server/profile-owners.ts.
        notBusinessListing
      ),
    });

    if (unclaimedProfile) {
      // Strip any admin flag the unclaimed row happens to carry.
      //
      // Claiming a profile adopts its `roles`, which was harmless while that
      // column only held scoped moderator flags. Now that `roles.admin` grants
      // the admin surface, an unclaimed row carrying it would hand admin to
      // whoever claims it — and a row is claimed by proving control of an
      // email address, which is a far weaker bar than the grant route's
      // founder gate. No row can carry it today, since the only writer is
      // /api/admin/users/admin-role, but seeded, imported or migrated data
      // reaches this column without passing that gate, so the claim path
      // should not be the thing standing between a JSON blob and admin.
      const existingRoles = unclaimedProfile.roles as Record<
        string,
        unknown
      > | null;
      const safeRoles =
        existingRoles && 'admin' in existingRoles
          ? { ...existingRoles, admin: false }
          : existingRoles;

      const [claimed] = await db
        .update(profiles)
        .set({ userId, roles: safeRoles })
        .where(eq(profiles.id, unclaimedProfile.id))
        .returning();

      await addProfileOwner(unclaimedProfile.id, userId);

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { screenname: true },
      });

      return {
        ...claimed,
        screenname: user?.screenname,
        user: { screenname: user?.screenname },
      };
    }
  }

  // No profile exists - return null (caller should direct user to create one)
  return null;
};
