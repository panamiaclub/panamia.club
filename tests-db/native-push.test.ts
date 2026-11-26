import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';
import {
  PushProviderError,
  validatePushConfiguration,
} from '@/lib/push/provider';
import type { PushMessagePreview } from '@/lib/push/payload';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const deviceId = 'c7093586-d43a-43ad-b322-98ec58b2e081';
const token = 'a'.repeat(64);
let activeSession: { id: string; userId: string } | null;
let sendResult: 'sent' | 'invalid' | 'fail' = 'sent';
const sent: string[] = [];
const previews: Array<PushMessagePreview | undefined> = [];
let createNotification: typeof import('@/lib/notifications').createNotification;
let createNotificationsForTargets: typeof import('@/lib/notifications').createNotificationsForTargets;
let registerPushDevice: typeof import('@/lib/push/devices').registerPushDevice;
let deliverPendingPush: typeof import('@/lib/push/deliver').deliverPendingPush;
let devicesRoute: typeof import('@/app/api/push/devices/route');
let openRoute: typeof import('@/app/api/push/open/route');
let formatMessagePreview: typeof import('@/lib/push/message-preview').formatMessagePreview;

mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    resolvePushSession: async () => activeSession,
    auth: async () =>
      activeSession ? { user: { id: activeSession.userId } } : null,
  },
});
mock.module(import.meta.resolve('../lib/push/provider.ts'), {
  namedExports: {
    PushProviderError,
    validatePushConfiguration,
    createPushSender:
      () =>
      async (
        _device: unknown,
        notificationId: string,
        preview?: PushMessagePreview
      ) => {
        if (sendResult === 'fail') throw new Error('fixture transient error');
        sent.push(notificationId);
        previews.push(preview);
        return sendResult;
      },
  },
});

before(async () => {
  for (const table of [
    schema.users,
    schema.sessions,
    schema.profiles,
    schema.socialActors,
    schema.socialBlocks,
    schema.notifications,
    schema.socialStatuses,
    schema.socialDmRequests,
  ]) {
    const { name, columns } = getTableConfig(table);
    await pg.exec(
      `CREATE TABLE "${name}" (${columns
        .map(
          (column) =>
            `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`
        )
        .join(', ')})`
    );
  }
  await pg.exec(
    readFileSync(
      new URL('../drizzle/0080_native_push.sql', import.meta.url),
      'utf8'
    )
  );
  await pg.exec(`
    INSERT INTO users (id) VALUES ('legacy');
    INSERT INTO sessions (id, user_id) VALUES ('legacy', 'legacy');
    INSERT INTO push_devices (id, user_id, session_id, platform, token, updated_at)
      VALUES ('legacy', 'legacy', 'legacy', 'ios', 'legacy-token', '2026-11-26T21:00:00Z');
  `);
  await pg.exec(
    readFileSync(
      new URL('../drizzle/0081_push_message_previews.sql', import.meta.url),
      'utf8'
    )
  );
  const [legacy] = await db.select().from(schema.pushDevices);
  assert.equal(legacy.messagePreviews, false);
  await pg.exec(
    readFileSync(
      new URL(
        '../drizzle/0082_existing_push_message_previews.sql',
        import.meta.url
      ),
      'utf8'
    )
  );
  assert.equal(
    (await db.select().from(schema.pushDevices))[0].messagePreviews,
    true
  );
  ({ createNotification, createNotificationsForTargets } =
    await import('@/lib/notifications'));
  ({ registerPushDevice } = await import('@/lib/push/devices'));
  ({ deliverPendingPush } = await import('@/lib/push/deliver'));
  ({ formatMessagePreview } = await import('@/lib/push/message-preview'));
  devicesRoute = await import('@/app/api/push/devices/route');
  openRoute = await import('@/app/api/push/open/route');
});

beforeEach(async () => {
  await pg.exec(
    'TRUNCATE users, sessions, profiles, social_actors, social_blocks, notifications, social_statuses, social_dm_requests, push_devices, push_deliveries CASCADE'
  );
  sent.length = 0;
  previews.length = 0;
  sendResult = 'sent';
  activeSession = { id: 'login-recipient', userId: 'recipient' };
  for (const id of ['sender', 'recipient', 'other']) {
    await db
      .insert(schema.users)
      .values({ id, email: `${id}@example.invalid`, name: id });
    await db.insert(schema.sessions).values({
      id: `login-${id}`,
      userId: id,
      token: `session-${id}`,
      expiresAt: new Date(Date.now() + 86400000),
    });
  }
  await registerPushDevice(activeSession, {
    id: deviceId,
    platform: 'ios',
    token,
  });
});
after(async () => {
  mock.restoreAll();
  await pg.close();
});

async function notify(targetId = 'recipient') {
  await createNotification({
    actorId: 'sender',
    targetId,
    type: 'Like',
    context: 'like',
    objectId: 'post',
    objectUrl: '/status/post',
    message: 'Private content',
  });
  const rows = await db.select().from(schema.notifications);
  return rows.at(-1)!;
}

test('single and bulk saved notifications enqueue eligible devices, not historical rows', async () => {
  const first = await notify();
  await createNotificationsForTargets({
    actorId: 'sender',
    targetIds: ['recipient', 'recipient', 'other', 'sender'],
    type: 'Create',
    context: 'reply',
  });
  assert.equal((await db.select().from(schema.notifications)).length, 3);
  assert.equal((await db.select().from(schema.pushDeliveries)).length, 2);
  await registerPushDevice(
    { id: 'login-other', userId: 'other' },
    {
      id: '67e79861-fdc8-41cf-b591-e9cd8e07f021',
      platform: 'android',
      token: 'other-token',
    }
  );
  assert.equal((await db.select().from(schema.pushDeliveries)).length, 2);
  assert.deepEqual(await deliverPendingPush({}), { sent: 2, failed: 0 });
  assert.ok(sent.includes(first.id));
  assert.equal((await db.select().from(schema.pushDeliveries)).length, 0);
});

test('read/expired alerts and expired sessions are not delivered', async () => {
  const read = await notify();
  await db
    .update(schema.notifications)
    .set({ read: true })
    .where(eq(schema.notifications.id, read.id));
  const expired = await notify();
  await db
    .update(schema.notifications)
    .set({ expiresAt: new Date(0) })
    .where(eq(schema.notifications.id, expired.id));
  assert.deepEqual(await deliverPendingPush({}), { sent: 0, failed: 0 });
  await notify();
  await db.update(schema.sessions).set({ expiresAt: new Date(0) });
  await deliverPendingPush({});
  assert.equal(sent.length, 0);
  assert.equal((await db.select().from(schema.pushDevices)).length, 0);
});

test('session revocation, device rotation, and account reassignment cascade queued jobs', async () => {
  await notify();
  await registerPushDevice(activeSession!, {
    id: deviceId,
    platform: 'ios',
    token: 'b'.repeat(64),
  });
  assert.equal((await db.select().from(schema.pushDeliveries)).length, 0);
  await notify();
  await registerPushDevice(
    { id: 'login-other', userId: 'other' },
    {
      id: deviceId,
      platform: 'ios',
      token: 'b'.repeat(64),
    }
  );
  assert.equal((await db.select().from(schema.pushDeliveries)).length, 0);
  await notify('other');
  await db.delete(schema.sessions).where(eq(schema.sessions.id, 'login-other'));
  assert.equal((await db.select().from(schema.pushDevices)).length, 0);
  assert.equal((await db.select().from(schema.pushDeliveries)).length, 0);
});

test('provider failures keep a leased retry; revoked tokens remove device and jobs', async () => {
  await notify();
  sendResult = 'fail';
  assert.deepEqual(await deliverPendingPush({}), { sent: 0, failed: 1 });
  const [job] = await db.select().from(schema.pushDeliveries);
  assert.equal(job.attempts, 1);
  assert.ok(job.availableAt > new Date());
  assert.deepEqual(await deliverPendingPush({}), { sent: 0, failed: 0 });
  await db.update(schema.pushDeliveries).set({ availableAt: new Date(0) });
  sendResult = 'invalid';
  await deliverPendingPush({});
  assert.equal((await db.select().from(schema.pushDevices)).length, 0);
  assert.equal((await db.select().from(schema.pushDeliveries)).length, 0);
});

test('exhausted attempts stop retrying and stale queue rows are purged', async () => {
  await notify();
  await db.update(schema.pushDeliveries).set({ attempts: 7 });
  sendResult = 'fail';
  assert.deepEqual(await deliverPendingPush({}), { sent: 0, failed: 1 });
  await db.update(schema.pushDeliveries).set({ availableAt: new Date(0) });
  assert.deepEqual(await deliverPendingPush({}), { sent: 0, failed: 0 });
  await db.update(schema.pushDeliveries).set({ createdAt: new Date(0) });
  await deliverPendingPush({});
  assert.equal((await db.select().from(schema.pushDeliveries)).length, 0);
});

test('registration renewal preserves pending jobs; deleting the user removes devices and jobs', async () => {
  await notify();
  await registerPushDevice(activeSession!, {
    id: deviceId,
    platform: 'ios',
    token,
  });
  assert.equal((await db.select().from(schema.pushDeliveries)).length, 1);
  await db.delete(schema.users).where(eq(schema.users.id, 'recipient'));
  assert.equal((await db.select().from(schema.pushDevices)).length, 0);
  assert.equal((await db.select().from(schema.pushDeliveries)).length, 0);
});

test('preview choices survive omitted renewals, token rotation and account reassignment', async () => {
  assert.equal(
    (await db.select().from(schema.pushDevices))[0].messagePreviews,
    true
  );
  await registerPushDevice(activeSession!, {
    id: deviceId,
    platform: 'ios',
    token,
    messagePreviews: true,
  });
  await registerPushDevice(activeSession!, {
    id: deviceId,
    platform: 'ios',
    token,
  });
  assert.equal(
    (await db.select().from(schema.pushDevices))[0].messagePreviews,
    true
  );
  await registerPushDevice(activeSession!, {
    id: deviceId,
    platform: 'ios',
    token,
    messagePreviews: false,
  });
  await registerPushDevice(activeSession!, {
    id: deviceId,
    platform: 'ios',
    token: 'b'.repeat(64),
  });
  await registerPushDevice(
    { id: 'login-other', userId: 'other' },
    {
      id: deviceId,
      platform: 'ios',
      token: 'b'.repeat(64),
    }
  );
  assert.equal(
    (await db.select().from(schema.pushDevices))[0].messagePreviews,
    false
  );
});

test('legacy preview upgrade preserves newer off values, renewal dates and queued notifications', async () => {
  const cutoff = new Date('2026-11-26T21:06:46Z');
  const beforeRelease = new Date(cutoff.getTime() - 1);
  const afterRelease = new Date(cutoff.getTime() + 1);
  await db
    .update(schema.pushDevices)
    .set({ messagePreviews: false, updatedAt: beforeRelease })
    .where(eq(schema.pushDevices.id, deviceId));
  await db.insert(schema.pushDevices).values([
    {
      id: 'saved-off',
      userId: 'recipient',
      sessionId: 'login-recipient',
      platform: 'ios',
      token: 'saved-off-token',
      messagePreviews: false,
      updatedAt: cutoff,
    },
    {
      id: 'ambiguous-legacy-off',
      userId: 'recipient',
      sessionId: 'login-recipient',
      platform: 'android',
      token: 'ambiguous-off-token',
      messagePreviews: false,
      updatedAt: afterRelease,
    },
    {
      id: 'already-on',
      userId: 'recipient',
      sessionId: 'login-recipient',
      platform: 'android',
      token: 'already-on-token',
      messagePreviews: true,
      updatedAt: beforeRelease,
    },
  ]);
  await notify();
  const queuedBefore = await db.select().from(schema.pushDeliveries);
  await pg.exec(
    readFileSync(
      new URL(
        '../drizzle/0082_existing_push_message_previews.sql',
        import.meta.url
      ),
      'utf8'
    )
  );
  const devices = new Map(
    (await db.select().from(schema.pushDevices)).map((device) => [
      device.id,
      device,
    ])
  );
  assert.equal(devices.get(deviceId)!.messagePreviews, true);
  assert.equal(devices.get('saved-off')!.messagePreviews, false);
  assert.equal(devices.get('ambiguous-legacy-off')!.messagePreviews, false);
  assert.equal(devices.get('already-on')!.messagePreviews, true);
  assert.deepEqual(devices.get(deviceId)!.updatedAt, beforeRelease);
  assert.deepEqual(devices.get('saved-off')!.updatedAt, cutoff);
  assert.deepEqual(
    devices.get('ambiguous-legacy-off')!.updatedAt,
    afterRelease
  );
  assert.deepEqual(await db.select().from(schema.pushDeliveries), queuedBefore);
  await pg.exec(`
    INSERT INTO push_devices (id, user_id, session_id, platform, token)
    VALUES ('database-default', 'recipient', 'login-recipient', 'ios', 'default-token');
  `);
  const [defaultDevice] = await db
    .select()
    .from(schema.pushDevices)
    .where(eq(schema.pushDevices.id, 'database-default'));
  assert.equal(defaultDevice.messagePreviews, true);
  assert.equal(
    (await db.select().from(schema.pushDeliveries)).length,
    queuedBefore.length
  );
});

async function messageFixture(
  changes: Partial<typeof schema.socialStatuses.$inferInsert> = {}
) {
  for (const id of ['sender', 'recipient', 'other']) {
    await db.insert(schema.profiles).values({
      id: `${id}-profile`,
      userId: id,
      name: id,
      email: `${id}@example.invalid`,
    });
    await db.insert(schema.socialActors).values({
      id: `${id}-actor`,
      username: id,
      name: id === 'sender' ? 'Sender' : id,
      domain: 'example.invalid',
      profileId: `${id}-profile`,
      uri: `https://example.invalid/${id}`,
      inboxUrl: 'https://example.invalid/inbox',
      outboxUrl: 'https://example.invalid/outbox',
      followersUrl: `https://example.invalid/${id}/followers`,
      followingUrl: 'https://example.invalid/following',
      publicKey: 'fixture',
      privateKey: 'fixture',
    });
  }
  await db.insert(schema.socialStatuses).values({
    id: 'message',
    uri: 'https://example.invalid/message',
    actorId: 'sender-actor',
    type: 'Note',
    content: '<p>Hello <b>there</b> &amp; welcome</p>',
    recipientTo: ['https://example.invalid/recipient'],
    recipientCc: [],
    isDraft: false,
    ...changes,
  });
  await createNotification({
    actorId: 'sender',
    targetId: 'recipient',
    type: 'Create',
    context: 'message',
    objectId: 'message',
    objectUrl: '/updates',
  });
}

test('only enabled devices receive a safe ordinary DM excerpt', async () => {
  await messageFixture();
  await db.update(schema.pushDevices).set({ messagePreviews: true });
  assert.deepEqual(await deliverPendingPush({}), { sent: 1, failed: 0 });
  assert.deepEqual(previews, [
    { sender: 'Sender', excerpt: 'Hello there & welcome' },
  ]);
  await db.update(schema.pushDevices).set({ messagePreviews: false });
  await createNotification({
    actorId: 'sender',
    targetId: 'recipient',
    type: 'Create',
    context: 'message',
    objectId: 'message',
  });

  test('preview text decodes HTML without hidden content, URLs, control characters or broken Unicode', () => {
    const preview = formatMessagePreview(
      '<b>Sender</b>&#x202e;',
      '<script>hidden</script><p>Hello &amp; welcome</p><a href="https://example.invalid/private">Photo</a><img src="https://example.invalid/secret" /><p>https://example.invalid/link</p>'
    );
    assert.deepEqual(preview, {
      sender: 'Sender',
      excerpt: 'Hello & welcome Photo [link]',
    });
    const long = formatMessagePreview('N'.repeat(60), '🙂'.repeat(150))!;
    assert.equal(Array.from(long.sender).length, 48);
    assert.equal(Array.from(long.excerpt).length, 120);
    assert.ok(long.excerpt.endsWith('...'));
    assert.equal(long.excerpt.includes('\uFFFD'), false);
  });
  await deliverPendingPush({});
  assert.equal(previews[1], undefined);
});

for (const [name, changes] of [
  ['another recipient', { recipientTo: ['https://example.invalid/other'] }],
  ['another author', { actorId: 'other-actor' }],
  [
    'public audience',
    { recipientCc: ['https://www.w3.org/ns/activitystreams#Public'] },
  ],
  ['expired message', { expiresAt: new Date(0) }],
  ['draft message', { isDraft: true }],
  ['private group content', { groupId: 'private-group' }],
] as const) {
  test(`message delivery cannot disclose ${name}`, async () => {
    await messageFixture(changes);
    await db.update(schema.pushDevices).set({ messagePreviews: true });
    assert.deepEqual(await deliverPendingPush({}), { sent: 0, failed: 0 });
    assert.equal(previews.length, 0);
  });
}

test('Requests added after enqueue suppress both generic and rich message delivery', async () => {
  await messageFixture();
  await db.insert(schema.socialDmRequests).values({
    id: 'request',
    senderActorId: 'sender-actor',
    recipientActorId: 'recipient-actor',
    state: 'pending',
  });

  test('message deletion, reading and blocks after enqueue do not send previews', async () => {
    await messageFixture();
    await db.update(schema.pushDevices).set({ messagePreviews: true });
    await db.update(schema.notifications).set({ read: true });
    await deliverPendingPush({});
    assert.equal(previews.length, 0);
    await db.update(schema.notifications).set({ read: false });
    await createNotification({
      actorId: 'sender',
      targetId: 'recipient',
      type: 'Create',
      context: 'message',
      objectId: 'message',
    });
    await db.insert(schema.socialBlocks).values({
      actorId: 'sender-actor',
      targetActorId: 'recipient-actor',
      kind: 'block',
    });
    await deliverPendingPush({});
    assert.equal(previews.length, 0);
    await db.delete(schema.socialBlocks);
    await createNotification({
      actorId: 'sender',
      targetId: 'recipient',
      type: 'Create',
      context: 'message',
      objectId: 'message',
    });
    await db.delete(schema.socialStatuses);
    await deliverPendingPush({});
    assert.equal(previews.length, 0);
  });
  assert.deepEqual(await deliverPendingPush({}), { sent: 0, failed: 0 });
  assert.equal(sent.length, 0);
});

for (const [name, changes] of [
  [
    'encrypted envelope',
    { type: 'EncryptedNote', content: 'ciphertext-not-a-preview' },
  ],
  ['content warning', { contentWarning: 'Sensitive content' }],
  [
    'attachment-only message',
    { content: '<p><img src="https://example.invalid/private-photo" /></p>' },
  ],
] as const) {
  test(`${name} remains generic even with previews enabled`, async () => {
    await messageFixture(changes);
    await db.update(schema.pushDevices).set({ messagePreviews: true });
    assert.deepEqual(await deliverPendingPush({}), { sent: 1, failed: 0 });
    assert.deepEqual(previews, [undefined]);
  });
}
test('device endpoint requires same-origin authentication and removes only its session devices', async () => {
  const request = (origin: string, method = 'DELETE') =>
    new Request('https://panamia.club/api/push/devices', {
      method,
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ id: deviceId }),
    });

  assert.equal(
    (await devicesRoute.DELETE(request('https://evil.invalid'))).status,
    403
  );
  activeSession = null;
  assert.equal(
    (await devicesRoute.DELETE(request('https://panamia.club'))).status,
    401
  );
  activeSession = { id: 'login-other', userId: 'other' };
  await devicesRoute.DELETE(request('https://panamia.club'));
  assert.equal((await db.select().from(schema.pushDevices)).length, 1);
  activeSession = { id: 'login-recipient', userId: 'recipient' };
  assert.equal(
    (await devicesRoute.PUT(request('https://panamia.club', 'PUT'))).status,
    400
  );
  await devicesRoute.DELETE(request('https://panamia.club'));
  assert.equal((await db.select().from(schema.pushDevices)).length, 0);
});

test('registration derives its owner from the session and reports missing provider setup', async () => {
  const previous = process.env.PUSH_APNS_CONFIG;
  const request = (messagePreviews?: unknown) =>
    new Request('https://panamia.club/api/push/devices', {
      method: 'PUT',
      headers: {
        origin: 'https://panamia.club',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: deviceId,
        token,
        platform: 'ios',
        userId: 'sender',
        messagePreviews,
      }),
    });
  try {
    delete process.env.PUSH_APNS_CONFIG;
    assert.equal((await devicesRoute.PUT(request())).status, 503);
    process.env.PUSH_APNS_CONFIG = JSON.stringify({
      teamId: 'team',
      keyId: 'key',
      environment: 'production',
      privateKey: { type: 'Buffer', data: [1, 2, 3] },
    });
    const invalid = await devicesRoute.PUT(request());
    assert.equal(invalid.status, 503);
    assert.deepEqual(await invalid.json(), {
      error: 'Invalid APNs configuration',
    });
    process.env.PUSH_APNS_CONFIG = JSON.stringify({
      teamId: 'team',
      keyId: 'key',
      environment: 'production',
      privateKey: 'fixture-pem-text',
    });
    activeSession = { id: 'login-other', userId: 'other' };
    assert.equal((await devicesRoute.PUT(request('false'))).status, 400);
    const enabled = await devicesRoute.PUT(request(true));
    assert.equal(enabled.status, 200);
    assert.deepEqual(await enabled.json(), {
      success: true,
      messagePreviews: true,
    });
    assert.equal((await devicesRoute.PUT(request(false))).status, 200);
    assert.deepEqual(await (await devicesRoute.PUT(request())).json(), {
      success: true,
      messagePreviews: false,
    });
    const [device] = await db.select().from(schema.pushDevices);
    assert.equal(device.userId, 'other');
    assert.equal(device.sessionId, 'login-other');
    assert.equal(device.messagePreviews, false);
  } finally {
    if (previous === undefined) delete process.env.PUSH_APNS_CONFIG;
    else process.env.PUSH_APNS_CONFIG = previous;
  }
});

test('tap resolves only current-account notifications and marks an owned notification read', async () => {
  const alert = await notify();
  const request = new Request(
    `https://panamia.club/api/push/open?id=${alert.id}`
  );
  activeSession = { id: 'login-other', userId: 'other' };
  const foreign = await openRoute.GET(request);
  assert.equal(foreign.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await foreign.json(), { href: '/updates' });
  activeSession = { id: 'login-recipient', userId: 'recipient' };
  assert.deepEqual(await (await openRoute.GET(request)).json(), {
    href: '/status/post',
  });
  const [row] = await db.select().from(schema.notifications);
  assert.equal(row.read, true);
  activeSession = null;
  assert.equal((await openRoute.GET(request)).status, 401);
});

test('blocks added after creation suppress delivery and tap navigation', async () => {
  const alert = await notify();
  for (const id of ['sender', 'recipient']) {
    await db.insert(schema.profiles).values({
      id: `${id}-profile`,
      userId: id,
      name: id,
      email: `${id}@example.invalid`,
    });
    await db.insert(schema.socialActors).values({
      id: `${id}-actor`,
      username: id,
      domain: 'example.invalid',
      profileId: `${id}-profile`,
      uri: `https://example.invalid/${id}`,
      inboxUrl: 'https://example.invalid/inbox',
      outboxUrl: 'https://example.invalid/outbox',
      followersUrl: 'https://example.invalid/followers',
      followingUrl: 'https://example.invalid/following',
      publicKey: 'fixture',
      privateKey: 'fixture',
    });
  }
  await db.insert(schema.socialBlocks).values({
    actorId: 'sender-actor',
    targetActorId: 'recipient-actor',
    kind: 'block',
  });
  assert.deepEqual(await deliverPendingPush({}), { sent: 0, failed: 0 });
  assert.deepEqual(
    await (
      await openRoute.GET(
        new Request(`https://panamia.club/api/push/open?id=${alert.id}`)
      )
    ).json(),
    { href: '/updates' }
  );
});
