import { test, expect } from '@playwright/test';

/**
 * Notification System Tests
 *
 * Tests for the ActivityPub-shaped notification system.
 * Most tests verify unauthenticated behavior since auth state
 * requires additional setup with Playwright's storageState.
 */

test.describe('Updates Page', () => {
  test('updates page exists and shows unauthorized message for anonymous users', async ({
    page,
  }) => {
    const res = await page.goto('/updates', {
      waitUntil: 'domcontentloaded',
    });

    // Routing and content in one place. Two further tests used to cover the
    // routing half -- 'updates page does not return 404' and a
    // 'Updates Routes - No 404' describe whose route list held a single entry,
    // /updates. Both asserted only `status === 200`, which a static stub
    // answering 200 on every path also satisfies, and both were strictly weaker
    // than this test. Their original title/URL assertions could not fail at all
    // against this app: the not-found page keeps the default "Pana Mia" title
    // and is served in place, with no /404 redirect. Consolidated here so the
    // route's existence is asserted by something that can tell this page from
    // any other page.
    expect(res?.status()).toBe(200);

    const unauthorizedCard = page.getByText('Unauthorized');
    await expect(unauthorizedCard).toBeVisible({ timeout: 10000 });

    const loginMessage = page.getByText(
      'You must be logged in to view this page.'
    );
    await expect(loginMessage).toBeVisible();
  });
});

test.describe('Notifications API', () => {
  test('notifications list API returns 401 for unauthenticated requests', async ({
    request,
  }) => {
    const response = await request.get('/api/notifications');

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  test('unread count API returns 401 for unauthenticated requests', async ({
    request,
  }) => {
    const response = await request.get('/api/notifications/unread-count');

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  test('mark all read API returns 401 for unauthenticated requests', async ({
    request,
  }) => {
    const response = await request.post('/api/notifications/mark-all-read');

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  test('mark single notification read API returns 401 for unauthenticated requests', async ({
    request,
  }) => {
    // Use a fake notification ID
    const response = await request.post(
      '/api/notifications/507f1f77bcf86cd799439011/read'
    );

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });
});

test.describe('Notifications in Navigation', () => {
  test('account creation and sign-in links are visible for unauthenticated users', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // Wait for header to load
    await page.waitForSelector('header');

    const accountLinks = page.getByRole('navigation', {
      name: 'Create account or sign in',
      exact: true,
    });
    for (const name of ['Create account', 'Sign in']) {
      const link = accountLinks.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible({ timeout: 10000 });
      await expect(link).toHaveAttribute('href', '/signin');
    }
  });
});
