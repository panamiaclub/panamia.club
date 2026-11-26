import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const deviceId = 'c7093586-d43a-43ad-b322-98ec58b2e081';
const token = 'a'.repeat(64);
let activeSession: { id: string; userId: string } | null;
let sendResult: 'sent' | 'invalid' | 'fail' = 'sent';
const sent: string[] = [];
let createNotification: typeof import('@/lib/notifications').createNotification;
let createNotificationsForTargets: typeof import('@/lib/notifications').createNotificationsForTargets;
let registerPushDevice: typeof import('@/lib/push/devices').registerPushDevice;
let deliverPendingPush: typeof import('@/lib/push/deliver').deliverPendingPush;
let devicesRoute: typeof import('@/app/api/push/devices/route');
let openRoute: typeof import('@/app/api/push/open/route');

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
    PushProviderError: class PushProviderError extends Error {},
    createPushSender:
      () => async (_device: unknown, notificationId: string) => {
        if (sendResult === 'fail') throw new Error('fixture transient error');
        sent.push(notificationId);
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
      new URL('../drizzle/0079_native_push.sql', import.meta.url),
      'utf8'
    )
  );
  ({ createNotification, createNotificationsForTargets } =
    await import('@/lib/notifications'));
  ({ registerPushDevice } = await import('@/lib/push/devices'));
  ({ deliverPendingPush } = await import('@/lib/push/deliver'));
  devicesRoute = await import('@/app/api/push/devices/route');
  openRoute = await import('@/app/api/push/open/route');
});

beforeEach(async () => {
  await pg.exec(
    'TRUNCATE users, sessions, profiles, social_actors, social_blocks, notifications, push_devices, push_deliveries CASCADE'
  );
  sent.length = 0;
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
  const request = () =>
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
      }),
    });
  try {
    delete process.env.PUSH_APNS_CONFIG;
    assert.equal((await devicesRoute.PUT(request())).status, 503);
    process.env.PUSH_APNS_CONFIG = 'fixture-config-presence';
    activeSession = { id: 'login-other', userId: 'other' };
    assert.equal((await devicesRoute.PUT(request())).status, 200);
    const [device] = await db.select().from(schema.pushDevices);
    assert.equal(device.userId, 'other');
    assert.equal(device.sessionId, 'login-other');
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
