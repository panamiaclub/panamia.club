import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';
import * as betterAuthModule from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { hashPassword } from 'better-auth/crypto';
import { PLAY_REVIEW_EMAIL } from '@/lib/play-reviewer';

const origin = 'https://panamia.club';
const password = 'reviewer-auth-test-not-for-production-2026';
const storage: Record<string, Record<string, unknown>[]> = {
  user: [],
  account: [],
  session: [],
  verification: [],
};
const originalEnv = {
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  NEXT_PUBLIC_HOST_URL: process.env.NEXT_PUBLIC_HOST_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
};
Object.assign(process.env, {
  BETTER_AUTH_URL: origin,
  NEXT_PUBLIC_HOST_URL: origin,
  BETTER_AUTH_SECRET: 'reviewer-auth-test-secret-'.repeat(3),
  ADMIN_EMAILS: PLAY_REVIEW_EMAIL,
});

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
  exports: {
    db: {
      query: {
        profiles: {
          findFirst: async () => ({
            verification: {},
            roles: {
              admin: true,
              contentModerator: true,
              mentoringModerator: true,
              eventOrganizer: true,
            },
          }),
        },
      },
    },
  },
});
const { handler } = await import('../auth');
const passwordHash = await hashPassword(password);

beforeEach(() => {
  for (const rows of Object.values(storage)) rows.length = 0;
  for (const [id, email] of [
    ['reviewer', PLAY_REVIEW_EMAIL],
    ['ordinary', 'member@example.invalid'],
  ]) {
    storage.user.push({
      id,
      email,
      emailVerified: true,
      name: id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    storage.account.push({
      id: `${id}-credential`,
      userId: id,
      accountId: id,
      providerId: 'credential',
      password: passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
});

after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  mock.restoreAll();
});

function request(path: string, body: Record<string, unknown>) {
  return handler(
    new Request(`${origin}/api/auth${path}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

test('review credentials establish a reusable HttpOnly session without staff permissions', async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request('/sign-in/email', {
      email: PLAY_REVIEW_EMAIL,
      password,
      callbackURL: '/d',
    });
    assert.equal(response.status, 200);
    const cookies = response.headers.get('Set-Cookie') ?? '';
    assert.match(cookies, /session_token=/);
    assert.match(cookies, /HttpOnly/i);
    const cookie = cookies
      .split(', ')
      .map((part) => part.split(';')[0])
      .join('; ');
    const sessionResponse = await handler(
      new Request(`${origin}/api/auth/get-session`, {
        headers: { Cookie: cookie },
      })
    );
    assert.equal(sessionResponse.status, 200);
    const session = await sessionResponse.json();
    assert.equal(session.user.email, PLAY_REVIEW_EMAIL);
    for (const role of [
      'isAdmin',
      'isSuperAdmin',
      'isContentModerator',
      'isMentoringModerator',
      'isEventOrganizer',
    ])
      assert.equal(session.user[role], false);
  }
  assert.equal(storage.session.length, 2);
});

test('ordinary accounts cannot use credential sign-in even if a credential row exists', async () => {
  const response = await request('/sign-in/email', {
    email: 'member@example.invalid',
    password,
  });
  assert.equal(response.status, 401);
  assert.equal(storage.session.length, 0);
});

test('wrong passwords and unverified review addresses do not create sessions', async () => {
  assert.equal(
    (
      await request('/sign-in/email', {
        email: PLAY_REVIEW_EMAIL,
        password: 'a-different-password-that-is-long-enough',
      })
    ).status,
    401
  );
  storage.user[0].emailVerified = false;
  assert.equal(
    (
      await request('/sign-in/email', {
        email: PLAY_REVIEW_EMAIL,
        password,
      })
    ).status,
    403
  );
  assert.equal(storage.session.length, 0);
});

test('password signup, setting, changes, and reset requests stay unavailable', async () => {
  for (const path of [
    '/sign-up/email',
    '/set-password',
    '/change-password',
    '/request-password-reset',
    '/forget-password',
    '/reset-password',
  ]) {
    const response = await request(path, {
      email: PLAY_REVIEW_EMAIL,
      name: 'Do not create',
      password,
      newPassword: password,
      currentPassword: password,
    });
    assert.ok(
      [403, 404].includes(response.status),
      `${path}: ${response.status}`
    );
  }
  assert.equal(storage.user.length, 2);
  assert.equal(storage.account.length, 2);
});

test('a trailing slash cannot bypass the ordinary-account restriction', async () => {
  const response = await request('/sign-in/email/', {
    email: 'member@example.invalid',
    password,
  });
  assert.ok([401, 404].includes(response.status));
  assert.equal(storage.session.length, 0);
});
