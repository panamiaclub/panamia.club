import { after, beforeEach, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type {
  PickedFile,
  PickMediaOptions,
} from '@capawesome/capacitor-file-picker';

let platform: 'ios' | 'android' | null = 'ios';
let available = true;
let failure: Error | null = null;
let files: PickedFile[] = [];
let content = new Blob(['fixture-image'], { type: 'image/png' });
let readStatus = 200;
const pickerCalls: PickMediaOptions[] = [];
const converted: string[] = [];
const reads: string[] = [];

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    Capacitor: {
      isPluginAvailable: (name: string) => available && name === 'FilePicker',
    },
  },
});
mock.module(import.meta.resolve('../lib/mobile/native.ts'), {
  namedExports: {
    isNativeApp: () => platform !== null,
    nativePlatform: () => platform,
  },
});
mock.module(import.meta.resolve('@capawesome/capacitor-file-picker'), {
  namedExports: {
    FilePicker: {
      pickMedia: async (options: PickMediaOptions) => {
        pickerCalls.push(options);
        if (failure) throw failure;
        return { files };
      },
      convertHeicToJpeg: async ({ path }: { path: string }) => {
        converted.push(path);
        return { path: 'file:///converted.jpg' };
      },
    },
  },
});
mock.module(import.meta.resolve('@capacitor/core'), {
  namedExports: {
    Capacitor: {
      convertFileSrc: (path: string) =>
        `capacitor://localhost/${path.split('/').at(-1)}`,
    },
  },
});
mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
  reads.push(String(input));
  return new Response(content, { status: readStatus });
});

const { hasNativeMediaLibrary, pickNativeStoryMedia } =
  await import('../lib/mobile/media-library');
const picked = (mimeType = 'image/png'): PickedFile => ({
  name: mimeType.startsWith('video/') ? 'library.mov' : 'library.png',
  mimeType,
  size: 13,
  path: 'file:///library.png',
  webPath: 'capacitor://localhost/library.png',
});
beforeEach(() => {
  platform = 'ios';
  available = true;
  failure = null;
  files = [picked()];
  content = new Blob(['fixture-image'], { type: 'image/png' });
  readStatus = 200;
  pickerCalls.length = 0;
  converted.length = 0;
  reads.length = 0;
});
after(() => {
  mock.restoreAll();
  if (originalWindow)
    Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

it('uses the native photo/video library for both supported app platforms, not the file/source chooser', async () => {
  for (const value of ['ios', 'android'] as const) {
    platform = value;
    assert.equal(hasNativeMediaLibrary(), true);
    const file = await pickNativeStoryMedia();
    assert.ok(file instanceof File);
    assert.equal(file.name, 'library.png');
    assert.equal(file.type, 'image/png');
    assert.equal(await file.text(), 'fixture-image');
  }
  assert.deepEqual(pickerCalls, [
    { limit: 1, readData: false, skipTranscoding: false },
    { limit: 1, readData: false, skipTranscoding: false },
  ]);
});

it('does not advertise a native picker in browsers or older app builds', () => {
  available = false;
  assert.equal(hasNativeMediaLibrary(), false);
  available = true;
  platform = null;
  assert.equal(hasNativeMediaLibrary(), false);
});

it('treats an explicit user cancellation as cancellation, but propagates real failures', async () => {
  failure = new Error('pickFiles canceled.');
  assert.equal(await pickNativeStoryMedia(), null);
  failure = new Error('The library is unavailable.');
  await assert.rejects(pickNativeStoryMedia(), /library is unavailable/);
  failure = null;
  files = [];
  assert.equal(await pickNativeStoryMedia(), null);
  assert.deepEqual(reads, []);
});

it('accepts videos as well as images without loading Base64 across the native bridge', async () => {
  files = [picked('video/quicktime')];
  const file = await pickNativeStoryMedia();
  assert.equal(file?.type, 'video/quicktime');
  assert.equal(pickerCalls[0].readData, false);
});

it('converts an iOS HEIC selection into JPEG before the existing upload path', async () => {
  files = [
    {
      ...picked('image/heic'),
      name: 'portrait.heic',
      path: 'file:///portrait.heic',
      size: 12 * 1024 * 1024,
    },
  ];
  const file = await pickNativeStoryMedia();
  assert.equal(file?.type, 'image/jpeg');
  assert.equal(file?.name, 'portrait.jpg');
  assert.deepEqual(converted, ['file:///portrait.heic']);
  assert.deepEqual(reads, ['capacitor://localhost/converted.jpg']);
});

it('rejects invalid counts, unsupported types and large media before reading it', async () => {
  for (const selection of [
    [picked(), picked()],
    [picked('audio/ogg')],
    [{ ...picked(), size: 11 * 1024 * 1024 }],
    [{ ...picked('video/mp4'), size: 201 * 1024 * 1024 }],
    [{ ...picked(), webPath: undefined }],
  ]) {
    files = selection;
    await assert.rejects(pickNativeStoryMedia());
  }
  assert.deepEqual(reads, []);
});

it('reports unreadable and empty selections instead of creating fake successful files', async () => {
  readStatus = 404;
  await assert.rejects(pickNativeStoryMedia(), /could not be read/);
  readStatus = 200;
  content = new Blob([]);
  await assert.rejects(pickNativeStoryMedia(), /empty or too large/);
});
