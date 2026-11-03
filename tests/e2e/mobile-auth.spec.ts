import { test, expect, type Page } from '@playwright/test';
import {
  mobileMagicLinkAppUrl,
  mobileMagicLinkUrl,
} from '../../lib/mobile/auth-links';
import { calls, nativeBridge } from './fixtures/native-bridge';

async function testTurnstile(page: Page) {
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
}

test('native safety reports retain their draft after an error and submit without attachments or navigation', async ({
  page,
}) => {
  await nativeBridge(page);
  await testTurnstile(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: Record<string, FormDataEntryValue>[] = [];
  await page.route('**/api/bug-reports', async (route) => {
    const form = await new Request(route.request().url(), {
      method: 'POST',
      headers: route.request().headers(),
      body: route.request().postData() ?? '',
    }).formData();
    requests.push(Object.fromEntries(form));
    await route.fulfill(
      requests.length === 1
        ? {
            status: 503,
            json: { error: 'Safety reports are temporarily unavailable.' },
          }
        : {
            json: {
              success: true,
              message: 'Your safety report has been received for review.',
            },
          }
    );
  });
  await page.goto('/d');
  await page
    .getByRole('button', { name: 'Report a safety concern', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Report a safety concern',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('form')).toHaveAttribute('method', 'post');
  await expect(dialog.locator('input[type=file]')).toHaveCount(0);
  await expect(
    dialog.getByText(/do not copy, download, or attach/)
  ).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).fill('Safety Test Reporter');
  await dialog
    .getByLabel('Email', { exact: true })
    .fill('reporter@example.test');
  await dialog.getByLabel('Safety reason').selectOption('child_safety');
  await dialog
    .getByLabel('What happened?')
    .fill('Readiness test only; no real incident or illegal material.');
  const send = dialog.getByRole('button', { name: 'Send report', exact: true });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(
    page.getByText('Safety reports are temporarily unavailable.')
  ).toBeVisible();
  await expect(dialog.getByLabel('What happened?')).toHaveValue(
    'Readiness test only; no real incident or illegal material.'
  );
  await expect(send).toBeEnabled();
  await send.click();
  await expect(
    page.getByText('Safety report received', { exact: true })
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/d');
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatchObject({
    reportType: 'safety',
    targetType: 'other',
    reason: 'child_safety',
    name: 'Safety Test Reporter',
    email: 'reporter@example.test',
    turnstileToken: 'mobile-auth-test-token',
  });
  expect(requests[0]).not.toHaveProperty('screenshot');
  expect(requests[0]).not.toHaveProperty('viewport');
  expect(requests[0]).not.toHaveProperty('locale');
  await page.getByRole('button', { name: 'Report a bug', exact: true }).click();
  const bug = page.getByRole('dialog', { name: 'Report a bug', exact: true });
  await bug
    .getByLabel('What happened?')
    .fill('Keep this ordinary bug report draft when closing the dialog.');
  await page.keyboard.press('Escape');
  await expect(bug).toHaveCount(0);
  await page.getByRole('button', { name: 'Report a bug', exact: true }).click();
  await expect(bug.getByLabel('What happened?')).toHaveValue(
    'Keep this ordinary bug report draft when closing the dialog.'
  );
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
});

test.describe('sign-in hydration', () => {
  test.use({ javaScriptEnabled: false });

  test('report controls cannot accept taps before their dialog handlers are ready', async ({
    page,
  }) => {
    await page.goto('/d');
    await expect(
      page.getByRole('button', {
        name: 'Report a safety concern',
        exact: true,
      })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Report a bug', exact: true })
    ).toBeDisabled();
  });

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

  test('review credentials cannot be submitted before hydration or through a GET form', async ({
    page,
  }) => {
    await page.goto('/signin/reviewer');
    await expect(page.locator('form')).toHaveAttribute('method', 'post');
    await expect(page.getByLabel('Review account email')).toBeDisabled();
    await expect(page.getByLabel('Review account password')).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Sign in for review' })
    ).toBeDisabled();
  });
});

test.describe('dedicated app reviewer sign-in', () => {
  for (const platform of ['android', 'ios'] as const) {
    test(`${platform}: the native Social tab redirects signed-out reviewers to sign-in instead of a screen failure`, async ({
      page,
    }) => {
      await nativeBridge(page, {
        platform,
        googlePlugin: platform === 'android',
      });
      await page.goto('/s');
      await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fs$/);
      await expect(
        page.getByRole('link', { name: 'App reviewer sign-in' })
      ).toBeVisible();
      await expect(page.getByText('This screen could not open')).toHaveCount(0);
    });

    test(`${platform}: is discoverable in the app and submits credentials only in the POST body`, async ({
      page,
    }) => {
      await nativeBridge(page, {
        platform,
        googlePlugin: platform === 'android',
      });
      await page.goto('/signin');
      if (platform === 'ios') {
        await expect(
          page.getByRole('button', { name: 'Continue with Google' })
        ).toHaveCount(0);
      }
      await page.getByRole('link', { name: 'App reviewer sign-in' }).click();
      await expect(page).toHaveURL(/\/signin\/reviewer$/);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        /noindex/
      );
      await expect(
        page.getByText(
          /credentials supplied in App Store Connect or Play Console/
        )
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'the standard sign-in page' })
      ).toHaveAttribute('href', '/signin');
      const credentialEndpoint = new URL('/api/auth/sign-in/email', page.url())
        .href;
      const requests: { method: string; url: string; body: unknown }[] = [];
      await page.route('**/api/auth/sign-in/email', async (route) => {
        requests.push({
          method: route.request().method(),
          url: route.request().url(),
          body: route.request().postDataJSON(),
        });
        await route.fulfill({
          status: 401,
          json: {
            code: 'INVALID_EMAIL_OR_PASSWORD',
            message: 'Invalid email or password.',
          },
        });
      });
      const password = 'browser-review-test-not-for-production-2026';
      await page
        .getByLabel('Review account email')
        .fill('play-review@panamia.club');
      await page.getByLabel('Review account password').fill(password);
      await page.getByRole('button', { name: 'Sign in for review' }).click();
      await expect(page.getByRole('alert')).toHaveText(
        'Invalid email or password.'
      );
      expect(requests).toEqual([
        {
          method: 'POST',
          url: credentialEndpoint,
          body: {
            email: 'play-review@panamia.club',
            password,
            callbackURL: '/d',
          },
        },
      ]);
      expect(page.url()).not.toContain(password);
      await expect(
        page.getByRole('button', { name: 'Sign in for review' })
      ).toBeEnabled();
    });
  }
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
    await testTurnstile(page);
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
