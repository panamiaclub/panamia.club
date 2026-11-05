// Stories: ephemeral, image-or-video posts watched from a pana's profile
// picture rather than scrolled in a feed.
//
// A story is a row in social_statuses with type = 'Story'. It is not a
// separate table, because the two genuinely hard parts of a story were
// already built and proven here:
//
//   - expiry. social_statuses.expiresAt has existed since the first migration
//     and every read path already honours it (see notExpired() in
//     ./timeline.ts). Direct messages have relied on it for their whole life
//     since day one. A parallel stories table would have had to re-derive
//     that, and re-derive it correctly in six query sites.
//
//   - attachments. social_attachments already carries R2 image and video URLs,
//     already has an upload path in /api/social/media, and is already rendered
//     by the post components. Story media is the same media.
//
// The price of that reuse is paid in ./timeline.ts: every query that means
// "posts" now has to say so explicitly via excludeStories(). That cost is real
// but it is one guard in one file, against duplicating expiry and media
// handling in two places that would drift.
//
// What is deliberately NOT reused: visibility. Stories are addressed
// followers-only (recipientTo = [followersUrl]) even though anyone who opens
// the profile can watch them. Addressing here is not the access control -- it
// is the federation blocker. The outbox selects on recipientTo containing the
// Public URI, so a followers-only story physically cannot leave this server.
// That matters because Mastodon has no story concept: a federated story lands
// on a remote instance as an ordinary post that never expires, and the 24-hour
// promise made to the author silently does not apply to the copy.

import { db } from '@/lib/db';
import {
  socialStatuses,
  socialActors,
  socialAttachments,
  socialStoryViews,
  PUBLIC_ACTOR_COLUMNS,
  STATUS_TYPE_STORY,
} from '@/lib/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { canPost, GateResult } from '../gates';
import { getFollowersUrl } from '../index';
import { generateStatusUri } from './status';
import { isBlockedEitherWay } from './block-filter';
import { isVisualAttachment } from '@/lib/media/attachments';

/** How long a story stays watchable. */
const STORY_LIFETIME_HOURS = 24;

/** Most stories one pana can have live at once. */
const MAX_ACTIVE_STORIES = 20;

/** Caption length. Far shorter than a post -- this overlays the image. */
const MAX_CAPTION_LENGTH = 280;

export interface StoryMediaInput {
  type: string;
  mediaType: string;
  url: string;
  name?: string;
}

export interface StoryAttachment {
  id: string;
  /** Media category -- 'image' or 'video'. Drives the viewer. */
  type: string;
  /** MIME type. Nullable in the schema, so the viewer keys off `type`. */
  mediaType: string | null;
  url: string;
  name: string | null;
}

export interface Story {
  id: string;
  /** Caption overlaid on the media. Plain text, may be empty. */
  caption: string;
  contentWarning: string | null;
  publishedAt: string;
  expiresAt: string;
  media: StoryAttachment;
  /** Whether the requesting viewer has already watched this one. */
  seen: boolean;
  /**
   * Watch count. Only populated for the story's author -- a viewer has no
   * business knowing how many other people watched.
   */
  viewCount: number | null;
}

export interface StoryTray {
  actor: {
    id: string;
    username: string;
    displayName: string | null;
    iconUrl: string | null;
  };
  stories: Story[];
  /** True when at least one story is unwatched by this viewer. */
  hasUnseen: boolean;
  /**
   * Whether the requester is the author.
   *
   * Reported here rather than left to the caller because the two profile heroes
   * differ: the business hero is a client component with useProfileViewer(), the
   * personal one is server-rendered and has no viewer context at all. Deriving
   * it server-side from the session means both get the same answer from the
   * same comparison, and neither has to plumb it down.
   */
  isOwner: boolean;
}

/**
 * The lightweight answer to "should this avatar have a ring, and what colour".
 *
 * Deliberately carries no media and no story ids: this is what a list of
 * fifty avatars needs, and shipping the tray fifty times over to render a
 * coloured border would be the whole payload wasted.
 */
export interface StorySummary {
  hasStories: boolean;
  hasUnseen: boolean;
  isOwner: boolean;
}

function storyExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + STORY_LIFETIME_HOURS * 60 * 60 * 1000);
}

/**
 * Create a story.
 *
 * Requires exactly one piece of media. A story with no media is just a post,
 * and a story with several is a carousel -- a different interaction model that
 * the viewer does not implement. Enforcing one here keeps the viewer's
 * "one tap, one story" contract honest rather than leaving it to render
 * whatever happens to be attached.
 */
export async function createStory(
  actorId: string,
  media: StoryMediaInput,
  caption?: string,
  contentWarning?: string
): Promise<{
  success: boolean;
  story?: Story;
  error?: string;
  gateResult?: GateResult;
}> {
  const actor = await db.query.socialActors.findFirst({
    where: eq(socialActors.id, actorId),
    with: { profile: true },
  });

  if (!actor) {
    return { success: false, error: 'Actor not found' };
  }

  if (actor.profile) {
    const gateResult = canPost(actor.profile);
    if (!gateResult.allowed) {
      return { success: false, error: 'Not eligible to post', gateResult };
    }
  }

  if (!media?.url) {
    return { success: false, error: 'A story needs a photo or video' };
  }

  if (!isVisualAttachment(media)) {
    return { success: false, error: 'Stories support photos and videos only' };
  }

  const trimmedCaption = (caption ?? '').trim();
  if (trimmedCaption.length > MAX_CAPTION_LENGTH) {
    return {
      success: false,
      error: `Caption is limited to ${MAX_CAPTION_LENGTH} characters`,
    };
  }

  // Rate limit by live count rather than by time. A burst of twelve stories in
  // a minute is normal use; two hundred is someone scripting the endpoint, and
  // each one costs an R2 object that is not reclaimed until it expires.
  const [{ count: activeCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(socialStatuses)
    .where(
      and(
        eq(socialStatuses.actorId, actorId),
        eq(socialStatuses.type, STATUS_TYPE_STORY),
        sql`${socialStatuses.expiresAt} > NOW()`
      )
    );

  if (activeCount >= MAX_ACTIVE_STORIES) {
    return {
      success: false,
      error: `You can have ${MAX_ACTIVE_STORIES} stories up at once. Wait for one to expire.`,
    };
  }

  const publishedAt = new Date();
  const expiresAt = storyExpiry(publishedAt);

  // Caption is stored as-is, not run through marked(). Posts render markdown;
  // a story caption is a single line of text drawn over an image, so links and
  // headings have nowhere to go. Storing plain text also means the viewer can
  // render it as text and never needs dangerouslySetInnerHTML.
  const [status] = await db
    .insert(socialStatuses)
    .values({
      actorId,
      content: trimmedCaption,
      contentWarning: contentWarning?.trim() || null,
      type: STATUS_TYPE_STORY,
      published: publishedAt,
      expiresAt,
      isDraft: false,
      uri: '',
      url: '',
      recipientTo: [getFollowersUrl(actor.username)],
      recipientCc: [],
    })
    .returning();

  const uri = generateStatusUri(actor.username, status.id);

  await db
    .update(socialStatuses)
    .set({
      uri,
      // No public URL. Stories are not addressable pages -- getStatusWithLikeStatus
      // excludes them, so a permalink would 404 anyway. Leaving this empty keeps
      // anything that builds a link from it from producing a dead one.
      url: '',
    })
    .where(eq(socialStatuses.id, status.id));

  const [attachment] = await db
    .insert(socialAttachments)
    .values({
      statusId: status.id,
      type: media.type,
      mediaType: media.mediaType,
      url: media.url,
      name: media.name || null,
    })
    .returning();

  // Note: actor.statusCount is deliberately NOT incremented. It is the
  // outbox's totalItems and the profile's post count, and a story appears in
  // neither. deleteStatus() has the matching exemption.

  return {
    success: true,
    story: {
      id: status.id,
      caption: trimmedCaption,
      contentWarning: status.contentWarning,
      publishedAt: publishedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      media: {
        id: attachment.id,
        type: attachment.type,
        mediaType: attachment.mediaType,
        url: attachment.url,
        name: attachment.name,
      },
      seen: true,
      viewCount: 0,
    },
  };
}

/**
 * Every story a pana currently has live, oldest first.
 *
 * Oldest first because the viewer plays them in sequence and a story is a
 * narrative -- "this morning, then lunch, then now" only reads correctly
 * forwards. This is the opposite of every other timeline in the codebase,
 * which is newest first, so it is set explicitly rather than inherited.
 *
 * Returns null when the actor does not exist, and an empty tray when they
 * exist but have nothing live. The caller renders those differently: a missing
 * pana is an error, a pana with no stories is just a plain profile picture.
 */
/**
 * Whether each of several panas has stories worth ringing, in a fixed number
 * of queries.
 *
 * Exists because of where rings are drawn. One ring on a profile can afford
 * getActiveStories -- one actor, full media, one request. A feed or a pana
 * list draws twenty or fifty, and doing that per avatar means twenty or fifty
 * round trips for data that is thrown away: the list only needs to know
 * whether to draw a ring and what colour. The media is fetched when someone
 * actually taps.
 *
 * Three queries regardless of list length. Not one -- the grouped aggregate
 * that would collapse them has to left-join views and count distinct statuses
 * in the same pass, and that reads far worse than it performs.
 */
export async function getStorySummaries(
  usernames: string[],
  viewerActorId?: string
): Promise<Record<string, StorySummary>> {
  const wanted = [...new Set(usernames.filter(Boolean))];
  if (wanted.length === 0) return {};

  const actors = await db.query.socialActors.findMany({
    where: inArray(socialActors.username, wanted),
    columns: { id: true, username: true },
  });
  if (actors.length === 0) return {};

  const actorIds = actors.map((a) => a.id);

  const rows = await db
    .select({ id: socialStatuses.id, actorId: socialStatuses.actorId })
    .from(socialStatuses)
    // Inner join, so a story with no media is not counted. getActiveStories
    // skips those rows when building the tray (media is a separate insert, so
    // a half-written row is possible). Counting them here would draw a ring
    // that opens an empty viewer.
    .innerJoin(
      socialAttachments,
      eq(socialAttachments.statusId, socialStatuses.id)
    )
    .where(
      and(
        inArray(socialStatuses.actorId, actorIds),
        eq(socialStatuses.type, STATUS_TYPE_STORY),
        sql`${socialStatuses.expiresAt} > NOW()`
      )
    )
    .limit(MAX_ACTIVE_STORIES * actorIds.length);

  // Only asked when there is a viewer to have seen anything. Signed out, every
  // ring with stories is unseen, which is the correct answer anyway.
  let seenIds = new Set<string>();
  if (viewerActorId && rows.length > 0) {
    const views = await db
      .select({ statusId: socialStoryViews.statusId })
      .from(socialStoryViews)
      .where(
        and(
          eq(socialStoryViews.viewerActorId, viewerActorId),
          inArray(
            socialStoryViews.statusId,
            rows.map((r) => r.id)
          )
        )
      );
    seenIds = new Set(views.map((v) => v.statusId));
  }

  const byActor = new Map<string, { total: number; unseen: number }>();
  const counted = new Set<string>();
  for (const row of rows) {
    // The join yields one row per attachment. createStory enforces exactly one,
    // but dedupe anyway so a stray second attachment cannot double-count.
    if (counted.has(row.id)) continue;
    counted.add(row.id);
    const entry = byActor.get(row.actorId) ?? { total: 0, unseen: 0 };
    entry.total += 1;
    // Matches getActiveStories: the author is never shown an unwatched ring on
    // their own stories. Not cosmetic parity -- markStoryViewed skips the
    // author's own views on purpose, so an owner's unseen count here could
    // never be worked off and the ring would stay lit until the story expired.
    const isOwn = viewerActorId != null && row.actorId === viewerActorId;
    if (!isOwn && !seenIds.has(row.id)) entry.unseen += 1;
    byActor.set(row.actorId, entry);
  }

  const result: Record<string, StorySummary> = {};
  for (const actor of actors) {
    const entry = byActor.get(actor.id);
    result[actor.username] = {
      hasStories: (entry?.total ?? 0) > 0,
      hasUnseen: (entry?.unseen ?? 0) > 0,
      isOwner: viewerActorId != null && viewerActorId === actor.id,
    };
  }
  return result;
}

export async function getActiveStories(
  username: string,
  viewerActorId?: string
): Promise<StoryTray | null> {
  const actor = await db.query.socialActors.findFirst({
    where: eq(socialActors.username, username),
    columns: PUBLIC_ACTOR_COLUMNS,
  });

  if (!actor) {
    return null;
  }

  // Same answer as "this person has no stories". Returning null rather than
  // throwing keeps the block undetectable: a blocked viewer opening the URL
  // directly gets the identical response they would get for anyone with an
  // empty tray. Skipped when the viewer is the author, since isBlockedEitherWay
  // is false for self anyway but the extra query is pointless.
  if (viewerActorId && viewerActorId !== actor.id) {
    if (await isBlockedEitherWay(viewerActorId, actor.id)) {
      return null;
    }
  }

  const isOwner = viewerActorId != null && viewerActorId === actor.id;

  const rows = await db.query.socialStatuses.findMany({
    where: and(
      eq(socialStatuses.actorId, actor.id),
      eq(socialStatuses.type, STATUS_TYPE_STORY),
      sql`${socialStatuses.expiresAt} > NOW()`
    ),
    with: { attachments: true },
    orderBy: (s, { asc }) => [asc(s.published), asc(s.id)],
    limit: MAX_ACTIVE_STORIES,
  });

  if (rows.length === 0) {
    return {
      actor: {
        id: actor.id,
        username: actor.username,
        displayName: actor.name,
        iconUrl: actor.iconUrl,
      },
      stories: [],
      hasUnseen: false,
      isOwner,
    };
  }

  const statusIds = rows.map((r) => r.id);

  // Which of these has the viewer already watched? Signed-out visitors skip
  // the query entirely and see everything as unwatched, which is correct --
  // there is nowhere to record their viewing.
  const seenIds = new Set<string>();
  if (viewerActorId) {
    const seen = await db
      .select({ statusId: socialStoryViews.statusId })
      .from(socialStoryViews)
      .where(
        and(
          eq(socialStoryViews.viewerActorId, viewerActorId),
          sql`${socialStoryViews.statusId} = ANY(ARRAY[${sql.join(
            statusIds.map((id) => sql`${id}`),
            sql`, `
          )}]::text[])`
        )
      );
    for (const row of seen) {
      seenIds.add(row.statusId);
    }
  }

  // View counts are one grouped query for the whole tray, and only for the
  // author. Doing it per story would be N queries to show a number nobody else
  // is allowed to see.
  const viewCounts = new Map<string, number>();
  if (isOwner) {
    const counts = await db
      .select({
        statusId: socialStoryViews.statusId,
        count: sql<number>`count(*)::int`,
      })
      .from(socialStoryViews)
      .where(
        sql`${socialStoryViews.statusId} = ANY(ARRAY[${sql.join(
          statusIds.map((id) => sql`${id}`),
          sql`, `
        )}]::text[])`
      )
      .groupBy(socialStoryViews.statusId);
    for (const row of counts) {
      viewCounts.set(row.statusId, row.count);
    }
  }

  const stories: Story[] = [];
  for (const row of rows) {
    const media = row.attachments?.[0];
    // A story row with no attachment cannot happen through createStory, but
    // media is a separate insert, so a half-written row is possible if that
    // second insert ever fails. Skipping it beats handing the viewer a story
    // with nothing to show.
    if (!media) continue;

    stories.push({
      id: row.id,
      caption: row.content ?? '',
      contentWarning: row.contentWarning,
      publishedAt: (row.published ?? row.createdAt).toISOString(),
      expiresAt: (row.expiresAt as Date).toISOString(),
      media: {
        id: media.id,
        type: media.type,
        mediaType: media.mediaType,
        url: media.url,
        name: media.name,
      },
      // The author is never shown an unwatched ring on their own stories.
      seen: isOwner || seenIds.has(row.id),
      viewCount: isOwner ? (viewCounts.get(row.id) ?? 0) : null,
    });
  }

  return {
    actor: {
      id: actor.id,
      username: actor.username,
      displayName: actor.name,
      iconUrl: actor.iconUrl,
    },
    stories,
    hasUnseen: stories.some((s) => !s.seen),
    isOwner,
  };
}

/**
 * Record that someone watched a story.
 *
 * Idempotent via the unique index on (status_id, viewer_actor_id): the viewer
 * fires this on every advance, including when they tap back through, so it has
 * to be safe to call repeatedly. ON CONFLICT DO NOTHING keeps the original
 * viewedAt, which is the timestamp the author cares about.
 *
 * Authors watching their own story are not recorded -- their own view in the
 * viewer list is noise.
 */
export async function markStoryViewed(
  statusId: string,
  viewerActorId: string
): Promise<{ success: boolean; error?: string }> {
  const story = await db.query.socialStatuses.findFirst({
    where: and(
      eq(socialStatuses.id, statusId),
      eq(socialStatuses.type, STATUS_TYPE_STORY),
      sql`${socialStatuses.expiresAt} > NOW()`
    ),
    columns: { id: true, actorId: true },
  });

  if (!story) {
    return { success: false, error: 'Story not found' };
  }

  if (story.actorId === viewerActorId) {
    return { success: true };
  }

  await db
    .insert(socialStoryViews)
    .values({ statusId, viewerActorId })
    .onConflictDoNothing();

  return { success: true };
}

/**
 * Who watched a story. Author only.
 */
export async function getStoryViewers(
  statusId: string,
  requestingActorId: string
): Promise<{
  success: boolean;
  viewers?: Array<{
    actor: {
      id: string;
      username: string;
      displayName: string | null;
      iconUrl: string | null;
    };
    viewedAt: string;
  }>;
  error?: string;
}> {
  const story = await db.query.socialStatuses.findFirst({
    where: and(
      eq(socialStatuses.id, statusId),
      eq(socialStatuses.type, STATUS_TYPE_STORY)
    ),
    columns: { id: true, actorId: true },
  });

  if (!story) {
    return { success: false, error: 'Story not found' };
  }

  if (story.actorId !== requestingActorId) {
    return { success: false, error: 'Not authorized' };
  }

  const rows = await db
    .select({
      id: socialActors.id,
      username: socialActors.username,
      displayName: socialActors.name,
      iconUrl: socialActors.iconUrl,
      viewedAt: socialStoryViews.viewedAt,
    })
    .from(socialStoryViews)
    .innerJoin(
      socialActors,
      eq(socialActors.id, socialStoryViews.viewerActorId)
    )
    .where(eq(socialStoryViews.statusId, statusId))
    .orderBy(sql`${socialStoryViews.viewedAt} DESC`);

  return {
    success: true,
    viewers: rows.map((r) => ({
      actor: {
        id: r.id,
        username: r.username,
        displayName: r.displayName,
        iconUrl: r.iconUrl,
      },
      viewedAt: r.viewedAt.toISOString(),
    })),
  };
}

/**
 * Delete a story before it expires. Author only.
 *
 * The view rows go with it through the FK cascade. The R2 object does not:
 * this deletes the row while the media stays in the bucket. That is not a
 * leak any more but it is a delay -- the hourly purge in lib/jobs/
 * purge-expired.ts only sweeps rows it can still see, so media orphaned by an
 * early delete is invisible to it.
 *
 * Left this way deliberately. Reclaiming inline would put a network call to
 * R2 inside a user-facing delete, where a slow or failing bucket turns a
 * button press into a hang or a false error, and the row would have to be
 * kept on failure to stay sweepable. The cost of not doing it is bounded:
 * only stories deleted early, only until someone extends the purge to sweep
 * attachments with no status.
 */
export async function deleteStory(
  statusId: string,
  actorId: string
): Promise<{ success: boolean; error?: string }> {
  const story = await db.query.socialStatuses.findFirst({
    where: and(
      eq(socialStatuses.id, statusId),
      eq(socialStatuses.type, STATUS_TYPE_STORY)
    ),
    columns: { id: true, actorId: true },
  });

  if (!story) {
    return { success: false, error: 'Story not found' };
  }

  if (story.actorId !== actorId) {
    return { success: false, error: 'Not authorized to delete this story' };
  }

  await db.delete(socialStatuses).where(eq(socialStatuses.id, statusId));

  return { success: true };
}

export const STORY_LIMITS = {
  lifetimeHours: STORY_LIFETIME_HOURS,
  maxActive: MAX_ACTIVE_STORIES,
  maxCaptionLength: MAX_CAPTION_LENGTH,
} as const;
