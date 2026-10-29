import {
  expect,
  test,
  type Page,
  type Route,
  type WebSocketRoute,
} from '@playwright/test';
import type {
  ChatMessage,
  GroupChatInput,
  GroupChatMessage,
  GroupChatRoom,
} from '@/lib/chat';

const log = (page: Page) => page.getByRole('log');
const compose = (page: Page, name = 'Garden Crew') =>
  page.getByRole('textbox', { name: `Message ${name}`, exact: true });
const groupRow = (page: Page, name: string) =>
  page
    .getByRole('list', { name: 'Group chats', exact: true })
    .getByRole('button', { name: new RegExp(name) });

interface FixtureOptions {
  url?: string;
  role?: GroupChatRoom['role'];
  signedIn?: boolean;
  native?: boolean;
  failSends?: number;
  failDeletes?: number;
  pageSize?: number;
  send?: (
    route: Route,
    input: GroupChatInput,
    commit: () => GroupChatMessage
  ) => Promise<void>;
}

// Production /messages and /g/[handle]/chat components, with only session,
// HTTP and actor-mailbox boundaries replaced. No real group data is changed.
async function openGroupChat(page: Page, options: FixtureOptions = {}) {
  if (options.native) {
    await page.addInitScript(() => {
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      Object.assign(window, { androidBridge: { postMessage: () => {} } });
    });
  }
  const person = (id: string, name: string): ChatMessage['actor'] => ({
    id,
    username: id,
    name,
    domain: 'localhost',
    iconUrl: null,
  });
  const viewer = person('viewer', 'Claribel');
  const business = person('business', 'Neighborhood Studio');
  const bee = person('bee', 'Bee Maria');
  const mart = person('mart', 'Mart Ruiz');
  const rooms: Record<string, GroupChatRoom> = {
    garden: {
      id: 'group-garden',
      actorId: 'garden-actor',
      handle: 'garden',
      name: 'Garden Crew',
      iconUrl: null,
      memberCount: 3,
      visibility: 'private',
      role: options.role ?? 'member',
    },
    workshop: {
      id: 'group-workshop',
      actorId: 'workshop-actor',
      handle: 'workshop',
      name: 'Print Workshop',
      iconUrl: null,
      memberCount: 5,
      visibility: 'public',
      role: 'member',
    },
  };
  const state = {
    activeProfile: 'personal',
    failSends: options.failSends ?? 0,
    failDeletes: options.failDeletes ?? 0,
    failOlder: false,
    denied: new Set<string>(),
    role: options.role ?? 'member',
  };
  let nextId = 0;
  const messages: Record<string, GroupChatMessage[]> = {
    garden: [],
    workshop: [],
  };
  const posts: { handle: string; input: GroupChatInput }[] = [];
  const mailboxes: WebSocketRoute[] = [];
  const errors: string[] = [];
  const calls: string[] = [];
  const currentViewer = () =>
    state.activeProfile === 'business' ? business : viewer;
  const roleFor = (handle: string) =>
    handle === 'garden' ? state.role : 'member';
  const roomFor = (handle: string) => ({
    ...rooms[handle],
    role: roleFor(handle),
  });
  const makeMessage = (
    handle: string,
    actor: ChatMessage['actor'],
    content: string,
    minutesAgo = 0
  ): GroupChatMessage => ({
    id: `${handle}-message-${++nextId}`,
    groupId: rooms[handle].id,
    clientId: null,
    actor,
    content,
    published: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 29 * 86_400_000).toISOString(),
    attachments: [],
    canDelete: false,
  });
  messages.garden.push(
    makeMessage(
      'garden',
      bee,
      '<p>Are we still meeting at the garden on Saturday?</p>',
      20
    ),
    makeMessage(
      'garden',
      viewer,
      '<p>Yes! I can bring coffee and a few extra gloves.</p>',
      19
    ),
    makeMessage(
      'garden',
      mart,
      '<p>I will bring the seedlings. See you there!</p>',
      18
    )
  );
  messages.workshop.push(
    makeMessage(
      'workshop',
      bee,
      '<p>Bring your favorite prints to the workshop.</p>',
      30
    )
  );
  const project = (
    message: GroupChatMessage,
    handle: string
  ): GroupChatMessage => ({
    ...message,
    clientId: message.actor.id === currentViewer().id ? message.clientId : null,
    canDelete:
      message.actor.id === currentViewer().id ||
      ['admin', 'moderator'].includes(roleFor(handle)),
  });
  const unavailable = (handle: string) =>
    state.activeProfile === 'business' ||
    state.denied.has(handle) ||
    !rooms[handle];
  const notify = (
    handle: string,
    kind: 'membership' | 'message' = 'message'
  ) => {
    for (const mailbox of mailboxes)
      mailbox.send(
        JSON.stringify({
          type: 'group',
          groupId: rooms[handle].id,
          kind,
          at: Date.now(),
          ...(kind === 'message'
            ? { messageId: messages[handle].at(-1)?.id ?? 'removed-message' }
            : {}),
        })
      );
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, json: body });
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
  await page.route('https://uploads.chat.invalid/**', (route) =>
    route.fulfill({ contentType: 'image/gif', body: pixel })
  );
  await page.route('https://media.giphy.com/**', (route) =>
    route.fulfill({ contentType: 'image/gif', body: pixel })
  );
  await page.route('**/manifest.webmanifest*', (route) =>
    json(route, { name: 'Pana Social', start_url: '/s', display: 'standalone' })
  );
  page.on('pageerror', (error) => errors.push(error.message));
  await page.routeWebSocket('**/ws/dm', (socket) => {
    mailboxes.push(socket);
    socket.onMessage((message) => {
      if (message === 'ping') socket.send('pong');
    });
    socket.send(JSON.stringify({ type: 'ready' }));
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, '');
    calls.push(`${request.method()} ${path}`);
    if (path === '/api/auth/get-session')
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
    if (path === '/api/user/me')
      return json(route, {
        success: true,
        data: { screenname: 'viewer', createdAt: '2020-01-01T00:00:00.000Z' },
      });
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
            screenname: 'viewer',
            email: null,
            active: true,
            isPersonal: true,
            role: 'owner',
          },
          {
            id: 'business',
            name: 'Neighborhood Studio',
            screenname: 'business',
            email: null,
            active: true,
            isPersonal: false,
            role: 'owner',
          },
        ],
      });
    }
    if (path === '/api/social/actors/me')
      return json(route, {
        success: true,
        data: {
          actor: {
            ...currentViewer(),
            uri: `https://localhost/p/${currentViewer().username}`,
            followersCount: 2,
            followingCount: 2,
            statusCount: 0,
          },
          eligible: true,
        },
      });
    if (path === '/api/social/actors/me/groups')
      return json(route, {
        success: true,
        data: {
          groups:
            state.activeProfile === 'business'
              ? []
              : Object.values(rooms)
                  .filter((room) => !state.denied.has(room.handle))
                  .map((room) => ({
                    ...roomFor(room.handle),
                    summary: null,
                    joinPolicy: 'open',
                    postsThisWeek: 0,
                    nextEvent: null,
                  })),
        },
      });
    if (path === '/api/social/messages/conversations')
      return json(route, {
        success: true,
        data: {
          conversations: [],
          viewerActorId: currentViewer().id,
          localDomain: 'localhost',
        },
      });
    if (path === '/api/social/dm-requests')
      return json(route, { success: true, data: { requests: [] } });
    if (path === '/api/social/messages/groups')
      return json(route, {
        success: true,
        data: {
          viewerActorId: currentViewer().id,
          localDomain: 'localhost',
          groups:
            state.activeProfile === 'business'
              ? []
              : Object.values(rooms)
                  .filter((room) => !state.denied.has(room.handle))
                  .map((room) => ({
                    ...roomFor(room.handle),
                    lastMessage: messages[room.handle].length
                      ? project(messages[room.handle].at(-1)!, room.handle)
                      : null,
                  })),
        },
      });
    const match = /^\/api\/social\/groups\/([^/]+)\/chat(?:\/([^/]+))?$/.exec(
      path
    );
    if (match) {
      const handle = decodeURIComponent(match[1]);
      if (unavailable(handle))
        return json(
          route,
          { success: false, error: 'This group chat is not available.' },
          404
        );
      if (request.method() === 'GET') {
        const cursor = url.searchParams.get('cursor');
        if (cursor && state.failOlder)
          return json(
            route,
            { success: false, error: 'Older messages are unavailable.' },
            503
          );
        const end = cursor ? Number(cursor) : messages[handle].length;
        const start = Math.max(0, end - (options.pageSize ?? 40));
        return json(route, {
          success: true,
          data: {
            group: roomFor(handle),
            viewerActorId: currentViewer().id,
            localDomain: 'localhost',
            messages: messages[handle]
              .slice(start, end)
              .map((message) => project(message, handle)),
            nextCursor: start > 0 ? String(start) : null,
          },
        });
      }
      if (request.method() === 'POST') {
        const input: GroupChatInput = request.postDataJSON();
        const actor = currentViewer();
        posts.push({ handle, input });
        const commit = () => {
          let message = messages[handle].find(
            (entry) =>
              entry.actor.id === actor.id && entry.clientId === input.clientId
          );
          if (!message) {
            const escaped = input.content
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\n/g, '<br>');
            message = makeMessage(handle, actor, `<p>${escaped}</p>`);
            message.clientId = input.clientId;
            message.attachments = input.attachments?.map(
              (attachment, index) => ({
                ...attachment,
                id: `${message!.id}-${index}`,
              })
            );
            messages[handle].push(message);
          }
          return project(message, handle);
        };
        if (options.send) return options.send(route, input, commit);
        if (state.failSends-- > 0)
          return json(
            route,
            { success: false, error: 'Could not send this group message.' },
            503
          );
        return json(route, { success: true, data: commit() }, 201);
      }
      if (request.method() === 'DELETE') {
        if (state.failDeletes-- > 0)
          return json(
            route,
            { success: false, error: 'Could not remove this message.' },
            503
          );
        const index = messages[handle].findIndex(
          (message) => message.id === decodeURIComponent(match[2])
        );
        if (index < 0)
          return json(
            route,
            { success: false, error: 'Message not found.' },
            404
          );
        if (!project(messages[handle][index], handle).canDelete)
          return json(
            route,
            {
              success: false,
              error: 'Only the author or a moderator may remove this message.',
            },
            403
          );
        messages[handle].splice(index, 1);
        return json(route, {
          success: true,
          data: { id: decodeURIComponent(match[2]) },
        });
      }
    }
    if (path === '/api/social/gifs')
      return json(route, {
        enabled: true,
        results: [
          {
            id: 'hello',
            description: 'A little celebration',
            creator: 'Fixture Artist',
            url: 'https://media.giphy.com/media/fixture/giphy.gif',
            previewUrl: 'https://media.giphy.com/media/fixture/preview.gif',
            width: 100,
            height: 100,
          },
        ],
      });
    if (path === '/api/social/gifs/mirror')
      return json(route, {
        success: true,
        data: {
          type: 'image',
          mediaType: 'image/gif',
          url: 'https://uploads.chat.invalid/hello.gif',
          name: 'Hello by Fixture Artist (via GIPHY)',
        },
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
  expect(
    (await page.goto(options.url ?? '/messages?group=garden'))?.status()
  ).toBe(200);
  if (options.signedIn === false) {
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true })
    ).toBeVisible();
  } else {
    await expect(compose(page)).toBeVisible();
    if (options.native) {
      await expect(page.locator('[data-native-app]')).toBeVisible();
      await expect.poll(() => mailboxes.length).toBeGreaterThan(0);
    } else {
      await expect.poll(() => mailboxes.length).toBe(1);
    }
  }
  return {
    viewer,
    bee,
    mart,
    rooms,
    state,
    messages,
    posts,
    mailboxes,
    errors,
    calls,
    notify,
    makeMessage,
  };
}

test('opens a members-only group chat from Messages with real sender names and one mailbox', async ({
  page,
}) => {
  const fixture = await openGroupChat(page);
  await expect(
    page.getByRole('button', { name: 'Groups', exact: true, pressed: true })
  ).toBeVisible();
  await expect(
    log(page).getByRole('link', { name: 'Bee Maria', exact: true })
  ).toBeVisible();
  await expect(
    log(page).getByRole('link', { name: 'Mart Ruiz', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Group overview/ })
  ).toHaveAttribute('href', '/g/garden');
  const pane = page.getByRole('region', { name: 'Open conversation' });
  const beforeHover = await pane.boundingBox();
  await pane.hover();
  const afterHover = await pane.boundingBox();
  expect(afterHover?.x).toBe(beforeHover?.x);
  expect(afterHover?.width).toBe(beforeHover?.width);
  await page.getByRole('button', { name: 'Conversation details' }).click();
  await expect(
    page.getByText('Only active group members can read and post here.', {
      exact: false,
    })
  ).toBeVisible();
  expect(fixture.mailboxes).toHaveLength(1);
  expect(fixture.errors).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath('group-chat-desktop.png'),
  });
});

test('keeps separate group and direct-message scopes and per-group text/GIF drafts', async ({
  page,
}) => {
  const fixture = await openGroupChat(page);
  await compose(page).fill('Garden gets this caption.');
  await page.getByRole('button', { name: 'Add a GIF' }).click();
  await page
    .getByRole('group', { name: 'GIF picker' })
    .getByRole('button', { name: /A little celebration/ })
    .click();
  await expect(page.getByRole('button', { name: 'Remove GIF' })).toBeVisible();
  await groupRow(page, 'Print Workshop').click();
  await compose(page, 'Print Workshop').fill(
    'Workshop gets a different draft.'
  );
  await page.getByRole('button', { name: 'Messages', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Group chats' })).toBeHidden();
  await page.getByRole('button', { name: 'Groups', exact: true }).click();
  await expect(compose(page, 'Print Workshop')).toHaveValue(
    'Workshop gets a different draft.'
  );
  await groupRow(page, 'Garden Crew').click();
  await expect(compose(page)).toHaveValue('Garden gets this caption.');
  await expect(page.getByRole('button', { name: 'Remove GIF' })).toBeVisible();
  expect(fixture.posts).toHaveLength(0);
  expect(fixture.mailboxes).toHaveLength(1);
});

test('retains failed group sends and retries the same nonce without duplicate messages', async ({
  page,
}) => {
  const fixture = await openGroupChat(page, { failSends: 1 });
  await compose(page).fill('Keep this group message.');
  await compose(page).press('Enter');
  await expect(log(page).getByText('Not sent', { exact: true })).toBeVisible();
  await compose(page).fill('A newer draft must survive.');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    log(page).getByText('Keep this group message.', { exact: true })
  ).toHaveCount(1);
  await expect(log(page).getByText('Not sent', { exact: true })).toHaveCount(0);
  await expect(compose(page)).toHaveValue('A newer draft must survive.');
  expect(fixture.posts).toHaveLength(2);
  expect(fixture.posts[1]).toEqual(fixture.posts[0]);
  expect(fixture.posts[0].input.clientId).toBeTruthy();
  expect(fixture.posts[0].input).not.toHaveProperty('visibility');
  expect(fixture.posts[0].input).not.toHaveProperty('recipientActorIds');
});

test('reconciles mailbox delivery before a delayed HTTP acknowledgement', async ({
  page,
}) => {
  let pending: { route: Route; message: GroupChatMessage } | undefined;
  const fixture = await openGroupChat(page, {
    send: async (route, _input, commit) => {
      pending = { route, message: commit() };
    },
  });
  await compose(page).fill('One message, even if the socket wins.');
  await compose(page).press('Enter');
  await expect.poll(() => !!pending).toBe(true);
  fixture.notify('garden');
  await expect(
    log(page).getByText('One message, even if the socket wins.', {
      exact: true,
    })
  ).toHaveCount(1);
  await expect(log(page).getByText('Sending', { exact: true })).toHaveCount(0);
  await pending!.route.fulfill({
    json: { success: true, data: pending!.message },
    status: 201,
  });
  await expect(
    log(page).getByText('One message, even if the socket wins.', {
      exact: true,
    })
  ).toHaveCount(1);
  expect(
    fixture.messages.garden.filter(
      (message) => message.clientId === fixture.posts[0].input.clientId
    )
  ).toHaveLength(1);
});

test('keeps a late failure in its original group while another group sends successfully', async ({
  page,
}) => {
  let delayed: Route | undefined;
  const fixture = await openGroupChat(page, {
    send: async (route, input, commit) => {
      if (input.content === 'Slow garden message.') {
        delayed = route;
        return;
      }
      await route.fulfill({
        json: { success: true, data: commit() },
        status: 201,
      });
    },
  });
  await compose(page).fill('Slow garden message.');
  await compose(page).press('Enter');
  await expect.poll(() => !!delayed).toBe(true);
  await groupRow(page, 'Print Workshop').click();
  await compose(page, 'Print Workshop').fill('Fast workshop message.');
  await compose(page, 'Print Workshop').press('Enter');
  await expect(
    log(page).getByText('Fast workshop message.', { exact: true })
  ).toHaveCount(1);
  await delayed!.fulfill({
    status: 503,
    json: { success: false, error: 'Try the garden again.' },
  });
  await expect(log(page).getByText('Not sent', { exact: true })).toHaveCount(0);
  await groupRow(page, 'Garden Crew').click();
  await expect(log(page).getByText('Not sent', { exact: true })).toBeVisible();
  expect(fixture.posts.map((post) => post.handle)).toEqual([
    'garden',
    'workshop',
  ]);
});

test('supports the native group route, mobile Back flow, and its Messages deep link', async ({
  page,
}) => {
  await openGroupChat(page, { url: '/g/garden/chat' });
  await expect(
    page.getByRole('button', { name: 'Back to group', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open this group chat in Messages' })
  ).toHaveAttribute('href', '/messages?group=garden');
  await page
    .getByRole('link', { name: 'Open this group chat in Messages' })
    .click();
  await expect(page).toHaveURL(/\/messages\?group=garden$/);
  await expect(compose(page)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Back to conversations' }).click();
  await expect(groupRow(page, 'Garden Crew')).toBeFocused();
  await groupRow(page, 'Garden Crew').click();
  await expect(compose(page)).toBeVisible();
  const send = await page
    .getByRole('button', { name: 'Send message', exact: true })
    .boundingBox();
  expect(send!.width).toBeGreaterThanOrEqual(44);
  expect(send!.y + send!.height).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390
  );
  await page.screenshot({
    path: test.info().outputPath('group-chat-mobile.png'),
  });
});

test('enforces member-only rendering on revocation, including cached chat content', async ({
  page,
}) => {
  const fixture = await openGroupChat(page);
  fixture.state.denied.add('garden');
  fixture.notify('garden', 'membership');
  await expect(
    page.getByRole('region', { name: 'Open conversation' }).getByRole('alert')
  ).toHaveText('This group chat is not available.');
  await expect(log(page)).toHaveCount(0);
  await expect(compose(page)).toHaveCount(0);
  await expect(
    page.getByText('I will bring the seedlings. See you there!', {
      exact: true,
    })
  ).toHaveCount(0);
  await expect(groupRow(page, 'Garden Crew')).toHaveCount(0);
});

test('offers member and moderator deletion only where allowed and keeps failed removal explicit', async ({
  page,
}) => {
  const fixture = await openGroupChat(page, {
    role: 'moderator',
    failDeletes: 1,
  });
  const id = fixture.messages.garden[0].id;
  const trigger = log(page)
    .locator(`[data-chat-message-id="${id}"]`)
    .getByRole('button', { name: 'Delete message' });
  await trigger.click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog
    .getByRole('button', { name: 'Remove message', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Could not remove this message.'
  );
  await dialog
    .getByRole('button', { name: 'Remove message', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    log(page).getByText('Are we still meeting at the garden on Saturday?', {
      exact: true,
    })
  ).toHaveCount(0);
  fixture.state.role = 'member';
  fixture.notify('garden', 'membership');
  const other = fixture.messages.garden.find(
    (message) => message.actor.id === fixture.mart.id
  )!;
  await expect(
    log(page)
      .locator(`[data-chat-message-id="${other.id}"]`)
      .getByRole('button', { name: 'Delete message' })
  ).toHaveCount(0);
});

test('loads older messages without counting them as incoming or moving the reading anchor', async ({
  page,
}) => {
  const fixture = await openGroupChat(page, { pageSize: 8 });
  fixture.messages.garden.splice(
    0,
    fixture.messages.garden.length,
    ...Array.from({ length: 24 }, (_, index) =>
      fixture.makeMessage(
        'garden',
        index % 2 ? fixture.viewer : fixture.bee,
        `<p>Garden history ${index}. A little update about our shared plans for Saturday.</p>`,
        60 - index
      )
    )
  );
  fixture.notify('garden');
  await expect(
    log(page).getByText('Garden history 23.', { exact: false })
  ).toBeVisible();
  await log(page).evaluate((element) => {
    element.scrollTop = 0;
  });
  const anchor = fixture.messages.garden[16].id;
  const offset = () =>
    log(page)
      .locator(`[data-chat-message-id="${anchor}"]`)
      .evaluate(
        (element) =>
          element.getBoundingClientRect().top -
          element.closest('[role="log"]')!.getBoundingClientRect().top
      );
  const before = await offset();
  await page
    .getByRole('button', { name: 'Load older messages', exact: true })
    .click();
  await expect(
    log(page).getByText('Garden history 8.', { exact: false })
  ).toHaveCount(1);
  await expect.poll(offset).toBeCloseTo(before, 0);
  await expect(
    page.getByRole('button', { name: /new messages?$/ })
  ).toHaveCount(0);
  fixture.messages.garden.push(
    fixture.makeMessage('garden', fixture.bee, '<p>A live garden update.</p>')
  );
  fixture.notify('garden');
  await expect(
    page.getByRole('button', { name: '1 new message', exact: true })
  ).toBeVisible();
});

test('clears group drafts and cached rooms when changing the active identity', async ({
  page,
}) => {
  const fixture = await openGroupChat(page);
  await compose(page).fill('A personal group draft.');
  await page.getByRole('button', { name: /Claribel/ }).click();
  await page.getByRole('menuitem', { name: /Neighborhood Studio/ }).click();
  await expect.poll(() => fixture.state.activeProfile).toBe('business');
  await expect(compose(page)).toHaveCount(0);
  await expect(log(page)).toHaveCount(0);
  await expect.poll(() => fixture.mailboxes.length).toBeGreaterThan(1);
  await page.getByRole('button', { name: /Neighborhood Studio/ }).click();
  await page.getByRole('menuitem', { name: /Claribel/ }).click();
  await expect(compose(page)).toHaveValue('');
});

test('does not request group content or open a mailbox while signed out', async ({
  page,
}) => {
  const fixture = await openGroupChat(page, {
    url: '/g/garden/chat',
    signedIn: false,
  });
  await expect(log(page)).toHaveCount(0);
  expect(
    fixture.calls.some((call) => /\/api\/social\/groups\/.+\/chat/.test(call))
  ).toBe(false);
  expect(fixture.mailboxes).toHaveLength(0);
});

test('fits group chat inside the native app chrome without covering its composer', async ({
  page,
}) => {
  await openGroupChat(page, { native: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const navigation = page.getByRole('navigation', { name: 'App navigation' });
  await expect(navigation).toBeVisible();
  await expect(compose(page)).toBeVisible();
  const nav = await navigation.boundingBox();
  const send = await page
    .getByRole('button', { name: 'Send message', exact: true })
    .boundingBox();
  expect(send!.y + send!.height).toBeLessThanOrEqual(nav!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390
  );
  await page.setViewportSize({ width: 390, height: 520 });
  await compose(page).fill(
    'Saturday works.\nI can bring coffee.\nAnd a few prints.\nSee you there!'
  );
  await page.getByRole('button', { name: 'Add a GIF' }).click();
  await page
    .getByRole('group', { name: 'GIF picker' })
    .getByRole('button', { name: /A little celebration/ })
    .click();
  await expect(page.getByRole('button', { name: 'Remove GIF' })).toBeVisible();
  const shortNav = await navigation.boundingBox();
  const shortSend = await page
    .getByRole('button', { name: 'Send message', exact: true })
    .boundingBox();
  expect(shortSend!.y + shortSend!.height).toBeLessThanOrEqual(shortNav!.y);
});
