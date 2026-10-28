import { expect, test, type Page } from '@playwright/test';
import {
  APP_EVENT_PICKS,
  APP_GROUP_PICKS,
  APP_INITIAL_RSVPS,
  APP_PLACE_PICKS,
  APP_SEARCH_SCOPES,
  MOCK_EVENTS,
  MOCK_GROUPS,
  type AppSearchScope,
} from '../../app/mock/app/_data/mock-app';
import { SCOPE_TONE } from '../../lib/directory-scopes';

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/mock/app');
});

async function chooseSearchScope(
  page: Page,
  id: AppSearchScope,
  interaction: 'click' | 'tap' = 'click'
) {
  const scope = APP_SEARCH_SCOPES.find((entry) => entry.id === id);
  if (!scope) throw new Error(`Unknown app search category: ${id}`);
  const trigger = page.getByRole('button', {
    name: /^Search scope, currently /,
  });
  await trigger[interaction]();
  const option = page
    .getByRole('menu', { name: 'Search scope' })
    .getByRole('menuitem', { name: new RegExp(`^${scope.label}\\b`) });
  await option[interaction]();
}

async function expectDirectoryCardRevealed(
  page: Page,
  name: string,
  kind: 'directory' | 'events' = 'directory'
) {
  const isDirectory = kind === 'directory';
  const card = page.getByRole(isDirectory ? 'link' : 'button', {
    name: `${isDirectory ? 'View' : 'Preview'} ${name}`,
    exact: true,
  });
  const listings = page.getByRole('region', {
    name: isDirectory ? 'Directory listings' : 'Event search results',
    exact: true,
  });
  const navigation = page.getByRole('navigation', { name: 'App navigation' });
  await expect(card).toHaveAttribute('data-selected', 'true');
  await expect
    .poll(
      async () => {
        const bounds = await card.boundingBox();
        const viewport = await listings.boundingBox();
        const nav = await navigation.boundingBox();
        if (!bounds || !viewport || !nav) {
          throw new Error(
            'The selected card, list, or navigation has no bounds'
          );
        }
        return Math.min(
          bounds.y - viewport.y,
          viewport.y + viewport.height - (bounds.y + bounds.height),
          nav.y - (bounds.y + bounds.height),
          bounds.x - viewport.x,
          viewport.x + viewport.width - (bounds.x + bounds.width)
        );
      },
      { message: `${name} should be fully visible with room around its card` }
    )
    .toBeGreaterThanOrEqual(11);
  await expect(card).toBeInViewport({ ratio: 1 });
  await expect(navigation).toBeInViewport({ ratio: 1 });
  await expect(listings).toHaveAttribute('data-preview', 'true');
  await expect(listings.getByRole(isDirectory ? 'link' : 'button')).toHaveCount(
    1
  );
  await expect(
    page.getByRole('button', { name: `Select ${name} on map`, exact: true })
  ).toHaveAttribute(
    'aria-controls',
    await card.evaluate((element) => element.id)
  );
  expect(
    await page
      .getByRole('group', {
        name: isDirectory
          ? 'Illustrative South Florida map'
          : 'Illustrative South Florida event map',
        exact: true,
      })
      .locator('button[aria-controls]')
      .evaluateAll((buttons) =>
        buttons
          .map((button) => button.getAttribute('aria-controls'))
          .filter((id) => id !== null && !document.getElementById(id))
      )
  ).toEqual([]);
  await expect
    .poll(async () => {
      const bounds = await card.boundingBox();
      const viewport = await listings.boundingBox();
      if (!bounds || !viewport)
        throw new Error('No single-card preview bounds');
      return Math.abs(viewport.height - bounds.height - 24);
    })
    .toBeLessThanOrEqual(1);
}

test('opens on Directory with ordered navigation and an existing-profile link', async ({
  page,
}) => {
  const navigation = page.getByRole('navigation', { name: 'App navigation' });
  const directory = navigation.getByRole('tab', {
    name: 'Directory',
    exact: true,
  });
  await expect(directory).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('region', { name: 'Directory map and results' })
  ).toBeVisible();
  await expect(navigation.locator('[role="tab"], a')).toHaveText([
    'Directory',
    'Social',
    'Community',
    'Profile',
  ]);
  await expect(navigation.getByRole('tab')).toHaveCount(3);
  await expect(navigation.getByRole('link')).toHaveCount(1);
  await expect(
    navigation.getByRole('link', { name: /^Profile:/ })
  ).toHaveAttribute('href', 'https://panamia.club/p/nochillnerd');
  await expect(
    page.getByRole('button', { name: 'Preview your account' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Preview notifications' })
  ).toBeVisible();
  for (const [tab, title] of [
    ['Directory', 'Directory'],
    ['Social', 'Pana Social'],
    ['Community', 'Community'],
  ]) {
    await navigation.getByRole('tab', { name: tab, exact: true }).click();
    await expect(
      navigation.getByRole('tab', { name: tab, exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    const panel = page.getByRole('tabpanel', { name: tab, exact: true });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole('heading', { name: title, exact: true })
    ).toHaveClass('sr-only');
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(navigation).toBeInViewport();
  }
  await page.reload();
  await expect(directory).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('region', { name: 'Directory map and results' })
  ).toBeVisible();
});

test('keeps explicit tab links ahead of the default opening tab', async ({
  page,
}) => {
  for (const [hash, tab] of [
    ['#social', 'Social'],
    ['#directory', 'Directory'],
    ['#community', 'Community'],
    ['#explore', 'Community'],
  ]) {
    await page.goto(`/mock/app${hash}`);
    const trigger = page.getByRole('tab', { name: tab, exact: true });
    const panel = page.getByRole('tabpanel', { name: tab, exact: true });
    await expect(trigger).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toBeVisible();
    await page.reload();
    await expect(trigger).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toBeVisible();
  }
});

test('starts every tab with useful content instead of introductory text', async ({
  page,
}) => {
  const header = await page.getByRole('banner').boundingBox();
  if (!header) throw new Error('The app header has no rendered bounds');
  expect(header.height).toBeLessThanOrEqual(64);

  const screens = [
    {
      tab: 'Directory',
      firstControl: page.getByRole('searchbox', {
        name: 'Search the directory',
      }),
    },
    {
      tab: 'Social',
      firstControl: page.getByRole('button', {
        name: 'Preview adding your story',
      }),
    },
    {
      tab: 'Community',
      firstControl: page.getByRole('button', { name: 'Yours', exact: true }),
    },
  ];

  for (const { tab, firstControl } of screens) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const content = await firstControl.boundingBox();
    if (!content) throw new Error(`${tab} has no visible starting control`);
    const gap = content.y - (header.y + header.height);
    if (tab === 'Community') {
      expect(Math.abs(gap)).toBeLessThanOrEqual(1);
    } else {
      expect(gap).toBeGreaterThanOrEqual(12);
      expect(gap).toBeLessThanOrEqual(20);
    }
  }
  await expect(page.getByText('App preview', { exact: true })).toHaveCount(0);
});

test('keeps feed filters compact, touch-friendly, and keyboard operable', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Social', exact: true }).click();
  const filters = page.getByRole('group', {
    name: 'Feed audience',
    exact: true,
  });
  const everyone = filters.getByRole('button', {
    name: 'Everyone',
    exact: true,
  });
  const panas = filters.getByRole('button', {
    name: 'My Panas',
    exact: true,
  });
  const publicPost = page.getByRole('heading', {
    name: 'Taller Tropical',
    exact: true,
  });

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const row = await filters.boundingBox();
    if (!row) throw new Error('The feed filters have no rendered bounds');
    expect(row.height).toBeLessThanOrEqual(44);
    for (const button of [everyone, panas]) {
      const bounds = await button.boundingBox();
      if (!bounds) throw new Error('A feed filter has no rendered bounds');
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
  }

  await expect(everyone).toHaveAttribute('aria-pressed', 'true');
  await expect(publicPost).toHaveCount(1);
  await panas.focus();
  await page.keyboard.press('Enter');
  await expect(panas).toHaveAttribute('aria-pressed', 'true');
  await expect(publicPost).toHaveCount(0);
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await page.getByRole('tab', { name: 'Social', exact: true }).click();
  await expect(panas).toHaveAttribute('aria-pressed', 'true');
  await everyone.click();
  await expect(everyone).toHaveAttribute('aria-pressed', 'true');
  await expect(publicPost).toHaveCount(1);
});

test('keeps the active feed visible and switchable while scrolling', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Social', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Social', exact: true });
  const filters = page.getByRole('group', {
    name: 'Feed audience',
    exact: true,
  });

  const expectPinned = async (label: string) => {
    await expect(filters).toBeInViewport({ ratio: 1 });
    const header = await page.getByRole('banner').boundingBox();
    const row = await filters.boundingBox();
    if (!header || !row) {
      throw new Error('The header or feed filter has no rendered bounds');
    }
    expect(Math.abs(row.y - (header.y + header.height))).toBeLessThanOrEqual(1);
    await expect(
      filters.getByRole('button', { name: label, exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
  };

  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1280, 980],
  ]) {
    await page.setViewportSize({ width, height });
    await panel.evaluate((element) => {
      element.scrollTop = 0;
    });

    for (const label of ['Everyone', 'My Panas']) {
      await filters.getByRole('button', { name: label, exact: true }).click();
      await expect
        .poll(() =>
          panel.evaluate(
            (element) => element.scrollHeight - element.clientHeight
          )
        )
        .toBeGreaterThan(300);
      await panel.evaluate((element) => {
        element.scrollTop = 300;
      });
      await expectPinned(label);
      await panel.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expectPinned(label);
    }
  }
});

test('filters directory fixtures and keeps search state across tabs', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search the directory' });
  await search.fill('Barrio');
  await expect(page.getByRole('status')).toHaveText('1 local find');
  await expect(
    page.getByRole('link', { name: 'View Barrio Arts Lab' })
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Social', exact: true }).click();
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await expect(search).toHaveValue('Barrio');
  await page.getByRole('button', { name: 'Food', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('0 local finds');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('status')).toHaveText('4 local finds');
});

test('searches mapped Events and list-based Groups without carrying over business filters', async ({
  page,
}) => {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      writes.push(request.url());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const url = page.url();
  const category = page.getByRole('button', {
    name: /^Search scope, currently /,
  });
  await expect(category).toHaveAccessibleName(
    'Search scope, currently Directory'
  );
  await category.click();
  const menu = page.getByRole('menu', { name: 'Search scope' });
  await expect(menu.getByRole('menuitem')).toHaveCount(3);
  const colors: string[] = [];
  for (const scope of APP_SEARCH_SCOPES) {
    const option = menu.getByRole('menuitem', {
      name: new RegExp(`^${scope.label}\\b`),
    });
    await expect(option).toHaveAttribute(
      'data-tone',
      SCOPE_TONE[scope.siteScope]
    );
    await expect(option.locator('svg')).toHaveCount(1);
    colors.push(
      await option
        .locator('svg')
        .evaluate((icon) => getComputedStyle(icon).color)
    );
  }
  expect(new Set(colors).size).toBe(3);
  await page.keyboard.press('Escape');
  await page
    .getByRole('searchbox', { name: 'Search the directory' })
    .fill('Barrio');
  await page.getByRole('button', { name: 'Food', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('0 local finds');

  await chooseSearchScope(page, 'events');
  const events = page.getByRole('region', { name: 'Event search results' });
  const eventSearch = page.getByRole('searchbox', { name: 'Search events' });
  await expect(eventSearch).toHaveValue('Barrio');
  await expect(events).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Directory map and results' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('slider', { name: 'Event results sheet position' })
  ).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Illustrative South Florida event map' })
  ).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Listing categories' })
  ).toHaveCount(0);
  const event = MOCK_EVENTS.find((entry) => entry.where.includes('Barrio'));
  if (!event) throw new Error('The event fixtures need a Barrio venue');
  const eventCard = events.getByRole('button', {
    name: `Preview ${event.title}`,
    exact: true,
  });
  await expect(eventCard).toContainText(event.where);
  await expect(eventCard).toHaveAccessibleDescription(
    `${event.when} / ${event.where}`
  );
  await eventCard.click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: event.title })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(eventCard).toBeFocused();
  await expect(category).toHaveAccessibleName('Search scope, currently Events');
  await expect(eventSearch).toHaveValue('Barrio');
  await eventSearch.fill('');
  await expect(events.getByRole('button', { name: /^Preview / })).toHaveCount(
    MOCK_EVENTS.length
  );
  await expect(
    page
      .getByRole('region', { name: 'Event results', exact: true })
      .getByRole('status')
  ).toHaveText(`${MOCK_EVENTS.length} events`);
  await eventSearch.press('Enter');
  await expect(page).toHaveURL(url);

  await eventSearch.fill('no-such-pana-9876');
  await expect(events.getByRole('heading')).toHaveText('No matching events');
  await chooseSearchScope(page, 'groups');
  const groups = page.getByRole('region', { name: 'Group search results' });
  const groupSearch = page.getByRole('searchbox', { name: 'Search groups' });
  await expect(page.getByRole('slider')).toHaveCount(0);
  await expect(groupSearch).toHaveValue('no-such-pana-9876');
  await expect(groups.getByRole('heading')).toHaveText('No matching groups');
  await groups.getByRole('button', { name: 'Clear search' }).click();
  await expect(groupSearch).toBeFocused();
  await expect(groupSearch).toHaveValue('');
  await expect(groups.getByRole('button', { name: /^Preview / })).toHaveCount(
    MOCK_GROUPS.length
  );
  const privateGroup = MOCK_GROUPS.find(
    (group) => group.visibility === 'private'
  );
  if (!privateGroup) throw new Error('The group fixtures need a private group');
  await groupSearch.fill(`@${privateGroup.handle.toUpperCase()}`);
  await expect(groups.getByRole('status')).toHaveText('1 group');
  const groupCard = groups.getByRole('button', {
    name: `Preview ${privateGroup.name}`,
    exact: true,
  });
  await expect(groupCard).toContainText('Private group');
  await expect(groupCard).toHaveAccessibleDescription(
    `Private group / ${privateGroup.topics.join(', ')}`
  );
  await expect(groupCard).not.toContainText('0 posts');
  await expect(groupCard).not.toContainText('members');
  await expect(
    page.getByRole('tab', { name: 'Directory', exact: true })
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(url);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('groups event area pins and keeps online events searchable without invented locations', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await chooseSearchScope(page, 'events');
  const map = page.getByRole('group', {
    name: 'Illustrative South Florida event map',
    exact: true,
  });
  const sheet = page.getByRole('region', {
    name: 'Event results',
    exact: true,
  });
  const results = page.getByRole('region', { name: 'Event search results' });
  const handle = page.getByRole('slider', {
    name: 'Event results sheet position',
  });
  await expect(sheet).toHaveAttribute('data-snap', 'peek');
  await expect(map.getByRole('button')).toHaveCount(3);
  await expect(sheet.getByRole('status')).toHaveText('12 events');
  await expect(results.getByText('11 on map / 1 online')).toBeVisible();
  await expect(
    map.getByText('Sample event areas, not venue locations /mock/app', {
      exact: true,
    })
  ).toBeVisible();
  for (const pin of await map.getByRole('button').all()) {
    const bounds = await pin.boundingBox();
    if (!bounds) throw new Error('An event pin has no rendered bounds');
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await expect(pin).toBeInViewport({ ratio: 1 });
  }
  const miamiEvents = MOCK_EVENTS.filter(
    (event) => event.mode !== 'online' && event.county === 'miami_dade'
  );
  await map
    .getByRole('button', {
      name: `Show ${miamiEvents.length} events in Miami-Dade on map`,
      exact: true,
    })
    .click();
  await expect(sheet).toHaveAttribute('data-snap', 'half');
  await expect(sheet.getByRole('status')).toHaveText(
    `${miamiEvents.length} events in Miami-Dade`
  );
  const cards = results.getByRole('button', { name: /^Preview / });
  await expect(cards).toHaveCount(miamiEvents.length);
  expect(
    await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('aria-label'))
    )
  ).toEqual(miamiEvents.map((event) => `Preview ${event.title}`));
  await expect(sheet.getByText('Show all 12', { exact: true })).toBeVisible();
  await handle.click();
  await expect(sheet).toHaveAttribute('data-snap', 'expanded');
  await expect(cards).toHaveCount(MOCK_EVENTS.length);
  expect(
    await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('aria-label'))
    )
  ).toEqual(MOCK_EVENTS.map((event) => `Preview ${event.title}`));
  await handle.press('Home');
  const search = page.getByRole('searchbox', { name: 'Search events' });
  await search.fill('online');
  await expect(sheet.getByRole('status')).toHaveText('1 event');
  await expect(map.getByRole('button')).toHaveCount(0);
  await expect(
    map.getByText('These events are online. Join from anywhere.', {
      exact: true,
    })
  ).toBeVisible();
  await expect(results.getByText('0 on map / 1 online')).toBeVisible();
  const onlineEvent = MOCK_EVENTS.find((event) => event.mode === 'online');
  if (!onlineEvent) throw new Error('The fixtures need an online event');
  await expect(
    results.getByRole('button', { name: `Preview ${onlineEvent.title}` })
  ).toBeVisible();
  await search.fill('no-such-pana-9876');
  await expect(results.getByRole('heading')).toHaveText('No matching events');
  await results.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toBeFocused();
  await expect(map.getByRole('button')).toHaveCount(3);
  await expect(sheet.getByRole('status')).toHaveText('12 events');
});

test('fits a single event preview and preserves independent map selections', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await page.evaluate(async () => document.fonts.ready);
  await page
    .getByRole('button', { name: 'Select Barrio Arts Lab on map' })
    .click();
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  await chooseSearchScope(page, 'events');
  const event = MOCK_EVENTS.find((entry) => entry.county === 'broward');
  if (!event) throw new Error('The fixtures need a Broward event');
  const pin = page.getByRole('button', {
    name: `Select ${event.title} on map`,
    exact: true,
  });
  await pin.click();
  await expectDirectoryCardRevealed(page, event.title, 'events');
  const card = page.getByRole('button', {
    name: `Preview ${event.title}`,
    exact: true,
  });
  await expect(card).toHaveAccessibleDescription(
    `${event.when} / ${event.where}`
  );
  await expect(card).toContainText(event.when);
  await card.click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: event.title })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeFocused();
  await expectDirectoryCardRevealed(page, event.title, 'events');
  await chooseSearchScope(page, 'directory');
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  await chooseSearchScope(page, 'groups');
  await chooseSearchScope(page, 'events');
  await expectDirectoryCardRevealed(page, event.title, 'events');
  await page.getByRole('tab', { name: 'Social', exact: true }).click();
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await expectDirectoryCardRevealed(page, event.title, 'events');
  await chooseSearchScope(page, 'groups');
  await page
    .getByRole('searchbox', { name: 'Search groups' })
    .fill('risograph');
  await chooseSearchScope(page, 'events');
  await expect(
    page.getByRole('region', { name: 'Event results', exact: true })
  ).toHaveAttribute('data-snap', 'half');
  const results = page.getByRole('region', { name: 'Event search results' });
  await expect(results).toHaveAttribute('data-preview', 'false');
  await expect(results.getByRole('button', { name: /^Preview / })).toHaveCount(
    1
  );
  await expect(
    results.getByRole('button', { name: /^Preview / })
  ).toHaveAccessibleName('Preview Risograph Open Studio');
});

test('preserves the Directory map preview across search categories and profile history', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await page.evaluate(async () => document.fonts.ready);
  const category = page.getByRole('button', {
    name: /^Search scope, currently /,
  });
  await page
    .getByRole('searchbox', { name: 'Search the directory' })
    .fill('Barrio');
  await page.getByRole('button', { name: 'Venues', exact: true }).click();
  await page
    .getByRole('button', { name: 'Select Barrio Arts Lab on map' })
    .click();
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  const sheet = page.getByRole('region', {
    name: 'Directory results',
    exact: true,
  });
  const originalBounds = await sheet.boundingBox();
  if (!originalBounds) throw new Error('The preview sheet has no bounds');
  await chooseSearchScope(page, 'events');
  await expect(
    page.getByRole('searchbox', { name: 'Search events' })
  ).toHaveValue('Barrio');
  await chooseSearchScope(page, 'groups');
  await expect(
    page.getByRole('searchbox', { name: 'Search groups' })
  ).toHaveValue('Barrio');
  await chooseSearchScope(page, 'directory');
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  await expect(sheet).toHaveAttribute('data-snap', 'preview');
  await expect
    .poll(async () => {
      const bounds = await sheet.boundingBox();
      if (!bounds) throw new Error('The restored preview sheet has no bounds');
      return Math.abs(bounds.height - originalBounds.height);
    })
    .toBeLessThan(1);
  await expect(
    page.getByRole('button', { name: 'Venues', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  const card = page.getByRole('link', {
    name: 'View Barrio Arts Lab',
    exact: true,
  });
  await card.click();
  await expect(page).toHaveURL(/#directory\/b2$/);
  await page.goBack();
  await expect(card).toBeFocused();
  await chooseSearchScope(page, 'events');
  await page.getByRole('searchbox', { name: 'Search events' }).fill('clay');
  await page.goForward();
  await expect(
    page.getByRole('region', { name: 'Barrio Arts Lab directory profile' })
  ).toBeVisible();
  await page.goBack();
  await expect(category).toHaveAccessibleName(
    'Search scope, currently Directory'
  );
  await expect(
    page.getByRole('searchbox', { name: 'Search the directory' })
  ).toHaveValue('Barrio');
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  await expect(card).toBeFocused();
});

test('applies a changed cross-category search to Directory without a stale card preview', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await page
    .getByRole('button', { name: 'Select Barrio Arts Lab on map' })
    .click();
  await chooseSearchScope(page, 'events');
  await page
    .getByRole('searchbox', { name: 'Search events' })
    .fill('  LUCIA   little  ');
  await chooseSearchScope(page, 'directory');
  await expect(page.getByRole('status')).toHaveText('1 local find');
  const listings = page.getByRole('region', {
    name: 'Directory listings',
    exact: true,
  });
  await expect(listings.getByRole('link')).toHaveCount(1);
  await expect(listings.getByRole('link')).toHaveAccessibleName(
    'View Taller Lucía'
  );
  const sheet = page.getByRole('region', {
    name: 'Directory results',
    exact: true,
  });
  await expect(sheet).toHaveAttribute('data-snap', 'half');
  await page
    .getByRole('button', { name: 'Select Taller Lucía on map' })
    .click();
  await expectDirectoryCardRevealed(page, 'Taller Lucía');
  await chooseSearchScope(page, 'groups');
  await page
    .getByRole('searchbox', { name: 'Search groups' })
    .fill('no-such-pana-9876');
  await chooseSearchScope(page, 'directory');
  await expect(sheet).toHaveAttribute('data-snap', 'half');
  await expect(page.getByRole('status')).toHaveText('0 local finds');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('status')).toHaveText('4 local finds');
  await expect(
    page.getByRole('searchbox', { name: 'Search the directory' })
  ).toHaveValue('');
});

test('retains search-list scrolling across categories, tabs, and detail previews', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await page.evaluate(async () => document.fonts.ready);
  const category = page.getByRole('button', {
    name: /^Search scope, currently /,
  });
  await chooseSearchScope(page, 'events');
  const events = page.getByRole('region', { name: 'Event search results' });
  const handle = page.getByRole('slider', {
    name: 'Event results sheet position',
  });
  await handle.focus();
  await handle.press('End');
  await events.evaluate((element) => {
    element.scrollTop = 180;
  });
  const eventScroll = await events.evaluate((element) => element.scrollTop);
  expect(eventScroll).toBeGreaterThan(0);
  await chooseSearchScope(page, 'groups');
  const groups = page.getByRole('region', { name: 'Group search results' });
  const group = MOCK_GROUPS[MOCK_GROUPS.length - 1];
  const card = groups.getByRole('button', {
    name: `Preview ${group.name}`,
    exact: true,
  });
  await card.scrollIntoViewIfNeeded();
  const groupScroll = await groups.evaluate((element) => element.scrollTop);
  expect(groupScroll).toBeGreaterThan(0);
  await card.click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: group.name })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeFocused();
  await expect
    .poll(() => groups.evaluate((element) => element.scrollTop))
    .toBe(groupScroll);
  await page.getByRole('tab', { name: 'Social', exact: true }).click();
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await expect(category).toHaveAccessibleName('Search scope, currently Groups');
  await expect
    .poll(() => groups.evaluate((element) => element.scrollTop))
    .toBe(groupScroll);
  await chooseSearchScope(page, 'events');
  await expect
    .poll(() => events.evaluate((element) => element.scrollTop))
    .toBe(eventScroll);
  await page
    .getByRole('searchbox', { name: 'Search events' })
    .fill('no-such-pana-9876');
  await expect
    .poll(() => events.evaluate((element) => element.scrollTop))
    .toBe(0);
  await events.getByRole('button', { name: 'Clear search' }).click();
  await expect(events.getByRole('button', { name: /^Preview / })).toHaveCount(
    MOCK_EVENTS.length
  );
  await expect
    .poll(() => events.evaluate((element) => element.scrollTop))
    .toBe(0);
});

test('supports keyboard category selection, searching, and result previews', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const category = page.getByRole('button', {
    name: /^Search scope, currently /,
  });
  await category.focus();
  await category.press('ArrowDown');
  const menu = page.getByRole('menu', { name: 'Search scope' });
  await expect(
    menu.getByRole('menuitem', { name: /^Directory\b/ })
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: /^Events\b/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(category).toHaveAccessibleName('Search scope, currently Events');
  await expect(category).toBeFocused();
  await expect(category).toHaveCSS('outline-width', '3px');
  await page.keyboard.press('Tab');
  const search = page.getByRole('searchbox', { name: 'Search events' });
  await expect(search).toBeFocused();
  await search.fill('risograph');
  await page.keyboard.press('Tab');
  const pin = page.getByRole('button', {
    name: 'Select Risograph Open Studio on map',
  });
  await expect(pin).toBeFocused();
  await pin.press('Enter');
  await expectDirectoryCardRevealed(page, 'Risograph Open Studio', 'events');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('slider', { name: 'Event results sheet position' })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  const results = page.getByRole('region', { name: 'Event search results' });
  await expect(results).toBeFocused();
  await page.keyboard.press('Tab');
  const card = results.getByRole('button', { name: /^Preview / }).first();
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeFocused();
  await expect(search).toHaveValue('risograph');

  await category.focus();
  await category.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: /^Groups\b/ })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(
    menu.getByRole('menuitem', { name: /^Directory\b/ })
  ).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: /^Groups\b/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    menu.getByRole('menuitem', { name: /^Directory\b/ })
  ).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: /^Groups\b/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(category).toBeFocused();
  await category.press('Enter');
  await expect(menu.getByRole('menuitem', { name: /^Events\b/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCount(0);
  await category.click();
  await expect(menu).toBeVisible();
  await search.click();
  await expect(menu).toHaveCount(0);
  await expect(search).toBeFocused();
});

for (const viewport of [
  { width: 320, height: 740 },
  { width: 844, height: 390 },
  { width: 1440, height: 1000 },
]) {
  test(`keeps category search and result lists usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.getByRole('tab', { name: 'Directory', exact: true }).click();
    const category = page.getByRole('button', {
      name: /^Search scope, currently /,
    });
    const navigation = page.getByRole('navigation', { name: 'App navigation' });
    for (const scope of ['events', 'groups'] as const) {
      await chooseSearchScope(page, scope);
      const search = page.getByRole('searchbox', {
        name: scope === 'events' ? 'Search events' : 'Search groups',
      });
      const results = page.getByRole('region', {
        name:
          scope === 'events' ? 'Event search results' : 'Group search results',
      });
      for (const control of [category, search]) {
        await expect(control).toBeInViewport({ ratio: 1 });
        const bounds = await control.boundingBox();
        if (!bounds) throw new Error('A search control has no rendered bounds');
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
      const bounds = await results.boundingBox();
      const navBounds = await navigation.boundingBox();
      if (!bounds || !navBounds) {
        throw new Error('The search list or app navigation has no bounds');
      }
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(navBounds.y + 1);
      await expect(
        results.getByRole('button', { name: /^Preview / }).first()
      ).toBeVisible();
      await expect(navigation).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        )
      ).toBe(false);
      await category.click();
      const menu = page.getByRole('menu', { name: 'Search scope' });
      await expect(menu.locator('[data-current="true"]')).toBeFocused();
      await page.keyboard.press('End');
      const groupOption = menu.getByRole('menuitem', { name: /^Groups\b/ });
      await expect(groupOption).toBeFocused();
      await expect(groupOption).toBeInViewport({ ratio: 1 });
      const menuBounds = await menu.boundingBox();
      if (!menuBounds) throw new Error('The category menu has no bounds');
      expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(navBounds.y);
      await page.keyboard.press('Escape');
      await expect(category).toBeFocused();
    }
  });
}

test('opens the directory on a map with a compact results sheet', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const map = page.getByRole('group', {
    name: 'Illustrative South Florida map',
    exact: true,
  });
  const results = page.getByRole('region', {
    name: 'Directory results',
    exact: true,
  });
  const handle = page.getByRole('slider', { name: 'Results sheet position' });
  await expect(map).toBeVisible();
  await expect(map.getByRole('button')).toHaveCount(3);
  await expect(handle).toHaveAttribute('aria-valuenow', '0');
  await expect(handle).toHaveAttribute('aria-valuetext', 'Map view');
  await expect(handle).toHaveCSS('touch-action', 'none');
  await expect(results).toHaveAttribute('data-snap', 'peek');
  await expect(page.getByRole('status')).toHaveText('4 local finds');
  await expect(
    results.getByText('3 on map / 1 without a storefront', { exact: true })
  ).toBeVisible();
  await expect
    .poll(async () => {
      const mapBounds = await map.boundingBox();
      const sheetBounds = await results.boundingBox();
      if (!mapBounds || !sheetBounds) {
        throw new Error('The directory map or sheet has no rendered bounds');
      }
      return mapBounds.height / sheetBounds.height;
    })
    .toBeGreaterThan(1.5);
  const handleBounds = await handle.boundingBox();
  if (!handleBounds) throw new Error('The results handle has no bounds');
  expect(handleBounds.width).toBeGreaterThanOrEqual(44);
  expect(handleBounds.height).toBeGreaterThanOrEqual(44);
  for (const pin of await map.getByRole('button').all()) {
    const bounds = await pin.boundingBox();
    if (!bounds) throw new Error('A directory pin has no rendered bounds');
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await expect(pin).toBeInViewport({ ratio: 1 });
  }
});

test('links map selection to cards and retains the expanded list across tabs', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const pin = page.getByRole('button', {
    name: 'Select Barrio Arts Lab on map',
    exact: true,
  });
  const handle = page.getByRole('slider', { name: 'Results sheet position' });
  const listings = page.getByRole('region', {
    name: 'Directory listings',
    exact: true,
  });
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await expect(handle).toHaveAttribute('aria-valuenow', '1');
  await expect(listings.getByRole('link')).toHaveCount(1);
  await expect(listings.getByRole('link')).toHaveAccessibleName(
    'View Barrio Arts Lab'
  );
  const card = listings.getByRole('link', {
    name: 'View Barrio Arts Lab',
    exact: true,
  });
  await expect(card).toHaveAttribute('data-selected', 'true');
  await expect(card).toHaveAttribute('href', '#directory/b2');
  await card.click();
  const profile = page.getByRole('region', {
    name: 'Barrio Arts Lab directory profile',
    exact: true,
  });
  await expect(profile).toBeVisible();
  await expect(page).toHaveURL(/#directory\/b2$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    profile.getByRole('heading', {
      name: 'Barrio Arts Lab',
      exact: true,
    })
  ).toBeFocused();
  await page.goBack();
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  await expect(card).toBeFocused();
  await page.goForward();
  await expect(profile).toBeVisible();
  await profile.getByRole('button', { name: 'Back to directory' }).click();
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  await expect(card).toBeFocused();
  await handle.focus();
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '2');
  await expect(
    page.getByRole('group', { name: 'Illustrative South Florida map' })
  ).toHaveCount(0);
  await expect(listings.getByRole('link')).toHaveCount(4);
  await page.getByRole('tab', { name: 'Social', exact: true }).click();
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await expect(handle).toHaveAttribute('aria-valuenow', '2');
  await expect(card).toHaveAttribute('data-selected', 'true');
  await handle.click();
  await expect(handle).toHaveAttribute('aria-valuenow', '0');
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
});

test('scrolls each selected map card fully into view without reordering results', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const handle = page.getByRole('slider', { name: 'Results sheet position' });
  const listings = page.getByRole('region', {
    name: 'Directory listings',
    exact: true,
  });
  const panel = page.getByRole('tabpanel', {
    name: 'Directory',
    exact: true,
  });
  for (const [width, height] of [
    [320, 568],
    [390, 600],
    [390, 844],
    [1280, 980],
  ]) {
    await page.setViewportSize({ width, height });
    for (const name of [
      'Taller Lucía',
      'Barrio Arts Lab',
      'El Fogón Food Truck',
    ]) {
      await handle.focus();
      await page.keyboard.press('Home');
      await page
        .getByRole('button', { name: `Select ${name} on map`, exact: true })
        .click();
      await expectDirectoryCardRevealed(page, name);
      await handle.focus();
      await page.keyboard.press('End');
      await expect(listings).toHaveAttribute('data-preview', 'false');
      expect(
        await listings
          .getByRole('link')
          .evaluateAll((buttons) =>
            buttons.map((button) => button.getAttribute('aria-label'))
          )
      ).toEqual([
        'View El Fogón Food Truck',
        'View Barrio Arts Lab',
        'View Taller Lucía',
        'View Sello Press',
      ]);
      if (name !== 'El Fogón Food Truck') {
        await expect
          .poll(() => listings.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(0);
      }
      expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);
      expect(
        await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)
      ).toBe(0);
    }
  }
});

test('reveals the same pin again after scrolling away with either motion preference', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const pin = page.getByRole('button', {
    name: 'Select Taller Lucía on map',
    exact: true,
  });
  const listings = page.getByRole('region', {
    name: 'Directory listings',
    exact: true,
  });
  const handle = page.getByRole('slider', { name: 'Results sheet position' });
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    await pin.click();
    await expectDirectoryCardRevealed(page, 'Taller Lucía');
    await handle.focus();
    await page.keyboard.press('Home');
    await listings.evaluate((element) => {
      element.scrollTop = 0;
    });
    await pin.click();
    await expectDirectoryCardRevealed(page, 'Taller Lucía');
  }
});

test('keeps a taller selected card visible after returning from its profile', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const card = page.getByRole('link', {
    name: 'View Barrio Arts Lab',
    exact: true,
  });
  await card.evaluate((element) => {
    element.style.minHeight = '280px';
  });
  await page
    .getByRole('button', { name: 'Select Barrio Arts Lab on map', exact: true })
    .click();
  await expect(
    page.getByRole('slider', { name: 'Results sheet position' })
  ).toHaveAttribute('aria-valuetext', 'Selected place preview');
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  await card.click();
  const profile = page.getByRole('region', {
    name: 'Barrio Arts Lab directory profile',
    exact: true,
  });
  await expect(profile).toBeVisible();
  await profile.getByRole('button', { name: 'Back to directory' }).click();
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  await expect(card).toBeFocused();
});

test('opens the matching full profile from every directory card', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search the directory' });
  const navigation = page.getByRole('navigation', { name: 'App navigation' });
  const handle = page.getByRole('slider', { name: 'Results sheet position' });
  for (const [id, name, location] of [
    ['b1', 'El Fogón Food Truck', 'Coral Springs'],
    ['b2', 'Barrio Arts Lab', 'Delray Beach'],
    ['b3', 'Taller Lucía', 'Little Haiti'],
    ['b4', 'Sello Press', 'Online · ships from Hialeah'],
  ]) {
    await search.fill(name);
    const card = page.getByRole('link', { name: `View ${name}`, exact: true });
    await expect(card).toHaveAttribute('href', `#directory/${id}`);
    await card.focus();
    await page.keyboard.press('Enter');
    const profile = page.getByRole('region', {
      name: `${name} directory profile`,
      exact: true,
    });
    await expect(profile).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#directory/${id}$`));
    await expect(
      profile.getByRole('heading', { name, exact: true })
    ).toBeFocused();
    await expect(profile.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(profile.getByText(location, { exact: true })).toBeVisible();
    await expect(
      profile.getByRole('list', { name: 'Business categories' })
    ).toBeVisible();
    await expect(navigation).toBeInViewport({ ratio: 1 });
    await expect(
      navigation.getByRole('tab', { name: 'Directory', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (id === 'b1') {
      await expect(profile.getByText('Pana Certified')).toBeVisible();
      await expect(profile.getByText('Tonight at Green Market')).toBeVisible();
    }
    if (id === 'b3' || id === 'b4') {
      await expect(profile.getByText('No cover photo yet')).toBeVisible();
    }
    await profile.getByRole('button', { name: 'Back to directory' }).click();
    await expect(search).toHaveValue(name);
    await expect(handle).toHaveAttribute('aria-valuenow', '1');
    await expect(card).toBeFocused();
    await expect(card).toBeInViewport({ ratio: 1 });
  }
});

test('retains the profile across tabs and restores the filtered map on Back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search the directory' });
  await search.fill('Arts');
  await page.getByRole('button', { name: 'Services', exact: true }).click();
  await page
    .getByRole('button', { name: 'Select Barrio Arts Lab on map', exact: true })
    .click();
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  const card = page.getByRole('link', {
    name: 'View Barrio Arts Lab',
    exact: true,
  });
  await card.click();
  const profile = page.getByRole('region', {
    name: 'Barrio Arts Lab directory profile',
    exact: true,
  });
  await expect(profile).toBeVisible();
  await profile.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const scrollTop = await profile.evaluate((element) => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  const back = profile.getByRole('button', { name: 'Back to directory' });
  await expect(back).toBeInViewport({ ratio: 1 });
  const bounds = await back.boundingBox();
  if (!bounds) throw new Error('The profile Back button has no bounds');
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await expect(profile).toBeVisible();
  expect(await profile.evaluate((element) => element.scrollTop)).toBe(
    scrollTop
  );
  await back.click();
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  await expect(search).toHaveValue('Arts');
  await expect(
    page.getByRole('button', { name: 'Services', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toBeFocused();
  expect(
    await page
      .getByRole('tabpanel', { name: 'Directory', exact: true })
      .evaluate((element) => element.scrollTop)
  ).toBe(0);
  expect(
    await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)
  ).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});

test('preserves the full results sheet and its exact scroll position on return', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const handle = page.getByRole('slider', { name: 'Results sheet position' });
  await handle.focus();
  await page.keyboard.press('End');
  await expect
    .poll(async () => {
      const sheet = await page
        .getByRole('region', { name: 'Directory results', exact: true })
        .boundingBox();
      const area = await page
        .getByRole('region', { name: 'Directory map and results', exact: true })
        .boundingBox();
      if (!sheet || !area) throw new Error('The expanded list has no bounds');
      return Math.abs(sheet.height - area.height);
    })
    .toBeLessThanOrEqual(1);
  const listings = page.getByRole('region', {
    name: 'Directory listings',
    exact: true,
  });
  await listings.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const scrollTop = await listings.evaluate((element) => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  const card = listings.getByRole('link', {
    name: 'View Sello Press',
    exact: true,
  });
  await expect(card).toBeInViewport({ ratio: 1 });
  await card.click();
  await expect(
    page.getByRole('region', {
      name: 'Sello Press directory profile',
      exact: true,
    })
  ).toBeVisible();
  await page.goBack();
  await expect(handle).toHaveAttribute('aria-valuenow', '2');
  await expect(listings).toHaveAttribute('data-preview', 'false');
  await expect(listings.getByRole('link')).toHaveCount(4);
  await expect
    .poll(() => listings.evaluate((element) => element.scrollTop))
    .toBe(scrollTop);
  await expect(card).toHaveAttribute('data-selected', 'true');
  await expect(card).toBeFocused();
});

test('opens a sample profile directly and returns to its selected map card', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/mock/app#directory/b3');
  await page.reload();
  const profile = page.getByRole('region', {
    name: 'Taller Lucía directory profile',
    exact: true,
  });
  await expect(profile).toBeVisible();
  await expect(
    profile.getByRole('heading', { name: 'Taller Lucía', exact: true })
  ).toBeFocused();
  await profile.getByRole('button', { name: 'Back to directory' }).click();
  await expect(page).toHaveURL(/#directory$/);
  await expectDirectoryCardRevealed(page, 'Taller Lucía');
  await expect(
    page.getByRole('link', { name: 'View Taller Lucía', exact: true })
  ).toBeFocused();
  expect(errors).toEqual([]);
});

test('shows an explicit missing profile screen for unknown sample links', async ({
  page,
}) => {
  await page.goto('/mock/app#directory/missing');
  const profile = page.getByRole('region', {
    name: 'Directory profile',
    exact: true,
  });
  await expect(
    profile.getByRole('heading', { name: 'Profile not found' })
  ).toBeFocused();
  await expect(profile).toContainText(
    "That sample profile isn't part of this preview."
  );
  await profile.getByRole('button', { name: 'Back to directory' }).click();
  await expect(page.getByRole('status')).toHaveText('4 local finds');
  await expect(
    page.getByRole('region', { name: 'Directory listings', exact: true })
  ).toBeFocused();
});

test('opens the full ordered list when a single-card preview is pulled up', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await page
    .getByRole('button', { name: 'Select Barrio Arts Lab on map', exact: true })
    .click();
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  await expect(page.getByRole('status')).toHaveText('Selected place');
  await page.getByRole('tab', { name: 'Social', exact: true }).click();
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  const listings = page.getByRole('region', {
    name: 'Directory listings',
    exact: true,
  });
  const explorer = await page
    .getByRole('region', { name: 'Directory map and results', exact: true })
    .boundingBox();
  const results = await page
    .getByRole('region', { name: 'Directory results', exact: true })
    .boundingBox();
  const handle = page.getByRole('slider', { name: 'Results sheet position' });
  const grip = await handle.boundingBox();
  if (!explorer || !results || !grip) {
    throw new Error('The preview cannot be dragged without bounds');
  }
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - (explorer.height * 0.6 - results.height), {
    steps: 10,
  });
  await page.mouse.up();
  await expect(listings).toHaveAttribute('data-preview', 'false');
  await expect(listings.getByRole('link')).toHaveCount(4);
  await expect(page.getByRole('status')).toHaveText('4 local finds');
  await expect(
    listings.getByRole('link', { name: 'View Barrio Arts Lab', exact: true })
  ).toBeInViewport({ ratio: 1 });
  expect(
    await listings
      .getByRole('link')
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute('aria-label'))
      )
  ).toEqual([
    'View El Fogón Food Truck',
    'View Barrio Arts Lab',
    'View Taller Lucía',
    'View Sello Press',
  ]);
  await page
    .getByRole('button', { name: 'Select Taller Lucía on map', exact: true })
    .click();
  await expectDirectoryCardRevealed(page, 'Taller Lucía');
  await handle.click();
  await expect(handle).toHaveAttribute('aria-valuenow', '2');
  await expect(listings.getByRole('link')).toHaveCount(4);
});

test('fits a filtered single result and clears the preview when filters change', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search the directory' });
  const handle = page.getByRole('slider', { name: 'Results sheet position' });
  const listings = page.getByRole('region', {
    name: 'Directory listings',
    exact: true,
  });
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    await handle.focus();
    await page.keyboard.press('Home');
    await search.fill('Barrio');
    await page
      .getByRole('button', {
        name: 'Select Barrio Arts Lab on map',
        exact: true,
      })
      .click();
    await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
    await search.fill('');
    await expect(listings).toHaveAttribute('data-preview', 'false');
    await expect(listings.getByRole('link')).toHaveCount(4);
    await expect(page.getByRole('status')).toHaveText('4 local finds');
    await expect
      .poll(() => listings.evaluate((element) => element.scrollTop))
      .toBe(0);
  }
  await page
    .getByRole('button', { name: 'Select Barrio Arts Lab on map', exact: true })
    .click();
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(listings).toHaveAttribute('data-preview', 'false');
  await expect(listings.getByRole('link')).toHaveCount(4);
});

test('snaps the results sheet by dragging and keyboard without covering navigation', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const explorer = page.getByRole('region', {
    name: 'Directory map and results',
    exact: true,
  });
  const results = page.getByRole('region', {
    name: 'Directory results',
    exact: true,
  });
  const handle = page.getByRole('slider', { name: 'Results sheet position' });
  const navigation = page.getByRole('navigation', { name: 'App navigation' });

  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1280, 980],
  ]) {
    await page.setViewportSize({ width, height });
    await handle.focus();
    await page.keyboard.press('Home');
    await expect(handle).toHaveAttribute('aria-valuenow', '0');
    await expect
      .poll(async () => {
        const bounds = await explorer.boundingBox();
        const current = await results.boundingBox();
        if (!bounds || !current) throw new Error('No directory sheet bounds');
        return Math.abs(
          current.height - Math.min(184, Math.max(64, bounds.height * 0.4))
        );
      })
      .toBeLessThanOrEqual(1);
    const area = await explorer.boundingBox();
    const before = await results.boundingBox();
    const grip = await handle.boundingBox();
    if (!area || !before || !grip) {
      throw new Error('The results sheet cannot be dragged without bounds');
    }
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - (area.height * 0.6 - before.height), {
      steps: 10,
    });
    await page.mouse.up();
    await expect(handle).toHaveAttribute('aria-valuenow', '1');
    await expect
      .poll(async () => {
        const current = await results.boundingBox();
        if (!current) throw new Error('The dragged sheet has no bounds');
        return Math.abs(current.height - area.height * 0.6);
      })
      .toBeLessThanOrEqual(1);

    await handle.focus();
    await page.keyboard.press('End');
    await expect(handle).toHaveAttribute('aria-valuenow', '2');
    await expect
      .poll(async () => {
        const current = await results.boundingBox();
        if (!current) throw new Error('The expanded sheet has no bounds');
        return Math.abs(current.height - area.height);
      })
      .toBeLessThanOrEqual(1);
    const expanded = await results.boundingBox();
    const nav = await navigation.boundingBox();
    if (!expanded || !nav) throw new Error('The sheet or tabs have no bounds');
    expect(expanded.y + expanded.height).toBeLessThanOrEqual(nav.y + 1);
    await expect(navigation).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('ArrowDown');
    await expect(handle).toHaveAttribute('aria-valuenow', '1');
    await page.keyboard.press('ArrowDown');
    await expect(handle).toHaveAttribute('aria-valuenow', '0');
    await page.keyboard.press('ArrowUp');
    await expect(handle).toHaveAttribute('aria-valuenow', '1');
    await page.keyboard.press('Escape');
    await expect(handle).toHaveAttribute('aria-valuenow', '0');
    await page.keyboard.press('Enter');
    await expect(handle).toHaveAttribute('aria-valuenow', '2');
    await page.keyboard.press('Enter');
    await expect(handle).toHaveAttribute('aria-valuenow', '0');
  }
});

test('keeps the directory list reachable in a short landscape preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await expect(
    page.getByRole('searchbox', { name: 'Search the directory' })
  ).toBeInViewport({ ratio: 1 });
  const handle = page.getByRole('slider', { name: 'Results sheet position' });
  const listings = page.getByRole('region', {
    name: 'Directory listings',
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '2');
  await expect(handle).toBeInViewport({ ratio: 1 });
  await expect(listings).toBeInViewport({ ratio: 1 });
  await expect
    .poll(async () => (await listings.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(13);
  await listings.focus();
  await page.keyboard.press('End');
  await expect
    .poll(() => listings.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(
    page.getByRole('navigation', { name: 'App navigation' })
  ).toBeInViewport({ ratio: 1 });
});

test('keeps online-only finds discoverable without a fake pin or live writes', async ({
  page,
}) => {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      writes.push(request.url());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search the directory' });
  const map = page.getByRole('group', {
    name: 'Illustrative South Florida map',
    exact: true,
  });
  await search.fill('Sello');
  await expect(page.getByRole('status')).toHaveText('1 local find');
  await expect(map.getByRole('button')).toHaveCount(0);
  await expect(
    page.getByText('0 on map / 1 without a storefront')
  ).toBeVisible();
  await page.getByRole('link', { name: 'View Sello Press' }).click();
  const profile = page.getByRole('region', {
    name: 'Sello Press directory profile',
    exact: true,
  });
  await expect(profile).toContainText('No storefront and no pickup');
  await expect(profile).toContainText('No storefront is shown on the map.');
  await profile.getByRole('button', { name: 'Back to directory' }).click();
  await search.fill('');
  await page.getByRole('button', { name: 'Art', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('2 local finds');
  await expect(map.getByRole('button')).toHaveCount(1);
  await expect(
    page.getByRole('link', { name: 'View Sello Press' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View Taller Lucía' })
  ).toBeVisible();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe('touch directory sheet', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('uses the branded picker and fitted event previews with native taps', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.getByRole('tab', { name: 'Directory', exact: true }).tap();
    await chooseSearchScope(page, 'events', 'tap');
    await page
      .getByRole('button', { name: /^Show \d+ events in Miami-Dade on map$/ })
      .tap();
    await expect(
      page
        .getByRole('region', { name: 'Event results', exact: true })
        .getByRole('status')
    ).toHaveText('9 events in Miami-Dade');
    await page
      .getByRole('button', { name: 'Select Risograph Open Studio on map' })
      .tap();
    await expectDirectoryCardRevealed(page, 'Risograph Open Studio', 'events');
    await page
      .getByRole('button', {
        name: 'Preview Risograph Open Studio',
        exact: true,
      })
      .tap();
    await expect(
      page.getByRole('dialog').getByRole('heading', {
        name: 'Risograph Open Studio',
        exact: true,
      })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).tap();
    await expectDirectoryCardRevealed(page, 'Risograph Open Studio', 'events');
    await page
      .getByRole('slider', { name: 'Event results sheet position' })
      .tap();
    await expect(
      page.getByRole('region', { name: 'Event results', exact: true })
    ).toHaveAttribute('data-snap', 'expanded');
    await chooseSearchScope(page, 'groups', 'tap');
    await expect(
      page.getByRole('region', { name: 'Group search results' })
    ).toBeVisible();
  });

  test('reveals a tapped map card completely on a smaller phone', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.getByRole('tab', { name: 'Directory', exact: true }).tap();
    await page
      .getByRole('button', { name: 'Select Taller Lucía on map', exact: true })
      .tap();
    await expect(
      page.getByRole('slider', { name: 'Results sheet position' })
    ).toHaveAttribute('aria-valuetext', 'Selected place preview');
    await expectDirectoryCardRevealed(page, 'Taller Lucía');
    await page
      .getByRole('link', { name: 'View Taller Lucía', exact: true })
      .tap();
    const profile = page.getByRole('region', {
      name: 'Taller Lucía directory profile',
      exact: true,
    });
    await expect(profile).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'App navigation' })
    ).toBeInViewport({ ratio: 1 });
    await profile.getByRole('button', { name: 'Back to directory' }).tap();
    await expectDirectoryCardRevealed(page, 'Taller Lucía');
  });

  test('supports native touch dragging, cancellation, and independent list scrolling', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Native touch injection uses CDP.');
    await page.getByRole('tab', { name: 'Directory', exact: true }).click();
    const handle = page.getByRole('slider', { name: 'Results sheet position' });
    const explorer = page.getByRole('region', {
      name: 'Directory map and results',
      exact: true,
    });
    const results = page.getByRole('region', {
      name: 'Directory results',
      exact: true,
    });
    const listings = page.getByRole('region', {
      name: 'Directory listings',
      exact: true,
    });
    const area = await explorer.boundingBox();
    const before = await results.boundingBox();
    const grip = await handle.boundingBox();
    if (!area || !before || !grip) throw new Error('No touch sheet bounds');
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    const distance = area.height * 0.6 - before.height;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y - (distance * step) / 10 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(handle).toHaveAttribute('aria-valuenow', '1');

    await handle.focus();
    await page.keyboard.press('Home');
    await expect
      .poll(async () => {
        const current = await results.boundingBox();
        if (!current) throw new Error('The collapsed sheet has no bounds');
        return Math.abs(current.height - before.height);
      })
      .toBeLessThanOrEqual(1);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - distance }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    });
    await expect(handle).toHaveAttribute('aria-valuenow', '0');
    await expect
      .poll(async () => {
        const current = await results.boundingBox();
        if (!current) throw new Error('The cancelled sheet has no bounds');
        return Math.abs(current.height - before.height);
      })
      .toBeLessThanOrEqual(1);

    await handle.focus();
    await page.keyboard.press('End');
    await expect(handle).toHaveAttribute('aria-valuenow', '2');
    await expect
      .poll(async () => {
        const current = await results.boundingBox();
        if (!current) throw new Error('The full sheet has no bounds');
        return Math.abs(current.height - area.height);
      })
      .toBeLessThanOrEqual(1);
    const bounds = await listings.boundingBox();
    if (!bounds) throw new Error('The scrollable list has no bounds');
    const startY = bounds.y + bounds.height - 20;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: startY }],
    });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: startY - (150 * step) / 10 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(() => listings.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect(handle).toHaveAttribute('aria-valuenow', '2');
    await expect(
      page.getByRole('navigation', { name: 'App navigation' })
    ).toBeInViewport({ ratio: 1 });
    await handle.focus();
    await page.keyboard.press('Home');
    await page
      .getByRole('button', {
        name: 'Select Barrio Arts Lab on map',
        exact: true,
      })
      .tap();
    await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
    const previewGrip = await handle.boundingBox();
    if (!previewGrip) throw new Error('The selected preview has no handle');
    const previewY = previewGrip.y + previewGrip.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: previewY }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: previewY - 100 }],
    });
    await expect(listings.getByRole('link')).toHaveCount(4);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    });
    await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
    await cdp.detach();
  });
});

test('opens Community on joined groups and upcoming plans rather than discovery', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  const views = page.getByRole('group', { name: 'Community views' });
  await expect(views.getByRole('button')).toHaveCount(2);
  await expect(
    views.getByRole('button', { name: 'Yours', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  const groups = page.getByRole('region', { name: 'Your groups', exact: true });
  await expect(groups.getByRole('button', { name: /^Preview / })).toHaveCount(
    2
  );
  for (const avatar of await groups.locator('[data-kind="groups"]').all()) {
    const bounds = await avatar.boundingBox();
    if (!bounds) throw new Error('A joined group avatar has no bounds');
    expect(bounds.width).toBe(48);
    expect(bounds.height).toBe(48);
    await expect(avatar).toHaveCSS('border-radius', '50%');
  }
  await expect(groups.getByText('31 posts this week')).toBeVisible();
  await expect(groups.getByText('14 posts this week')).toBeVisible();
  await expect(groups.getByText('Little Haiti Tenant Union')).toHaveCount(0);
  const plans = page.getByRole('region', { name: 'Your plans', exact: true });
  await expect(
    plans.getByText('Little Haiti Night Market', { exact: true })
  ).toBeVisible();
  await expect(
    plans.getByText('Screenprint Your Own Tote', { exact: true })
  ).toBeVisible();
  await expect(plans.getByText('Going', { exact: true })).toBeVisible();
  await expect(plans.getByText('Interested', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Saved events (0)', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Discover recommendations' })
  ).toHaveCount(0);
  await page.getByRole('tab', { name: 'Social', exact: true }).click();
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await expect(
    views.getByRole('button', { name: 'Yours', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
});

test('links the avatar to the existing profile without replacing the preview', async ({
  page,
  context,
}) => {
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await page
    .getByRole('button', { name: 'View plans (2)', exact: true })
    .click();
  const profile = page
    .getByRole('navigation', { name: 'App navigation' })
    .getByRole('link', { name: /^Profile: @nochillnerd/ });
  await expect(profile).toHaveAttribute('target', '_blank');
  await expect(profile).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(profile.locator('img')).toHaveAttribute(
    'src',
    /profile\/nochillnerd\//
  );
  await context.route('https://panamia.club/p/nochillnerd', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>Existing profile destination</title>',
    })
  );
  const opened = page.waitForEvent('popup');
  await profile.click();
  const destination = await opened;
  await expect(destination).toHaveURL('https://panamia.club/p/nochillnerd');
  await destination.close();
  await expect(page).toHaveURL(/\/mock\/app$/);
  await expect(
    page.getByRole('button', { name: 'Your plans (2)', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Back to Yours' })
  ).toBeVisible();
});

test('combines explained event, group, and place picks with full browsing', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  const views = page.getByRole('group', { name: 'Community views' });
  await views.getByRole('button', { name: 'Discover', exact: true }).click();
  const forYou = page.getByRole('region', {
    name: 'Discover recommendations',
    exact: true,
  });
  await expect(forYou.getByText('Based on sample activity')).toBeVisible();
  const events = forYou.getByRole('region', { name: 'Event picks' });
  const groups = forYou.getByRole('region', { name: 'Group picks' });
  const places = forYou.getByRole('region', { name: 'Place picks' });
  const eventCards = events.getByRole('button').filter({
    has: page.locator('strong'),
  });
  const groupCards = groups.getByRole('button').filter({
    has: page.locator('strong'),
  });
  await expect(eventCards).toHaveCount(8);
  await expect(groupCards).toHaveCount(2);
  await expect(places.getByRole('link')).toHaveCount(3);
  await expect(events.getByText('You follow Barrio Arts Lab')).toBeVisible();
  await expect(groups.getByText('Matches your interest in tech')).toBeVisible();
  await expect(forYou.getByText('Little Haiti Tenant Union')).toHaveCount(0);
  await expect(forYou.getByText('Miami Artist Census Organisers')).toHaveCount(
    0
  );
  const event = eventCards.first();
  const title = await event.locator('strong').innerText();
  await event.click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: title, exact: true })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(event).toBeFocused();
  await forYou.getByRole('button', { name: 'All events' }).click();
  await expect(
    page.getByRole('button', { name: 'Back to Discover' })
  ).toBeFocused();
  await expect(
    page.getByRole('region', { name: 'Community events', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'All dates', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back to Discover' }).click();
  await expect(
    forYou.getByRole('button', { name: 'All events' })
  ).toBeFocused();
  await forYou.getByRole('button', { name: 'All groups' }).click();
  await expect(
    page.getByRole('button', { name: 'Back to Discover' })
  ).toBeFocused();
  await expect(
    page.getByRole('region', { name: 'Community groups', exact: true })
  ).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: 'Group views' })
      .getByRole('button', { name: 'All groups', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back to Discover' }).click();
  await forYou.getByRole('button', { name: 'All picks' }).click();
  await expect(
    page.getByRole('button', { name: 'Back to Discover' })
  ).toBeFocused();
  const allPlaces = page.getByRole('region', {
    name: 'Community places',
    exact: true,
  });
  await expect(allPlaces.getByRole('link')).toHaveCount(3);
  await expect(
    allPlaces.getByRole('link', { name: 'View Sello Press', exact: true })
  ).toBeVisible();
  await allPlaces.getByRole('button', { name: 'Browse the directory' }).click();
  await expect(
    page.getByRole('tab', { name: 'Directory', exact: true })
  ).toBeFocused();
  await expect(
    page.getByRole('tabpanel', { name: 'Directory', exact: true })
  ).toBeVisible();
});

test('keeps Yours stacked and Discover in square sliding cards with a next-card peek', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const views = page.getByRole('group', { name: 'Community views' });
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1280, 980],
  ]) {
    await page.setViewportSize({ width, height });
    await views.getByRole('button', { name: 'Yours', exact: true }).click();
    for (const name of ['Your groups', 'Your plans']) {
      const lane = page.getByRole('region', { name, exact: true });
      const cards = lane
        .getByRole('button')
        .filter({ has: page.locator('strong') });
      const [first, second] = await cards.evaluateAll((elements) =>
        elements.map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        })
      );
      if (!first || !second)
        throw new Error('No stacked Community card bounds');
      expect(second.x).toBe(first.x);
      expect(second.width).toBe(first.width);
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
      expect(first.width).toBeGreaterThan(first.height * 1.5);
      expect(first.width).toBe(
        await lane.evaluate((element) => element.clientWidth)
      );
      await expect(
        lane.locator('[aria-roledescription="carousel"]')
      ).toHaveCount(0);
    }
    await views.getByRole('button', { name: 'Discover', exact: true }).click();
    for (const name of [
      'Recommended events',
      'Recommended groups',
      'Recommended places',
    ]) {
      const rail = page.getByRole('group', { name, exact: true });
      await rail.evaluate((element) =>
        element.scrollTo({ left: 0, behavior: 'instant' })
      );
      await rail.scrollIntoViewIfNeeded();
      const layout = await rail.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
          cards: Array.from(element.children, (card) => {
            const { x, y, width, height } = card.getBoundingClientRect();
            const info = card.querySelector('strong')?.parentElement;
            if (!info) throw new Error('A Discover card has no details');
            return {
              x,
              y,
              width,
              height,
              contentOverflow: info.scrollHeight - info.clientHeight,
            };
          }),
        };
      });
      const [first, second] = layout.cards;
      if (!first || !second) throw new Error('No Discover slide bounds');
      expect(layout.scrollWidth).toBeGreaterThan(layout.width);
      expect(first.x).toBeGreaterThanOrEqual(layout.left);
      expect(first.x + first.width).toBeLessThanOrEqual(layout.right);
      const peek = layout.right - second.x;
      expect(peek).toBeGreaterThanOrEqual(12);
      expect(peek).toBeLessThan(second.width);
      for (const card of layout.cards) {
        expect(card.y).toBe(first.y);
        expect(card.height).toBe(first.height);
        expect(Math.abs(card.height - card.width)).toBeLessThanOrEqual(1);
        expect(card.contentOverflow).toBeLessThanOrEqual(1);
      }
      await expect(
        rail.locator(':scope > button, :scope > a').first()
      ).toBeInViewport({ ratio: 1 });
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await expect(
      page.getByRole('navigation', { name: 'App navigation' })
    ).toBeInViewport({ ratio: 1 });
  }
});

test('shows useful fixture details on Discover cards without changing full-list cards', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await page
    .getByRole('group', { name: 'Community views' })
    .getByRole('button', { name: 'Discover', exact: true })
    .click();
  const eventRail = page.getByRole('group', {
    name: 'Recommended events',
    exact: true,
  });
  const planned = new Set(APP_INITIAL_RSVPS.map(({ eventId }) => eventId));
  for (const { event } of APP_EVENT_PICKS.filter(
    ({ event }) => !planned.has(event.id)
  )) {
    const card = eventRail.getByRole('button').filter({
      has: page.getByText(event.title, { exact: true }),
    });
    for (const detail of [
      event.when,
      event.where,
      event.blurb,
      `${event.going} going`,
    ]) {
      await expect(card.getByText(detail, { exact: true })).toBeVisible();
    }
  }
  const groupRail = page.getByRole('group', {
    name: 'Recommended groups',
    exact: true,
  });
  for (const { group } of APP_GROUP_PICKS.filter(
    ({ group }) => !group.joined
  )) {
    const card = groupRail.getByRole('button').filter({
      has: page.getByText(group.name, { exact: true }),
    });
    for (const detail of [
      group.summary,
      group.topics.join(' / '),
      `${group.memberCount} members`,
      `${group.postsThisWeek} posts this week`,
    ]) {
      await expect(card.getByText(detail, { exact: true })).toBeVisible();
    }
    if (group.cover) {
      await expect(card.locator('[data-kind="groups"] img')).toHaveAttribute(
        'src',
        group.cover
      );
    } else {
      await expect(card.locator('[data-kind="groups"] > svg')).toHaveCount(1);
    }
  }
  const placeRail = page.getByRole('group', {
    name: 'Recommended places',
    exact: true,
  });
  for (const { listing } of APP_PLACE_PICKS) {
    const card = placeRail.getByRole('link', {
      name: `View ${listing.name}`,
      exact: true,
    });
    for (const detail of [
      listing.tagline,
      listing.where,
      listing.categories.join(' / '),
      listing.signal,
    ]) {
      await expect(card.getByText(detail, { exact: true })).toBeVisible();
    }
    if (listing.cover === null) {
      await expect(card.locator('[data-kind="places"] > svg')).toHaveCount(1);
    }
  }
  await page.getByRole('button', { name: 'All picks', exact: true }).click();
  const places = page.getByRole('region', {
    name: 'Community places',
    exact: true,
  });
  await expect(places.locator('[aria-roledescription="carousel"]')).toHaveCount(
    0
  );
  const bounds = await places.getByRole('link').first().boundingBox();
  if (!bounds) throw new Error('No full-list place card bounds');
  expect(bounds.width).toBeGreaterThan(bounds.height * 1.5);
  await expect(
    places.getByText('A working studio and gallery', { exact: true })
  ).toHaveCount(0);
});

test('pages Discover by keyboard without arrows and preserves each slider across views and dialogs', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  const views = page.getByRole('group', { name: 'Community views' });
  await views.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /^(Previous|Next) recommended / })
  ).toHaveCount(0);
  const positions = new Map<string, number>();
  for (const kind of ['events', 'groups', 'places']) {
    const rail = page.getByRole('group', {
      name: `Recommended ${kind}`,
      exact: true,
    });
    const { step, maximum } = await rail.evaluate((element) => {
      if (!(element.firstElementChild instanceof HTMLElement))
        throw new Error('No first slide');
      const maximum = element.scrollWidth - element.clientWidth;
      return {
        step: Math.min(maximum, element.firstElementChild.offsetWidth + 16),
        maximum,
      };
    });
    await expect
      .poll(() => rail.evaluate((element) => element.scrollLeft))
      .toBe(0);
    await rail.scrollIntoViewIfNeeded();
    await rail.focus();
    await page.keyboard.press('End');
    await expect
      .poll(() => rail.evaluate((element) => element.scrollLeft))
      .toBeCloseTo(maximum, 0);
    await expect(
      rail.locator(':scope > button, :scope > a').last()
    ).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Home');
    await expect
      .poll(() => rail.evaluate((element) => element.scrollLeft))
      .toBe(0);
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(() => rail.evaluate((element) => element.scrollLeft))
      .toBeCloseTo(step, 0);
    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(() => rail.evaluate((element) => element.scrollLeft))
      .toBe(0);
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(() => rail.evaluate((element) => element.scrollLeft))
      .toBeCloseTo(step, 0);
    positions.set(kind, await rail.evaluate((element) => element.scrollLeft));
  }
  const eventRail = page.getByRole('group', {
    name: 'Recommended events',
    exact: true,
  });
  const event = eventRail.getByRole('button').nth(1);
  const title = await event.locator('strong').innerText();
  await event.click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: title, exact: true })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(event).toBeFocused();
  expect(await eventRail.evaluate((element) => element.scrollLeft)).toBe(
    positions.get('events')
  );
  await views.getByRole('button', { name: 'Yours', exact: true }).click();
  await views.getByRole('button', { name: 'Discover', exact: true }).click();
  await page.getByRole('tab', { name: 'Social', exact: true }).click();
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  for (const [kind, position] of positions) {
    const rail = page.getByRole('group', {
      name: `Recommended ${kind}`,
      exact: true,
    });
    expect(await rail.evaluate((element) => element.scrollLeft)).toBe(position);
  }
});

test('supports mouse scrolling on Discover without paging arrows', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await page
    .getByRole('group', { name: 'Community views' })
    .getByRole('button', { name: 'Discover', exact: true })
    .click();
  const rail = page.getByRole('group', {
    name: 'Recommended events',
    exact: true,
  });
  const pane = page.getByRole('region', {
    name: 'Discover recommendations',
    exact: true,
  });
  await expect(rail).toHaveCSS('scrollbar-width', 'none');
  await rail.hover();
  await page.mouse.wheel(240, 0);
  await expect
    .poll(() => rail.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(100);
  expect(await pane.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /^(Previous|Next) recommended / })
  ).toHaveCount(0);
});

test('honors reduced motion when paging Discover cards', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await page
    .getByRole('group', { name: 'Community views' })
    .getByRole('button', { name: 'Discover', exact: true })
    .click();
  const rail = page.getByRole('group', {
    name: 'Recommended events',
    exact: true,
  });
  await rail.evaluate((element) => {
    element.scrollBy = new Proxy(element.scrollBy, {
      apply(target, receiver, args) {
        const options: unknown = args[0];
        if (
          typeof options === 'object' &&
          options !== null &&
          'behavior' in options
        ) {
          element.setAttribute(
            'data-paging-behavior',
            String(options.behavior)
          );
        }
        return Reflect.apply(target, receiver, args);
      },
    });
  });
  await rail.focus();
  await page.keyboard.press('ArrowRight');
  await expect(rail).toHaveAttribute('data-paging-behavior', 'auto');
  await expect(rail).toHaveCSS('scroll-behavior', 'auto');
  expect(await rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
    0
  );
});

test.describe('touch Discover sliders', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('swipes sideways without opening a card and still scrolls the page vertically', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Community', exact: true }).tap();
    await page
      .getByRole('group', { name: 'Community views' })
      .getByRole('button', { name: 'Discover', exact: true })
      .tap();
    const rail = page.getByRole('group', {
      name: 'Recommended events',
      exact: true,
    });
    const pane = page.getByRole('region', {
      name: 'Discover recommendations',
      exact: true,
    });
    const bounds = await rail.boundingBox();
    if (!bounds) throw new Error('No touch slider bounds');
    const x = bounds.x + bounds.width * 0.8;
    const y = bounds.y + bounds.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x - (180 * step) / 10, y }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(() => rail.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(100);
    await expect(rail).toHaveCSS('scrollbar-width', 'none');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await pane.evaluate((element) => element.scrollTop)).toBe(0);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y - (140 * step) / 10 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(() => pane.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(80);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'App navigation' })
    ).toBeInViewport({ ratio: 1 });
    await cdp.detach();
  });
});

test('keeps Yours and Discover compact and pinned while their content scrolls', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  const sections = page.getByRole('group', { name: 'Community views' });
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1280, 980],
  ]) {
    await page.setViewportSize({ width, height });
    for (const [label, name] of [
      ['Yours', 'Your community'],
      ['Discover', 'Discover recommendations'],
    ]) {
      await sections.getByRole('button', { name: label, exact: true }).click();
      const pane = page.getByRole('region', { name, exact: true });
      const scroll = await pane.evaluate((element) => {
        element.scrollTop = 180;
        return {
          top: element.scrollTop,
          maximum: element.scrollHeight - element.clientHeight,
        };
      });
      expect(scroll.top).toBeCloseTo(Math.min(180, scroll.maximum), 0);
      const header = await page.getByRole('banner').boundingBox();
      const controls = await sections.boundingBox();
      if (!header || !controls) throw new Error('No Community control bounds');
      expect(controls.height).toBeLessThanOrEqual(44);
      expect(
        Math.abs(controls.y - header.y - header.height)
      ).toBeLessThanOrEqual(1);
      for (const control of await sections.getByRole('button').all()) {
        await expect(control).toBeInViewport({ ratio: 1 });
        const bounds = await control.boundingBox();
        if (!bounds) throw new Error('A Community control has no bounds');
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
      await expect(
        sections.getByRole('button', { name: label, exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      expect(
        await page
          .getByRole('tabpanel', { name: 'Community', exact: true })
          .evaluate((element) => element.scrollTop)
      ).toBe(0);
      await expect(
        page.getByRole('navigation', { name: 'App navigation' })
      ).toBeInViewport({ ratio: 1 });
    }
  }
});

test('retains independent Community scrolling and browse filters across tabs', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const views = page.getByRole('group', { name: 'Community views' });
  await views.getByRole('button', { name: 'Discover', exact: true }).click();
  const home = page.getByRole('region', {
    name: 'Discover recommendations',
    exact: true,
  });
  for (const [shortcut, name, filter] of [
    ['All events', 'Community events', 'Tonight'],
    ['All groups', 'Community groups', 'All groups'],
  ]) {
    const opener = home.getByRole('button', { name: shortcut, exact: true });
    await opener.scrollIntoViewIfNeeded();
    const homePosition = await home.evaluate((element) => element.scrollTop);
    await opener.click();
    const pane = page.getByRole('region', { name, exact: true });
    await pane.getByRole('button', { name: filter, exact: true }).click();
    await pane.evaluate((element) => {
      element.scrollTop = 150;
    });
    const position = await pane.evaluate((element) => element.scrollTop);
    expect(position).toBeGreaterThan(0);
    await page.getByRole('tab', { name: 'Directory', exact: true }).click();
    await page.getByRole('tab', { name: 'Community', exact: true }).click();
    await expect(pane).toBeVisible();
    expect(await pane.evaluate((element) => element.scrollTop)).toBe(position);
    await expect(
      pane.getByRole('button', { name: filter, exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Back to Discover' }).click();
    await expect(opener).toBeFocused();
    expect(await home.evaluate((element) => element.scrollTop)).toBe(
      homePosition
    );
  }
  const position = await home.evaluate((element) => element.scrollTop);
  await views.getByRole('button', { name: 'Yours', exact: true }).click();
  await views.getByRole('button', { name: 'Discover', exact: true }).click();
  expect(await home.evaluate((element) => element.scrollTop)).toBe(position);
});

test('returns Community place profiles to their original pane, scroll, and card', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search the directory' });
  await search.fill('Barrio');
  await page
    .getByRole('button', { name: 'Select Barrio Arts Lab on map', exact: true })
    .click();
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const views = page.getByRole('group', { name: 'Community views' });
  await views.getByRole('button', { name: 'Discover', exact: true }).click();
  for (const name of ['Discover recommendations', 'Community places']) {
    if (name === 'Community places') {
      await page
        .getByRole('button', { name: 'All picks', exact: true })
        .click();
    }
    const pane = page.getByRole('region', { name, exact: true });
    const card = pane.getByRole('link', {
      name: 'View Taller Lucía',
      exact: true,
    });
    await card.scrollIntoViewIfNeeded();
    const scrollTop = await pane.evaluate((element) => element.scrollTop);
    const slider = pane.getByRole('group', {
      name: 'Recommended places',
      exact: true,
    });
    const scrollLeft =
      name === 'Discover recommendations'
        ? await slider.evaluate((element) => element.scrollLeft)
        : null;
    if (scrollLeft !== null) expect(scrollLeft).toBeGreaterThan(0);
    await card.click();
    const profile = page.getByRole('region', {
      name: 'Taller Lucía directory profile',
      exact: true,
    });
    await expect(profile).toBeVisible();
    await expect(page).toHaveURL(/#community\/place\/b3$/);
    await expect(
      page.getByRole('tab', { name: 'Community', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Social', exact: true }).click();
    await page.getByRole('tab', { name: 'Community', exact: true }).click();
    await expect(profile).toBeVisible();
    await page.goBack();
    await expect(profile).toHaveCount(0);
    await expect(card).toBeFocused();
    await expect(pane).toBeVisible();
    expect(await pane.evaluate((element) => element.scrollTop)).toBe(scrollTop);
    if (scrollLeft !== null) {
      expect(await slider.evaluate((element) => element.scrollLeft)).toBe(
        scrollLeft
      );
    }
    await page.goForward();
    await expect(profile).toBeVisible();
    await profile.getByRole('button', { name: 'Back to Community' }).click();
    await expect(card).toBeFocused();
    if (scrollLeft !== null) {
      expect(await slider.evaluate((element) => element.scrollLeft)).toBe(
        scrollLeft
      );
    }
  }
  await page.getByRole('tab', { name: 'Directory', exact: true }).click();
  await expect(search).toHaveValue('Barrio');
  await expectDirectoryCardRevealed(page, 'Barrio Arts Lab');
});

test('handles directly opened, missing, and legacy Community place profiles', async ({
  page,
}) => {
  for (const [hash, title] of [
    ['#community/place/b3', 'Taller Lucía'],
    ['#community/place/missing', 'Profile not found'],
    ['#explore/place/b3', 'Taller Lucía'],
  ]) {
    await page.goto(`/mock/app${hash}`);
    await expect(
      page.getByRole('tab', { name: 'Community', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('heading', { name: title, exact: true })
    ).toBeFocused();
    await page.getByRole('button', { name: 'Back to Community' }).click();
    await expect(page).toHaveURL(/#community$/);
    await expect(
      page.getByRole('region', { name: 'Community places', exact: true })
    ).toBeVisible();
    if (title === 'Taller Lucía') {
      await expect(
        page.getByRole('link', { name: 'View Taller Lucía', exact: true })
      ).toBeFocused();
    } else {
      await expect(
        page.getByRole('heading', { name: 'Community', exact: true })
      ).toBeFocused();
    }
    await page.getByRole('button', { name: 'Back to Discover' }).click();
    await expect(
      page
        .getByRole('group', { name: 'Community views' })
        .getByRole('button', { name: 'Discover', exact: true })
    ).toBeFocused();
  }
});

test('keeps saved events separate from Going and Interested across tab changes', async ({
  page,
}) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      writes.push(request.url());
    }
  });
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await page
    .getByRole('button', { name: 'Saved events (0)', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('0 saved events');
  await page.getByRole('button', { name: 'All dates', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Save Risograph Open Studio',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Saved (1)', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('1 saved event');
  await page.getByRole('tab', { name: 'Social', exact: true }).click();
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Saved (1)', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back to Yours' }).click();
  const plans = page.getByRole('region', { name: 'Your plans', exact: true });
  await expect(plans.getByText('Risograph Open Studio')).toHaveCount(0);
  await expect(
    plans.getByRole('button', { name: 'View plans (2)', exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Saved events (1)', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Unsave Risograph Open Studio',
      exact: true,
    })
    .click();
  await expect(page.getByRole('status')).toHaveText('0 saved events');
  expect(writes).toEqual([]);
});

test('shares joined groups between discovery and Yours without live account changes', async ({
  page,
}) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      writes.push(request.url());
    }
  });
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await page
    .getByRole('button', { name: 'All your groups (2)', exact: true })
    .click();
  const mine = page.getByRole('button', { name: /^Your groups \(/ });
  const original = Number((await mine.textContent())?.match(/\d+/)?.[0]);
  await page.getByRole('button', { name: 'All groups', exact: true }).click();
  await expect(
    page.getByText('Activity is private', { exact: true })
  ).toBeVisible();
  const privateGroup = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Little Haiti Tenant Union' }),
  });
  await expect(privateGroup.getByText(/\d+ posts this week/)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Join Miami Artist Census Organisers' })
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Join Cafecito & Code', exact: true })
    .click();
  await page
    .getByRole('button', { name: `Your groups (${original + 1})`, exact: true })
    .click();
  await page.getByRole('button', { name: 'Preview Cafecito & Code' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Cafecito & Code', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('390 members');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Preview Cafecito & Code' })
  ).toBeFocused();
  await page.getByRole('button', { name: 'Back to Yours' }).click();
  await page.getByRole('tab', { name: 'Social', exact: true }).click();
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: `All your groups (${original + 1})`,
      exact: true,
    })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Preview Cafecito & Code' })
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Your groups', exact: true })
      .getByText('Little Haiti Tenant Union')
  ).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Community views' })
    .getByRole('button', { name: 'Discover', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Group picks', exact: true })
      .getByRole('button', { name: /Cafecito & Code/ })
  ).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('shares editable RSVP plans with Yours, handles empty plans, and respects capacity', async ({
  page,
}) => {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()))
      writes.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('tab', { name: 'Community', exact: true }).click();
  await page
    .getByRole('button', { name: 'View plans (2)', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('2 plans');
  await expect(
    page.getByRole('button', {
      name: 'Going: Little Haiti Night Market',
      exact: true,
    })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', {
      name: 'Interested: Screenprint Your Own Tote',
      exact: true,
    })
  ).toHaveAttribute('aria-pressed', 'true');
  const tote = page.getByRole('article').filter({
    has: page.getByRole('heading', {
      name: 'Screenprint Your Own Tote',
      exact: true,
    }),
  });
  const before = Number(
    (await tote.getByText(/\d+ going in this sample/).innerText()).match(
      /\d+/
    )?.[0]
  );
  await page
    .getByRole('button', {
      name: 'Going: Screenprint Your Own Tote',
      exact: true,
    })
    .click();
  await expect(
    tote.getByText(`${before + 1} going in this sample`, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Interested: Screenprint Your Own Tote',
      exact: true,
    })
  ).toHaveAttribute('aria-pressed', 'false');
  await page
    .getByRole('button', {
      name: 'Going: Screenprint Your Own Tote',
      exact: true,
    })
    .click();
  await expect(page.getByRole('status')).toHaveText('1 plan');
  await expect(page.getByRole('status')).toBeFocused();
  await page
    .getByRole('button', {
      name: 'Going: Little Haiti Night Market',
      exact: true,
    })
    .click();
  await expect(page.getByRole('status')).toHaveText('0 plans');
  await page.getByRole('button', { name: 'Back to Yours' }).click();
  const plans = page.getByRole('region', { name: 'Your plans', exact: true });
  await expect(
    plans.getByText('Events you mark Going or Interested will appear here.')
  ).toBeVisible();
  await plans
    .getByRole('button', { name: 'Find an event', exact: true })
    .click();
  await expect(
    page
      .getByRole('group', { name: 'Community views' })
      .getByRole('button', { name: 'Discover', exact: true })
  ).toBeFocused();
  await page.getByRole('button', { name: 'All events', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Interested: Risograph Open Studio',
      exact: true,
    })
    .click();
  const fullTitle = 'Supper Club: Six Courses, One Table';
  await expect(
    page.getByRole('button', { name: `Going: ${fullTitle}`, exact: true })
  ).toBeDisabled();
  await page
    .getByRole('button', { name: `Interested: ${fullTitle}`, exact: true })
    .click();
  await page.getByRole('button', { name: 'Back to Discover' }).click();
  await page
    .getByRole('group', { name: 'Community views' })
    .getByRole('button', { name: 'Yours', exact: true })
    .click();
  await expect(
    plans.getByText('Risograph Open Studio', { exact: true })
  ).toBeVisible();
  await expect(plans.getByText(fullTitle, { exact: true })).toBeVisible();
  await expect(plans.getByText('Interested', { exact: true })).toHaveCount(2);
  await expect(plans.getByText('Going', { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('supports keyboard navigation and a narrow phone viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const navigation = page.getByRole('navigation', { name: 'App navigation' });
  const directory = navigation.getByRole('tab', {
    name: 'Directory',
    exact: true,
  });
  const social = navigation.getByRole('tab', { name: 'Social', exact: true });
  await directory.focus();
  await page.keyboard.press('ArrowRight');
  await expect(social).toBeFocused();
  await expect(
    page.getByRole('tabpanel', { name: 'Social', exact: true })
  ).toBeVisible();
  await page.keyboard.press('End');
  await expect(
    navigation.getByRole('tab', { name: 'Community', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    navigation.getByRole('link', { name: /^Profile:/ })
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Home');
  await expect(directory).toBeFocused();
  await expect(
    page.getByRole('tabpanel', { name: 'Directory', exact: true })
  ).toBeVisible();

  for (const tab of await navigation.locator('[role="tab"], a').all()) {
    const box = await tab.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error('A bottom tab has no rendered bounds');
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await expect(navigation).toBeInViewport();
});

test('keeps the complete navigation visible on phones, landscape, and desktop', async ({
  page,
}) => {
  const navigation = page.getByRole('navigation', { name: 'App navigation' });
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 980],
  ]) {
    await page.setViewportSize({ width, height });
    for (const label of ['Directory', 'Social', 'Community']) {
      await navigation.getByRole('tab', { name: label, exact: true }).click();
      await expect(navigation).toBeInViewport({ ratio: 1 });
      await expect(
        navigation.getByRole('link', { name: /^Profile:/ })
      ).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
    }
  }
});
