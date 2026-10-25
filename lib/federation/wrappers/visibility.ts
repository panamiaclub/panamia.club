import { socialStatuses } from '@/lib/schema';
import { and, eq, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { visibleGroupStatuses } from './group-visibility';
import { STATUS_TYPE_PANAS } from '@/lib/utils/getVisibility';

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
  return and(
    notPanasStatus(),
    or(
      jsonbArrayContains(socialStatuses.recipientTo, PUBLIC),
      jsonbArrayContains(socialStatuses.recipientCc, PUBLIC)
    )
  )!;
}

export function notPanasStatus(): SQL {
  return sql`${socialStatuses.type} IS DISTINCT FROM ${STATUS_TYPE_PANAS}`;
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

  // The cc actor owns the original circle; replies retain that same owner and
  // recipient snapshot instead of sharing the thread with the replier's circle.
  const mutualRecipients = sql`EXISTS (
    SELECT 1 FROM social_actors viewer, social_actors owner
    WHERE viewer.id = ${viewerActorId}
      AND owner.uri = ${socialStatuses.recipientCc}->>0
      AND (
        owner.id = viewer.id
        OR (
          ${socialStatuses.recipientTo} @> to_jsonb(viewer.uri)
          AND EXISTS (
            SELECT 1 FROM social_follows outgoing
            JOIN social_follows incoming
              ON incoming.actor_id = outgoing.target_actor_id
             AND incoming.target_actor_id = outgoing.actor_id
             AND incoming.status = 'accepted'
            WHERE outgoing.actor_id = owner.id
              AND outgoing.target_actor_id = viewer.id
              AND outgoing.status = 'accepted'
          )
        )
      )
  )`;

  return or(
    eq(socialStatuses.actorId, viewerActorId),
    and(
      notPanasStatus(),
      or(isPublicStatus(), addressedToViewer, followersOnly)
    ),
    and(eq(socialStatuses.type, STATUS_TYPE_PANAS), mutualRecipients)
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
