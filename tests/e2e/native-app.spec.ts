import { expect, test, type Page } from '@playwright/test';
import { installNativeApiFixtures } from './fixtures/native-app-api';
import { NATIVE_BACK_BUTTON_EVENT } from '@/lib/mobile/native';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--enable-unsafe-swiftshader',
    ],
  },
});

async function native(page: Page) {
  await page.addInitScript(() => {
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    Object.assign(window, { androidBridge: { postMessage: () => {} } });
  });
  return installNativeApiFixtures(page);
}

async function nativeBrowser(
  page: Page,
  platform: 'android' | 'ios',
  failBrowser = false
) {
  await page.addInitScript(
    (config) => {
      Object.assign(window, {
        CapacitorCustomPlatform: { name: config.platform },
        Capacitor: {
          isNativePlatform: () => true,
          getPlatform: () => config.platform,
          isPluginAvailable: (name: string) => name === 'Browser',
          PluginHeaders: [
            {
              name: 'Browser',
              methods: [{ name: 'open', rtype: 'promise' }],
            },
          ],
          nativePromise: async (
            plugin: string,
            method: string,
            args: unknown
          ) => {
            const calls = JSON.parse(
              sessionStorage.getItem('native-browser-test.calls') ?? '[]'
            );
            calls.push({ plugin, method, args });
            sessionStorage.setItem(
              'native-browser-test.calls',
              JSON.stringify(calls)
            );
            if (config.failBrowser && plugin === 'Browser') {
              throw new Error('Browser unavailable');
            }
            return {};
          },
        },
      });
    },
    { platform, failBrowser }
  );
  return installNativeApiFixtures(page);
}

const map = (page: Page, name = 'Directory') =>
  page.locator(`[data-map-results="${name}"]`);
async function scope(page: Page, label: string) {
  await page
    .getByRole('search', { name: 'Search Pana Mia' })
    .getByRole('button', { expanded: false })
    .first()
    .click();
  await page
    .getByRole('menu', { name: 'Search scope', exact: true })
    .getByRole('menuitem', { name: new RegExp(label) })
    .click();
}
async function fitted(page: Page, label = 'Directory') {
  const results = map(page, label);
  const sheet = results.getByRole('region', { name: `${label} results` });
  await expect(sheet).toHaveAttribute('data-preview', 'true');
  await expect(sheet.locator('article[data-result-id]')).toHaveCount(1);
  await expect
    .poll(async () =>
      sheet.evaluate((node) => {
        const card = node.querySelector('article')!.getBoundingClientRect();
        const head = node.querySelector('header')!.getBoundingClientRect();
        const bounds = node.getBoundingClientRect();
        return {
          above: Math.round(card.top - head.bottom),
          below: Math.round(bounds.bottom - card.bottom),
          clipped: card.bottom > bounds.bottom + 0.5,
        };
      })
    )
    .toEqual({ above: 12, below: 12, clipped: false });
}

test('Directory is the native front door, with actual identity and branded categories', async ({
  page,
}) => {
  const fixtures = await native(page);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'App navigation' });
  await expect(nav.getByRole('link')).toHaveText([
    'Directory',
    'Social',
    'Community',
    'Profile',
  ]);
  const navBounds = await nav.boundingBox();
  expect(navBounds).not.toBeNull();
  expect(Math.round(navBounds!.y + navBounds!.height)).toBe(
    await page.evaluate(() => window.innerHeight)
  );
  await expect(
    nav.getByRole('link', { name: 'Directory', exact: true })
  ).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Profile' })).toHaveAttribute(
    'href',
    '/p/native-viewer'
  );
  await expect(
    page.getByRole('searchbox', { name: 'Search directory' })
  ).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
  await page
    .getByRole('search')
    .getByRole('button', { expanded: false })
    .first()
    .click();
  const picker = page.getByRole('menu', { name: 'Search scope', exact: true });
  await expect(picker.getByRole('menuitem')).toHaveCount(3);
  await expect(
    picker.getByRole('menuitem', { name: /Directory/ }).locator('svg')
  ).toBeVisible();
  expect(fixtures.state.unhandled).toEqual([]);
});

test('mobile browsers keep the website layout rather than the native tabs', async ({
  page,
}) => {
  await installNativeApiFixtures(page);
  await page.goto('/');
  await expect(page.locator('#layout-main')).toBeVisible();
  await expect(page.getByRole('banner').first()).toBeVisible();
  await expect(page.locator('[data-native-app]')).toHaveCount(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 720 },
]) {
  test(`About Pana opens a new browser tab from the account menu at ${viewport.width}x${viewport.height}`, async ({
    page,
    context,
  }) => {
    await installNativeApiFixtures(page);
    await context.route('https://panamia.club/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>Pana Mia</title>',
      })
    );
    await page.setViewportSize(viewport);
    await page.goto('/d');
    const trigger = page.getByRole('button', { name: /Native Viewer/ });
    await trigger.click();
    const menu = page.getByRole('menu');
    const about = menu.getByRole('menuitem', {
      name: 'About Pana',
      exact: true,
    });
    await expect(menu.getByRole('menuitem').nth(-2)).toHaveText('About Pana');
    await expect(menu.getByRole('menuitem').last()).toHaveText('Sign Out');
    await expect(about).toHaveAttribute('href', 'https://panamia.club/');
    await expect(about).toHaveAttribute('target', '_blank');
    await expect(about).toHaveAttribute('rel', 'noopener noreferrer');
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      about.click(),
    ]);
    await expect(popup).toHaveURL('https://panamia.club/');
    await expect(page).toHaveURL(/\/d$/);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
}

for (const platform of ['android', 'ios'] as const) {
  test(`About Pana opens the native browser on ${platform} without leaving the app`, async ({
    page,
    context,
  }) => {
    await nativeBrowser(page, platform);
    await page.goto('/d');
    const trigger = page.getByRole('button', { name: /Native Viewer/ });
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem').nth(-2)).toHaveText('About Pana');
    await expect(menu.getByRole('menuitem').last()).toHaveText('Sign Out');
    await menu
      .getByRole('menuitem', { name: 'About Pana', exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.parse(
            sessionStorage.getItem('native-browser-test.calls') ?? '[]'
          )
        )
      )
      .toEqual([
        {
          plugin: 'Browser',
          method: 'open',
          args: { url: 'https://panamia.club/' },
        },
      ]);
    await expect(page).toHaveURL(/\/d$/);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(context.pages()).toHaveLength(1);
  });
}

test('About Pana reports a native browser failure without navigating the app', async ({
  page,
  context,
}) => {
  await nativeBrowser(page, 'android', true);
  await page.goto('/d');
  await page.getByRole('button', { name: /Native Viewer/ }).click();
  await page.getByRole('menuitem', { name: 'About Pana', exact: true }).click();
  await expect(
    page.getByText("Couldn't open Pana Mia. Please try again.")
  ).toBeVisible();
  await expect(page).toHaveURL(/\/d$/);
  expect(context.pages()).toHaveLength(1);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 740, height: 270 },
]) {
  test(`one selected card fits with breathing room at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await native(page);
    await page.setViewportSize(viewport);
    await page.goto('/d');
    await map(page)
      .getByRole('button', { name: 'Bay Cafe', exact: true })
      .click();
    await fitted(page);
    const href = map(page).locator('article a').first();
    await expect(href).toHaveAttribute('href', '/p/bay-cafe');
  });
}

test('a real profile destination and Back preserve the selected card and search', async ({
  page,
}) => {
  await native(page);
  await page.goto('/d');
  await page
    .getByRole('searchbox', { name: 'Search directory' })
    .fill('coffee');
  await expect(map(page).locator('.maplibregl-marker button')).toHaveCount(1);
  await map(page)
    .getByRole('button', { name: 'Bay Cafe', exact: true })
    .click();
  await fitted(page);
  await map(page).locator('article a').first().click();
  await expect(page).toHaveURL(/\/p\/bay-cafe$/);
  await expect(
    page.getByRole('heading', { name: 'Bay Cafe', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/d$/);
  await expect(
    page.getByRole('searchbox', { name: 'Search directory' })
  ).toHaveValue('coffee');
  await fitted(page);
});

test('native Back closes custom menus before changing the results sheet', async ({
  page,
}) => {
  await native(page);
  await page.goto('/d');
  await map(page)
    .getByRole('button', { name: 'Bay Cafe', exact: true })
    .click();
  await fitted(page);
  const trigger = page.getByRole('button', {
    name: 'Search scope, currently Directory',
    exact: true,
  });
  await trigger.click();
  const back = () =>
    page.evaluate((name) => {
      const event = new Event(name, { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }, NATIVE_BACK_BUTTON_EVENT);
  expect(await back()).toBe(true);
  await expect(
    page.getByRole('menu', { name: 'Search scope', exact: true })
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await fitted(page);
  await page.getByRole('button', { name: /Native Viewer/ }).click();
  expect(await back()).toBe(true);
  await expect(
    page.getByRole('dialog', { name: /Native Viewer/ })
  ).toHaveAttribute('inert', '');
  await expect(
    page.getByRole('button', { name: /Native Viewer/ })
  ).toBeFocused();
  await fitted(page);
  expect(await back()).toBe(true);
  await expect(
    map(page).getByRole('region', { name: 'Directory results' })
  ).not.toHaveAttribute('data-preview', 'true');
  await expect(page).toHaveURL(/\/d$/);
});

test('Events retain their own map, shared-venue cluster and unpinned online results', async ({
  page,
}) => {
  await native(page);
  await page.goto('/d');
  await map(page)
    .getByRole('button', { name: 'Bay Cafe', exact: true })
    .click();
  await fitted(page);
  const marker = map(page).getByRole('button', {
    name: 'Bay Cafe',
    exact: true,
  });
  const before = (await marker.boundingBox())!.x;
  const canvas = (await map(page).locator('canvas').boundingBox())!;
  await page.mouse.move(
    canvas.x + canvas.width * 0.8,
    canvas.y + canvas.height * 0.6
  );
  await page.mouse.down();
  await page.mouse.move(
    canvas.x + canvas.width * 0.8 - 60,
    canvas.y + canvas.height * 0.6,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect
    .poll(async () => Math.abs((await marker.boundingBox())!.x - before))
    .toBeGreaterThan(30);
  let panX = Number.NaN;
  let stable = 0;
  await expect
    .poll(
      async () => {
        const x = (await marker.boundingBox())!.x;
        stable = Math.abs(x - panX) < 0.5 ? stable + 1 : 0;
        panX = x;
        return stable;
      },
      { intervals: [100] }
    )
    .toBeGreaterThanOrEqual(3);
  await scope(page, 'Events');
  await expect(map(page, 'Events')).toBeVisible();
  await map(page, 'Events')
    .getByRole('button', { name: /2 events results at Bay Cafe/ })
    .click();
  await expect(map(page, 'Events').locator('article')).toHaveCount(2);
  await map(page, 'Events').getByRole('button', { name: 'Show all' }).click();
  await map(page, 'Events')
    .getByRole('button', { name: 'List', exact: true })
    .click();
  await expect(
    map(page, 'Events').getByText('Online conversation', { exact: true })
  ).toBeVisible();
  await expect(
    map(page, 'Events')
      .locator('.maplibregl-marker')
      .getByRole('button', { name: 'Online conversation', exact: true })
  ).toHaveCount(0);
  await scope(page, 'Directory');
  await fitted(page);
  await expect
    .poll(async () => (await marker.boundingBox())!.x)
    .toBeCloseTo(panX, 0);
});

test('event search and pagination use the server and reach beyond the first batch', async ({
  page,
}) => {
  const fixtures = await native(page);
  await page.goto('/d?scope=event');
  await map(page, 'Events')
    .getByRole('button', { name: 'List', exact: true })
    .click();
  await map(page, 'Events')
    .getByRole('button', { name: 'More events' })
    .click();
  await expect(
    map(page, 'Events').getByText('Community gathering 27', { exact: true })
  ).toBeVisible();
  expect(
    fixtures.state.requests.some(
      (request) =>
        request.pathname === '/api/events' &&
        new URLSearchParams(request.query).get('offset') === '24'
    )
  ).toBe(true);
  await page
    .getByRole('searchbox', { name: 'Search events' })
    .fill('gathering 27');
  await expect(map(page, 'Events').locator('article')).toHaveCount(1);
  expect(
    fixtures.state.requests.some(
      (request) =>
        request.pathname === '/api/events' &&
        new URLSearchParams(request.query).get('q') === 'gathering 27'
    )
  ).toBe(true);
});

test('Yours keeps joined groups, requests, plans and actual saves distinct', async ({
  page,
}) => {
  const fixtures = await native(page);
  await page.goto('/groups');
  await expect(
    page.getByRole('tab', { name: 'Yours', exact: true })
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByText('Our private club', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Pending requests' })
  ).toBeVisible();
  await expect(page.getByText('Interested', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(
    page.getByText('Coffee at Bay Cafe', { exact: true })
  ).toBeVisible();
  fixtures.state.fail.add('/api/events/event-0/save');
  await page.getByRole('button', { name: 'Unsave Coffee at Bay Cafe' }).click();
  await expect(
    page.getByText('Test service unavailable', { exact: true })
  ).toBeVisible();
  expect(fixtures.state.saved.get('personal')?.has('event-0')).toBe(true);
  fixtures.state.fail.clear();
  await page.getByRole('button', { name: 'Unsave Coffee at Bay Cafe' }).click();
  await expect(page.getByText('No saved events yet')).toBeVisible();
  expect(fixtures.state.saved.get('personal')?.size).toBe(0);
  expect(
    fixtures.state.requests.filter((request) => /rsvp/.test(request.pathname))
  ).toEqual([]);
});

test('Discover uses square keyboard-scrollable cards without carousel arrows', async ({
  page,
}) => {
  await native(page);
  await page.goto('/groups');
  await page.getByRole('tab', { name: 'Discover', exact: true }).click();
  const rail = page.getByRole('list', { name: /From hosts you follow/ });
  await expect(rail.locator('[data-layout="square"]')).toHaveCount(6);
  await expect(
    rail.getByRole('button', { name: /next|previous/i })
  ).toHaveCount(0);
  await rail.focus();
  await page.keyboard.press('End');
  await expect
    .poll(() => rail.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
  await expect(
    rail.locator('article').first().getByRole('link')
  ).toHaveAttribute('href', '/e/event-4');
});

test('deep group discovery links preserve query, topic and sort', async ({
  page,
}) => {
  const fixtures = await native(page);
  await page.goto('/groups/discover?q=Neighborhood&topic=arts&sort=members');
  await expect(
    page.getByRole('tab', { name: 'Discover', exact: true })
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('searchbox', { name: 'Search discovered groups' })
  ).toHaveValue('Neighborhood');
  await expect
    .poll(() =>
      fixtures.state.requests.some(
        (request) =>
          request.pathname === '/api/social/groups' &&
          new URLSearchParams(request.query).get('sort') === 'members' &&
          new URLSearchParams(request.query).get('topic') === 'arts'
      )
    )
    .toBe(true);
});

test('Discover does not treat unavailable plans or memberships as empty', async ({
  page,
}) => {
  const fixtures = await native(page);
  fixtures.state.fail.add('/api/social/actors/me/groups');
  fixtures.state.fail.add('/api/social/actors/me/calendar');
  await page.goto('/groups');
  await page.getByRole('tab', { name: 'Discover', exact: true }).click();
  await expect(
    page.getByText('Could not load your memberships for discovery', {
      exact: true,
    })
  ).toBeVisible();
  await expect(
    page.getByText('Could not load your plans for discovery', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: /Groups to discover|From hosts you follow/ })
  ).toHaveCount(0);
  fixtures.state.fail.clear();
  const notice = page
    .getByRole('alert')
    .filter({ hasText: 'Could not load your memberships for discovery' });
  await notice.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('list', { name: /Groups to discover/ })
  ).toBeVisible();
  await expect(
    page
      .getByRole('list', { name: /Groups to discover/ })
      .getByText('Our private club', { exact: true })
  ).toHaveCount(0);
});

test('private saved events follow the active identity while Profile remains personal', async ({
  page,
}) => {
  const fixtures = await native(page);
  await page.goto('/groups');
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(
    page.getByText('Coffee at Bay Cafe', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: /Native Viewer/ }).click();
  await page.getByRole('menuitem', { name: /Viewer Business/ }).click();
  await expect(
    page.getByText('Coffee workshop', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Coffee at Bay Cafe', { exact: true })
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'App navigation' })
      .getByRole('link', { name: 'Profile' })
  ).toHaveAttribute('href', '/p/native-viewer');
  expect(fixtures.state.activeId).toBe('business');
  await page.reload();
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(
    page.getByText('Coffee workshop', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Coffee at Bay Cafe', { exact: true })
  ).toHaveCount(0);
});

test('guest event bookmarks return to the real event after signing in', async ({
  page,
}) => {
  const fixtures = await native(page);
  fixtures.state.signedIn = false;
  await page.goto('/d?scope=event');
  await map(page, 'Events')
    .getByRole('button', { name: 'List', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Sign in to save Coffee at Bay Cafe' })
  ).toHaveAttribute('href', '/signin?callbackUrl=%2Fe%2Fevent-0');
});

test('WebGL failure preserves a useful results list and an explicit map retry', async ({
  page,
}) => {
  await native(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = new Proxy(original, {
      apply(target, receiver, args) {
        return String(args[0]).startsWith('webgl')
          ? null
          : Reflect.apply(target, receiver, args);
      },
    });
  });
  await page.goto('/d');
  await expect(
    page.getByText('Map unavailable', { exact: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry map' })).toBeVisible();
  await map(page).getByRole('button', { name: 'List', exact: true }).click();
  await expect(map(page).getByText('Bay Cafe', { exact: true })).toBeVisible();
});

test('leaving Social stops camera and microphone without losing the audience filter or reopening capture', async ({
  page,
}) => {
  await native(page);
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      streams.push(stream);
      return stream;
    };
    Object.assign(window, { nativeTestStreams: streams });
  });
  await page.goto('/s');
  await page.getByRole('tab', { name: 'My Panas', exact: true }).click();
  await page.getByRole('button', { name: 'Post a story' }).click();
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (Reflect.get(window, 'nativeTestStreams') as MediaStream[]).filter(
            (stream) =>
              stream.getTracks().some((track) => track.readyState === 'live')
          ).length
      )
    )
    .toBe(1);
  await expect(page.locator('[data-native-app]')).not.toHaveClass(/dirscope/);
  await page.getByRole('button', { name: 'Video', exact: true }).click();
  await page.getByRole('button', { name: 'Record video', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Stop recording', exact: true })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (Reflect.get(window, 'nativeTestStreams') as MediaStream[]).some(
          (stream) =>
            stream.getAudioTracks().some((track) => track.readyState === 'live')
        )
      )
    )
    .toBe(true);
  await page.evaluate(() => {
    history.pushState({}, '', '/d');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(
    page.getByRole('searchbox', { name: 'Search directory' })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (Reflect.get(window, 'nativeTestStreams') as MediaStream[]).every(
          (stream) =>
            stream.getTracks().every((track) => track.readyState === 'ended')
        )
      )
    )
    .toBe(true);
  await page
    .getByRole('navigation', { name: 'App navigation' })
    .getByRole('link', { name: 'Social', exact: true })
    .click();
  await expect(
    page.getByRole('tab', { name: 'My Panas', exact: true })
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('dialog', { name: /^(Story camera|Post a story)$/ })
  ).toHaveCount(0);
});
