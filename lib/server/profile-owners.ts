import { db } from '@/lib/db';
import { profileOwners, profiles } from '@/lib/schema';
import { and, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';

/**
 * Marker written into profiles.status.source by the public intake form
 * (app/api/listings/intake/route.ts).
 *
 * This is what separates "a business listing nobody has claimed yet" from "a
 * legacy personal profile waiting for its owner to sign in". They look
 * identical otherwise — both have userId NULL — but only the second one may be
 * attached implicitly at sign-in. See notBusinessListing below.
 */
export const BUSINESS_INTAKE_SOURCE = 'business_intake';

/**
 * Profiles that implicit auto-claim is allowed to touch.
 *
 * Auto-claim attaches a profile to whoever signs in with a matching email and
 * makes it their personal identity. That is correct for an admin-imported
 * personal profile, and wrong for a business: it would make the human *be* the
 * business, consume their one profiles.userId slot, and silently block them
 * from ever running a second listing. Businesses go through the explicit claim
 * flow instead, which grants ownership without touching identity.
 *
 * IS DISTINCT FROM rather than <>, because status is NULL on most rows and
 * NULL <> 'business_intake' is NULL, which would filter out everything.
 */
export const notBusinessListing: SQL = sql`(${profiles.status}->>'source' IS DISTINCT FROM ${BUSINESS_INTAKE_SOURCE})`;

export type ProfileOwnerRole = 'owner' | 'admin' | 'editor';

/**
 * Can this user administer this profile?
 *
 * Deliberately accepts either link:
 *   - profiles.userId — the human's own identity profile
 *   - a profile_owners row — granted by claiming, or by an existing owner
 *
 * Both are checked rather than relying on the 0035 backfill alone, so that a
 * code path which sets profiles.userId without writing an owner row can never
 * lock a user out of their own profile. Ownership is additive; it is never the
 * only thing standing between someone and their account.
 */
export async function canAdministerProfile(
  userId: string,
  profileId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .leftJoin(
      profileOwners,
      and(
        eq(profileOwners.profileId, profiles.id),
        eq(profileOwners.userId, userId)
      )
    )
    .where(
      and(
        eq(profiles.id, profileId),
        or(eq(profiles.userId, userId), sql`${profileOwners.id} IS NOT NULL`)
      )
    )
    .limit(1);

  return Boolean(row);
}

/**
 * Where a listing stands with review, as the member should see it.
 *
 * `active` alone cannot answer this. A listing is inactive both before anyone
 * has looked at it and after it was declined, and calling the second one
 * "under review" would tell someone to keep waiting for a decision that has
 * already been made. The admin approve/decline route stamps status.approved /
 * status.declined (app/api/admin/profile/action), so the undecided case is
 * exactly "inactive, and neither stamp present".
 *
 * Only ever 'pending' for a business listing. An inactive personal profile is
 * a draft its owner has not finished — nobody is reviewing it, and telling
 * them to wait would be a lie.
 */
export type ProfileReviewState = 'published' | 'pending' | 'inactive';

/**
 * Every profile this user administers, personal profile included.
 *
 * The union is expressed as an OR over the same left join used above rather
 * than two queries, so the caller gets one ordered list with no duplicates.
 */
export async function listAdministeredProfiles(userId: string) {
  return db
    .selectDistinctOn([profiles.id], {
      id: profiles.id,
      name: profiles.name,
      email: profiles.email,
      screenname: profiles.screenname,
      active: profiles.active,
      primaryImageCdn: profiles.primaryImageCdn,
      isPersonal: sql<boolean>`(${profiles.userId} = ${userId})`,
      role: sql<ProfileOwnerRole>`COALESCE(${profileOwners.role}, 'owner')`,
      reviewState: sql<ProfileReviewState>`CASE
        WHEN ${profiles.active} THEN 'published'
        WHEN ${profiles.status}->>'source' = ${BUSINESS_INTAKE_SOURCE}
         AND ${profiles.status}->>'approved' IS NULL
         AND ${profiles.status}->>'declined' IS NULL THEN 'pending'
        ELSE 'inactive'
      END`,
    })
    .from(profiles)
    .leftJoin(
      profileOwners,
      and(
        eq(profileOwners.profileId, profiles.id),
        eq(profileOwners.userId, userId)
      )
    )
    .where(
      or(eq(profiles.userId, userId), sql`${profileOwners.id} IS NOT NULL`)
    )
    .orderBy(profiles.id);
}

/**
 * Does this user administer a profile that is not their own identity profile?
 *
 * In other words: do they already run a listing? Business listings keep
 * profiles.userId NULL and attach through profile_owners, so anything a user
 * administers that is not their personal profile is a listing.
 *
 * The personal profile is excluded explicitly. Every signed-in member has one,
 * so counting it would make the answer true for everybody — which is the
 * mistake listAdministeredProfiles invites, since that one includes it by
 * design. This is existence-only so it stays a single lookup instead of
 * loading every row.
 */
export async function administersOtherProfile(
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: profileOwners.id })
    .from(profileOwners)
    .innerJoin(profiles, eq(profiles.id, profileOwners.profileId))
    .where(
      and(
        eq(profileOwners.userId, userId),
        or(isNull(profiles.userId), ne(profiles.userId, userId))
      )
    )
    .limit(1);

  return Boolean(row);
}

/**
 * Grant ownership. Idempotent — re-claiming is a no-op rather than an error,
 * which keeps the claim endpoint safe to retry and safe against a double-click
 * on the confirmation link.
 */
export async function addProfileOwner(
  profileId: string,
  userId: string,
  role: ProfileOwnerRole = 'owner'
): Promise<void> {
  await db
    .insert(profileOwners)
    .values({ profileId, userId, role })
    .onConflictDoNothing({
      target: [profileOwners.profileId, profileOwners.userId],
    });
}

export type FirstClaimOutcome =
  | { outcome: 'accepted'; name: string; screenname: string | null }
  | { outcome: 'not-found' }
  | { outcome: 'already-claimed' };

/** Serialize first claims from setup invitations and legacy claim emails. */
export async function claimUnownedProfile(
  profileId: string,
  userId: string,
  invitationEmail?: string
): Promise<FirstClaimOutcome> {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select({
        id: profiles.id,
        name: profiles.name,
        screenname: profiles.screenname,
        userId: profiles.userId,
        pendingOwnerEmail: profiles.pendingOwnerEmail,
        status: profiles.status,
      })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .for('update');
    if (!profile) return { outcome: 'not-found' };
    if (
      invitationEmail !== undefined &&
      (profile.userId !== null ||
        profile.pendingOwnerEmail !== invitationEmail ||
        (profile.status as { source?: string } | null)?.source !==
          BUSINESS_INTAKE_SOURCE)
    ) {
      return { outcome: 'not-found' };
    }
    const [owner] = await tx
      .select({ id: profileOwners.id })
      .from(profileOwners)
      .where(eq(profileOwners.profileId, profileId))
      .limit(1);
    if (profile.userId || owner) {
      if (invitationEmail !== undefined) {
        await tx
          .update(profiles)
          .set({ pendingOwnerEmail: null })
          .where(eq(profiles.id, profileId));
      }
      return { outcome: 'already-claimed' };
    }
    await tx.insert(profileOwners).values({ profileId, userId, role: 'owner' });
    await tx
      .update(profiles)
      .set({ pendingOwnerEmail: null })
      .where(eq(profiles.id, profileId));
    return {
      outcome: 'accepted',
      name: profile.name,
      screenname: profile.screenname,
    };
  });
}

/**
 * Has anyone claimed this listing?
 *
 * A listing is unclaimed when no one administers it by either link. Used to
 * decide whether to show the "Claim this business" call to action.
 */
export async function isProfileClaimed(profileId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: profiles.userId, ownerId: profileOwners.id })
    .from(profiles)
    .leftJoin(profileOwners, eq(profileOwners.profileId, profiles.id))
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!row) return false;
  return Boolean(row.userId || row.ownerId);
}

export async function claimedProfileIds(
  profileIds: string[]
): Promise<Set<string>> {
  if (profileIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ id: profiles.id })
    .from(profiles)
    .leftJoin(profileOwners, eq(profileOwners.profileId, profiles.id))
    .where(
      and(
        inArray(profiles.id, profileIds),
        or(
          sql`${profiles.userId} IS NOT NULL`,
          sql`${profileOwners.id} IS NOT NULL`
        )
      )
    );
  return new Set(rows.map((row) => row.id));
}
