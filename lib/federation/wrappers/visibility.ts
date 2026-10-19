import { socialStatuses } from '@/lib/schema';
import { and, eq, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { visibleGroupStatuses } from './group-visibility';

export const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';

export function jsonbArrayContains(
  column: SQL<unknown> | { getSQL(): SQL<unknown> },
  value: string
) {
  return sql`${column} @> to_jsonb(${value}::text)`;
}

export function notExpired() {
  return sql`(${socialStatuses.expiresAt} IS NULL OR ${socialStatuses.expiresAt} > NOW())`;
}

export function isPublicStatus(): SQL {
  return or(
    jsonbArrayContains(socialStatuses.recipientTo, PUBLIC),
    jsonbArrayContains(socialStatuses.recipientCc, PUBLIC)
  )!;
}

/** Personal-post addressing only; group reads must use readableStatus below. */
export function visibleTo(viewerActorId?: string): SQL {
  if (!viewerActorId) return isPublicStatus();

  const addressedToViewer = sql`EXISTS (
    SELECT 1 FROM social_actors viewer
    WHERE viewer.id = ${viewerActorId}
      AND (${socialStatuses.recipientTo} @> to_jsonb(viewer.uri)
        OR ${socialStatuses.recipientCc} @> to_jsonb(viewer.uri))
  )`;

  // Following the author grants only their followers-addressed posts, not DMs.
  const followersOnly = sql`EXISTS (
    SELECT 1 FROM social_actors author
    JOIN social_follows f
      ON f.target_actor_id = author.id
     AND f.actor_id = ${viewerActorId}
     AND f.status = 'accepted'
    WHERE author.id = ${socialStatuses.actorId}
      AND (${socialStatuses.recipientTo} @> to_jsonb(author.followers_url)
        OR ${socialStatuses.recipientCc} @> to_jsonb(author.followers_url))
  )`;

  return or(
    isPublicStatus(),
    eq(socialStatuses.actorId, viewerActorId),
    addressedToViewer,
    followersOnly
  )!;
}

/**
 * Group membership replaces personal addressing; it is never an OR escape
 * from the group gate, even for a publicly addressed post or its author.
 * Expiry remains a separate policy at the read path.
 */
export function readableStatus(
  viewerActorId?: string,
  viewerGroupIds: string[] = []
): SQL {
  return and(
    visibleGroupStatuses(viewerGroupIds),
    or(isNotNull(socialStatuses.groupId), visibleTo(viewerActorId))
  )!;
}
