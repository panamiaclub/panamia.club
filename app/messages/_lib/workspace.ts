import axios from 'axios';
import type { ChatMessage, PendingChatMessage } from '@/lib/chat';
import type { DraftAttachment } from '@/lib/query/social';

export interface MessageDraft {
  text: string;
  gif: DraftAttachment | null;
  isMirroring: boolean;
  gifError: string | null;
  photo: DraftAttachment | null;
  photoFile: File | null;
  isUploadingPhoto: boolean;
  photoError: string | null;
  voice: DraftAttachment | null;
  voiceFile: File | null;
  voiceDuration: number | null;
  isRecordingVoice: boolean;
  isUploadingVoice: boolean;
  voiceError: string | null;
}

export const EMPTY_MESSAGE_DRAFT: MessageDraft = {
  text: '',
  gif: null,
  isMirroring: false,
  gifError: null,
  photo: null,
  photoFile: null,
  isUploadingPhoto: false,
  photoError: null,
  voice: null,
  voiceFile: null,
  voiceDuration: null,
  isRecordingVoice: false,
  isUploadingVoice: false,
  voiceError: null,
};

export function messageDraftAttachments(
  draft: MessageDraft
): DraftAttachment[] {
  return [draft.photo, draft.gif, draft.voice].filter(
    (attachment): attachment is DraftAttachment => attachment !== null
  );
}

export function messageDraftCanSend(draft: MessageDraft): boolean {
  return (
    !!(draft.text.trim() || draft.gif || draft.photo || draft.voice) &&
    !draft.isMirroring &&
    !draft.isUploadingPhoto &&
    !draft.photoFile &&
    !draft.isRecordingVoice &&
    !draft.isUploadingVoice &&
    !draft.voiceFile
  );
}

export function messageDraftPreview(draft: MessageDraft): string | null {
  return (
    (draft.text.trim() ? draft.text : '') ||
    (draft.isRecordingVoice
      ? 'Recording voice note...'
      : draft.isUploadingVoice
        ? 'Uploading voice note...'
        : draft.voiceFile
          ? 'Voice note not uploaded'
          : draft.voice
            ? 'Voice note'
            : null) ||
    (draft.isUploadingPhoto
      ? 'Uploading photo...'
      : draft.photoFile || draft.photoError
        ? 'Photo not uploaded'
        : draft.photo
          ? 'Photo'
          : draft.isMirroring
            ? 'Saving GIF...'
            : draft.gifError
              ? 'GIF not saved'
              : draft.gif
                ? 'GIF'
                : null)
  );
}

export function composerEnterSends(
  phone: boolean,
  shiftKey: boolean,
  composing: boolean
): boolean {
  return !phone && !shiftKey && !composing;
}

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
