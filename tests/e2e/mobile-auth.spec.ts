import { test, expect } from '@playwright/test';
import {
  mobileMagicLinkAppUrl,
  mobileMagicLinkUrl,
} from '../../lib/mobile/auth-links';
import { calls, nativeBridge } from './fixtures/native-bridge';

test.describe('sign-in hydration', () => {
  test.use({ javaScriptEnabled: false });

  test('sign-in controls cannot accept taps before event handlers are ready', async ({
    page,
  }) => {
    await page.goto('/signin');
    await expect(
      page.getByRole('button', { name: 'Continue with Google' })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Sign in with email' })
    ).toBeDisabled();
    await page.goto('/signin?error=INVALID_TOKEN');
    await expect(page.getByPlaceholder('your@email.com')).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Send sign-in link', exact: true })
    ).toBeDisabled();
  });
});

test.describe('native Google sign-in', () => {
  test('uses the native account picker and exchanges its token in the app', async ({
    page,
    context,
  }) => {
    await nativeBridge(page);
    const exchanges: {
      provider: string;
      idToken: { token: string; nonce: string };
    }[] = [];
    await page.route('**/api/auth/sign-in/social', async (route) => {
      exchanges.push(route.request().postDataJSON());
      await route.fulfill({
        headers: {
          'Set-Cookie': 'native-auth-test-session=app; Path=/; HttpOnly',
        },
        json: {
          redirect: false,
          token: 'test-session',
          user: { id: 'member' },
        },
      });
    });
    await page.goto('/signin?callbackUrl=%2Fsignin%3FnativeComplete%3D1');
    await expect(page.locator('html')).toHaveClass(/native-app/);
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page).toHaveURL(/\/signin\?nativeComplete=1$/);
    expect(exchanges).toHaveLength(1);
    const exchange = exchanges[0];
    expect(exchange).toMatchObject({
      provider: 'google',
      idToken: { token: 'native-google-test-id-token' },
    });
    const nativeCalls = await calls(page);
    const initialize = nativeCalls.find((call) => call.method === 'initialize');
    expect(initialize?.args.google?.mode).toBe('online');
    expect(initialize?.args.google?.webClientId).toMatch(
      /\.apps\.googleusercontent\.com$/
    );
    const login = nativeCalls.find((call) => call.method === 'login');
    expect(exchange?.idToken.nonce).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(exchange?.idToken.nonce).toBe(login?.args.options?.nonce);
    expect(login?.args.options?.scopes).toEqual(['email', 'profile']);
    expect(await context.cookies()).toContainEqual(
      expect.objectContaining({
        name: 'native-auth-test-session',
        httpOnly: true,
      })
    );
  });

  test('cancelling the account picker restores the button without web OAuth', async ({
    page,
  }) => {
    await nativeBridge(page, { cancelGoogle: true });
    let exchanges = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/auth/sign-in/social') {
        exchanges += 1;
      }
    });
    await page.goto('/signin');
    await expect(page.locator('html')).toHaveClass(/native-app/);
    const button = page.getByRole('button', { name: 'Continue with Google' });
    await button.click();
    await expect
      .poll(async () =>
        (await calls(page)).some((call) => call.method === 'login')
      )
      .toBe(true);
    await expect(button).toBeEnabled();
    expect(exchanges).toBe(0);
    await expect(page).toHaveURL(/\/signin$/);
  });

  test('a rejected token exchange explains the failure and leaves the app signed out', async ({
    page,
    context,
  }) => {
    await nativeBridge(page);
    await page.route('**/api/auth/sign-in/social', (route) =>
      route.fulfill({
        status: 401,
        json: { code: 'INVALID_TOKEN', message: 'Rejected test ID token' },
      })
    );
    await page.goto('/signin');
    await expect(page.locator('html')).toHaveClass(/native-app/);
    const button = page.getByRole('button', { name: 'Continue with Google' });
    await button.click();
    await expect(
      page.getByText('Google sign-in could not start. Please try again.')
    ).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(page).toHaveURL(/\/signin$/);
    expect(await context.cookies()).not.toContainEqual(
      expect.objectContaining({ name: 'native-auth-test-session' })
    );
  });

  for (const options of [
    { platform: 'android' as const, googlePlugin: false },
    { platform: 'ios' as const },
  ]) {
    test(`${options.platform} without supported native Google keeps email sign-in`, async ({
      page,
    }) => {
      await nativeBridge(page, options);
      await page.goto('/signin');
      await expect(page.getByPlaceholder('your@email.com')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Continue with Google' })
      ).toHaveCount(0);
    });
  }
});

test('native Android back lets a modal consume the event before exiting', async ({
  page,
}) => {
  await nativeBridge(page);
  await page.goto('/signin');
  await expect
    .poll(async () =>
      (await calls(page)).some(
        (call) =>
          call.method === 'addListener' && call.args.eventName === 'backButton'
      )
    )
    .toBe(true);
  await page.evaluate(() => {
    window.addEventListener(
      'native-back-button',
      (event) => event.preventDefault(),
      { once: true }
    );
    window.dispatchEvent(
      new CustomEvent('native-auth-test.back', { detail: false })
    );
  });
  expect(
    (await calls(page)).filter((call) => call.method === 'exitApp')
  ).toHaveLength(0);
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('native-auth-test.back', { detail: false })
    );
  });
  await expect
    .poll(
      async () =>
        (await calls(page)).filter((call) => call.method === 'exitApp').length
    )
    .toBe(1);
});

test.describe('app email-link handoff', () => {
  test('email requested in the app carries native metadata to the server', async ({
    page,
    baseURL,
  }) => {
    await nativeBridge(page, { googlePlugin: false });
    await page.route('**/api/config/turnstile', (route) =>
      route.fulfill({ json: { siteKey: 'mobile-auth-test-site-key' } })
    );
    await page.route(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?*',
      (route) =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `window.turnstile = {
            render: function (element, options) {
              queueMicrotask(function () { options.callback('mobile-auth-test-token'); });
              return 'mobile-auth-test-widget';
            },
            reset: function () {},
            remove: function () {}
          };`,
        })
    );
    await page.route('**/api/auth/verify-turnstile', (route) =>
      route.fulfill({ json: { success: true } })
    );
    const requests: Record<string, unknown>[] = [];
    await page.route('**/api/auth/sign-in/magic-link', (route) => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: { status: true } });
    });
    await page.goto('/signin');
    await page.getByPlaceholder('your@email.com').fill('member@example.test');
    const button = page.getByRole('button', {
      name: 'Send sign-in link',
      exact: true,
    });
    await expect(button).toBeEnabled();
    await button.click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toMatchObject({
      email: 'member@example.test',
      callbackURL: `${baseURL}/`,
      metadata: { nativeApp: true },
    });
  });

  test('a browser landing does not consume the token or silently sign in', async ({
    page,
  }) => {
    let verifications = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/auth/magic-link/verify') {
        verifications += 1;
      }
    });
    const response = await page.goto('/signin/mobile?token=email-test-token');
    await expect(
      page.getByRole('link', { name: 'Open Pana Mia app' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Continue in browser instead' })
    ).toHaveAttribute('href', /\/api\/auth\/magic-link\/verify\?/);
    expect(verifications).toBe(0);
    expect(response?.headers()['cache-control']).toContain('no-store');
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  });

  for (const { platform, cold } of (['android', 'ios'] as const).flatMap(
    (platform) => [true, false].map((cold) => ({ platform, cold }))
  )) {
    test(`${platform} ${cold ? 'cold launch' : 'warm app link'} verifies once in the app's cookie store`, async ({
      page,
      context,
      baseURL,
    }) => {
      const verification = new URL('/api/auth/magic-link/verify', baseURL);
      verification.search = new URLSearchParams({
        token: 'email-test-token',
        callbackURL: '/signin?emailComplete=1',
      }).toString();
      const mobile = mobileMagicLinkUrl(verification.href);
      const appUrl = mobileMagicLinkAppUrl(mobile);
      await nativeBridge(page, {
        platform,
        ...(cold ? { launchUrl: appUrl } : {}),
      });
      let verifications = 0;
      await page.route('**/api/auth/magic-link/verify?*', (route) => {
        verifications += 1;
        return route.fulfill({
          // WebKit cannot fulfill mocked 3xx responses. Keep the cookie and
          // final document navigation that the verification redirect performs.
          contentType: 'text/html',
          headers: {
            'Set-Cookie': 'native-email-test-session=app; Path=/; HttpOnly',
          },
          body: '<!doctype html><script>location.replace("/signin?emailComplete=1")</script>',
        });
      });
      await page.goto('/signin');
      if (!cold) {
        await expect
          .poll(async () =>
            (await calls(page)).some(
              (call) =>
                call.method === 'addListener' &&
                call.args.eventName === 'appUrlOpen'
            )
          )
          .toBe(true);
        await page.evaluate((url) => {
          window.dispatchEvent(
            new CustomEvent('native-auth-test.app-url', { detail: url })
          );
        }, appUrl);
      }
      await expect(page).toHaveURL(/\/signin\?emailComplete=1$/);
      expect(verifications).toBe(1);
      expect(await context.cookies()).toContainEqual(
        expect.objectContaining({
          name: 'native-email-test-session',
          httpOnly: true,
        })
      );

      const launchReads = (await calls(page)).filter(
        (call) => call.method === 'getLaunchUrl'
      ).length;
      await page.reload();
      await expect
        .poll(
          async () =>
            (await calls(page)).filter((call) => call.method === 'getLaunchUrl')
              .length
        )
        .toBeGreaterThan(launchReads);
      await expect(page).toHaveURL(/\/signin\?emailComplete=1$/);
      expect(verifications).toBe(1);
    });
  }

  test('invalid handoff links show recovery instead of attempting verification', async ({
    page,
  }) => {
    await nativeBridge(page);
    await page.goto('/signin/mobile');
    await expect(page.getByRole('alert')).toContainText(
      'We could not open this sign-in link'
    );
    await expect(
      page.getByRole('link', { name: 'Request a new sign-in link' })
    ).toHaveAttribute('href', '/signin');
  });
});
