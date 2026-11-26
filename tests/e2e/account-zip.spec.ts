import { expect, test } from '@playwright/test';
import { installNativeApiFixtures } from './fixtures/native-app-api';

for (const existing of [false, true]) {
  test(`ZIP setup cannot be skipped by ${existing ? 'an existing business owner with a dismissed screenname prompt' : 'a new account'}`, async ({
    page,
  }) => {
    await installNativeApiFixtures(page);
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'pana:screenname-prompt-dismissed',
        'native-test-user'
      );
    });
    await page.route('**/api/user/me', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            _id: 'native-test-user',
            screenname: existing ? 'native-viewer' : null,
            createdAt: existing
              ? '2020-01-01T00:00:00Z'
              : new Date().toISOString(),
            hasManagedListings: existing,
            zipCode: null,
          },
        },
      })
    );
    const setupRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/welcome/zip'
    );
    const destination = '/d?q=Bay&sort=name';
    await page.goto(destination);
    const requested = new URL((await setupRequest).url());
    expect(requested.searchParams.get('next')).toBe(destination);
  });
}

test('a valid account ZIP allows browsing without the ZIP setup redirect', async ({
  page,
}) => {
  await installNativeApiFixtures(page);
  const setupRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/welcome/zip') {
      setupRequests.push(request.url());
    }
  });
  const checked = page.waitForResponse('**/api/user/me');
  await page.goto('/d');
  await checked;
  await expect(page.getByText('Bay Cafe').first()).toBeVisible();
  await expect(page).toHaveURL(/\/d$/);
  expect(setupRequests).toEqual([]);
});
