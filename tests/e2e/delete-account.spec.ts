import { expect, test, type Page } from '@playwright/test';
import { installNativeApiFixtures } from './fixtures/native-app-api';

async function installDeleteAccountFixtures(page: Page) {
  const { state: auth } = await installNativeApiFixtures(page);
  const state = {
    preflight: {
      canDelete: true,
      blockers: [] as string[],
      summary: {
        articles: { total: 2, archived: 0, preArchive: 2 },
        socialPosts: { total: 3 },
        events: { hosted: 0, organized: 0, attended: 0, archived: 0 },
        mentorSessions: { completed: 0, pending: 0 },
        mediaFiles: 1,
        thirdParty: { stripe: true, ghl: false, google: true, apple: false },
      },
    },
    preflightReady: Promise.resolve(),
    preflightError: null as string | null,
    deleteError: null as string | null,
    deleteRequests: [] as unknown[],
  };
  await page.route('**/api/account/delete-preflight', async (route) => {
    await state.preflightReady;
    await route.fulfill(
      state.preflightError
        ? { status: 503, json: { error: state.preflightError } }
        : { json: state.preflight }
    );
  });
  await page.route('**/api/account/delete', (route) => {
    state.deleteRequests.push(route.request().postDataJSON());
    return route.fulfill(
      state.deleteError
        ? { status: 409, json: { error: state.deleteError } }
        : { json: { success: true } }
    );
  });
  await page.route('**/api/auth/sign-out', (route) => {
    auth.signedIn = false;
    return route.fulfill({ json: { success: true } });
  });
  return state;
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`matches the account theme at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await installDeleteAccountFixtures(page);
    await page.goto('/form/delete-account');

    const flow = page.locator('main.surface-cream');
    await expect(
      flow.getByRole('heading', { name: 'Delete Your Account' })
    ).toBeVisible();
    await expect(flow).toHaveCSS('background-color', 'rgb(255, 247, 236)');
    await expect(flow).toHaveCSS('color', 'rgb(17, 13, 13)');
    await expect(flow.locator('.profile-card')).toHaveCSS(
      'border-radius',
      '18px'
    );
    await expect(flow.getByRole('button', { name: 'Continue' })).toHaveCSS(
      'background-color',
      'rgb(48, 62, 140)'
    );
    await expect(flow.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      'Step 1 of 4'
    );
    await expect(flow.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '25'
    );
    await expect(flow.locator('img')).toHaveCount(0);
    await expect(flow.getByText('Social Posts', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('delete-account.png'),
      fullPage: true,
    });

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(flow).toHaveCSS('color', 'rgb(17, 13, 13)');
    await expect(flow.locator('.profile-card')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)'
    );
  });
}

test('keeps continuation disabled while account data loads or fails', async ({
  page,
}) => {
  const state = await installDeleteAccountFixtures(page);
  const preflightGate = Promise.withResolvers<void>();
  state.preflightReady = preflightGate.promise;
  state.preflightError = 'Could not load your account data.';
  await page.goto('/form/delete-account');
  await expect(
    page.getByRole('status').filter({ hasText: 'Loading your account data...' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  preflightGate.resolve();
  await expect(page.getByRole('alert')).toHaveText(state.preflightError);
  await expect(page.getByRole('alert')).toHaveCSS('color', 'rgb(184, 66, 55)');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  expect(state.deleteRequests).toEqual([]);
});

test('preserves account deletion blockers', async ({ page }) => {
  const state = await installDeleteAccountFixtures(page);
  state.preflight.canDelete = false;
  state.preflight.blockers.push('Transfer ownership of your group first.');
  await page.goto('/form/delete-account');
  await expect(page.getByText(state.preflight.blockers[0])).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  expect(state.deleteRequests).toEqual([]);
});

test('retains the four-step confirmation gates, errors, and completion', async ({
  page,
}) => {
  const state = await installDeleteAccountFixtures(page);
  state.deleteError = 'Deletion failed. Please try again.';
  await page.goto('/form/delete-account');
  const next = page.getByRole('button', { name: 'Continue' });
  await next.click();
  await expect(
    page.getByRole('heading', { name: 'Third-Party Services' })
  ).toBeVisible();
  await expect(
    page.getByText('Stripe (payment/subscriptions)', { exact: true })
  ).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    'Step 2 of 4'
  );
  await next.click();
  await expect(next).toBeDisabled();
  await page
    .getByLabel('Email:', { exact: false })
    .fill('wrong@example.invalid');
  await expect(next).toBeDisabled();
  await page
    .getByLabel('Email:', { exact: false })
    .fill('NATIVE@example.invalid');
  await next.click();
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '100'
  );
  const remove = page.getByRole('button', { name: 'Delete My Account' });
  await expect(remove).toBeDisabled();
  await page.getByRole('checkbox').check();
  await expect(remove).toHaveCSS('background-color', 'rgb(184, 66, 55)');
  expect(state.deleteRequests).toEqual([]);
  await remove.click();
  await expect(page.getByRole('alert')).toHaveText(state.deleteError);
  await expect(remove).toBeEnabled();
  state.deleteError = null;
  await remove.click();
  await expect(
    page.getByRole('heading', { name: 'Your account has been deleted.' })
  ).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Go to Homepage' })
  ).toHaveAttribute('href', '/');
  expect(state.deleteRequests).toEqual([
    { attributionChoice: 'anonymize', confirmEmail: 'NATIVE@example.invalid' },
    { attributionChoice: 'anonymize', confirmEmail: 'NATIVE@example.invalid' },
  ]);
});

test('preserves archived attribution choices and the five-step path on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await installDeleteAccountFixtures(page);
  state.preflight.summary.articles.archived = 1;
  state.preflight.summary.articles.preArchive = 1;
  await page.goto('/form/delete-account');
  const next = page.getByRole('button', { name: 'Continue' });
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    'Step 1 of 5'
  );
  await next.click();
  const anonymize = page.getByRole('radio', {
    name: 'Anonymize (Former Member)',
  });
  await anonymize.check();
  await expect(anonymize).toBeChecked();
  await expect(anonymize).toHaveCSS('color', 'rgb(48, 62, 140)');
  await next.click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(anonymize).toBeChecked();
  await next.click();
  await next.click();
  await page
    .getByLabel('Email:', { exact: false })
    .fill('native@example.invalid');
  await next.click();
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    'Step 5 of 5'
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  expect(state.deleteRequests).toEqual([]);
});
