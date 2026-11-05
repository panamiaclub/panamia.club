import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { magicLink } from 'better-auth/plugins';
import { parse } from 'dotenv';
import type { Page } from '@playwright/test';

export async function freshAccountSession(page: Page, baseURL: string) {
  const origin = new URL(baseURL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
    throw new Error(
      'Fresh-account session fixtures only support local servers'
    );
  }
  let secret = process.env.BETTER_AUTH_SECRET;
  for (const file of ['.dev.vars', '.env.local']) {
    if (secret) break;
    if (existsSync(file)) secret = parse(readFileSync(file)).BETTER_AUTH_SECRET;
  }
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET is required for fresh-account fixtures'
    );
  }

  // Issue real Better Auth cookies from disposable storage. This never creates
  // a production account, sends mail, or writes to the app's database.
  let verificationURL = '';
  const issuer = betterAuth({
    baseURL: origin.origin,
    secret,
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    plugins: [
      magicLink({
        sendMagicLink: async ({ url }) => {
          verificationURL = url;
        },
      }),
    ],
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    advanced: { useSecureCookies: origin.protocol === 'https:' },
    telemetry: { enabled: false },
    logger: { disabled: true },
  });
  await issuer.api.signInMagicLink({
    body: {
      email: `signup-${randomUUID()}@example.invalid`,
      callbackURL: '/account/user/edit',
    },
    headers: new Headers({ origin: origin.origin }),
  });
  if (!verificationURL)
    throw new Error('No signup verification link was issued');
  const response = await issuer.handler(new Request(verificationURL));
  if (response.status !== 302) {
    throw new Error(
      `Could not create fresh-account session: ${response.status}`
    );
  }

  const cookies = response.headers.getSetCookie().map((header) => {
    const pair = header.split(';', 1)[0];
    const separator = pair.indexOf('=');
    return {
      name: pair.slice(0, separator),
      value: pair.slice(separator + 1),
      url: origin.origin,
      httpOnly: true,
      secure: origin.protocol === 'https:',
      sameSite: 'Lax' as const,
    };
  });
  const session = await issuer.api.getSession({
    headers: new Headers({
      cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
    }),
  });
  if (!session) throw new Error('Fresh-account cookies did not authenticate');
  await page.context().addCookies(cookies);
  return session;
}
