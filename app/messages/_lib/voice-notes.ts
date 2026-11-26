import axios from 'axios';
import type { DraftAttachment } from '@/lib/query/social';
import { voiceNoteError, voiceNoteMediaType } from '@/lib/media/voice-notes';

export async function uploadVoiceNote(
  file: File,
  duration: number
): Promise<DraftAttachment> {
  const invalid = voiceNoteError(file, duration);
  if (invalid) throw new Error(invalid);
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', 'voice-note');
  form.append('duration', String(duration));
  const { data } = await axios.post<{
    success: boolean;
    data?: DraftAttachment;
    error?: string;
  }>('/api/social/media', form, { timeout: 60_000 });
  if (
    !data.success ||
    !data.data ||
    data.data.type !== 'audio' ||
    voiceNoteMediaType(data.data.mediaType) !== voiceNoteMediaType(file.type) ||
    !data.data.url
  )
    throw new Error(
      data.error || 'Could not upload this voice note. Try again.'
    );
  return data.data;
}
