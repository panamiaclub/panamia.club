export function isAudioAttachment(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;

  return (
    ('type' in value &&
      typeof value.type === 'string' &&
      value.type.trim().toLowerCase() === 'audio') ||
    ('mediaType' in value &&
      typeof value.mediaType === 'string' &&
      value.mediaType.trim().toLowerCase().startsWith('audio/'))
  );
}

export function isVisualAttachment(attachment: {
  type: string;
  mediaType?: string | null;
}): boolean {
  return (
    (attachment.type === 'image' || attachment.type === 'video') &&
    !isAudioAttachment(attachment)
  );
}
