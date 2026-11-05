import { expect, test, type Page } from '@playwright/test';
import { calls, nativeBridge } from './fixtures/native-bridge';
import { installNativeApiFixtures } from './fixtures/native-app-api';
import type { SearchResultsInterface } from '@/lib/query/directory';

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

    await handle.click();
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

for (const platform of ['android', 'ios'] as const) {
  test(`${platform} keeps native header controls route-aware across Messages and Account`, async ({
    page,
  }) => {
    await nativeBridge(page, {
      platform,
      googlePlugin: platform === 'android',
    });
    await installNativeApiFixtures(page);
    await page.route('**/api/social/messages/conversations', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            conversations: [],
            viewerActorId: 'actor-personal',
            localDomain: 'example.invalid',
          },
        },
      })
    );
    await page.route('**/api/social/messages/groups', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            groups: [],
            viewerActorId: 'actor-personal',
            localDomain: 'example.invalid',
          },
        },
      })
    );
    await page.route('**/api/social/dm-requests', (route) =>
      route.fulfill({ json: { success: true, data: { requests: [] } } })
    );
    await page.route('**/api/getSessionUser', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            _id: 'native-test-user',
            name: 'Native Viewer',
            email: 'native@example.invalid',
            screenname: 'native-viewer',
          },
        },
      })
    );
    await page.route('**/api/getProfile', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            _id: 'personal',
            name: 'Native Viewer',
            screenname: 'native-viewer',
            defaultCcLicense: 'cc-by-4',
            images: {},
          },
        },
      })
    );
    await page.route('**/api/crm/contact', (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );
    await page.route('**/api/account/crm', (route) =>
      route.fulfill({ json: { contact: null } })
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/d');
    const header = page.locator('[data-native-app] > header');
    const messages = header.getByRole('link', {
      name: 'Messages',
      exact: true,
    });
    const back = header.getByRole('button', { name: 'Back', exact: true });
    await expect(messages).toBeVisible();
    await expect(back).toHaveCount(0);
    await messages.click();
    await expect(page).toHaveURL(/\/messages$/);
    await expect(
      page.getByRole('group', { name: 'Message folders' })
    ).toBeVisible();
    await expect(messages).toHaveCount(0);
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/d$/);
    await expect(messages).toBeVisible();
    await expect(back).toHaveCount(0);
    await header.getByRole('button', { name: /Native Viewer/ }).click();
    await page.locator('[role="menuitem"][href="/account/user/edit"]').click();
    await expect(page).toHaveURL(/\/account\/user\/edit$/);
    await expect(
      page.getByRole('heading', { name: 'Native Viewer', exact: true })
    ).toBeVisible();
    await expect(back).toHaveCount(0);
    await expect(messages).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'App navigation' })
        .getByRole('link', { name: 'Profile', exact: true })
    ).toHaveAttribute('aria-current', 'page');
    await page.goto('/account/privacy');
    await expect(
      page.getByRole('link', { name: 'Delete account', exact: true })
    ).toHaveAttribute('href', '/form/delete-account');
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/account\/user\/edit$/);
    await expect(back).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Native Viewer', exact: true })
    ).toBeVisible();
  });
}

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
    expect(frame!.height).toBe(44);
    for (const control of [inbox, bell, avatar]) {
      expect(control!.width).toBeGreaterThanOrEqual(44);
      expect(control!.height).toBeGreaterThanOrEqual(44);
    }
    const bounds = await nav.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.round(bounds!.y + bounds!.height)).toBe(viewport.height - 8);
    expect(bounds!.height).toBe(58);
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
      page.getByRole('region', { name: 'Community feed', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('tablist', { name: 'Feed filters' })
    ).toHaveCount(0);
    await nav.getByRole('link', { name: 'Directory', exact: true }).click();
    await expect(search).toBeVisible();
  });
}

test.describe('compact native directory', () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    test(`compact map keeps two complete profiles and the full list at ${viewport.width}x${viewport.height}`, async ({
      page,
    }, testInfo) => {
      await nativeBridge(page, { platform: 'ios', googlePlugin: false });
      await page.setViewportSize(viewport);
      const points = [
        [-80.25, 25.84],
        [-80.15, 25.84],
        [-80.25, 25.79],
        [-80.15, 25.79],
        [-80.25, 25.74],
        [-80.15, 25.74],
      ];
      const businesses: SearchResultsInterface[] = Array.from(
        { length: 343 },
        (_, index) => ({
          _id: `compact-${index}`,
          id: `compact-${index}`,
          name: `Compact business ${index}`,
          screenname: `compact-${index}`,
          score: 1,
          score_details: {},
          details: 'Meet your neighbors.',
          five_words: 'Made for the neighborhood.',
          geo: index < points.length ? { coordinates: points[index] } : null,
          ...(index === 6
            ? {
                online_only: true,
                online_zip: {
                  postalCode: '33166',
                  country: 'US',
                  city: 'Doral',
                  region: 'FL',
                  lat: 25.79,
                  lng: -80.2,
                },
                primary_address: { zipcode: '33166' },
              }
            : { primary_address: { city: 'Miami' } }),
          images: { primaryCDN: '/logos/pana_logo_long_orange.png' },
          socials: {},
        })
      );
      const fixtures = await installNativeApiFixtures(page, { businesses });
      await page.goto('/d');
      const results = page.locator('[data-map-results="Directory"]');
      const sheet = results.getByRole('region', {
        name: 'Directory results',
        exact: true,
      });
      const list = sheet.getByRole('region', {
        name: 'Directory listings',
        includeHidden: true,
      });
      const mapped = results.locator('section[aria-label="In map"]');
      const handle = sheet.getByRole('button', { name: 'Resize results' });
      await expect(results.locator('.maplibregl-marker button')).toHaveCount(7);
      await expect(mapped.locator('article')).toHaveCount(7);
      await expect(
        sheet.getByRole('heading', { name: '343 listings' })
      ).toBeVisible();
      expect((await sheet.boundingBox())!.height).toBe(54);
      const nav = page.getByRole('navigation', { name: 'App navigation' });
      expect((await nav.boundingBox())!.height).toBe(58);
      expect(
        Math.round(
          (await nav.boundingBox())!.y - ((await sheet.boundingBox())!.y + 54)
        )
      ).toBe(8);
      const camera = results.locator('.dirsearch-mapcanvas[data-map-center]');
      const canvas = results.locator('canvas');
      await expect(camera).toHaveCount(1);
      // Include the initial framing ease, not just the first bounds report.
      await page.waitForTimeout(500);
      const before = {
        canvas: await canvas.boundingBox(),
        center: await camera.getAttribute('data-map-center'),
        zoom: await camera.getAttribute('data-map-zoom'),
      };
      const order = await mapped
        .locator('article')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-result-id'))
        );
      for (const [label, selected] of [
        ['Compact business 0', 'compact-0'],
        ['Compact business 3', 'compact-3'],
        ['1 online business based near ZIP 33166', 'compact-6'],
      ]) {
        await results.getByRole('button', { name: label, exact: true }).tap();
        await expect(sheet).toHaveAttribute('data-preview', 'true');
        await expect
          .poll(() =>
            list.evaluate((node) => {
              const box = node.getBoundingClientRect();
              const cards = [
                ...node.querySelectorAll('section:not([hidden]) article'),
              ].map((card) => card.getBoundingClientRect());
              return {
                complete: cards.filter(
                  (card) =>
                    card.top >= box.top - 0.5 && card.bottom <= box.bottom + 0.5
                ).length,
                intersecting: cards.filter(
                  (card) =>
                    card.bottom > box.top + 0.5 && card.top < box.bottom - 0.5
                ).length,
              };
            })
          )
          .toEqual({ complete: 2, intersecting: 2 });
        await expect(mapped.locator('article[data-selected]')).toHaveAttribute(
          'data-result-id',
          selected
        );
        expect(
          await mapped
            .locator('article')
            .evaluateAll((nodes) =>
              nodes.map((node) => node.getAttribute('data-result-id'))
            )
        ).toEqual(order);
        expect(await canvas.boundingBox()).toEqual(before.canvas);
        expect(await camera.getAttribute('data-map-center')).toBe(
          before.center
        );
        expect(await camera.getAttribute('data-map-zoom')).toBe(before.zoom);
        if (selected === 'compact-3') {
          const screenshot = testInfo.outputPath(
            'compact-two-profile-preview.png'
          );
          await page.screenshot({ path: screenshot });
          await testInfo.attach('compact-two-profile-preview', {
            path: screenshot,
            contentType: 'image/png',
          });
          await list.evaluate((node) => {
            node.scrollTop = 0;
          });
          await expect(mapped.locator('article').first()).toBeInViewport();
          await results
            .getByRole('button', { name: label, exact: true })
            .evaluate((button: HTMLButtonElement) => button.click());
          await expect(
            mapped.locator('article[data-selected]')
          ).toBeInViewport();
        }
        await handle.press('Home');
        await expect(sheet).toHaveAttribute('data-collapsed', 'true');
      }
      await handle.press('End');
      await sheet.getByRole('tab', { name: 'Online 336', exact: true }).tap();
      await expect(
        results
          .getByRole('region', { name: 'Online', exact: true })
          .locator('article')
      ).toHaveCount(336);
      await expect(mapped).toBeHidden();
      await sheet.getByRole('tab', { name: 'In map 7', exact: true }).tap();
      await expect(mapped).toBeVisible();
      await expect(mapped.locator('article')).toHaveCount(7);
      expect(fixtures.state.unhandled).toEqual([]);
    });
  }
});

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
        name: signedIn ? /Native Viewer/ : 'Create account or sign in',
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
