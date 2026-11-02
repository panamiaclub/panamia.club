import { expect, test, type Page } from '@playwright/test';
import type { SearchResultsInterface } from '@/lib/query/directory';
import type { OnlineZipArea } from '@/lib/online-zip';

const miami: OnlineZipArea = {
  postalCode: '33138',
  country: 'US',
  city: 'Miami',
  region: 'FL',
  lat: 25.8521,
  lng: -80.1821,
};
const broward: OnlineZipArea = {
  postalCode: '33301',
  country: 'US',
  city: 'Fort Lauderdale',
  region: 'FL',
  lat: 26.1216,
  lng: -80.1288,
};
function listing(
  id: string,
  area: OnlineZipArea | null
): SearchResultsInterface {
  return {
    _id: id,
    id,
    name: id,
    screenname: id,
    score: 1,
    score_details: {},
    five_words: 'Sample business',
    details: 'A fixture-backed business.',
    images: { primaryCDN: '/img/directory/art-01.jpg' },
    socials: {},
    categories: [],
    online_only: true,
    online_zip: area,
    primary_address: { zipcode: area?.postalCode },
    // Deliberately hostile legacy data: it must never become an online pin.
    geo: { coordinates: [-122.4, 37.8] },
  };
}
const results = [
  listing('miami-one', miami),
  listing('ships-anywhere', miami),
  { ...listing('broward-one', broward), screenname: null, claimed: true },
  { ...listing('missing-zip', null), screenname: null, claimed: false },
  {
    ...listing('public-storefront', null),
    online_only: false,
    primary_address: { city: 'South Miami' },
    geo: { coordinates: [-80.291, 25.708] },
  },
];

async function fixtures(
  page: Page,
  options: {
    results?: SearchResultsInterface[];
    mapFailsOnce?: boolean;
    signedIn?: boolean;
    signalsFail?: boolean;
  } = {}
) {
  let searchRequests = 0;
  let mapRequests = 0;
  let mapFailures = options.mapFailsOnce ? 1 : 0;
  const signalBatches: string[][] = [];
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' })
  );
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.startsWith('/api/map/tiles/')) {
      await route.fulfill({
        contentType: 'application/x-protobuf',
        body: Buffer.alloc(0),
      });
    } else if (path === '/api/getDirectorySearch') {
      searchRequests++;
      const mapView = url.searchParams.get('v') === 'map';
      if (mapView) {
        mapRequests++;
        if (mapFailures-- > 0) {
          await route.fulfill({ status: 503, json: { success: false } });
          return;
        }
      }
      const query = url.searchParams.get('q')?.toLowerCase() || '';
      const categories = url.searchParams.get('fcat')?.split('+') || [];
      const matching = (options.results ?? results)
        .filter(
          (result) =>
            result.name.toLowerCase().includes(query) &&
            (!categories.length ||
              categories.some((category) =>
                result.categories?.includes(category)
              ))
        )
        .map((result, index) => ({ ...result, result_index: index + 1 }));
      const mappable = matching.filter((result) =>
        result.online_only
          ? result.online_zip != null
          : result.geo?.coordinates != null || result.zip_area != null
      );
      const pageNum = Number(url.searchParams.get('page') || '1');
      const limit = Number(url.searchParams.get('limit') || '20');
      await route.fulfill({
        json: {
          success: true,
          data: mapView
            ? mappable
            : matching.slice((pageNum - 1) * limit, pageNum * limit),
          pagination: {
            page: mapView ? 1 : pageNum,
            limit: mapView ? Math.max(mappable.length, 1) : limit,
            total: mapView ? mappable.length : matching.length,
            totalPages: mapView
              ? Number(mappable.length > 0)
              : Math.ceil(matching.length / limit),
          },
          map: mapView
            ? {
                totalResults: matching.length,
                unmappedCount: matching.length - mappable.length,
                unmappedResults: matching.filter(
                  (result) => !mappable.includes(result)
                ),
              }
            : undefined,
        },
      });
    } else if (path === '/api/listings/signals') {
      const ids = (url.searchParams.get('ids') || '')
        .split(',')
        .filter(Boolean);
      signalBatches.push(ids);
      if (options.signalsFail || ids.length > 60) {
        await route.fulfill({ status: 503, json: { success: false } });
        return;
      }
      await route.fulfill({
        headers: { 'Cache-Control': 'no-store' },
        json: {
          success: true,
          data: {
            maySignal: true,
            listings: Object.fromEntries(
              ids.map((id) => [
                id,
                {
                  saved: id === 'unlocated-70',
                  recommended: false,
                  isOwner: id === 'unlocated-69',
                },
              ])
            ),
          },
        },
      });
    } else if (path === '/api/auth/get-session') {
      const now = new Date().toISOString();
      await route.fulfill({
        json: options.signedIn
          ? {
              user: {
                id: 'directory-viewer',
                name: 'Directory Viewer',
                email: 'directory-viewer@example.invalid',
                emailVerified: true,
                createdAt: now,
                updatedAt: now,
              },
              session: {
                id: 'directory-session',
                userId: 'directory-viewer',
                token: 'test-only',
                createdAt: now,
                updatedAt: now,
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
              },
            }
          : null,
      });
    } else if (path === '/api/config/turnstile') {
      await route.fulfill({ json: { siteKey: '1x00000000000000000000AA' } });
    } else {
      await route.fulfill({
        status: 404,
        json: { error: `No fixture for ${path}` },
      });
    }
  });
  return {
    requests: () => searchRequests,
    mapRequests: () => mapRequests,
    signalBatches: () => signalBatches,
  };
}

test('ZIP bubbles focus In map while retaining the unlocated Online section', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixtures(page);
  await page.goto('/directory/search?radius=all');
  const bubble = page.getByRole('button', {
    name: '2 online businesses based near ZIP 33138',
  });
  await expect(bubble).toBeVisible();
  await expect(page.locator('.dirsearch-zip-bubble')).toHaveCount(2);
  await expect(page.locator('.dirsearch-pin')).toHaveCount(1);
  await expect(
    page.getByText('1 result has no usable map location.')
  ).toBeVisible();
  await bubble.click();
  await expect(
    page
      .getByRole('region', { name: 'In map', exact: true })
      .locator('[id^="dirsearch-result-"]')
  ).toHaveCount(2);
  await expect(
    page
      .getByRole('region', { name: 'Online', exact: true })
      .locator('#dirsearch-result-missing-zip')
  ).toBeVisible();
  await expect(page.locator('#dirsearch-result-miami-one')).toBeVisible();
  await expect(page.locator('#dirsearch-result-ships-anywhere')).toBeVisible();
  await expect(page.locator('.dirsearch-pin')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Show all results' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show all results' }).click();
  await expect(page.locator('[id^="dirsearch-result-"]')).toHaveCount(5);
});

test('a ZIP tap switches the narrow map view to matching results without dropping its focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const observed = await fixtures(page);
  await page.goto('/directory/search?radius=all&view=map');
  await page
    .getByRole('button', {
      name: '2 online businesses based near ZIP 33138',
    })
    .click();
  await expect(page).not.toHaveURL(/view=map/);
  await expect(page.locator('.dirsearch-zip-focus')).toContainText('33138');
  await expect(
    page.locator('#dirsearch-in-map [id^="dirsearch-result-"]')
  ).toHaveCount(2);
  await expect(
    page.locator('#dirsearch-online [id^="dirsearch-result-"]')
  ).toHaveCount(1);
  await expect(page.locator('#dirsearch-result-miami-one')).toBeVisible();
  expect(observed.requests()).toBe(1);
  expect(observed.mapRequests()).toBe(1);
});

const unlocatedPage: SearchResultsInterface[] = Array.from(
  { length: 20 },
  (_, index) => ({
    ...listing(`unlocated-${index}`, null),
    online_only: false,
    geo: null,
  })
);
const storefront = {
  ...listing('public-storefront', null),
  online_only: false,
  primary_address: { city: 'South Miami' },
  geo: { coordinates: [-80.291, 25.708] },
  categories: ['art'],
};
const otherStorefront = {
  ...storefront,
  _id: 'other-storefront',
  id: 'other-storefront',
  screenname: 'other-storefront',
  name: 'other-storefront',
  geo: { coordinates: [-80.18, 25.85] },
  categories: ['food'],
};

test('photo-only pins select later results without pagination or camera changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const observed = await fixtures(page, {
    results: [...unlocatedPage, storefront, otherStorefront],
  });
  await page.goto('/directory/search?radius=all');
  await expect(page.locator('[id^="dirsearch-result-"]')).toHaveCount(22);
  await expect(page.locator('.dirsearch-pin')).toHaveCount(2);
  await expect(
    page.getByText('20 results have no usable map location.')
  ).toBeVisible();
  const pin = page.getByRole('button', {
    name: 'public-storefront, South Miami',
    exact: true,
  });
  await expect(pin).toHaveText('');
  await expect(pin.locator('img')).toHaveCount(1);
  await waitForFrame(page, [25.779, -80.2355]);
  const before = await camera(page);
  await pin.click();
  await expect(page).not.toHaveURL(/[?&]p=/);
  const card = page.locator('#dirsearch-result-public-storefront');
  await expect(card).toHaveAttribute('data-selected', 'true');
  await expect(card.locator('.dirsearch-card-number')).toHaveText('21');
  await expect(page.locator('.dirsearch-pin')).toHaveCount(2);
  await expect(page.locator('.dirsearch-map-card')).toContainText(
    'public-storefront'
  );
  expect(observed.mapRequests()).toBe(1);
  expect(observed.requests()).toBe(1);
  await unchangedCamera(page, before);
});

test('all map locations and unlocated matches are browsable without list pagination', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const observed = await fixtures(page, {
    results: [
      ...unlocatedPage,
      ...Array.from({ length: 27 }, (_, index) => ({
        ...storefront,
        _id: `located-${index}`,
        id: `located-${index}`,
        name: `located-${index}`,
        screenname: `located-${index}`,
        geo: { coordinates: [-80.291 + index * 0.001, 25.708] },
      })),
    ],
  });
  await page.goto('/directory/search?radius=all');
  await expect(page.locator('.dirsearch-pin')).toHaveCount(27);
  await expect(
    page.locator('#dirsearch-in-map [id^="dirsearch-result-"]')
  ).toHaveCount(27);
  await expect(
    page.locator('#dirsearch-online [id^="dirsearch-result-"]')
  ).toHaveCount(20);
  await expect(page.locator('#dirsearch-result-located-0')).toBeVisible();
  await page.locator('#dirsearch-result-unlocated-19').scrollIntoViewIfNeeded();
  await expect(page.locator('#dirsearch-result-unlocated-19')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Next', exact: true })
  ).toHaveCount(0);
  await expect(page.locator('.dirsearch-pin')).toHaveCount(27);
  expect(observed.mapRequests()).toBe(1);
});

test('a ZIP bubble focuses matches across all list pages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fixtures(page, {
    results: [
      ...unlocatedPage,
      listing('miami-one', miami),
      listing('miami-two', miami),
      listing('broward-one', broward),
    ],
  });
  await page.goto('/directory/search?radius=all&view=map');
  await page
    .getByRole('button', {
      name: '2 online businesses based near ZIP 33138',
    })
    .click();
  await expect(page).not.toHaveURL(/view=map/);
  await expect(
    page.locator('#dirsearch-in-map [id^="dirsearch-result-"]')
  ).toHaveCount(2);
  await expect(
    page.locator('#dirsearch-online [id^="dirsearch-result-"]')
  ).toHaveCount(20);
  await expect(page.locator('#dirsearch-result-miami-one')).toBeVisible();
  await expect(
    page.locator('#dirsearch-result-miami-two .dirsearch-card-number')
  ).toHaveText('22');
  await page.getByRole('button', { name: 'Show all results' }).click();
  await expect(page.locator('[id^="dirsearch-result-"]')).toHaveCount(23);
});

test('the full map follows the search term and category filters', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixtures(page, {
    results: [...unlocatedPage, storefront, otherStorefront],
  });
  await page.goto('/directory/search/public-storefront?radius=all&fcat=art');
  await expect(page.locator('.dirsearch-pin')).toHaveCount(1);
  await expect(
    page.locator('#dirsearch-result-public-storefront')
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'public-storefront, South Miami' })
  ).toHaveText('');
  await expect(page.locator('.dirsearch-mapoffmap')).toHaveCount(0);
});

test('map-browsing failures are explicit and retry both result sections', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const observed = await fixtures(page, {
    results: [...unlocatedPage, storefront],
    mapFailsOnce: true,
  });
  await page.goto('/directory/search?radius=all');
  const alert = page.getByRole('alert').filter({
    hasText: 'Could not load map locations.',
  });
  await expect(alert).toBeVisible();
  await expect(
    page.getByText('Could not load directory results.')
  ).toBeVisible();
  await alert.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.dirsearch-pin')).toHaveCount(1);
  await expect(
    page.locator('#dirsearch-online [id^="dirsearch-result-"]')
  ).toHaveCount(20);
  await expect(alert).toHaveCount(0);
  expect(observed.mapRequests()).toBe(2);
});

test('owned and ownerless handleless businesses open public pages instead of a claim screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixtures(page);
  await page.goto('/directory/search?radius=all');
  const unclaimed = page.locator('#dirsearch-result-missing-zip');
  await expect(
    unclaimed.getByRole('heading').getByRole('link')
  ).toHaveAttribute('href', '/listings/missing-zip');
  await expect(
    unclaimed.getByRole('link', { name: 'View profile', exact: true })
  ).toHaveAttribute('href', '/listings/missing-zip');
  await expect(
    unclaimed.getByRole('link', { name: 'Is this your business?' })
  ).toHaveAttribute('href', '/listings/claim/start?id=missing-zip');
  const owned = page.locator('#dirsearch-result-broward-one');
  await expect(owned.getByRole('heading').getByRole('link')).toHaveAttribute(
    'href',
    '/listings/broward-one'
  );
  await expect(
    owned.getByRole('link', { name: 'Is this your business?' })
  ).toHaveCount(0);
});

const canvas = (page: Page) =>
  page.locator('.dirsearch-mappane .dirsearch-mapcanvas[data-map-bounds]');

async function camera(page: Page) {
  return {
    center: (await canvas(page).getAttribute('data-map-center'))!
      .split(',')
      .map(Number),
    zoom: Number(await canvas(page).getAttribute('data-map-zoom')),
  };
}

async function waitForFrame(page: Page, center: [number, number]) {
  await expect(canvas(page)).toHaveCount(1);
  await expect
    .poll(async () => {
      const current = await camera(page);
      return Math.max(
        Math.abs(current.center[0] - center[0]),
        Math.abs(current.center[1] - center[1])
      );
    })
    .toBeLessThan(0.000001);
}

async function unchangedCamera(
  page: Page,
  before: Awaited<ReturnType<typeof camera>>
) {
  // Wait beyond the canvas's 420ms ease so delayed selection reframes fail too.
  await page.waitForTimeout(550);
  const after = await camera(page);
  expect(after.zoom).toBeCloseTo(before.zoom, 7);
  expect(after.center[0]).toBeCloseTo(before.center[0], 7);
  expect(after.center[1]).toBeCloseTo(before.center[1], 7);
}

test('In map follows actual zoom, pan, and resized bounds without moving known locations into Online', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const locations = [
    { id: 'near-west', lng: -80.21 },
    { id: 'near-east', lng: -80.19 },
    { id: 'edge', lng: -80.33 },
    { id: 'far-west', lng: -80.6 },
    { id: 'far-east', lng: -79.8 },
  ].map(({ id, lng }) => ({
    ...storefront,
    _id: id,
    id,
    name: id,
    screenname: id,
    geo: { coordinates: [lng, 25.8] },
  }));
  const observed = await fixtures(page, {
    results: [
      ...locations,
      ...unlocatedPage,
      listing('online-without-zip', null),
    ],
  });
  await page.goto('/directory/search?radius=all');
  await waitForFrame(page, [25.8, -80.2]);
  const initial = await camera(page);
  for (let step = 0; step < 3; step++) {
    const previous = await camera(page);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(async () => (await camera(page)).zoom)
      .toBeGreaterThan(previous.zoom + 0.99);
  }
  await expect(
    page.locator('#dirsearch-in-map [id^="dirsearch-result-"]')
  ).toHaveCount(2);
  await expect(page.locator('#dirsearch-result-edge')).toHaveCount(0);
  await expect(
    page.locator('#dirsearch-online [id^="dirsearch-result-"]')
  ).toHaveCount(21);
  await expect(page.locator('#dirsearch-online')).not.toContainText('far-west');
  expect((await camera(page)).zoom).toBeGreaterThan(initial.zoom + 2.9);
  await expect(page.locator('.dirsearch-pin')).toHaveCount(5);

  const assertViewportMatches = async () => {
    const bounds = JSON.parse(
      (await canvas(page).getAttribute('data-map-bounds'))!
    ) as {
      west: number;
      east: number;
      south: number;
      north: number;
    };
    const expected = locations
      .filter((item) => {
        const [lng, lat] = item.geo.coordinates;
        return (
          lng >= bounds.west &&
          lng <= bounds.east &&
          lat >= bounds.south &&
          lat <= bounds.north
        );
      })
      .map((item) => item.id);
    await expect
      .poll(() =>
        page
          .locator('#dirsearch-in-map [id^="dirsearch-result-"]')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.id.replace('dirsearch-result-', ''))
          )
      )
      .toEqual(expected);
  };

  await page.setViewportSize({ width: 2100, height: 1000 });
  await expect(page.locator('#dirsearch-result-edge')).toBeAttached();
  await assertViewportMatches();
  const beforePan = await camera(page);
  const box = (await page.locator('.dirsearch-mappane canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.55, {
    steps: 20,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await camera(page)).center[1])
    .toBeGreaterThan(beforePan.center[1] + 0.02);
  await assertViewportMatches();
  await expect(
    page.locator('#dirsearch-online [id^="dirsearch-result-"]')
  ).toHaveCount(21);
  expect(observed.requests()).toBe(1);
});

test('ZIP-only photo pins and cards explicitly label approximate locations without exposing online street points', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const zipOnly = {
    ...storefront,
    _id: 'zip-only',
    id: 'zip-only',
    name: 'ZIP-only business',
    screenname: null,
    primary_address: { city: 'Miami', zipcode: '33138-1234' },
    geo: null,
    zip_area: miami,
  };
  await fixtures(page, {
    results: [zipOnly, listing('private-online', null)],
  });
  await page.goto('/directory/search?radius=all');
  const pin = page.getByRole('button', {
    name: 'ZIP-only business, approximate ZIP 33138 area',
    exact: true,
  });
  await expect(pin).toBeVisible();
  await expect(pin).toHaveAttribute('data-approximate', 'true');
  await expect(pin).toHaveCSS('border-style', 'dashed');
  await expect(pin).toHaveText('');
  await expect(pin.locator('img')).toHaveCount(1);
  await expect(page.locator('.dirsearch-zip-bubble')).toHaveCount(0);
  await expect(
    page.locator('#dirsearch-in-map .dirsearch-card-where')
  ).toContainText('Approximate ZIP 33138 area');
  await expect(page.locator('#dirsearch-online')).toContainText(
    'private-online'
  );
  await expect(page.locator('.dirsearch-zip-attribution')).toBeVisible();
  await waitForFrame(page, [miami.lat, miami.lng]);
  const before = await camera(page);
  await pin.click();
  await expect(page.locator('.dirsearch-map-card')).toContainText(
    'Approximate ZIP 33138 area'
  );
  await unchangedCamera(page, before);
});

test('complete collections keep saved and ownership state beyond 60 listings without refetching on viewport changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const unlocated = Array.from({ length: 80 }, (_, index) => ({
    ...listing(`unlocated-${index}`, null),
    online_only: false,
    geo: null,
    screenname: null,
    claimed: true,
  }));
  const observed = await fixtures(page, {
    results: [...unlocated, storefront, otherStorefront],
    signedIn: true,
  });
  await page.goto('/directory/search?radius=all');
  await expect(
    page.getByRole('button', { name: 'Unsave unlocated-70', exact: true })
  ).toBeVisible();
  await expect(
    page
      .locator('#dirsearch-result-unlocated-69')
      .getByRole('button', { name: 'Save unlocated-69', exact: true })
  ).toHaveCount(0);
  const batches = observed.signalBatches().filter((batch) => batch.length > 0);
  expect(batches.map((batch) => batch.length).sort((a, b) => b - a)).toEqual([
    60, 22,
  ]);
  expect(new Set(batches.flat()).size).toBe(82);
  const count = observed.signalBatches().length;
  await waitForFrame(page, [25.779, -80.2355]);
  for (let step = 0; step < 3; step++) {
    const previous = await camera(page);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(async () => (await camera(page)).zoom)
      .toBeGreaterThan(previous.zoom + 0.99);
  }
  await expect(
    page.locator('#dirsearch-in-map [id^="dirsearch-result-"]')
  ).toHaveCount(0);
  await expect(
    page.locator('#dirsearch-online [id^="dirsearch-result-"]')
  ).toHaveCount(80);
  expect(observed.signalBatches()).toHaveLength(count);
  await expect(
    page.getByRole('button', { name: 'Unsave unlocated-70', exact: true })
  ).toBeVisible();
});

test('saved-state failures are explicit and do not send a signed-in viewer to signup', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixtures(page, { signedIn: true, signalsFail: true });
  await page.goto('/directory/search?radius=all');
  await expect(
    page.getByText('Could not load your saved listings', { exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Save miami-one', exact: true })
    .click();
  await expect(
    page.getByText('Your saved listings are not ready yet', { exact: true })
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.locator('#dirsearch-online [id^="dirsearch-result-"]')
  ).toHaveCount(1);
});
