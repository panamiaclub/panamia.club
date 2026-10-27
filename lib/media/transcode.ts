import type { FFmpeg } from '@ffmpeg/ffmpeg';

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  const { FFmpeg: FFmpegClass } = await import('@ffmpeg/ffmpeg');
  const ffmpeg = new FFmpegClass();
  // The module worker imports the core's default export; the UMD build has none.
  await ffmpeg.load({
    coreURL:
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js',
    wasmURL:
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm',
  });
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/**
 * Transcode any audio blob to audio/ogg (Opus).
 * Input is typically audio/webm from MediaRecorder.
 */
export async function transcodeToOpus(blob: Blob): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const { fetchFile } = await import('@ffmpeg/util');
  const inputData = await fetchFile(blob);
  await ffmpeg.writeFile('input.webm', inputData);
  await ffmpeg.exec([
    '-i',
    'input.webm',
    '-c:a',
    'libopus',
    '-b:a',
    '64k',
    'output.ogg',
  ]);
  const data = (await ffmpeg.readFile('output.ogg')) as Uint8Array;
  await ffmpeg.deleteFile('input.webm');
  await ffmpeg.deleteFile('output.ogg');
  return new Blob([data.buffer as ArrayBuffer], { type: 'audio/ogg' });
}

/**
 * Transcode any video blob to video/mp4 (H.264 + AAC).
 *
 * H.264 rather than VP8, because this is the only combination Apple hardware
 * decodes. iOS 17.4+ can *play* VP8-in-WebM, but WebKit lists hardware decode
 * for VP9/H.264/HEVC/AV1 only — VP8 falls back to software, which costs
 * battery and drops frames in a feed that decodes several clips at once.
 * H.264/AAC MP4 also plays on every iOS version ever shipped, so the old
 * "use Chrome or Firefox" fallback is no longer needed anywhere.
 *
 * Encoded by the same @ffmpeg/core build that already produced the WebM: it is
 * configured --enable-gpl --enable-libx264 and carries FFmpeg's native AAC
 * encoder, so this costs no extra download and no new license obligation.
 *
 * @param onProgress optional callback receiving a 0–1 completion ratio
 */
export async function transcodeToMp4Video(
  blob: Blob,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();

  /* Kept in a variable so it can actually be removed below. Passing a fresh
     arrow to .off() removes nothing, so every call used to leave another
     listener attached to the module-level singleton — by the fourth upload a
     stale callback was still firing into an unmounted component's setState. */
  const handleProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(progress, 1));
  };
  if (onProgress) ffmpeg.on('progress', handleProgress);

  // Determine a reasonable input extension from the MIME type
  const ext = blob.type.split('/')[1]?.split(';')[0] || 'mp4';
  const inputName = `input.${ext}`;

  const { fetchFile } = await import('@ffmpeg/util');
  const inputData = await fetchFile(blob);
  await ffmpeg.writeFile(inputName, inputData);
  await ffmpeg.exec([
    '-i',
    inputName,
    '-vf',
    'scale=-2:min(720\\,ih)', // cap at 720p, no upscaling, preserve aspect ratio
    '-c:v',
    'libx264',
    // This core is built --disable-asm, so x264's hand-written SIMD is absent
    // and the slower presets cost far more here than they would natively.
    '-preset',
    'veryfast',
    '-crf',
    '26', // matches the previous VP8 target: ~3-6 MB/min at 720p
    // Safari and QuickTime refuse anything but 4:2:0 8-bit; libx264 will
    // otherwise inherit 4:2:2/4:4:4 from the source and produce a file that
    // plays everywhere except Apple.
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'main',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    // Moves the moov atom to the front so playback can start before the whole
    // file has arrived. Without it a feed stalls on every clip.
    '-movflags',
    '+faststart',
    'output.mp4',
  ]);
  const data = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile('output.mp4');

  if (onProgress) ffmpeg.off('progress', handleProgress);

  return new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });
}
