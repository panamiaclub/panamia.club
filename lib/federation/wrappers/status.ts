/**
 * Status Management
 *
 * High-level functions for creating and managing SocialStatuses.
 *
 * @see docs/SOCIAL-ROADMAP.md
 */

import { db } from '@/lib/db';
import {
  socialStatuses,
  socialActors,
  socialAttachments,
  socialLikes,
  socialGroups,
  socialGroupMembers,
  PUBLIC_ACTOR_COLUMNS,
  STATUS_TYPE_STORY,
} from '@/lib/schema';
import type {
  SocialStatus,
  PublicSocialActor,
  SocialGroupVisibility,
} from '@/lib/schema';
import { and, eq, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { renderStatusMarkdown } from '@/lib/federation/markdown';
import { canPost, GateResult } from '../gates';
import { socialConfig, getFollowersUrl } from '../index';
import {
  DIRECT_THREAD_REFUSED,
  evaluateDirectThreads,
  recordDirectThreadRequests,
} from './dm-gate';
import {
  getViewerGroupIds,
  visibleGroupStatuses,
  canViewStatusGroup,
} from './group-visibility';
import { notifyDirectMessage } from '@/lib/dm-stream';
import { notifyGroupPosted } from './group-notify';
import type { PostVisibility } from '@/lib/utils/getVisibility';
import type { JsonValue } from '@/lib/types';

// Markdown rendering, including the hooks that stop raw HTML and
// `javascript:` links being written into new posts, lives in
// lib/federation/markdown.ts.

export type CreateStatusResult =
  | {
      success: true;
      status: SocialStatus;
      /**
       * Recipients whose thread was held as a request rather than delivered to
       * their inbox. The caller MUST NOT notify these actors — suppressing the
       * notification is the entire safety property of the Requests folder, not
       * a presentational detail. See docs/SOCIAL-GRAPH.md section C1.
       *
       * Always present on a direct status so a caller cannot read `undefined`
       * as "nothing held" when it actually means "this code forgot to say".
       */
      heldRecipientActorIds?: string[];
    }
  | { success: false; error: string; gateResult?: GateResult };

export type StatusWithActor = SocialStatus & {
  actor: PublicSocialActor;
};

/**
 * Generate a status URI for local statuses
 */
export function generateStatusUri(username: string, statusId: string): string {
  return `https://${socialConfig.domain}/p/${username}/statuses/${statusId}`;
}

/**
 * How long a direct message stays visible.
 *
 * This is a soft delete via query filter, not a row delete -- the row stays in
 * Postgres, which is why `lib/jobs/purge-expired.ts` deliberately leaves DMs
 * alone and why changing this number is a backfill rather than a recovery.
 *
 * Thirty rather than seven because the DM surface is becoming a transcript.
 * The stamp is applied per row at write time, so a conversation never expires
 * as a unit -- it erodes from its oldest message forward, and the oldest
 * message is usually the one holding what was agreed: the price, the date,
 * which weekend was being held. A mail inbox survives that, because a list of
 * recent items has no beginning anyone expects to find. A transcript does, and
 * one that silently loses its own first page is indistinguishable from data
 * loss to the pana reading it.
 *
 * Changing this value only affects rows written after it changes. Rows already
 * stamped keep the window they were given -- see
 * drizzle/0062_dm_expiry_30_days.sql for the backfill of existing messages.
 */
const DM_EXPIRY_DAYS = 30;

/**
 * Returns a Drizzle WHERE condition to exclude expired statuses.
 */
function _notExpiredCondition() {
  return sql`(${socialStatuses.expiresAt} IS NULL OR ${socialStatuses.expiresAt} > NOW())`;
}

/** Location object for ActivityPub Place */
export interface StatusLocation {
  type: 'Place';
  latitude?: number;
  longitude?: number;
  name?: string;
  precision?: 'precise' | 'general';
}

/**
 * Create a new status (post)
 */
export async function createStatus(
  actorId: string,
  content: string,
  contentWarning?: string,
  inReplyToId?: string,
  visibility: PostVisibility = 'unlisted',
  attachments?: Array<{
    type: string;
    mediaType: string;
    url: string;
    name?: string;
    peaks?: number[];
  }>,
  recipientActorIds?: string[],
  location?: StatusLocation,
  ccLicense: 'cc-by-4' | 'cc-by-sa-4' | 'cc-0' = 'cc-by-4',
  /**
   * Trailing options rather than a tenth positional argument. Nine positions
   * is already past the point where a call site reads as a list of mysteries,
   * and `undefined, undefined, groupId` is how the wrong value lands in the
   * wrong slot.
   */
  options?: { groupId?: string }
): Promise<CreateStatusResult> {
  const groupId = options?.groupId;
  let groupRow: {
    id: string;
    visibility: SocialGroupVisibility;
    actor: { username: string } | null;
  } | null = null;

  // Fetch the actor with profile
  const actor = await db.query.socialActors.findFirst({
    where: eq(socialActors.id, actorId),
    with: { profile: true },
  });

  if (!actor) {
    return { success: false, error: 'Actor not found' };
  }

  /**
   * Posting into a group is gated on active membership, checked here rather
   * than at the route, because this is the only door into the table. A caller
   * that could pass an arbitrary group id would otherwise be able to write
   * into a private group it has never joined — and since membership is also
   * what authorizes *reading*, that post would then be visible to everyone in
   * a group the author was never admitted to.
   */
  if (groupId) {
    const membership = await db.query.socialGroupMembers.findFirst({
      where: and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, actorId),
        eq(socialGroupMembers.status, 'active')
      ),
      columns: { id: true },
    });

    if (!membership) {
      return { success: false, error: 'You are not a member of this group' };
    }

    if (visibility === 'direct') {
      return {
        success: false,
        error: 'A direct message cannot be posted to a group',
      };
    }

    groupRow =
      (await db.query.socialGroups.findFirst({
        where: eq(socialGroups.id, groupId),
        columns: { id: true, visibility: true },
        with: { actor: { columns: { username: true } } },
      })) ?? null;

    if (!groupRow) {
      return { success: false, error: 'Group not found' };
    }
  }

  // Check gate (profile must exist for local actors)
  if (actor.profile) {
    const gateResult = canPost(actor.profile);
    if (!gateResult.allowed) {
      return {
        success: false,
        error: 'Not eligible to post',
        gateResult,
      };
    }
  }

  // Validate content
  if (!content || content.trim().length === 0) {
    return { success: false, error: 'Content cannot be empty' };
  }

  if (content.length > 5000) {
    return { success: false, error: 'Content exceeds maximum length' };
  }

  // Convert markdown to HTML
  const htmlContent = await renderStatusMarkdown(content.trim());

  // If replying, validate the parent exists
  let inReplyToUri: string | undefined;
  if (inReplyToId) {
    const parent = await db.query.socialStatuses.findFirst({
      where: eq(socialStatuses.id, inReplyToId),
    });
    if (!parent) {
      return { success: false, error: 'Parent status not found' };
    }
    inReplyToUri = parent.uri;
  }

  /**
   * Resolve and gate direct-message recipients BEFORE anything is written.
   *
   * The insert below stores a placeholder `uri` of '' and fills in the real
   * one afterwards, because the URI is derived from the row's own id. That
   * makes the span between the insert and the update unsafe to return from:
   * an early return leaves a row with uri = '', and `uri` is UNIQUE, so the
   * orphan then collides with the next status created by ANY account on the
   * instance. One rejected message would stop everybody posting.
   *
   * These checks used to live inside the `direct` case of the addressing
   * switch, which runs after the insert. That was already a latent bug for
   * the three validation failures below, but it was hard to reach — the
   * composer prevents them. A gate refusal is different: it is a normal
   * outcome that any stranger can trigger on purpose, which would have turned
   * a latent bug into a trivial way to break posting site-wide.
   */
  let directRecipientUris: string[] = [];
  let heldRecipientActorIds: string[] = [];

  if (visibility === 'direct') {
    if (!recipientActorIds || recipientActorIds.length === 0) {
      return {
        success: false,
        error: 'Direct messages require at least one recipient',
      };
    }
    if (recipientActorIds.length > 8) {
      return {
        success: false,
        error: 'Direct messages can have at most 8 recipients',
      };
    }
    const recipientActorsRows = await db
      .select({ uri: socialActors.uri })
      .from(socialActors)
      .where(
        sql`${socialActors.id} = ANY(ARRAY[${sql.join(
          recipientActorIds.map((id) => sql`${id}`),
          sql`, `
        )}]::text[])`
      );
    if (recipientActorsRows.length !== recipientActorIds.length) {
      return { success: false, error: 'One or more recipients not found' };
    }
    directRecipientUris = recipientActorsRows.map((r) => r.uri);

    // Who is allowed to be written to at all, and who lands in Requests.
    const gate = await evaluateDirectThreads(actorId, recipientActorIds);

    // Fail the whole send if any recipient refuses, rather than delivering to
    // the rest. Partial delivery on a group DM is both confusing and unsafe:
    // the sender believes all eight people saw it. This also matches how the
    // recipient-not-found case above already behaves.
    if (gate.some((g) => g.decision === 'refuse')) {
      return { success: false, error: DIRECT_THREAD_REFUSED };
    }

    heldRecipientActorIds = gate
      .filter((g) => g.decision === 'hold')
      .map((g) => g.recipientActorId);
  }

  /**
   * Generate the id before inserting so the row is never written with a
   * placeholder uri.
   *
   * The URI is derived from the row's own id, which used to mean inserting
   * with uri = '' and filling it in on a second statement. `uri` is UNIQUE,
   * so for the width of that gap the table could hold only ONE such row
   * instance-wide, and a second concurrent createStatus failed outright with a
   * duplicate-key error on the empty string. Two people posting at the same
   * moment was enough. cuid2 ids are generated client-side anyway, so there
   * was never a reason to wait for the database to tell us what the id was.
   */
  const statusId = createId();
  const uri = generateStatusUri(actor.username, statusId);
  const url = `https://${socialConfig.domain}/p/${actor.username}/${statusId}`;

  // Create the status
  const [status] = await db
    .insert(socialStatuses)
    .values({
      id: statusId,
      actorId,
      content: htmlContent,
      contentWarning: contentWarning || null,
      type: 'Note',
      published: new Date(),
      isDraft: false,
      inReplyToId: inReplyToId || null,
      inReplyToUri: inReplyToUri || null,
      groupId: groupId || null,
      uri,
      url,
      ccLicense,
    })
    .returning();

  // Compute ActivityPub recipients
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  const followersUrl = getFollowersUrl(actor.username);

  let recipientTo: string[];
  let recipientCc: string[];
  let expiresAt: Date | null = null;

  switch (visibility) {
    case 'public':
      recipientTo = [PUBLIC];
      recipientCc = [followersUrl];
      break;
    case 'private':
      recipientTo = [followersUrl];
      recipientCc = [];
      break;
    case 'direct': {
      recipientTo = directRecipientUris;
      recipientCc = [];
      expiresAt = new Date(Date.now() + DM_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      break;
    }
    case 'unlisted':
    default:
      recipientTo = [followersUrl];
      recipientCc = [PUBLIC];
      break;
  }

  /**
   * A private group's post is addressed to the group, never to PUBLIC.
   *
   * The visibility argument describes how the *author* wanted to post; it does
   * not get to widen the audience of a room they were let into. Leaving the
   * default `unlisted` addressing in place would stamp the Public collection
   * onto a private group's post, which is both a false statement about who may
   * read it and the exact value a future reader path might trust.
   *
   * Public groups keep the author's chosen addressing: the group is readable
   * by anyone, so there is nothing to narrow.
   */
  if (groupRow && groupRow.visibility === 'private' && groupRow.actor) {
    recipientTo = [getFollowersUrl(groupRow.actor.username)];
    recipientCc = [];
  }

  const [updatedStatus] = await db
    .update(socialStatuses)
    .set({
      recipientTo,
      recipientCc,
      expiresAt,
      location: location ? (location as unknown as JsonValue) : null,
    })
    .where(eq(socialStatuses.id, status.id))
    .returning();

  // DEFERRED (Phase 7): Outbound federation delivery.
  //
  // recipientTo / recipientCc are persisted above but never fan-ed out to
  // remote inboxes. We don't do it inline because a single popular post can
  // hit 100+ followers across many hosts, which blows the CF Workers request
  // budget and has no retry story if a remote server is flaky.
  //
  // Plan: introduce a `FederationDelivery` Durable Object keyed by remote
  // host (e.g. `mastodon.social`). After this update commits, enqueue one
  // job per unique destination host containing the activity + target inbox
  // URLs. The DO owns:
  //   - persistent queue in DO storage (survives request termination)
  //   - alarm-based exponential backoff retries
  //   - per-host request coalescing + rate limiting
  //   - dead-letter handling
  //
  // CF Queues is a simpler alternative but loses per-host state
  // (ordering, coalescing, connection reuse), which matters for ActivityPub
  // Create→Delete races and for being a good citizen to remote instances.
  //
  // The same DO should also be used from inbox-handler.ts for sending
  // Accept activities (currently fire-and-forget with only console.error
  // on failure — see inbox-handler.ts:~154).

  // DEFERRED: Realtime timeline broadcast.
  //
  // When Pusher was removed, the "new post appears live in followers' feeds"
  // UX regressed. There is no replacement yet; /s relies on manual refresh.
  //
  // Plan: reuse the WebSocket + Durable Object hibernation pattern already
  // implemented in worker/signaling-room.ts for WebRTC signaling. A
  // `TimelineFeed` DO per public-timeline-shard (and optionally per-user for
  // the home timeline) holds the set of connected WebSocket clients; after
  // this DB commit, publish the new status to the relevant DO(s) and they
  // push it down to subscribers. React Query on the client merges it into
  // the existing timeline cache.
  //
  // Note: fan-out on READ (see getHomeTimeline in ./timeline.ts) is the
  // correct design and should be kept — a DO-backed materialized timeline
  // is NOT the goal here. This is purely a live push channel on top of the
  // existing read path.

  // Create attachment records if provided
  if (attachments && attachments.length > 0) {
    await db.insert(socialAttachments).values(
      attachments.map((att) => ({
        statusId: status.id,
        type: att.type,
        mediaType: att.mediaType,
        url: att.url,
        name: att.name || null,
        peaks: att.peaks ? (att.peaks as JsonValue) : null,
      }))
    );
  }

  // Update actor's status count
  await db
    .update(socialActors)
    .set({ statusCount: sql`${socialActors.statusCount} + 1` })
    .where(eq(socialActors.id, actorId));

  // If this is a reply, increment parent's reply count
  if (inReplyToId) {
    await db
      .update(socialStatuses)
      .set({ repliesCount: sql`${socialStatuses.repliesCount} + 1` })
      .where(eq(socialStatuses.id, inReplyToId));
  }

  // Record the request rows only once the status actually exists, so a failed
  // write cannot leave a pending request pointing at nothing.
  if (heldRecipientActorIds.length > 0) {
    await recordDirectThreadRequests(actorId, heldRecipientActorIds);
  }

  // Live delivery. Last, deliberately: everything above is what makes the
  // message real, and this only makes it arrive sooner. It is awaited for
  // completion but never for success — notifyDirectMessage swallows its own
  // errors and bounds itself with a timeout, so neither a failing nor a hanging
  // mailbox can turn a committed row into a failed send.
  //
  // The author is in the fan-out set alongside the recipients. Without that, a
  // pana who sends from their phone would not see the message appear on their
  // laptop: their own actor is not a recipient, so nothing would tell the other
  // session anything happened. The sending client refetches redundantly as a
  // result, which costs one query and keeps every device consistent.
  //
  // Held recipients are included. Holding suppresses a *notification* — the
  // message still lands in their Requests folder, and a live Requests tab
  // should fill in like any other. Nothing here discloses the hold to the
  // sender: this fan-out is per mailbox and the sender only learns about their
  // own.
  if (visibility === 'direct' && recipientActorIds) {
    const soleRecipient =
      recipientActorIds.length === 1 ? recipientActorIds[0] : null;

    await notifyDirectMessage(
      [
        ...recipientActorIds.map((recipientActorId) => ({
          actorId: recipientActorId,
          // For a recipient, the thread is with the author.
          conversationActorId: actorId,
        })),
        {
          actorId,
          // For the author, the thread is with the one recipient — or no single
          // thread at all when the DM has several, which the chat view does not
          // list as a conversation anyway.
          conversationActorId: soleRecipient,
        },
      ],
      statusId
    );
  }

  /**
   * Tell the group a new post arrived.
   *
   * Top-level posts only. A reply is a conversation between the people already
   * in it, and announcing every one of them to the whole membership is how a
   * single busy thread turns the bell into something people learn to ignore.
   *
   * Lives here rather than in the route because this function is the only door
   * into a group post -- the membership gate above says so, and for the same
   * reason: a second way in would otherwise be a second way to post silently.
   *
   * Awaited rather than fired and forgotten. There is no waitUntil on this
   * path, and a floating promise is not guaranteed to survive the response
   * being returned; it costs a fixed four queries no matter how large the
   * group is. notifyGroupPosted swallows its own failures, so this cannot turn
   * a successful post into an error.
   */
  if (groupId && !inReplyToId && actor.profile?.userId) {
    await notifyGroupPosted(groupId, actorId, actor.profile.userId);
  }

  return { success: true, status: updatedStatus, heldRecipientActorIds };
}

/**
 * Get a status by ID with actor information
 *
 * Group-aware: a status in a private group resolves to null for anyone who is
 * not an active member. Callers that pass no viewer are treated as anonymous,
 * which is the safe default and the correct one for the public permalink.
 */
export async function getStatus(
  statusId: string,
  viewerActorId?: string
): Promise<StatusWithActor | null> {
  const status =
    (await db.query.socialStatuses.findFirst({
      where: eq(socialStatuses.id, statusId),
      with: { actor: { columns: PUBLIC_ACTOR_COLUMNS } },
    })) ?? null;

  if (!status) return null;
  if (!(await canViewStatusGroup(status.groupId, viewerActorId))) return null;

  return status;
}

/**
 * Get a status by URI
 *
 * Deliberately NOT group-filtered. This is the lookup federation uses to
 * resolve a URI it was handed — dereferencing an inbox activity, threading a
 * reply — where the caller is the system rather than a person, and returning
 * null would break delivery rather than protect anything. Any path that shows
 * the result to a human must gate it with `canViewStatusGroup` first.
 */
export async function getStatusByUri(
  uri: string
): Promise<StatusWithActor | null> {
  return (
    (await db.query.socialStatuses.findFirst({
      where: eq(socialStatuses.uri, uri),
      with: { actor: { columns: PUBLIC_ACTOR_COLUMNS } },
    })) ?? null
  );
}

/**
 * Delete a status (only author can delete)
 */
export async function deleteStatus(
  statusId: string,
  actorId: string
): Promise<{ success: boolean; error?: string }> {
  const status = await db.query.socialStatuses.findFirst({
    where: eq(socialStatuses.id, statusId),
  });

  if (!status) {
    return { success: false, error: 'Status not found' };
  }

  if (status.actorId !== actorId) {
    return { success: false, error: 'Not authorized to delete this status' };
  }

  await db.delete(socialStatuses).where(eq(socialStatuses.id, statusId));

  // Decrement actor's status count -- but only for real posts. Stories never
  // incremented it (they are not part of an actor's published body of work and
  // are not listed in the outbox), so decrementing here would walk the count
  // down by one per deleted story and eventually negative.
  if (status.type !== STATUS_TYPE_STORY) {
    await db
      .update(socialActors)
      .set({ statusCount: sql`${socialActors.statusCount} - 1` })
      .where(eq(socialActors.id, actorId));
  }

  // If this was a reply, decrement parent's reply count
  if (status.inReplyToId) {
    await db
      .update(socialStatuses)
      .set({ repliesCount: sql`${socialStatuses.repliesCount} - 1` })
      .where(eq(socialStatuses.id, status.inReplyToId));
  }

  return { success: true };
}

/**
 * Get replies to a status
 *
 * A reply inherits its parent's group, so this needs the same gate the parent
 * did. Without it a thread inside a private group is readable by anyone who
 * can guess a status id, which is the cheapest possible way to defeat the
 * group's privacy.
 */
export async function getStatusReplies(
  statusId: string,
  cursor?: string,
  limit: number = 20,
  viewerActorId?: string
): Promise<{ replies: StatusWithActor[]; nextCursor: string | null }> {
  const viewerGroupIds = await getViewerGroupIds(viewerActorId);

  const replies = await db.query.socialStatuses.findMany({
    where: (s, { and, eq, isNotNull, gt }) =>
      and(
        eq(s.inReplyToId, statusId),
        isNotNull(s.published),
        visibleGroupStatuses(viewerGroupIds),
        cursor ? gt(s.id, cursor) : undefined,
        sql`(${socialStatuses.expiresAt} IS NULL OR ${socialStatuses.expiresAt} > NOW())`
      ),
    with: { actor: { columns: PUBLIC_ACTOR_COLUMNS }, attachments: true },
    orderBy: (s, { asc }) => [asc(s.published), asc(s.id)],
    limit: limit + 1,
  });

  const hasMore = replies.length > limit;
  const items = hasMore ? replies.slice(0, limit) : replies;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { replies: items as StatusWithActor[], nextCursor };
}

/**
 * Like a status
 */
export async function likeStatus(
  actorId: string,
  statusId: string
): Promise<{
  success: boolean;
  liked: boolean;
  likesCount: number;
  error?: string;
}> {
  const status = await db.query.socialStatuses.findFirst({
    where: eq(socialStatuses.id, statusId),
  });

  if (!status) {
    return {
      success: false,
      liked: false,
      likesCount: 0,
      error: 'Status not found',
    };
  }

  // Liking is a read you can feel. Without this gate a non-member can probe a
  // private group's post ids and learn which ones exist from the like counts.
  if (!(await canViewStatusGroup(status.groupId, actorId))) {
    return {
      success: false,
      liked: false,
      likesCount: 0,
      error: 'Status not found',
    };
  }

  // Check if already liked
  const existingLike = await db.query.socialLikes.findFirst({
    where: and(
      eq(socialLikes.actorId, actorId),
      eq(socialLikes.statusId, statusId)
    ),
  });

  if (existingLike) {
    return { success: true, liked: true, likesCount: status.likesCount };
  }

  const actor = await db.query.socialActors.findFirst({
    where: eq(socialActors.id, actorId),
  });

  if (!actor) {
    return {
      success: false,
      liked: false,
      likesCount: 0,
      error: 'Actor not found',
    };
  }

  const likeUri = `https://${socialConfig.domain}/p/${actor.username}/likes/${statusId}`;

  await db.insert(socialLikes).values({
    actorId,
    statusId,
    uri: likeUri,
  });

  const [updatedStatus] = await db
    .update(socialStatuses)
    .set({ likesCount: sql`${socialStatuses.likesCount} + 1` })
    .where(eq(socialStatuses.id, statusId))
    .returning();

  return {
    success: true,
    liked: true,
    likesCount: updatedStatus?.likesCount ?? status.likesCount + 1,
  };
}

/**
 * Unlike a status
 */
export async function unlikeStatus(
  actorId: string,
  statusId: string
): Promise<{
  success: boolean;
  liked: boolean;
  likesCount: number;
  error?: string;
}> {
  const status = await db.query.socialStatuses.findFirst({
    where: eq(socialStatuses.id, statusId),
  });

  if (!status) {
    return {
      success: false,
      liked: false,
      likesCount: 0,
      error: 'Status not found',
    };
  }

  // Same gate as liking. This path returns `likesCount` even when there was
  // nothing to remove, so without it an unlike is a free read of a private
  // group post's like count by anyone willing to guess the id.
  if (!(await canViewStatusGroup(status.groupId, actorId))) {
    return {
      success: false,
      liked: false,
      likesCount: 0,
      error: 'Status not found',
    };
  }

  const existingLike = await db.query.socialLikes.findFirst({
    where: and(
      eq(socialLikes.actorId, actorId),
      eq(socialLikes.statusId, statusId)
    ),
  });

  if (!existingLike) {
    return { success: true, liked: false, likesCount: status.likesCount };
  }

  await db.delete(socialLikes).where(eq(socialLikes.id, existingLike.id));

  const [updatedStatus] = await db
    .update(socialStatuses)
    .set({ likesCount: sql`${socialStatuses.likesCount} - 1` })
    .where(eq(socialStatuses.id, statusId))
    .returning();

  return {
    success: true,
    liked: false,
    likesCount: updatedStatus?.likesCount ?? Math.max(0, status.likesCount - 1),
  };
}
