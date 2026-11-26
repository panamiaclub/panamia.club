export const VOICE_NOTE_MAX_SECONDS = 5 * 60;
export const VOICE_NOTE_MAX_BYTES = 10 * 1024 * 1024;
export const VOICE_NOTE_TYPES = ['audio/mp4', 'audio/webm'] as const;

export function voiceNoteMediaType(type: string): string {
  return type.split(';')[0].trim().toLowerCase();
}

export function voiceNoteError(
  file: { type: string; size: number },
  duration: number
): string | null {
  if (!VOICE_NOTE_TYPES.some((type) => type === voiceNoteMediaType(file.type)))
    return 'This voice note format is not supported. Record another note.';
  if (!file.size) return 'This voice note is empty. Record another note.';
  if (file.size > VOICE_NOTE_MAX_BYTES)
    return 'Voice notes must be 10 MB or smaller.';
  if (!Number.isFinite(duration) || duration <= 0)
    return 'This voice note has no recording duration. Record another note.';
  if (duration > VOICE_NOTE_MAX_SECONDS)
    return 'Voice notes can be up to 5 minutes long.';
  return null;
}

export function voiceNoteRecordingType(
  isSupported: (type: string) => boolean
): string | undefined {
  return [
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
  ].find(isSupported);
}
