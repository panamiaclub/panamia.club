import axios from 'axios';
import type { ChatMessage, PendingChatMessage } from '@/lib/chat';
import type { DraftAttachment } from '@/lib/query/social';

export interface MessageDraft {
  text: string;
  gif: DraftAttachment | null;
  isMirroring: boolean;
  gifError: string | null;
}

export const EMPTY_MESSAGE_DRAFT: MessageDraft = {
  text: '',
  gif: null,
  isMirroring: false,
  gifError: null,
};

export interface OutgoingMessage extends PendingChatMessage {
  recipientActorId: string;
}

/** Group retry nonces also reconcile a row fetched before its HTTP response. */
export function unconfirmedMessages<T extends PendingChatMessage>(
  outgoing: T[],
  messages: ChatMessage[]
): T[] {
  const confirmed = new Set(messages.map((message) => message.id));
  const nonces = new Set(
    messages.flatMap((message) => (message.clientId ? [message.clientId] : []))
  );
  return outgoing.filter(
    (message) =>
      (!message.serverId || !confirmed.has(message.serverId)) &&
      (!message.clientId || !nonces.has(message.clientId))
  );
}

export function messageError(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: unknown }>(error)) {
    const detail = error.response?.data?.error;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export function conversationUnavailable(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    [401, 403, 404].includes(error.response?.status ?? 0)
  );
}
