import { expect, test, type Page } from '@playwright/test';
import { installNativeApiFixtures } from './fixtures/native-app-api';
import { freshAccountSession } from './fixtures/fresh-account';

type SetupSurface = 'prompt' | 'welcome';

async function openForm(
  page: Page,
  surface: SetupSurface | 'settings' = 'prompt'
) {
  const baseURL = test.info().project.use.baseURL;
  if (surface === 'welcome' && !baseURL) {
    throw new Error('Fresh welcome tests require a local baseURL');
  }
  const freshSession =
    surface === 'welcome' && baseURL
      ? await freshAccountSession(page, baseURL)
      : null;
  await installNativeApiFixtures(page);
  const user = {
    _id: freshSession?.user.id ?? 'native-test-user',
    email: freshSession?.user.email ?? 'native@example.invalid',
    name: surface === 'welcome' ? null : 'Native Viewer',
    screenname: surface === 'settings' ? 'native-viewer' : null,
    accountType: 'personal',
    createdAt: freshSession
      ? freshSession.user.createdAt.toISOString()
      : '2020-01-01T00:00:00.000Z',
  };
  if (freshSession) {
    await page.route('**/api/auth/get-session', (route) =>
      route.fulfill({ json: freshSession })
    );
    await page.route('**/api/profile/switch', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: user.screenname
            ? [
                {
                  id: 'personal',
                  name: user.name,
                  screenname: user.screenname,
                  isPersonal: true,
                  role: 'owner',
                  active: true,
                },
              ]
            : [],
          activeProfileId: user.screenname ? 'personal' : null,
          pendingInvitations: [],
        },
      })
    );
  }
  await page.route('**/api/user/me', (route) =>
    route.fulfill({ json: { success: true, data: user } })
  );
  await page.route('**/api/getSessionUser', (route) =>
    route.fulfill({ json: { success: true, data: user } })
  );
  await page.route('**/api/getProfile', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: user.screenname
          ? {
              _id: 'personal',
              name: user.name,
              screenname: user.screenname,
              defaultCcLicense: 'cc-by-4',
            }
          : null,
      },
    })
  );
  await page.route('**/api/user/screenname/check?*', (route) => {
    const name = new URL(route.request().url()).searchParams.get('name');
    return route.fulfill({
      json:
        name === 'ana-taken'
          ? { available: false, error: 'This screenname is already taken' }
          : { available: true },
    });
  });
  const claims: unknown[] = [];
  await page.route('**/api/user/screenname/set', (route) => {
    const body: { screenname: string; name: string } = route
      .request()
      .postDataJSON();
    claims.push(body);
    user.screenname = body.screenname;
    user.name = body.name;
    return route.fulfill({
      json: { success: true, data: { screenname: body.screenname } },
    });
  });

  await page.goto('/account/user/edit', { waitUntil: 'domcontentloaded' });
  if (surface === 'welcome') {
    await expect(page).toHaveURL(/\/welcome\?next=/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const input = page.locator('#welcome-screenname');
    const name = page.locator('#welcome-name');
    await expect(input).toHaveValue('');
    await expect(name).toHaveValue('');
    const form = page.locator('form').filter({ has: input });
    const submit = form.getByRole('button', { name: 'Continue', exact: true });
    await expect(submit).toBeDisabled();
    await name.fill('Ana Martinez');
    return { input, submit, alerts: form.getByRole('alert'), claims };
  }
  if (surface === 'prompt') {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('#prompt-name').fill('Ana Martinez');
    return {
      input: dialog.locator('#prompt-screenname'),
      submit: dialog.getByRole('button', { name: 'Continue', exact: true }),
      alerts: dialog.getByRole('alert'),
      claims,
    };
  }
  await expect(page.locator('#screenname')).toHaveValue('native-viewer');
  return {
    input: page.locator('#screenname'),
    submit: page.getByRole('button', { name: 'Save changes', exact: true }),
    alerts: page.locator('#screenname-status'),
    claims,
  };
}

async function expectSaved(
  page: Page,
  surface: SetupSurface,
  screenname: string
) {
  if (surface === 'welcome') {
    await expect(page).toHaveURL(/\/account\/user\/edit$/);
    await expect(page.locator('#screenname')).toHaveValue(screenname);
    await expect(page.locator('#name')).toHaveValue('Ana Martinez');
  } else {
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
}

async function delayCheck(page: Page, handle: string, available: boolean) {
  await page.addInitScript(
    ({ handle, available }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          window.location.href
        );
        if (
          url.pathname !== '/api/user/screenname/check' ||
          url.searchParams.get('name') !== handle
        ) {
          return originalFetch(input, init);
        }

        document.documentElement.dataset.delayedScreenname = handle;
        // Deliberately ignore AbortSignal: even a response already being
        // consumed must not overwrite the result for a newer input.
        return new Promise<Response>((resolve) => {
          window.addEventListener(
            'release-screenname-check',
            () =>
              resolve(
                Response.json({
                  available,
                  ...(available
                    ? {}
                    : { error: 'This screenname is already taken' }),
                })
              ),
            { once: true }
          );
        });
      };
    },
    { handle, available }
  );
}

async function releaseCheck(page: Page) {
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('release-screenname-check'));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}

for (const surface of ['prompt', 'welcome'] as const) {
  test.describe(`${surface} handle setup`, () => {
    test('a late taken result cannot block a different available handle during setup', async ({
      page,
    }) => {
      await delayCheck(page, 'ana-taken', false);
      const { input, submit, alerts, claims } = await openForm(page, surface);
      await input.fill('ana-taken');
      await expect(page.locator('html')).toHaveAttribute(
        'data-delayed-screenname',
        'ana-taken'
      );
      await input.fill('ana-free');
      await expect(submit).toBeEnabled();

      await releaseCheck(page);
      expect(await submit.isEnabled()).toBe(true);
      await expect(alerts).toHaveCount(0);
      await submit.click();
      await expectSaved(page, surface, 'ana-free');
      expect(claims).toEqual([
        { screenname: 'ana-free', name: 'Ana Martinez' },
      ]);
    });

    test('a late available result cannot approve a taken handle during setup', async ({
      page,
    }) => {
      await delayCheck(page, 'ana-free', true);
      const { input, submit, alerts, claims } = await openForm(page, surface);
      await input.fill('ana-free');
      await expect(page.locator('html')).toHaveAttribute(
        'data-delayed-screenname',
        'ana-free'
      );
      await input.fill('ana-taken');
      await expect(alerts).toHaveText('This screenname is already taken');

      await releaseCheck(page);
      expect(await submit.isDisabled()).toBe(true);
      expect(claims).toEqual([]);
    });

    test('editing an available handle invalidates it before the next debounced request', async ({
      page,
    }) => {
      const { input, submit, claims } = await openForm(page, surface);
      await input.fill('ana-free');
      await expect(submit).toBeEnabled();
      await page.clock.install();
      await page.clock.pauseAt(new Date());

      await input.fill('ana-taken');
      expect(await submit.isDisabled()).toBe(true);
      await input.press('Enter');
      expect(claims).toEqual([]);
    });

    test('an availability service failure is not presented as a valid handle', async ({
      page,
    }) => {
      const { input, submit, alerts } = await openForm(page, surface);
      await page.route('**/api/user/screenname/check?*', (route) =>
        route.fulfill({ status: 503, json: { available: true } })
      );
      await input.fill('ana-free');
      await expect(alerts).toHaveText('Could not check that name. Try again.');
      await expect(submit).toBeDisabled();
    });

    test('a handle taken during submission can be replaced without restarting setup', async ({
      page,
    }) => {
      const { input, submit, alerts } = await openForm(page, surface);
      let attempts = 0;
      await page.route('**/api/user/screenname/set', (route) => {
        attempts += 1;
        if (attempts === 1) {
          return route.fulfill({
            status: 400,
            json: {
              success: false,
              error: 'This screenname is already taken',
            },
          });
        }
        return route.fallback();
      });
      await input.fill('ana-free');
      await expect(submit).toBeEnabled();
      await submit.click();
      await expect(alerts).toHaveText('This screenname is already taken');
      await expect(submit).toBeDisabled();

      await input.fill('ana-another');
      await expect(submit).toBeEnabled();
      await expect(alerts).toHaveCount(0);
      await submit.click();
      await expectSaved(page, surface, 'ana-another');
      expect(attempts).toBe(2);
    });

    test('availability and submission use the same trimmed handle', async ({
      page,
    }) => {
      const { input, submit, claims } = await openForm(page, surface);
      const checkedNames: (string | null)[] = [];
      await page.route('**/api/user/screenname/check?*', (route) => {
        checkedNames.push(
          new URL(route.request().url()).searchParams.get('name')
        );
        return route.fulfill({ json: { available: true } });
      });
      await input.fill('  ana-free  ');
      await expect(submit).toBeEnabled();
      expect(checkedNames).toEqual(['ana-free']);
      await submit.click();
      await expectSaved(page, surface, 'ana-free');
      expect(claims).toEqual([
        { screenname: 'ana-free', name: 'Ana Martinez' },
      ]);
    });
  });
}

test('account settings ignore a late taken result after the handle changes', async ({
  page,
}) => {
  await delayCheck(page, 'ana-taken', false);
  const { input } = await openForm(page, 'settings');
  await input.fill('ana-taken');
  await expect(page.locator('html')).toHaveAttribute(
    'data-delayed-screenname',
    'ana-taken'
  );
  await input.fill('ana-free');
  await expect(page.locator('#screenname-status')).toHaveText(
    '@ana-free is free.'
  );

  await releaseCheck(page);
  expect(await page.locator('#screenname-status').textContent()).toBe(
    '@ana-free is free.'
  );
});
