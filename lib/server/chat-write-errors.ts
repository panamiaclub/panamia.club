import { DIRECT_THREAD_REFUSED } from '@/lib/dm-refusal';
import { ENCRYPTED_GROUP_CHAT_REQUIRED } from '@/lib/chat';

function isPlaintextChatRejection(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== 'object') return false;
    if (
      'code' in current &&
      current.code === 'P0001' &&
      'message' in current &&
      current.message === 'Encrypted chat transport required'
    )
      return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

/** Drizzle errors contain SQL parameters. Never hand a private write failure
 * to the framework logger, including activation races caught by the DB latch. */
export function chatWriteFailure(error: unknown, surface: 'status' | 'group') {
  if (isPlaintextChatRejection(error))
    return {
      success: false as const,
      error:
        surface === 'group'
          ? ENCRYPTED_GROUP_CHAT_REQUIRED
          : DIRECT_THREAD_REFUSED,
      status: surface === 'group' ? 409 : 400,
    };
  console.error('[chat-write] persistence failed', {
    surface,
    type: error instanceof Error ? error.constructor.name : 'UnknownError',
  });
  return {
    success: false as const,
    error: 'Could not save your message or post. Please try again.',
    status: 500,
  };
}
