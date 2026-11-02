import { expect, test, type Page } from '@playwright/test';
import { installNativeApiFixtures } from './fixtures/native-app-api';

const MOCK_PATH = '/mock/welcome-footer';
const SEEN_KEY = 'pana:welcome-footer:mock:v1';
const LIVE_SEEN_KEY = 'pana:welcome-footer:v1';
const panel = (page: Page) =>
  page.getByRole('complementary', { name: 'Welcome to Pana Mia' });
const bookmark = (page: Page) => page.locator('[data-welcome-bookmark]');

test.use({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('i18nextLng')) {
      localStorage.setItem('i18nextLng', 'en');
    }
  });
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: null })
  );
  await page.route('**/api/articles/recent?*', (route) =>
    route.fulfill({
      json: { success: true, data: { articles: [] } },
    })
  );
});

async function openWelcome(page: Page, path = MOCK_PATH) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-welcome-footer-ready]')).toHaveAttribute(
    'data-welcome-footer-ready',
    'true'
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function expectCollapsed(page: Page) {
  await expect(page.locator('[data-welcome-footer-ready]')).toHaveAttribute(
    'data-welcome-footer-ready',
    'true'
  );
  await expect(page.locator('[data-welcome-footer]')).toHaveCount(0);
  await expect(bookmark(page)).toBeVisible();
  await expect(bookmark(page)).toBeInViewport({ ratio: 1 });
  await expect(bookmark(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(bookmark(page)).toHaveAttribute(
    'aria-controls',
    'welcome-footer-panel'
  );
  await expect(page.locator('#welcome-footer-panel')).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        clearance: document.documentElement.style.getPropertyValue(
          '--welcome-footer-clearance'
        ),
        height: document.documentElement.style.getPropertyValue(
          '--welcome-footer-height'
        ),
        padding: getComputedStyle(document.body).paddingBottom,
      }))
    )
    .toEqual({ clearance: '', height: '', padding: '0px' });
}

async function expectOpen(page: Page) {
  await expect(panel(page)).toBeVisible();
  await expect(bookmark(page)).toBeVisible();
  await expect(bookmark(page)).toHaveCount(1);
  await expect(bookmark(page)).toHaveText('Hide');
  await expect(bookmark(page)).toHaveAttribute('aria-expanded', 'true');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const footer = document
          .querySelector('[data-welcome-footer]')!
          .getBoundingClientRect();
        const tab = document
          .querySelector('[data-welcome-bookmark]')!
          .getBoundingClientRect();
        return Math.abs(tab.bottom - footer.top - 2);
      })
    )
    .toBeLessThan(0.5);
}

function townGeometry(page: Page) {
  return page.locator('.story-street').evaluate((element) => {
    const town = element.getBoundingClientRect();
    const artwork = element.querySelector('svg')!.getBoundingClientRect();
    return {
      top: town.top,
      height: town.height,
      width: town.width,
      artworkHeight: artwork.height,
      artworkWidth: artwork.width,
    };
  });
}

test('first-time visitors get one focused account signup in an isolated mock', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWelcome(page);
  await expect(page).toHaveTitle('Welcome footer (mock) | Pana Mia');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/
  );
  await expect(
    page.getByRole('heading', { name: 'The Future Is Local', level: 1 })
  ).toBeVisible();
  await expect(
    page
      .getByRole('banner')
      .getByRole('link', { name: 'Join the directory', exact: true })
  ).toBeVisible();
  await expectOpen(page);
  await expect(panel(page).getByRole('button')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Collapse', exact: true })
  ).toHaveCount(0);
  await expect(panel(page).getByRole('link')).toHaveCount(1);
  await expect(
    panel(page).getByRole('link', {
      name: 'Create a Pana account',
      exact: true,
    })
  ).toHaveAttribute('href', '/signin');
  await expect(panel(page).getByRole('heading')).toHaveText(
    'Your people are here.'
  );
  await expect(
    panel(page).getByText('Get listed', { exact: true })
  ).toHaveCount(0);
  await expect(
    panel(page).getByText('Join the newsletter', { exact: true })
  ).toHaveCount(0);
  await expect(panel(page).locator('article')).toHaveCount(0);
  await expect(panel(page).getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('later visits show only the Sign up bookmark until it is reopened', async ({
  page,
}) => {
  await openWelcome(page);
  await expect(panel(page)).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SEEN_KEY)
  ).toBe('seen');
  await page.reload();
  await expectCollapsed(page);
  await expect(bookmark(page)).toHaveText('Sign up');
  await bookmark(page).click();
  await expectOpen(page);
  await expect(
    panel(page).getByRole('link', {
      name: 'Create a Pana account',
      exact: true,
    })
  ).toBeFocused();
  await page.reload();
  await expectCollapsed(page);
});

test('the town keeps the live homepage dimensions while the bar overlays its lower edge', async ({
  page,
}) => {
  await openWelcome(page);
  const baseline = await page.context().newPage();
  try {
    await baseline.route('**/api/auth/get-session', (route) =>
      route.fulfill({ json: null })
    );
    await baseline.goto('/');
    await baseline.evaluate(() => document.fonts.ready.then(() => undefined));

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 1024, height: 768 },
      { width: 660, height: 936 },
      { width: 390, height: 844 },
    ]) {
      await Promise.all([
        page.setViewportSize(viewport),
        baseline.setViewportSize(viewport),
      ]);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' })
      );
      await expect(panel(page)).toBeVisible();
      await expect
        .poll(async () => {
          const [actual, original] = await Promise.all([
            townGeometry(page),
            townGeometry(baseline),
          ]);
          return (
            Math.abs(actual.top - original.top) <= 0.5 &&
            Math.abs(actual.height - original.height) <= 0.5 &&
            Math.abs(actual.width - original.width) <= 0.5 &&
            Math.abs(actual.artworkHeight - original.artworkHeight) <= 0.5 &&
            Math.abs(actual.artworkWidth - original.artworkWidth) <= 0.5
          );
        })
        .toBe(true);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const town = document
              .querySelector('.story-street')!
              .getBoundingClientRect();
            const footer = document
              .querySelector('[data-welcome-footer]')!
              .getBoundingClientRect();
            return town.top < footer.top && town.bottom > footer.top;
          })
        )
        .toBe(true);
      const signup = panel(page).getByRole('link', {
        name: 'Create a Pana account',
        exact: true,
      });
      await expect(signup).toBeInViewport({ ratio: 1 });
      await signup.click({ trial: true });
    }
  } finally {
    await baseline.close();
  }
});

test('Escape focuses the bookmark and keyboard reopening preserves page scroll', async ({
  page,
}) => {
  await openWelcome(page);
  await page.evaluate(() =>
    window.scrollTo({ top: 1500, behavior: 'instant' })
  );
  await panel(page)
    .getByRole('link', { name: 'Create a Pana account', exact: true })
    .focus();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Escape');
  await expectCollapsed(page);
  await expect(bookmark(page)).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(scrollBefore);
  await page.keyboard.press('Enter');
  const signup = panel(page).getByRole('link', {
    name: 'Create a Pana account',
    exact: true,
  });
  await expect(panel(page)).toBeVisible();
  await expect(signup).toBeFocused();
  await expectOpen(page);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(scrollBefore);
  await page.keyboard.press('Escape');
  await expectCollapsed(page);
  await expect(bookmark(page)).toBeFocused();
});

test('the compact bookmark reopens the footer on desktop and short phone screens', async ({
  page,
}) => {
  await openWelcome(page);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 600 },
    { width: 740, height: 270 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() =>
      window.scrollTo({ top: 1500, behavior: 'instant' })
    );
    await expectOpen(page);
    const openTop = await bookmark(page).evaluate(
      (element) => element.getBoundingClientRect().top
    );
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await expectCollapsed(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const expectedScroll = await page.evaluate((top) => {
      const searchBottom = document
        .querySelector('.home-hero-field form[role="search"]')!
        .getBoundingClientRect().bottom;
      const mastheadBottom =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--main-masthead-offset'
          )
        ) || 0;
      return Math.max(
        0,
        Math.ceil(Math.max(searchBottom, mastheadBottom) + 16 - top)
      );
    }, openTop);
    const tab = bookmark(page);
    await expect(tab).toHaveText('Sign up');
    const bounds = await tab.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeLessThan(160);
    expect(bounds!.height).toBeLessThan(60);
    expect(Math.abs(bounds!.y + bounds!.height - viewport.height)).toBeLessThan(
      1
    );
    await tab.click();
    await expectOpen(page);
    const signup = panel(page).getByRole('link', {
      name: 'Create a Pana account',
      exact: true,
    });
    await expect(signup).toBeFocused();
    await expect(signup).toBeInViewport({ ratio: 1 });
    await signup.click({ trial: true });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(expectedScroll);
  }
});

test('the sticky prompt stays below search while scrolling and resizing', async ({
  page,
}) => {
  await openWelcome(page);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 660, height: 936 },
    { width: 390, height: 844 },
    { width: 320, height: 600 },
    { width: 740, height: 270 },
  ]) {
    await page.setViewportSize(viewport);
    for (const scrollTop of [0, 120, 500, 1200]) {
      await page.evaluate(
        (top) => window.scrollTo({ top, behavior: 'instant' }),
        scrollTop
      );
      await expect
        .poll(() =>
          page.evaluate(() => {
            const footer = document.querySelector<HTMLElement>(
              '[data-welcome-footer]'
            )!;
            const search = document
              .querySelector('.home-hero-field form[role="search"]')!
              .getBoundingClientRect();
            const masthead = parseFloat(
              getComputedStyle(document.documentElement).getPropertyValue(
                '--main-masthead-offset'
              )
            );
            const ceiling = Math.max(search.bottom, masthead || 0) + 16;
            const tab = document.querySelector<HTMLElement>(
              '[data-welcome-bookmark]'
            )!;
            if (footer.dataset.spaceAvailable === 'false') {
              return (
                getComputedStyle(footer).visibility === 'hidden' &&
                getComputedStyle(tab).visibility === 'hidden'
              );
            }
            const bounds = footer.getBoundingClientRect();
            const tabBounds = tab.getBoundingClientRect();
            return (
              footer.dataset.spaceAvailable === 'true' &&
              Math.min(bounds.top, tabBounds.top) >= ceiling - 0.5 &&
              Math.abs(bounds.bottom - window.innerHeight) <= 0.5 &&
              document.documentElement.scrollWidth <= window.innerWidth
            );
          })
        )
        .toBe(true);
    }
    await expect(panel(page)).toBeVisible();
  }
});

test('one persistent Hide / Sign up bookmark toggles without resizing the town', async ({
  page,
}) => {
  await openWelcome(page);
  await expectOpen(page);
  const persistentBookmark = await bookmark(page).elementHandle();
  if (!persistentBookmark) throw new Error('The welcome bookmark is missing');
  const originalTown = await townGeometry(page);
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expectCollapsed(page);
  expect(
    await persistentBookmark.evaluate(
      (element) => element === document.querySelector('[data-welcome-bookmark]')
    )
  ).toBe(true);
  await expect(bookmark(page)).toBeFocused();
  await expect.poll(() => townGeometry(page)).toEqual(originalTown);
  await bookmark(page).click();
  await expectOpen(page);
  expect(
    await persistentBookmark.evaluate(
      (element) => element === document.querySelector('[data-welcome-bookmark]')
    )
  ).toBe(true);
  await expect.poll(() => townGeometry(page)).toEqual(originalTown);
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expectCollapsed(page);
  await persistentBookmark.dispose();
  await page.reload();
  await expectCollapsed(page);

  await page.goto('/signin');
  await expect(page.locator('[data-welcome-footer]')).toHaveCount(0);
  await expect(bookmark(page)).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue(
          '--welcome-footer-clearance'
        )
      )
    )
    .toBe('');
});

test('the collapsed bookmark leaves the site footer reachable without a reserved strip', async ({
  page,
}) => {
  await openWelcome(page);
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expectCollapsed(page);
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const siteFooter = document
          .querySelector('#footer')!
          .getBoundingClientRect();
        return Math.abs(siteFooter.bottom - window.innerHeight) <= 0.5;
      })
    )
    .toBe(true);
  await expect(
    page.getByRole('contentinfo').getByRole('link', {
      name: 'Privacy Policy',
      exact: true,
    })
  ).toBeInViewport({ ratio: 1 });
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Privacy Policy', exact: true })
    .click({ trial: true });
  const report = await page
    .getByRole('button', { name: 'Report a bug', exact: true })
    .boundingBox();
  const tab = await bookmark(page).boundingBox();
  expect(report).not.toBeNull();
  expect(tab).not.toBeNull();
  expect(tab!.x + tab!.width).toBeLessThan(report!.x);
});

test('a phone browser keeps the single account action accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWelcome(page);
  await page.evaluate(() =>
    window.scrollTo({ top: 1200, behavior: 'instant' })
  );
  const signup = panel(page).getByRole('link', {
    name: 'Create a Pana account',
  });
  await expect(panel(page).getByRole('link')).toHaveCount(1);
  await signup.focus();
  await expect(signup).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      signup.evaluate((element) => {
        const link = element.getBoundingClientRect();
        const footer = document
          .querySelector('[data-welcome-footer]')!
          .getBoundingClientRect();
        return link.top >= footer.top && link.bottom <= footer.bottom;
      })
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expectCollapsed(page);
  await bookmark(page).click();
  await expect(signup).toBeFocused();
  await expect(signup).toBeInViewport({ ratio: 1 });
});

for (const platform of ['android', 'ios'] as const) {
  test(`${platform} never mounts the welcome panel or records a mock visit`, async ({
    page,
  }) => {
    await page.addInitScript((nativePlatform) => {
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => nativePlatform,
      };
      Object.assign(window, { androidBridge: { postMessage: () => {} } });
    }, platform);
    await openWelcome(page);
    await expect(page.locator('[data-welcome-footer]')).toHaveCount(0);
    await expect(bookmark(page)).toHaveCount(0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), SEEN_KEY)
    ).toBeNull();
    expect(
      await page.evaluate(() =>
        document.documentElement.style.getPropertyValue(
          '--welcome-footer-clearance'
        )
      )
    ).toBe('');

    const fixtures = await installNativeApiFixtures(page);
    fixtures.state.signedIn = false;
    await page.goto('/');
    await expect(page.locator('[data-native-app]')).toBeVisible();
    await expect(page.locator('[data-welcome-footer]')).toHaveCount(0);
    await expect(bookmark(page)).toHaveCount(0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), LIVE_SEEN_KEY)
    ).toBeNull();
  });
}

test('signed-in members do not get the welcome prompt', async ({ page }) => {
  await installNativeApiFixtures(page);
  await page.route('**/api/articles/recent?*', (route) =>
    route.fulfill({ json: { success: true, data: { articles: [] } } })
  );
  await openWelcome(page);
  await expect(page.locator('[data-welcome-footer]')).toHaveCount(0);
  await expect(bookmark(page)).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SEEN_KEY)
  ).toBeNull();
  await openWelcome(page, '/');
  await expect(page.locator('[data-welcome-footer]')).toHaveCount(0);
  await expect(bookmark(page)).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), LIVE_SEEN_KEY)
  ).toBeNull();
});

test('storage restrictions are explained without breaking the Hide bookmark', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException('Storage disabled', 'SecurityError');
      return setItem.call(this, name, value);
    };
  }, SEEN_KEY);
  await openWelcome(page);
  await expect(panel(page).getByRole('status')).toHaveText(
    /Your browser could not save this preference/
  );
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expectCollapsed(page);
  await bookmark(page).click();
  await expect(panel(page).getByRole('status')).toHaveText(
    /Your browser could not save this preference/
  );
});

test('the account-only preview has Spanish copy', async ({ page }) => {
  await openWelcome(page);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'en Español', exact: true }).click();
  const welcome = page.getByRole('complementary', {
    name: 'Bienvenido a Pana Mia',
  });
  await expect(welcome).toBeVisible();
  await expect(welcome.getByRole('heading')).toHaveText('Tu gente está aquí.');
  await expect(welcome.getByRole('link')).toHaveText('Crea una cuenta Pana');
  await expect(bookmark(page)).toHaveText('Ocultar');
  await page.getByRole('button', { name: 'Ocultar', exact: true }).click();
  await expectCollapsed(page);
  await expect(bookmark(page)).toHaveText('Regístrate');
  await bookmark(page).click();
  await expect(welcome).toBeVisible();
  await expect(bookmark(page)).toHaveText('Ocultar');
  await expect(bookmark(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(welcome.getByRole('link')).toBeFocused();
});

test('the live homepage ships the approved account footer and existing sign-in destination', async ({
  page,
}) => {
  await openWelcome(page, '/');
  await expect(
    page.getByRole('heading', { name: 'The Future Is Local', level: 1 })
  ).toBeVisible();
  await expectOpen(page);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), LIVE_SEEN_KEY)
  ).toBe('seen');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SEEN_KEY)
  ).toBeNull();
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expectCollapsed(page);
  await page.reload();
  await expectCollapsed(page);
  await bookmark(page).click();
  await expectOpen(page);
  await panel(page)
    .getByRole('link', { name: 'Create a Pana account', exact: true })
    .click();
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page).toHaveTitle(/Sign in \| Pana Mia/i);
  await expect(page.locator('[data-welcome-footer]')).toHaveCount(0);
  await expect(bookmark(page)).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue(
          '--welcome-footer-clearance'
        )
      )
    )
    .toBe('');
});

test('previewing the mock does not consume the live first-visitor welcome', async ({
  page,
}) => {
  await openWelcome(page);
  await expectOpen(page);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SEEN_KEY)
  ).toBe('seen');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), LIVE_SEEN_KEY)
  ).toBeNull();
  await openWelcome(page, '/');
  await expectOpen(page);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), LIVE_SEEN_KEY)
  ).toBe('seen');
  await openWelcome(page);
  await expectCollapsed(page);
});

test('mobile web visitors get signup without the native app layout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWelcome(page, '/');
  await expectOpen(page);
  await expect(page.locator('[data-native-app]')).toHaveCount(0);
  await expect(page.locator('#layout-main')).toBeVisible();
  await panel(page)
    .getByRole('link', { name: 'Create a Pana account', exact: true })
    .click({ trial: true });
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expectCollapsed(page);
  await bookmark(page).click();
  await expectOpen(page);
});
