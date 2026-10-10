/**
 * Notification Helper Functions
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/notifications/
 * See: lib/activities/actions/ for comparable patterns
 *
 * This module provides functions to create, query, and manage notifications
 * using an ActivityPub-shaped schema for future federation compatibility.
 *
 * Storage: PostgreSQL via Drizzle ORM
 * Actor info: Fetched from PostgreSQL profile (denormalized at creation time)
 */

import { db } from '@/lib/db';
import { profiles, notifications, socialActors } from '@/lib/schema';
import type {
  NotificationActivityType,
  NotificationContext,
} from './interfaces';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import {
  isBlockedEitherWay,
  filterBlockedActorIds,
} from './federation/wrappers/block-filter';

// Retention periods in milliseconds
const RETENTION = {
  INDEFINITE: null,
  DAYS_30: 30 * 24 * 60 * 60 * 1000,
  DAYS_90: 90 * 24 * 60 * 60 * 1000,
};

export interface CreateNotificationParams {
  type: NotificationActivityType;
  actorId: string; // PostgreSQL User.id who triggered this
  targetId: string; // PostgreSQL User.id who receives this
  context: NotificationContext;
  objectId?: string; // MongoDB ObjectId as string (article, session, etc.)
  objectType?:
    'article' | 'profile' | 'session' | 'comment' | 'event' | 'venue' | 'group';
  objectTitle?: string;
  objectUrl?: string;
  message?: string; // Personal message (invitation text)
}

/**
 * Whether a block stands between the two people in a notification.
 *
 * Notifications are keyed by User id and blocks are between social actors, so
 * this resolves both sides through profiles in a single query rather than two
 * round trips.
 *
 * Gating here rather than in each caller means every notification type is
 * covered at once — likes, follows, mentions, replies, group invitations and
 * event activity — and a new notification type added later inherits the rule
 * instead of having to remember it. A notification is the one thing a block is
 * most visibly supposed to stop.
 *
 * Fails open: if either side has no actor row (plenty of accounts never touch
 * the social layer) there is no block to find, and ordinary directory
 * notifications must keep working.
 */
async function isBlockedBetweenUsers(
  actorUserId: string,
  targetUserId: string
): Promise<boolean> {
  if (actorUserId === targetUserId) return false;

  const rows = await db
    .select({ actorId: socialActors.id, userId: profiles.userId })
    .from(socialActors)
    .innerJoin(profiles, eq(socialActors.profileId, profiles.id))
    .where(inArray(profiles.userId, [actorUserId, targetUserId]));

  const actorSide = rows.find((r) => r.userId === actorUserId)?.actorId;
  const targetSide = rows.find((r) => r.userId === targetUserId)?.actorId;

  if (!actorSide || !targetSide) return false;

  return isBlockedEitherWay(actorSide, targetSide);
}

/**
 * Create a notification
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/notifications/
 * Maps to ActivityPub Activity creation pattern
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<void> {
  // Silently drop rather than throw. Callers fire notifications as a side
  // effect of an action that already succeeded, and a block is not an error
  // condition — the like or the reply still happened, it just does not get to
  // ring the other person's bell.
  if (await isBlockedBetweenUsers(params.actorId, params.targetId)) {
    return;
  }

  // Get actor info from profile for denormalization
  const actorProfile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, params.actorId),
    with: { user: { columns: { screenname: true } } },
  });

  // Determine expiration based on type and context
  const expiresAt = getExpirationDate(params.type, params.context);

  // Create notification
  await db.insert(notifications).values({
    type: params.type,
    actor: params.actorId,
    target: params.targetId,
    context: params.context,
    object: params.objectId,
    objectType: params.objectType,
    objectTitle: params.objectTitle,
    objectUrl: params.objectUrl,
    message: params.message,
    actorScreenname: actorProfile?.user?.screenname,
    actorName: actorProfile?.name,
    read: false,
    emailSent: false,
    expiresAt,
  });

  // TODO: Check email preferences and send if enabled
  // await maybeSendNotificationEmail(notification);
}

/**
 * One notification, many recipients, a fixed number of queries.
 *
 * createNotification is written for the case it was built for: one person
 * learning about something that happened to them. It spends three queries per
 * call -- a block check, an actor lookup, an insert -- which is the right
 * shape when there is one recipient and the wrong shape when there are two
 * hundred. Announcing a post to a whole group that way would cost six hundred
 * round trips inside a request that the member is waiting on.
 *
 * This does the same work set-at-a-time instead:
 *
 *   1. resolve every user id to its actor in one query
 *   2. ask once which of those actors are blocked
 *   3. look up the sender's denormalized name once, not once per recipient
 *   4. insert every row in a single statement
 *
 * Four queries whether the group has three members or three thousand.
 *
 * The guarantees callers inherit from createNotification are preserved
 * deliberately, because a second way to write this table is a second place for
 * them to be forgotten:
 *
 *   - blocks still stop a notification, in either direction, mutes excluded
 *   - the sender is never notified about their own action, which the
 *     single-recipient path leaves to its callers and this one cannot, since
 *     the sender is usually a member of the group being notified
 *
 * Returns how many rows were written, which is what a caller needs to log
 * something useful about a fan-out that was mostly filtered away.
 */
export async function createNotificationsForTargets(
  params: Omit<CreateNotificationParams, 'targetId'> & { targetIds: string[] }
): Promise<number> {
  // Dedupe before anything else: a person can hold one membership row, but
  // callers assembling recipients from several sources should not have to
  // prove it, and a duplicate here is a duplicate bell.
  const targetIds = [...new Set(params.targetIds)].filter(
    (id) => id && id !== params.actorId
  );
  if (targetIds.length === 0) return 0;

  // Both sides in one round trip. Users with no actor row simply do not
  // appear, which is the same "nothing to find, nothing to block" outcome
  // isBlockedBetweenUsers treats as fail-open.
  const actorRows = await db
    .select({ actorId: socialActors.id, userId: profiles.userId })
    .from(socialActors)
    .innerJoin(profiles, eq(socialActors.profileId, profiles.id))
    .where(inArray(profiles.userId, [params.actorId, ...targetIds]));

  const senderActorId = actorRows.find(
    (r) => r.userId === params.actorId
  )?.actorId;

  let allowedIds = targetIds;

  // No actor for the sender means no blocks can exist against them -- the
  // same fail-open the single path takes for accounts that never touched the
  // social layer.
  if (senderActorId) {
    const actorByUser = new Map<string, string>();
    for (const row of actorRows) {
      if (row.userId && row.userId !== params.actorId) {
        actorByUser.set(row.userId, row.actorId);
      }
    }

    const blockedActorIds = await filterBlockedActorIds(senderActorId, [
      ...actorByUser.values(),
    ]);

    if (blockedActorIds.size > 0) {
      allowedIds = targetIds.filter((userId) => {
        const actorId = actorByUser.get(userId);
        return !actorId || !blockedActorIds.has(actorId);
      });
    }
  }

  if (allowedIds.length === 0) return 0;

  const actorProfile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, params.actorId),
    with: { user: { columns: { screenname: true } } },
  });

  // Identical for every row, so computed once. Taking it per row would also
  // drift the timestamps apart by however long the loop took.
  const expiresAt = getExpirationDate(params.type, params.context);

  await db.insert(notifications).values(
    allowedIds.map((targetId) => ({
      type: params.type,
      actor: params.actorId,
      target: targetId,
      context: params.context,
      object: params.objectId,
      objectType: params.objectType,
      objectTitle: params.objectTitle,
      objectUrl: params.objectUrl,
      message: params.message,
      actorScreenname: actorProfile?.user?.screenname,
      actorName: actorProfile?.name,
      read: false,
      emailSent: false,
      expiresAt,
    }))
  );

  return allowedIds.length;
}

/**
 * Get notifications for a user
 */
export async function getNotifications(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    context?: NotificationContext;
  } = {}
) {
  const { limit = 20, offset = 0, unreadOnly = false, context } = options;

  const conditions = [
    eq(notifications.target, userId),
    ...(unreadOnly ? [eq(notifications.read, false)] : []),
    ...(context ? [eq(notifications.context, context)] : []),
  ];

  const whereClause = and(...conditions);

  const [notificationsList, [{ count }]] = await Promise.all([
    db.query.notifications.findMany({
      where: whereClause,
      orderBy: (n, { desc }) => [desc(n.createdAt)],
      offset,
      limit,
    }),
    db
      .select({ count: sql<string>`count(*)` })
      .from(notifications)
      .where(whereClause),
  ]);

  const total = Number(count);

  return {
    notifications: notificationsList,
    total,
    hasMore: offset + notificationsList.length < total,
  };
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<string>`count(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.target, userId), eq(notifications.read, false))
    );

  return Number(count);
}

/**
 * Mark a notification as read
 */
export async function markAsRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const updated = await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.target, userId)
      )
    )
    .returning({ id: notifications.id });

  return updated.length > 0;
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(and(eq(notifications.target, userId), eq(notifications.read, false)))
    .returning({ id: notifications.id });

  return updated.length;
}

/**
 * Delete a notification (for user-initiated deletion)
 */
export async function deleteNotification(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const deleted = await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.target, userId)
      )
    )
    .returning({ id: notifications.id });

  return deleted.length > 0;
}

/**
 * Clean up expired notifications
 * Call this periodically (e.g., via cron job)
 */
export async function cleanupExpiredNotifications(): Promise<number> {
  const deleted = await db
    .delete(notifications)
    .where(lt(notifications.expiresAt, new Date()))
    .returning({ id: notifications.id });

  return deleted.length;
}

/**
 * Determine notification expiration based on type and context
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/notifications/
 * Retention policy aligned with ActivityPub patterns
 */
function getExpirationDate(
  type: NotificationActivityType,
  context: NotificationContext
): Date | null {
  // Group membership expires after 30 days, every type of it. This sits above
  // the invitation rule deliberately: the membership row is the audit trail
  // here -- who is in the group, who is banned, and since when are all
  // answerable from social_group_members long after the notification has gone.
  // Keeping "your request was declined" pinned to someone's bell forever
  // serves no one.
  if (context === 'group_membership') {
    return new Date(Date.now() + RETENTION.DAYS_30!);
  }

  // Invitations never expire (audit trail)
  if (type === 'Invite' || type === 'Accept' || type === 'Reject') {
    return null;
  }

  // System announcements expire after 30 days
  if (context === 'system') {
    return new Date(Date.now() + RETENTION.DAYS_30!);
  }

  // Article lifecycle expires after 90 days. Only 'article' can still reach
  // this: coauthor and review are retired, so those two arms are unreachable
  // for new rows and stay purely to document what the old ones were given.
  if (context === 'article' || context === 'coauthor' || context === 'review') {
    return new Date(Date.now() + RETENTION.DAYS_90!);
  }

  // Mentoring notifications expire after 90 days. Also unreachable now --
  // mentoring is retired. Kept for the same reason as the arms above.
  if (context === 'mentoring') {
    return new Date(Date.now() + RETENTION.DAYS_90!);
  }

  // Direct messages expire after 30 days (notification only, not the message itself)
  if (context === 'message') {
    return new Date(Date.now() + RETENTION.DAYS_30!);
  }

  // Social (follow, mention) expires after 30 days
  return new Date(Date.now() + RETENTION.DAYS_30!);
}

/**
 * Get human-readable notification message
 */
export function getNotificationMessage(notif: {
  type: NotificationActivityType;
  context: NotificationContext;
  actorScreenname?: string | null;
  actorName?: string | null;
  objectTitle?: string | null;
  message?: string | null;
}): string {
  const actor = notif.actorScreenname || notif.actorName || 'Someone';
  const object = notif.objectTitle || 'content';

  switch (notif.context) {
    // coauthor, review and mentoring are retired -- nothing creates rows with
    // those contexts any more. The cases stay because rows already in the
    // table still have to render, and Invite, Accept and Reject never expire,
    // so these outlive every retention window. Dropping the cases would
    // quietly rewrite someone's history into "Someone performed an action".
    case 'coauthor':
      if (notif.type === 'Invite') {
        return `${actor} invited you to co-author "${object}"`;
      }
      if (notif.type === 'Accept') {
        return `${actor} accepted your co-author invitation for "${object}"`;
      }
      if (notif.type === 'Reject') {
        return `${actor} declined your co-author invitation for "${object}"`;
      }
      break;

    // Retired alongside coauthor -- see the note at the top of the switch.
    case 'review':
      if (notif.type === 'Invite') {
        return `${actor} requested your review of "${object}"`;
      }
      if (notif.type === 'Accept') {
        return `${actor} approved "${object}"`;
      }
      if (notif.type === 'Update') {
        return `${actor} requested revisions to "${object}"`;
      }
      break;

    // Admin moderation only now that publishing no longer notifies: Delete is
    // app/api/admin/articles/[slug]/remove, Create is .../restore. Both tell
    // an author what was done to their piece.
    case 'article':
      if (notif.type === 'Create') {
        return `${actor} published "${object}"`;
      }
      if (notif.type === 'Delete') {
        return `"${object}" was removed`;
      }
      break;

    // Retired alongside coauthor -- see the note at the top of the switch.
    case 'mentoring':
      if (notif.type === 'Invite') {
        return `${actor} requested a mentoring session: "${object}"`;
      }
      if (notif.type === 'Accept') {
        return `${actor} accepted your mentoring session request`;
      }
      if (notif.type === 'Reject') {
        return `${actor} declined your mentoring session request`;
      }
      if (notif.type === 'Delete') {
        return notif.message || `${actor} cancelled the mentoring session`;
      }
      break;

    case 'follow':
      if (notif.type === 'Follow') {
        return `${actor} started following you`;
      }
      break;

    case 'message':
      if (notif.type === 'Create') {
        return `${actor} sent you a voice memo`;
      }
      break;

    case 'system':
      return notif.message || 'System notification';

    case 'group':
      if (notif.type === 'Create') {
        return `${actor} posted in "${object}"`;
      }
      if (notif.type === 'Invite') {
        return `${actor} invited you to the group "${object}"`;
      }
      if (notif.type === 'Accept') {
        return `${actor} joined "${object}"`;
      }
      if (notif.type === 'Reject') {
        return `${actor} declined your invitation to "${object}"`;
      }
      break;

    case 'group_membership':
      // Written from the reader's side. Every one of these lands on the person
      // the thing happened to, except Join, which lands on the group's leaders
      // and so names the person who asked rather than addressing them.
      if (notif.type === 'Join') {
        return `${actor} asked to join "${object}"`;
      }
      if (notif.type === 'Accept') {
        return `Your request to join "${object}" was approved`;
      }
      if (notif.type === 'Reject') {
        return `Your request to join "${object}" was declined`;
      }
      if (notif.type === 'Update') {
        // The specific role change is written at the call site -- "You are now
        // an admin" and "You are no longer a moderator" are different enough
        // sentences that deriving them here would mean passing the old role
        // and the new one just to rebuild what the caller already knew.
        return notif.message || `Your role in "${object}" changed`;
      }
      if (notif.type === 'Remove') {
        return `${actor} removed you from "${object}"`;
      }
      if (notif.type === 'Block') {
        return `${actor} banned you from "${object}"`;
      }
      break;

    case 'event':
      if (notif.type === 'Invite') {
        return `${actor} invited you to co-organize "${object}"`;
      }
      if (notif.type === 'Accept') {
        return `${actor} accepted your organizer invitation for "${object}"`;
      }
      if (notif.type === 'Reject') {
        return `${actor} declined your organizer invitation for "${object}"`;
      }
      if (notif.type === 'Create') {
        // A group's event is hosted by the group, not by the admin who
        // happened to press publish, so that caller writes its own sentence
        // naming the group. Rows without one predate group hosting and still
        // read correctly, which is why this falls back rather than requiring
        // the message.
        return notif.message || `${actor} is hosting a new event: "${object}"`;
      }
      if (notif.type === 'Delete') {
        return notif.message || `"${object}" has been cancelled`;
      }
      if (notif.type === 'Update') {
        return `"${object}" has been updated`;
      }
      break;
  }

  // Fallback
  return notif.message || `${actor} performed an action`;
}
