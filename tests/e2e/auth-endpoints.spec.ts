import { test, expect } from '@playwright/test';

/**
 * Request-level coverage for the better-auth mount at /api/auth/[...all].
 *
 * The rest of the suite only asserts that the /signin page renders its provider
 * buttons, which passes whether or not the auth API answers at all. These tests
 * cover the two ways that mount has actually broken:
 *
 *   1. vinext#2158 — the catch-all handed better-auth a path better-call would
 *      not route, 404ing every endpoint while the page still rendered fine.
 *   2. better-auth 1.7 — generic-OAuth callbacks moved from
 *      /api/auth/oauth2/callback/:id to /api/auth/callback/:id.
 *
 * better-call answers an unroutable path with a bare 404 (see its
 * router.mjs processRequest), so "not 404" is the meaningful signal that an
 * endpoint is mounted, and a literal 404 is the signal that one is gone.
 *
 * None of these need a signed-in user. The invalid magic-link checks use the
 * runner's verification table; the other probes fail validation or return an
 * anonymous session before needing a database query.
 */

test.describe('better-auth API mount', () => {
  // The session endpoint is /get-session. /session is the next-auth spelling and
  // better-call answers it with the same bare 404 it gives any unrouted path, so
  // getting this wrong tests nothing but the router's 404 branch.
  test('GET /api/auth/get-session answers for an anonymous caller', async ({
    request,
  }) => {
    const res = await request.get('/api/auth/get-session');

    // 200 with a null session, not a 404. This is the assertion that would have
    // caught vinext#2158 in CI instead of by hand. The status alone was the
    // whole check, which any server answering 200 satisfies -- including a
    // static stub serving HTML. The comment already claimed a null JSON
    // session, so assert that too: it is the part that says better-auth
    // answered, rather than something else answering in its place.
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');
    expect(await res.json()).toBeNull();
  });

  test('GET /api/auth/get-session/ is not 404 with a trailing slash', async ({
    request,
  }) => {
    // maxRedirects:0 so a framework-level 308 to the slash-free URL is visible
    // as a 308 rather than being followed into a 200 that proves nothing.
    const res = await request.get('/api/auth/get-session/', {
      maxRedirects: 0,
    });

    // Either mechanism is fine — better-auth's advanced.skipTrailingSlashes
    // routing both spellings to one endpoint (200), or the framework
    // canonicalizing to the slash-free URL first (3xx). What must not happen is
    // better-call's trailing-slash mismatch check rejecting it outright, which
    // is a bare 404 and takes the endpoint down for any caller that adds a
    // slash. If this starts failing, skipTrailingSlashes is load-bearing.
    expect(res.status()).not.toBe(404);
    expect(res.status()).toBeLessThan(400);

    // A 200 here must be the session endpoint answering, not an HTML page that
    // happens to have a non-404 status.
    if (res.status() === 200) {
      expect(res.headers()['content-type']).toContain('application/json');
    }
  });

  test('accepts sign-in requests from the www production alias', async ({
    request,
  }) => {
    const origin = 'https://www.panamia.club';
    const res = await request.post('/api/auth/sign-in/social', {
      headers: {
        Origin: origin,
        Referer: `${origin}/signin`,
      },
      data: {
        provider: 'google',
        callbackURL: `${origin}/`,
      },
    });

    // Both production sign-in methods were rejected here before reaching
    // their provider because www was absent from trustedOrigins.
    expect(res.status()).not.toBe(403);
  });
});

test.describe('magic-link recovery', () => {
  const callbackURL = '/m/schedule/book?mentor=taylor&mode=video';
  const path = `/api/auth/magic-link/verify?${new URLSearchParams({
    token: 'invalid-magic-link-for-recovery-test',
    callbackURL,
  })}`;

  test('invalid links redirect to sign-in without caching the response', async ({
    request,
  }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const location = new URL(response.headers().location);
    expect(location.pathname).toBe('/signin');
    expect(location.searchParams.get('error')).toBe('INVALID_TOKEN');
    expect(location.searchParams.get('callbackUrl')).toBe(callbackURL);
    expect(response.headers()['cache-control']).toContain('private');
    expect(response.headers()['cache-control']).toContain('no-store');
  });

  test('the recovery page explains the error and opens the email form', async ({
    page,
  }) => {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const recovery = new URL(response.headers().location);
    // Auth can have a production base URL; exercise the recovery UI on this runner.
    await page.goto(`${recovery.pathname}${recovery.search}`);
    const location = new URL(page.url());
    expect(location.pathname).toBe('/signin');
    expect(location.searchParams.get('callbackUrl')).toBe(callbackURL);
    await expect(
      page.getByRole('alert').filter({
        hasText:
          'That sign-in link has expired or has already been used. Request a new one below.',
      })
    ).toBeVisible();
    await expect(page.getByPlaceholder('your@email.com')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Send sign-in link', exact: true })
    ).toBeVisible();
  });
});

test.describe('OAuth callback paths', () => {
  test('GET /api/auth/callback/:id is mounted', async ({ request }) => {
    // No state/code, so this fails validation — but it must fail as a mounted
    // endpoint (a redirect to the error URL, or a 4xx), never as an unrouted
    // path. better-auth 1.7 serves every provider from this one path, generic
    // OAuth (wikimedia, mastodon) included.
    const res = await request.get('/api/auth/callback/google', {
      maxRedirects: 0,
    });

    // `not.toBe(404)` was the whole assertion, which a server answering 200
    // everywhere also satisfies. The comment above already describes the two
    // acceptable outcomes, so assert them: a mounted callback given no state
    // must reject it, and a plain 200 means it did not.
    expect(res.status()).not.toBe(404);
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(500);
  });

  test('GET /api/auth/oauth2/callback/:id is gone after 1.7', async ({
    request,
  }) => {
    // The pre-1.7 generic-OAuth callback path. better-auth no longer registers
    // it, so better-call finds no route and returns a bare 404. If this ever
    // returns something else, the 1.7 provider model has been partly reverted
    // and the redirect URIs registered with each provider need rechecking.
    const res = await request.get('/api/auth/oauth2/callback/wikimedia', {
      maxRedirects: 0,
    });

    expect(res.status()).toBe(404);
  });
});
