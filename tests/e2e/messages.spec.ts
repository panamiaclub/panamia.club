import {
  expect,
  test,
  type Page,
  type Route,
  type WebSocketRoute,
} from '@playwright/test';
import type { SocialActorDisplay, SocialStatusDisplay } from '@/lib/interfaces';
import type { DraftAttachment } from '@/lib/query/social';
import type { GroupChatMessage, GroupChatRoom } from '@/lib/chat';
import { DIRECT_THREAD_REFUSED } from '@/lib/dm-refusal';
import { calls as nativeCalls, nativeBridge } from './fixtures/native-bridge';
import {
  chatPhotoFile,
  chooseChatPhoto,
  installChatPhotoFixtures,
} from './fixtures/chat-photo';

const conversation = (page: Page) =>
  page.getByRole('region', { name: 'Open conversation' });
const history = (page: Page) => page.getByRole('log');
const input = (page: Page, name = 'J. Downs') =>
  page.getByRole('textbox', { name: `Message ${name}`, exact: true });
const row = (page: Page, name: string) =>
  page
    .getByRole('list', { name: 'Conversations', exact: true })
    .getByRole('button', { name: new RegExp(name) })
    .and(page.locator('[data-conversation-kind="direct"]'));

interface DirectMessagePost {
  content: string;
  visibility: string;
  recipientActorIds: string[];
  attachments?: DraftAttachment[];
}

interface FixtureOptions {
  native?: 'android' | 'ios';
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
  if (options.native) {
    await nativeBridge(page, {
      platform: options.native,
      googlePlugin: options.native === 'android',
    });
  }
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

  const group: GroupChatRoom = {
    id: 'group-garden',
    actorId: 'garden-actor',
    handle: 'garden',
    name: 'Garden Crew',
    iconUrl: null,
    memberCount: 3,
    visibility: 'private',
    role: 'member',
  };
  const groupMessages: GroupChatMessage[] = [
    {
      id: 'garden-first',
      groupId: group.id,
      clientId: null,
      actor: people.bee,
      content: '<p>Bring your favorite plants on Saturday.</p>',
      published: new Date(now - 600_000).toISOString(),
      expiresAt: new Date(now + 29 * 86_400_000).toISOString(),
      canDelete: false,
    },
  ];
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
    failGroups: false,
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
  const notifyGroup = () => {
    for (const mailbox of mailboxes) {
      mailbox.send(
        JSON.stringify({
          type: 'group',
          groupId: group.id,
          kind: 'message',
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
  await page.route('https://media.giphy.com/**', (route) =>
    route.fulfill({ contentType: 'image/gif', body: gifPixel })
  );
  await page.route('**/fixture/mirrored.gif', (route) =>
    route.fulfill({ contentType: 'image/gif', body: gifPixel })
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
    if (path === '/api/social/messages/groups') {
      if (state.failGroups)
        return json(
          route,
          { success: false, error: 'Group chats are unavailable.' },
          503
        );
      return json(route, {
        success: true,
        data: {
          viewerActorId: currentViewer().id,
          localDomain: 'localhost',
          groups:
            state.activeProfile === 'business'
              ? []
              : [{ ...group, lastMessage: groupMessages.at(-1) ?? null }],
        },
      });
    }
    if (path === '/api/social/groups/garden/chat') {
      if (state.activeProfile !== 'personal')
        return json(route, { success: false, error: 'Not found' }, 404);
      return json(route, {
        success: true,
        data: {
          group,
          messages: groupMessages,
          viewerActorId: currentViewer().id,
          localDomain: 'localhost',
          nextCursor: null,
        },
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
    if (path === '/api/notifications/unread-count')
      return json(route, { success: true, data: { count: 0 } });
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
    group,
    groupMessages,
    notifyGroup,
  };
}

test('uses the real masthead with a bounded desktop workspace and no mock controls', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await expect(
    page.getByRole('heading', { name: 'Messages', exact: true })
  ).toHaveClass('sr-only');
  await expect(page.getByText('A little closer', { exact: true })).toHaveCount(
    0
  );
  await expect(
    page.getByText('Good conversations start here.', { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('searchbox', {
      name: 'Find a conversation by name or handle',
    })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'New message', exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('group', { name: 'Message folders' }).getByRole('button')
  ).toHaveText(['Messages', 'Requests (2)']);
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

test('keeps individual and group conversations in one live inbox without mixing their drafts or delivery', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  const inbox = page.getByRole('list', {
    name: 'Conversations',
    exact: true,
  });
  const room = inbox
    .getByRole('button', { name: /Garden Crew/ })
    .and(page.locator('[data-conversation-kind="group"]'));
  await expect(inbox.getByRole('button').first()).toContainText('J. Downs');
  await expect(inbox.getByRole('button').nth(1)).toContainText('Garden Crew');
  await input(page).fill('Only this person gets my draft.');
  await room.click();
  const groupInput = input(page, 'Garden Crew');
  await expect(groupInput).toHaveValue('');
  await groupInput.fill('Only this group gets its draft.');
  await row(page, 'J. Downs').click();
  await expect(input(page)).toHaveValue('Only this person gets my draft.');
  await expect(room).toContainText('Draft: Only this group gets its draft.');
  fixture.groupMessages.push({
    ...fixture.groupMessages[0],
    id: 'garden-latest',
    content: '<p>A live group update.</p>',
    published: new Date().toISOString(),
  });
  fixture.notifyGroup();
  await expect(inbox.getByRole('button').first()).toContainText('Garden Crew');
  await expect(input(page)).toHaveValue('Only this person gets my draft.');
  await input(page).press('Enter');
  await expect.poll(() => fixture.posts.length).toBe(1);
  expect(fixture.posts[0]).toMatchObject({
    recipientActorIds: ['jdowns'],
    visibility: 'direct',
    content: 'Only this person gets my draft.',
  });
  await room.click();
  await expect(groupInput).toHaveValue('Only this group gets its draft.');
  await expect(history(page).getByText('A live group update.')).toBeVisible();
  expect(fixture.mailboxes).toHaveLength(1);
});

test('keeps individual conversations usable when the group list fails and can recover it', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await input(page).fill('Keep this draft through a group outage.');
  fixture.state.failGroups = true;
  fixture.notifyGroup();
  const error = page.getByRole('alert').filter({
    hasText: 'Could not load group chats.',
  });
  await expect(error).toBeVisible();
  await expect(input(page)).toHaveValue(
    'Keep this draft through a group outage.'
  );
  await expect(row(page, 'J. Downs')).toBeVisible();
  fixture.state.failGroups = false;
  await error.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect(
    page
      .getByRole('list', { name: 'Conversations', exact: true })
      .getByRole('button', { name: /Garden Crew/ })
  ).toBeVisible();
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

test('opens a new text conversation from the profile target without inbox search or compose controls', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await page.goto('/messages?to=sofia');
  await expect(input(page, 'Sofia Morales')).toBeFocused();
  expect(fixture.searchTerms).toEqual([]);
  await expect(
    page.getByRole('button', { name: 'New message', exact: true })
  ).toHaveCount(0);
  await expect(
    conversation(page).getByText('Say a little hello.', { exact: true })
  ).toBeVisible();
  await expect(row(page, 'Sofia Morales')).toBeVisible();
  await input(page, 'Sofia Morales').fill('Hola Sofia!');
  await input(page, 'Sofia Morales').press('Enter');
  await expect(
    history(page).getByText('Hola Sofia!', { exact: true })
  ).toHaveCount(1);
  await expect.poll(() => fixture.posts.length).toBe(1);
  expect(fixture.posts[0].recipientActorIds).toEqual(['sofia']);
  expect(fixture.searchTerms).toEqual([]);
});

test('opens a held profile-target conversation in Requests without accepting it or allowing a reply', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await page.goto('/messages?to=anette');
  await expect(
    page.getByRole('button', { name: 'Requests (2)', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(input(page, 'Anette Mago')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Accept request', exact: true })
  ).toBeVisible();
  expect(fixture.posts).toHaveLength(0);
  expect(fixture.calls.filter((call) => call.startsWith('PATCH '))).toEqual([]);
  await page
    .getByRole('button', { name: 'Accept request', exact: true })
    .click();
  await expect(input(page, 'Anette Mago')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Messages', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
});

test('reports an incoming message in-app without exposing an attachment picker', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await row(page, 'J. Downs').click();
  await history(page)
    .locator('[data-chat-message-id="last-existing"]')
    .getByRole('button', { name: 'Report message', exact: true })
    .click();
  const report = page.getByRole('dialog', {
    name: 'Report a safety concern',
    exact: true,
  });
  await expect(report).toBeVisible();
  await expect(report.getByLabel('Report about')).toHaveValue('content');
  await expect(report.getByLabel('User or content URL')).toHaveValue(
    /#message-last-existing$/
  );
  await expect(report.locator('input[type=file]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(report).toHaveCount(0);
  await expect(
    history(page).getByText('See you Saturday!', { exact: true })
  ).toBeVisible();
  await input(page, 'J. Downs').fill(
    'The composer still works after reporting.'
  );
  await conversation(page)
    .getByRole('button', { name: 'Send message', exact: true })
    .click();
  await expect.poll(() => fixture.posts.length).toBe(1);
  await expect(
    history(page).getByText('The composer still works after reporting.', {
      exact: true,
    })
  ).toHaveCount(1);
});

test('the user report menu hands keyboard focus to a private report without accepting the request', async ({
  page,
}) => {
  await openMessages(page);
  await page.goto('/updates');
  await page.getByRole('tab', { name: /^Requests/ }).click();
  const more = page.getByRole('button', {
    name: 'More options for Anette Mago',
    exact: true,
  });
  await more.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('menuitem', { name: 'Report Anette Mago', exact: true })
    .click();
  const report = page.getByRole('dialog', {
    name: 'Report a safety concern',
    exact: true,
  });
  await expect(report.getByLabel('Report about')).toHaveValue('user');
  await expect(report.getByLabel('User or content URL')).toHaveValue(
    'https://localhost/users/anette'
  );
  await expect(report.getByLabel('Name', { exact: true })).toBeFocused();
  await expect(report.locator('input[type=file]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(more).toBeVisible();
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

test('hides legacy audio while keeping federation, message text, and refusal states intact', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  await row(page, 'Mart Ruiz').click();
  await expect(
    conversation(page).getByText('On indieweb.social.')
  ).toBeVisible();
  await row(page, 'Bee Maria').click();
  await expect(conversation(page).locator('audio')).toHaveCount(0);
  await expect(
    conversation(page).getByText('I recorded a few thoughts.')
  ).toBeVisible();
  await expect(
    conversation(page).getByText('Attachment unavailable.', { exact: true })
  ).toBeVisible();
  await expect(
    conversation(page).locator('[src="/fixture/voice.wav"]')
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const notice = await conversation(page)
    .getByText('Attachment unavailable.', { exact: true })
    .boundingBox();
  expect(notice!.x + notice!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: test.info().outputPath('messages-mobile-retired-audio.png'),
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
  expect(fixture.posts).toHaveLength(0);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(() => fixture.posts.length).toBe(1);
  expect(fixture.posts[0].content).toContain('\n');
});

test(
  'compact native composer grows from one row and phone Return adds a line without sending',
  { tag: '@native' },
  async ({ page }) => {
    const fixture = await openMessages(page, { native: 'ios' });
    await page.setViewportSize({ width: 320, height: 568 });
    await row(page, 'J. Downs').click();
    const composer = page.getByRole('form', { name: 'Message composer' });
    await expect
      .poll(async () => (await composer.boundingBox())!.height)
      .toBeLessThanOrEqual(52);
    expect((await input(page).boundingBox())!.height).toBeLessThanOrEqual(48);
    const short = history(page).locator(
      '[data-chat-message-id="last-existing"]'
    );
    expect((await short.boundingBox())!.height).toBeLessThanOrEqual(64);
    for (const name of ['Attach a photo', 'Add a GIF', 'Send message']) {
      const box = (await page
        .getByRole('button', { name, exact: true })
        .boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await input(page).fill('A phone draft');
    await input(page).press('Enter');
    await expect(input(page)).toHaveValue('A phone draft\n');
    expect(fixture.posts).toHaveLength(0);
    await input(page).fill('A growing message.\n'.repeat(16));
    await expect
      .poll(async () => (await input(page).boundingBox())!.height)
      .toBeGreaterThan(80);
    expect((await input(page).boundingBox())!.height).toBeLessThanOrEqual(128);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(320);
    await input(page).fill('');
    await expect
      .poll(async () => (await composer.boundingBox())!.height)
      .toBeLessThanOrEqual(52);
    await input(page).blur();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () =>
        Math.round(
          (await page.locator('[data-native-app]').boundingBox())!.height
        )
      )
      .toBe(844);
    fixture.messages.jdowns.splice(
      0,
      fixture.messages.jdowns.length,
      fixture.makeMessage(
        'compact-one',
        fixture.people.jdowns,
        '<p>Are we meeting on Saturday?</p>',
        6
      ),
      fixture.makeMessage(
        'compact-two',
        fixture.viewer,
        '<p>Yes! I will bring coffee.</p>',
        5
      ),
      fixture.makeMessage(
        'compact-three',
        fixture.people.jdowns,
        '<p>Perfect. See you there!</p>',
        4
      )
    );
    fixture.notify('jdowns');
    await expect(
      history(page).getByText('Perfect. See you there!')
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /new messages?$/ })
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        const box = (await composer.boundingBox())!;
        return box.y + box.height;
      })
      .toBeGreaterThan(800);
    const preview = test.info().outputPath('compact-chat-preview.png');
    await page.screenshot({ path: preview });
    await test.info().attach('compact-chat-preview', {
      path: preview,
      contentType: 'image/png',
    });
  }
);

test(
  'attaches a normalized photo through the real upload contract and sends it without a caption',
  { tag: '@native' },
  async ({ page }) => {
    const fixture = await openMessages(page, { native: 'ios' });
    const photos = await installChatPhotoFixtures(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await row(page, 'J. Downs').click();
    await chooseChatPhoto(page, await chatPhotoFile(page));
    await expect(
      page.getByRole('img', { name: 'Attached photo', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Send message', exact: true })
    ).toBeEnabled();
    expect(photos.uploads).toHaveLength(1);
    expect(fixture.posts).toHaveLength(0);
    const preview = test.info().outputPath('compact-chat-photo-preview.png');
    await page.screenshot({ path: preview });
    await test.info().attach('compact-chat-photo-preview', {
      path: preview,
      contentType: 'image/png',
    });
    await page
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect.poll(() => fixture.posts.length).toBe(1);
    expect(fixture.posts[0]).toMatchObject({
      content: '',
      visibility: 'direct',
      recipientActorIds: ['jdowns'],
      attachments: [
        {
          type: 'image',
          mediaType: 'image/jpeg',
          url: photos.uploads[0].url,
          name: 'camera.jpg',
        },
      ],
    });
    await expect(
      history(page).locator(`img[src="${photos.uploads[0].url}"]`)
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Remove photo', exact: true })
    ).toHaveCount(0);
  }
);

test('keeps failed photo uploads and captions with their originating person and retries without a text-only send', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  const photos = await installChatPhotoFixtures(page, { failUploads: 1 });
  await input(page).fill('Keep this photo caption.');
  await chooseChatPhoto(page, await chatPhotoFile(page));
  await expect(conversation(page).getByRole('alert')).toContainText(
    'Photo upload is unavailable.'
  );
  await expect(
    page.getByRole('button', { name: 'Send message', exact: true })
  ).toBeDisabled();
  await row(page, 'Bee Maria').click();
  await input(page, 'Bee Maria').fill('Different conversation draft.');
  await expect(
    page.getByRole('button', { name: 'Remove photo', exact: true })
  ).toHaveCount(0);
  await row(page, 'J. Downs').click();
  await expect(input(page)).toHaveValue('Keep this photo caption.');
  await page
    .getByRole('button', { name: 'Retry photo upload', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Send message', exact: true })
  ).toBeEnabled();
  expect(photos.uploads).toHaveLength(2);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(() => fixture.posts.length).toBe(1);
  expect(fixture.posts[0].recipientActorIds).toEqual(['jdowns']);
  expect(fixture.posts[0].content).toBe('Keep this photo caption.');
  await row(page, 'Bee Maria').click();
  await expect(input(page, 'Bee Maria')).toHaveValue(
    'Different conversation draft.'
  );
});

test('finishes an asynchronous photo upload in the original draft without attaching it to another person', async ({
  page,
}) => {
  await openMessages(page);
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const photos = await installChatPhotoFixtures(page, {
    hold: async () => waiting,
  });
  await input(page).fill('Original photo caption.');
  await chooseChatPhoto(page, await chatPhotoFile(page));
  await expect.poll(() => photos.uploads.length).toBe(1);
  await row(page, 'Bee Maria').click();
  release!();
  await expect(
    page.getByRole('button', { name: 'Remove photo', exact: true })
  ).toHaveCount(0);
  await row(page, 'J. Downs').click();
  await expect(
    page.getByRole('button', { name: 'Remove photo', exact: true })
  ).toBeEnabled();
  await expect(input(page)).toHaveValue('Original photo caption.');
});

test('rejects unsupported photo files without uploading or silently sending the caption alone', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  const photos = await installChatPhotoFixtures(page);
  await input(page).fill('Do not lose this caption.');
  await page.getByLabel('Choose a photo', { exact: true }).setInputFiles({
    name: 'not-a-photo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg></svg>'),
  });
  await expect(conversation(page).getByRole('alert')).toContainText(
    'Choose a JPEG'
  );
  await expect(
    page.getByRole('button', { name: 'Send message', exact: true })
  ).toBeDisabled();
  expect(photos.uploads).toHaveLength(0);
  expect(fixture.posts).toHaveLength(0);
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(input(page)).toHaveValue('Do not lose this caption.');
  await expect(
    page.getByRole('button', { name: 'Send message', exact: true })
  ).toBeEnabled();
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

test('preserves the selected profile target through the signed-out sign-in link', async ({
  page,
}) => {
  const fixture = await openMessages(page, { signedIn: false });
  await page.goto('/messages?to=sofia');
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true })
  ).toHaveAttribute('href', '/signin?callbackUrl=%2Fmessages%3Fto%3Dsofia');
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

test('keeps an unavailable profile target explicit and retryable', async ({
  page,
}) => {
  const fixture = await openMessages(page);
  fixture.state.unavailableActors.add('sofia');
  await page.goto('/messages?to=sofia');
  await expect(conversation(page).getByRole('alert')).toHaveText(
    'This conversation is not available.'
  );
  await expect(input(page, 'Sofia Morales')).toHaveCount(0);
  fixture.state.unavailableActors.delete('sofia');
  await conversation(page)
    .getByRole('button', { name: 'Try again', exact: true })
    .click();
  await expect(input(page, 'Sofia Morales')).toBeVisible();
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

for (const platform of ['android', 'ios'] as const) {
  test(
    `${platform} gives open direct messages a focused native screen and returns Back to the inbox`,
    { tag: '@native' },
    async ({ page }) => {
      const fixture = await openMessages(page, { native: platform });
      await page.setViewportSize({ width: 390, height: 844 });
      const header = page.locator('[data-native-app] > header');
      const nav = page.getByRole('navigation', { name: 'App navigation' });
      const shortcut = header.getByRole('link', {
        name: 'Messages',
        exact: true,
      });
      const back = header.getByRole('button', {
        name: 'Back to conversations',
        exact: true,
      });
      await expect(nav).toBeVisible();
      await expect(shortcut).toHaveCount(0);
      await expect(
        header.getByRole('button', { name: 'Back', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('group', { name: 'Message folders' }).getByRole('button')
      ).toHaveText(['Messages', 'Requests (2)']);
      await expect(
        page.getByRole('searchbox', {
          name: 'Find a conversation by name or handle',
        })
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'New message', exact: true })
      ).toHaveCount(0);
      const inboxTop = (await row(page, 'J. Downs').boundingBox())!.y;
      const headerBox = (await header.boundingBox())!;
      expect(inboxTop - headerBox.y - headerBox.height).toBeLessThan(100);
      const inboxPreview = test
        .info()
        .outputPath(`native-inbox-preview-${platform}.png`);
      await page.screenshot({ path: inboxPreview });
      await test.info().attach('native-inbox-preview', {
        path: inboxPreview,
        contentType: 'image/png',
      });
      await row(page, 'J. Downs').click();
      await expect(input(page)).toBeVisible();
      await expect(nav).toHaveCount(0);
      await expect(shortcut).toHaveCount(0);
      await expect(back).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Back to conversations', exact: true })
      ).toHaveCount(1);
      await expect(
        page.getByRole('navigation', { name: 'Messaging legal links' })
      ).toHaveCount(0);
      await expect(
        page.getByText('Make yourself at home. Say hello.', { exact: true })
      ).toHaveCount(0);
      const backBox = await back.boundingBox();
      expect(backBox!.width).toBeGreaterThanOrEqual(44);
      expect(backBox!.height).toBeGreaterThanOrEqual(44);
      expect((await history(page).boundingBox())!.height).toBeGreaterThan(500);
      const preview = test
        .info()
        .outputPath(`native-message-focus-${platform}.png`);
      await page.screenshot({ path: preview });
      await test.info().attach('native-message-focus-preview', {
        path: preview,
        contentType: 'image/png',
      });
      await input(page).fill('Keep this focused conversation draft.');
      await expect(
        page.getByText('Your draft stays with this conversation.', {
          exact: true,
        })
      ).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 520 });
      await expect
        .poll(async () => {
          const send = await page
            .getByRole('button', { name: 'Send message', exact: true })
            .boundingBox();
          return send ? send.y + send.height : Infinity;
        })
        .toBeLessThanOrEqual(520);
      await back.click();
      await expect(row(page, 'J. Downs')).toBeFocused();
      await expect(nav).toBeVisible();
      await expect(shortcut).toHaveCount(0);
      await expect(page).toHaveURL(/\/messages$/);
      await page
        .getByRole('group', { name: 'Message folders' })
        .getByRole('button', { name: 'Requests (2)', exact: true })
        .click();
      await expect(
        page.getByRole('list', { name: 'Message requests', exact: true })
      ).toBeVisible();
      await expect(shortcut).toHaveCount(0);
      await expect(
        header.getByRole('button', { name: 'Back', exact: true })
      ).toBeVisible();
      await page
        .getByRole('group', { name: 'Message folders' })
        .getByRole('button', { name: 'Messages', exact: true })
        .click();
      await row(page, 'J. Downs').click();
      await expect(input(page)).toHaveValue(
        'Keep this focused conversation draft.'
      );

      if (platform === 'android') {
        await expect
          .poll(async () =>
            (await nativeCalls(page)).some(
              (call) =>
                call.plugin === 'App' &&
                call.method === 'addListener' &&
                call.args.eventName === 'backButton'
            )
          )
          .toBe(true);
        await header.getByRole('button', { name: /Claribel/ }).click();
        const openMenu = page.locator('[role="menu"][data-state="open"]');
        await expect(openMenu).toBeVisible();
        await page.evaluate(() =>
          window.dispatchEvent(
            new CustomEvent('native-auth-test.back', { detail: true })
          )
        );
        await expect(openMenu).toHaveCount(0);
        await expect(input(page)).toBeVisible();
        await expect(nav).toHaveCount(0);
        await page.evaluate(() =>
          window.dispatchEvent(
            new CustomEvent('native-auth-test.back', { detail: true })
          )
        );
        await expect(row(page, 'J. Downs')).toBeFocused();
        await expect(nav).toBeVisible();
        await expect(page).toHaveURL(/\/messages$/);
      }

      await header
        .getByRole('link', { name: 'Pana Mia directory', exact: true })
        .click();
      await expect(page).toHaveURL(/\/d$/);
      await expect(nav).toBeVisible();
      await expect(shortcut).toBeVisible();
      await expect(back).toHaveCount(0);
      expect(fixture.posts).toHaveLength(0);
      expect(fixture.pageErrors).toEqual([]);
    }
  );
}

for (const platform of ['android', 'ios'] as const) {
  test(
    `${platform} opens a profile-target chat directly and keeps its unsent draft in the unified inbox`,
    { tag: '@native' },
    async ({ page }) => {
      await openMessages(page, { native: platform });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/messages?to=sofia');
      const composer = input(page, 'Sofia Morales');
      await expect(composer).toBeFocused();
      await expect(
        page.getByRole('navigation', { name: 'App navigation' })
      ).toHaveCount(0);
      await composer.fill('A new profile conversation draft.');
      await page
        .locator('[data-native-app] > header')
        .getByRole('button', { name: 'Back to conversations', exact: true })
        .click();
      await expect(row(page, 'Sofia Morales')).toBeFocused();
      await expect(
        page
          .getByRole('list', { name: 'Conversations', exact: true })
          .getByRole('button')
          .first()
      ).toContainText('Sofia Morales');
      await expect(row(page, 'Sofia Morales')).toContainText(
        'Draft: A new profile conversation draft.'
      );
      await expect(
        page.getByRole('navigation', { name: 'App navigation' })
      ).toBeVisible();
      await row(page, 'Sofia Morales').click();
      await expect(composer).toHaveValue('A new profile conversation draft.');
    }
  );
}

test(
  'iOS keeps the focused conversation above an offset keyboard viewport',
  { tag: '@native' },
  async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: Object.assign(new EventTarget(), {
          height: 960,
          offsetTop: 0,
          scale: 1,
        }),
      });
    });
    await openMessages(page, { native: 'ios' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      Object.assign(window.visualViewport!, { height: 844 });
      window.visualViewport!.dispatchEvent(new Event('resize'));
    });
    await row(page, 'J. Downs').click();
    await input(page).fill('An iOS keyboard draft.');
    await page.evaluate(() => {
      Object.assign(window.visualViewport!, { height: 390, offsetTop: 20 });
      window.visualViewport!.dispatchEvent(new Event('resize'));
    });
    await expect
      .poll(async () => {
        const frame = await page.locator('[data-native-app]').boundingBox();
        return {
          top: Math.round(frame!.y),
          height: Math.round(frame!.height),
        };
      })
      .toEqual({ top: 20, height: 390 });
    const send = await page
      .getByRole('button', { name: 'Send message', exact: true })
      .boundingBox();
    expect(send!.y + send!.height).toBeLessThanOrEqual(410);
    await page.evaluate(() => {
      Object.assign(window.visualViewport!, { height: 844, offsetTop: 0 });
      window.visualViewport!.dispatchEvent(new Event('resize'));
    });
    await expect(
      page.getByRole('navigation', { name: 'App navigation' })
    ).toHaveCount(0);
    await page
      .locator('[data-native-app] > header')
      .getByRole('button', { name: 'Back to conversations', exact: true })
      .click();
    await expect(
      page.getByRole('navigation', { name: 'App navigation' })
    ).toBeVisible();
    await expect(row(page, 'J. Downs')).toBeFocused();
  }
);
