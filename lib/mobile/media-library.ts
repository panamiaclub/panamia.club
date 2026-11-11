import { isNativeApp, nativePlatform } from './native';

export function hasNativeMediaLibrary(): boolean {
  return (
    isNativeApp() &&
    window.Capacitor?.isPluginAvailable?.('FilePicker') === true
  );
}

export async function pickNativeStoryMedia(): Promise<File | null> {
  const { FilePicker } = await import('@capawesome/capacitor-file-picker');
  let result: Awaited<ReturnType<typeof FilePicker.pickMedia>>;
  try {
    result = await FilePicker.pickMedia({
      limit: 1,
      readData: false,
      skipTranscoding: false,
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      error.message === 'pickFiles canceled.'
    ) {
      return null;
    }
    throw error;
  }
  if (result.files.length === 0) return null;
  if (result.files.length !== 1) {
    throw new Error('Choose one photo or video for your story.');
  }
  const picked = result.files[0];
  let mediaType = picked.mimeType.toLowerCase();
  let name = picked.name;
  let source = picked.webPath;
  const convertsHeic =
    nativePlatform() === 'ios' &&
    ['image/heic', 'image/heif'].includes(mediaType);
  if (convertsHeic) {
    if (!picked.path) throw new Error('This photo could not be opened.');
    const converted = await FilePicker.convertHeicToJpeg({ path: picked.path });
    const { Capacitor } = await import('@capacitor/core');
    source = Capacitor.convertFileSrc(converted.path);
    mediaType = 'image/jpeg';
    name = `${name.replace(/\.[^.]+$/, '')}.jpg`;
  }
  if (
    !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
      mediaType
    ) &&
    !mediaType.startsWith('video/')
  ) {
    throw new Error('Choose a JPEG, PNG, WebP, GIF or video for your story.');
  }
  const maxBytes = (mediaType.startsWith('image/') ? 10 : 200) * 1024 * 1024;
  if (!convertsHeic && picked.size > maxBytes) {
    throw new Error(
      mediaType.startsWith('image/')
        ? 'Story photos must be 10 MB or smaller.'
        : 'Story videos must be 200 MB or smaller.'
    );
  }
  if (!source) throw new Error('The selected media could not be opened.');
  const response = await fetch(source);
  if (!response.ok) throw new Error('The selected media could not be read.');
  const blob = await response.blob();
  if (!blob.size || blob.size > maxBytes) {
    throw new Error(
      'The selected media is empty or too large. Choose another.'
    );
  }
  return new File([blob], name, { type: mediaType });
}
