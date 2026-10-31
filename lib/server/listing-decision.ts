import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { sendListingNotification } from './listing-notifications';
import { profiles } from '@/lib/schema';
import { DIRECTORY_ACCOUNT_TYPES } from '@/lib/accounts';
import { listingPublicPath } from '@/lib/listing-url';

/**
 * The one place a directory listing is approved or declined.
 *
 * ## Why this is a library and not a route
 *
 * There are two doors into this decision and there always will be. Staff
 * approve listings by clicking a link in an email — routinely on a phone that
 * is not signed in — which is why `/api/admin/profile/action` authenticates
 * with a capability key instead of a session and why `app/admin/layout.tsx`
 * cannot carry a server-side gate. The admin queue is the second door, and it
 * authenticates with a session.
 *
 * Both doors have to perform the *same* write: flip `active`, stamp `status`,
 * and mail the business owner exactly once. Writing that twice would mean two
 * implementations of "publish a business to the public directory" drifting
 * apart, and the way you would find out is a business being told it was
 * approved by one path and still not appearing in the directory.
 *
 * So the routes keep their own authentication — which is genuinely different
 * between them — and share this.
 *
 * ## `expect`
 *
 * The capability link passes `'any'`, which is the behaviour it has always
 * had: the link in a decline email still works after an approve, because
 * reversing a decision is a real thing staff do and the email is sometimes the
 * only artefact they still have.
 *
 * The admin queue passes `'pending'`. The queue only ever renders undecided
 * rows, so a decision arriving for a decided row means the page was stale —
 * someone else got there first, or a button was double-clicked. Refusing it
 * is what stops a second click from re-stamping a decision and, worse, from
 * quietly overturning a colleague's.
 *
 * ## The email is sent once, by first stamp
 *
 * `profile.published` fires only when `status.approved` was previously unset,
 * and the decline mail likewise. This is the pre-existing rule and it is load
 * bearing: without it, a reviewer re-opening an old approval email and
 * clicking through would mail the business a second "you're live!" months
 * later.
 */

export type ListingDecision = 'approve' | 'decline';

/**
 * The intake record, plus whatever the decision path stamps onto it.
 *
 * Deliberately open-ended. `status` also carries `submitted`, `source`,
 * `accountType`, `locallyBased` and `agreedToTermsAt`, none of which this
 * module reads but all of which it must preserve — the update below rewrites
 * the column wholesale, so anything not spread forward is destroyed.
 */
export interface ListingStatus {
  access?: string;
  approved?: string;
  declined?: string;
  /** Email of the staff member who decided. Absent on rows decided by link. */
  decidedBy?: string;
  /** Free text captured on a decline. Never mailed to the business. */
  decidedReason?: string;
  [key: string]: unknown;
}

export type DecisionOutcome =
  | {
      ok: true;
      name: string;
      email: string;
      mailed: boolean;
      mailFailed: boolean;
      publicPath: string | null;
      screenname: string | null;
    }
  | { ok: false; reason: 'not-found' | 'already-decided' };

export async function decideListing({
  profileId,
  decision,
  decidedBy,
  reason,
  expect = 'any',
}: {
  profileId: string;
  decision: ListingDecision;
  /** Staff email. Omitted by the capability link, which has no identity. */
  decidedBy?: string;
  /** Only recorded on declines. */
  reason?: string;
  expect?: 'any' | 'pending';
}): Promise<DecisionOutcome> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    with: { user: { columns: { screenname: true, accountType: true } } },
  });

  if (!profile) return { ok: false, reason: 'not-found' };

  const status = (profile.status ?? {}) as ListingStatus;
  const alreadyDecided = Boolean(status.approved || status.declined);

  if (expect === 'pending' && alreadyDecided) {
    return { ok: false, reason: 'already-decided' };
  }

  const stampedAt = new Date().toISOString();
  const firstTime =
    decision === 'approve' ? !status.approved : !status.declined;

  const nextStatus: ListingStatus = {
    ...status,
    [decision === 'approve' ? 'approved' : 'declined']: stampedAt,
  };

  // Recorded only when we know it. The capability link cannot say who clicked
  // it, and inventing a value — "email link", a shared address — would make an
  // unattributed decision look attributed, which is worse than a blank.
  if (decidedBy) nextStatus.decidedBy = decidedBy;
  if (decision === 'decline' && reason) nextStatus.decidedReason = reason;

  await db
    .update(profiles)
    .set({ active: decision === 'approve', status: nextStatus })
    .where(eq(profiles.id, profileId));
  const screenname = profile.screenname ?? profile.user?.screenname;

  let mailed = false;
  let mailFailed = false;
  const publicPath =
    decision === 'approve' &&
    (screenname ||
      profile.userId === null ||
      DIRECTORY_ACCOUNT_TYPES.some(
        (type) => type === profile.user?.accountType
      ))
      ? listingPublicPath({ id: profile.id, screenname })
      : null;

  if (firstTime) {
    try {
      await sendListingNotification(
        profile,
        decision === 'approve' ? 'profile.published' : 'profile.not_published',
        {
          name: profile.name,
          ...(publicPath
            ? {
                profileUrl: new URL(
                  publicPath,
                  process.env.NEXT_PUBLIC_HOST_URL || 'https://panamia.club'
                ).toString(),
              }
            : {}),
        }
      );
      mailed = true;
    } catch (error) {
      mailFailed = true;
      console.error('Listing decision saved but notification email failed', {
        profileId,
        decision,
        error,
      });
    }
  }

  return {
    ok: true,
    name: profile.name,
    email: profile.email,
    mailed,
    mailFailed,
    publicPath,
    screenname: screenname ?? null,
  };
}
