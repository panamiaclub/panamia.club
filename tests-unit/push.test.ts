/**
 * Unit tests for push delivery.
 *
 * These cover the two places where a mistake produces no error anywhere: a
 * malformed APNs JWT, which Apple rejects without saying why, and the
 * dead-token classification, which decides whether a member's device row is
 * deleted. Both are invisible in development — there is no local APNs — so
 * they are pinned here instead.
 *
 * No database and no network: `fetch` is replaced per test, and the signing
 * key is generated in-process rather than read from a fixture, so nothing
 * resembling a real credential is committed.
 */
import { test, describe, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { getApnsToken } from '@/lib/push/jwt';
import { sendApns } from '@/lib/push/apns';
import { MOBILE_APP_ID } from '@/lib/mobile/app-identity';

/** PKCS8 PEM for a freshly generated P-256 key, plus its public half. */
async function generateSigningKey(): Promise<{
  pem: string;
  publicKey: CryptoKey;
}> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const bytes = new Uint8Array(pkcs8);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/(.{64})/g, '$1\n');

  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`,
    publicKey: pair.publicKey,
  };
}

function decodeSegment(segment: string): unknown {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(padded));
}

function base64urlToBytes(segment: string): ArrayBuffer {
  const binary = atob(segment.replace(/-/g, '+').replace(/_/g, '/'));
  const buffer = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return buffer;
}

let signingKey: { pem: string; publicKey: CryptoKey };
const realFetch = globalThis.fetch;

before(async () => {
  signingKey = await generateSigningKey();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('getApnsToken — configuration', () => {
  /* Runs before anything mints a token. The configuration check sits ahead of
   * the module-scope cache precisely so that removing credentials takes
   * effect immediately, and this is what holds that ordering in place. */
  test('returns null when APNs credentials are absent', async () => {
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_PRIVATE_KEY;
    delete process.env.APPLE_APP_TEAM_ID;

    assert.equal(await getApnsToken(), null);
  });

  test('returns null when only some of the three are set', async () => {
    process.env.APNS_KEY_ID = 'ABCDE12345';
    delete process.env.APNS_PRIVATE_KEY;
    delete process.env.APPLE_APP_TEAM_ID;

    assert.equal(await getApnsToken(), null);
  });
});

describe('getApnsToken — token shape', () => {
  before(() => {
    process.env.APNS_KEY_ID = 'ABCDE12345';
    process.env.APPLE_APP_TEAM_ID = 'TEAM123456';
    /* The escaped form deliberately: a key pasted out of a secret store or a
     * service account JSON arrives with literal backslash-n rather than real
     * newlines, and that is the case that fails with an import error
     * mentioning nothing about newlines. Handling it implies the plain form,
     * since both end up in the same whitespace strip. */
    process.env.APNS_PRIVATE_KEY = signingKey.pem.replace(/\n/g, '\\n');
  });

  test('mints a three-part JWS from an escaped-newline PEM', async () => {
    const token = await getApnsToken();
    assert.ok(token, 'expected a token');
    assert.equal(token.split('.').length, 3);
  });

  test('header names ES256 and carries the key id', async () => {
    const token = await getApnsToken();
    const header = decodeSegment(token!.split('.')[0]) as Record<
      string,
      unknown
    >;

    assert.equal(header.alg, 'ES256');
    assert.equal(header.kid, 'ABCDE12345');
  });

  test('claims carry the team id as issuer and an issued-at', async () => {
    const token = await getApnsToken();
    const claims = decodeSegment(token!.split('.')[1]) as Record<
      string,
      unknown
    >;

    assert.equal(claims.iss, 'TEAM123456');
    assert.equal(typeof claims.iat, 'number');
    // Seconds, not milliseconds. Apple rejects a token an hour old, and a
    // millisecond value reads as roughly the year 56000 — permanently ahead.
    const skew = Math.abs((claims.iat as number) - Date.now() / 1000);
    assert.ok(skew < 60, `iat looks wrong by ${skew}s`);
  });

  test('signature verifies as raw r||s, the JWS encoding', async () => {
    const token = await getApnsToken();
    const [header, claims, signature] = token!.split('.');

    /* crypto.subtle emits r||s and verifies r||s. node:crypto emits DER, so
     * this assertion is what would catch a port that lost the conversion. */
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey.publicKey,
      base64urlToBytes(signature),
      new TextEncoder().encode(`${header}.${claims}`)
    );

    assert.ok(ok, 'signature did not verify against the signing key');
  });

  test('has no base64 padding, which RFC 7515 forbids', async () => {
    const token = await getApnsToken();
    assert.doesNotMatch(token!, /=/);
  });

  test('reuses the cached token rather than minting per send', async () => {
    const first = await getApnsToken();
    const second = await getApnsToken();

    /* Apple throttles refreshes made more often than roughly every twenty
     * minutes, so minting per request eventually fails under load — the
     * failure mode this cache exists to avoid. */
    assert.equal(first, second);
  });
});

describe('sendApns — delivery outcomes', () => {
  let requests: Array<{ url: string; init: RequestInit }>;

  beforeEach(() => {
    requests = [];
    process.env.APNS_KEY_ID = 'ABCDE12345';
    process.env.APPLE_APP_TEAM_ID = 'TEAM123456';
    process.env.APNS_PRIVATE_KEY = signingKey.pem;
  });

  function stubFetch(status: number, body: unknown) {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
  }

  test('a 200 is a send', async () => {
    stubFetch(200, null);
    const result = await sendApns('tok', { title: 'Hi', body: 'There' });

    assert.equal(result.status, 'sent');
  });

  test('a 410 is dead regardless of body', async () => {
    stubFetch(410, { reason: 'Unregistered' });
    const result = await sendApns('tok', { title: 'Hi', body: 'There' });

    assert.equal(result.status, 'dead');
  });

  test('a 400 with BadDeviceToken is dead', async () => {
    stubFetch(400, { reason: 'BadDeviceToken' });
    const result = await sendApns('tok', { title: 'Hi', body: 'There' });

    assert.equal(result.status, 'dead');
    assert.equal(result.reason, 'BadDeviceToken');
  });

  test('a 400 for a payload problem is failed, not dead', async () => {
    /* The distinction that matters: both arrive as 400, and treating this one
     * as dead would delete the registration of a member whose only mistake
     * was receiving a notification we built badly. */
    stubFetch(400, { reason: 'PayloadTooLarge' });
    const result = await sendApns('tok', { title: 'Hi', body: 'There' });

    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'PayloadTooLarge');
  });

  test('a 500 is failed, leaving the token in place', async () => {
    stubFetch(500, { reason: 'InternalServerError' });
    const result = await sendApns('tok', { title: 'Hi', body: 'There' });

    assert.equal(result.status, 'failed');
  });

  test('an unparseable error body falls back to the status code', async () => {
    globalThis.fetch = (async () =>
      new Response('<html>gateway</html>', {
        status: 503,
      })) as unknown as typeof fetch;

    const result = await sendApns('tok', { title: 'Hi', body: 'There' });

    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'http-503');
  });
});

describe('sendApns — request construction', () => {
  let captured: { url: string; init: RequestInit } | null;

  beforeEach(() => {
    captured = null;
    process.env.APNS_KEY_ID = 'ABCDE12345';
    process.env.APPLE_APP_TEAM_ID = 'TEAM123456';
    process.env.APNS_PRIVATE_KEY = signingKey.pem;

    globalThis.fetch = (async (url: string, init: RequestInit) => {
      captured = { url: String(url), init };
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
  });

  test('targets the sandbox host unless APNS_PRODUCTION is set', async () => {
    delete process.env.APNS_PRODUCTION;
    await sendApns('devicetoken', { title: 'Hi', body: 'There' });

    assert.match(captured!.url, /api\.sandbox\.push\.apple\.com/);
  });

  test('targets the production host when APNS_PRODUCTION is 1', async () => {
    process.env.APNS_PRODUCTION = '1';
    await sendApns('devicetoken', { title: 'Hi', body: 'There' });

    /* A mismatch between this and the aps-environment entitlement comes back
     * as BadDeviceToken, which reads as an uninstalled app rather than as the
     * wrong host — the reason it is worth pinning. */
    assert.match(captured!.url, /api\.push\.apple\.com/);
    assert.doesNotMatch(captured!.url, /sandbox/);
    delete process.env.APNS_PRODUCTION;
  });

  test('puts the device token in the path', async () => {
    await sendApns('devicetoken', { title: 'Hi', body: 'There' });
    assert.match(captured!.url, /\/3\/device\/devicetoken$/);
  });

  test('sends the bundle id as apns-topic', async () => {
    await sendApns('devicetoken', { title: 'Hi', body: 'There' });
    const headers = captured!.init.headers as Record<string, string>;

    // Divergence here is a silent non-delivery, not an error.
    assert.equal(headers['apns-topic'], MOBILE_APP_ID);
    assert.equal(headers['apns-priority'], '10');
  });

  test('puts url alongside aps, not inside it', async () => {
    await sendApns('devicetoken', {
      title: 'Hi',
      body: 'There',
      url: '/updates',
    });
    const payload = JSON.parse(captured!.init.body as string);

    /* Anything inside `aps` is interpreted by iOS; only keys outside it reach
     * the app, which is what the tap handler reads to route. */
    assert.equal(payload.url, '/updates');
    assert.equal(payload.aps.url, undefined);
    assert.equal(payload.aps.alert.title, 'Hi');
    assert.equal(payload.aps.alert.body, 'There');
  });

  test('omits badge when it was not supplied', async () => {
    await sendApns('devicetoken', { title: 'Hi', body: 'There' });
    const payload = JSON.parse(captured!.init.body as string);

    assert.ok(!('badge' in payload.aps));
  });
});
