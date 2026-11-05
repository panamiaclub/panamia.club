import { expect, test, type Page } from '@playwright/test';
import { calls, nativeBridge } from './fixtures/native-bridge';
import { installNativeApiFixtures } from './fixtures/native-app-api';

async function ios(page: Page) {
  await nativeBridge(page, { platform: 'ios', googlePlugin: false });
  return installNativeApiFixtures(page);
}

test.use({
  launchOptions: async ({ browserName }, use) => {
    await use(
      browserName === 'chromium'
        ? { args: ['--enable-unsafe-swiftshader'] }
        : {}
    );
  },
});

test.describe('iOS results sheet', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('iOS sheet expansion and header dragging keep the map fixed', async ({
    page,
  }) => {
    await ios(page);
    await page.goto('/d');
    const results = page.locator('[data-map-results="Directory"]');
    const canvas = results.locator('.maplibregl-canvas');
    await expect(canvas).toBeVisible();
    const before = await canvas.boundingBox();
    const sheet = results.getByRole('region', { name: 'Directory results' });
    const handle = sheet.getByRole('button', { name: 'Resize results' });
    await expect
      .poll(async () => (await handle.boundingBox())!.height)
      .toBeGreaterThanOrEqual(44);
    const peekHeight = (await sheet.boundingBox())!.height;
    const attribution = results.locator('.maplibregl-ctrl-attrib');
    const attributionBox = (await attribution.boundingBox())!;
    expect(attributionBox.y + attributionBox.height).toBeLessThanOrEqual(
      (await sheet.boundingBox())!.y
    );

    await sheet.getByRole('button', { name: 'List', exact: true }).click();
    await expect
      .poll(async () => (await sheet.boundingBox())!.height)
      .toBeGreaterThan(peekHeight + 100);
    expect(await canvas.boundingBox()).toEqual(before);
    await handle.press('Home');
    await expect
      .poll(async () => (await sheet.boundingBox())!.height)
      .toBe(peekHeight);

    const title = sheet.getByRole('heading', { name: '3 listings' });
    const box = (await title.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 64, { steps: 8 });
    await page.mouse.up();
    await expect(handle).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(async () => (await sheet.boundingBox())!.height)
      .toBeGreaterThan(peekHeight + 100);
    expect(await canvas.boundingBox()).toEqual(before);
  });
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 820, height: 1180 },
]) {
  test(`iOS keeps a centered header and shared app screens usable at ${viewport.width}x${viewport.height}`, async ({
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
    const header = page.locator('[data-native-app] > header');
    const brand = header.getByRole('img', { name: 'Pana Mia Club' });
    const messages = header.getByRole('link', {
      name: 'Messages',
      exact: true,
    });
    const notifications = header.getByRole('button', {
      name: /^Notifications/,
    });
    const account = header.getByRole('button', { name: /Native Viewer/ });
    await expect(messages).toHaveAttribute('href', '/messages');
    await expect(header.getByRole('button', { name: /^Report a/ })).toHaveCount(
      0
    );
    const boxes = await Promise.all(
      [header, brand, messages, notifications, account].map((node) =>
        node.boundingBox()
      )
    );
    const [frame, logo, inbox, bell, avatar] = boxes;
    expect(boxes.every(Boolean)).toBe(true);
    expect(
      Math.abs(logo!.x + logo!.width / 2 - frame!.x - frame!.width / 2)
    ).toBeLessThanOrEqual(1);
    expect(inbox!.x + inbox!.width).toBeLessThanOrEqual(logo!.x);
    expect(bell!.x).toBeGreaterThanOrEqual(logo!.x + logo!.width);
    expect(avatar!.x).toBeGreaterThanOrEqual(bell!.x + bell!.width);
    expect(frame!.height).toBeLessThanOrEqual(60);
    for (const control of [inbox, bell, avatar]) {
      expect(control!.width).toBeGreaterThanOrEqual(44);
      expect(control!.height).toBeGreaterThanOrEqual(44);
    }
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

for (const platform of ['android', 'ios'] as const) {
  for (const signedIn of [false, true]) {
    test(`${platform} account reports stay reachable for ${signedIn ? 'members' : 'guests'} without crowding the header`, async ({
      page,
    }) => {
      await nativeBridge(page, {
        platform,
        googlePlugin: platform === 'android',
      });
      const fixtures = await installNativeApiFixtures(page);
      fixtures.state.signedIn = signedIn;
      await page.route('**/api/notifications/unread-count', (route) =>
        route.fulfill({ json: { success: true, data: { count: 9 } } })
      );
      await page.setViewportSize({ width: 393, height: 852 });
      await page.goto('/d');
      const header = page.locator('[data-native-app] > header');
      const account = header.getByRole('button', {
        name: signedIn ? /Native Viewer/ : 'Sign in or sign up',
        includeHidden: true,
      });
      if (signedIn) {
        await expect(
          header.getByRole('button', { name: 'Notifications, 9 unread' })
        ).toBeVisible();
        await expect(
          header.getByRole('link', { name: 'Messages', exact: true })
        ).toHaveAttribute('href', '/messages');
      } else {
        await expect(
          header.getByRole('button', { name: /^Notifications/ })
        ).toHaveCount(0);
      }
      const preview = test.info().outputPath('native-header-ui-preview.png');
      await header.screenshot({ path: preview });
      await test.info().attach('native-header-ui-preview', {
        path: preview,
        contentType: 'image/png',
      });
      await account.click();
      const menu = page.getByRole('menu');
      const ending = [
        'Report a bug',
        'Report a safety concern',
        'About Pana',
        ...(signedIn ? ['Sign Out'] : []),
      ];
      await expect(
        menu
          .getByRole('menuitem')
          .filter({ hasText: /Report a|About Pana|Sign Out/ })
      ).toHaveText(ending);
      await menu
        .getByRole('menuitem', { name: 'Report a bug', exact: true })
        .click();
      const bug = page.getByRole('dialog', {
        name: 'Report a bug',
        exact: true,
      });
      await expect(bug).toBeVisible();
      await expect(account).toHaveAttribute('aria-expanded', 'false');
      await expect(bug.locator('input[type=file]')).toHaveCount(1);
      await bug
        .getByLabel('What happened?')
        .fill('Keep this account-menu draft.');
      await page.keyboard.press('Escape');
      await expect(bug).toHaveCount(0);
      await expect(account).toBeFocused();
      await account.click();
      await page
        .getByRole('menuitem', { name: 'Report a bug', exact: true })
        .click();
      await expect(bug.getByLabel('What happened?')).toHaveValue(
        'Keep this account-menu draft.'
      );
      await page.keyboard.press('Escape');
      await expect(account).toBeFocused();
      await account.click();
      await page
        .getByRole('menuitem', { name: 'Report a safety concern', exact: true })
        .click();
      const safety = page.getByRole('dialog', {
        name: 'Report a safety concern',
        exact: true,
      });
      await expect(safety).toBeVisible();
      await expect(account).toHaveAttribute('aria-expanded', 'false');
      await expect(safety.locator('input[type=file]')).toHaveCount(0);
      await expect(
        safety.getByText(/do not copy, download, or attach/)
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(safety).toHaveCount(0);
      await expect(account).toBeFocused();
    });
  }
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

for (const path of ['/donate', '/support-pana']) {
  test(`iOS does not expose unapproved in-app fundraising at ${path}`, async ({
    page,
  }) => {
    await ios(page);
    await page.goto(path);
    await expect(
      page.getByText('Donations are not available inside the iOS app yet.')
    ).toBeVisible();
    await expect(page.locator('form')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Back to Directory' })
    ).toHaveAttribute('href', '/d');
  });
}

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
