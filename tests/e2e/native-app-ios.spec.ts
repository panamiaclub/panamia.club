import { expect, test, type Page } from '@playwright/test';
import { calls, nativeBridge } from './fixtures/native-bridge';
import { installNativeApiFixtures } from './fixtures/native-app-api';

async function ios(page: Page) {
  await nativeBridge(page, { platform: 'ios', googlePlugin: false });
  return installNativeApiFixtures(page);
}

for (const viewport of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 820, height: 1180 },
]) {
  test(`iOS keeps the shared app screens usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await ios(page);
    await page.setViewportSize(viewport);
    await page.goto('/d');
    await expect(page.locator('html')).toHaveAttribute(
      'data-native-platform',
      'ios'
    );
    const nav = page.getByRole('navigation', { name: 'App navigation' });
    await expect(nav.getByRole('link')).toHaveText([
      'Directory',
      'Social',
      'Community',
      'Profile',
    ]);
    const bounds = await nav.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.round(bounds!.y + bounds!.height)).toBe(viewport.height);
    const search = page.getByRole('searchbox', { name: 'Search directory' });
    expect(
      await search.evaluate((input) =>
        parseFloat(getComputedStyle(input).fontSize)
      )
    ).toBeGreaterThanOrEqual(16);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(viewport.width);
    await nav.getByRole('link', { name: 'Community', exact: true }).click();
    await expect(
      page.getByRole('tab', { name: 'Yours', exact: true })
    ).toBeVisible();
    await nav.getByRole('link', { name: 'Social', exact: true }).click();
    await expect(
      page.getByRole('tab', { name: 'My Panas', exact: true })
    ).toBeVisible();
    await nav.getByRole('link', { name: 'Directory', exact: true }).click();
    await expect(search).toBeVisible();
  });
}

test('the iOS frame follows the keyboard and restores tabs after dismissal', async ({
  page,
}) => {
  await ios(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        height: 844,
        offsetTop: 0,
        scale: 1,
      }),
    });
  });
  await page.goto('/d');
  const nav = page.getByRole('navigation', { name: 'App navigation' });
  await expect(nav).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search directory' }).focus();
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 440, offsetTop: 20 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(nav).toBeHidden();
  await expect
    .poll(async () => {
      const frame = await page.locator('[data-native-app]').boundingBox();
      return { top: Math.round(frame!.y), height: Math.round(frame!.height) };
    })
    .toEqual({ top: 20, height: 440 });
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 844, offsetTop: 0 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(nav).toBeVisible();
});

test('story captions stay inside the visible iOS viewport above the keyboard', async ({
  page,
}) => {
  await ios(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        height: 844,
        offsetTop: 0,
        scale: 1,
      }),
    });
  });
  await page.goto('/s');
  await page.getByRole('button', { name: 'Post a story' }).click();
  const caption = page.getByRole('textbox', { name: 'Caption' });
  await caption.focus();
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 390, offsetTop: 20 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  const dialog = page.getByRole('dialog', {
    name: 'Post a story',
    exact: true,
  });
  await expect
    .poll(async () => {
      const bounds = await dialog.boundingBox();
      return Boolean(
        bounds && bounds.y >= 20 && bounds.y + bounds.height <= 410
      );
    })
    .toBe(true);
  expect(
    await caption.evaluate((input) =>
      parseFloat(getComputedStyle(input).fontSize)
    )
  ).toBeGreaterThanOrEqual(16);
});

test('iOS keeps email sign-in and never registers Android back or unsupported Google', async ({
  page,
}) => {
  const fixtures = await ios(page);
  fixtures.state.signedIn = false;
  await page.goto('/signin');
  await expect(page.getByPlaceholder('your@email.com')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continue with Google' })
  ).toHaveCount(0);
  await expect
    .poll(async () =>
      (await calls(page)).some((call) => call.method === 'getLaunchUrl')
    )
    .toBe(true);
  expect(
    (await calls(page)).some((call) => call.args?.eventName === 'backButton')
  ).toBe(false);
});

test('iOS does not expose unapproved in-app fundraising', async ({ page }) => {
  await ios(page);
  await page.goto('/donate');
  await expect(
    page.getByText('Donations are not available inside the iOS app yet.')
  ).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Back to Directory' })
  ).toHaveAttribute('href', '/d');
});

test('iOS privacy settings expose the existing account-deletion flow', async ({
  page,
}) => {
  await ios(page);
  await page.route('**/api/consent/list', (route) =>
    route.fulfill({ json: { receipts: [] } })
  );
  await page.route('**/api/account/crm', (route) =>
    route.fulfill({ status: 404, json: { error: 'No linked contact' } })
  );
  await page.goto('/account/privacy');
  await expect(
    page.getByRole('link', { name: 'Delete account', exact: true })
  ).toHaveAttribute('href', '/form/delete-account');
  await page.getByRole('link', { name: 'Delete account', exact: true }).click();
  await expect(page).toHaveURL(/\/form\/delete-account$/);
  await expect(
    page
      .getByRole('navigation', { name: 'App navigation' })
      .getByRole('link', { name: 'Profile' })
  ).toHaveAttribute('aria-current', 'page');
});
