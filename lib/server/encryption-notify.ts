import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  chatE2eeDmParticipants,
  chatE2eeEvents,
  chatE2eeRooms,
  socialGroupMembers,
  profiles,
  profileOwners,
  socialActors,
} from '@/lib/schema';
import { getDmStream, notifyEncryptedChatEvent } from '@/lib/dm-stream';
import { evaluateDirectThreads } from '@/lib/federation/wrappers/dm-gate';
import {
  getHiddenActorIds,
  isBlockedEitherWay,
} from '@/lib/federation/wrappers/block-filter';

/** Best-effort invalidation after commit; no body, file metadata or keys. */
export async function invalidateEncryptedRoom(
  roomId: string,
  eventId: string,
  kind: 'message' | 'membership' | 'delete'
) {
  if (!getDmStream()) return;
  try {
    const [event] = await db
      .select({ author: chatE2eeEvents.senderActorId })
      .from(chatE2eeEvents)
      .where(
        and(eq(chatE2eeEvents.id, eventId), eq(chatE2eeEvents.roomId, roomId))
      );
    const [room] = await db
      .select({ kind: chatE2eeRooms.kind, groupId: chatE2eeRooms.groupId })
      .from(chatE2eeRooms)
      .where(eq(chatE2eeRooms.id, roomId));
    if (!room || !event) return;
    const candidates =
      room.kind === 'dm'
        ? await db
            .select({ actorId: chatE2eeDmParticipants.actorId })
            .from(chatE2eeDmParticipants)
            .where(eq(chatE2eeDmParticipants.roomId, roomId))
        : await db
            .select({ actorId: socialGroupMembers.actorId })
            .from(socialGroupMembers)
            .where(
              and(
                eq(socialGroupMembers.groupId, room.groupId!),
                eq(socialGroupMembers.status, 'active')
              )
            );
    const recipients: string[] = [];
    for (const { actorId } of candidates) {
      if (actorId === event.author) {
        recipients.push(actorId);
        continue;
      }
      if (room.kind === 'dm') {
        if (await isBlockedEitherWay(event.author, actorId)) continue;
        const [decision] = await evaluateDirectThreads(event.author, [actorId]);
        if (decision?.decision !== 'allow') continue;
      } else if (
        kind === 'message' &&
        (await getHiddenActorIds(actorId)).includes(event.author)
      )
        continue;
      recipients.push(actorId);
    }
    if (!recipients.length) return;
    const identities = await db
      .select({
        actorId: socialActors.id,
        profileId: profiles.id,
        userId: profiles.userId,
      })
      .from(socialActors)
      .innerJoin(profiles, eq(profiles.id, socialActors.profileId))
      .where(inArray(socialActors.id, recipients));
    const grants = identities.length
      ? await db
          .select({
            profileId: profileOwners.profileId,
            userId: profileOwners.userId,
          })
          .from(profileOwners)
          .where(
            inArray(
              profileOwners.profileId,
              identities.map((entry) => entry.profileId)
            )
          )
      : [];
    await notifyEncryptedChatEvent(
      identities.map((entry) => ({
        actorId: entry.actorId,
        authorizedUserIds: [
          ...new Set([
            ...(entry.userId ? [entry.userId] : []),
            ...grants
              .filter((grant) => grant.profileId === entry.profileId)
              .map((grant) => grant.userId),
          ]),
        ],
      })),
      { roomId, kind }
    );
  } catch (error) {
    console.error('[encrypted-chat] mailbox invalidation failed', {
      error: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}
