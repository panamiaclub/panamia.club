import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles, profileOwners, verification } from '@/lib/schema';
import {
  LISTING_INVITATION_DAYS,
  isListingInvitationToken,
  listingInvitationIdentifier,
  listingInvitationPath,
  type ListingInvitationState,
} from '@/lib/listing-invitation';
import { getEditableProfile } from './active-profile';
import {
  BUSINESS_INTAKE_SOURCE,
  claimUnownedProfileInTransaction,
  type ProfileOwnershipTransaction,
} from './profile-owners';
import { isReviewPausedListing } from './listing-refresh-status';

type Profile = typeof profiles.$inferSelect;
type Reader = Pick<typeof db, 'select'>;
interface StoredInvitation {
  tokenHash: string;
  contactHash: string;
  pendingOwnerHash: string;
  issuedBy: string;
}
export interface InvitationFailure {
  success: false;
  code:
    | 'invalid_invitation'
    | 'listing_unavailable'
    | 'already_claimed'
    | 'contact_unavailable';
  error: string;
  status: 400 | 404 | 409 | 410;
}
const invalid = (): InvitationFailure => ({
  success: false,
  code: 'invalid_invitation',
  error:
    'This invitation has expired, was replaced or used, or no longer matches the business contact. Return to the listing to verify ownership or contact hola@pana.social.',
  status: 410,
});
const unavailable = (): InvitationFailure => ({
  success: false,
  code: 'listing_unavailable',
  error: 'That public business listing is no longer available.',
  status: 404,
});
const claimed = (): InvitationFailure => ({
  success: false,
  code: 'already_claimed',
  error:
    'This business is already managed by another account. Use an authorized account or contact hola@pana.social.',
  status: 409,
});

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function readStoredInvitation(value: string): StoredInvitation {
  const record: unknown = JSON.parse(value);
  if (
    !record ||
    typeof record !== 'object' ||
    !('tokenHash' in record) ||
    !isListingInvitationToken(record.tokenHash) ||
    !('contactHash' in record) ||
    !isListingInvitationToken(record.contactHash) ||
    !('pendingOwnerHash' in record) ||
    !isListingInvitationToken(record.pendingOwnerHash) ||
    !('issuedBy' in record) ||
    typeof record.issuedBy !== 'string'
  ) {
    throw new Error('Invalid stored listing invitation.');
  }
  return {
    tokenHash: record.tokenHash,
    contactHash: record.contactHash,
    pendingOwnerHash: record.pendingOwnerHash,
    issuedBy: record.issuedBy,
  };
}

async function eligible(
  profile: Profile | undefined,
  reader: Reader = db
): Promise<boolean> {
  return Boolean(
    profile &&
    profile.userId === null &&
    (profile.status as { source?: string } | null)?.source ===
      BUSINESS_INTAKE_SOURCE &&
    (profile.active === true || (await isReviewPausedListing(profile, reader)))
  );
}

async function hasOwner(profileId: string, reader: Reader): Promise<boolean> {
  const [owner] = await reader
    .select({ id: profileOwners.id })
    .from(profileOwners)
    .where(eq(profileOwners.profileId, profileId))
    .limit(1);
  return Boolean(owner);
}

async function proofMatches(
  profile: Profile,
  token: string,
  row: typeof verification.$inferSelect | undefined
): Promise<boolean> {
  if (!row || row.expiresAt.getTime() <= Date.now()) return false;
  const stored = readStoredInvitation(row.value);
  return (
    stored.tokenHash === (await digest(token)) &&
    stored.contactHash === (await digest(profile.email.trim().toLowerCase())) &&
    stored.pendingOwnerHash ===
      (await digest(profile.pendingOwnerEmail?.trim().toLowerCase() ?? ''))
  );
}

/**
 * Operator-only caller: the admin route authorizes before entering this helper.
 * It chooses the recipient from the locked listing, never from request input.
 */
export async function issueListingInvitation(
  profileId: string,
  operatorId: string
) {
  return db.transaction((tx) =>
    issueListingInvitationInTransaction(tx, profileId, operatorId)
  );
}

export async function issueListingInvitationInTransaction(
  tx: ProfileOwnershipTransaction,
  profileId: string,
  operatorId: string
) {
  const [profile] = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .for('update');
  if (!(await eligible(profile, tx))) return unavailable();
  if (await hasOwner(profileId, tx)) return claimed();
  if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(profile.email.trim())) {
    return {
      success: false as const,
      code: 'contact_unavailable' as const,
      error:
        'This listing needs a valid business contact before an invitation can be issued.',
      status: 400 as const,
    };
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + LISTING_INVITATION_DAYS * 24 * 60 * 60 * 1000
  );
  const record: StoredInvitation = {
    tokenHash: await digest(token),
    contactHash: await digest(profile.email.trim().toLowerCase()),
    pendingOwnerHash: await digest(
      profile.pendingOwnerEmail?.trim().toLowerCase() ?? ''
    ),
    issuedBy: operatorId,
  };
  const identifier = listingInvitationIdentifier(profileId);
  await tx.delete(verification).where(eq(verification.identifier, identifier));
  await tx.insert(verification).values({
    identifier,
    value: JSON.stringify(record),
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
  return {
    success: true as const,
    profileId,
    recipient: profile.email.trim(),
    invitationPath: `${listingInvitationPath(profileId)}#token=${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function revokeListingInvitation(
  profileId: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .for('update');
    if (!profile) return false;
    await tx
      .delete(verification)
      .where(
        eq(verification.identifier, listingInvitationIdentifier(profileId))
      );
    return true;
  });
}

/** Read-only, including expiry and current contact/ownership checks. */
export async function inspectListingInvitation(
  profileId: string,
  token: string | null,
  userId?: string
): Promise<ListingInvitationState | InvitationFailure> {
  if (userId && (await getEditableProfile(userId, profileId))) {
    return { profileId, state: 'owned', expiresAt: null };
  }
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId));
  if (!(await eligible(profile))) return unavailable();
  if (await hasOwner(profileId, db)) return claimed();
  if (!isListingInvitationToken(token)) return invalid();
  const [row] = await db
    .select()
    .from(verification)
    .where(eq(verification.identifier, listingInvitationIdentifier(profileId)))
    .limit(1);
  if (!(await proofMatches(profile, token, row))) return invalid();
  return {
    profileId,
    state: 'available',
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** The listing lock always precedes the token lock, including issuance/revocation. */
export async function acceptListingInvitation(
  profileId: string,
  token: string,
  userId: string
) {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .for('update');
    if (!(await eligible(profile, tx))) return unavailable();
    if (await hasOwner(profileId, tx)) return claimed();
    if (!isListingInvitationToken(token)) return invalid();
    const [row] = await tx
      .select()
      .from(verification)
      .where(
        eq(verification.identifier, listingInvitationIdentifier(profileId))
      )
      .limit(1)
      .for('update');
    if (!(await proofMatches(profile, token, row))) return invalid();
    const result = await claimUnownedProfileInTransaction(
      tx,
      profileId,
      userId
    );
    if (result.outcome !== 'accepted') {
      return result.outcome === 'already-claimed' ? claimed() : unavailable();
    }
    // The shared claim helper deletes outstanding invitations in this same transaction.
    return {
      success: true as const,
      profileId,
      name: result.name,
      screenname: result.screenname,
    };
  });
}
