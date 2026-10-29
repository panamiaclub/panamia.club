/**
 * Group Deletion
 *
 * Deleting a group is the one irreversible thing an admin can do, and it
 * destroys other people's writing. Every choice below follows from that.
 *
 * **It shows you the damage first.** `getGroupDeletionSummary` exists so the
 * confirmation screen can say "this deletes 46 posts by 12 panas and cancels
 * 2 upcoming events" instead of "are you sure?". The counts are the whole
 * point: the person clicking is usually not the person who loses the most.
 *
 * **Member posts go with the group.** `social_statuses.group_id` cascades, and
 * we keep it that way. A post written into a group is addressed to that group;
 * orphaning it would leave posts visible to an audience that no longer exists,
 * with no page to read them on.
 *
 * **Events are deleted, not reassigned.** `events.host_group_id` is
 * ON DELETE RESTRICT, so the group cannot be removed while it hosts anything
 * -- deleting the events first is what clears the way, which is why no
 * migration is needed here. Reassigning was considered and rejected: the
 * `events_single_host` CHECK means a cancelled event still needs exactly one
 * host, and there is no honest candidate. Handing them to the deleting admin
 * makes them personally responsible for gatherings they just dissolved.
 *
 * **Attendees are not notified, and that is a decision rather than a gap.**
 * `event_attendees` cascades from the event, so people holding an RSVP to a
 * dissolved gathering are told nothing by this system. Four things make that
 * acceptable. The confirmation screen names the number of upcoming events
 * being cancelled and states outright that "anyone going will not be
 * notified", so the admin is told what their click costs before it costs it.
 * That same screen points at the escape hatch -- an event worth keeping can
 * be transferred to a person or another group from its manage page first, so
 * nothing forces a cancellation. A notification would link to a group page
 * and an event page that both stopped existing in the same transaction, which
 * is worse than silence. And the people who organise a gathering generally
 * have a way to reach the people coming to it -- that conversation belongs to
 * them, not to a system message. Revisit this only if group deletion stops
 * being rare.
 *
 * **The handle stays retired.** We write a `screenname_history` row keyed by
 * the group's actor id, for the same reason account deletion keeps one: remote
 * servers and old links cached that identity, and letting someone else pick it
 * up turns every stale reference into an impersonation.
 *
 * Mirrors lib/server/delete-account.ts, which is the established shape for
 * this kind of teardown.
 */

import { db } from '@/lib/db';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  socialActors,
  socialGroups,
  socialGroupMembers,
  socialGroupChatMessages,
  socialStatuses,
  socialFollows,
  socialLikes,
  socialAttachments,
  socialTags,
  articleAnnouncements,
  screennameHistory,
  events,
} from '@/lib/schema';
import { signedHeaders } from '@/lib/federation/crypto/sign';
import { notifyGroupChat } from '@/lib/group-chat-notify';

export interface GroupDeletionSummary {
  groupId: string;
  handle: string;
  name: string;
  /** Posts written into the group by anyone, including the group itself. */
  memberPosts: number;
  /** How many distinct panas wrote them -- the human cost, not the row count. */
  memberPostAuthors: number;
  chatMessages: number;
  activeMembers: number;
  upcomingEvents: number;
  pastEvents: number;
}

export interface DeleteGroupResult {
  success: boolean;
  error?: string;
  deleted: Record<string, number>;
  warnings: string[];
}

/**
 * What deleting this group would destroy.
 *
 * Read-only, and deliberately cheap enough to run on the settings page rather
 * than only behind the confirm button -- the numbers should be visible while
 * someone is still deciding.
 */
export async function getGroupDeletionSummary(
  groupId: string
): Promise<GroupDeletionSummary | null> {
  const group = await db.query.socialGroups.findFirst({
    where: eq(socialGroups.id, groupId),
    columns: { id: true },
    // The display name lives on the actor, not the group row -- a group is an
    // actor, so it carries its name the same way a person does.
    with: { actor: { columns: { username: true, name: true } } },
  });
  if (!group) return null;

  const now = new Date();

  const [posts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      authors: sql<number>`count(distinct ${socialStatuses.actorId})::int`,
    })
    .from(socialStatuses)
    .where(eq(socialStatuses.groupId, groupId));

  const [members] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.status, 'active')
      )
    );

  const [upcoming] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(events)
    .where(and(eq(events.hostGroupId, groupId), gt(events.startsAt, now)));

  const [all] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(events)
    .where(eq(events.hostGroupId, groupId));

  const upcomingCount = upcoming?.total ?? 0;
  const [chat] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(socialGroupChatMessages)
    .where(eq(socialGroupChatMessages.groupId, groupId));

  return {
    groupId: group.id,
    handle: group.actor?.username ?? '',
    name: group.actor?.name ?? '',
    memberPosts: posts?.total ?? 0,
    memberPostAuthors: posts?.authors ?? 0,
    chatMessages: chat?.total ?? 0,
    activeMembers: members?.total ?? 0,
    upcomingEvents: upcomingCount,
    pastEvents: (all?.total ?? 0) - upcomingCount,
  };
}

/**
 * Permanently delete a group.
 *
 * Authorization is the caller's job; this executes. The DB work runs in one
 * transaction so a half-deleted group is not a reachable state, and federation
 * is told afterwards so we only announce what actually happened.
 */
export async function deleteGroup(groupId: string): Promise<DeleteGroupResult> {
  const deleted: Record<string, number> = {};
  const warnings: string[] = [];

  const group = await db.query.socialGroups.findFirst({
    where: eq(socialGroups.id, groupId),
    columns: { id: true, actorId: true },
    with: {
      actor: {
        columns: {
          id: true,
          uri: true,
          username: true,
          privateKey: true,
          publicKey: true,
        },
      },
    },
  });

  if (!group?.actor) {
    return {
      success: false,
      error: 'Group not found',
      deleted,
      warnings,
    };
  }

  const actor = group.actor;
  const chatMembers = await db
    .select({ actorId: socialGroupMembers.actorId })
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.status, 'active')
      )
    );

  // Captured before the delete, because after it there is no actor to sign
  // with and no follower rows to read.
  const followers = await db.query.socialFollows
    .findMany({
      where: eq(socialFollows.targetActorId, actor.id),
      with: { actor: { columns: { inboxUrl: true, sharedInboxUrl: true } } },
    })
    .catch(() => []);

  try {
    await db.transaction(async (tx) => {
      const [chat] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(socialGroupChatMessages)
        .where(eq(socialGroupChatMessages.groupId, groupId));
      deleted.chatMessages = chat?.total ?? 0;
      // 1. Events. RESTRICT means these must go before the group, and the
      //    single-host CHECK means they cannot be orphaned instead. Attendees
      //    cascade from here; statuses about an event SET NULL and survive.
      const hostedEvents = await tx
        .delete(events)
        .where(eq(events.hostGroupId, groupId))
        .returning({ id: events.id });
      deleted.events = hostedEvents.length;

      // 2. The group's own posts. Distinct from member posts: those are keyed
      //    by group_id and cascade, these are keyed by actor_id and do not.
      const ownStatuses = await tx
        .select({ id: socialStatuses.id })
        .from(socialStatuses)
        .where(eq(socialStatuses.actorId, actor.id));
      const ownStatusIds = ownStatuses.map((s) => s.id);

      if (ownStatusIds.length > 0) {
        await tx
          .delete(socialAttachments)
          .where(inArray(socialAttachments.statusId, ownStatusIds));
        await tx
          .delete(socialTags)
          .where(inArray(socialTags.statusId, ownStatusIds));
        // Likes other people left on the group's posts.
        await tx
          .delete(socialLikes)
          .where(inArray(socialLikes.statusId, ownStatusIds));
      }

      // 3. Everything hanging off the actor that has no cascade of its own.
      await tx.delete(socialLikes).where(eq(socialLikes.actorId, actor.id));
      await tx.delete(socialFollows).where(eq(socialFollows.actorId, actor.id));
      await tx
        .delete(socialFollows)
        .where(eq(socialFollows.targetActorId, actor.id));
      await tx
        .delete(articleAnnouncements)
        .where(eq(articleAnnouncements.actorId, actor.id));

      if (ownStatusIds.length > 0) {
        const removed = await tx
          .delete(socialStatuses)
          .where(inArray(socialStatuses.id, ownStatusIds))
          .returning({ id: socialStatuses.id });
        deleted.groupStatuses = removed.length;
      }

      // 4. Retire the handle before the actor goes, so the id we key it by is
      //    still readable and a crash cannot leave the name claimable.
      if (actor.username) {
        await tx
          .insert(screennameHistory)
          .values({ screenname: actor.username, userId: actor.id })
          .onConflictDoNothing();
      }

      // 5. The actor. Cascades to the group, which cascades to memberships and
      //    to every post written into it.
      await tx.delete(socialActors).where(eq(socialActors.id, actor.id));
      deleted.group = 1;
    });
  } catch (error) {
    console.error('delete-group:transaction:error', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete group',
      deleted,
      warnings,
    };
  }

  await notifyGroupChat(
    groupId,
    { kind: 'membership' },
    chatMembers.map((member) => member.actorId)
  );

  // Federation, best-effort and after the fact. A group that only ever had
  // local members has no inboxes here and this is a no-op.
  if (actor.privateKey && actor.uri) {
    const deleteActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${actor.uri}#delete`,
      type: 'Delete',
      actor: actor.uri,
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      object: actor.uri,
    };

    const inboxes = new Set<string>();
    for (const f of followers) {
      const inbox = f.actor?.sharedInboxUrl ?? f.actor?.inboxUrl;
      if (inbox) inboxes.add(inbox);
    }

    for (const inboxUrl of inboxes) {
      try {
        const headers = signedHeaders(actor, 'post', inboxUrl, deleteActivity);
        await fetch(inboxUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(deleteActivity),
        });
      } catch {
        // Per-inbox failures are normal and not worth a warning each.
      }
    }
  }

  return { success: true, deleted, warnings };
}
