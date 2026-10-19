import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  test,
} from 'node:test';
import assert from 'node:assert/strict';
import { sendFcm } from '@/lib/push/fcm';

const FCM_ERROR_TYPE = 'type.googleapis.com/google.firebase.fcm.v1.FcmError';
const BAD_REQUEST_TYPE = 'type.googleapis.com/google.rpc.BadRequest';
const realFetch = globalThis.fetch;
const envKeys = [
  'FCM_PROJECT_ID',
  'FCM_CLIENT_EMAIL',
  'FCM_PRIVATE_KEY',
] as const;
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
let privateKey: string;
let requests: Array<{ url: string; init: RequestInit | undefined }>;

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
  requests = [];
  process.env.FCM_PROJECT_ID = 'push-unit-tests';
  process.env.FCM_CLIENT_EMAIL = 'push@push-unit-tests.iam.gserviceaccount.com';
  process.env.FCM_PRIVATE_KEY = privateKey;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

after(() => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function stubFcm(status: number, body: unknown): void {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'unit-test-access-token' });
    }
    requests.push({ url, init });
    return Response.json(body, { status });
  };
}

describe('sendFcm configuration and requests', () => {
  test('does no delivery work without a project id', async () => {
    delete process.env.FCM_PROJECT_ID;
    stubFcm(200, {});
    assert.deepEqual(await sendFcm('token', { title: 'Hi', body: 'There' }), {
      status: 'failed',
      reason: 'fcm-not-configured',
    });
    assert.equal(requests.length, 0);
  });

  test('sends a v1 notification and string-valued deep link data', async () => {
    stubFcm(200, { name: 'projects/push-unit-tests/messages/1' });
    assert.deepEqual(
      await sendFcm('device-token', {
        title: 'Pana MIA Club',
        body: 'A new notification',
        url: '/updates',
      }),
      { status: 'sent' }
    );
    assert.equal(
      requests[0].url,
      'https://fcm.googleapis.com/v1/projects/push-unit-tests/messages:send'
    );
    assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
      message: {
        token: 'device-token',
        notification: { title: 'Pana MIA Club', body: 'A new notification' },
        data: { url: '/updates' },
        android: { priority: 'HIGH', notification: { sound: 'default' } },
      },
    });
  });

  test('keeps the serialized request below 4096 bytes for oversized content', async () => {
    stubFcm(200, {});
    await sendFcm('token', {
      title: '\u{1f600}'.repeat(10_000),
      body: '\u0000"\\\n'.repeat(10_000),
      url: `/${'a'.repeat(1023)}`,
    });
    assert.ok(Buffer.byteLength(String(requests[0].init?.body)) < 4096);
    const payload = JSON.parse(String(requests[0].init?.body));
    assert.notEqual(payload.message.notification.body, '');
    assert.equal(payload.message.data.url.length, 1024);
  });
});

describe('sendFcm dead-token classification', () => {
  const cases = [
    {
      name: 'generic INVALID_ARGUMENT is not evidence against a token',
      httpStatus: 400,
      error: { status: 'INVALID_ARGUMENT' },
      status: 'failed',
    },
    {
      name: 'a payload field violation preserves the registration',
      httpStatus: 400,
      error: {
        status: 'INVALID_ARGUMENT',
        details: [
          {
            '@type': BAD_REQUEST_TYPE,
            fieldViolations: [{ field: 'message.data[0].value' }],
          },
        ],
      },
      status: 'failed',
    },
    {
      name: 'only a typed FCM invalid-token detail may mark it dead',
      httpStatus: 400,
      error: {
        status: 'INVALID_ARGUMENT',
        details: [{ '@type': FCM_ERROR_TYPE, errorCode: 'INVALID_ARGUMENT' }],
      },
      status: 'dead',
    },
    {
      name: 'ambiguous invalid-argument details preserve the registration',
      httpStatus: 400,
      error: {
        status: 'INVALID_ARGUMENT',
        details: [
          { '@type': FCM_ERROR_TYPE, errorCode: 'INVALID_ARGUMENT' },
          {
            '@type': BAD_REQUEST_TYPE,
            fieldViolations: [{ field: 'message' }],
          },
        ],
      },
      status: 'failed',
    },
    {
      name: 'UNREGISTERED from FCM marks the token dead',
      httpStatus: 404,
      error: {
        status: 'NOT_FOUND',
        details: [{ '@type': FCM_ERROR_TYPE, errorCode: 'UNREGISTERED' }],
      },
      status: 'dead',
    },
    {
      name: 'a missing project or endpoint does not mark the token dead',
      httpStatus: 404,
      error: { status: 'NOT_FOUND' },
      status: 'failed',
    },
    {
      name: 'unknown detail types do not justify pruning',
      httpStatus: 400,
      error: {
        status: 'INVALID_ARGUMENT',
        details: [{ '@type': 'unknown', errorCode: 'INVALID_ARGUMENT' }],
      },
      status: 'failed',
    },
    {
      name: 'malformed details do not justify pruning',
      httpStatus: 400,
      error: { status: 'INVALID_ARGUMENT', details: null },
      status: 'failed',
    },
    {
      name: 'a sender mismatch is an operational failure, not a dead token',
      httpStatus: 403,
      error: {
        status: 'PERMISSION_DENIED',
        details: [{ '@type': FCM_ERROR_TYPE, errorCode: 'SENDER_ID_MISMATCH' }],
      },
      status: 'failed',
    },
    {
      name: 'quota errors preserve the registration',
      httpStatus: 429,
      error: { status: 'RESOURCE_EXHAUSTED' },
      status: 'failed',
    },
    {
      name: 'transient errors preserve the registration',
      httpStatus: 503,
      error: { status: 'UNAVAILABLE' },
      status: 'failed',
    },
  ];

  for (const scenario of cases) {
    test(scenario.name, async () => {
      stubFcm(scenario.httpStatus, { error: scenario.error });
      const result = await sendFcm('token', { title: 'Hi', body: 'There' });
      assert.equal(result.status, scenario.status);
    });
  }

  test('a non-JSON 404 does not prune a token', async () => {
    stubFcm(200, {});
    await sendFcm('token', { title: 'Hi', body: 'There' });
    globalThis.fetch = async () => new Response('Not found', { status: 404 });
    assert.deepEqual(await sendFcm('token', { title: 'Hi', body: 'There' }), {
      status: 'failed',
      reason: 'http-404',
    });
  });
});
