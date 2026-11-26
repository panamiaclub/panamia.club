import { before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createPushSender,
  PushProviderError,
  signPushJwt,
} from '../lib/push/provider';
import { pushAlert, pushDestination } from '../lib/push/payload';

let ec: CryptoKeyPair;
let rsa: CryptoKeyPair;
let ecPem: string;
let rsaPem: string;

test('Android defers Firebase token generation until explicit opt-in', () => {
  const manifest = readFileSync(
    new URL(
      '../mobile/android/app/src/main/AndroidManifest.xml',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(manifest, /android.permission.POST_NOTIFICATIONS/);
  assert.match(
    manifest,
    /android:name="firebase_messaging_auto_init_enabled" android:value="false"/
  );
  assert.match(
    manifest,
    /android:name="firebase_analytics_collection_enabled" android:value="false"/
  );
});
async function pem(key: CryptoKey) {
  const der = await crypto.subtle.exportKey('pkcs8', key);
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----`;
}
before(async () => {
  ec = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  rsa = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
  ecPem = await pem(ec.privateKey);
  rsaPem = await pem(rsa.privateKey);
});

test('APNs and Google assertions have verifiable signatures', async () => {
  for (const [algorithm, privateKey, publicKey] of [
    ['ES256', ecPem, ec.publicKey],
    ['RS256', rsaPem, rsa.publicKey],
  ] as const) {
    const jwt = await signPushJwt(
      { alg: algorithm },
      { iss: 'fixture', iat: 123 },
      privateKey,
      algorithm
    );
    const [header, claims, signature] = jwt.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url').toString()), {
      iss: 'fixture',
      iat: 123,
    });
    assert.equal(
      await crypto.subtle.verify(
        algorithm === 'ES256'
          ? { name: 'ECDSA', hash: 'SHA-256' }
          : 'RSASSA-PKCS1-v1_5',
        publicKey,
        Buffer.from(signature, 'base64url'),
        new TextEncoder().encode(`${header}.${claims}`)
      ),
      true
    );
  }
});

for (const platform of ['ios', 'android'] as const) {
  test(`${platform} rejects malformed configuration and object-valued signing keys before delivery`, async () => {
    const provider = platform === 'ios' ? 'APNs' : 'FCM';
    const key =
      platform === 'ios' ? 'PUSH_APNS_CONFIG' : 'PUSH_FCM_SERVICE_ACCOUNT';
    const config =
      platform === 'ios'
        ? {
            teamId: 'team',
            keyId: 'key',
            environment: 'production',
            privateKey: { type: 'Buffer', data: [1, 2, 3] },
          }
        : {
            project_id: 'project',
            client_email: 'service@example.invalid',
            private_key: { type: 'Buffer', data: [1, 2, 3] },
          };
    let requests = 0;
    const request: typeof fetch = async () => {
      requests++;
      return new Response(null, { status: 200 });
    };
    for (const value of ['invalid-json', 'null', JSON.stringify(config)]) {
      const send = createPushSender({ [key]: value }, request);
      await assert.rejects(
        send({ platform, token: 'fixture-token' }, 'notice'),
        (error: unknown) =>
          error instanceof PushProviderError &&
          error.message === `Invalid ${provider} configuration`
      );
    }
    assert.equal(requests, 0);
  });
}

test('APNs sends generic text and opaque ID with correct environment and headers', async () => {
  const request: typeof fetch = async (input, init) => {
    assert.equal(
      String(input),
      'https://api.sandbox.push.apple.com/3/device/fixture-token'
    );
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('apns-topic'), 'social.pana.app');
    assert.equal(headers.get('apns-push-type'), 'alert');
    assert.equal(headers.get('apns-collapse-id'), 'notice');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      aps: {
        alert: { title: 'Pana Mia', body: 'You have a new notification.' },
        sound: 'default',
      },
      notificationId: 'notice',
    });
    return new Response(null, { status: 200 });
  };
  const send = createPushSender(
    {
      PUSH_APNS_CONFIG: JSON.stringify({
        teamId: 'team',
        keyId: 'key',
        privateKey: ecPem,
        environment: 'sandbox',
      }),
    },
    request
  );
  assert.equal(
    await send({ platform: 'ios', token: 'fixture-token' }, 'notice'),
    'sent'
  );
});

test('FCM uses OAuth and a visible Android notification with private tap data', async () => {
  let oauthRequests = 0;
  const request: typeof fetch = async (input, init) => {
    if (String(input) === 'https://oauth2.googleapis.com/token') {
      oauthRequests++;
      const body = new URLSearchParams(String(init?.body));
      const claims = JSON.parse(
        Buffer.from(
          body.get('assertion')!.split('.')[1],
          'base64url'
        ).toString()
      );
      assert.equal(
        claims.scope,
        'https://www.googleapis.com/auth/firebase.messaging'
      );
      return Response.json({ access_token: 'fixture-access' });
    }
    assert.equal(
      String(input),
      'https://fcm.googleapis.com/v1/projects/project/messages:send'
    );
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'Bearer fixture-access'
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      message: {
        token: 'fixture-token',
        notification: {
          title: 'Pana Mia',
          body: 'You have a new notification.',
        },
        data: { notificationId: 'notice' },
        android: {
          priority: 'high',
          ttl: '3600s',
          notification: { channel_id: 'pana-notifications', tag: 'notice' },
        },
      },
    });
    return Response.json({ name: 'accepted' });
  };
  const send = createPushSender(
    {
      PUSH_FCM_SERVICE_ACCOUNT: JSON.stringify({
        project_id: 'project',
        client_email: 'fixture@example.invalid',
        private_key: rsaPem,
      }),
    },
    request
  );
  await send({ platform: 'android', token: 'fixture-token' }, 'notice');
  await send({ platform: 'android', token: 'fixture-token' }, 'notice');
  assert.equal(oauthRequests, 1);
});

test('only explicit token revocation invalidates a device; config/transient errors retry', async () => {
  const apnsEnv = {
    PUSH_APNS_CONFIG: JSON.stringify({
      teamId: 'team',
      keyId: 'key',
      privateKey: ecPem,
      environment: 'production',
    }),
  };
  assert.equal(
    await createPushSender(apnsEnv, async () =>
      Response.json({ reason: 'Unregistered' }, { status: 410 })
    )({ platform: 'ios', token: 'fixture' }, 'notice'),
    'invalid'
  );
  await assert.rejects(
    createPushSender(apnsEnv, async () =>
      Response.json({ reason: 'InvalidProviderToken' }, { status: 403 })
    )({ platform: 'ios', token: 'fixture' }, 'notice'),
    /APNs delivery failed \(403\)/
  );
  const fcmEnv = {
    PUSH_FCM_SERVICE_ACCOUNT: JSON.stringify({
      project_id: 'project',
      client_email: 'fixture@example.invalid',
      private_key: rsaPem,
    }),
  };
  for (const code of ['UNREGISTERED', 'INVALID_ARGUMENT', 'UNAVAILABLE']) {
    const send = createPushSender(fcmEnv, async (input) =>
      String(input).includes('oauth2')
        ? Response.json({ access_token: 'access' })
        : Response.json(
            { error: { details: [{ errorCode: code }] } },
            { status: 400 }
          )
    );
    if (code === 'UNREGISTERED')
      assert.equal(
        await send({ platform: 'android', token: 'token' }, 'id'),
        'invalid'
      );
    else
      await assert.rejects(
        send({ platform: 'android', token: 'token' }, 'id'),
        /FCM delivery failed/
      );
  }
});

test('tap destinations reject external navigation and payload never contains content', () => {
  for (const value of [
    'https://evil.invalid',
    '//evil.invalid',
    '/\\evil.invalid',
    '/\n/evil',
    null,
  ]) {
    assert.equal(pushDestination(value), '/updates');
  }
  assert.equal(pushDestination('/status/abc?reply=1'), '/status/abc?reply=1');
  assert.deepEqual(Object.keys(pushAlert('id')).sort(), [
    'body',
    'notificationId',
    'title',
  ]);
});

test('disable waits for in-flight registration and observes its own API error', async () => {
  const { updatePushDevice } = await import('../lib/mobile/push');
  const calls: string[] = [];
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const storage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => 'c7093586-d43a-43ad-b322-98ec58b2e081' },
  });
  const request: typeof fetch = async (_input, init) => {
    calls.push(init?.method ?? '');
    if (init?.method === 'PUT') {
      await blocked;
      return Response.json({ success: true });
    }
    return Response.json({ error: 'Removal failed' }, { status: 500 });
  };
  const fetchMock = mock.method(globalThis, 'fetch', request);
  try {
    const registering = updatePushDevice({ platform: 'ios', token: 'fixture' });
    const disabling = updatePushDevice();
    const rejected = assert.rejects(disabling, /Removal failed/);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(calls, ['PUT']);
    release();
    await registering;
    await rejected;
    assert.deepEqual(calls, ['PUT', 'DELETE']);
  } finally {
    fetchMock.mock.restore();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
  }
});
