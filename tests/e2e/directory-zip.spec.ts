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
  } = {}
) {
  let searchRequests = 0;
  let mapRequests = 0;
  let mapFailures = options.mapFailsOnce ? 1 : 0;
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
          : result.geo?.coordinates != null
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
              }
            : undefined,
        },
      });
    } else if (path === '/api/auth/get-session') {
      await route.fulfill({ json: null });
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
  };
}

test('ZIP bubbles include only matching online businesses and focus the existing result list', async ({
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
  await expect(page.locator('[id^="dirsearch-result-"]')).toHaveCount(2);
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
  await expect(page.locator('[id^="dirsearch-result-"]')).toHaveCount(2);
  await expect(page.locator('#dirsearch-result-miami-one')).toBeVisible();
  expect(observed.requests()).toBe(2);
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

test('the map includes later pages and selecting a pin opens its numbered list result', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const observed = await fixtures(page, {
    results: [...unlocatedPage, storefront, otherStorefront],
  });
  await page.goto('/directory/search?radius=all');
  await expect(page.locator('[id^="dirsearch-result-"]')).toHaveCount(20);
  await expect(page.locator('.dirsearch-pin')).toHaveCount(2);
  await expect(
    page.getByText('20 results have no usable map location.')
  ).toBeVisible();
  const pin = page.getByRole('button', {
    name: 'public-storefront, South Miami',
    exact: true,
  });
  await expect(pin).toContainText('21');
  await pin.click();
  await expect(page).toHaveURL(/p=2/);
  const card = page.locator('#dirsearch-result-public-storefront');
  await expect(card).toHaveAttribute('data-selected', 'true');
  await expect(card.locator('.dirsearch-card-number')).toHaveText('21');
  await expect(page.locator('.dirsearch-pin')).toHaveCount(2);
  await expect(page.locator('.dirsearch-map-card')).toContainText(
    'public-storefront'
  );
  expect(observed.mapRequests()).toBe(1);
  expect(observed.requests()).toBe(3);
});

test('all 27 mappable results persist when the list moves between pages', async ({
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
  await expect(page.locator('[id^="dirsearch-result-"]')).toHaveCount(20);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/p=2/);
  await expect(page.locator('#dirsearch-result-located-0')).toBeVisible();
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
  await expect(page.locator('[id^="dirsearch-result-"]')).toHaveCount(2);
  await expect(page.locator('#dirsearch-result-miami-one')).toBeVisible();
  await expect(
    page.locator('#dirsearch-result-miami-two .dirsearch-card-number')
  ).toHaveText('22');
  await page.getByRole('button', { name: 'Show all results' }).click();
  await expect(page.locator('[id^="dirsearch-result-"]')).toHaveCount(20);
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
  ).toContainText('1');
  await expect(page.locator('.dirsearch-mapoffmap')).toHaveCount(0);
});

test('map result failures are visible and retry without hiding the list', async ({
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
  await expect(page.locator('[id^="dirsearch-result-"]')).toHaveCount(20);
  await alert.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.dirsearch-pin')).toHaveCount(1);
  await expect(alert).toHaveCount(0);
  expect(observed.mapRequests()).toBe(2);
});

test('owned and ownerless handleless businesses open public pages instead of a claim screen', async ({
  page,
}) => {
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
