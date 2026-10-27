import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { after, beforeEach, describe, mock, test } from 'node:test';
import * as betterAuthModule from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';

const origin = 'https://panamia.club';
const clientId = 'native-google-test.apps.googleusercontent.com';
const email = 'native-google-member@example.test';
const nonce = 'native-sign-in-test-nonce';
const keyId = 'native-google-test-key';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const storage: Record<string, Record<string, unknown>[]> = {
  user: [],
  account: [],
  session: [],
  verification: [],
};
const env = {
  BETTER_AUTH_URL: origin,
  NEXT_PUBLIC_HOST_URL: origin,
  BETTER_AUTH_SECRET: 'native-google-test-secret-'.repeat(3),
  GOOGLE_CLIENT_ID: clientId,
  GOOGLE_CLIENT_SECRET: 'native-google-test-only',
};
const originalEnv = Object.fromEntries(
  Object.keys(env).map((key) => [key, process.env[key]])
);
Object.assign(process.env, env);

mock.module(import.meta.resolve('better-auth'), {
  exports: {
    ...betterAuthModule,
    betterAuth: (options: BetterAuthOptions) =>
      betterAuthModule.betterAuth({
        ...options,
        database: memoryAdapter(storage),
        databaseHooks: undefined,
        plugins: options.plugins?.filter(
          (plugin) => plugin.id !== 'custom-session'
        ),
        rateLimit: { enabled: false },
        telemetry: { enabled: false },
        logger: { disabled: true },
      }),
  },
});
mock.module(import.meta.resolve('../lib/db.ts'), {
  exports: { db: {} },
});
mock.method(
  globalThis,
  'fetch',
  async (input: string | URL | Request): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    assert.equal(url, 'https://www.googleapis.com/oauth2/v3/certs');
    return Response.json({
      keys: [
        {
          ...publicKey.export({ format: 'jwk' }),
          kid: keyId,
          alg: 'RS256',
          use: 'sig',
        },
      ],
    });
  }
);

const { handler } = await import('../auth');

beforeEach(() => {
  for (const rows of Object.values(storage)) rows.length = 0;
});

after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  mock.restoreAll();
});

function idToken(claims: Record<string, unknown> = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: keyId })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: clientId,
      sub: 'native-google-subject',
      email,
      email_verified: true,
      name: 'Native Google Member',
      iat: now,
      exp: now + 300,
      nonce,
      ...claims,
    })
  ).toString('base64url');
  const body = `${header}.${payload}`;
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`;
}

function signIn(token = idToken(), requestOrigin = origin) {
  return handler(
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: {
        Origin: requestOrigin,
        'Content-Type': 'application/json',
        Cookie: 'native-test-browser-state=present',
      },
      body: JSON.stringify({
        provider: 'google',
        idToken: { token, nonce },
        callbackURL: `${origin}/signin?complete=1`,
      }),
    })
  );
}

describe('native Google ID-token sign-in', () => {
  test('verifies a signed token and creates a usable HttpOnly app session', async () => {
    const response = await signIn();
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.redirect, false);
    assert.equal(result.user.email, email);
    assert.equal(storage.user.length, 1);
    assert.equal(storage.account.length, 1);
    assert.equal(storage.account[0].providerId, 'google');
    assert.equal(storage.account[0].accountId, 'native-google-subject');
    assert.equal(storage.session.length, 1);
    assert.match(response.headers.get('Set-Cookie') ?? '', /session_token=/);
    assert.match(response.headers.get('Set-Cookie') ?? '', /HttpOnly/i);

    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const sessionResponse = await handler(
      new Request(`${origin}/api/auth/get-session`, { headers: { cookie } })
    );
    assert.equal(sessionResponse.status, 200);
    const session = await sessionResponse.json();
    assert.equal(session.user.id, result.user.id);
    assert.equal(session.session.userId, result.user.id);
  });

  test('links the verified Google address to an existing email account', async () => {
    const now = new Date();
    storage.user.push({
      id: 'existing-email-member',
      name: 'Existing Member',
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    const response = await signIn();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.id, 'existing-email-member');
    assert.equal(storage.user.length, 1);
    assert.equal(storage.session[0].userId, 'existing-email-member');
  });

  for (const [label, claims] of [
    ['wrong audience', { aud: 'another-app.apps.googleusercontent.com' }],
    ['wrong issuer', { iss: 'https://untrusted.example' }],
    ['expired token', { exp: 1 }],
    ['wrong nonce', { nonce: 'another-login-nonce' }],
  ] as const) {
    test(`rejects ${label} without creating a session`, async () => {
      const response = await signIn(idToken(claims));
      assert.equal(response.status, 401);
      assert.equal(response.headers.has('Set-Cookie'), false);
      assert.equal(storage.user.length, 0);
      assert.equal(storage.session.length, 0);
    });
  }

  test('rejects a signature not issued by the trusted Google key', async () => {
    const response = await signIn(idToken({}, otherKey));
    assert.equal(response.status, 401);
    assert.equal(storage.session.length, 0);
  });

  test('preserves cookie-authenticated origin checks for native token exchanges', async () => {
    const response = await signIn(idToken(), 'https://untrusted.example');
    assert.equal(response.status, 403);
    assert.equal(storage.session.length, 0);
  });
});
