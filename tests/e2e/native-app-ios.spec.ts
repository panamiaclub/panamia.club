import { expect, test, type Locator, type Page } from '@playwright/test';
import { calls, nativeBridge } from './fixtures/native-bridge';
import { installNativeApiFixtures } from './fixtures/native-app-api';
import type { SearchResultsInterface } from '@/lib/query/directory';
import type { SocialStatusDisplay } from '@/lib/interfaces';

async function ios(page: Page) {
  await nativeBridge(page, { platform: 'ios', googlePlugin: false });
  return installNativeApiFixtures(page);
}

async function floatingContent(page: Page, scrollport: Locator, last: Locator) {
  const app = (await page.locator('[data-native-app]').boundingBox())!;
  const port = (await scrollport.boundingBox())!;
  const dock = page.getByRole('navigation', { name: 'App navigation' });
  const dockBox = (await dock.boundingBox())!;
  expect(Math.round(port.y + port.height)).toBe(Math.round(app.y + app.height));
  expect(dockBox.y + dockBox.height).toBeLessThan(port.y + port.height);
  await expect(last).toBeAttached();
  await expect
    .poll(
      () =>
        last.evaluate((target) => {
          let port = target.parentElement;
          while (
            port &&
            !['auto', 'scroll'].includes(getComputedStyle(port).overflowY)
          ) {
            port = port.parentElement;
          }
          if (!port) throw new Error('No page scroll container');
          const nav = document.querySelector<HTMLElement>(
            'nav[aria-label="App navigation"]'
          )!;
          const dock = nav.getBoundingClientRect();
          const before = target.getBoundingClientRect();
          port.scrollTo({
            top:
              port.scrollTop +
              before.y +
              before.height / 2 -
              dock.y -
              dock.height / 2,
            behavior: 'instant',
          });
          const after = target.getBoundingClientRect();
          const previous = nav.style.pointerEvents;
          nav.style.pointerEvents = 'none';
          const underneath = document.elementFromPoint(
            after.x + after.width / 2,
            after.y + after.height / 2
          );
          nav.style.pointerEvents = previous;
          return target.contains(underneath);
        }),
      { message: 'Real page content should paint behind the floating dock' }
    )
    .toBe(true);
  await scrollport.evaluate((node) => {
    node.scrollTo({ top: node.scrollHeight, behavior: 'instant' });
  });
  await expect(last).toBeInViewport({ ratio: 1 });
  const lastBox = (await last.boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(dockBox.y - 7);
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

for (const platform of ['android', 'ios'] as const) {
  test(`${platform} keeps native headers and the status-area surface the same cream`, async ({
    page,
  }) => {
    await nativeBridge(page, {
      platform,
      googlePlugin: platform === 'android',
    });
    await installNativeApiFixtures(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/d');
    const app = page.locator('[data-native-app]');
    const header = app.locator(':scope > header');
    const consistentCream = async () => {
      await expect(page.locator('html')).toHaveClass(/native-app/);
      await expect(page.locator('html')).toHaveCSS(
        'background-color',
        'rgb(255, 247, 236)'
      );
      await expect(app).toHaveCSS('background-color', 'rgb(255, 247, 236)');
      await expect(header).toHaveCSS('background-color', 'rgb(255, 247, 236)');
      await expect(header).toHaveCSS('background-image', 'none');
      await expect(app).toHaveCSS('background-image', 'none');
    };
    await consistentCream();
    const sheetHeader = page.locator(
      '[data-map-results="Directory"] > section > header'
    );
    await expect(sheetHeader).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(sheetHeader.locator('..')).toHaveCSS(
      'background-color',
      'rgb(255, 247, 236)'
    );
    const nav = page.getByRole('navigation', { name: 'App navigation' });
    for (const tab of ['Community', 'Social', 'Directory']) {
      await nav.getByRole('link', { name: tab, exact: true }).click();
      await expect(
        nav.getByRole('link', { name: tab, exact: true })
      ).toHaveAttribute('aria-current', 'page');
      await consistentCream();
    }
  });
}

test.describe('iOS directory dropdowns', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 740, height: 270 },
  ]) {
    test(`iOS filter bubbles stay above the dock and keep the map fixed at ${viewport.width}x${viewport.height}`, async ({
      page,
    }, testInfo) => {
      await ios(page);
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        const state = Object.assign(window, { filterLocationRequests: 0 });
        Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
          value: (_success: PositionCallback, error: PositionErrorCallback) => {
            state.filterLocationRequests += 1;
            error({
              code: 1,
              message: 'Test permission denied',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            });
          },
        });
      });
      await page.goto('/d');
      const filters = page.getByRole('group', { name: 'Directory filters' });
      const results = page.locator('[data-map-results="Directory"]');
      const canvas = results.locator('.maplibregl-canvas');
      const camera = results.locator('.dirsearch-mapcanvas[data-map-center]');
      const locationRequests = () =>
        page.evaluate(() => {
          if (
            !('filterLocationRequests' in window) ||
            typeof window.filterLocationRequests !== 'number'
          )
            throw new Error('Location spy was not installed');
          return window.filterLocationRequests;
        });
      await expect(results.locator('.maplibregl-marker button')).toHaveCount(2);
      const before = {
        bounds: await canvas.boundingBox(),
        center: await camera.getAttribute('data-map-center'),
        zoom: await camera.getAttribute('data-map-zoom'),
      };
      for (const label of ['Category', 'Visit', 'Certified', 'Events']) {
        const trigger = filters.getByRole('button', {
          name: new RegExp(`^${label}`),
        });
        await expect(trigger).toBeVisible();
        await trigger.press('ArrowUp');
        const dialog = page.getByRole('dialog', { name: label, exact: true });
        await expect(dialog).toBeInViewport({ ratio: 1 });
        await expect(
          dialog
            .getByRole('menuitemcheckbox')
            .or(dialog.getByRole('menuitemradio'))
            .last()
        ).toBeInViewport({ ratio: 1 });
        const box = (await dialog.boundingBox())!;
        const dock = (await page
          .getByRole('navigation', { name: 'App navigation' })
          .boundingBox())!;
        const header = (await page
          .locator('[data-native-app] > header')
          .boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);
        expect(box.y + box.height).toBeLessThanOrEqual(dock.y - 7);
        await expect(
          dialog.getByRole('button', { name: 'Clear all', exact: true })
        ).toBeInViewport({ ratio: 1 });
        await expect(
          dialog.getByRole('button', { name: 'Done', exact: true })
        ).toBeInViewport({ ratio: 1 });
        await page.screenshot({
          path: testInfo.outputPath(`ios-${label.toLowerCase()}-dropdown.png`),
        });
        await dialog.getByRole('button', { name: 'Done', exact: true }).click();
        await expect(trigger).toBeFocused();
      }
      await filters.getByRole('button', { name: /^Visit/ }).click();
      const visit = page.getByRole('dialog', { name: 'Visit', exact: true });
      await visit.getByRole('menuitemradio', { name: /^Online / }).click();
      await expect(visit).toBeVisible();
      await visit.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(
        results.getByRole('heading', { name: '1 listing', exact: true })
      ).toBeVisible();
      expect(await canvas.boundingBox()).toEqual(before.bounds);
      expect(await camera.getAttribute('data-map-center')).toBe(before.center);
      expect(await camera.getAttribute('data-map-zoom')).toBe(before.zoom);
      expect(await locationRequests()).toBe(0);
      await page
        .getByRole('search')
        .getByRole('button', { name: 'Use my location' })
        .click();
      await expect(
        page.getByText('Location is unavailable', { exact: true })
      ).toBeVisible();
      expect(await locationRequests()).toBe(1);
      await filters.getByRole('button', { name: /^Visit/ }).click();
      await expect(visit.getByRole('status')).toContainText(
        'Showing all areas'
      );
      await visit
        .getByRole('button', { name: 'Clear all', exact: true })
        .click();
      await visit.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(
        results.getByRole('heading', { name: '3 listings', exact: true })
      ).toBeVisible();
    });
  }
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
    await page.route('**/api/referrals/me', (route) =>
      route.fulfill({
        json: {
          code: null,
          referralUrl: null,
          milestones: { people: 0, accounts: 0, directory: 0, connectors: 0 },
        },
      })
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
    await floatingContent(
      page,
      page.locator('[data-native-app] #layout-main'),
      page.getByRole('link', { name: 'What we collect and why', exact: true })
    );
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
    expect(frame!.height).toBe(52);
    for (const control of [inbox, bell, avatar]) {
      expect(control!.width).toBeGreaterThanOrEqual(44);
      expect(control!.height).toBeGreaterThanOrEqual(44);
      expect(control!.y).toBeGreaterThanOrEqual(frame!.y + 3);
      expect(control!.y + control!.height).toBeLessThanOrEqual(
        frame!.y + frame!.height - 3
      );
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

for (const platform of ['android', 'ios'] as const) {
  test(`${platform} paints Social and Community behind the floating dock without hiding their last content`, async ({
    page,
  }, testInfo) => {
    await nativeBridge(page, {
      platform,
      googlePlugin: platform === 'android',
    });
    const fixtures = await installNativeApiFixtures(page);
    for (let index = 0; index < 8; index++) {
      fixtures.state.saved.get('personal')!.add(`event-${index}`);
    }
    const statuses: SocialStatusDisplay[] = Array.from(
      { length: 8 },
      (_, index) => ({
        id: `dock-post-${index}`,
        uri: `https://example.invalid/posts/dock-${index}`,
        content: `<p>Floating dock story ${index}</p><p>${'A little room for neighborhood stories. '.repeat(12)}</p>`,
        published: '2026-11-01T12:00:00.000Z',
        repliesCount: 0,
        likesCount: 0,
        liked: false,
        actor: {
          id: 'dock-author',
          username: 'neighbor',
          name: 'Neighborhood friend',
          domain: 'example.invalid',
        },
        recipientTo: ['https://www.w3.org/ns/activitystreams#Public'],
        recipientCc: [],
        attachments: [],
      })
    );
    await page.route(/\/api\/social\/(?:timeline|statuses)(?:\?|$)/, (route) =>
      route.fulfill({
        json: { success: true, data: { statuses, nextCursor: null } },
      })
    );
    await page.route('**/api/directory/featured?*', (route) =>
      route.fulfill({ json: { success: true, data: [] } })
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/s');
    const social = page.getByRole('region', { name: 'Social', exact: true });
    await expect(
      social.getByText('Floating dock story 7', { exact: true })
    ).toBeVisible();
    await floatingContent(
      page,
      social,
      social.getByText("You're all caught up", { exact: true })
    );
    const preview = testInfo.outputPath(`floating-social-${platform}.png`);
    await page.screenshot({ path: preview });
    await testInfo.attach('floating-social', {
      path: preview,
      contentType: 'image/png',
    });
    await page
      .getByRole('navigation', { name: 'App navigation' })
      .getByRole('link', { name: 'Community', exact: true })
      .click();
    const community = page.getByRole('region', {
      name: 'Community',
      exact: true,
    });
    await expect(
      community.getByText('Coffee at Bay Cafe', { exact: true })
    ).toBeVisible();
    await floatingContent(page, community, community.locator('article').last());
  });
}

test.describe('native map marker sizing', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  for (const platform of ['android', 'ios'] as const) {
    test(`${platform} keeps portrait logos circular and ZIP markers compact`, async ({
      page,
    }) => {
      await nativeBridge(page, {
        platform,
        googlePlugin: platform === 'android',
      });
      const listing = (
        id: string,
        image: string,
        coordinates: [number, number] | null
      ): SearchResultsInterface => ({
        _id: id,
        id,
        name: id,
        screenname: id,
        score: 1,
        score_details: {},
        details: '',
        five_words: '',
        images: { primaryCDN: image },
        geo: coordinates ? { coordinates } : null,
        primary_address: { city: 'Miami' },
        socials: {},
      });
      const businesses: SearchResultsInterface[] = [
        listing('portrait-logo', '/test/portrait-marker.svg', [-80.2, 25.79]),
        listing('wide-logo', '/test/wide-marker.svg', [-80.1, 25.79]),
        ...Array.from({ length: 123 }, (_, index): SearchResultsInterface => ({
          ...listing(
            `zip-marker-${index}`,
            '/logos/pana_logo_long_orange.png',
            null
          ),
          online_only: true,
          online_zip: {
            postalCode: '33166',
            country: 'US',
            city: 'Doral',
            region: 'FL',
            lat: 25.74,
            lng: -80.15,
          },
          primary_address: { zipcode: '33166' },
        })),
      ];
      await installNativeApiFixtures(page, { businesses });
      await page.route('**/test/portrait-marker.svg', (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="360"><rect width="120" height="360" fill="black"/><rect y="160" width="120" height="40" fill="#355b3a"/></svg>',
        })
      );
      await page.route('**/test/wide-marker.svg', (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><rect width="360" height="120" fill="#303e8c"/><rect x="160" width="40" height="120" fill="#f28444"/></svg>',
        })
      );
      await page.goto('/d');
      const results = page.locator('[data-map-results="Directory"]');
      for (const name of ['portrait-logo', 'wide-logo']) {
        const pin = results.getByRole('button', { name, exact: true });
        await expect
          .poll(() =>
            pin
              .locator('img')
              .evaluate(
                (image: HTMLImageElement) =>
                  image.complete && image.naturalWidth > 0
              )
          )
          .toBe(true);
        const size = await pin.evaluate((button) => {
          const pin = button.getBoundingClientRect();
          const image = button.querySelector('img')!.getBoundingClientRect();
          return {
            pinWidth: pin.width,
            pinHeight: pin.height,
            imageWidth: image.width,
            imageHeight: image.height,
            contained:
              image.left >= pin.left + 2.5 &&
              image.top >= pin.top + 2.5 &&
              image.right <= pin.right - 2.5 &&
              image.bottom <= pin.bottom - 2.5,
          };
        });
        expect(size.pinWidth).toBe(44);
        expect(size.pinHeight).toBe(44);
        expect(size.imageWidth).toBe(size.imageHeight);
        expect(size.contained).toBe(true);
        await expect(pin.locator('img')).toHaveCSS('object-fit', 'cover');
      }
      const zip = results.getByRole('button', {
        name: '123 online businesses based near ZIP 33166',
        exact: true,
      });
      const face = zip.locator(':scope > span');
      await expect(face).toBeVisible();
      expect((await zip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await zip.boundingBox())!.width).toBeLessThanOrEqual(84);
      expect((await face.boundingBox())!.height).toBe(24);
      expect((await face.boundingBox())!.width).toBeLessThanOrEqual(80);
      await expect(zip.locator('b')).toHaveText('33166');
      await expect(zip.locator('strong')).toHaveText('123');
      await expect(zip).toHaveAttribute('title', /Approximate base ZIP/);
      await zip.tap();
      await expect(
        results.getByRole('region', { name: 'Directory results', exact: true })
      ).toHaveAttribute('data-preview', 'true');
      await expect(results.locator('article[data-selected]')).toHaveAttribute(
        'data-result-id',
        'zip-marker-0'
      );
      await expect(
        results.locator('section[aria-label="In map"] article')
      ).toHaveCount(125);
      await page
        .getByRole('search', { name: 'Search Pana Mia' })
        .getByRole('button', { name: /^Search scope/ })
        .click();
      await page
        .getByRole('menu', { name: 'Search scope', exact: true })
        .getByRole('menuitem', { name: /Events/ })
        .click();
      const events = page.locator('[data-map-results="Events"]');
      const cluster = events.getByRole('button', {
        name: /2 events results at Bay Cafe/,
      });
      const badge = cluster.locator(':scope > span');
      await expect(badge).toHaveText('2');
      await expect(cluster).toHaveCSS('overflow', 'visible');
      expect(
        await badge.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return node.contains(
            document.elementFromPoint(
              box.x + box.width / 2,
              box.y + box.height / 2
            )
          );
        })
      ).toBe(true);
    });
  }
});

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
      await sheet
        .getByRole('tab', { name: 'Without location 336', exact: true })
        .tap();
      await expect(
        results
          .getByRole('region', { name: 'Without location', exact: true })
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
  await page.route('**/api/social/media', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          type: 'image',
          mediaType: 'image/png',
          url: '/img/impact/zine-series.webp',
          name: 'A story photo',
        },
      },
    })
  );
  await page.goto('/s');
  const rail = page.getByRole('region', { name: 'Stories', exact: true });
  await expect(rail.locator('.stories-rail-placeholder')).toHaveCount(4);
  const ownerAvatar = await rail
    .locator('[data-owner="true"] .stories-rail-avatar')
    .boundingBox();
  expect(ownerAvatar!.width).toBe(64);
  expect(ownerAvatar!.height).toBe(64);
  await page.screenshot({
    path: test.info().outputPath('story-rail-ios-ghost-circles.png'),
  });
  await page.getByRole('button', { name: 'Post a story' }).click();
  const camera = page.getByRole('dialog', {
    name: 'Story camera',
    exact: true,
  });
  await expect(camera).toBeVisible();
  const choosing = page.waitForEvent('filechooser');
  await camera.getByRole('button', { name: 'Choose from gallery' }).click();
  const chooser = await choosing;
  await chooser.setFiles({
    name: 'story.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64'
    ),
  });
  await expect(
    page.getByRole('button', { name: 'Post story', exact: true })
  ).toBeEnabled();
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
