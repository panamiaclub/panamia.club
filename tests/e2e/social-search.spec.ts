import { test, expect, type Page } from '@playwright/test';
import { SCOPE_TONE, scopePath, type Scope } from '@/lib/directory-scopes';
import type { Suggestion } from '@/lib/suggest';

const categories = [
  {
    scope: 'pana',
    label: 'Panas',
    placeholder: 'Find a Pana...',
    icon: 'user',
  },
  {
    scope: 'group',
    label: 'Groups',
    placeholder: 'Find a group...',
    icon: 'users',
  },
  {
    scope: 'event',
    label: 'Events',
    placeholder: 'Find an event...',
    icon: 'calendar-days',
  },
  {
    scope: 'directory',
    label: 'Directory',
    placeholder: 'Find a local spot...',
    icon: 'store',
  },
] as const;

const suggestion = (scope: Scope, term: string): Suggestion => ({
  kind: scope,
  id: `search-fixture-${scope}`,
  name: `${scope} result for ${term}`,
  subtitle: 'A real scoped suggestion shape',
  href: '/g/social-search-fixture',
  imageUrl: null,
});

async function openSearch(
  page: Page,
  options: {
    guest?: boolean;
    sessionReady?: Promise<void>;
    language?: string;
    lookup?: (url: URL) => Promise<{ status?: number; body: unknown }>;
  } = {}
) {
  const requests: URL[] = [];
  await page.addInitScript(
    (language) => localStorage.setItem('i18nextLng', language),
    options.language ?? 'en'
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ json: body, status });
    if (request.method() !== 'GET') {
      return json({ success: false, error: 'Writes disabled in fixture' }, 405);
    }
    if (path === '/api/auth/get-session') {
      await options.sessionReady;
      return json(
        options.guest
          ? null
          : {
              session: {
                id: 'search-session',
                userId: 'search-user',
                expiresAt: '2099-01-01T00:00:00.000Z',
              },
              user: {
                id: 'search-user',
                email: 'search@example.invalid',
                emailVerified: true,
                name: 'Search Fixture',
                panaVerified: true,
              },
            }
      );
    }
    if (path === '/api/directory/suggest') {
      requests.push(url);
      if (options.lookup) {
        const reply = await options.lookup(url);
        return json(reply.body, reply.status);
      }
      const scope = categories.find(
        (category) => category.scope === url.searchParams.get('scope')
      )?.scope;
      if (!scope)
        throw new Error('Search must request a known, explicit scope');
      return json({
        success: true,
        data: [suggestion(scope, url.searchParams.get('q') ?? '')],
      });
    }
    if (path === '/api/user/me') {
      return json({ success: true, data: { screenname: 'search-fixture' } });
    }
    if (path === '/api/consent/check') return json({ consented: true });
    if (path === '/api/social/statuses' || path === '/api/social/timeline') {
      return json({ success: true, data: { statuses: [], nextCursor: null } });
    }
    if (path === '/api/social/actors/me') {
      return json({
        success: true,
        data: {
          actor: {
            id: 'search-actor',
            username: 'search-fixture',
            name: 'Search Fixture',
            domain: 'localhost',
            followingCount: 0,
            followersCount: 0,
            statusCount: 0,
          },
        },
      });
    }
    if (path === '/api/social/actors/me/groups') {
      return json({ success: true, data: { groups: [] } });
    }
    if (path === '/api/social/actors/me/calendar') {
      return json({ success: true, data: { committed: [], suggested: [] } });
    }
    if (path === '/api/social/follows') {
      return json({ success: true, data: { actors: [], nextCursor: null } });
    }
    return json({ success: false, error: 'Outside search fixture' }, 404);
  });
  const response = await page.goto(options.guest ? '/groups' : '/s');
  expect(response?.status()).toBe(200);
  const header = page.getByRole('banner');
  const form = header.locator('form[role="search"]').filter({ visible: true });
  const input = form.getByRole('combobox');
  if (!options.sessionReady && (page.viewportSize()?.width ?? 1280) >= 768) {
    await expect(input).toHaveAttribute(
      'placeholder',
      options.language === 'es'
        ? 'Encuentra un Pana...'
        : options.guest
          ? 'Find a group...'
          : 'Find a Pana...'
    );
  }
  return { header, form, input, requests };
}

async function openCategories(page: Page) {
  const input = page.getByRole('banner').getByRole('combobox');
  const group = page.getByRole('group', { name: 'Search categories' });
  await expect(async () => {
    if (!(await group.isVisible())) await input.click();
    await expect(group).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  return group;
}

async function expectDestination(
  page: Page,
  destination: string,
  act: () => Promise<unknown>
) {
  const expected = new URL(destination, page.url());
  const request = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === expected.pathname &&
      url.searchParams.get('q') === expected.searchParams.get('q')
    );
  });
  await act();
  expect((await request).method()).toBe('GET');
}

test('Social has a compact search button and canonical colored category graphics', async ({
  page,
}, testInfo) => {
  const { form, input, requests } = await openSearch(page);
  await expect(input).toHaveAttribute('placeholder', 'Find a Pana...');
  await expect(
    form.getByRole('button', { name: 'Search', exact: true })
  ).toBeVisible();
  const group = await openCategories(page);
  const fills = new Set<string>();
  for (const category of categories) {
    const tile = group.getByRole('button', {
      name: category.label,
      exact: true,
    });
    await expect(tile).toHaveAttribute('data-tone', SCOPE_TONE[category.scope]);
    await expect(tile.locator(`svg.lucide-${category.icon}`)).toHaveCount(1);
    const box = await tile.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await tile.click();
    await expect(tile).toHaveAttribute('aria-pressed', 'true');
    await expect(input).toHaveAttribute('placeholder', category.placeholder);
    await expect(form).toHaveAttribute('action', scopePath(category.scope, ''));
    const fill = await tile.evaluate((node) => {
      const reference = document.createElement('span');
      reference.style.backgroundColor = 'var(--surface-tone)';
      node.append(reference);
      const expected = getComputedStyle(reference).backgroundColor;
      reference.remove();
      return { actual: getComputedStyle(node).backgroundColor, expected };
    });
    expect(fill.actual).toBe(fill.expected);
    fills.add(fill.actual);
  }
  expect(fills.size).toBe(4);
  expect(requests).toHaveLength(0);
  const height = await form
    .locator('.social-search-bar')
    .evaluate((node) => node.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(44);
  expect(height).toBeLessThanOrEqual(48);
  await group.getByRole('button', { name: 'Panas', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('social-search-desktop.png'),
  });
});

test('changing categories preserves the query and isolates suggestion caches', async ({
  page,
}) => {
  const { input, requests } = await openSearch(page);
  await expect(input).toHaveAttribute('placeholder', 'Find a Pana...');
  const group = await openCategories(page);
  await input.fill('community');
  for (const category of categories) {
    await group
      .getByRole('button', { name: category.label, exact: true })
      .click();
    await expect(
      page.getByRole('option', {
        name: `${category.scope} result for community`,
        exact: false,
      })
    ).toBeVisible();
    await expect(input).toHaveValue('community');
    expect(requests.at(-1)?.searchParams.get('scope')).toBe(category.scope);
  }
  await group.getByRole('button', { name: 'Panas', exact: true }).click();
  await expect(
    page.getByRole('option', { name: /pana result for community/ })
  ).toBeVisible();
  expect(requests).toHaveLength(4);
});

for (const scope of ['group', 'event', 'directory'] as const) {
  for (const submit of ['button', 'Enter'] as const) {
    test(`${submit} searches the selected ${scope} category with the exact query`, async ({
      page,
    }) => {
      const { form, input } = await openSearch(page);
      const group = await openCategories(page);
      const category = categories.find((item) => item.scope === scope)!;
      await group
        .getByRole('button', { name: category.label, exact: true })
        .click();
      const term = 'coffee & art';
      await input.fill(term);
      await expect(
        page.getByRole('option', { name: new RegExp(`${scope} result`) })
      ).toBeVisible();
      if (submit === 'button') {
        await input.press('ArrowDown');
        await expect(page.getByRole('option').first()).toHaveAttribute(
          'aria-selected',
          'true'
        );
      }
      await expectDestination(page, scopePath(scope, term), () =>
        submit === 'button'
          ? form.getByRole('button', { name: 'Search', exact: true }).click()
          : input.press('Enter')
      );
    });
  }
}

for (const select of ['click', 'Enter'] as const) {
  test(`a suggestion opens its destination using ${select}`, async ({
    page,
  }) => {
    const { input } = await openSearch(page);
    await openCategories(page);
    await input.fill('neighbors');
    const row = page.getByRole('option', { name: /pana result for neighbors/ });
    await expect(row).toBeVisible();
    await expectDestination(page, '/g/social-search-fixture', async () => {
      if (select === 'click') await row.click();
      else {
        await input.press('ArrowDown');
        await input.press('Enter');
      }
    });
  });
}

test('guests keep public search, with member discovery visibly locked', async ({
  page,
}) => {
  const { form, input, requests } = await openSearch(page, { guest: true });
  await expect(input).toHaveAttribute('placeholder', 'Find a group...');
  const group = await openCategories(page);
  await expect(
    group.getByRole('button', { name: 'Panas (sign in required)' })
  ).toBeDisabled();
  await expect(
    form.getByRole('link', { name: 'Sign in to find members' })
  ).toBeVisible();
  await input.fill('a');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await input.fill('');
  const location = page.url();
  await form.getByRole('button', { name: 'Search', exact: true }).click();
  expect(
    await input.evaluate(
      (node) => node instanceof HTMLInputElement && !node.validity.valid
    )
  ).toBe(true);
  expect(page.url()).toBe(location);
  expect(requests).toHaveLength(0);
  await input.fill('public');
  await expect(
    page.getByRole('option', { name: /group result for public/ })
  ).toBeVisible();
  expect(
    requests.every((url) => url.searchParams.get('scope') !== 'pana')
  ).toBe(true);
});

test('a late member session does not override a chosen public category', async ({
  page,
}) => {
  let release = () => {};
  const sessionReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { input, form } = await openSearch(page, { sessionReady });
  const group = await openCategories(page);
  await group.getByRole('button', { name: 'Events', exact: true }).click();
  release();
  await expect(
    group.getByRole('button', { name: 'Panas', exact: true })
  ).toBeEnabled();
  await expect(input).toHaveAttribute('placeholder', 'Find an event...');
  await expect(form).toHaveAttribute('action', '/e');
});

test('old rows disappear immediately and an aborted response cannot repaint a new query', async ({
  page,
}) => {
  let release = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { input } = await openSearch(page, {
    lookup: async (url) => {
      const term = url.searchParams.get('q') ?? '';
      if (term === 'slow') await delayed;
      return { body: { success: true, data: [suggestion('pana', term)] } };
    },
  });
  await openCategories(page);
  await input.fill('first');
  await expect(
    page.getByRole('option', { name: /pana result for first/ })
  ).toBeVisible();
  const slowRequest = page.waitForRequest(
    '**/api/directory/suggest?q=slow&scope=pana'
  );
  await input.fill('slow');
  await expect(
    page.getByRole('option', { name: /pana result for first/ })
  ).toHaveCount(0);
  await slowRequest;
  await input.fill('newest');
  await expect(
    page.getByRole('option', { name: /pana result for newest/ })
  ).toBeVisible();
  release();
  await expect(
    page.getByRole('option', { name: /pana result for slow/ })
  ).toHaveCount(0);
  await expect(
    page.getByRole('option', { name: /pana result for newest/ })
  ).toBeVisible();
});

for (const status of [200, 503]) {
  test(`a ${status} lookup failure is visible, does not cache, and keeps Search usable`, async ({
    page,
  }) => {
    let failed = false;
    const { input, form, requests } = await openSearch(page, {
      lookup: async (url) => {
        const term = url.searchParams.get('q') ?? '';
        if (term === 'retry' && !failed) {
          failed = true;
          return { status, body: { success: false, error: 'Fixture failure' } };
        }
        return { body: { success: true, data: [suggestion('pana', term)] } };
      },
    });
    await openCategories(page);
    await input.fill('retry');
    await expect(
      form
        .getByText('Suggestions are unavailable. You can still use Search.', {
          exact: true,
        })
        .first()
    ).toBeVisible();
    await expect(
      form.getByRole('button', { name: 'Search', exact: true })
    ).toBeEnabled();
    await expect(
      page.getByRole('option', { name: /Search panas for/ })
    ).toBeVisible();
    await input.fill('another');
    await expect(
      page.getByRole('option', { name: /pana result for another/ })
    ).toBeVisible();
    await input.fill('retry');
    await expect(
      page.getByRole('option', { name: /pana result for retry/ })
    ).toBeVisible();
    expect(
      requests.filter((url) => url.searchParams.get('q') === 'retry')
    ).toHaveLength(2);
  });
}

test('keyboard focus reaches categories and Escape dismisses without losing the query', async ({
  page,
}) => {
  const { input } = await openSearch(page);
  const group = await openCategories(page);
  await input.press('Tab');
  await expect(
    page
      .getByRole('banner')
      .getByRole('button', { name: 'Search', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    group.getByRole('button', { name: 'Panas', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    group.getByRole('button', { name: 'Groups', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
  await input.fill('stay here');
  await input.press('Escape');
  await expect(group).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('stay here');
  await input.click();
  await expect(group).toBeVisible();
  await page.getByRole('main').click({ position: { x: 10, y: 10 } });
  await expect(group).toHaveCount(0);
});

test('phone search traps and restores focus, preserves state, and fits down to 320px', async ({
  page,
}, testInfo) => {
  const { input, requests } = await openSearch(page);
  await expect(input).toHaveAttribute('placeholder', 'Find a Pana...');
  const categories = await openCategories(page);
  await categories.getByRole('button', { name: 'Events', exact: true }).click();
  await input.fill('carry this');
  await expect(
    page.getByRole('option', { name: /event result for carry this/ })
  ).toBeVisible();
  for (const width of [320, 390, 640, 660]) {
    await page.setViewportSize({ width, height: 900 });
    const trigger = page.getByRole('button', { name: 'Open community search' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Find your people.' });
    const mobileInput = dialog.getByRole('combobox');
    await expect(mobileInput).toBeFocused();
    await expect(mobileInput).toHaveValue('carry this');
    await expect(
      dialog.getByRole('button', { name: 'Events', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    const tiles = dialog
      .getByRole('group', { name: 'Search categories' })
      .getByRole('button');
    const boxes = await tiles.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { top: box.top, width: box.width, height: box.height };
      })
    );
    expect(new Set(boxes.map((box) => box.top)).size).toBe(1);
    expect(boxes.every((box) => box.width >= 44 && box.height >= 44)).toBe(
      true
    );
    expect(
      await page
        .locator('html')
        .evaluate((node) => node.scrollWidth <= node.clientWidth)
    ).toBe(true);
    if (width === 320) {
      await page.screenshot({
        path: testInfo.outputPath('social-search-mobile-320.png'),
      });
    }
    await dialog
      .getByRole('button', { name: 'Close community search' })
      .focus();
    await page.keyboard.press('Tab');
    await expect(mobileInput).toBeFocused();
    await mobileInput.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(input).toHaveValue('carry this');
  await expect(input).toHaveAttribute('placeholder', 'Find an event...');
  await openCategories(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(input).toHaveValue('carry this');
  expect(requests).toHaveLength(1);
});

for (const selection of ['Search', 'suggestion'] as const) {
  test(`mobile ${selection} opens its destination and dismisses before the response`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openSearch(page);
    const trigger = page.getByRole('button', { name: 'Open community search' });
    const dialog = page.getByRole('dialog', { name: 'Find your people.' });
    await expect(async () => {
      if (!(await dialog.isVisible())) await trigger.click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Groups', exact: true }).click();
    await dialog.getByRole('combobox').fill('makers');
    const row = dialog.getByRole('option', { name: /group result for makers/ });
    await expect(row).toBeVisible();
    const destination =
      selection === 'Search'
        ? scopePath('group', 'makers')
        : '/g/social-search-fixture';
    const target =
      selection === 'Search'
        ? dialog.getByRole('button', { name: 'Search', exact: true })
        : row;
    let release = () => {};
    const heldResponse = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname === new URL(destination, page.url()).pathname,
      async (route) => {
        await heldResponse;
        await route.continue();
      }
    );
    try {
      await expectDestination(page, destination, () =>
        Promise.all([
          target.click({ noWaitAfter: true }),
          expect(dialog).toHaveCount(0, { timeout: 3000 }).then(release),
        ])
      );
    } finally {
      release();
    }
  });
}

test('the real search controls are translated into Spanish', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openSearch(page, { language: 'es' });
  const input = page.getByRole('banner').getByRole('combobox');
  await expect(input).toHaveAttribute('placeholder', 'Encuentra un Pana...');
  await input.click();
  await expect(
    page.getByRole('group', { name: 'Categorías de búsqueda' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Buscar', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Eventos', exact: true }).click();
  await expect(input).toHaveAttribute('placeholder', 'Encuentra un evento...');
  expect(errors).toEqual([]);
});

test.describe('Social search without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  for (const width of [320, 1280]) {
    test(`the ${width}px header has a working native GET Search button`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/groups');
      const header = page.getByRole('banner');
      const form = header
        .getByRole('search', { name: 'Community search' })
        .filter({ visible: true });
      const input = form.locator('input[name="q"]');
      await expect(form).toHaveAttribute('action', '/groups');
      await input.fill('native search');
      await form.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page).toHaveURL(/\/groups\?q=native\+search$/);
    });
  }
});

test('the approved mock also has a visible Search submit button', async ({
  page,
}) => {
  await page.goto('/mock/compact-feed');
  const form = page
    .getByRole('search', { name: 'Example community search' })
    .filter({ visible: true });
  const location = page.url();
  await expect(async () => {
    await form.getByRole('searchbox').click();
    await expect(page.getByLabel('Search categories')).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 30_000 });
  await page.getByText('Design mock', { exact: true }).click();
  await form.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByLabel('Search categories')).toBeVisible();
  expect(page.url()).toBe(location);
});
