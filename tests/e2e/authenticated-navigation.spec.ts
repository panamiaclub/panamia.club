import { test, expect, type Page } from '@playwright/test';

/**
 * These tests require authentication.
 * In a real environment, you would set up auth state using Playwright's storageState feature.
 * For now, these tests will skip if not authenticated.
 */

// A URL is a location, not a page. The first version of these tests asserted
// only `toHaveURL(/(api\/auth\/)?signin/)`, and that alternation was a
// tolerance hiding a live bug: Status401_Unauthorized redirected to
// /api/auth/signin, which better-auth does not serve, so every one of these
// routes ended on a 404 and every test was green anyway. Assert the sign-in
// page's own heading too, so a redirect that lands nowhere fails here.
async function expectSignInPage(page: Page) {
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/signin(\?|$)/, {
    timeout: 15000,
  });
  await expect(page.locator('h1').first()).toContainText('Welcome to Pana MIA');
}

test.describe('Authenticated User Navigation', () => {
  test('account user page requires authentication', async ({ page }) => {
    const res = await page.goto('/account/user/', {
      waitUntil: 'domcontentloaded',
    });

    // The page should load without crashing. Unauthenticated visitors are sent
    // to the sign-in page rather than being shown the account page.
    //
    // Note: the callbackUrl comes back as /account/user/edit rather than the
    // /account/user/ that was requested. This route does not use
    // Status401_Unauthorized -- app/account/user/page.tsx calls router.replace
    // directly -- which is why grepping the string found three more sites than
    // tracing the component did.
    expect(res?.status()).toBe(200);
    await expectSignInPage(page);
  });

  test('account user edit page shows an unauthorized card to anonymous visitors', async ({
    page,
  }) => {
    const res = await page.goto('/account/user/edit', {
      waitUntil: 'domcontentloaded',
    });

    // This route does NOT redirect -- it renders a signed-out card in place,
    // like /form/become-an-affiliate. `expect(page.url()).toBeTruthy()` stood
    // here, which no navigation can fail; status alone replaced it, which a
    // stub answering 200 everywhere also satisfies. The card's own text is the
    // assertion that distinguishes this page from any other page.
    //
    // The wording is the settings redesign's (#183), which replaced a generic
    // "Unauthorized" with a sentence that says what is missing and why.
    expect(res?.status()).toBe(200);
    await expect(
      page.getByText('You need to be signed in').first()
    ).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText('Your settings live on your account').first()
    ).toBeVisible();
  });
});

test.describe('Authenticated Profile Navigation', () => {
  test('retired profile editor URLs redirect to current account settings', async ({
    request,
  }) => {
    for (const path of [
      '/account/profile',
      '/account/profile/edit',
      '/account/profile/contact',
      '/account/profile/address',
      '/account/profile/categories',
      '/account/profile/desc',
      '/account/profile/social',
      '/account/profile/images',
      '/account/profile/gentedepana',
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(308);
      expect(response.headers().location, path).toBe(
        '/account/user/edit#profile'
      );
    }
  });

  // Every /account/* route below renders components/Page/Status401_Unauthorized
  // for anonymous visitors, which shows an UNAUTHORIZED card and then
  // router.replace()s to the sign-in page. So unauthenticated runs cannot
  // assert route-specific content -- all eight routes produce the same page.
  // What they CAN assert is that the account page is not served to an anonymous
  // visitor, which is the actual security-relevant behaviour and is what
  // `expect(res?.status()).toBe(200)` alone did not check: a stub answering 200
  // everywhere satisfied it. Asserting route-specific content here needs the
  // storageState fixture this file's header has promised since it was written.

  test('account profile edit page sends anonymous visitors to sign in', async ({
    page,
  }) => {
    const res = await page.goto('/account/profile/edit', {
      waitUntil: 'domcontentloaded',
    });

    expect(res?.status()).toBe(200);
    await expectSignInPage(page);
  });

  test('account profile contact page sends anonymous visitors to sign in', async ({
    page,
  }) => {
    const res = await page.goto('/account/profile/contact', {
      waitUntil: 'domcontentloaded',
    });

    expect(res?.status()).toBe(200);
    await expectSignInPage(page);
  });

  test('account profile address page sends anonymous visitors to sign in', async ({
    page,
  }) => {
    const res = await page.goto('/account/profile/address', {
      waitUntil: 'domcontentloaded',
    });

    expect(res?.status()).toBe(200);
    await expectSignInPage(page);
  });

  test('account profile categories page sends anonymous visitors to sign in', async ({
    page,
  }) => {
    const res = await page.goto('/account/profile/categories', {
      waitUntil: 'domcontentloaded',
    });

    expect(res?.status()).toBe(200);
    await expectSignInPage(page);
  });

  test('account profile desc page sends anonymous visitors to sign in', async ({
    page,
  }) => {
    const res = await page.goto('/account/profile/desc', {
      waitUntil: 'domcontentloaded',
    });

    expect(res?.status()).toBe(200);
    await expectSignInPage(page);
  });

  test('account profile social page sends anonymous visitors to sign in', async ({
    page,
  }) => {
    const res = await page.goto('/account/profile/social', {
      waitUntil: 'domcontentloaded',
    });

    expect(res?.status()).toBe(200);
    await expectSignInPage(page);
  });

  test('account profile images page sends anonymous visitors to sign in', async ({
    page,
  }) => {
    const res = await page.goto('/account/profile/images', {
      waitUntil: 'domcontentloaded',
    });

    expect(res?.status()).toBe(200);
    await expectSignInPage(page);
  });

  test('account profile gentedepana page sends anonymous visitors to sign in', async ({
    page,
  }) => {
    const res = await page.goto('/account/profile/gentedepana', {
      waitUntil: 'domcontentloaded',
    });

    expect(res?.status()).toBe(200);
    await expectSignInPage(page);
  });
});

// The '404 Error Prevention' describe that stood here looped all ten
// /account/* routes asserting only that each returned 200. Every one of those
// routes already has its own test above asserting status AND the sign-in
// redirect that actually protects it, so the loop asserted strictly less than
// what it duplicated -- and a static stub answering 200 on every path passed
// it. Its original form checked the document title and URL string for '404',
// neither of which can detect this app's not-found page: it keeps the default
// "Pana Mia" title and is served in place, with no /404 redirect. Removed
// rather than rewritten, because the per-route tests are the stronger version
// of the same claim.
