import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { socialChatReactions } from '@/lib/schema';
import {
  CHAT_REACTIONS,
  type ChatReaction,
  type ChatReactionEmoji,
} from '@/lib/chat';

type Scope = 'direct' | 'group';
type Reader = Pick<typeof db, 'select'>;
type Writer = Pick<typeof db, 'insert' | 'delete'>;
const messageColumn = (scope: Scope) =>
  scope === 'direct'
    ? socialChatReactions.statusId
    : socialChatReactions.groupMessageId;

export function parseChatReaction(
  value: unknown
): { emoji: ChatReactionEmoji | null } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'emoji' || !('emoji' in value))
    return null;
  const emoji = value.emoji;
  if (emoji === null) return { emoji: null };
  const supported = CHAT_REACTIONS.find((reaction) => reaction.emoji === emoji);
  return supported ? { emoji: supported.emoji } : null;
}

/** Call only with message IDs from an authorized transcript. */
export async function readChatReactions(
  scope: Scope,
  messageIds: string[],
  viewerActorId: string,
  hiddenActorIds: string[],
  reader: Reader = db
): Promise<Map<string, ChatReaction[]>> {
  const result = new Map<string, ChatReaction[]>();
  if (!messageIds.length) return result;
  const column = messageColumn(scope);
  const rows = await reader
    .select({
      messageId: column,
      emoji: socialChatReactions.emoji,
      count: sql<number>`count(*)::int`,
      reacted: sql<boolean>`bool_or(${socialChatReactions.actorId} = ${viewerActorId})`,
    })
    .from(socialChatReactions)
    .where(
      and(
        inArray(column, messageIds),
        hiddenActorIds.length
          ? notInArray(socialChatReactions.actorId, hiddenActorIds)
          : undefined
      )
    )
    .groupBy(column, socialChatReactions.emoji);
  for (const { messageId, ...reaction } of rows) {
    if (!messageId) continue;
    const reactions = result.get(messageId) ?? [];
    reactions.push(reaction);
    result.set(messageId, reactions);
  }
  return result;
}

/** The caller must authorize and lock the message before writing. */
export async function writeChatReaction(
  writer: Writer,
  scope: Scope,
  messageId: string,
  actorId: string,
  emoji: ChatReactionEmoji | null
) {
  const column = messageColumn(scope);
  if (emoji === null) {
    await writer
      .delete(socialChatReactions)
      .where(
        and(eq(column, messageId), eq(socialChatReactions.actorId, actorId))
      );
    return;
  }
  await writer
    .insert(socialChatReactions)
    .values({
      actorId,
      emoji,
      ...(scope === 'direct'
        ? { statusId: messageId }
        : { groupMessageId: messageId }),
    })
    .onConflictDoUpdate({
      target: [column, socialChatReactions.actorId],
      set: { emoji },
    });
}
