import { db } from '@/lib/db';
import { profileOwners, profiles } from '@/lib/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { BUSINESS_INTAKE_SOURCE, claimUnownedProfile } from './profile-owners';
import { maskEmail } from './listing-claim';

/**
 * Listings that *say* a given person should run them, pending their answer.
 *
 * The public intake form collects the applicant's account address separately
 * from an optional business inbox. Older forms made this account email optional.
 * A submitter can manage the listing they created without a claim email to a
 * shared shop inbox. There is no
 * account to attach it to at that moment — intake is unauthenticated by design
 * — so the address is parked on profiles.pending_owner_email.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS AN INVITATION AND NOT AN AUTOMATIC GRANT
 * ---------------------------------------------------------------------------
 * pending_owner_email is written by a PUBLIC, UNAUTHENTICATED form, which
 * means it is attacker-controlled. Redeeming it automatically at sign-in would
 * mean: submit a listing naming victim@example.com, wait for that person to
 * sign in next week for reasons of their own, and they silently become owner
 * of record for a business they have never heard of. Admin review still gates
 * publication, but a plausible-looking listing that gets approved leaves a
 * stranger holding it.
 *
 * That is precisely the hole notBusinessListing already closes in
 * claimProfileForUser (lib/server/profile-owners.ts). profiles.email is
 * attacker-supplied through the same form, and excluding intake rows from
 * implicit auto-claim is what defuses it: the auto-absorb path is safe only
 * because what remains is admin-imported and legacy rows that no anonymous
 * person can write. Redeeming a second attacker-writable column at sign-in
 * would reopen the same hole through a different door.
 *
 * So nothing here is granted implicitly. The member is asked, by name, whether
 * a listing is theirs, and ownership moves only on an affirmative click. That
 * also reads better in the honest case: an owner handed a listing with no
 * explanation is confused; one asked "is this yours?" is oriented.
 *
 * What the answer proves, and what it does not:
 *   - Confirming proves control of the personal inbox — the same proof the
 *     explicit claim flow uses, pointed at a different address.
 *   - It proves NOTHING about whether the business is theirs. Nothing here
 *     publishes: intake lands listings active = false and the existing admin
 *     approve/decline gate is untouched. Owning an unpublished listing is
 *     harmless, and it is what gives the submitter an "under review" view
 *     instead of silence.
 */
export interface PendingListingInvitation {
  profileId: string;
  name: string;
  /** The business address on the listing, masked — enough to recognise it. */
  businessEmail: string;
  active: boolean;
}

/**
 * Open invitations for this address.
 *
 * Already-claimed listings are excluded rather than offered and then refused:
 * an invitation that can only fail is worse than no invitation. Mirrors the
 * unclaimed test in listings/claim/verify, which re-checks at redemption for
 * the same reason.
 */
export async function listPendingInvitations(
  email: string | null | undefined
): Promise<PendingListingInvitation[]> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return [];

  const rows = await db
    .select({
      profileId: profiles.id,
      name: profiles.name,
      email: profiles.email,
      active: profiles.active,
    })
    .from(profiles)
    .leftJoin(profileOwners, eq(profileOwners.profileId, profiles.id))
    .where(
      and(
        eq(profiles.pendingOwnerEmail, normalized),
        // Only ever an intake listing. One route writes this column today, but
        // the guard is stated rather than assumed: if anything else learns to
        // set it, it must not become a quieter route to a personal profile.
        sql`(${profiles.status}->>'source' = ${BUSINESS_INTAKE_SOURCE})`,
        // A row that has acquired an identity owner is somebody's personal
        // profile now, whatever it started as, and is not ours to offer.
        isNull(profiles.userId),
        // Unclaimed only.
        isNull(profileOwners.id)
      )
    );

  return rows.map((row) => ({
    profileId: row.profileId,
    name: row.name,
    businessEmail: maskEmail(row.email),
    active: row.active,
  }));
}

export type InvitationOutcome =
  | 'accepted'
  | 'declined'
  /** No open invitation for this address and profile — unknown, or answered. */
  | 'not-found'
  /** Someone else got there first. */
  | 'already-claimed';

/**
 * Accept: grant ownership, then close the invitation.
 *
 * The authorisation is the match between the signed-in account's email and
 * pending_owner_email — re-checked here rather than trusted from whatever
 * listed the invitation, so a stale or guessed profileId cannot be confirmed
 * by someone it was never offered to.
 *
 * Ownership is a profile_owners row and profiles.userId is deliberately left
 * NULL, exactly as listings/claim/verify does it: claiming a business must
 * never overwrite the claimant's own identity profile, and leaving userId null
 * is what lets the same human run a second listing later.
 */
export async function acceptPendingInvitation(
  userId: string,
  email: string | null | undefined,
  profileId: string
): Promise<InvitationOutcome> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return 'not-found';

  const result = await claimUnownedProfile(profileId, userId, normalized);
  return result.outcome;
}

/**
 * Decline: close the invitation without granting anything.
 *
 * This is the half that makes the feature honest. Without it a wrong or
 * malicious invitation follows someone around their account forever, and the
 * only way to be rid of it would be to accept a business that is not theirs.
 *
 * Only the invitation is withdrawn. The listing itself is untouched and stays
 * in review — declining says "not mine", not "delete this business".
 */
export async function declinePendingInvitation(
  email: string | null | undefined,
  profileId: string
): Promise<InvitationOutcome> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return 'not-found';

  const result = await db
    .update(profiles)
    .set({ pendingOwnerEmail: null })
    .where(
      and(
        eq(profiles.id, profileId),
        eq(profiles.pendingOwnerEmail, normalized),
        sql`(${profiles.status}->>'source' = ${BUSINESS_INTAKE_SOURCE})`
      )
    )
    .returning({ id: profiles.id });

  return result.length > 0 ? 'declined' : 'not-found';
}
