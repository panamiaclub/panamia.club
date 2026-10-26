import { test, expect, type Page } from '@playwright/test';
import type { SocialStatusDisplay } from '@/lib/interfaces';

const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
const actor = {
  id: 'fixture-actor',
  username: 'fixture',
  name: 'Fixture Pana',
  domain: 'localhost',
};
const makePost = (
  id: string,
  content: string,
  overrides: Partial<SocialStatusDisplay> = {}
): SocialStatusDisplay => ({
  id,
  uri: `https://localhost/p/fixture/${id}`,
  type: 'Note',
  content: `<p>${content}</p>`,
  published: '2026-01-01T12:00:00.000Z',
  recipientTo: [PUBLIC],
  recipientCc: [],
  likesCount: 0,
  repliesCount: 0,
  liked: false,
  ccLicense: 'cc-by-4',
  actor,
  ...overrides,
});

// Real feed/cards, query hooks, and composers; only HTTP/session boundaries
// are fixtures. These scenarios never publish or upload to a real account.
async function openFeed(
  page: Page,
  options: {
    group?: SocialStatusDisplay['group'];
    replies?: SocialStatusDisplay[];
    root?: Partial<SocialStatusDisplay>;
    before?: SocialStatusDisplay[];
    failReplies?: (url: URL) => boolean;
  } = {}
) {
  const root = makePost('root-post', 'An inline conversation', {
    repliesCount: options.replies?.length ?? 2,
    group: options.group,
    ...options.root,
  });
  const replies = new Map<string, SocialStatusDisplay[]>([
    [
      root.id,
      options.replies ?? [
        makePost('first-comment', 'First inline comment', { repliesCount: 1 }),
        makePost('second-comment', 'Second inline comment', {
          contentWarning: 'A little heads-up',
          attachments: [
            {
              id: 'comment-photo',
              type: 'image',
              mediaType: 'image/webp',
              url: '/img/impact/zine-series.webp',
              name: 'Comment photo',
            },
          ],
        }),
      ],
    ],
    ['first-comment', [makePost('nested-comment', 'A nested inline reply')]],
  ]);
  const posts: Record<string, unknown>[] = [];
  const replyRequests: string[] = [];
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (url: string) => {
          document.documentElement.dataset.copiedPostUrl = url;
        },
      },
    });
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, '');
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
          name: actor.name,
          panaVerified: true,
        },
      });
    }
    if (path === '/api/consent/check') return json({ consented: true });
    if (path === '/api/social/actors/me') {
      return json({
        success: true,
        data: {
          actor: {
            ...actor,
            followingCount: 0,
            followersCount: 0,
            statusCount: 1,
          },
        },
      });
    }
    if (path === '/api/social/actors/me/groups') {
      return json({ success: true, data: { groups: [] } });
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
      return json({ success: true, data: { committed: [], suggested: [] } });
    }
    const thread = path.match(/^\/api\/social\/statuses\/([^/]+)\/replies$/);
    if (thread) {
      replyRequests.push(request.url());
      if (options.failReplies?.(url)) {
        return json({ success: false, error: 'Try again later' }, 503);
      }
      const all = replies.get(thread[1]) ?? [];
      const cursor = url.searchParams.get('cursor');
      const start = cursor
        ? all.findIndex((reply) => reply.id === cursor) + 1
        : 0;
      const limit = Number(url.searchParams.get('limit') || 20);
      const items = all.slice(start, start + limit);
      return json({
        success: true,
        data: {
          replies: items,
          nextCursor:
            start + limit < all.length ? items[items.length - 1].id : null,
        },
      });
    }
    const like = path.match(/^\/api\/social\/statuses\/([^/]+)\/like$/);
    if (like) {
      const post = [root, ...[...replies.values()].flat()].find(
        (post) => post.id === like[1]
      );
      if (!post) throw new Error('Unknown post in like fixture');
      post.liked = request.method() === 'POST';
      post.likesCount = post.liked ? 1 : 0;
      return json({
        success: true,
        data: { liked: post.liked, likesCount: post.likesCount },
      });
    }
    if (path === '/api/social/statuses' && request.method() === 'POST') {
      const body: Record<string, unknown> = request.postDataJSON();
      posts.push(body);
      if (typeof body.inReplyTo !== 'string') {
        throw new Error('The comment fixture requires a parent post');
      }
      const created = makePost(
        `new-comment-${posts.length}`,
        String(body.content)
      );
      const existing = replies.get(body.inReplyTo) ?? [];
      replies.set(body.inReplyTo, [...existing, created]);
      const parent = [root, ...[...replies.values()].flat()].find(
        (post) => post.id === body.inReplyTo
      );
      if (parent) parent.repliesCount++;
      return json({ success: true, data: { status: created } });
    }
    if (path === '/api/social/statuses' || path === '/api/social/timeline') {
      return json({
        success: true,
        data: { statuses: [...(options.before ?? []), root], nextCursor: null },
      });
    }
    return json(
      { success: false, error: 'Not part of this browser fixture' },
      404
    );
  });
  const response = await page.goto('/s');
  expect(response?.status()).toBe(200);
  const card = page.locator('#feed-panel > article').last();
  await expect(card).toBeVisible();
  return { card, posts, replyRequests };
}

test('two comments preview in place, timestamps do not navigate, and warning media stays hidden', async ({
  page,
}) => {
  const { card, replyRequests } = await openFeed(page);
  const url = page.url();
  const time = card.locator('time').first();
  expect(await time.evaluate((node) => Boolean(node.closest('a')))).toBe(false);
  await time.click();
  await expect(page).toHaveURL(url);
  await expect(card.getByRole('listitem')).toHaveCount(2);
  await expect(
    card.getByText('First inline comment', { exact: true })
  ).toBeVisible();
  expect(replyRequests).toHaveLength(1);
  expect(new URL(replyRequests[0]).searchParams.get('limit')).toBe('2');
  expect(
    replyRequests.every((url) =>
      new URL(url).pathname.endsWith('/root-post/replies')
    )
  ).toBe(true);
  await expect(card.getByRole('button', { name: /^View all/ })).toHaveCount(0);
  await expect(
    card.getByRole('form', { name: 'Reply composer', exact: true })
  ).toHaveCount(0);
  await expect(
    card.getByText('Second inline comment', { exact: true })
  ).not.toBeVisible();
  await expect(
    card.getByRole('img', { name: 'Comment photo', exact: true })
  ).toHaveCount(0);

  const toggle = card.getByRole('button', {
    name: 'Open conversation, 2 comments',
    exact: true,
  });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(
    card.getByText('First inline comment', { exact: true })
  ).toBeVisible();
  await expect(
    card.getByRole('button', {
      name: 'Close conversation, 2 comments',
      exact: true,
    })
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(
    card.getByText('Second inline comment', { exact: true })
  ).not.toBeVisible();
  await expect(
    card.getByRole('img', { name: 'Comment photo', exact: true })
  ).toHaveCount(0);
  await card
    .getByRole('button', { name: 'A little heads-up', exact: true })
    .click();
  await expect(
    card.getByText('Second inline comment', { exact: true })
  ).toBeVisible();
  await expect(
    card.getByRole('img', { name: 'Comment photo', exact: true })
  ).toBeVisible();
  await expect(
    card.getByRole('form', { name: 'Reply composer', exact: true })
  ).toBeVisible();
  expect(
    await card
      .locator('time')
      .evaluateAll((times) => times.every((time) => !time.closest('a')))
  ).toBe(true);
  await expect(page).toHaveURL(url);

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await card.evaluate((node) => node.scrollWidth <= node.clientWidth)
    ).toBe(true);
    expect(
      await page
        .locator('html')
        .evaluate((node) => node.scrollWidth <= node.clientWidth)
    ).toBe(true);
  }
  await card
    .getByRole('button', {
      name: 'Close conversation, 2 comments',
      exact: true,
    })
    .click();
  await expect(
    card.getByText('First inline comment', { exact: true })
  ).toBeVisible();
  await expect(card.getByRole('listitem')).toHaveCount(2);
  await expect(
    card.getByRole('form', { name: 'Reply composer', exact: true })
  ).toHaveCount(0);
  await expect(page).toHaveURL(url);
});

test('posting a comment keeps the thread open and refreshes its comments and count', async ({
  page,
}) => {
  const { card, posts } = await openFeed(page);
  await card
    .getByRole('button', { name: 'Open conversation, 2 comments', exact: true })
    .click();
  const composer = card.getByRole('form', {
    name: 'Reply composer',
    exact: true,
  });
  await composer
    .getByRole('textbox', { name: 'Write a reply' })
    .fill('A freshly posted comment');
  await composer.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(
    card.getByText('A freshly posted comment', { exact: true })
  ).toBeVisible();
  await expect(
    card.getByRole('button', {
      name: 'Close conversation, 3 comments',
      exact: true,
    })
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(
    composer.getByRole('textbox', { name: 'Write a reply' })
  ).toHaveValue('');
  expect(posts).toEqual([
    {
      content: 'A freshly posted comment',
      inReplyTo: 'root-post',
      visibility: 'public',
    },
  ]);
});

test('comment likes and nested conversations stay current without leaving the feed', async ({
  page,
}) => {
  const { card } = await openFeed(page);
  const url = page.url();
  await card
    .getByRole('button', { name: 'Open conversation, 2 comments', exact: true })
    .click();
  const first = card
    .getByRole('listitem')
    .filter({ hasText: 'First inline comment' });
  await first.getByRole('button', { name: 'Like', exact: true }).click();
  await expect(
    first.getByRole('button', { name: 'Like, 1 like', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await first
    .getByRole('button', { name: 'Like, 1 like', exact: true })
    .click();
  await expect(
    first.getByRole('button', { name: 'Like', exact: true })
  ).toHaveAttribute('aria-pressed', 'false');
  await first
    .getByRole('button', { name: 'Show comments, 1 comment', exact: true })
    .click();
  await expect(
    first.getByText('A nested inline reply', { exact: true })
  ).toBeVisible();
  const composer = first.getByRole('form', {
    name: 'Reply composer',
    exact: true,
  });
  await composer
    .getByRole('textbox', { name: 'Write a reply' })
    .fill('A reply to a comment');
  await composer.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(
    first.getByText('A reply to a comment', { exact: true })
  ).toBeVisible();
  await expect(
    first.getByRole('button', {
      name: 'Hide comments, 2 comments',
      exact: true,
    })
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await card.evaluate((node) => node.scrollWidth <= node.clientWidth)
  ).toBe(true);
  await expect(page).toHaveURL(url);
});

test('an empty conversation accepts its first comment and preserves drafts when posting fails', async ({
  page,
}) => {
  const { card } = await openFeed(page, { replies: [] });
  let failing = true;
  await page.route('**/api/social/statuses', (route) =>
    failing && route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          json: { success: false, error: 'Your comment could not be posted.' },
        })
      : route.fallback()
  );
  await card
    .getByRole('button', { name: 'Show comments', exact: true })
    .click();
  await expect(
    card.getByText('No comments yet.', { exact: true })
  ).toBeVisible();
  const composer = card.getByRole('form', {
    name: 'Reply composer',
    exact: true,
  });
  const input = composer.getByRole('textbox', { name: 'Write a reply' });
  await input.fill('The first comment');
  await composer.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(composer.getByRole('alert')).toContainText(
    'Your comment could not be posted'
  );
  await expect(input).toHaveValue('The first comment');
  failing = false;
  await composer.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(
    card.getByText('The first comment', { exact: true })
  ).toBeVisible();
  await expect(
    card.getByRole('button', {
      name: 'Close conversation, 1 comment',
      exact: true,
    })
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByText('No comments yet.', { exact: true })).toHaveCount(
    0
  );
});

test('readable public-group comments remain accessible without offering non-members a reply composer', async ({
  page,
}) => {
  const { card } = await openFeed(page, {
    group: {
      id: 'other-group',
      handle: 'other-group',
      name: 'Public room',
      visibility: 'public',
    },
  });
  await card
    .getByRole('button', { name: 'Open conversation, 2 comments', exact: true })
    .click();
  await expect(
    card.getByText('First inline comment', { exact: true })
  ).toBeVisible();
  await expect(
    card.getByRole('form', { name: 'Reply composer', exact: true })
  ).toHaveCount(0);
  await card
    .getByRole('button', { name: 'Show comments, 1 comment', exact: true })
    .click();
  await expect(
    card.getByText('A nested inline reply', { exact: true })
  ).toBeVisible();
  await expect(
    card.getByRole('form', { name: 'Reply composer', exact: true })
  ).toHaveCount(0);
});

test('loading failures are retryable instead of looking like an empty conversation', async ({
  page,
}) => {
  let failing = true;
  const { card } = await openFeed(page, { failReplies: () => failing });
  await expect(card.getByRole('status')).toHaveText('Loading comments...');
  await expect(card.getByRole('alert')).toContainText(
    'Could not load comments'
  );
  await expect(card.getByText('No comments yet.', { exact: true })).toHaveCount(
    0
  );
  failing = false;
  await card.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    card.getByText('First inline comment', { exact: true })
  ).toBeVisible();
});

test('loading more comments retains earlier pages and can recover from a later-page failure', async ({
  page,
}) => {
  let failing = true;
  const { card, replyRequests } = await openFeed(page, {
    replies: Array.from({ length: 23 }, (_, i) =>
      makePost(`paged-${i}`, `Paged comment ${i + 1}`)
    ),
    failReplies: (url) => failing && url.searchParams.has('cursor'),
  });
  await expect(card.getByRole('listitem')).toHaveCount(2);
  const disclosure = card.getByRole('button', {
    name: 'View all 23 comments',
    exact: true,
  });
  await disclosure.focus();
  await disclosure.press('Enter');
  await expect(card.getByRole('alert')).toContainText(
    'Could not load more comments'
  );
  await expect(card.getByRole('listitem')).toHaveCount(2);
  await expect(
    card.getByRole('button', { name: 'Show fewer comments', exact: true })
  ).toBeFocused();
  failing = false;
  await card.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(card.getByRole('listitem')).toHaveCount(22);
  await card
    .getByRole('button', { name: 'Load more comments', exact: true })
    .click();
  await expect(card.getByRole('listitem')).toHaveCount(23);
  await expect(
    card.getByRole('button', { name: 'Load more comments', exact: true })
  ).toHaveCount(0);
  await expect(card.getByText('Paged comment 1', { exact: true })).toHaveCount(
    1
  );
  expect(
    replyRequests.some((url) => {
      const params = new URL(url).searchParams;
      return params.get('cursor') === 'paged-1' && params.get('limit') === '20';
    })
  ).toBe(true);
  const requestsBeforeCollapse = replyRequests.length;
  await card
    .getByRole('button', { name: 'Show fewer comments', exact: true })
    .click();
  await expect(card.getByRole('listitem')).toHaveCount(2);
  await expect(
    card.getByRole('button', { name: 'View all 23 comments', exact: true })
  ).toBeFocused();
  await expect(
    card.getByText('Paged comment 1', { exact: true })
  ).toBeVisible();
  await expect(
    card.getByText('Paged comment 2', { exact: true })
  ).toBeVisible();
  await expect(card.getByText('Paged comment 3', { exact: true })).toHaveCount(
    0
  );
  await card
    .getByRole('button', {
      name: 'Open conversation, 23 comments',
      exact: true,
    })
    .click();
  await expect(card.getByRole('listitem')).toHaveCount(23);
  expect(replyRequests).toHaveLength(requestsBeforeCollapse);
});

test('a post content warning prevents automatic comment previews until revealed', async ({
  page,
}) => {
  const { card, replyRequests } = await openFeed(page, {
    root: { contentWarning: 'Post heads-up' },
  });
  await expect(
    card.getByText('First inline comment', { exact: true })
  ).toHaveCount(0);
  expect(replyRequests).toHaveLength(0);
  await card
    .getByRole('button', { name: 'Post heads-up', exact: true })
    .click();
  await expect(card.getByRole('listitem')).toHaveCount(2);
  await expect(
    card.getByText('First inline comment', { exact: true })
  ).toBeVisible();
  expect(replyRequests).toHaveLength(1);
});

test('offscreen comments wait until the card approaches the viewport', async ({
  page,
}) => {
  const { card, replyRequests } = await openFeed(page, {
    before: [
      makePost('long-post', '', {
        content: Array.from(
          { length: 50 },
          () => '<p>A longer post above the conversation.</p>'
        ).join(''),
      }),
    ],
  });
  const comments = card.getByRole('region', { name: 'Comments', exact: true });
  expect((await comments.boundingBox())!.y).toBeGreaterThan(
    page.viewportSize()!.height + 200
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  expect(replyRequests).toHaveLength(0);
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('listitem')).toHaveCount(2);
  expect(replyRequests).toHaveLength(1);
});

test('the explicit share action still copies a permalink without navigating the card', async ({
  page,
}) => {
  const { card } = await openFeed(page);
  const url = page.url();
  await card
    .getByRole('button', { name: 'Copy link to post', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-copied-post-url',
    new URL('/p/fixture/root-post', url).toString()
  );
  await expect(page).toHaveURL(url);
});
