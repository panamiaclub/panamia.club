import { and, eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { socialActors, socialStatuses, socialDmRequests } from '@/lib/schema';
import {
  groupChatActor as chatActor,
  groupChatResponse as chatResponse,
} from '@/lib/server/group-chat-request';
import {
  parseChatReaction,
  writeChatReaction,
} from '@/lib/server/chat-reactions';
import {
  getDirectConversation,
  getPublicActorById,
  evaluateDirectThreads,
  isBlockedEitherWay,
  socialConfig,
} from '@/lib/federation';
import { isLocalActor } from '@/lib/federation/local-actor';
import { notifyDirectMessage } from '@/lib/dm-stream';
import { DIRECT_THREAD_REFUSED } from '@/lib/dm-refusal';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ actorId: string; messageId: string }> }
) {
  const viewer = await chatActor();
  if ('response' in viewer) return viewer.response;
  const { actorId: counterpartyId, messageId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return chatResponse({ success: false, error: 'Invalid JSON' }, 400);
  }
  const input = parseChatReaction(body);
  if (!input)
    return chatResponse(
      { success: false, error: 'Choose one of the six message reactions.' },
      400
    );
  const counterparty = await getPublicActorById(counterpartyId);
  if (
    !counterparty ||
    counterpartyId === viewer.actorId ||
    !isLocalActor(counterparty, socialConfig.domain) ||
    (await isBlockedEitherWay(viewer.actorId, counterpartyId))
  )
    return chatResponse({ success: false, error: 'Not found' }, 404);
  const [gate] = await evaluateDirectThreads(viewer.actorId, [counterpartyId]);
  if (gate?.decision === 'refuse')
    return chatResponse({ success: false, error: DIRECT_THREAD_REFUSED }, 403);

  const result = await db.transaction(async (tx) => {
    const [writer] = await tx
      .select({ id: socialActors.id })
      .from(socialActors)
      .where(eq(socialActors.id, viewer.actorId))
      .limit(1)
      .for('key share');
    if (!writer)
      return { success: false as const, error: 'Not found', status: 404 };
    const [stored] = await tx
      .select({ id: socialStatuses.id })
      .from(socialStatuses)
      .where(eq(socialStatuses.id, messageId))
      .limit(1)
      .for('update');
    if (!stored)
      return { success: false as const, error: 'Not found', status: 404 };
    // Reuse the transcript's exact audience, expiry and message-type guards,
    // with the target locked so deletion cannot invalidate the authorization.
    const messages = await getDirectConversation(
      viewer.actorId,
      counterpartyId,
      200,
      tx
    );
    if (!messages.some((message) => message.id === messageId))
      return { success: false as const, error: 'Not found', status: 404 };
    const pending = await tx
      .select({ recipientActorId: socialDmRequests.recipientActorId })
      .from(socialDmRequests)
      .where(
        and(
          eq(socialDmRequests.state, 'pending'),
          or(
            and(
              eq(socialDmRequests.senderActorId, viewer.actorId),
              eq(socialDmRequests.recipientActorId, counterpartyId)
            ),
            and(
              eq(socialDmRequests.senderActorId, counterpartyId),
              eq(socialDmRequests.recipientActorId, viewer.actorId)
            )
          )
        )
      );
    if (pending.some((entry) => entry.recipientActorId === viewer.actorId))
      return {
        success: false as const,
        error: 'Accept this request before reacting.',
        status: 403,
      };
    await writeChatReaction(
      tx,
      'direct',
      messageId,
      viewer.actorId,
      input.emoji
    );
    return {
      success: true as const,
      notifyRecipient: !pending.some(
        (entry) => entry.recipientActorId === counterpartyId
      ),
    };
  });
  if (!result.success)
    return chatResponse({ success: false, error: result.error }, result.status);
  await notifyDirectMessage(
    [
      { actorId: viewer.actorId, conversationActorId: counterpartyId },
      ...(result.notifyRecipient
        ? [{ actorId: counterpartyId, conversationActorId: viewer.actorId }]
        : []),
    ],
    messageId
  );
  return chatResponse({ success: true, data: { id: messageId } });
}
