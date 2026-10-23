import { test, expect } from '@playwright/test';

// See the header of public-navigation.spec.ts for why `not.toHaveTitle(/404/)`
// was removed: this app's not-found page keeps the default "Pana Mia" title, so
// the check never fired. Each test below asserts the HTTP status plus content
// specific to the route.

test.describe('Critical User Paths', () => {
  test('directory search and profile view', async ({ page }) => {
    const res = await page.goto('/directory/search', {
      waitUntil: 'domcontentloaded',
    });

    // Search should load without errors (don't wait for networkidle - Atlas search may be slow)
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText('Directory search');
  });

  test('become a pana forwards to the business listing form', async ({
    page,
  }) => {
    const res = await page.goto('/become-a-pana', {
      waitUntil: 'domcontentloaded',
    });

    // The become-a-pana form is retired; this landing path is kept as a
    // redirect so indexed links still resolve. Its destination is public, so
    // anonymous visitors now reach the form itself rather than sign-in.
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/form\/get-listed$/);
    await expect(page.locator('h1').first()).toContainText('Get listed');
  });

  test('contact form loads without errors', async ({ page }) => {
    const res = await page.goto('/form/contact-us', {
      waitUntil: 'domcontentloaded',
    });

    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText('Contact Us');

    // Note: Form submission requires Turnstile which is not configured in test environment
    // Don't wait for networkidle - Turnstile prevents it from completing
  });

  test('donation flow initiates correctly', async ({ page }) => {
    const res = await page.goto('/donate', { waitUntil: 'domcontentloaded' });

    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText('MAKE A DONATION');
    // Don't wait for networkidle - Stripe may have pending requests
  });
});

test.describe('Mentoring Features', () => {
  test('mentor discovery page is publicly accessible', async ({ page }) => {
    await page.goto('/m/discover');

    await expect(page).toHaveURL(/\/m\/discover/);
    await expect(page.locator('h1')).toContainText('Discover Mentors');
  });

  test('mentor schedule page requires authentication', async ({ page }) => {
    await page.goto('/m/schedule');

    // Should redirect to custom signin page for unauthenticated users
    await expect(page).toHaveURL(/\/signin/);
  });

  test('mentor profile page sends anonymous visitors to sign in', async ({
    page,
  }) => {
    const res = await page.goto('/m/profile', {
      waitUntil: 'domcontentloaded',
    });

    // app/m/profile/page.tsx redirects unauthenticated visitors unconditionally,
    // so "loads or redirects" described an outcome this route does not have for
    // an anonymous user. This test has now failed to fail twice: first as
    // `expect(page.url()).toBeTruthy()`, which no navigation can fail, and then
    // as a status check plus a URL alternation whose /m/profile branch was
    // satisfied by simply not redirecting. It was the single test of 35 that
    // still passed against a static stub answering 200 everywhere. Asserting
    // the redirect AND the destination's content is what distinguishes the real
    // app from both a wrong page and a blank one.
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/signin/);
    await expect(page.locator('h1').first()).toContainText(
      'Welcome to Pana MIA'
    );
  });
});

test.describe('Form Pages', () => {
  // These four routes were previously asserted in one loop. They do not behave
  // alike, so the only assertions a loop could make were ones that held for all
  // of them -- and `expect(url).toContain('/form/')` was satisfied by the
  // sign-in redirect's callbackUrl, not by any form. A fifth entry,
  // /form/become-a-pana-single, was removed: it 404s, this test was the last
  // reference to it left in the repo, and both of the loop's assertions passed
  // on it.

  test('become a pana form redirects to the listing form', async ({ page }) => {
    const res = await page.goto('/form/become-a-pana', {
      waitUntil: 'domcontentloaded',
    });
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/form\/get-listed$/);
  });

  test('the old list-your-business URL still resolves', async ({ page }) => {
    // This path was the public intake for a long time and is linked from old
    // posts and printed material, so the rename to /form/get-listed has to
    // keep it working rather than 404.
    const res = await page.goto('/form/list-your-business', {
      waitUntil: 'domcontentloaded',
    });
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/form\/get-listed$/);
  });

  test('affiliate form asks anonymous visitors to sign in', async ({
    page,
  }) => {
    const res = await page.goto('/form/become-an-affiliate', {
      waitUntil: 'domcontentloaded',
    });
    expect(res?.status()).toBe(200);
    await expect(
      page.getByText('You must be signed in to become an affiliate')
    ).toBeVisible();
  });

  test('contact form is publicly reachable', async ({ page }) => {
    const res = await page.goto('/form/contact-us', {
      waitUntil: 'domcontentloaded',
    });
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText('Contact Us');
  });

  test('join the team form is publicly reachable', async ({ page }) => {
    const res = await page.goto('/form/join-the-team', {
      waitUntil: 'domcontentloaded',
    });
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText('Join The Team');
  });
});
