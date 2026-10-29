import {
  expect,
  test,
  type Page,
  type Route,
  type WebSocketRoute,
} from '@playwright/test';
import type { SocialActorDisplay, SocialStatusDisplay } from '@/lib/interfaces';
import type { DraftAttachment } from '@/lib/query/social';
import { DIRECT_THREAD_REFUSED } from '@/lib/dm-refusal';

const conversation = (page: Page) =>
  page.getByRole('region', { name: 'Open conversation' });
const history = (page: Page) => page.getByRole('log');
const input = (page: Page, name = 'J. Downs') =>
  page.getByRole('textbox', { name: `Message ${name}`, exact: true });
const row = (page: Page, name: string) =>
  page
    .getByRole('list', { name: 'Conversations', exact: true })
    .getByRole('button', { name: new RegExp(name) });

interface DirectMessagePost {
  content: string;
  visibility: string;
  recipientActorIds: string[];
  attachments?: DraftAttachment[];
}

interface FixtureOptions {
  signedIn?: boolean;
  failSends?: number;
  failAccepts?: number;
  failDeletes?: number;
  gifsEnabled?: boolean;
  send?: (
    route: Route,
    input: DirectMessagePost,
    commit: () => Promise<void>
  ) => Promise<void>;
  mirror?: (route: Route, attachment: DraftAttachment) => Promise<void>;
}

// These tests render /messages and its production hooks. Only authenticated
// HTTP and WebSocket boundaries are fixtures; no real messages or GIFs are sent.
async function openMessages(page: Page, options: FixtureOptions = {}) {
  const now = Date.now();
  const actor = (
    id: string,
    name: string,
    domain = 'localhost'
  ): SocialActorDisplay => ({
    id,
    name,
    username: id,
    domain,
    iconUrl: null,
    uri: `https://${domain}/users/${id}`,
    followingCount: 2,
    followersCount: 2,
    statusCount: 0,
  });
  const viewer = actor('viewer', 'Claribel');
  const business = actor('business', 'Neighborhood Studio');
  const people = {
    jdowns: actor('jdowns', 'J. Downs'),
    bee: actor('bee', 'Bee Maria'),
    mart: actor('mart', 'Mart Ruiz', 'indieweb.social'),
    refused: actor('refused', 'R. Nieves'),
    anette: actor('anette', 'Anette Mago'),
    stella: actor('stella', 'Stella Perez'),
    sofia: actor('sofia', 'Sofia Morales'),
  };
  const messages: Record<string, SocialStatusDisplay[]> = {};
  const makeMessage = (
    id: string,
    author: SocialActorDisplay,
    content: string,
    minutesAgo = 0
  ): SocialStatusDisplay => ({
    id,
    uri: `https://localhost/statuses/${id}`,
    content,
    published: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    expiresAt: new Date(now + 29 * 86_400_000).toISOString(),
    repliesCount: 0,
    likesCount: 0,
    liked: false,
    actor: author,
  });
  messages.jdowns = Array.from({ length: 28 }, (_, index) =>
    makeMessage(
      `history-${index}`,
      index % 2 ? viewer : people.jdowns,
      `<p>A little update ${index + 1} about Saturday. We have the back room and a few prints for the table.</p>`,
      90 - index
    )
  );
  messages.jdowns.push(
    makeMessage('repeat-existing', viewer, '<p>Repeat these words.</p>', 2)
  );
  messages.jdowns.push(
    makeMessage('last-existing', people.jdowns, '<p>See you Saturday!</p>', 1)
  );
  messages.bee = [
    makeMessage(
      'bee-voice',
      people.bee,
      '<p>I recorded a few thoughts.</p>',
      1_440
    ),
  ];
  messages.bee[0].attachments = [
    {
      id: 'voice-attachment',
      type: 'audio',
      mediaType: 'audio/wav',
      url: '/fixture/voice.wav',
      name: 'A few thoughts',
    },
  ];
  messages.mart = [
    makeMessage(
      'remote-message',
      people.mart,
      '<p>Trade is on. Send the prints when you are ready.</p>',
      2_880
    ),
  ];
  messages.refused = [
    makeMessage(
      'refused-message',
      viewer,
      '<p>Following up on the flyers.</p>',
      4_320
    ),
  ];
  messages.anette = [
    makeMessage(
      'held-message',
      people.anette,
      '<p>Could I help at the next table?</p>',
      5
    ),
  ];
  messages.stella = [];
  messages.sofia = [];

  const posts: DirectMessagePost[] = [];
  const searchTerms: string[] = [];
  const calls: string[] = [];
  const pageErrors: string[] = [];
  const mailboxes: WebSocketRoute[] = [];
  const requestIds = new Set(['anette', 'stella']);
  const state = {
    failSends: options.failSends ?? 0,
    failAccepts: options.failAccepts ?? 0,
    failDeletes: options.failDeletes ?? 0,
    failRequests: false,
    failSearch: false,
    deferAcknowledgements: false,
    hiddenStatusIds: new Set<string>(),
    unavailableActors: new Set<string>(),
    refusedActors: new Set(['refused']),
    activeProfile: 'personal',
  };
  let nextMessageId = 0;
  const attachment: DraftAttachment = {
    type: 'image',
    mediaType: 'image/gif',
    url: '/fixture/mirrored.gif',
    name: 'A little celebration by Fixture Studio (via GIPHY)',
  };
  const currentViewer = () =>
    state.activeProfile === 'business' ? business : viewer;
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, json: body });
  const notify = (actorId: string) => {
    for (const mailbox of mailboxes) {
      mailbox.send(
        JSON.stringify({
          type: 'dm',
          conversationActorId: actorId,
          statusId: messages[actorId]?.at(-1)?.id ?? 'fixture-status',
          at: Date.now(),
        })
      );
    }
  };

  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.routeWebSocket('**/ws/dm', (socket) => {
    mailboxes.push(socket);
    socket.onMessage((message) => {
      if (message === 'ping') socket.send('pong');
    });
    socket.send(JSON.stringify({ type: 'ready' }));
  });
  await page.route('**/manifest.webmanifest*', (route) =>
    json(route, { name: 'Pana Social', start_url: '/s', display: 'standalone' })
  );
  const gifPixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
  // One second of original PCM silence for the real voice player's metadata.
  const sampleRate = 8_000;
  const voiceSample = Buffer.alloc(44 + sampleRate, 128);
  voiceSample.write('RIFF', 0);
  voiceSample.writeUInt32LE(voiceSample.length - 8, 4);
  voiceSample.write('WAVEfmt ', 8);
  voiceSample.writeUInt32LE(16, 16);
  voiceSample.writeUInt16LE(1, 20);
  voiceSample.writeUInt16LE(1, 22);
  voiceSample.writeUInt32LE(sampleRate, 24);
  voiceSample.writeUInt32LE(sampleRate, 28);
  voiceSample.writeUInt16LE(1, 32);
  voiceSample.writeUInt16LE(8, 34);
  voiceSample.write('data', 36);
  voiceSample.writeUInt32LE(sampleRate, 40);
  await page.route('https://media.giphy.com/**', (route) =>
    route.fulfill({ contentType: 'image/gif', body: gifPixel })
  );
  await page.route('**/fixture/mirrored.gif', (route) =>
    route.fulfill({ contentType: 'image/gif', body: gifPixel })
  );
  await page.route('**/fixture/voice.wav', (route) =>
    route.fulfill({
      contentType: 'audio/wav',
      body: voiceSample,
    })
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, '');
    calls.push(`${request.method()} ${path}`);
    if (path === '/api/auth/get-session') {
      return json(
        route,
        options.signedIn === false
          ? null
          : {
              session: {
                id: 'fixture-session',
                userId: 'fixture-user',
                expiresAt: '2099-01-01T00:00:00.000Z',
              },
              user: {
                id: 'fixture-user',
                name: 'Claribel',
                email: 'fixture@example.invalid',
                emailVerified: true,
                panaVerified: true,
              },
            }
      );
    }
    if (path === '/api/user/me') {
      return json(route, {
        success: true,
        data: { screenname: 'viewer', createdAt: '2020-01-01T00:00:00.000Z' },
      });
    }
    if (path === '/api/config/turnstile')
      return json(route, { enabled: false });
    if (path === '/api/consent/check') return json(route, { consented: true });
    if (path === '/api/profile/switch') {
      if (request.method() === 'POST') {
        state.activeProfile = request.postDataJSON().profileId;
        return json(route, { success: true });
      }
      return json(route, {
        success: true,
        activeProfileId: state.activeProfile,
        invitations: [],
        data: [
          {
            id: 'personal',
            name: 'Claribel',
            email: null,
            screenname: 'viewer',
            active: true,
            isPersonal: true,
            role: 'owner',
          },
          {
            id: 'business',
            name: 'Neighborhood Studio',
            email: null,
            screenname: 'business',
            active: true,
            isPersonal: false,
            role: 'owner',
          },
        ],
      });
    }
    if (path === '/api/social/actors/me') {
      return json(route, {
        success: true,
        data: { actor: currentViewer(), eligible: true },
      });
    }
    if (path === '/api/social/messages/conversations') {
      const conversations =
        state.activeProfile === 'business'
          ? []
          : Object.values(people)
              .filter(
                (person) =>
                  !requestIds.has(person.id) && messages[person.id].length > 0
              )
              .map((person) => ({
                counterparty: person,
                lastMessage:
                  messages[person.id][messages[person.id].length - 1],
              }))
              .sort(
                (a, b) =>
                  new Date(b.lastMessage.published!).getTime() -
                  new Date(a.lastMessage.published!).getTime()
              );
      return json(route, {
        success: true,
        data: {
          conversations,
          viewerActorId: currentViewer().id,
          localDomain: 'localhost',
        },
      });
    }
    if (path.startsWith('/api/social/messages/conversations/')) {
      const actorId = path.split('/').pop()!;
      const counterparty = Object.values(people).find(
        (person) => person.id === actorId
      );
      if (!counterparty || state.unavailableActors.has(actorId))
        return json(route, { success: false, error: 'Not found' }, 404);
      return json(route, {
        success: true,
        data: {
          counterparty,
          viewerActorId: currentViewer().id,
          localDomain: 'localhost',
          canSend: state.refusedActors.has(actorId) ? 'refuse' : 'allow',
          messages:
            state.activeProfile === 'business'
              ? []
              : messages[actorId].filter(
                  (message) => !state.hiddenStatusIds.has(message.id)
                ),
        },
      });
    }
    if (path === '/api/social/dm-requests') {
      if (state.failRequests)
        return json(
          route,
          { success: false, error: 'Requests could not be checked.' },
          503
        );
      if (request.method() === 'GET') {
        return json(route, {
          success: true,
          data: {
            requests:
              state.activeProfile === 'business'
                ? []
                : [...requestIds].map((id) => ({
                    sender: Object.values(people).find(
                      (person) => person.id === id
                    ),
                    requestedAt: new Date(now - 86_400_000).toISOString(),
                    messages: messages[id],
                  })),
          },
        });
      }
      if (request.method() === 'PATCH' && state.failAccepts-- > 0)
        return json(
          route,
          { success: false, error: 'Could not accept this request.' },
          503
        );
      if (request.method() === 'DELETE' && state.failDeletes-- > 0)
        return json(
          route,
          { success: false, error: 'Could not delete this request.' },
          503
        );
      requestIds.delete(request.postDataJSON().senderActorId);
      return json(route, { success: true });
    }
    if (path === '/api/social/actors/search') {
      searchTerms.push(url.searchParams.get('q') ?? '');
      if (state.failSearch)
        return json(
          route,
          { success: false, error: 'People search is unavailable.' },
          503
        );
      return json(route, {
        success: true,
        data: [viewer, people.jdowns, people.sofia].map((person) => ({
          id: person.id,
          username: person.username,
          displayName: person.name,
          avatarUrl: person.iconUrl,
          uri: person.uri,
        })),
      });
    }
    if (path === '/api/social/gifs') {
      return json(route, {
        enabled: options.gifsEnabled !== false,
        results: [
          {
            id: 'fixture-gif',
            description: 'A little celebration',
            creator: 'Fixture Studio',
            url: 'https://media.giphy.com/media/fixture/giphy.gif',
            previewUrl: 'https://media.giphy.com/media/fixture/preview.gif',
            width: 100,
            height: 100,
          },
        ],
      });
    }
    if (path === '/api/social/gifs/mirror') {
      return options.mirror
        ? options.mirror(route, attachment)
        : json(route, { success: true, data: attachment });
    }
    if (path === '/api/social/statuses' && request.method() === 'POST') {
      const submitted: DirectMessagePost = request.postDataJSON();
      posts.push(submitted);
      const recipientActorId = submitted.recipientActorIds[0];
      const commit = async () => {
        const content = submitted.content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');
        const status = makeMessage(
          `sent-${++nextMessageId}`,
          currentViewer(),
          `<p>${content}</p>`
        );
        status.published = new Date().toISOString();
        status.attachments = submitted.attachments?.map((value, index) => ({
          ...value,
          id: `${status.id}-attachment-${index}`,
        }));
        messages[recipientActorId].push(status);
        if (state.deferAcknowledgements) state.hiddenStatusIds.add(status.id);
        await json(route, { success: true, data: { status } });
      };
      if (options.send) return options.send(route, submitted, commit);
      if (state.refusedActors.has(recipientActorId))
        return json(
          route,
          { success: false, error: DIRECT_THREAD_REFUSED },
          400
        );
      if (state.failSends-- > 0)
        return json(
          route,
          { success: false, error: 'Could not send this message.' },
          503
        );
      return commit();
    }
    if (path === '/api/social/timeline' || path === '/api/social/statuses')
      return json(route, {
        success: true,
        data: { statuses: [], nextCursor: null },
      });
    if (path === '/api/social/actors/me/groups')
      return json(route, { success: true, data: { groups: [] } });
    if (path === '/api/social/stories/summary')
      return json(route, { success: true, data: {} });
    if (path === '/api/social/actors/me/calendar')
      return json(route, {
        success: true,
        data: { committed: [], suggested: [] },
      });
    if (path.startsWith('/api/notifications'))
      return json(route, {
        success: true,
        data: [],
        notifications: [],
        unreadCount: 0,
      });
    return json(
      route,
      { success: false, error: 'Not part of this browser fixture' },
      404
    );
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  const response = await page.goto('/messages');
  expect(response?.status()).toBe(200);
  if (options.signedIn === false) {
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true })
    ).toBeVisible();
  } else {
    await expect(input(page)).toBeVisible();
    await expect
      .poll(() => history(page).evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect.poll(() => mailboxes.length).toBe(1);
  }
  return {
    people,
    viewer,
    messages,
    state,
    posts,
    searchTerms,
    calls,
    pageErrors,
    mailboxes,
    attachment,
    notify,
    makeMessage,
  };
}

test('uses the real masthead with a bounded desktop workspace and no mock controls', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await expect(page.getByRole('heading', { name: 'Messages.' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Pana Social home' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Back to conversations' })
  ).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Fail next send' })
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'Messaging legal links' })
      .getByRole('link', { name: 'Privacy' })
  ).toBeVisible();
  const send = await page
    .getByRole('button', { name: 'Send message', exact: true })
    .boundingBox();
  expect(send!.y + send!.height).toBeLessThan(960);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight)
  ).toBeLessThanOrEqual(960);
  await expect
    .poll(() =>
      history(page).evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight
      )
    )
    .toBeLessThan(3);
  expect(fixture.pageErrors).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath('messages-desktop.png'),
  });
});

test('retains per-person text and mirrored GIF drafts without reconnecting the socket', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await input(page).fill('Saturday works for me.');
  await input(page).press('Shift+Enter');
  await input(page).pressSequentially('I will bring coffee.');
  await page.getByRole('button', { name: 'Add a GIF' }).click();
  const picker = page.getByRole('group', { name: 'GIF picker' });
  await expect(
    picker.getByRole('img', { name: 'Powered By GIPHY', exact: true })
  ).toBeVisible();
  await picker.getByRole('button', { name: /A little celebration/ }).click();
  await expect(page.getByRole('button', { name: 'Remove GIF' })).toBeVisible();
  await row(page, 'Bee Maria').click();
  await expect(input(page, 'Bee Maria')).toHaveValue('');
  await input(page, 'Bee Maria').fill('Bee gets her own draft.');
  await row(page, 'J. Downs').click();
  await expect(input(page)).toHaveValue(
    'Saturday works for me.\nI will bring coffee.'
  );
  await expect(page.getByRole('button', { name: 'Remove GIF' })).toBeVisible();
  await expect(row(page, 'Bee Maria')).toContainText(
    'Draft: Bee gets her own draft.'
  );
  expect(fixture.posts).toEqual([]);
  expect(fixture.mailboxes).toHaveLength(1);
});

test('keeps an asynchronous GIF with the originating draft when changing people', async ({
  page,
}) => {
  let saved: { route: Route; attachment: DraftAttachment } | undefined;
  await openMessages(page, {
    mirror: async (route, attachment) => {
      saved = { route, attachment };
    },
  });
  await input(page).fill('Keep this text.');
  await page.getByRole('button', { name: 'Add a GIF' }).click();
  await page
    .getByRole('group', { name: 'GIF picker' })
    .getByRole('button', { name: /A little celebration/ })
    .click();
  await expect.poll(() => !!saved).toBe(true);
  await input(page).fill('Keep this newer text, too.');
  await row(page, 'Bee Maria').click();
  await input(page, 'Bee Maria').fill('Not the GIF recipient.');
  await saved!.route.fulfill({
    json: { success: true, data: saved!.attachment },
  });
  await expect(page.getByRole('button', { name: 'Remove GIF' })).toHaveCount(0);
  await expect(input(page, 'Bee Maria')).toHaveValue('Not the GIF recipient.');
  await row(page, 'J. Downs').click();
  await expect(input(page)).toHaveValue('Keep this newer text, too.');
  await expect(page.getByRole('button', { name: 'Remove GIF' })).toBeVisible();
});

test('retains a failed message and its attachment, and retries the original recipient exactly once', async ({
  page,
}) => {
  const fixture = await openMessages(page, { failSends: 1 });
  await input(page).fill('Keep these exact words.');
  await page.getByRole('button', { name: 'Add a GIF' }).click();
  await page
    .getByRole('group', { name: 'GIF picker' })
    .getByRole('button', { name: /A little celebration/ })
    .click();
  await expect(page.getByRole('button', { name: 'Remove GIF' })).toBeVisible();
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(
    conversation(page).getByText('Not sent', { exact: true })
  ).toBeVisible();
  await input(page).fill('A new draft must survive the retry.');
  await row(page, 'Bee Maria').click();
  await expect(
    conversation(page).getByText('Not sent', { exact: true })
  ).toHaveCount(0);
  await row(page, 'J. Downs').click();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    conversation(page).getByText('Not sent', { exact: true })
  ).toHaveCount(0);
  await expect(
    conversation(page).getByText('Sending', { exact: true })
  ).toHaveCount(0);
  await expect(
    history(page).getByText('Keep these exact words.', { exact: true })
  ).toHaveCount(1);
  await expect(input(page)).toHaveValue('A new draft must survive the retry.');
  expect(fixture.posts).toHaveLength(2);
  expect(fixture.posts[1]).toEqual(fixture.posts[0]);
  expect(fixture.posts[1]).toMatchObject({
    visibility: 'direct',
    recipientActorIds: ['jdowns'],
    content: 'Keep these exact words.',
    attachments: [fixture.attachment],
  });
});

test('settles concurrent sends in their own conversations after a thread switch', async ({
  page,
}) => {
  let delayed: Route | undefined;
  const fixture = await openMessages(page, {
    send: async (route, submitted, commit) => {
      if (submitted.recipientActorIds[0] === 'jdowns') {
        delayed = route;
        return;
      }
      await commit();
    },
  });
  await input(page).fill('Slow message to J.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(
    conversation(page).getByText('Sending', { exact: true })
  ).toBeVisible();
  await row(page, 'Bee Maria').click();
  await input(page, 'Bee Maria').fill('Fast message to Bee.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(
    history(page).getByText('Fast message to Bee.', { exact: true })
  ).toHaveCount(1);
  await expect(
    conversation(page).getByText('Sending', { exact: true })
  ).toHaveCount(0);
  await delayed!.fulfill({
    status: 503,
    json: { success: false, error: 'Try J again later.' },
  });
  await expect(
    conversation(page).getByText('Not sent', { exact: true })
  ).toHaveCount(0);
  await row(page, 'J. Downs').click();
  await expect(
    conversation(page).getByText('Not sent', { exact: true })
  ).toBeVisible();
  await expect(
    history(page).getByText('Slow message to J.', { exact: true })
  ).toBeVisible();
  expect(fixture.posts.map((post) => post.recipientActorIds)).toEqual([
    ['jdowns'],
    ['bee'],
  ]);
});

test('keeps an acknowledged bubble until its exact server row arrives, including repeated text', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  fixture.state.deferAcknowledgements = true;
  await input(page).fill('Repeat these words.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(
    conversation(page).getByText('Sending', { exact: true })
  ).toHaveCount(0);
  await expect(
    history(page).getByText('Repeat these words.', { exact: true })
  ).toHaveCount(2);
  fixture.state.hiddenStatusIds.clear();
  fixture.notify('jdowns');
  await expect
    .poll(
      () =>
        fixture.calls.filter(
          (call) => call === 'GET /api/social/messages/conversations/jdowns'
        ).length
    )
    .toBeGreaterThan(2);
  await expect(
    history(page).getByText('Repeat these words.', { exact: true })
  ).toHaveCount(2);
  expect(fixture.posts).toHaveLength(1);
});

test('preserves reading position on socket delivery and offers an accurate jump to latest', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await history(page).evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(
    page.getByRole('button', { name: 'Back to latest', exact: true })
  ).toBeVisible();
  fixture.messages.jdowns.push(
    fixture.makeMessage(
      'incoming-one',
      fixture.people.jdowns,
      '<p>A new update from the table.</p>'
    )
  );
  fixture.notify('jdowns');
  await expect(
    page.getByRole('button', { name: '1 new message', exact: true })
  ).toBeVisible();
  expect(await history(page).evaluate((element) => element.scrollTop)).toBe(0);
  fixture.messages.jdowns.push(
    fixture.makeMessage(
      'incoming-two',
      fixture.people.jdowns,
      '<p>And one more detail.</p>'
    )
  );
  fixture.notify('jdowns');
  await expect(
    page.getByRole('button', { name: '2 new messages', exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: '2 new messages', exact: true })
    .click();
  await expect
    .poll(() =>
      history(page).evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight
      )
    )
    .toBeLessThan(3);
});

test('separates conversation filtering from the authenticated new-person picker', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await page
    .getByRole('searchbox', { name: 'Find a conversation by name or handle' })
    .fill('No such conversation');
  await expect(page.getByText('No matching conversations.')).toBeVisible();
  expect(fixture.searchTerms).toEqual([]);
  await page.getByRole('button', { name: 'New message', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('searchbox', { name: 'Find a pana', exact: true })
  ).toBeFocused();
  await dialog
    .getByRole('searchbox', { name: 'Find a pana', exact: true })
    .fill('@sofia');
  await expect(dialog.getByRole('button', { name: /Claribel/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: /Sofia Morales/ }).click();
  await expect(input(page, 'Sofia Morales')).toBeFocused();
  await expect(
    conversation(page).getByText('Say a little hello.', { exact: true })
  ).toBeVisible();
  await expect(row(page, 'Sofia Morales')).toBeVisible();
  await input(page, 'Sofia Morales').fill('Hola Sofia!');
  await input(page, 'Sofia Morales').press('Enter');
  await expect(
    history(page).getByText('Hola Sofia!', { exact: true })
  ).toHaveCount(1);
  expect(fixture.posts[0].recipientActorIds).toEqual(['sofia']);
  expect(fixture.searchTerms).toContain('sofia');
});

test('requires request acceptance, exposes triage failures, and handles aged-out requests', async ({
  page,
}) => {
  await openMessages(page, { failAccepts: 1, failDeletes: 1 });
  await page.getByRole('button', { name: 'Requests (2)', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Accept request', exact: true })
  ).toBeVisible();
  await expect(conversation(page).getByRole('textbox')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Accept request', exact: true })
    .click();
  await expect(conversation(page).getByRole('alert')).toContainText(
    'Could not accept this request.'
  );
  await expect(conversation(page).getByRole('textbox')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Accept request', exact: true })
    .click();
  await expect(input(page, 'Anette Mago')).toBeVisible();
  await page.getByRole('button', { name: 'Requests (1)', exact: true }).click();
  await expect(
    conversation(page).getByText('A request is still waiting.')
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Message requests', exact: true })
  ).toContainText('Stella Perez');
  await page
    .getByRole('button', { name: 'Delete request', exact: true })
    .click();
  await expect(conversation(page).getByRole('alert')).toContainText(
    'Could not delete this request.'
  );
  await page
    .getByRole('button', { name: 'Delete request', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Requests (0)', exact: true })
  ).toBeVisible();
  await expect(
    conversation(page).getByText('No message requests waiting for you.')
  ).toBeVisible();
});

test('keeps federation, voice attachments, and the shared refusal states intact', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await row(page, 'Mart Ruiz').click();
  await expect(
    conversation(page).getByText('On indieweb.social.')
  ).toBeVisible();
  await row(page, 'Bee Maria').click();
  await expect(conversation(page).locator('audio')).toHaveCount(1);
  await expect
    .poll(() =>
      conversation(page)
        .locator('audio')
        .evaluate((element) => {
          if (!(element instanceof HTMLAudioElement))
            throw new Error('Expected the voice player.');
          return element.duration;
        })
    )
    .toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  const voice = await conversation(page).locator('audio').boundingBox();
  expect(voice!.x + voice!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: test.info().outputPath('messages-mobile-voice.png'),
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await row(page, 'R. Nieves').click();
  await expect(
    conversation(page).getByText(DIRECT_THREAD_REFUSED, { exact: true })
  ).toBeVisible();
  await expect(conversation(page).getByRole('textbox')).toHaveCount(0);
  await row(page, 'J. Downs').click();
  await input(page).fill('Keep this even if the policy changed.');
  fixture.state.refusedActors.add('jdowns');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(
    conversation(page).getByText('Not sent', { exact: true })
  ).toBeVisible();
  await expect(conversation(page).getByRole('textbox')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true })
  ).toHaveCount(0);
  await expect(
    history(page).getByText('Keep this even if the policy changed.', {
      exact: true,
    })
  ).toBeVisible();
});

test('uses mobile list/detail navigation and keeps a multiline GIF composer visible in a short viewport', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(conversation(page)).toBeHidden();
  await row(page, 'J. Downs').click();
  await input(page).fill('My mobile draft');
  await page.getByRole('button', { name: 'Back to conversations' }).click();
  await expect(row(page, 'J. Downs')).toBeFocused();
  await row(page, 'J. Downs').click();
  await expect(input(page)).toHaveValue('My mobile draft');
  await page.setViewportSize({ width: 390, height: 520 });
  await input(page).fill(
    'Saturday works.\nI can bring coffee.\nAnd a few prints.\nWe can set up by the door.\nSee you there!'
  );
  await page.getByRole('button', { name: 'Add a GIF' }).click();
  const picker = page.getByRole('group', { name: 'GIF picker' });
  const popup = await picker.boundingBox();
  expect(popup!.y).toBeGreaterThanOrEqual(0);
  await picker.getByRole('button', { name: /A little celebration/ }).click();
  await expect(page.getByRole('button', { name: 'Remove GIF' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a GIF' }).click();
  const reopened = await picker.boundingBox();
  const pane = await conversation(page).boundingBox();
  expect(reopened!.y).toBeGreaterThanOrEqual(pane!.y);
  expect(reopened!.y + reopened!.height).toBeLessThanOrEqual(
    pane!.y + pane!.height
  );
  await picker
    .getByRole('button', { name: 'Close GIF picker', exact: true })
    .click();
  const send = await page
    .getByRole('button', { name: 'Send message', exact: true })
    .boundingBox();
  expect(send!.y + send!.height).toBeLessThan(520);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight)
  ).toBeLessThanOrEqual(520);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: test.info().outputPath('messages-mobile-composer.png'),
  });
  await input(page).dispatchEvent('keydown', {
    key: 'Enter',
    isComposing: true,
  });
  expect(fixture.posts).toHaveLength(0);
  await input(page).press('Enter');
  await expect.poll(() => fixture.posts.length).toBe(1);
  expect(fixture.posts[0].content).toContain('\n');
});

test('does not require a live socket to send an HTTP message', async ({
  page,
}) => {
  const fixture = await openMessages(page, { gifsEnabled: false });
  await fixture.mailboxes[0].close({
    code: 1000,
    reason: 'Fixture disconnect',
  });
  await expect(page.getByRole('button', { name: 'Add a GIF' })).toHaveCount(0);
  await input(page).fill('HTTP still works without the socket.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(
    history(page).getByText('HTTP still works without the socket.', {
      exact: true,
    })
  ).toHaveCount(1);
  await expect(
    conversation(page).getByText('Sending', { exact: true })
  ).toHaveCount(0);
  await expect(conversation(page).getByText(/queued/i)).toHaveCount(0);
  expect(fixture.posts).toHaveLength(1);
});

test('leaves private content and messaging requests unmounted when signed out', async ({
  page,
}) => {
  const fixture = await openMessages(page, { signedIn: false });
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true })
  ).toHaveAttribute('href', '/signin?callbackUrl=%2Fmessages');
  await expect(conversation(page)).toHaveCount(0);
  expect(
    fixture.calls.some((call) => call.includes('/api/social/messages/'))
  ).toBe(false);
  expect(fixture.mailboxes).toHaveLength(0);
});

test('releases the viewport layout when leaving Messages', async ({ page }) => {
  await openMessages(page);
  await page.getByRole('link', { name: 'Pana Social home' }).click();
  await expect(page).toHaveURL(/\/s(?:\?|$)/);
  await expect(page.locator('[data-messages-workspace]')).toHaveCount(0);
  expect(
    await page.evaluate(() => getComputedStyle(document.body).overflow)
  ).not.toBe('hidden');
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).overflowY
    )
  ).not.toBe('hidden');
  expect(
    await page.evaluate(() =>
      document.body.style.getPropertyValue('--messages-viewport-height')
    )
  ).toBe('');
});

test('retains a GIF mirror failure in the original draft and lets the person try again', async ({
  page,
}) => {
  let delayed: Route | undefined;
  let attempts = 0;
  await openMessages(page, {
    mirror: async (route, attachment) => {
      if (++attempts === 1) {
        delayed = route;
        return;
      }
      await route.fulfill({ json: { success: true, data: attachment } });
    },
  });
  await input(page).fill('My caption survives a GIF failure.');
  await page.getByRole('button', { name: 'Add a GIF' }).click();
  await page
    .getByRole('group', { name: 'GIF picker' })
    .getByRole('button', { name: /A little celebration/ })
    .click();
  await expect.poll(() => !!delayed).toBe(true);
  await row(page, 'Bee Maria').click();
  await delayed!.fulfill({
    status: 503,
    json: { success: false, error: 'Could not save this GIF.' },
  });
  await row(page, 'J. Downs').click();
  await expect(conversation(page).getByRole('alert')).toHaveText(
    'Could not save this GIF.'
  );
  await expect(input(page)).toHaveValue('My caption survives a GIF failure.');
  await page.getByRole('button', { name: 'Add a GIF' }).click();
  await page
    .getByRole('group', { name: 'GIF picker' })
    .getByRole('button', { name: /A little celebration/ })
    .click();
  await expect(page.getByRole('button', { name: 'Remove GIF' })).toBeVisible();
  await expect(conversation(page).getByRole('alert')).toHaveCount(0);
});

test('makes people-search failures explicit and retryable', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  fixture.state.failSearch = true;
  await page.getByRole('button', { name: 'New message', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('searchbox', { name: 'Find a pana', exact: true })
    .fill('sofia');
  await expect(dialog.getByRole('alert')).toContainText(
    'People search is unavailable.'
  );
  await expect(
    dialog.getByText('No panas match that. Try another name.')
  ).toHaveCount(0);
  fixture.state.failSearch = false;
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: /Sofia Morales/ })
  ).toBeVisible();
});

test('checks Requests before permitting a reply and preserves the draft through a refresh failure', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await input(page).fill('Keep this while requests are checked.');
  fixture.state.failRequests = true;
  fixture.notify('jdowns');
  const warning = conversation(page)
    .getByRole('status')
    .filter({ hasText: 'Could not check message requests.' });
  await expect(warning).toBeVisible();
  await expect(input(page)).toHaveCount(0);
  fixture.state.failRequests = false;
  await warning.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(input(page)).toHaveValue(
    'Keep this while requests are checked.'
  );
});

test('hides an unavailable cached thread and keeps mobile Back and recovery available', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await row(page, 'J. Downs').click();
  await input(page).fill('Keep this draft through a connection check.');
  fixture.state.unavailableActors.add('jdowns');
  fixture.notify('jdowns');
  await expect(conversation(page).getByRole('alert')).toHaveText(
    'This conversation is not available.'
  );
  await expect(history(page)).toHaveCount(0);
  await expect(input(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to conversations' }).click();
  await expect(row(page, 'J. Downs')).toBeFocused();
  fixture.state.unavailableActors.clear();
  await row(page, 'J. Downs').click();
  await conversation(page)
    .getByRole('button', { name: 'Try again', exact: true })
    .click();
  await expect(input(page)).toHaveValue(
    'Keep this draft through a connection check.'
  );
});

test('clears local drafts and failed bubbles and reconnects the mailbox when switching profiles', async ({
  page,
}) => {
  const fixture = await openMessages(page, { failSends: 1 });
  await input(page).fill('A private personal attempt.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(
    conversation(page).getByText('Not sent', { exact: true })
  ).toBeVisible();
  await input(page).fill('A private personal draft.');
  await page.getByRole('button', { name: /Claribel/ }).click();
  await page.getByRole('menuitem', { name: /Neighborhood Studio/ }).click();
  await expect.poll(() => fixture.state.activeProfile).toBe('business');
  await expect(
    page.getByText('A private personal attempt.', { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByText('A private personal draft.', { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Good conversations live here.' })
  ).toBeVisible();
  await expect.poll(() => fixture.mailboxes.length).toBeGreaterThan(1);
  await page.getByRole('button', { name: /Neighborhood Studio/ }).click();
  await page.getByRole('menuitem', { name: /Claribel/ }).click();
  await expect(input(page)).toHaveValue('');
  await expect(
    conversation(page).getByText('Not sent', { exact: true })
  ).toHaveCount(0);
  await expect.poll(() => fixture.mailboxes.length).toBeGreaterThan(2);
});

test('shows a newer server reply in the sidebar while an acknowledged bubble waits for its thread refresh', async ({
  page,
}) => {
  let acknowledge: (() => Promise<void>) | undefined;
  const fixture = await openMessages(page, {
    send: async (_route, _submitted, commit) => {
      acknowledge = commit;
    },
  });
  await input(page).fill('My earlier outgoing message.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(() => !!acknowledge).toBe(true);
  await row(page, 'Bee Maria').click();
  await expect(input(page, 'Bee Maria')).toBeVisible();
  await acknowledge!();
  fixture.messages.jdowns.push(
    fixture.makeMessage(
      'newer-reply',
      fixture.people.jdowns,
      '<p>A newer reply from J.</p>'
    )
  );
  fixture.notify('jdowns');
  await expect(row(page, 'J. Downs')).toContainText('A newer reply from J.');
  await expect(row(page, 'J. Downs')).not.toContainText(
    'My earlier outgoing message.'
  );
  await row(page, 'J. Downs').click();
  await expect(
    history(page).getByText('My earlier outgoing message.', { exact: true })
  ).toHaveCount(1);
  await expect(
    history(page).getByText('A newer reply from J.', { exact: true })
  ).toHaveCount(1);
});

test('keeps the refreshed mobile chat full-width with 44px primary controls', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  fixture.messages.jdowns.splice(
    0,
    fixture.messages.jdowns.length,
    fixture.makeMessage(
      'preview-1',
      fixture.people.jdowns,
      '<p>Hey! Are we still on for Saturday?</p>',
      12
    ),
    fixture.makeMessage(
      'preview-2',
      fixture.viewer,
      '<p>Yes! The back room is ours from ten.</p>',
      11
    ),
    fixture.makeMessage(
      'preview-3',
      fixture.people.jdowns,
      '<p>Lovely. I will bring a few prints for the table.</p>',
      10
    ),
    fixture.makeMessage(
      'preview-4',
      fixture.viewer,
      '<p>And I will bring the coffee. See you there!</p>',
      9
    )
  );
  fixture.notify('jdowns');
  await expect(
    history(page).getByText('And I will bring the coffee. See you there!', {
      exact: true,
    })
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(conversation(page)).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(
    390
  );
  await page.screenshot({
    path: test.info().outputPath('messages-mobile-list.png'),
  });
  await row(page, 'J. Downs').click();
  await expect(input(page)).toBeVisible();
  for (const name of [
    'Back to conversations',
    'Conversation details',
    'Add a GIF',
    'Send message',
  ]) {
    const target = await page
      .getByRole('button', { name, exact: true })
      .boundingBox();
    expect(target?.width, `${name} width`).toBeGreaterThanOrEqual(44);
    expect(target?.height, `${name} height`).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: test.info().outputPath('messages-mobile-chat.png'),
  });
});
