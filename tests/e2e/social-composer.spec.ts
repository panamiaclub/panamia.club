import { test, expect, type Page, type Route } from '@playwright/test';
import type { CalendarEntry } from '@/lib/query/social';

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
  } = {}
) {
  const posts: Record<string, unknown>[] = [];
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
    if (path === '/api/social/media' && request.method() === 'POST') {
      uploads++;
      return handlers.upload
        ? handlers.upload(route)
        : json({ success: true, data: uploadedPhoto });
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
  return { composer, posts, uploads: () => uploads };
}

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
