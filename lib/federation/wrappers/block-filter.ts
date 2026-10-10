/**
 * Block and mute — read side.
 *
 * Split from ./block so the graph stays acyclic. block.ts performs mutations
 * and needs deleteFollow from ./follow, while ./follow and the timeline
 * queries need to *read* blocks to filter their results. Putting the reads
 * here means nothing has to import a module that imports it back.
 *
 * Everything in this file depends only on db, schema and drizzle.
 *
 * @see docs/SOCIAL-GRAPH.md section B
 */

import { db } from '@/lib/db';
import { socialBlocks } from '@/lib/schema';
import { and, eq, or, inArray } from 'drizzle-orm';

/**
 * Every actor the viewer should not see, for either reason.
 *
 * One flat list covering all three cases:
 *
 *   - actors the viewer blocked      (they chose not to see them)
 *   - actors who blocked the viewer  (symmetric: a block the target can see
 *                                     through is not a block)
 *   - actors the viewer muted        (volume)
 *
 * Returns a plain string[] rather than a SQL fragment on purpose. The surfaces
 * that need it are a mix of Drizzle queries, raw SQL and in-memory filters, and
 * an array composes with all of them. The lists are small — a person's block
 * list is tens of rows, not thousands.
 */
export async function getHiddenActorIds(
  viewerActorId: string
): Promise<string[]> {
  const rows = await db
    .select({
      actorId: socialBlocks.actorId,
      targetActorId: socialBlocks.targetActorId,
    })
    .from(socialBlocks)
    .where(
      or(
        eq(socialBlocks.actorId, viewerActorId),
        // Mutes are one-directional, so only blocks count in this direction.
        // Being muted must never change what you can see.
        and(
          eq(socialBlocks.targetActorId, viewerActorId),
          eq(socialBlocks.kind, 'block')
        )
      )
    );

  const hidden = new Set<string>();
  for (const row of rows) {
    hidden.add(row.actorId === viewerActorId ? row.targetActorId : row.actorId);
  }

  return [...hidden];
}

/**
 * Whether a block exists in either direction between two actors.
 *
 * Mutes are excluded. A mute must never change what the muted actor is able to
 * do — if it did it would be detectable, and a detectable mute is a block with
 * worse manners.
 *
 * Use this to gate actions (follow, reply, DM). Use getHiddenActorIds to
 * filter lists.
 */
export async function isBlockedEitherWay(
  actorId: string,
  otherActorId: string
): Promise<boolean> {
  if (actorId === otherActorId) return false;

  const row = await db.query.socialBlocks.findFirst({
    where: and(
      eq(socialBlocks.kind, 'block'),
      or(
        and(
          eq(socialBlocks.actorId, actorId),
          eq(socialBlocks.targetActorId, otherActorId)
        ),
        and(
          eq(socialBlocks.actorId, otherActorId),
          eq(socialBlocks.targetActorId, actorId)
        )
      )
    ),
  });

  return Boolean(row);
}

/**
 * Which of a set of actors are blocked from one actor, in either direction.
 *
 * The batch twin of isBlockedEitherWay, and it must keep that function's
 * semantics rather than filterHiddenActorIds': mutes are excluded. The two
 * look interchangeable and are not. A mute is about what the muter sees, so
 * folding mutes in here would mean an author who muted somebody silently
 * stopped *that person's* notifications -- a one-directional preference
 * reaching across and editing someone else's bell.
 *
 * Exists for fan-out. Notifying a whole group one createNotification at a
 * time costs a block query per member; this answers for all of them at once,
 * which is what keeps a post to a large group from turning into hundreds of
 * round trips.
 */
export async function filterBlockedActorIds(
  actorId: string,
  candidateActorIds: string[]
): Promise<Set<string>> {
  const others = candidateActorIds.filter((id) => id !== actorId);
  if (others.length === 0) return new Set();

  const rows = await db
    .select({
      actorId: socialBlocks.actorId,
      targetActorId: socialBlocks.targetActorId,
    })
    .from(socialBlocks)
    .where(
      and(
        eq(socialBlocks.kind, 'block'),
        or(
          and(
            eq(socialBlocks.actorId, actorId),
            inArray(socialBlocks.targetActorId, others)
          ),
          and(
            eq(socialBlocks.targetActorId, actorId),
            inArray(socialBlocks.actorId, others)
          )
        )
      )
    );

  const blocked = new Set<string>();
  for (const row of rows) {
    blocked.add(row.actorId === actorId ? row.targetActorId : row.actorId);
  }

  return blocked;
}

/**
 * What the viewer has done to one specific actor, for the profile menu.
 *
 * Only the viewer's own outgoing rows. Whether the other person blocked *you*
 * is deliberately absent: the menu would have to render differently to show
 * it, and that difference is exactly the signal a block is supposed to
 * withhold. A blocked viewer sees the ordinary menu.
 */
export async function getViewerBlockState(
  viewerActorId: string | null,
  targetActorId: string
): Promise<{ isBlocked: boolean; isMuted: boolean }> {
  if (!viewerActorId || viewerActorId === targetActorId) {
    return { isBlocked: false, isMuted: false };
  }

  const rows = await db
    .select({ kind: socialBlocks.kind })
    .from(socialBlocks)
    .where(
      and(
        eq(socialBlocks.actorId, viewerActorId),
        eq(socialBlocks.targetActorId, targetActorId)
      )
    );

  return {
    isBlocked: rows.some((r) => r.kind === 'block'),
    isMuted: rows.some((r) => r.kind === 'mute'),
  };
}

/**
 * Which of a set of actors the viewer has blocked or muted.
 *
 * For surfaces that have already loaded a page of actors and need to drop or
 * annotate them without a round trip per row.
 */
export async function filterHiddenActorIds(
  viewerActorId: string,
  candidateActorIds: string[]
): Promise<Set<string>> {
  if (candidateActorIds.length === 0) return new Set();

  const rows = await db
    .select({
      actorId: socialBlocks.actorId,
      targetActorId: socialBlocks.targetActorId,
    })
    .from(socialBlocks)
    .where(
      or(
        and(
          eq(socialBlocks.actorId, viewerActorId),
          inArray(socialBlocks.targetActorId, candidateActorIds)
        ),
        and(
          eq(socialBlocks.kind, 'block'),
          eq(socialBlocks.targetActorId, viewerActorId),
          inArray(socialBlocks.actorId, candidateActorIds)
        )
      )
    );

  const hidden = new Set<string>();
  for (const row of rows) {
    hidden.add(row.actorId === viewerActorId ? row.targetActorId : row.actorId);
  }

  return hidden;
}
