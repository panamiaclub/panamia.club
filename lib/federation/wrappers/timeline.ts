/**
 * Timeline Management
 *
 * High-level functions for querying timelines.
 *
 * IMPORTANT: Direct messages are EXCLUDED from Home and Public timelines.
 *
 * @see docs/SOCIAL-ROADMAP.md
 */

import { db } from '@/lib/db';
import {
  socialStatuses,
  socialActors,
  socialLikes,
  socialGroupMembers,
  PUBLIC_ACTOR_COLUMNS,
  STATUS_TYPE_STORY,
} from '@/lib/schema';
import type {
  SocialStatus,
  PublicSocialActor,
  SocialGroupVisibility,
} from '@/lib/schema';
import { and, eq, sql, or, asc, inArray } from 'drizzle-orm';
import { countyShortLabel } from '@/lib/county';
import { socialConfig } from '../index';
import {
  getViewerGroupIds,
  visibleGroupStatuses,
  personalStatusesOnly,
} from './group-visibility';
import { getHiddenActorIds } from './block-filter';
import { listMutualFollowIds } from './follow';
import { STATUS_TYPE_PANAS } from '@/lib/utils/getVisibility';
import {
  PUBLIC,
  jsonbArrayContains,
  notExpired,
  notPanasStatus,
  readableStatus,
  visibleTo,
} from './visibility';

/**
 * Drizzle SQL condition to keep stories out of anything that means "posts".
 *
 * Stories live in this table too (see STATUS_TYPE_STORY) because they needed
 * expiry and attachments, which were already solved here. The cost of that
 * reuse is this guard, and it has to be applied deliberately rather than
 * inherited: the home and public timelines happen to be safe because a story
 * is addressed followers-only and those queries demand the Public URI, but
 * `getActorPosts` permits readable personal and group posts. Without this,
 * a story appears on the profile's Posts tab as an ordinary post the moment
 * it is created, and silently vanishes a day later.
 *
 * Applied everywhere regardless, including where the addressing already
 * covers it. Relying on "this query happens to require Public" means the next
 * person to relax an addressing filter also has to know they are changing
 * story visibility, and they will not.
 */
function excludeStories() {
  return sql`${socialStatuses.type} <> ${STATUS_TYPE_STORY}`;
}

/**
 * Drizzle SQL condition that removes blocked and muted actors from a feed.
 *
 * Applied at the top level of a query rather than inside any one arm, because
 * every arm needs it for a different reason:
 *
 *  - the follow arm is mostly handled already, since a block severs follows —
 *    but a MUTE does not, and a muted account you still follow is exactly the
 *    case this exists for;
 *  - the group arm has no follow involved at all, so a blocked person posting
 *    into a group you share would otherwise walk straight back into your feed.
 *    That is the failure people actually report, and it is the one that makes
 *    a block feel broken;
 *  - the public timeline has no relationship involved whatsoever.
 *
 * Takes the ids rather than the viewer so the caller fetches once per request
 * instead of once per arm.
 */
function notHidden(hiddenActorIds: string[]) {
  if (hiddenActorIds.length === 0) return undefined;
  return sql`${socialStatuses.actorId} <> ALL(ARRAY[${sql.join(
    hiddenActorIds.map((id) => sql`${id}`),
    sql`, `
  )}]::text[])`;
}

/**
 * A direct message still waiting in the viewer's Requests folder.
 *
 * Written as the positive test because two surfaces need it in opposite
 * directions: the inbox excludes these, the Requests folder selects exactly
 * these. Defining `notHeldRequest` as the literal complement means the folder
 * cannot drift into showing something the inbox also shows, which would let
 * one message sit in both places.
 *
 * Suppressing the notification is only half of the Requests design. Without
 * this the held message still lands in the ordinary inbox, which means the
 * recipient reads it anyway and the folder prevents nothing — it just arrives
 * quietly. The message moves to the inbox the moment the request is accepted,
 * because the row flips to 'accepted' rather than being deleted.
 *
 * Identifies correspondence as "the viewer's own URI appears in recipientTo",
 * which is deliberately narrower than getVisibilityFromRecipients' notion of
 * 'direct'. Visibility is derived from the recipient arrays rather than stored
 * in a column, so there is nothing to compare against here; re-deriving the
 * full ladder in SQL would duplicate logic that is free to drift. The narrow
 * test is also the safer one — a pending request must never hide a sender's
 * public posts, and a public post never carries the viewer's URI in `to`.
 */
function heldRequest(viewerActorId: string, viewerUri: string) {
  return sql`(
    ${notPanasStatus()}
    AND
    ${jsonbArrayContains(socialStatuses.recipientTo, viewerUri)}
    AND EXISTS (
      SELECT 1 FROM social_dm_requests r
      WHERE r.recipient_actor_id = ${viewerActorId}
        AND r.sender_actor_id = ${socialStatuses.actorId}
        AND r.state = 'pending'
    )
  )`;
}

function notHeldRequest(viewerActorId: string, viewerUri: string) {
  return sql`NOT ${heldRequest(viewerActorId, viewerUri)}`;
}

export type PublicActorWithCounty = PublicSocialActor & {
  /**
   * Where this person is, for the badge beside their name. Null for a remote
   * actor (no local profile to read) and for a member who has not set an
   * address, and both mean the same thing to a caller: render nothing.
   */
  county: string | null;
};

/**
 * Which group a post came from, for the "posted in …" line above it.
 *
 * Deliberately not the whole group row. A timeline needs to name the group and
 * link to it, and nothing more; forwarding the row would put every column
 * added to social_groups later into a feed response nobody re-reviewed.
 */
export type StatusGroupContext = {
  id: string;
  handle: string;
  name: string | null;
  visibility: SocialGroupVisibility;
};

export type StatusWithActorAndLike = SocialStatus & {
  actor: PublicActorWithCounty;
  liked: boolean;
  /** Null for an ordinary personal post, which is most of them. */
  group: StatusGroupContext | null;
};

/**
 * The actor shape every timeline returns.
 *
 * Written once and shared because seven read paths in this file select an
 * actor, and a per-call-site spelling is how a field ends up present on the
 * home feed and missing on a permalink for the same post. The directory's
 * account-type gate had to be repaired in four places for that exact reason;
 * this keeps the next field from repeating it.
 */
const ACTOR_WITH = {
  columns: PUBLIC_ACTOR_COLUMNS,
  with: { profile: { columns: { counties: true } } },
} as const;

/**
 * Flatten the joined profile into the county the client actually renders.
 *
 * The nested profile row is dropped rather than forwarded: it was selected to
 * answer one question, and passing the whole thing outward would make every
 * column added to profiles later a silent addition to a public response.
 */
function publicActor(actor: {
  profile?: { counties: unknown } | null;
}): PublicActorWithCounty {
  const { profile, ...rest } = actor;
  return {
    ...(rest as unknown as PublicSocialActor),
    county: countyShortLabel(profile?.counties),
  };
}

/**
 * The group columns every read path selects, for the same reason ACTOR_WITH
 * exists: seven call sites, one spelling.
 */
const GROUP_WITH = {
  columns: { id: true, visibility: true },
  with: { actor: { columns: { username: true, name: true } } },
} as const;

type GroupRow = {
  id: string;
  visibility: SocialGroupVisibility;
  actor: { username: string; name: string | null } | null;
};

function groupContext(group?: GroupRow | null): StatusGroupContext | null {
  if (!group?.actor) return null;
  return {
    id: group.id,
    handle: group.actor.username,
    name: group.actor.name,
    visibility: group.visibility,
  };
}

/**
 * Flatten one queried row into the shape every timeline returns.
 *
 * Written once because the seven read paths below were each mapping their own
 * rows, and the mappers had already drifted — some read `likes.length > 0`
 * directly while others guarded it. A field added to the response in six of
 * seven places is a field that is mysteriously absent on the seventh.
 */
function toStatus(row: {
  actor: { profile?: { counties: unknown } | null };
  likes?: { id: string }[];
  group?: GroupRow | null;
}): StatusWithActorAndLike {
  const { likes, actor, group, ...rest } = row;
  return {
    ...(rest as unknown as SocialStatus),
    actor: publicActor(actor),
    liked: likes ? likes.length > 0 : false,
    group: groupContext(group),
  };
}

export type TimelineResult = {
  statuses: StatusWithActorAndLike[];
  nextCursor: string | null;
};

/**
 * Get home timeline: mutual Panas, own posts, and joined groups.
 *
 * DESIGN NOTE: This is a deliberate fan-out-on-READ implementation. We do
 * NOT maintain per-user `timeline_entries` rows that get written on every
 * post creation. That would mean 100+ INSERTs per post in a serverless
 * request handler, synchronous deletes on every unpost, and a write
 * amplification problem that PG + Hyperdrive is not the right tool for.
 *
 * If you're reading this and thinking "we should move to fan-out on write
 * now that we have Durable Objects" — don't. A per-user timeline DO would
 * still cold-start from storage and hit the DB on hibernation wake, so it
 * buys nothing over the query below while adding a stateful component.
 * Durable Objects are the right tool for outbound delivery fan-out and for
 * realtime push (see the DEFERRED comments in ./status.ts), NOT for
 * materializing the read path.
 */
export async function getHomeTimeline(
  actorId: string,
  cursor?: string,
  limit: number = 20
): Promise<TimelineResult> {
  const mutualActorIds = await listMutualFollowIds(actorId);
  const timelineActorIds = [...mutualActorIds, actorId];

  // Groups this person is actually in. Their posts reach the feed on
  // membership alone, with no follow and no public addressing involved.
  const memberGroupIds = await db
    .select({ groupId: socialGroupMembers.groupId })
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.actorId, actorId),
        eq(socialGroupMembers.status, 'active')
      )
    )
    .then((rows) => rows.map((r) => r.groupId));

  const hiddenActorIds = await getHiddenActorIds(actorId);

  const rows = await db.query.socialStatuses.findMany({
    /**
     * Two arms, not one filter with an extra clause.
     *
     * The personal arm includes public/unlisted posts and authorized Panas
     * notes. Group membership is a separate right, never inferred from a
     * friendship with the author.
     *
     * The group arm therefore carries no addressing requirement at all.
     * Membership is the authorization, which is why `memberGroupIds` is read
     * from `status = 'active'` rows and nowhere else.
     *
     * Group posts never use the Pana arm: being a mutual Pana of the author
     * must not substitute for joining the group.
     */
    where: (s, { and: andOp, inArray, isNotNull, isNull }) =>
      andOp(
        or(
          andOp(
            sql`${s.actorId} = ANY(ARRAY[${sql.join(
              timelineActorIds.map((id) => sql`${id}`),
              sql`, `
            )}]::text[])`,
            isNull(s.groupId),
            or(
              jsonbArrayContains(socialStatuses.recipientTo, PUBLIC),
              jsonbArrayContains(socialStatuses.recipientCc, PUBLIC),
              eq(socialStatuses.type, STATUS_TYPE_PANAS)
            ),
            visibleTo(actorId)
          ),
          memberGroupIds.length > 0
            ? inArray(s.groupId, memberGroupIds)
            : sql`false`
        ),
        isNotNull(s.published),
        isNull(s.inReplyToId),
        notExpired(),
        excludeStories(),
        notHidden(hiddenActorIds),
        cursor ? sql`${s.id} < ${cursor}` : undefined
      ),
    with: {
      actor: ACTOR_WITH,
      attachments: true,
      group: GROUP_WITH,
      likes: {
        where: eq(socialLikes.actorId, actorId),
        columns: { id: true },
      },
    },
    orderBy: (s, { desc }) => [desc(s.published), desc(s.id)],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { statuses: items.map(toStatus), nextCursor };
}

/**
 * Get posts by a specific actor.
 */
export async function getActorPosts(
  actorId: string,
  viewerActorId?: string,
  cursor?: string,
  limit: number = 20,
  includeReplies: boolean = false
): Promise<TimelineResult> {
  const viewerGroupIds = await getViewerGroupIds(viewerActorId);

  const rows = await db.query.socialStatuses.findMany({
    where: (s, { and, eq, isNotNull, isNull }) =>
      and(
        eq(s.actorId, actorId),
        isNotNull(s.published),
        includeReplies ? undefined : isNull(s.inReplyToId),
        readableStatus(viewerActorId, viewerGroupIds),
        notExpired(),
        excludeStories(),
        cursor ? sql`${s.id} < ${cursor}` : undefined
      ),
    with: {
      actor: ACTOR_WITH,
      attachments: true,
      group: GROUP_WITH,
      ...(viewerActorId && {
        likes: {
          where: eq(socialLikes.actorId, viewerActorId),
          columns: { id: true },
        },
      }),
    },
    orderBy: (s, { desc }) => [desc(s.published), desc(s.id)],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { statuses: items.map(toStatus), nextCursor };
}

/**
 * Get posts in a group.
 *
 * The visibility predicate does the authorization rather than a separate
 * `canRead` check before the call: for a public group it passes everything,
 * and for a private one it matches only when the viewer holds active
 * membership. A non-member therefore gets an empty timeline rather than an
 * error, which is also the right answer for a group they cannot see into.
 */
export async function getGroupTimeline(
  groupId: string,
  viewerActorId?: string,
  cursor?: string,
  limit: number = 20
): Promise<TimelineResult> {
  const viewerGroupIds = await getViewerGroupIds(viewerActorId);
  // A group is shared ground, so a block cannot remove the other person from
  // it — but it can stop their posts reaching the blocker's screen, which is
  // what the blocker asked for.
  const hiddenActorIds = viewerActorId
    ? await getHiddenActorIds(viewerActorId)
    : [];

  const rows = await db.query.socialStatuses.findMany({
    where: (s, { and, eq: eqOp, isNotNull, isNull }) =>
      and(
        eqOp(s.groupId, groupId),
        isNotNull(s.published),
        isNull(s.inReplyToId),
        visibleGroupStatuses(viewerGroupIds),
        notExpired(),
        notHidden(hiddenActorIds),
        cursor ? sql`${s.id} < ${cursor}` : undefined
      ),
    with: {
      actor: ACTOR_WITH,
      attachments: true,
      group: GROUP_WITH,
      ...(viewerActorId && {
        likes: {
          where: eq(socialLikes.actorId, viewerActorId),
          columns: { id: true },
        },
      }),
    },
    orderBy: (s, { desc }) => [desc(s.published), desc(s.id)],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { statuses: items.map(toStatus), nextCursor };
}

/**
 * Get public timeline (local posts with public visibility).
 */
export async function getPublicTimeline(
  viewerActorId?: string,
  cursor?: string,
  limit: number = 20
): Promise<TimelineResult> {
  const viewerGroupIds = await getViewerGroupIds(viewerActorId);
  // The public timeline has no relationship in it at all, so this is the only
  // thing standing between a blocked account and the viewer's town square.
  const hiddenActorIds = viewerActorId
    ? await getHiddenActorIds(viewerActorId)
    : [];

  const rows = await db.query.socialStatuses.findMany({
    where: (s, { and, isNotNull, isNull }) =>
      and(
        isNotNull(s.published),
        isNull(s.inReplyToId),
        jsonbArrayContains(socialStatuses.recipientTo, PUBLIC),
        notPanasStatus(),
        // Public addressing already excludes private group posts, so this is
        // belt and braces — but the two conditions are independent, and the
        // day someone posts a PUBLIC-addressed note into a private group this
        // is the line that keeps the town square from being the leak.
        visibleGroupStatuses(viewerGroupIds),
        notExpired(),
        excludeStories(),
        notHidden(hiddenActorIds),
        cursor ? sql`${s.id} < ${cursor}` : undefined
      ),
    with: {
      actor: ACTOR_WITH,
      attachments: true,
      group: GROUP_WITH,
      ...(viewerActorId && {
        likes: {
          where: eq(socialLikes.actorId, viewerActorId),
          columns: { id: true },
        },
      }),
    },
    orderBy: (s, { desc }) => [desc(s.published), desc(s.id)],
    limit: limit + 1,
    // Filter to local actors only (domain = socialConfig.domain)
    extras: {
      domainFilter: sql<string>`1`.as('_'),
    },
  });

  // Post-filter to local actors only (Drizzle doesn't support nested where on relations in findMany)
  const localRows = rows.filter((r) => r.actor.domain === socialConfig.domain);

  const hasMore = localRows.length > limit;
  const items = hasMore ? localRows.slice(0, limit) : localRows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { statuses: items.map(toStatus), nextCursor };
}

/**
 * Get received direct messages (inbox) for an actor.
 */
export async function getReceivedDirectMessages(
  actorId: string,
  cursor?: string,
  limit: number = 20
): Promise<TimelineResult> {
  const actor = await db.query.socialActors.findFirst({
    where: eq(socialActors.id, actorId),
    columns: { uri: true },
  });

  if (!actor) {
    return { statuses: [], nextCursor: null };
  }

  // DMs from a blocked account must not land in the inbox. This is the single
  // most direct harassment channel on the site, and the one where "they can
  // still reach me" would make the block worthless.
  const hiddenActorIds = await getHiddenActorIds(actorId);

  const rows = await db.query.socialStatuses.findMany({
    where: (s, { and, isNotNull, ne }) =>
      and(
        isNotNull(s.published),
        ne(s.actorId, actorId),
        jsonbArrayContains(socialStatuses.recipientTo, actor.uri),
        sql`NOT (${jsonbArrayContains(socialStatuses.recipientTo, PUBLIC)} OR ${jsonbArrayContains(socialStatuses.recipientCc, PUBLIC)})`,
        // "Not publicly addressed" is how this view finds DMs, and it is also
        // true of every private group post. Membership content is not mail.
        personalStatusesOnly(),
        notPanasStatus(),
        notExpired(),
        excludeStories(),
        notHidden(hiddenActorIds),
        cursor ? sql`${s.id} < ${cursor}` : undefined
      ),
    with: {
      actor: ACTOR_WITH,
      attachments: true,
      likes: {
        where: eq(socialLikes.actorId, actorId),
        columns: { id: true },
      },
    },
    orderBy: (s, { desc }) => [desc(s.published), desc(s.id)],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { statuses: items.map(toStatus), nextCursor };
}

/**
 * Get sent direct messages for an actor.
 */
export async function getSentDirectMessages(
  actorId: string,
  cursor?: string,
  limit: number = 20
): Promise<TimelineResult> {
  const rows = await db.query.socialStatuses.findMany({
    where: (s, { and, eq, isNotNull }) =>
      and(
        eq(s.actorId, actorId),
        isNotNull(s.published),
        sql`NOT (${jsonbArrayContains(socialStatuses.recipientTo, PUBLIC)} OR ${jsonbArrayContains(socialStatuses.recipientCc, PUBLIC)})`,
        // Same reason as the inbox, and this one bites immediately: without
        // it, every private group post you write turns up in your own Sent
        // messages, because it is by definition not publicly addressed.
        personalStatusesOnly(),
        notPanasStatus(),
        notExpired(),
        // Load-bearing, not defensive. A story is addressed followers-only, so
        // it satisfies this query's "not public" test and would otherwise be
        // listed here as a direct message the author never sent.
        excludeStories(),
        cursor ? sql`${s.id} < ${cursor}` : undefined
      ),
    with: {
      actor: ACTOR_WITH,
      attachments: true,
      likes: {
        where: eq(socialLikes.actorId, actorId),
        columns: { id: true },
      },
    },
    orderBy: (s, { desc }) => [desc(s.published), desc(s.id)],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { statuses: items.map(toStatus), nextCursor };
}

/**
 * Get all posts that "@" a user (mentions + DMs).
 */
export async function getAtMeTimeline(
  actorId: string,
  cursor?: string,
  limit: number = 20
): Promise<TimelineResult> {
  const actor = await db.query.socialActors.findFirst({
    where: eq(socialActors.id, actorId),
    columns: { uri: true },
  });

  if (!actor) {
    return { statuses: [], nextCursor: null };
  }

  const viewerGroupIds = await getViewerGroupIds(actorId);
  // Being named by someone you blocked is a notification from them, which is
  // the thing a block is supposed to end.
  const hiddenActorIds = await getHiddenActorIds(actorId);

  const rows = await db.query.socialStatuses.findMany({
    where: (s, { and, isNotNull, ne }) =>
      and(
        isNotNull(s.published),
        ne(s.actorId, actorId),
        or(
          and(
            notPanasStatus(),
            jsonbArrayContains(socialStatuses.recipientTo, actor.uri)
          ),
          sql`EXISTS (
            SELECT 1 FROM social_tags st
            WHERE st.status_id = ${socialStatuses.id}
            AND st.type = 'Mention'
            AND st.href = ${actor.uri}
          )`
        ),
        // A mention tag alone must not grant access to a private personal post.
        readableStatus(actorId, viewerGroupIds),
        notExpired(),
        excludeStories(),
        notHidden(hiddenActorIds),
        notHeldRequest(actorId, actor.uri),
        cursor ? sql`${s.id} < ${cursor}` : undefined
      ),
    with: {
      actor: ACTOR_WITH,
      attachments: true,
      group: GROUP_WITH,
      likes: {
        where: eq(socialLikes.actorId, actorId),
        columns: { id: true },
      },
    },
    orderBy: (s, { desc }) => [desc(s.published), desc(s.id)],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { statuses: items.map(toStatus), nextCursor };
}

/**
 * The messages waiting in the viewer's Requests folder.
 *
 * The exact complement of what `getAtMeTimeline` hides, so a held message is
 * readable in one place and one place only. The recipient reads before
 * deciding: triaging on a name and a timestamp alone would make "accept" the
 * only way to find out what was said, and accepting is the consent the gate
 * exists to ask for.
 *
 * Ordered oldest-first, unlike every other timeline here. These are grouped
 * into per-sender threads by the caller and read as correspondence, where the
 * opening line is the one that tells you whether this is a neighbour or spam.
 *
 * Applies the same hidden-actor and expiry filters as the inbox. Expiry is why
 * a request can legitimately have no messages: direct statuses age out while
 * the request row persists, so the caller must render a sender with an empty
 * thread rather than treating it as an error.
 */
export async function getHeldRequestStatuses(
  actorId: string,
  limit: number = 100
): Promise<StatusWithActorAndLike[]> {
  const actor = await db.query.socialActors.findFirst({
    where: eq(socialActors.id, actorId),
    columns: { uri: true },
  });

  if (!actor) return [];

  const hiddenActorIds = await getHiddenActorIds(actorId);

  const rows = await db.query.socialStatuses.findMany({
    where: (s, { and, isNotNull, ne }) =>
      and(
        isNotNull(s.published),
        ne(s.actorId, actorId),
        heldRequest(actorId, actor.uri),
        notExpired(),
        excludeStories(),
        notHidden(hiddenActorIds)
      ),
    with: {
      actor: ACTOR_WITH,
      attachments: true,
      group: GROUP_WITH,
      likes: {
        where: eq(socialLikes.actorId, actorId),
        columns: { id: true },
      },
    },
    orderBy: (s, { asc }) => [asc(s.published), asc(s.id)],
    limit,
  });

  return rows.map(toStatus);
}

/**
 * Get a single status with like status for viewer.
 *
 * Returns null for a status the viewer may not read, so a permalink to a
 * private group post is a 404 to a non-member rather than a 403 — a 403 would
 * confirm the post exists, which is half of what the group was keeping.
 */
export async function getStatusWithLikeStatus(
  statusId: string,
  viewerActorId?: string
): Promise<StatusWithActorAndLike | null> {
  const viewerGroupIds = await getViewerGroupIds(viewerActorId);
  const row = await db.query.socialStatuses.findFirst({
    // Expiry and the story exclusion are applied here, not just in the
    // timelines. This is the permalink read, and a status that has dropped out
    // of every feed but still answers on its own URL is only soft-deleted in
    // the feeds -- the link keeps working, and for an expired DM that is the
    // whole of the deletion. Stories are excluded on top because they have no
    // permalink by design: they are watched in the viewer or not at all.
    where: and(
      eq(socialStatuses.id, statusId),
      readableStatus(viewerActorId, viewerGroupIds),
      notExpired(),
      excludeStories()
    ),
    with: {
      actor: ACTOR_WITH,
      attachments: true,
      group: GROUP_WITH,
      ...(viewerActorId && {
        likes: {
          where: eq(socialLikes.actorId, viewerActorId),
          columns: { id: true },
        },
      }),
    },
  });

  if (!row) return null;
  return toStatus(row);
}

/* ---------------------------------------------------------------------------
 * DM conversations
 *
 * The inbox and sent queries above answer "what was addressed to me" and "what
 * did I send". Neither is a conversation: both are flat, both are ordered
 * newest-first, and neither puts the two halves of an exchange together. These
 * two functions are the read side of the DM chat view, which docs/CHAT-ROADMAP
 * records as the prerequisite for live delivery.
 *
 * WHY ONE-TO-ONE ONLY
 *
 * A direct status carries up to eight recipient URIs, so "the conversation
 * with Bee" is not well defined for a message also addressed to six other
 * people. Grouping such a message under each recipient separately is the
 * tempting read, and it is a safety bug: the reply box under it would address
 * one person while the message above it went to seven, so a reply silently
 * narrows an audience the sender believed they were still talking to.
 *
 * So a conversation here is exactly two participants, enforced in SQL by
 * `oneToOneDirect()` rather than assumed. Multi-recipient DMs stay readable in
 * the /updates lists, which make no claim to be a thread. Nothing creates a
 * multi-recipient DM in the product today; this guard is what keeps that from
 * silently becoming a bug if something ever does.
 *
 * Note that the one-to-one test is on `recipientTo` length rather than on a
 * count of participants, which is correct because createStatus writes `cc: []`
 * for direct visibility -- see the 'direct' branch of ./status.ts.
 * ------------------------------------------------------------------------- */

/**
 * A direct status addressed to exactly one actor.
 *
 * Also excludes the zero-recipient case, which is reachable: declining a
 * request strips the decliner's URI out of `recipient_to` (see
 * deleteDirectThreadRequest), and a single-recipient message declined that way
 * is left addressed to nobody. It must not surface as a conversation with
 * whoever is left, because nobody is left.
 */
function oneToOneDirect() {
  return and(
    notPanasStatus(),
    sql`jsonb_array_length(${socialStatuses.recipientTo}) = 1`
  )!;
}

export type DirectConversation = {
  /** The other participant. Never the viewer. */
  counterparty: PublicActorWithCounty;
  /** The most recent message either way, for the list's snippet and time. */
  lastMessage: StatusWithActorAndLike;
};

/**
 * One actor in the shape a timeline hands to a client.
 *
 * Exists because the conversation detail route needs the counterparty for its
 * header and the actor getters in ./actor.ts all return the whole row --
 * including `privateKey`, which must never reach a response body. Reusing
 * ACTOR_WITH and publicActor() here means the thread header is built from the
 * same column list as every other actor the client sees, so it cannot quietly
 * carry a field the others withhold.
 */
export async function getPublicActorById(
  actorId: string
): Promise<PublicActorWithCounty | null> {
  const row = await db.query.socialActors.findFirst({
    where: eq(socialActors.id, actorId),
    ...ACTOR_WITH,
  });

  return row ? publicActor(row) : null;
}

/**
 * The conversation list: one row per person the viewer has a thread with.
 *
 * Held requests are excluded, the same way the inbox excludes them, because a
 * pending request is not yet a conversation -- it is a question about whether
 * to have one, and the Requests folder is where that is answered. Accepting it
 * flips the row to 'accepted' and the thread appears here with its history
 * intact, because nothing was deleted to hold it.
 *
 * Raw SQL for the grouping only. DISTINCT ON is the cheap way to take the
 * newest message per counterparty in one pass, and Drizzle's query builder
 * cannot express it -- but every visibility guard is interpolated from the
 * same helpers the other queries in this file use, rather than hand-rewritten
 * here, because those are the parts that are dangerous when they drift.
 */
export async function getDirectConversations(
  actorId: string,
  limit: number = 40
): Promise<DirectConversation[]> {
  const actor = await db.query.socialActors.findFirst({
    where: eq(socialActors.id, actorId),
    columns: { uri: true },
  });

  if (!actor) return [];

  const hiddenActorIds = await getHiddenActorIds(actorId);

  const rows = (await db.execute(sql`
    WITH conversation AS (
      SELECT
        ${socialStatuses.id} AS status_id,
        ${socialStatuses.published} AS published,
        CASE
          WHEN ${socialStatuses.actorId} = ${actorId} THEN recipient.id
          ELSE ${socialStatuses.actorId}
        END AS counterparty_id
      FROM ${socialStatuses}
      LEFT JOIN ${socialActors} AS recipient
        ON recipient.uri = ${socialStatuses.recipientTo}->>0
      WHERE ${and(
        sql`${socialStatuses.published} IS NOT NULL`,
        oneToOneDirect(),
        notExpired(),
        excludeStories(),
        personalStatusesOnly(),
        notHeldRequest(actorId, actor.uri),
        notHidden(hiddenActorIds),
        or(
          eq(socialStatuses.actorId, actorId),
          jsonbArrayContains(socialStatuses.recipientTo, actor.uri)
        )
      )}
    )
    SELECT latest.counterparty_id, latest.status_id
    FROM (
      SELECT DISTINCT ON (counterparty_id)
        counterparty_id, status_id, published
      FROM conversation
      WHERE counterparty_id IS NOT NULL
        AND counterparty_id <> ${actorId}
      ORDER BY counterparty_id, published DESC, status_id DESC
    ) latest
    ORDER BY latest.published DESC
    LIMIT ${limit}
  `)) as unknown as { counterparty_id: string; status_id: string }[];

  if (rows.length === 0) return [];

  // Re-read through the ORM rather than selecting columns in the raw query, so
  // a conversation's last message is shaped by exactly the same toStatus() as
  // every other status the client receives. The alternative is a second,
  // hand-maintained projection of the same row.
  const statusRows = await db.query.socialStatuses.findMany({
    where: inArray(
      socialStatuses.id,
      rows.map((r) => r.status_id)
    ),
    with: {
      actor: ACTOR_WITH,
      attachments: true,
      likes: {
        where: eq(socialLikes.actorId, actorId),
        columns: { id: true },
      },
    },
  });

  const counterparties = await db.query.socialActors.findMany({
    where: inArray(
      socialActors.id,
      rows.map((r) => r.counterparty_id)
    ),
    ...ACTOR_WITH,
  });

  const statusById = new Map(statusRows.map((s) => [s.id, s]));
  const actorById = new Map(counterparties.map((a) => [a.id, a]));

  // Order is carried by `rows`, not by either lookup: both were fetched by id
  // and neither preserves the recency ordering the raw query established.
  return rows.flatMap((row) => {
    const status = statusById.get(row.status_id);
    const counterparty = actorById.get(row.counterparty_id);
    if (!status || !counterparty) return [];
    return [
      {
        counterparty: publicActor(counterparty),
        lastMessage: toStatus(status),
      },
    ];
  });
}

/**
 * One thread, oldest first.
 *
 * Ascending because this is a transcript rather than a feed: it is read from
 * the top down, and the newest message belongs at the bottom next to the
 * composer. Every other query in this file is newest-first for the opposite
 * reason.
 *
 * Unlike the list, this does NOT exclude held requests. The two are deliberate
 * complements: holding a request suppresses a notification and keeps a stranger
 * out of the inbox, and it is answered by reading what they wrote. A reviewer
 * who has navigated to a specific person's thread is doing the reading, so
 * hiding the message there would leave the Requests folder with nothing to
 * decide about. Blocks and mutes are a different thing and are still enforced,
 * by the caller refusing the thread outright.
 *
 * Not paginated. A thread is bounded by the expiry window rather than by time,
 * so it cannot grow without limit; `limit` is a safety rail against a pair who
 * write a great deal in thirty days, not a cursor.
 */
export async function getDirectConversation(
  actorId: string,
  counterpartyActorId: string,
  limit: number = 200
): Promise<StatusWithActorAndLike[]> {
  const participants = await db.query.socialActors.findMany({
    where: inArray(socialActors.id, [actorId, counterpartyActorId]),
    columns: { id: true, uri: true },
  });

  const viewerUri = participants.find((p) => p.id === actorId)?.uri;
  const counterpartyUri = participants.find(
    (p) => p.id === counterpartyActorId
  )?.uri;

  if (!viewerUri || !counterpartyUri) return [];

  const rows = await db.query.socialStatuses.findMany({
    where: and(
      sql`${socialStatuses.published} IS NOT NULL`,
      oneToOneDirect(),
      notExpired(),
      excludeStories(),
      personalStatusesOnly(),
      or(
        and(
          eq(socialStatuses.actorId, actorId),
          jsonbArrayContains(socialStatuses.recipientTo, counterpartyUri)
        ),
        and(
          eq(socialStatuses.actorId, counterpartyActorId),
          jsonbArrayContains(socialStatuses.recipientTo, viewerUri)
        )
      )
    ),
    with: {
      actor: ACTOR_WITH,
      attachments: true,
      likes: {
        where: eq(socialLikes.actorId, actorId),
        columns: { id: true },
      },
    },
    orderBy: [asc(socialStatuses.published), asc(socialStatuses.id)],
    limit,
  });

  return rows.map(toStatus);
}
