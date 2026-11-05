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
    expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(
      '/m/discover'
    );
  });

  test('native email-only sign-in does not advertise Google or add a second masthead', async ({
    page,
  }) => {
    await nativeBridge(page, { platform: 'ios' });
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
  });
});
