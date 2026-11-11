import axios from 'axios';
import type { DraftAttachment } from '@/lib/query/social';
import type { LegacyChatMediaTarget } from '@/lib/chat';

export const CHAT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

export function chatPhotoError(
  file: Pick<File, 'type' | 'size'>
): string | null {
  if (
    ![...CHAT_PHOTO_ACCEPT.split(','), 'image/heic', 'image/heif'].includes(
      file.type
    )
  )
    return 'Choose a JPEG, PNG, WebP or HEIC photo.';
  if (file.size === 0) return 'This photo is empty. Choose another photo.';
  if (file.size > CHAT_PHOTO_MAX_BYTES)
    return 'Photos must be 10 MB or smaller.';
  return null;
}

export async function prepareChatPhoto(file: File): Promise<File> {
  const invalid = chatPhotoError(file);
  if (invalid) throw new Error(invalid);
  const source = URL.createObjectURL(file);
  let photo: File;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(
          new Error('Could not open this photo. Try a JPEG, PNG or WebP image.')
        );
      image.src = source;
    });
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error(
        'This photo has no readable image pixels. Choose another photo.'
      );
    const scale = Math.min(
      1,
      2048 / Math.max(image.naturalWidth, image.naturalHeight)
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error('Photo preparation is unavailable on this device.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Re-encode pixels rather than forwarding camera metadata such as GPS.
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(
                new Error('Could not prepare this photo. Choose another photo.')
              ),
        'image/jpeg',
        0.85
      )
    );
    if (!blob.size || blob.size > CHAT_PHOTO_MAX_BYTES)
      throw new Error('Could not prepare a photo smaller than 10 MB.');
    photo = new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`,
      {
        type: 'image/jpeg',
      }
    );
  } finally {
    URL.revokeObjectURL(source);
  }
  return photo;
}

export async function uploadChatPhoto(
  file: File,
  target?: LegacyChatMediaTarget
): Promise<DraftAttachment> {
  const photo = await prepareChatPhoto(file);
  const form = new FormData();
  form.append('file', photo);
  form.append('purpose', 'legacy-chat');
  if (target) form.append('chatTarget', JSON.stringify(target));
  const { data } = await axios.post<{
    success: boolean;
    data?: DraftAttachment;
    error?: string;
  }>('/api/social/media', form, { timeout: 30_000 });
  if (
    !data.success ||
    !data.data ||
    data.data.type !== 'image' ||
    !data.data.url
  )
    throw new Error(
      data.error || 'Could not upload this photo. Please try again.'
    );
  return data.data;
}
