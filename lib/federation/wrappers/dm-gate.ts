/**
 * Who may open a direct-message thread.
 *
 * The gate runs on thread *creation*, never on every message. Replying inside
 * a thread the recipient already accepted must not be gated, or the recipient
 * accepting and then being unable to hear back is the bug. An existing,
 * accepted thread is itself the consent. See docs/SOCIAL-GRAPH.md section C1.
 *
 * Deliberately named away from `GateResult` in lib/federation/gates.ts. That
 * type answers a question about *membership eligibility* — may this account
 * post, follow, exist as a social actor — and it is already carried on
 * CreateStatusResult. This one answers a question about a *relationship*
 * between two specific actors. Overloading one name for both would make the
 * 400 response from the statuses route ambiguous about which check refused.
 */

import { db } from '@/lib/db';
import { socialActors, socialDmRequests, socialFollows } from '@/lib/schema';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { isBlockedEitherWay, filterHiddenActorIds } from './block-filter';
import { socialConfig } from '../index';
import { STATUS_TYPE_PANAS } from '@/lib/utils/getVisibility';

/**
 * What the gate decided for one recipient.
 *
 * - `allow`  — deliver and notify as normal.
 * - `hold`   — deliver into the recipient's Requests folder and, the
 *              load-bearing part, do NOT notify. The sender is not told,
 *              because "your message was filed as a request" is a disclosure
 *              about the recipient's settings.
 * - `refuse` — do not deliver at all.
 */
export type DirectThreadDecision = 'allow' | 'hold' | 'refuse';

export interface DirectThreadGateResult {
  recipientActorId: string;
  decision: DirectThreadDecision;
}

/**
 * The single refusal string, used for every refusing reason.
 *
 * Blocked, `nobody`, and `panas`-without-a-mutual all produce this exact text
 * on purpose. Distinct messages would let a blocked sender tell a block apart
 * from a closed inbox by contrast — if the message says "only accepts messages
 * from Panas" and the sender can see on the profile that they are a Pana, they
 * have learned they are blocked. Same reasoning as createFollow's deliberately
 * symmetric "Cannot follow this account".
 *
 * Defined in lib/dm-refusal.ts and re-exported here so this module stays the
 * name callers reach for, while the chat composer — a client component that
 * must not import `lib/db` — can read the same constant rather than a second
 * copy of the wording that someone will eventually make friendlier.
 */
export { DIRECT_THREAD_REFUSED } from '@/lib/dm-refusal';

/**
 * Decide, for one sender and up to eight recipients, who may be written to.
 *
 * Batched rather than looped because the follow lookup is the expensive part
 * and it is the same shape for every recipient. Block checks stay per-pair:
 * `isBlockedEitherWay` is the documented gate for exactly this and
 * re-implementing block semantics inline to save a query is how the two drift
 * apart.
 */
export async function evaluateDirectThreads(
  senderActorId: string,
  recipientActorIds: string[]
): Promise<DirectThreadGateResult[]> {
  if (recipientActorIds.length === 0) return [];

  const recipients = await db
    .select({
      id: socialActors.id,
      domain: socialActors.domain,
      dmPolicy: socialActors.dmPolicy,
    })
    .from(socialActors)
    .where(inArray(socialActors.id, recipientActorIds));

  const byId = new Map(recipients.map((r) => [r.id, r]));

  // Mutual follows, both directions, in one query. "Pana" means accepted in
  // both directions — the same definition getFollowRelationship uses, which is
  // the canonical one.
  const followRows = await db
    .select({
      actorId: socialFollows.actorId,
      targetActorId: socialFollows.targetActorId,
    })
    .from(socialFollows)
    .where(
      and(
        eq(socialFollows.status, 'accepted'),
        or(
          and(
            eq(socialFollows.actorId, senderActorId),
            inArray(socialFollows.targetActorId, recipientActorIds)
          ),
          and(
            eq(socialFollows.targetActorId, senderActorId),
            inArray(socialFollows.actorId, recipientActorIds)
          )
        )
      )
    );

  const senderFollows = new Set<string>();
  const followsSender = new Set<string>();
  for (const row of followRows) {
    if (row.actorId === senderActorId) senderFollows.add(row.targetActorId);
    if (row.targetActorId === senderActorId) followsSender.add(row.actorId);
  }

  // Consent already on record, in the direction that matters: the recipient
  // accepted this sender.
  const acceptedPairs = await db
    .select({ recipientActorId: socialDmRequests.recipientActorId })
    .from(socialDmRequests)
    .where(
      and(
        eq(socialDmRequests.senderActorId, senderActorId),
        inArray(socialDmRequests.recipientActorId, recipientActorIds),
        eq(socialDmRequests.state, 'accepted')
      )
    );
  const acceptedBy = new Set(acceptedPairs.map((r) => r.recipientActorId));

  const results: DirectThreadGateResult[] = [];

  for (const recipientActorId of recipientActorIds) {
    const recipient = byId.get(recipientActorId);

    // A recipient that does not exist is not this gate's error to report —
    // createStatus already fails the whole send on unknown recipients, and
    // duplicating that here would produce two different messages for one
    // cause.
    if (!recipient) {
      results.push({ recipientActorId, decision: 'refuse' });
      continue;
    }

    // Writing to yourself is a scratchpad, not a first contact.
    if (recipientActorId === senderActorId) {
      results.push({ recipientActorId, decision: 'allow' });
      continue;
    }

    if (await isBlockedEitherWay(senderActorId, recipientActorId)) {
      results.push({ recipientActorId, decision: 'refuse' });
      continue;
    }

    // Already accepted: the thread exists and is its own consent. Checked
    // before the policy so that tightening a policy to `nobody` cannot cut off
    // correspondents already accepted, which is what "existing ones continue"
    // means in the C1 table.
    if (acceptedBy.has(recipientActorId)) {
      results.push({ recipientActorId, decision: 'allow' });
      continue;
    }

    // Remote recipients are not gated. ActivityPub carries no DM-policy field,
    // so the local default on a cached remote actor row is a value we invented
    // and must not enforce as though the remote server had chosen it.
    if (recipient.domain !== socialConfig.domain) {
      results.push({ recipientActorId, decision: 'allow' });
      continue;
    }

    const isPana =
      senderFollows.has(recipientActorId) &&
      followsSender.has(recipientActorId);

    switch (recipient.dmPolicy) {
      case 'nobody':
        results.push({ recipientActorId, decision: 'refuse' });
        break;
      case 'panas':
        results.push({
          recipientActorId,
          decision: isPana ? 'allow' : 'refuse',
        });
        break;
      case 'everyone':
      default:
        results.push({
          recipientActorId,
          decision: isPana ? 'allow' : 'hold',
        });
        break;
    }
  }

  return results;
}

/**
 * The Requests folder: who is waiting for an answer.
 *
 * Returns the senders only. Their messages are fetched separately by
 * `getHeldRequestStatuses` and stitched together by the route, because the two
 * do not correspond one-to-one — a direct status expires while the request row
 * persists, so a sender can legitimately still be waiting with nothing left to
 * read.
 *
 * Senders the viewer has blocked or muted are dropped here rather than left to
 * the message query. The block already strips their statuses, so without this
 * the folder would list a name with a permanently empty thread and no way to
 * clear it.
 */
export async function listDirectThreadRequests(
  recipientActorId: string
): Promise<{ senderActorId: string; createdAt: Date }[]> {
  const rows = await db
    .select({
      senderActorId: socialDmRequests.senderActorId,
      createdAt: socialDmRequests.createdAt,
    })
    .from(socialDmRequests)
    .where(
      and(
        eq(socialDmRequests.recipientActorId, recipientActorId),
        eq(socialDmRequests.state, 'pending')
      )
    );

  if (rows.length === 0) return rows;

  const hidden = await filterHiddenActorIds(
    recipientActorId,
    rows.map((r) => r.senderActorId)
  );

  return rows.filter((r) => !hidden.has(r.senderActorId));
}

/**
 * Accept a request, which is what actually creates the thread.
 *
 * Flips the existing row rather than deleting and re-inserting, so the
 * original `createdAt` survives as a record of when first contact was made.
 */
export async function acceptDirectThreadRequest(
  recipientActorId: string,
  senderActorId: string
): Promise<boolean> {
  const updated = await db
    .update(socialDmRequests)
    .set({ state: 'accepted', acceptedAt: new Date() })
    .where(
      and(
        eq(socialDmRequests.recipientActorId, recipientActorId),
        eq(socialDmRequests.senderActorId, senderActorId),
        eq(socialDmRequests.state, 'pending')
      )
    )
    .returning({ id: socialDmRequests.id });

  return updated.length > 0;
}

/**
 * Delete a request without replying.
 *
 * Deliberately removes the row rather than recording a refusal. "Not now" must
 * leave the sender able to write again later; the permanent answer is block,
 * which social_blocks already enforces and which the Requests UI offers as a
 * separate action. See the socialDmRequestState comment for why there is no
 * 'declined' value to write here.
 *
 * Dropping the row is not enough on its own. `notHeldRequest` hides a message
 * only while a *pending* row exists, so deleting the row in isolation stops
 * the message being held and it surfaces in the ordinary inbox — the button
 * labelled "delete without replying" would deliver the thing it refused. The
 * recipient's address is therefore stripped from those statuses in the same
 * transaction.
 *
 * Strips the address rather than deleting the status because a direct message
 * can carry up to eight recipients, and deleting the row would retract it from
 * the other seven. The sender keeps their copy either way: the Sent folder
 * reads by `actorId` and never consults the recipient list, which is also what
 * keeps this invisible to them.
 */
export async function deleteDirectThreadRequest(
  recipientActorId: string,
  senderActorId: string
): Promise<boolean> {
  const recipient = await db.query.socialActors.findFirst({
    where: eq(socialActors.id, recipientActorId),
    columns: { uri: true },
  });

  if (!recipient) return false;

  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(socialDmRequests)
      .where(
        and(
          eq(socialDmRequests.recipientActorId, recipientActorId),
          eq(socialDmRequests.senderActorId, senderActorId),
          eq(socialDmRequests.state, 'pending')
        )
      )
      .returning({ id: socialDmRequests.id });

    if (deleted.length === 0) return false;

    // Panas notes also address individual actors, but declining mail must
    // never change a social post's audience.
    await tx.execute(sql`
      UPDATE social_statuses
      SET recipient_to = recipient_to - ${recipient.uri}
      WHERE actor_id = ${senderActorId}
        AND recipient_to @> to_jsonb(${recipient.uri}::text)
        AND type IS DISTINCT FROM ${STATUS_TYPE_PANAS}
    `);

    return true;
  });
}

/**
 * Record that a sender has asked to open a thread.
 *
 * Idempotent: a second held message from the same sender must not create a
 * second request row, or the Requests folder fills with duplicates of one
 * person. The row stays `pending` until the recipient accepts.
 */
export async function recordDirectThreadRequests(
  senderActorId: string,
  recipientActorIds: string[]
): Promise<void> {
  if (recipientActorIds.length === 0) return;

  await db
    .insert(socialDmRequests)
    .values(
      recipientActorIds.map((recipientActorId) => ({
        recipientActorId,
        senderActorId,
      }))
    )
    .onConflictDoNothing();
}
