import { expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    chatVoiceFixture: {
      denied: boolean;
      streams: { getTracks: () => { readyState: string }[] }[];
      contexts: AudioContext[];
    };
  }
}

export function voiceSample() {
  const wave = Buffer.alloc(44 + 1600);
  wave.write('RIFF', 0);
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(8000, 24);
  wave.writeUInt32LE(16000, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(1600, 40);
  return wave;
}

export async function installChatVoiceFixtures(
  page: Page,
  options: { failUploads?: number; hold?: () => Promise<void> } = {}
) {
  await page.evaluate((wave) => {
    window.chatVoiceFixture = { denied: false, streams: [], contexts: [] };
    // Windows WebKit omits capture APIs. Exercise its UI with a recorder double;
    // Chromium uses a genuine MediaRecorder with a synthesized microphone.
    const simulated =
      !navigator.mediaDevices || typeof MediaRecorder === 'undefined';
    if (!navigator.mediaDevices)
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {},
        configurable: true,
      });
    if (simulated) {
      Object.defineProperty(window, 'MediaRecorder', {
        configurable: true,
        value: class {
          static isTypeSupported(type: string) {
            return type.startsWith('audio/mp4');
          }
          state = 'inactive';
          mimeType = 'audio/mp4';
          ondataavailable: ((event: { data: Blob }) => void) | null = null;
          onstop: (() => void) | null = null;
          start() {
            this.state = 'recording';
          }
          stop() {
            this.state = 'inactive';
            queueMicrotask(() => {
              this.ondataavailable?.({
                data: new Blob([Uint8Array.from(wave)], {
                  type: this.mimeType,
                }),
              });
              this.onstop?.();
            });
          }
        },
      });
    }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        if (!constraints.audio || constraints.video)
          throw new Error('Voice notes must request only a microphone.');
        if (window.chatVoiceFixture.denied)
          throw new DOMException('Denied by fixture', 'NotAllowedError');
        if (simulated) {
          const track = {
            readyState: 'live',
            stop() {
              this.readyState = 'ended';
            },
            addEventListener() {},
          };
          const stream = { getTracks: () => [track] };
          window.chatVoiceFixture.streams.push(stream);
          return stream;
        }
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const destination = context.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        await context.resume();
        window.chatVoiceFixture.contexts.push(context);
        window.chatVoiceFixture.streams.push(destination.stream);
        return destination.stream;
      },
    });
  }, Array.from(voiceSample()));
  const uploads: { type: string; duration: number; bytes: number }[] = [];
  let failures = options.failUploads ?? 0;
  await page.route('https://uploads.chat.invalid/voice-*', (route) =>
    route.fulfill({ contentType: 'audio/wav', body: voiceSample() })
  );
  await page.route('**/api/social/media', async (route) => {
    const request = route.request();
    const form = await new Request('https://fixture.invalid/upload', {
      method: 'POST',
      headers: { 'Content-Type': request.headers()['content-type'] },
      body: Uint8Array.from(request.postDataBuffer()!),
    }).formData();
    expect(form.get('purpose')).toBe('voice-note');
    const file = form.get('file');
    if (!file || typeof file === 'string')
      throw new Error('Missing voice note');
    uploads.push({
      type: file.type,
      duration: Number(form.get('duration')),
      bytes: file.size,
    });
    if (options.hold) await options.hold();
    if (failures-- > 0) {
      await route.fulfill({
        status: 503,
        json: { success: false, error: 'Voice note upload is unavailable.' },
      });
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          type: 'audio',
          mediaType: file.type,
          url: `https://uploads.chat.invalid/voice-${uploads.length}`,
          name: 'Voice note',
        },
      },
    });
  });
  return { uploads };
}

export async function expectMicrophoneReleased(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.chatVoiceFixture.streams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === 'ended')
        )
      )
    )
    .toBe(true);
}
