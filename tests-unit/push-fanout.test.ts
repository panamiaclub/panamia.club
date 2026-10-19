import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  mock,
  test,
} from 'node:test';
import assert from 'node:assert/strict';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { getDb } from '@/lib/db';
import {
  deviceTokens,
  notifications,
  socialActors,
  socialBlocks,
} from '@/lib/schema';
import { sendPushToUser, sendPushToUsers } from '@/lib/push';
import {
  createNotification,
  createNotificationsForTargets,
} from '@/lib/notifications';

// postgres.js connects lazily; every query below is intercepted on this client.
const database = getDb({
  POSTGRES_URL: 'postgresql://push_test:push_test@127.0.0.1:1/push_test',
});
const dialect = new PgDialect();
const realFetch = globalThis.fetch;
const envKeys = [
  'APNS_KEY_ID',
  'APNS_PRIVATE_KEY',
  'APPLE_APP_TEAM_ID',
  'FCM_PROJECT_ID',
  'FCM_CLIENT_EMAIL',
  'FCM_PRIVATE_KEY',
] as const;
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
let privateKey: string;
let devices: Array<{ token: string; platform: 'android' }>;
let actors: Array<{ actorId: string; userId: string }>;
let blocks: Array<{ actorId: string; targetActorId: string }>;
let tokenLookups: unknown[][];
let pruned: unknown[][];
let inserted: unknown[];
let events: string[];
let responses: Map<string, { status: number; body: unknown }>;

before(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  privateKey = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----`;
});

beforeEach(() => {
  devices = [{ token: 'device-token', platform: 'android' }];
  actors = [];
  blocks = [];
  tokenLookups = [];
  pruned = [];
  inserted = [];
  events = [];
  responses = new Map();
  for (const key of envKeys) delete process.env[key];
  process.env.FCM_PROJECT_ID = 'push-unit-tests';
  process.env.FCM_CLIENT_EMAIL = 'push@push-unit-tests.iam.gserviceaccount.com';
  process.env.FCM_PRIVATE_KEY = privateKey;

  mock.method(database, 'select', () => ({
    from(table: unknown) {
      if (table === deviceTokens) {
        return {
          where: async (condition: SQL) => {
            tokenLookups.push(dialect.sqlToQuery(condition).params);
            return devices;
          },
        };
      }
      if (table === socialActors) {
        return { innerJoin: () => ({ where: async () => actors }) };
      }
      assert.equal(table, socialBlocks);
      return { where: async () => blocks };
    },
  }));
  mock.method(database, 'insert', (table: unknown) => {
    assert.equal(table, notifications);
    return {
      values: async (rows: unknown) => {
        events.push('insert');
        inserted.push(rows);
      },
    };
  });
  mock.method(database, 'delete', (table: unknown) => {
    assert.equal(table, deviceTokens);
    return {
      where: async (condition: SQL) => {
        pruned.push(dialect.sqlToQuery(condition).params);
      },
    };
  });
  mock.method(database.query.profiles, 'findFirst', async () => ({
    name: 'A Pana',
    user: { screenname: 'pana' },
  }));
  mock.method(console, 'error', () => {});

  globalThis.fetch = async (input, init) => {
    if (String(input) === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'unit-test-access-token' });
    }
    events.push('send');
    const payload = JSON.parse(String(init?.body));
    const response = responses.get(payload.message.token);
    return Response.json(response?.body ?? {}, {
      status: response?.status ?? 200,
    });
  };
});

afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = realFetch;
});

after(() => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('push fan-out', () => {
  test('does no database work when credentials are absent', async () => {
    delete process.env.FCM_PRIVATE_KEY;
    assert.equal(
      await sendPushToUser('user-a', { title: 'Hi', body: 'There' }),
      0
    );
    assert.deepEqual(tokenLookups, []);
  });

  test('uses one lookup for deduplicated recipient ids', async () => {
    const sent = await sendPushToUsers(['user-a', 'user-a', 'user-b'], {
      title: 'Hi',
      body: 'There',
    });
    assert.equal(sent, 1);
    assert.deepEqual(tokenLookups, [['user-a', 'user-b']]);
  });

  test('prunes only explicit dead tokens, not generic payload failures', async () => {
    devices = [
      { token: 'valid-token', platform: 'android' },
      { token: 'dead-token', platform: 'android' },
      { token: 'working-token', platform: 'android' },
    ];
    responses.set('valid-token', {
      status: 400,
      body: { error: { status: 'INVALID_ARGUMENT' } },
    });
    responses.set('dead-token', {
      status: 404,
      body: {
        error: {
          status: 'NOT_FOUND',
          details: [
            {
              '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
              errorCode: 'UNREGISTERED',
            },
          ],
        },
      },
    });
    assert.equal(
      await sendPushToUser('user-a', { title: 'Hi', body: 'There' }),
      1
    );
    assert.deepEqual(pruned, [['dead-token']]);
  });

  test('bounds a hanging token lookup as well as transport delivery', async (t) => {
    t.mock.method(database, 'select', () => ({
      from: () => ({ where: () => new Promise(() => {}) }),
    }));
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const result = sendPushToUser('user-a', { title: 'Hi', body: 'There' });
    t.mock.timers.tick(5000);
    assert.equal(await result, 0);
  });
});

describe('notification integration', () => {
  test('persists a single notification before attempting delivery', async () => {
    await createNotification({
      type: 'Follow',
      context: 'follow',
      actorId: 'sender',
      targetId: 'recipient',
    });
    assert.deepEqual(events, ['insert', 'send']);
    assert.deepEqual(tokenLookups, [['recipient']]);
  });

  test('batch push excludes self, duplicates and blocked recipients', async () => {
    actors = [
      { actorId: 'sender-actor', userId: 'sender' },
      { actorId: 'blocked-actor', userId: 'blocked' },
      { actorId: 'recipient-actor', userId: 'recipient' },
    ];
    blocks = [{ actorId: 'sender-actor', targetActorId: 'blocked-actor' }];
    const count = await createNotificationsForTargets({
      type: 'Create',
      context: 'group',
      actorId: 'sender',
      targetIds: ['sender', 'recipient', 'recipient', 'blocked'],
    });
    assert.equal(count, 1);
    assert.deepEqual(events, ['insert', 'send']);
    assert.deepEqual(tokenLookups, [['recipient']]);
    assert.ok(Array.isArray(inserted[0]));
    assert.equal(inserted[0].length, 1);
    assert.equal(inserted[0][0].target, 'recipient');
  });

  test('delivery failure does not fail the persisted notification', async () => {
    responses.set('device-token', {
      status: 503,
      body: { error: { status: 'UNAVAILABLE' } },
    });
    await createNotification({
      type: 'Follow',
      context: 'follow',
      actorId: 'sender',
      targetId: 'recipient',
    });
    assert.equal(inserted.length, 1);
    assert.deepEqual(pruned, []);
  });
});
