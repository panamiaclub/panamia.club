import { expect, test, type Page } from '@playwright/test';
import { installNativeApiFixtures } from './fixtures/native-app-api';

async function openForm(page: Page, prompt = true) {
  await installNativeApiFixtures(page);
  const user = {
    _id: 'native-test-user',
    email: 'native@example.invalid',
    name: 'Native Viewer',
    screenname: prompt ? null : 'native-viewer',
    accountType: 'personal',
    createdAt: '2020-01-01T00:00:00.000Z',
  };
  await page.route('**/api/user/me', (route) =>
    route.fulfill({ json: { success: true, data: user } })
  );
  await page.route('**/api/getSessionUser', (route) =>
    route.fulfill({ json: { success: true, data: user } })
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
    const body = route.request().postDataJSON();
    claims.push(body);
    return route.fulfill({
      json: { success: true, data: { screenname: body.screenname } },
    });
  });

  await page.goto('/account/user/edit', { waitUntil: 'domcontentloaded' });
  if (prompt) {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('#prompt-name').fill('Ana Martinez');
    return {
      input: dialog.locator('#prompt-screenname'),
      submit: dialog.getByRole('button', { name: 'Continue', exact: true }),
      claims,
    };
  }
  await expect(page.locator('#screenname')).toHaveValue('native-viewer');
  return {
    input: page.locator('#screenname'),
    submit: page.getByRole('button', { name: 'Save changes', exact: true }),
    claims,
  };
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

test('a late taken result cannot block a different available handle during setup', async ({
  page,
}) => {
  await delayCheck(page, 'ana-taken', false);
  const { input, submit, claims } = await openForm(page);
  await input.fill('ana-taken');
  await expect(page.locator('html')).toHaveAttribute(
    'data-delayed-screenname',
    'ana-taken'
  );
  await input.fill('ana-free');
  await expect(submit).toBeEnabled();

  await releaseCheck(page);
  expect(await submit.isEnabled()).toBe(true);
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  await submit.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(claims).toEqual([{ screenname: 'ana-free', name: 'Ana Martinez' }]);
});

test('a late available result cannot approve a taken handle during setup', async ({
  page,
}) => {
  await delayCheck(page, 'ana-free', true);
  const { input, submit, claims } = await openForm(page);
  await input.fill('ana-free');
  await expect(page.locator('html')).toHaveAttribute(
    'data-delayed-screenname',
    'ana-free'
  );
  await input.fill('ana-taken');
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
    'This screenname is already taken'
  );

  await releaseCheck(page);
  expect(await submit.isDisabled()).toBe(true);
  expect(claims).toEqual([]);
});

test('editing an available handle invalidates it before the next debounced request', async ({
  page,
}) => {
  const { input, submit, claims } = await openForm(page);
  await input.fill('ana-free');
  await expect(submit).toBeEnabled();
  await page.clock.install();
  await page.clock.pauseAt(new Date());

  await input.fill('ana-taken');
  expect(await submit.isDisabled()).toBe(true);
  await input.press('Enter');
  expect(claims).toEqual([]);
});

test('account settings ignore a late taken result after the handle changes', async ({
  page,
}) => {
  await delayCheck(page, 'ana-taken', false);
  const { input } = await openForm(page, false);
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

test('an availability service failure is not presented as a valid handle', async ({
  page,
}) => {
  const { input, submit } = await openForm(page);
  await page.route('**/api/user/screenname/check?*', (route) =>
    route.fulfill({ status: 503, json: { available: true } })
  );
  await input.fill('ana-free');
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
    'Could not check that name. Try again.'
  );
  await expect(submit).toBeDisabled();
});

test('a handle taken during submission can be replaced without restarting setup', async ({
  page,
}) => {
  const { input, submit } = await openForm(page);
  let attempts = 0;
  await page.route('**/api/user/screenname/set', (route) => {
    attempts += 1;
    return route.fulfill(
      attempts === 1
        ? {
            status: 400,
            json: {
              success: false,
              error: 'This screenname is already taken',
            },
          }
        : {
            json: {
              success: true,
              data: { screenname: route.request().postDataJSON().screenname },
            },
          }
    );
  });
  await input.fill('ana-free');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
    'This screenname is already taken'
  );
  await expect(submit).toBeDisabled();

  await input.fill('ana-another');
  await expect(submit).toBeEnabled();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  await submit.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(attempts).toBe(2);
});

test('availability and submission use the same trimmed handle', async ({
  page,
}) => {
  const { input, submit, claims } = await openForm(page);
  const checkedNames: (string | null)[] = [];
  await page.route('**/api/user/screenname/check?*', (route) => {
    checkedNames.push(new URL(route.request().url()).searchParams.get('name'));
    return route.fulfill({ json: { available: true } });
  });
  await input.fill('  ana-free  ');
  await expect(submit).toBeEnabled();
  expect(checkedNames).toEqual(['ana-free']);
  await submit.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(claims).toEqual([{ screenname: 'ana-free', name: 'Ana Martinez' }]);
});
