import assert from 'node:assert/strict';
import { after, beforeEach, describe, mock, test } from 'node:test';
import * as betterAuthModule from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { getEmail, type SendEmail } from '@/lib/email';
import { getRootDomain } from '@/lib/panaverse/surfaces';

const origin = 'https://panamia.club';
const email = 'magic-link-member@example.test';
const start = new Date('2026-10-25T19:00:00Z');
const storage: Record<string, Record<string, unknown>[]> = {
  user: [],
  account: [],
  session: [],
  verification: [],
};
const messages: Parameters<SendEmail['send']>[0][] = [];
const originalEnv = {
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  NEXT_PUBLIC_HOST_URL: process.env.NEXT_PUBLIC_HOST_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  EMAIL_ENV: process.env.EMAIL_ENV,
};

Object.assign(process.env, {
  BETTER_AUTH_URL: origin,
  NEXT_PUBLIC_HOST_URL: origin,
  BETTER_AUTH_SECRET: 'magic-link-test-secret-'.repeat(3),
  EMAIL_ENV: 'PROD',
});

// Exercise the real app options, email templates, handler, and Better Auth
// endpoints without running unrelated profile hooks or touching Postgres.
mock.module(import.meta.resolve('better-auth'), {
  exports: {
    ...betterAuthModule,
    betterAuth: (options: BetterAuthOptions) =>
      betterAuthModule.betterAuth({
        ...options,
        database: memoryAdapter(storage),
        databaseHooks: undefined,
        rateLimit: { enabled: false },
        telemetry: { enabled: false },
        logger: { disabled: true },
      }),
  },
});
mock.module(import.meta.resolve('../lib/db.ts'), {
  exports: { db: {} },
});

const { handler } = await import('../auth');

beforeEach(() => {
  for (const rows of Object.values(storage)) rows.length = 0;
  messages.length = 0;
  getEmail({
    EMAIL: {
      send: async (message) => {
        messages.push(message);
      },
    },
  });
});

after(() => {
  getEmail({});
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  mock.restoreAll();
});

async function requestLink(callbackURL = '/') {
  const response = await handler(
    new Request(`${origin}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, callbackURL }),
    })
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: true });
  const message = messages.at(-1);
  assert.ok(message);
  const match = message.text?.match(
    /^https:\/\/panamia\.club\/api\/auth\/magic-link\/verify\?.+$/m
  );
  assert.ok(match);
  return { url: new URL(match[0]), message };
}

function recoveryLocation(response: Response, callbackURL: string) {
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('Location') ?? '');
  assert.equal(location.origin, origin);
  assert.equal(location.pathname, '/signin');
  assert.equal(location.searchParams.get('error'), 'INVALID_TOKEN');
  assert.equal(location.searchParams.get('callbackUrl'), callbackURL);
  assert.equal(response.headers.has('Set-Cookie'), false);
}

describe('app magic-link lifetime and recovery', () => {
  test('stores a real 30-minute expiry and sends matching HTML and text', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: start });
    const { url, message } = await requestLink();
    const record = storage.verification.find(
      (row) => row.identifier === `magic-link:${url.searchParams.get('token')}`
    );
    assert.ok(record);
    assert.ok(record.expiresAt instanceof Date);
    assert.equal(record.expiresAt.getTime() - start.getTime(), 30 * 60 * 1000);
    assert.match(message.html, /expires in 30 minutes/);
    assert.match(message.html, /<strong>30 minutes<\/strong>/);
    assert.match(message.text ?? '', /expires in 30 minutes/);
    assert.doesNotMatch(message.html, /24 hours/);
    assert.doesNotMatch(message.text ?? '', /24 hours/);
  });

  test('a new member can sign in just before 30 minutes, but not reuse the link', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: start });
    const callbackURL = '/m/schedule/book?mentor=taylor&mode=video';
    const { url } = await requestLink(callbackURL);
    t.mock.timers.tick(30 * 60 * 1000 - 1);

    const response = await handler(new Request(url));
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('Location'),
      new URL(callbackURL, origin).toString()
    );
    assert.match(response.headers.get('Set-Cookie') ?? '', /session_token=/);
    assert.equal(storage.user.length, 1);
    assert.equal(storage.session.length, 1);
    recoveryLocation(await handler(new Request(url)), callbackURL);
    assert.equal(storage.session.length, 1);
  });

  test('an existing member signs in without a duplicate account', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: start });
    storage.user.push({
      id: 'existing-member',
      name: 'Taylor',
      email,
      emailVerified: true,
      createdAt: start,
      updatedAt: start,
    });
    const { url } = await requestLink();
    t.mock.timers.tick(20 * 60 * 1000);

    const response = await handler(new Request(url));
    assert.equal(response.status, 302);
    assert.match(response.headers.get('Set-Cookie') ?? '', /session_token=/);
    assert.equal(storage.user.length, 1);
    assert.equal(storage.session.length, 1);
    assert.equal(storage.session[0].userId, 'existing-member');
  });

  test('a link expires after 30 minutes and returns to the resend form', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: start });
    const callbackURL = '/m/discover?category=music&county=miami-dade';
    const { url } = await requestLink(callbackURL);
    t.mock.timers.tick(30 * 60 * 1000 + 1);

    recoveryLocation(await handler(new Request(url)), callbackURL);
    assert.equal(storage.user.length, 0);
    assert.equal(storage.session.length, 0);
  });

  test('does not renew links issued with the old five-minute deadline', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: start });
    const { url } = await requestLink();
    const record = storage.verification[0];
    assert.ok(record);
    record.expiresAt = new Date(start.getTime() + 5 * 60 * 1000);
    t.mock.timers.tick(6 * 60 * 1000);

    recoveryLocation(await handler(new Request(url)), '/');
    assert.equal(storage.session.length, 0);
  });

  test('older links without an error callback recover and preserve destinations', async () => {
    for (const callbackURL of [
      '/',
      '/e/example/manage?tab=attendees&page=2',
      `https://connectors.${getRootDomain()}/`,
    ]) {
      const url = new URL('/api/auth/magic-link/verify', origin);
      url.searchParams.set('token', 'missing-magic-link-token');
      url.searchParams.set('callbackURL', callbackURL);
      recoveryLocation(await handler(new Request(url)), callbackURL);
    }
  });

  test('preserves an explicitly supplied error callback', async () => {
    const url = new URL('/api/auth/magic-link/verify', origin);
    url.searchParams.set('token', 'missing-magic-link-token');
    url.searchParams.set(
      'errorCallbackURL',
      `${origin}/custom-recovery?from=mail`
    );
    const response = await handler(new Request(url));
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('Location') ?? '');
    assert.equal(location.pathname, '/custom-recovery');
    assert.equal(location.searchParams.get('from'), 'mail');
    assert.equal(location.searchParams.get('error'), 'INVALID_TOKEN');
  });

  test('does not bypass origin validation for untrusted callbacks', async () => {
    const url = new URL('/api/auth/magic-link/verify', origin);
    url.searchParams.set('token', 'missing-magic-link-token');
    url.searchParams.set('callbackURL', 'https://untrusted.invalid/');
    const response = await handler(new Request(url));
    assert.equal(response.status, 403);
    assert.equal(response.headers.has('Set-Cookie'), false);
  });

  test('does not change unrelated auth requests', async () => {
    const response = await handler(
      new Request(`${origin}/api/auth/get-session`)
    );
    assert.equal(response.status, 200);
    assert.equal(await response.json(), null);
  });
});
