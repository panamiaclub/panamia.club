import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { socialGroupMembers } from '@/lib/schema';
import { getDmStream, notifyGroupChatEvent } from '@/lib/dm-stream';
import type { GroupChatEvent } from '@/lib/chat';

/**
 * Membership is read after the write commits, never cached in the mailbox.
 * Extra targets are used only for membership changes: a removed member must
 * invalidate their old room, but must not receive later message activity.
 */
export async function notifyGroupChat(
  groupId: string,
  event: Pick<GroupChatEvent, 'kind' | 'messageId'>,
  extraActorIds: string[] = []
): Promise<number> {
  if (!getDmStream()) return 0;
  try {
    const members = await db
      .select({ actorId: socialGroupMembers.actorId })
      .from(socialGroupMembers)
      .where(
        and(
          eq(socialGroupMembers.groupId, groupId),
          eq(socialGroupMembers.status, 'active')
        )
      );
    return await notifyGroupChatEvent(
      [...members.map((member) => member.actorId), ...extraActorIds],
      { groupId, ...event }
    );
  } catch (error) {
    // Persistence already succeeded. Polling remains the fallback.
    console.error('[group-chat] notification failed', groupId, error);
    return 0;
  }
}
