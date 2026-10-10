/**
 * Telling people what happened to their membership.
 *
 * Phase 9 built the actions; this is the half that lets anyone find out they
 * happened. Before it, being approved, promoted, removed or banned were all
 * silent -- you discovered them by going and looking at a page that had
 * quietly changed.
 *
 * Three things make this awkward enough to deserve its own module rather than
 * a few inline calls:
 *
 *  1. Notifications are addressed to a User id. Everything in the group layer
 *     is a social actor id. The two are joined through profiles, and plenty of
 *     actors have no user at the other end -- see `userIdsForActors`.
 *  2. Nothing here may break the action it reports on. The moderation already
 *     succeeded and is committed by the time we are called; a failure to post
 *     a notification must not turn that into an error the caller sees, or
 *     worse, a 500 after the member has already been banned. Every export
 *     swallows its own failures.
 *  3. Who hears about it varies. Five of the six land on one person -- the one
 *     it happened to. The sixth lands on every leader, because a join request
 *     is addressed to whoever is in a position to answer it.
 *
 * Unban is deliberately absent. Telling someone they have been unbanned means
 * telling them they were banned, which they may never have noticed, and a
 * notification is a strange way to learn it. The ban itself is announced; its
 * reversal just quietly restores their ability to ask again.
 *
 * @see lib/federation/wrappers/group-moderation.ts  the actions these report
 * @see lib/notifications.ts                         createNotification, block gating
 * @see docs/GROUPS-ROADMAP.md
 */

import { db } from '@/lib/db';
import {
  profiles,
  socialActors,
  socialGroupMembers,
  socialGroups,
} from '@/lib/schema';
import type { SocialGroupRole } from '@/lib/schema';
import { and, eq, inArray, ne } from 'drizzle-orm';
import {
  createNotification,
  createNotificationsForTargets,
} from '@/lib/notifications';

/** Display data every notification needs, read once per call. */
interface GroupRef {
  id: string;
  name: string;
  handle: string;
}

/**
 * Map social actor ids to the User ids notifications are addressed to.
 *
 * Returns a Map rather than an array so callers can look up a specific actor
 * without caring about ordering, and so a missing actor is simply an absent
 * key instead of a hole in a positional result.
 *
 * Actors drop out of the result when they have no local user, which is normal
 * rather than exceptional:
 *
 *   - A group is itself an actor, and has no profile.
 *   - Remote actors are stored here too and have no local profile.
 *   - profile_id is ON DELETE SET NULL, so a deleted profile leaves the actor
 *     row behind pointing at nobody.
 *
 * All three mean the same thing to a caller: there is no bell to ring. Silence
 * is the correct outcome, not an error.
 */
async function userIdsForActors(
  actorIds: string[]
): Promise<Map<string, string>> {
  if (actorIds.length === 0) return new Map();

  const rows = await db
    .select({ actorId: socialActors.id, userId: profiles.userId })
    .from(socialActors)
    .innerJoin(profiles, eq(socialActors.profileId, profiles.id))
    .where(inArray(socialActors.id, actorIds));

  return new Map(
    rows.filter((r) => r.userId).map((r) => [r.actorId, r.userId as string])
  );
}

/**
 * The group's name and handle.
 *
 * Both live on the group's actor rather than the group row -- a group is an
 * actor, so its display name is `social_actors.name` and its handle is
 * `social_actors.username`, which is what /g/[handle] resolves. The group row
 * holds only what is specific to being a group: topics, rules, join policy.
 *
 * Falls back to the handle when the actor has no display name, since the name
 * is nullable and a notification reading `joined ""` helps nobody.
 */
async function groupRef(groupId: string): Promise<GroupRef | null> {
  const [row] = await db
    .select({
      id: socialGroups.id,
      name: socialActors.name,
      handle: socialActors.username,
    })
    .from(socialGroups)
    .innerJoin(socialActors, eq(socialGroups.actorId, socialActors.id))
    .where(eq(socialGroups.id, groupId))
    .limit(1);

  if (!row?.handle) return null;

  return { id: row.id, name: row.name || row.handle, handle: row.handle };
}

/**
 * Post one notification about a group, to one person.
 *
 * The single place every export below funnels through, which makes the two
 * rules that apply to all of them impossible to forget: never notify someone
 * about their own action, and never let a failure here escape.
 *
 * Self-notification needs catching explicitly because createNotification does
 * not do it -- its block check returns early for a self-pair, which answers
 * "is this blocked" correctly and says nothing about whether the row should
 * exist. It matters for exactly one action: an admin may change their own
 * role, and "You are no longer an admin" is a strange thing to be told by
 * yourself.
 */
async function notifyOne(params: {
  type: 'Join' | 'Accept' | 'Reject' | 'Update' | 'Remove' | 'Block';
  actorUserId: string;
  targetUserId: string;
  group: GroupRef;
  message?: string;
  url?: string;
}): Promise<void> {
  if (params.actorUserId === params.targetUserId) return;

  try {
    await createNotification({
      type: params.type,
      actorId: params.actorUserId,
      targetId: params.targetUserId,
      context: 'group_membership',
      // The id rather than the handle: a handle can be changed, and a
      // notification should still point at the same group afterwards. The
      // navigable form lives in objectUrl.
      objectId: params.group.id,
      objectType: 'group',
      objectTitle: params.group.name,
      objectUrl: params.url ?? `/g/${params.group.handle}`,
      message: params.message,
    });
  } catch (error) {
    // The moderation already committed. Losing the notification is a smaller
    // problem than reporting failure for something that demonstrably worked.
    console.error('[group-notify] failed to notify', {
      type: params.type,
      group: params.group.handle,
      error,
    });
  }
}

/**
 * Resolve both sides and the group in one go.
 *
 * Returns null when any piece is missing, which collapses "the group went
 * away", "the actor has no user" and "the target has no user" into the single
 * answer every caller wants: nothing to send.
 */
async function pair(
  groupId: string,
  actorId: string,
  targetActorId: string
): Promise<{
  group: GroupRef;
  actorUserId: string;
  targetUserId: string;
} | null> {
  const [group, users] = await Promise.all([
    groupRef(groupId),
    userIdsForActors([actorId, targetActorId]),
  ]);

  const actorUserId = users.get(actorId);
  const targetUserId = users.get(targetActorId);

  if (!group || !actorUserId || !targetUserId) return null;

  return { group, actorUserId, targetUserId };
}

/**
 * Someone asked to join. Tell everyone who can answer.
 *
 * Goes to every active admin and moderator, because the pending queue is
 * actionable by all of them and none of them is more responsible than the
 * others. In a group with several leaders this writes several rows, which is
 * the intended cost: a request nobody is told about is a request nobody
 * answers, and that is precisely what made the `request` join policy
 * unusable before.
 *
 * Links to the members page rather than the group, since that is where the
 * queue is and a notification that does not take you to the thing it is about
 * makes you go looking for it.
 */
export async function notifyJoinRequested(
  groupId: string,
  requesterActorId: string
): Promise<void> {
  try {
    const group = await groupRef(groupId);
    if (!group) return;

    const leaders = await db
      .select({ actorId: socialGroupMembers.actorId })
      .from(socialGroupMembers)
      .where(
        and(
          eq(socialGroupMembers.groupId, groupId),
          eq(socialGroupMembers.status, 'active'),
          inArray(socialGroupMembers.role, ['admin', 'moderator'])
        )
      );

    const ids = leaders.map((l) => l.actorId);
    if (ids.length === 0) return;

    const users = await userIdsForActors([...ids, requesterActorId]);
    const requesterUserId = users.get(requesterActorId);
    if (!requesterUserId) return;

    await Promise.all(
      ids.map((actorId) => {
        const leaderUserId = users.get(actorId);
        if (!leaderUserId) return Promise.resolve();
        return notifyOne({
          type: 'Join',
          actorUserId: requesterUserId,
          targetUserId: leaderUserId,
          group,
          url: `/g/${group.handle}/members`,
        });
      })
    );
  } catch (error) {
    console.error('[group-notify] failed to notify leaders of request', {
      groupId,
      error,
    });
  }
}

/** Their request was approved. */
export async function notifyRequestApproved(
  groupId: string,
  approverActorId: string,
  requesterActorId: string
): Promise<void> {
  const resolved = await pair(groupId, approverActorId, requesterActorId);
  if (!resolved) return;

  await notifyOne({
    type: 'Accept',
    actorUserId: resolved.actorUserId,
    targetUserId: resolved.targetUserId,
    group: resolved.group,
  });
}

/**
 * Their request was declined.
 *
 * Deliberately does not name who declined it. The sentence in
 * getNotificationMessage is written in the passive for this reason: a
 * rejection is the group's answer, and pointing at the individual moderator
 * who clicked invites it to be taken personally.
 */
export async function notifyRequestRejected(
  groupId: string,
  rejecterActorId: string,
  requesterActorId: string
): Promise<void> {
  const resolved = await pair(groupId, rejecterActorId, requesterActorId);
  if (!resolved) return;

  await notifyOne({
    type: 'Reject',
    actorUserId: resolved.actorUserId,
    targetUserId: resolved.targetUserId,
    group: resolved.group,
  });
}

/**
 * Their role changed.
 *
 * The message is written here rather than in getNotificationMessage because
 * gaining and losing a role read differently, and the new role is the only
 * thing needed to say which happened. 'member' is the absence of a role rather
 * than a role you are promoted into, so it gets its own sentence.
 */
export async function notifyRoleChanged(
  groupId: string,
  actorId: string,
  targetActorId: string,
  role: SocialGroupRole
): Promise<void> {
  const resolved = await pair(groupId, actorId, targetActorId);
  if (!resolved) return;

  const message =
    role === 'member'
      ? `You no longer have a role in "${resolved.group.name}"`
      : `You are now ${role === 'admin' ? 'an admin' : 'a moderator'} of "${resolved.group.name}"`;

  await notifyOne({
    type: 'Update',
    actorUserId: resolved.actorUserId,
    targetUserId: resolved.targetUserId,
    group: resolved.group,
    message,
  });
}

/** They were removed from the group. */
export async function notifyRemoved(
  groupId: string,
  actorId: string,
  targetActorId: string
): Promise<void> {
  const resolved = await pair(groupId, actorId, targetActorId);
  if (!resolved) return;

  await notifyOne({
    type: 'Remove',
    actorUserId: resolved.actorUserId,
    targetUserId: resolved.targetUserId,
    group: resolved.group,
  });
}

/** They were banned from the group. */
export async function notifyBanned(
  groupId: string,
  actorId: string,
  targetActorId: string
): Promise<void> {
  const resolved = await pair(groupId, actorId, targetActorId);
  if (!resolved) return;

  await notifyOne({
    type: 'Block',
    actorUserId: resolved.actorUserId,
    targetUserId: resolved.targetUserId,
    group: resolved.group,
  });
}

/*
 * ---------------------------------------------------------------------------
 * Announcements to the whole group
 *
 * Everything above lands on one person, or on the handful of leaders who can
 * answer a join request. The two below land on every active member, which
 * makes them a different kind of thing and worth keeping visibly separate.
 *
 * Two rules apply to both and to anything added beside them:
 *
 *   - Only `active` members. A pending row is somebody still waiting at the
 *     door and a banned row is a tombstone; neither should hear the group's
 *     news. This is the same predicate the members list uses.
 *   - Go through createNotificationsForTargets, never a loop over
 *     createNotification. The per-recipient cost of the single path is fine
 *     for one leader and is hundreds of queries for one group.
 *
 * What is deliberately NOT here: replies, edits, reactions, joins and leaves.
 * A notification that arrives for everything a group does is one people turn
 * off, and turning it off is not currently possible -- there is no per-group
 * mute, so the only way out of a noisy group is to leave it. Until that
 * exists, every addition here should have to argue for itself.
 *
 * @see docs/NOTIFICATIONS-ROADMAP.md  the mute gap, written down
 * ---------------------------------------------------------------------------
 */

/**
 * The user id behind every active member, optionally skipping one actor.
 *
 * Resolved in a single join rather than through userIdsForActors, because the
 * caller here never needs the actor ids themselves -- it needs the audience.
 * Members whose actor has no local user drop out for the same ordinary
 * reasons described on userIdsForActors.
 *
 * excludeActorId skips the person who caused the notification. Leaving them in
 * would also work, since createNotificationsForTargets refuses to notify the
 * sender about themselves, but filtering in SQL means the author of a post in
 * a thousand-member group is not carried through three steps to be dropped at
 * the last one.
 */
async function activeMemberUserIds(
  groupId: string,
  excludeActorId?: string
): Promise<string[]> {
  const conditions = [
    eq(socialGroupMembers.groupId, groupId),
    eq(socialGroupMembers.status, 'active'),
  ];

  if (excludeActorId) {
    conditions.push(ne(socialGroupMembers.actorId, excludeActorId));
  }

  const rows = await db
    .select({ userId: profiles.userId })
    .from(socialGroupMembers)
    .innerJoin(socialActors, eq(socialGroupMembers.actorId, socialActors.id))
    .innerJoin(profiles, eq(socialActors.profileId, profiles.id))
    .where(and(...conditions));

  return rows
    .map((row) => row.userId)
    .filter((id): id is string => Boolean(id));
}

/**
 * Somebody posted in the group. Tell the other members.
 *
 * Top-level posts only -- the caller is responsible for not calling this for a
 * reply, and does so by checking inReplyToId. The distinction is the whole
 * difference between a group that is worth having notifications for and one
 * where a single busy thread rings everybody a dozen times in an afternoon.
 *
 * Points at the group rather than the individual post. A post is read in the
 * context of the feed it is in, the feed is where the next one will be too,
 * and the group handle survives in a way that makes the link stable.
 */
export async function notifyGroupPosted(
  groupId: string,
  authorActorId: string,
  authorUserId: string
): Promise<void> {
  try {
    const [group, memberUserIds] = await Promise.all([
      groupRef(groupId),
      activeMemberUserIds(groupId, authorActorId),
    ]);

    if (!group || memberUserIds.length === 0) return;

    await createNotificationsForTargets({
      type: 'Create',
      actorId: authorUserId,
      targetIds: memberUserIds,
      context: 'group',
      objectId: group.id,
      objectType: 'group',
      objectTitle: group.name,
      objectUrl: `/g/${group.handle}`,
    });
  } catch (error) {
    // The post is already written and visible in the feed. Failing the request
    // now would tell the author their post did not happen, which is worse than
    // a quiet group.
    console.error('[group-notify] failed to announce post', {
      groupId,
      error,
    });
  }
}

/**
 * A group's event went live. Tell the members.
 *
 * Fires on publish rather than on creation, and the difference matters: events
 * are born as drafts, and a draft is visible only to the group's managers. A
 * notification sent at creation would announce something most of its audience
 * could not open.
 *
 * The message is written here rather than left to getNotificationMessage
 * because that sentence names the actor as the host, and for a group event the
 * host is the group -- not the admin who happened to press the button. Putting
 * their name on it credits the wrong party, exactly as the publish route
 * already avoids doing for the Nostr mirror.
 *
 * Unlisted events still notify. Unlisted governs whether the event leaves
 * pana.social, not whether the group it belongs to may hear about it; members
 * are the intended audience either way.
 */
export async function notifyGroupEventPublished(params: {
  groupId: string;
  publisherUserId: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
}): Promise<void> {
  try {
    const [group, memberUserIds] = await Promise.all([
      groupRef(params.groupId),
      activeMemberUserIds(params.groupId),
    ]);

    if (!group || memberUserIds.length === 0) return;

    await createNotificationsForTargets({
      type: 'Create',
      actorId: params.publisherUserId,
      targetIds: memberUserIds,
      context: 'event',
      objectId: params.eventId,
      objectType: 'event',
      objectTitle: params.eventTitle,
      objectUrl: `/e/${params.eventSlug}`,
      message: `New event in "${group.name}": "${params.eventTitle}"`,
    });
  } catch (error) {
    // Same reasoning as the post announcement: the event is published and
    // mirrored by now, and a failure here must not report otherwise.
    console.error('[group-notify] failed to announce event', {
      groupId: params.groupId,
      error,
    });
  }
}
