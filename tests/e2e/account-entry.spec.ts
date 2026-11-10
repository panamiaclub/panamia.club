import { expect, test, type Page } from '@playwright/test';
import { installNativeApiFixtures } from './fixtures/native-app-api';
import { nativeBridge } from './fixtures/native-bridge';

async function signedOut(page: Page) {
  const fixtures = await installNativeApiFixtures(page);
  fixtures.state.signedIn = false;
}

async function revealEmail(page: Page) {
  const toggle = page.getByRole('button', {
    name: 'Continue with email',
    exact: true,
  });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
}

async function emailRequests(page: Page) {
  const submissions: Record<string, unknown>[] = [];
  await page.route('**/api/config/turnstile', (route) =>
    route.fulfill({ json: { siteKey: 'account-entry-test-key' } })
  );
  await page.route(
    'https://challenges.cloudflare.com/turnstile/v0/api.js?*',
    (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `window.turnstile = {
          render: function (element, options) {
            queueMicrotask(function () { options.callback('account-entry-test-token'); });
            return 'account-entry-test-widget';
          },
          reset: function () {},
          remove: function () {}
        };`,
      })
  );
  await page.route('**/api/auth/verify-turnstile', (route) =>
    route.fulfill({ json: { success: true } })
  );
  await page.route('**/api/auth/sign-in/magic-link', async (route) => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: true } });
  });
  return submissions;
}

test.describe('account entry', () => {
  test.beforeEach(async ({ page }) => {
    await signedOut(page);
  });

  test('the approved shared page welcomes both audiences and preserves its callback', async ({
    page,
  }) => {
    const callback = '/m/discover?category=arts&from=account-entry';
    await page.goto(
      `/signin?${new URLSearchParams({ callbackUrl: callback })}`
    );
    const card = page.locator('#signin-card');
    await expect(
      card.getByRole('heading', {
        name: 'Create an account or sign in',
        exact: true,
      })
    ).toBeVisible();
    await expect(card.getByText('New here?', { exact: true })).toBeVisible();
    await expect(
      card.getByText('Already a member?', { exact: true })
    ).toBeVisible();
    await expect(card.locator('strong')).toHaveCount(2);
    await expect(page.getByText('Welcome back, Pana.')).toHaveCount(0);
    await expect(page.getByText('Design preview')).toHaveCount(0);
    await expect(page.locator('input[type=password]')).toHaveCount(0);

    const entries = page.getByRole('navigation', {
      name: 'Create account or sign in',
      exact: true,
    });
    for (const name of ['Create account', 'Sign in']) {
      const link = entries.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('href', '#signin-card');
      await link.click();
      expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(
        callback
      );
      expect(new URL(page.url()).hash).toBe('#signin-card');
      await expect(page.locator('h1')).toHaveCount(1);
    }
    await revealEmail(page);
    await expect(
      card.getByText('No password needed.', { exact: false })
    ).toBeVisible();
    await expect(
      card.getByRole('button', { name: 'Email me a link', exact: true })
    ).toBeVisible();
  });

  test('public mastheads expose both direct entry points without an extra menu step', async ({
    page,
  }) => {
    await page.goto('/account/user/edit');
    const entries = page.getByRole('navigation', {
      name: 'Create account or sign in',
      exact: true,
    });
    for (const name of ['Create account', 'Sign in']) {
      const link = entries.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', '/signin');
    }
  });

  test('both entry points remain visible and keep the wordmark centered on narrow screens', async ({
    page,
  }) => {
    await page.goto('/signin');
    await expect(
      page.getByRole('button', { name: 'Menu', exact: true })
    ).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    const header = page.getByRole('banner');
    const logo = header.getByRole('link', {
      name: 'Pana Mia Club',
      exact: true,
    });
    const entries = header.getByRole('navigation', {
      name: 'Create account or sign in',
      exact: true,
    });
    const frame = header.locator('[data-auth-entry="true"]');
    for (const width of [320, 375, 390, 640, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(async () => {
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth)
        ).toBeLessThanOrEqual(width);
        const logoBox = await logo.boundingBox();
        const entryBox = await entries.boundingBox();
        const frameBox = await frame.boundingBox();
        if (!logoBox || !entryBox || !frameBox) {
          throw new Error('Account masthead is missing');
        }
        expect(
          Math.abs(
            logoBox.x + logoBox.width / 2 - (frameBox.x + frameBox.width / 2)
          ),
          JSON.stringify({ width, logoBox, entryBox, frameBox })
        ).toBeLessThanOrEqual(2);
        expect(logoBox.x + logoBox.width).toBeLessThanOrEqual(entryBox.x);
        for (const name of ['Create account', 'Sign in']) {
          const link = entries.getByRole('link', { name, exact: true });
          expect(await link.isVisible()).toBe(true);
          const box = await link.boundingBox();
          if (!box) throw new Error(`${name} is missing at ${width}px`);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
          expect(box.height).toBeGreaterThanOrEqual(24);
        }
      }).toPass({ timeout: 5000 });
    }
  });

  test('Spanish copy makes creation and access explicit without changing the route', async ({
    page,
  }) => {
    const submissions = await emailRequests(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/signin?callbackUrl=%2Fm%2Fdiscover');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: 'en Español', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Crea una cuenta o inicia sesión',
        exact: true,
      })
    ).toBeVisible();
    const entries = page.getByRole('navigation', {
      name: 'Crear cuenta o iniciar sesión',
      exact: true,
    });
    await expect(
      entries.getByRole('link', { name: 'Crear cuenta', exact: true })
    ).toBeVisible();
    await expect(
      entries.getByRole('link', { name: 'Iniciar sesión', exact: true })
    ).toBeVisible();
    const toggle = page.getByRole('button', {
      name: 'Continuar con correo electrónico',
      exact: true,
    });
    if (await toggle.isVisible()) await toggle.click();
    await expect(
      page.getByLabel('Correo electrónico', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Enviarme un enlace', exact: true })
    ).toBeVisible();
    await page
      .getByLabel('Correo electrónico', { exact: true })
      .fill('cuenta@example.invalid');
    await page
      .getByRole('button', { name: 'Enviarme un enlace', exact: true })
      .click();
    const status = page.locator('#signin-card').getByRole('status');
    await expect(status).toContainText(
      'Revisa cuenta@example.invalid para encontrar tu enlace de acceso a Pana.'
    );
    await expect(status).toContainText(
      'Ábrelo en este navegador para continuar. Si no lo encuentras, revisa Spam o Correo no deseado.'
    );
    expect(submissions).toHaveLength(1);
    expect(new URL(String(submissions[0].callbackURL)).pathname).toBe(
      '/m/discover'
    );
    expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(
      '/m/discover'
    );
  });

  test('native email-only sign-in does not advertise Google or add a second masthead', async ({
    page,
  }) => {
    await nativeBridge(page, { platform: 'ios' });
    const submissions = await emailRequests(page);
    await page.goto('/signin');
    await expect(page.locator('.auth-page-header')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Continue with Google', exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByText('Enter your email to create your account.', {
        exact: false,
      })
    ).toBeVisible();
    await expect(
      page.getByLabel('Email address', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'App reviewer sign-in', exact: true })
    ).toBeVisible();
    await page
      .getByLabel('Email address', { exact: true })
      .fill('native-inbox@example.invalid');
    await page
      .getByRole('button', { name: 'Email me a link', exact: true })
      .click();
    const status = page.locator('#signin-card').getByRole('status');
    await expect(status).toContainText(
      'Check native-inbox@example.invalid for your Pana sign-in link.'
    );
    await expect(status).toContainText(
      "Open it in the Pana Mia app to continue. If it's missing, check Spam or Junk."
    );
    await expect(status).not.toContainText('this browser');
    expect(submissions).toHaveLength(1);
    expect(submissions[0].metadata).toEqual({ nativeApp: true });
  });

  for (const viewport of [
    { width: 1440, height: 900, label: 'desktop' },
    { width: 390, height: 844, label: 'mobile' },
    { width: 320, height: 740, label: 'narrow' },
  ]) {
    test(`email-link feedback keeps the submitted inbox through edits, options and pending resends at ${viewport.label} size`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const submissions = await emailRequests(page);
      const callback = '/listings/invite?id=public-business-id';
      await page.goto(
        `/signin?${new URLSearchParams({ callbackUrl: callback })}`
      );
      await revealEmail(page);
      const card = page.locator('#signin-card');
      const status = card.getByRole('status');
      const input = card.getByLabel('Email address', { exact: true });
      const send = card.getByRole('button', {
        name: 'Email me a link',
        exact: true,
      });
      const chosenEmail = `${'chosen'.repeat(10)}@${'inbox'.repeat(8)}.example.invalid`;
      await expect(status).toBeEmpty();
      await input.fill(chosenEmail);
      await send.click();
      await expect(status).toContainText(
        `Check ${chosenEmail} for your Pana sign-in link.`
      );
      await expect(status).toContainText(
        "Open it in this browser to continue. If it's missing, check Spam or Junk."
      );
      await expect(status).toHaveAttribute('aria-live', 'polite');
      await expect(status).toHaveAttribute('aria-atomic', 'true');
      await page.locator('[toast-close]').click();
      await expect(
        page.getByText('Check Your Email', { exact: true })
      ).toHaveCount(0);
      await input.fill('not-submitted@example.invalid');
      await expect(status).toContainText(chosenEmail);
      await expect(status).not.toContainText('not-submitted@example.invalid');
      expect(submissions).toHaveLength(1);
      const back = card.getByRole('button', {
        name: 'Back to other options',
        exact: true,
      });
      if (await back.isVisible()) {
        await back.click();
        await expect(input).not.toBeVisible();
        await expect(status).toBeVisible();
        await revealEmail(page);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({
        path: test
          .info()
          .outputPath(`email-link-feedback-${viewport.label}.png`),
        fullPage: true,
      });

      const held = Promise.withResolvers<void>();
      await page.route('**/api/auth/sign-in/magic-link', async (route) => {
        submissions.push(route.request().postDataJSON());
        await held.promise;
        await route.fulfill({ json: { status: true } });
      });
      try {
        await send.click();
        await expect.poll(() => submissions.length).toBe(2);
        await expect(input).toBeDisabled();
        await expect(
          card.getByRole('button', {
            name: 'Sending your link...',
            exact: true,
          })
        ).toBeDisabled();
        await expect(status).toBeEmpty();
      } finally {
        held.resolve();
      }
      await expect(status).toContainText(
        'Check not-submitted@example.invalid for your Pana sign-in link.'
      );
      await expect(status).not.toContainText(chosenEmail);
      await expect(input).toBeEnabled();
      expect(submissions.map((request) => request.email)).toEqual([
        chosenEmail,
        'not-submitted@example.invalid',
      ]);
      for (const request of submissions) {
        const destination = new URL(String(request.callbackURL));
        expect(`${destination.pathname}${destination.search}`).toBe(callback);
        expect(destination.hash).toBe('');
      }
      expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(
        callback
      );
    });
  }

  test('failed verification never requests email or shows sent feedback', async ({
    page,
  }) => {
    const submissions = await emailRequests(page);
    await page.route('**/api/auth/verify-turnstile', (route) =>
      route.fulfill({
        status: 403,
        json: { error: 'Test verification failed' },
      })
    );
    await page.goto('/signin');
    await revealEmail(page);
    await page
      .getByLabel('Email address', { exact: true })
      .fill('test@example.invalid');
    await page
      .getByRole('button', { name: 'Email me a link', exact: true })
      .click();
    await expect(
      page.getByText('Verification Failed', { exact: true })
    ).toBeVisible();
    await expect(page.locator('#signin-card').getByRole('status')).toBeEmpty();
    await expect(
      page.getByLabel('Email address', { exact: true })
    ).toBeEnabled();
    expect(submissions).toHaveLength(0);
  });

  for (const failure of ['http', 'network']) {
    test(`a ${failure} failure clears old email feedback and only a successful retry names the new inbox`, async ({
      page,
    }) => {
      const submissions = await emailRequests(page);
      await page.goto('/signin?callbackUrl=%2Fm%2Fdiscover');
      await revealEmail(page);
      const input = page.getByLabel('Email address', { exact: true });
      const send = page.getByRole('button', {
        name: 'Email me a link',
        exact: true,
      });
      const status = page.locator('#signin-card').getByRole('status');
      await input.fill('first@example.invalid');
      await send.click();
      await expect(status).toContainText('Check first@example.invalid');
      await page.route('**/api/auth/sign-in/magic-link', async (route) => {
        submissions.push(route.request().postDataJSON());
        if (submissions.length === 2) {
          if (failure === 'network') await route.abort('failed');
          else
            await route.fulfill({
              status: 503,
              json: { message: 'Test mail provider unavailable' },
            });
        } else await route.fulfill({ json: { status: true } });
      });
      await input.fill('retry@example.invalid');
      await send.click();
      await expect(
        page.getByText('Failed to send sign-in link. Please try again.', {
          exact: true,
        })
      ).toBeVisible();
      await expect(status).toBeEmpty();
      await expect(input).toBeEnabled();
      await send.click();
      await expect(status).toContainText('Check retry@example.invalid');
      await expect(status).not.toContainText('first@example.invalid');
      expect(submissions.map((request) => request.email)).toEqual([
        'first@example.invalid',
        'retry@example.invalid',
        'retry@example.invalid',
      ]);
      expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(
        '/m/discover'
      );
    });
  }

  test('OAuth failure preserves the exact callback without claiming an email link was requested', async ({
    page,
  }) => {
    const submissions = await emailRequests(page);
    const oauth: Record<string, unknown>[] = [];
    await page.route('**/api/auth/sign-in/social', async (route) => {
      oauth.push(route.request().postDataJSON());
      await route.fulfill({
        status: 503,
        json: { message: 'Test OAuth provider unavailable' },
      });
    });
    const callback = '/m/schedule/book?mentor=taylor&mode=video';
    await page.goto(
      `/signin?${new URLSearchParams({ callbackUrl: callback })}`
    );
    const google = page.getByRole('button', {
      name: 'Continue with Google',
      exact: true,
    });
    await google.click();
    await expect(
      page.getByText('Google sign-in could not start. Please try again.', {
        exact: true,
      })
    ).toBeVisible();
    await expect(google).toBeEnabled();
    await expect(page.locator('#signin-card').getByRole('status')).toBeEmpty();
    expect(submissions).toHaveLength(0);
    expect(oauth).toHaveLength(1);
    expect(oauth[0].provider).toBe('google');
    const destination = new URL(String(oauth[0].callbackURL));
    expect(`${destination.pathname}${destination.search}`).toBe(callback);
    expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(callback);
  });
});
