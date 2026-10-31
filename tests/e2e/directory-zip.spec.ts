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
  listing('broward-one', broward),
  listing('missing-zip', null),
  {
    ...listing('public-storefront', null),
    online_only: false,
    primary_address: { city: 'South Miami' },
    geo: { coordinates: [-80.291, 25.708] },
  },
];

async function fixtures(page: Page) {
  let searchRequests = 0;
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' })
  );
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/map/tiles/')) {
      await route.fulfill({
        contentType: 'application/x-protobuf',
        body: Buffer.alloc(0),
      });
    } else if (path === '/api/getDirectorySearch') {
      searchRequests++;
      await route.fulfill({
        json: {
          success: true,
          data: results,
          pagination: {
            page: 1,
            limit: 20,
            total: results.length,
            totalPages: 1,
          },
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
  return { requests: () => searchRequests };
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
  expect(observed.requests()).toBe(1);
});
