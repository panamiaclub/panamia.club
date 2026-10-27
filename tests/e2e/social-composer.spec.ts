import { test, expect, type Page, type Route } from '@playwright/test';
import type { CalendarEntry } from '@/lib/query/social';

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});

const photo = {
  name: 'photo.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64'
  ),
};
const uploadedPhoto = {
  type: 'image',
  mediaType: 'image/webp',
  url: '/img/impact/zine-series.webp',
  name: 'Photo',
};
const calendarEntry: CalendarEntry = {
  id: 'fixture-event',
  slug: 'community-table',
  title: 'Community table',
  startsAt: '2099-01-02T17:00:00.000Z',
  endsAt: null,
  timezone: 'America/New_York',
  coverImage: null,
  mode: 'offline',
  attendeeCount: 3,
  visibility: 'public',
  reason: 'rsvp',
  rsvp: 'going',
  hostKind: 'pana',
  hostName: 'Fixture Pana',
  hostHandle: 'fixture',
  venueName: null,
  venueCity: null,
  because: null,
};

// Exercise the actual /s page and production upload/composer components. Only
// session and HTTP boundaries are fixtures; nothing is published or uploaded.
async function openComposer(
  page: Page,
  handlers: {
    upload?: (route: Route) => Promise<void>;
    post?: (route: Route) => Promise<void>;
    story?: (route: Route) => Promise<void>;
  } = {}
) {
  const posts: Record<string, unknown>[] = [];
  const stories: Record<string, unknown>[] = [];
  const videoUploads: {
    metadata: { filename: string; contentType: string; size: number }[];
    files: Buffer[];
  } = { metadata: [], files: [] };
  let uploads = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, json: body });
    if (path === '/api/auth/get-session') {
      return json({
        session: {
          id: 'fixture-session',
          userId: 'fixture-user',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
        user: {
          id: 'fixture-user',
          email: 'fixture@example.invalid',
          emailVerified: true,
          name: 'Fixture Pana',
          panaVerified: true,
        },
      });
    }
    if (path === '/api/social/actors/me') {
      return json({
        success: true,
        data: {
          actor: {
            id: 'fixture-actor',
            username: 'fixture',
            name: 'Fixture Pana',
            domain: 'localhost',
            followingCount: 2,
            followersCount: 2,
            statusCount: 0,
          },
        },
      });
    }
    if (path === '/api/social/actors/me/groups') {
      return json({
        success: true,
        data: {
          groups: [
            {
              id: 'room',
              handle: 'room',
              name: 'Our room',
              visibility: 'private',
              memberCount: 5,
            },
          ],
        },
      });
    }
    if (path === '/api/social/follows') {
      return json({ success: true, data: { actors: [], nextCursor: null } });
    }
    if (path === '/api/social/stories/summary') {
      return json({
        success: true,
        data: {
          fixture: { hasStories: false, hasUnseen: false, isOwner: true },
        },
      });
    }
    if (path === '/api/social/actors/fixture/panas') {
      return json({ success: true, data: { actors: [], count: 0 } });
    }
    if (path === '/api/social/actors/me/calendar') {
      return json({
        success: true,
        data: { committed: [calendarEntry], suggested: [] },
      });
    }
    if (path === '/api/consent/check') return json({ consented: true });
    if (path === '/api/social/statuses' && request.method() === 'POST') {
      posts.push(request.postDataJSON());
      return handlers.post
        ? handlers.post(route)
        : json({ success: true, data: { status: { id: 'new-post' } } });
    }
    if (path === '/api/social/stories' && request.method() === 'POST') {
      stories.push(request.postDataJSON());
      return handlers.story
        ? handlers.story(route)
        : json({ success: true, data: { id: 'new-story' } });
    }
    if (path === '/api/social/media' && request.method() === 'POST') {
      uploads++;
      return handlers.upload
        ? handlers.upload(route)
        : json({ success: true, data: uploadedPhoto });
    }
    if (path === '/api/social/media/upload' && request.method() === 'POST') {
      videoUploads.metadata.push(request.postDataJSON());
      return json({
        presignedUrl: new URL('/api/fixture/story-video', request.url()).href,
        publicUrl: '/fixture-story.mp4',
      });
    }
    if (path === '/api/fixture/story-video' && request.method() === 'PUT') {
      expect(request.headers()['content-type']).toBe('video/mp4');
      videoUploads.files.push(request.postDataBuffer()!);
      return route.fulfill({ status: 200, body: '' });
    }
    if (path === '/api/social/timeline' || path === '/api/social/statuses') {
      return json({ success: true, data: { statuses: [], nextCursor: null } });
    }
    return json(
      { success: false, error: 'Not part of this browser fixture' },
      404
    );
  });
  const response = await page.goto('/s');
  expect(response?.status()).toBe(200);
  const composer = page.getByRole('form', {
    name: 'Post composer',
    exact: true,
  });
  await expect(composer).toBeVisible();
  await expect(
    composer.getByRole('textbox', { name: 'Write a post' })
  ).toHaveAttribute('placeholder', "What's on your mind, Fixture?");
  return { composer, posts, stories, videoUploads, uploads: () => uploads };
}

interface CameraProbe {
  streams: MediaStream[];
  constraints: MediaStreamConstraints[];
  cameraError: string;
  microphoneError: string;
  holdCamera: boolean;
  releaseCamera?: () => void;
  revokedUrls: string[];
}

type CameraTestWindow = typeof window & { storyCameraTest: CameraProbe };

async function observeCamera(page: Page) {
  await page.addInitScript(() => {
    if (!navigator.mediaDevices) return;
    const probe: CameraProbe = {
      streams: [],
      constraints: [],
      cameraError: '',
      microphoneError: '',
      holdCamera: false,
      revokedUrls: [],
    };
    (window as CameraTestWindow).storyCameraTest = probe;
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      probe.constraints.push(constraints ?? {});
      const error = constraints?.video
        ? probe.cameraError
        : probe.microphoneError;
      if (error) throw new DOMException('Device request failed', error);
      const stream = await getUserMedia(constraints);
      probe.streams.push(stream);
      if (constraints?.video && probe.holdCamera) {
        await new Promise<void>((resolve) => {
          probe.releaseCamera = resolve;
        });
      }
      return stream;
    };
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      probe.revokedUrls.push(url);
      revokeObjectURL(url);
    };
  });
}

async function openStory(
  page: Page,
  handlers: Parameters<typeof openComposer>[1] = {}
) {
  await observeCamera(page);
  const fixture = await openComposer(page, handlers);
  await page
    .getByRole('region', { name: 'Stories', exact: true })
    .getByRole('button', { name: 'Post a story' })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Post a story',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return { ...fixture, dialog };
}

async function openStoryCamera(page: Page) {
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  const camera = page.getByRole('dialog', {
    name: 'Story camera',
    exact: true,
  });
  await expect(
    camera.getByRole('button', { name: 'Take photo' })
  ).toBeEnabled();
  return camera;
}

async function expectDevicesStopped(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as CameraTestWindow).storyCameraTest.streams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === 'ended')
        )
      )
    )
    .toBe(true);
}

test.describe('story camera', () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test('photos are reviewed before upload, then captioned and explicitly posted', async ({
    page,
  }) => {
    let imageRequest = '';
    const { dialog, stories, uploads } = await openStory(page, {
      upload: async (route) => {
        imageRequest =
          route.request().postDataBuffer()?.toString('latin1') ?? '';
        await route.fulfill({ json: { success: true, data: uploadedPhoto } });
      },
    });
    expect(
      await page.evaluate(
        () => (window as CameraTestWindow).storyCameraTest.constraints.length
      )
    ).toBe(0);
    const camera = await openStoryCamera(page);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const bounds = await camera.boundingBox();
      expect(bounds!.x).toBe(0);
      expect(bounds!.width).toBe(width);
      expect(bounds!.height).toBe(844);
      expect(
        await camera.evaluate((node) => node.scrollWidth <= node.clientWidth)
      ).toBe(true);
      for (const name of [
        'Back to story',
        'Take photo',
        'Switch camera',
        'Choose from gallery',
      ]) {
        expect(
          (await camera
            .getByRole('button', { name, exact: true })
            .boundingBox())!.height
        ).toBeGreaterThanOrEqual(44);
      }
    }
    await camera.getByRole('button', { name: 'Take photo' }).click();
    await expect(
      camera.getByRole('img', { name: 'Story photo preview' })
    ).toBeVisible();
    await expectDevicesStopped(page);
    expect(uploads()).toBe(0);
    expect(stories).toHaveLength(0);
    await camera.getByRole('button', { name: 'Use photo' }).click();
    await expect(dialog).toBeVisible();
    expect(uploads()).toBe(1);
    expect(imageRequest).toMatch(/filename="story-\d+\.jpg"/);
    expect(imageRequest).toContain('Content-Type: image/jpeg');
    expect(stories).toHaveLength(0);
    await dialog
      .getByLabel('Caption', { exact: true })
      .fill('A moment from today');
    await dialog
      .getByRole('button', { name: 'Post story', exact: true })
      .click();
    await expect.poll(() => stories.length).toBe(1);
    expect(stories[0]).toEqual({
      media: uploadedPhoto,
      caption: 'A moment from today',
    });
    await expect(dialog).toHaveCount(0);
  });

  test('switching, retaking, Escape, and Android back release streams and previews', async ({
    page,
  }) => {
    await openStory(page);
    const camera = await openStoryCamera(page);
    await camera.getByRole('button', { name: 'Switch camera' }).click();
    await expect(
      camera.getByRole('button', { name: 'Take photo' })
    ).toBeEnabled();
    expect(
      await page.evaluate(() => {
        const probe = (window as CameraTestWindow).storyCameraTest;
        return {
          directions: probe.constraints.map((constraint) =>
            typeof constraint.video === 'object'
              ? constraint.video.facingMode
              : null
          ),
          previousStopped: probe.streams[0]
            .getTracks()
            .every((track) => track.readyState === 'ended'),
        };
      })
    ).toEqual({
      directions: [{ ideal: 'environment' }, { ideal: 'user' }],
      previousStopped: true,
    });
    await camera.getByRole('button', { name: 'Take photo' }).click();
    const preview = camera.getByRole('img', { name: 'Story photo preview' });
    await expect(preview).toBeVisible();
    const url = await preview.getAttribute('src');
    await camera.getByRole('button', { name: 'Retake', exact: true }).click();
    await expect(
      camera.getByRole('button', { name: 'Take photo' })
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => (window as CameraTestWindow).storyCameraTest.revokedUrls
      )
    ).toContain(url);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('dialog', { name: 'Post a story', exact: true })
    ).toBeVisible();
    await expectDevicesStopped(page);
    expect(
      await page.evaluate(() =>
        window.dispatchEvent(
          new Event('native-back-button', { cancelable: true })
        )
      )
    ).toBe(false);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        window.dispatchEvent(
          new Event('native-back-button', { cancelable: true })
        )
      )
    ).toBe(true);
  });

  test('video asks for sound only on record and produces a playable local preview', async ({
    page,
  }) => {
    const { uploads, stories } = await openStory(page);
    const camera = await openStoryCamera(page);
    await camera.getByRole('button', { name: 'Video', exact: true }).click();
    expect(
      await page.evaluate(
        () => (window as CameraTestWindow).storyCameraTest.constraints
      )
    ).toHaveLength(1);
    await camera.getByRole('button', { name: 'Record video' }).click();
    await expect(camera.getByRole('timer')).toContainText('0:00 / 1:00');
    await expect(
      camera.getByRole('button', { name: 'Switch camera' })
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => (window as CameraTestWindow).storyCameraTest.constraints[1]
      )
    ).toEqual({ audio: true, video: false });
    await expect(camera.getByRole('timer')).toContainText('0:01 / 1:00');
    await camera.getByRole('button', { name: 'Stop recording' }).click();
    const preview = camera.getByLabel('Story video preview', { exact: true });
    await expect(preview).toBeVisible();
    await expect
      .poll(() =>
        preview.evaluate((video: HTMLVideoElement) => video.readyState)
      )
      .toBeGreaterThanOrEqual(1);
    expect(
      await preview.evaluate(async (video: HTMLVideoElement) => {
        const blob = await fetch(video.src).then((response) => response.blob());
        return { type: blob.type.startsWith('video/'), bytes: blob.size > 0 };
      })
    ).toEqual({ type: true, bytes: true });
    await expectDevicesStopped(page);
    expect(uploads()).toBe(0);
    expect(stories).toHaveLength(0);
    await camera.getByRole('button', { name: 'Back to story' }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as CameraTestWindow).storyCameraTest.revokedUrls.length
        )
      )
      .toBe(1);
  });

  test('recording stops at the 60-second limit, not before it', async ({
    page,
  }) => {
    await openStory(page);
    const camera = await openStoryCamera(page);
    await page.clock.install();
    await camera.getByRole('button', { name: 'Video', exact: true }).click();
    await camera.getByRole('button', { name: 'Record video' }).click();
    await expect(
      camera.getByRole('button', { name: 'Stop recording' })
    ).toBeEnabled();
    await page.clock.runFor(59_000);
    await expect(camera.getByRole('timer')).toHaveText('0:59 / 1:00');
    await expect(
      camera.getByRole('button', { name: 'Stop recording' })
    ).toBeEnabled();
    await page.clock.runFor(1_000);
    await expect(
      camera.getByLabel('Story video preview', { exact: true })
    ).toBeVisible();
    await expect(
      camera.getByRole('button', { name: 'Use video' })
    ).toBeEnabled();
    await expectDevicesStopped(page);
  });

  for (const recordingFormat of ['default', 'webm'] as const) {
    test(`captured ${recordingFormat} video uses the existing MP4 upload path before posting`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      if (recordingFormat === 'webm') {
        await page.addInitScript(() => {
          const supported = MediaRecorder.isTypeSupported.bind(MediaRecorder);
          MediaRecorder.isTypeSupported = (type) =>
            type.startsWith('video/webm') && supported(type);
        });
      }
      const { dialog, stories, videoUploads } = await openStory(page);
      const camera = await openStoryCamera(page);
      await camera.getByRole('button', { name: 'Video', exact: true }).click();
      await camera.getByRole('button', { name: 'Record video' }).click();
      await expect(camera.getByRole('timer')).toContainText('0:01 / 1:00');
      await camera.getByRole('button', { name: 'Stop recording' }).click();
      await camera.getByRole('button', { name: 'Use video' }).click();
      await expect(
        page.getByRole('button', {
          name: 'Preparing and uploading...',
          exact: true,
        })
      ).toHaveCount(0, { timeout: 90_000 });
      expect(await page.locator('[role="alert"]').allTextContents()).toEqual(
        []
      );
      await expect(
        dialog.getByRole('button', { name: 'Post story', exact: true })
      ).toBeEnabled();
      expect(videoUploads.metadata).toHaveLength(1);
      expect(videoUploads.files).toHaveLength(1);
      expect(videoUploads.metadata[0]).toMatchObject({
        contentType: 'video/mp4',
        size: videoUploads.files[0].length,
      });
      expect(videoUploads.metadata[0].filename).toMatch(
        /^social\/stories\/[^/]+\.mp4$/
      );
      expect(videoUploads.files[0].subarray(4, 8).toString()).toBe('ftyp');
      const encoded = await page.evaluate(async (bytes) => {
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: 'video/mp4' })
        );
        const video = document.createElement('video');
        try {
          await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () =>
              reject(new Error('The uploaded MP4 is not playable'));
            video.src = url;
          });
          return {
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
          };
        } finally {
          video.removeAttribute('src');
          video.load();
          URL.revokeObjectURL(url);
        }
      }, Array.from(videoUploads.files[0]));
      expect(encoded.width).toBeGreaterThan(0);
      expect(encoded.height).toBeGreaterThan(0);
      expect(encoded.duration).toBeGreaterThan(0);
      expect(Number.isFinite(encoded.duration)).toBe(true);
      expect(stories).toHaveLength(0);
      await dialog
        .getByRole('button', { name: 'Post story', exact: true })
        .click();
      await expect.poll(() => stories.length).toBe(1);
      expect(stories[0]).toMatchObject({
        media: {
          type: 'video',
          mediaType: 'video/mp4',
          url: '/fixture-story.mp4',
          name: expect.stringMatching(
            recordingFormat === 'webm'
              ? /^story-\d+\.webm$/
              : /^story-\d+\.(mp4|webm)$/
          ),
        },
      });
    });
  }

  test('denied camera access explains recovery and keeps the gallery working', async ({
    page,
  }) => {
    const { dialog } = await openStory(page);
    await page.evaluate(() => {
      (window as CameraTestWindow).storyCameraTest.cameraError =
        'NotAllowedError';
    });
    await dialog.getByRole('button', { name: 'Open camera' }).click();
    const camera = page.getByRole('dialog', {
      name: 'Story camera',
      exact: true,
    });
    await expect(camera.getByRole('alert')).toContainText(
      'Camera access was denied'
    );
    const choosing = page.waitForEvent('filechooser');
    await camera.getByRole('button', { name: 'Choose from gallery' }).click();
    const chooser = await choosing;
    expect(await chooser.element().getAttribute('accept')).toBe(
      'image/jpeg,image/png,image/webp,image/gif,video/*'
    );
    expect(await chooser.element().getAttribute('capture')).toBeNull();
    await chooser.setFiles(photo);
    await expect(
      dialog.getByRole('button', { name: 'Post story', exact: true })
    ).toBeEnabled();
    await expectDevicesStopped(page);
  });

  test('denying the microphone does not prevent taking a photo', async ({
    page,
  }) => {
    await openStory(page);
    const camera = await openStoryCamera(page);
    await page.evaluate(() => {
      (window as CameraTestWindow).storyCameraTest.microphoneError =
        'NotAllowedError';
    });
    await camera.getByRole('button', { name: 'Video', exact: true }).click();
    await camera.getByRole('button', { name: 'Record video' }).click();
    await expect(camera.getByRole('alert')).toContainText(
      'Microphone access was denied'
    );
    await camera.getByRole('button', { name: 'Photo', exact: true }).click();
    await camera.getByRole('button', { name: 'Take photo' }).click();
    await expect(
      camera.getByRole('img', { name: 'Story photo preview' })
    ).toBeVisible();
    await expectDevicesStopped(page);
  });

  test('closing during a pending camera request stops a late stream', async ({
    page,
  }) => {
    const { dialog } = await openStory(page);
    await page.evaluate(() => {
      (window as CameraTestWindow).storyCameraTest.holdCamera = true;
    });
    await dialog.getByRole('button', { name: 'Open camera' }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean((window as CameraTestWindow).storyCameraTest.releaseCamera)
        )
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Back to story' }).click();
    await expect(dialog).toBeVisible();
    await page.evaluate(() => {
      (window as CameraTestWindow).storyCameraTest.releaseCamera?.();
    });
    await expectDevicesStopped(page);
    await expect(
      page.getByRole('dialog', { name: 'Story camera', exact: true })
    ).toHaveCount(0);
  });

  test('failed uploads keep the capture for retry and block closing during an upload', async ({
    page,
  }) => {
    let attempts = 0;
    let releaseUpload!: () => void;
    const waiting = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const { dialog, stories } = await openStory(page, {
      upload: async (route) => {
        if (++attempts === 1) {
          await route.fulfill({
            status: 500,
            json: { success: false, error: 'Please retry this upload.' },
          });
        } else {
          await waiting;
          await route.fulfill({ json: { success: true, data: uploadedPhoto } });
        }
      },
    });
    const camera = await openStoryCamera(page);
    await camera.getByRole('button', { name: 'Take photo' }).click();
    await camera.getByRole('button', { name: 'Use photo' }).click();
    await expect(camera.getByRole('alert')).toContainText('It is still here');
    await expect(
      camera.getByRole('img', { name: 'Story photo preview' })
    ).toBeVisible();
    await camera.getByRole('button', { name: 'Use photo' }).click();
    await expect(
      camera.getByRole('button', { name: 'Preparing and uploading...' })
    ).toBeDisabled();
    await expect(
      camera.getByRole('button', { name: 'Back to story' })
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.evaluate(() =>
      window.dispatchEvent(
        new Event('native-back-button', { cancelable: true })
      )
    );
    await expect(camera).toBeVisible();
    expect(stories).toHaveLength(0);
    releaseUpload();
    await expect(
      dialog.getByRole('button', { name: 'Post story', exact: true })
    ).toBeEnabled();
  });

  test('backgrounding discards unfinished video and releases camera and microphone', async ({
    page,
  }) => {
    await openStory(page);
    const camera = await openStoryCamera(page);
    await camera.getByRole('button', { name: 'Video', exact: true }).click();
    await camera.getByRole('button', { name: 'Record video' }).click();
    await expect(
      camera.getByRole('button', { name: 'Stop recording' })
    ).toBeEnabled();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(camera.getByRole('alert')).toContainText(
      'recording was discarded'
    );
    await expectDevicesStopped(page);
    await expect(
      camera.getByLabel('Story video preview', { exact: true })
    ).toHaveCount(0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: false,
      });
    });
    await camera.getByRole('button', { name: 'Try camera again' }).click();
    await expect(
      camera.getByRole('button', { name: 'Record video' })
    ).toBeEnabled();
  });
});

test('compact composer keeps media and Everyone/Panas visible at desktop, tablet and phone sizes', async ({
  page,
}) => {
  const { composer } = await openComposer(page);
  await expect(
    page.getByRole('tab', { name: 'Everyone', exact: true })
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    composer.getByRole('button', { name: 'Audience: Everyone' })
  ).toBeVisible();
  await expect(
    composer.getByRole('button', { name: 'Add photos or video', exact: false })
  ).toBeVisible();
  await expect(
    composer.getByRole('button', { name: 'Add audio' })
  ).toBeVisible();
  await composer.getByRole('button', { name: 'Audience: Everyone' }).click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(2);
  await expect(
    page.getByRole('menuitemradio', { name: /^Everyone/ })
  ).toBeVisible();
  await expect(
    page.getByRole('menuitemradio', { name: /^Panas/ })
  ).toBeVisible();
  await expect(page.getByRole('menu')).not.toContainText('Our room');
  await page.keyboard.press('Escape');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await composer.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.height).toBeLessThanOrEqual(width < 640 ? 190 : 150);
    await expect(composer).toHaveAttribute('data-expanded', 'false');
    await expect(
      composer.getByRole('button', { name: 'Post', exact: true })
    ).toBeVisible();
    expect(
      await composer.evaluate((node) => node.scrollWidth <= node.clientWidth)
    ).toBe(true);
    for (const name of [
      'Add photos or video',
      'Add audio',
      'Audience: Everyone',
      'Post',
    ]) {
      const action = composer.getByRole('button', { name, exact: true });
      const target = await action.boundingBox();
      expect(target!.height).toBeGreaterThanOrEqual(44);
    }
  }
  const stories = page.getByRole('region', { name: 'Stories', exact: true });
  await expect(stories.getByRole('listitem')).toHaveCount(1);
  await expect(
    stories.getByRole('button', { name: 'Post a story' })
  ).toBeVisible();
  expect((await stories.boundingBox())!.height).toBeLessThanOrEqual(64);
  const upcoming = page.getByRole('region', { name: 'Good things ahead.' });
  await expect(upcoming).toBeVisible();
  await expect(upcoming).toContainText('Saved posts');
  await expect(upcoming).toContainText('Jams');
  await expect(upcoming).toContainText('Trending & hashtags');
  await expect(upcoming.locator('.reserved-slot')).toHaveCount(0);
  await expect(
    page
      .getByRole('region', { name: 'Coming up', exact: true })
      .getByRole('link', { name: /Community table/ })
  ).toHaveAttribute('href', '/e/community-table');
});

test('writing expands the card, Done collapses an empty draft, and labelled buttons open the real pickers', async ({
  page,
}) => {
  const { composer } = await openComposer(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const idleHeight = (await composer.boundingBox())!.height;
  const input = composer.getByRole('textbox', { name: 'Write a post' });
  await expect(
    composer.getByRole('button', { name: 'More post options' })
  ).toHaveCount(0);
  await input.fill('A little moment');
  await expect(composer).toHaveAttribute('data-expanded', 'true');
  expect((await composer.boundingBox())!.height).toBeGreaterThan(
    idleHeight + 80
  );
  await expect(
    composer.getByRole('button', { name: 'More post options' })
  ).toBeVisible();
  await input.fill('');
  await composer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(composer).toHaveAttribute('data-expanded', 'false');
  expect((await composer.boundingBox())!.height).toBe(idleHeight);

  const photos = page.waitForEvent('filechooser');
  await composer
    .getByRole('button', { name: 'Add photos or video', exact: true })
    .click();
  const photoChooser = await photos;
  expect(photoChooser.isMultiple()).toBe(true);
  expect(await photoChooser.element().getAttribute('accept')).toMatch(
    /image\/.*video\/\*/
  );
  await photoChooser.setFiles([]);
  const audio = page.waitForEvent('filechooser');
  await composer
    .getByRole('button', { name: 'Add audio', exact: true })
    .click();
  const audioChooser = await audio;
  expect(await audioChooser.element().getAttribute('accept')).toBe('audio/*');
  await audioChooser.setFiles([]);
});

test('real image upload blocks early submission, then allows a public media-only post', async ({
  page,
}) => {
  let releaseUpload!: () => void;
  const waiting = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  const { composer, posts, uploads } = await openComposer(page, {
    upload: async (route) => {
      await waiting;
      await route.fulfill({ json: { success: true, data: uploadedPhoto } });
    },
  });
  await composer.getByLabel('Choose photos or videos').setInputFiles(photo);
  await expect(
    composer.getByRole('button', { name: 'Uploading...', exact: true })
  ).toBeDisabled();
  await composer.evaluate((node) => (node as HTMLFormElement).requestSubmit());
  expect(posts).toHaveLength(0);
  releaseUpload();
  await expect(
    composer.getByRole('img', { name: 'Photo', exact: true })
  ).toBeVisible();
  expect(uploads()).toBe(1);
  await expect(
    composer.getByRole('button', { name: 'Post', exact: true })
  ).toBeEnabled();
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({
    content: '',
    visibility: 'public',
    attachments: [uploadedPhoto],
  });
  expect(posts[0]).not.toHaveProperty('ccLicense');
  expect(posts[0]).not.toHaveProperty('audience');
  await expect(
    composer.getByRole('img', { name: 'Photo', exact: true })
  ).toHaveCount(0);
  await expect(composer).toHaveAttribute('data-expanded', 'false');
});

test('Panas requests use the explicit mutual audience and keep drafts on failure', async ({
  page,
}) => {
  const { composer, posts } = await openComposer(page, {
    post: (route) =>
      route.fulfill({
        status: 400,
        json: {
          success: false,
          error: 'Please try again. Your draft is safe.',
        },
      }),
  });
  await composer
    .getByRole('textbox', { name: 'Write a post' })
    .fill('For my mutual Panas');
  await composer.getByRole('button', { name: 'Audience: Everyone' }).click();
  await page.getByRole('menuitemradio', { name: /^Panas/ }).click();
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(composer.getByRole('alert')).toContainText('Your draft is safe');
  await expect(
    composer.getByRole('textbox', { name: 'Write a post' })
  ).toHaveValue('For my mutual Panas');
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ visibility: 'private', audience: 'panas' });
});

test('More holds warning/formatting options and preview hides text and media together', async ({
  page,
}) => {
  const { composer } = await openComposer(page);
  await composer
    .getByRole('textbox', { name: 'Write a post' })
    .fill('A **little** moment');
  await composer.getByLabel('Choose photos or videos').setInputFiles(photo);
  await expect(
    composer.getByRole('img', { name: 'Photo', exact: true })
  ).toBeVisible();
  await composer.getByRole('button', { name: 'More post options' }).click();
  await page
    .getByRole('menuitemcheckbox', { name: 'Content warning', exact: true })
    .click();
  await composer
    .getByRole('textbox', { name: 'Content warning', exact: true })
    .fill('A heads-up');
  await composer.getByRole('button', { name: 'More post options' }).click();
  await page
    .getByRole('menuitemcheckbox', { name: 'Preview formatting' })
    .click();
  await expect(composer.locator('details')).toBeVisible();
  await expect(
    composer.getByRole('img', { name: 'Photo', exact: true })
  ).not.toBeVisible();
  await composer.locator('summary').click();
  await expect(composer.locator('strong')).toHaveText('little');
  await expect(
    composer.getByRole('img', { name: 'Photo', exact: true })
  ).toBeVisible();
  await composer.getByRole('button', { name: 'Back to writing' }).click();
  await expect(
    composer.getByRole('textbox', { name: 'Write a post' })
  ).toHaveValue('A **little** moment');
  await expect(
    composer.getByRole('textbox', { name: 'Content warning', exact: true })
  ).toHaveValue('A heads-up');
});

test('drop and image paste reuse uploads, cap attachments at four, and keep removal accessible', async ({
  page,
}) => {
  const { composer, uploads } = await openComposer(page);
  await composer.evaluate((node) => {
    const data = new DataTransfer();
    data.items.add(new File(['image'], 'pasted.png', { type: 'image/png' }));
    node.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      })
    );
  });
  await expect(
    composer.getByRole('img', { name: 'Photo', exact: true })
  ).toHaveCount(1);
  await composer.evaluate((node) => {
    const data = new DataTransfer();
    for (let i = 0; i < 4; i++)
      data.items.add(
        new File(['image'], `dropped-${i}.png`, { type: 'image/png' })
      );
    node.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
      })
    );
  });
  await expect(
    composer.getByRole('img', { name: 'Photo', exact: true })
  ).toHaveCount(4);
  await expect(composer.getByRole('alert')).toContainText(
    'up to 4 attachments'
  );
  expect(uploads()).toBe(4);
  const remove = composer.getByRole('button', {
    name: 'Remove Photo',
    exact: true,
  });
  await expect(remove.first()).toBeVisible();
  await remove.first().click();
  await expect(
    composer.getByRole('img', { name: 'Photo', exact: true })
  ).toHaveCount(3);
});

test('unsupported files and upload failures are visible without losing the text draft', async ({
  page,
}) => {
  const { composer } = await openComposer(page, {
    upload: (route) =>
      route.fulfill({
        status: 500,
        json: { success: false, error: 'Try a smaller photo.' },
      }),
  });
  await composer
    .getByRole('textbox', { name: 'Write a post' })
    .fill('Keep my words');
  await composer.getByLabel('Choose photos or videos').setInputFiles({
    name: `${'a'.repeat(180)}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from('not media'),
  });
  await expect(composer.getByRole('alert')).toContainText('Unsupported file');
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await composer.evaluate((node) => node.scrollWidth <= node.clientWidth)
  ).toBe(true);
  await composer.getByLabel('Choose photos or videos').setInputFiles(photo);
  await expect(composer.getByRole('alert')).toContainText(
    'Try a smaller photo'
  );
  await expect(
    composer.getByRole('textbox', { name: 'Write a post' })
  ).toHaveValue('Keep my words');
  await expect(
    composer.getByRole('img', { name: 'Photo', exact: true })
  ).toHaveCount(0);
});

test('removal stays locked until an active batch finishes, without resurrecting attachments', async ({
  page,
}) => {
  let releaseUpload!: () => void;
  const waiting = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  let batch = 0;
  const { composer } = await openComposer(page, {
    upload: async (route) => {
      if (++batch === 2) await waiting;
      await route.fulfill({ json: { success: true, data: uploadedPhoto } });
    },
  });
  const picker = composer.getByLabel('Choose photos or videos');
  await picker.setInputFiles(photo);
  await expect(
    composer.getByRole('img', { name: 'Photo', exact: true })
  ).toHaveCount(1);
  await picker.setInputFiles(photo);
  await expect(
    composer.getByRole('button', { name: 'Remove Photo' })
  ).toBeDisabled();
  await composer
    .getByRole('button', { name: 'Remove Photo' })
    .evaluate((button) => (button as HTMLButtonElement).click());
  releaseUpload();
  await expect(
    composer.getByRole('img', { name: 'Photo', exact: true })
  ).toHaveCount(2);
  await expect(
    composer.getByRole('button', { name: 'Remove Photo' }).first()
  ).toBeEnabled();
  await composer.getByRole('button', { name: 'Remove Photo' }).first().click();
  await expect(
    composer.getByRole('img', { name: 'Photo', exact: true })
  ).toHaveCount(1);
});

test('character and whitespace guards keep the exact 500-character boundary', async ({
  page,
}) => {
  const { composer } = await openComposer(page);
  const input = composer.getByRole('textbox', { name: 'Write a post' });
  const post = composer.getByRole('button', { name: 'Post', exact: true });
  await input.fill('a'.repeat(500));
  await expect(post).toBeEnabled();
  await input.fill('a'.repeat(501));
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(post).toBeDisabled();
  await input.fill('   ');
  await expect(post).toBeDisabled();
});
