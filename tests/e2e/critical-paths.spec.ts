import { test, expect } from '@playwright/test';
import { installNativeApiFixtures } from './fixtures/native-app-api';

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
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/support-pana$/);
    await expect(page.locator('h1').first()).toContainText(
      'The future is local.'
    );
    // Don't wait for networkidle - Stripe may have pending requests
  });
});

test.describe('Live donation checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', (route) =>
      route.fulfill({ json: null })
    );
    await page.goto('/support-pana', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-donation-page]')).toHaveAttribute(
      'data-donation-ready',
      'true'
    );
  });

  test('uses the exact mock hero, story, monthly cards, and amount controls', async ({
    page,
  }) => {
    await expect(page).toHaveTitle('Support Pana | Pana MIA');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/support-pana$/
    );
    await expect(page.getByText('Design preview', { exact: true })).toHaveCount(
      0
    );
    await expect(page.locator('[data-donation-mock]')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Continue to checkout' })
    ).toBeVisible();
    await expect(
      page.getByRole('form').locator('input[type="email"]')
    ).toHaveCount(0);
    const hero = await page
      .locator('[data-donation-page] > header')
      .evaluate((el) => el.outerHTML);
    const story = await page
      .locator('#our-impact')
      .evaluate((el) => el.outerHTML);
    const levels = await page
      .getByRole('region', { name: 'Small gifts. Strong roots.' })
      .evaluate((el) => el.outerHTML);
    const amounts = await page
      .getByRole('group', { name: 'Gift amount' })
      .evaluate((el) => el.outerHTML);
    await page.goto('/mock/donate', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-donation-page]')).toHaveAttribute(
      'data-donation-ready',
      'true'
    );
    expect(
      await page
        .locator('[data-donation-page] > header')
        .evaluate((el) => el.outerHTML)
    ).toBe(hero);
    expect(
      await page.locator('#our-impact').evaluate((el) => el.outerHTML)
    ).toBe(story);
    expect(
      await page
        .getByRole('region', { name: 'Small gifts. Strong roots.' })
        .evaluate((el) => el.outerHTML)
    ).toBe(levels);
    expect(
      await page
        .getByRole('group', { name: 'Gift amount' })
        .evaluate((el) => el.outerHTML)
    ).toBe(amounts);
  });

  test('the donation endpoint rejects invalid and cross-origin requests before Stripe', async ({
    page,
    request,
  }) => {
    const origin = new URL(page.url()).origin;
    const invalid = await request.post(
      `${origin}/api/create-checkout-session`,
      {
        headers: { Origin: origin },
        data: { amount: 49, isRecurring: true },
      }
    );
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).message).toContain(
      'between $0.50 and $999,999.99'
    );
    const crossOrigin = await request.post(
      `${origin}/api/create-checkout-session`,
      {
        headers: { Origin: 'https://another.example' },
        data: { amount: 1500, isRecurring: false },
      }
    );
    expect(crossOrigin.status()).toBe(403);
  });

  test('sends exact one-time and monthly gifts to the live checkout endpoint', async ({
    page,
  }) => {
    const bodies: unknown[] = [];
    await page.route('**/api/create-checkout-session', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({
        json: { url: 'https://checkout.stripe.com/c/pay/cs_test_ui' },
      });
    });
    await page.route('https://checkout.stripe.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Secure checkout boundary fixture</h1>',
      })
    );
    await page
      .getByRole('radio', { name: '$15 per month', exact: true })
      .check();
    await page.getByText('Add a dedication or note', { exact: false }).click();
    await page
      .getByLabel('Put my gift toward')
      .selectOption({ label: 'Community directory' });
    await page
      .getByLabel('Your note', { exact: true })
      .fill('  Keep local growing!  ');
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await expect(page).toHaveURL(
      'https://checkout.stripe.com/c/pay/cs_test_ui'
    );
    expect(bodies).toEqual([
      {
        amount: 1500,
        isRecurring: true,
        dedicate: 'Directory',
        comment: 'Keep local growing!',
      },
    ]);
    await page.goto('/support-pana', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-donation-page]')).toHaveAttribute(
      'data-donation-ready',
      'true'
    );
    await page.getByRole('radio', { name: 'One time', exact: true }).check();
    await page
      .getByRole('radio', { name: '$40 one time', exact: true })
      .check();
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await expect(page).toHaveURL(
      'https://checkout.stripe.com/c/pay/cs_test_ui'
    );
    expect(bodies[1]).toEqual({
      amount: 4000,
      isRecurring: false,
      dedicate: '',
      comment: '',
    });
  });

  test('locks pending checkout, prevents duplicate submits, and allows retry after failure', async ({
    page,
  }) => {
    let requests = 0;
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/create-checkout-session', async (route) => {
      requests++;
      if (requests === 1) {
        await pending;
        await route.fulfill({
          status: 503,
          json: { message: 'The payment service is temporarily unavailable.' },
        });
      } else {
        await route.fulfill({
          json: { url: 'https://checkout.stripe.com/c/pay/cs_test_retry' },
        });
      }
    });
    await page.route('https://checkout.stripe.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Secure checkout boundary fixture</h1>',
      })
    );
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await expect(
      page.getByRole('button', { name: 'Opening secure checkout...' })
    ).toBeDisabled();
    await expect(
      page.getByRole('radio', { name: 'One time', exact: true })
    ).toBeDisabled();
    await page.locator('#giving-form').evaluate((element) => {
      if (!(element instanceof HTMLFormElement))
        throw new Error('Missing donation form');
      element.requestSubmit();
    });
    expect(requests).toBe(1);
    if (!release) throw new Error('Missing checkout response gate');
    release();
    await expect(page.getByRole('alert')).toContainText(
      'The payment service is temporarily unavailable.'
    );
    await expect(
      page.getByRole('button', { name: 'Continue to checkout' })
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await expect(page).toHaveURL(
      'https://checkout.stripe.com/c/pay/cs_test_retry'
    );
    expect(requests).toBe(2);
  });

  test('does not submit invalid amounts or follow an unsafe checkout URL', async ({
    page,
  }) => {
    let requests = 0;
    await page.route('**/api/create-checkout-session', async (route) => {
      requests++;
      await route.fulfill({
        json: { url: 'javascript:alert("not-checkout")' },
      });
    });
    await page
      .getByRole('radio', { name: 'Other amount', exact: true })
      .check();
    await page.getByLabel('Your own amount (USD)').fill('12.345');
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'between $0.50 and $999,999.99'
    );
    expect(requests).toBe(0);
    await page.getByLabel('Your own amount (USD)').fill('12.50');
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Could not open secure checkout.'
    );
    await expect(
      page.getByRole('button', { name: 'Continue to checkout' })
    ).toBeEnabled();
    await expect(page).toHaveURL(/\/support-pana$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(requests).toBe(1);
  });

  test('restores canceled gifts and recognizes monthly support below membership tiers', async ({
    page,
  }) => {
    await page.goto('/donate?canceled=1&frequency=one-time&amount=4000', {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('radio', { name: '$40 one time', exact: true })
    ).toBeChecked();
    await expect(
      page.getByText(
        'Checkout was canceled. Your gift selection has been restored.'
      )
    ).toBeVisible();
    await page.goto('/support-pana?canceled=1&frequency=monthly&amount=1250', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByLabel('Your own amount (USD)')).toHaveValue('12.50');
    await expect(
      page.getByRole('status', { name: 'Gift summary' })
    ).toContainText('$150 over a year - dePana');
    await page.goto('/support-pana?canceled=1&frequency=weekly&amount=1e3', {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByText('Checkout was canceled. Please choose your gift again.')
    ).toBeVisible();
    await page.goto('/donation/confirmation?frequency=monthly&tier=0&amt=50', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { level: 2 })).toContainText(
      'monthly support'
    );
    await expect(
      page.getByText('These features should be activated', { exact: false })
    ).toHaveCount(0);
  });

  test('keeps native donations one-time and mission-only', async ({ page }) => {
    await page.addInitScript(() => {
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      Object.assign(window, { androidBridge: { postMessage: () => {} } });
    });
    await installNativeApiFixtures(page);
    let body: unknown;
    await page.route('**/api/create-checkout-session', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({
        status: 503,
        json: { message: 'Native checkout boundary fixture' },
      });
    });
    await page.goto('/donate', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/support-pana$/);
    await expect(page.locator('[data-donation-page]')).toHaveAttribute(
      'data-native-donation',
      'true'
    );
    await expect(page.locator('[data-donation-page]')).toHaveAttribute(
      'data-donation-ready',
      'true'
    );
    await expect(
      page.getByRole('radio', { name: 'Monthly', exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Small gifts. Strong roots.' })
    ).toHaveCount(0);
    await expect(
      page.getByText('They do not unlock app features or digital content.', {
        exact: false,
      })
    ).toBeVisible();
    await page
      .getByRole('radio', { name: '$40 one time', exact: true })
      .check();
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Native checkout boundary fixture'
    );
    expect(body).toEqual({
      amount: 4000,
      isRecurring: false,
      dedicate: '',
      comment: '',
    });
  });

  test('permanently redirects the legacy URL with query values and fragments intact', async ({
    page,
    request,
  }) => {
    const legacy =
      '/donate?canceled=1&frequency=monthly&amount=1250&utm_source=pana%20newsletter&tag=a&tag=b&next=https%3A%2F%2Fexample.test%2F';
    const response = await request.get(legacy, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    const target = new URL(response.headers().location, page.url());
    expect(target.pathname).toBe('/support-pana');
    expect(target.searchParams.get('canceled')).toBe('1');
    expect(target.searchParams.get('frequency')).toBe('monthly');
    expect(target.searchParams.get('amount')).toBe('1250');
    expect(target.searchParams.get('utm_source')).toBe('pana newsletter');
    expect(target.searchParams.getAll('tag')).toEqual(['a', 'b']);
    expect(target.searchParams.get('next')).toBe('https://example.test/');
    await page.goto(`${legacy}#giving-form`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/support-pana\?.*#giving-form$/);
    await expect(page.getByLabel('Your own amount (USD)')).toHaveValue('12.50');
  });

  test('keeps giving-circle and sponsorship section links usable', async ({
    page,
  }) => {
    const navigation = page.getByRole('navigation', {
      name: 'Support Pana sections',
    });
    await navigation.getByRole('link', { name: 'Giving Circle' }).click();
    await expect(page).toHaveURL(/\/support-pana#giving-circle$/);
    await expect(page.locator('#giving-circle')).toBeInViewport();
    await expect(
      page
        .locator('#giving-circle')
        .getByRole('link', { name: 'Choose $15 monthly' })
    ).toBeVisible();
    await navigation.getByRole('link', { name: 'Sponsorship' }).click();
    await expect(page).toHaveURL(/\/support-pana#sponsorship$/);
    await expect(page.locator('#sponsorship')).toBeInViewport();
    await expect(
      page.locator('#sponsorship').getByRole('heading', { level: 3 })
    ).toHaveText(['Program sponsor', 'Event partner', 'Story partner']);
    await expect(
      page.getByRole('link', { name: 'Start a sponsorship conversation' })
    ).toHaveAttribute('href', '/form/contact-us');
    await page
      .getByRole('contentinfo')
      .getByRole('link', {
        name: 'Donate',
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/support-pana#giving-form$/);
    await expect(page.locator('#giving-form')).toBeInViewport();
  });
});

test.describe('Donation design mock', () => {
  test.beforeEach(async ({ page }) => {
    const response = await page.goto('/mock/donate', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-donation-mock]')).toHaveAttribute(
      'data-donation-mock-ready',
      'true'
    );
    await expect(page).toHaveTitle('Give local (mock) | Pana MIA');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'The future is local.'
    );
  });

  test('previews a monthly gift without making a payment request', async ({
    page,
  }) => {
    const paymentRequests: string[] = [];
    await page.route('**/api/create-checkout-session', async (route) => {
      paymentRequests.push(route.request().url());
      await route.abort();
    });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/
    );
    await expect(
      page.getByRole('radio', { name: 'Monthly', exact: true })
    ).toBeChecked();
    await expect(
      page.getByRole('status', { name: 'Gift summary' })
    ).toContainText('$180 over a year - Pana Confiado');
    await page.getByText('Add a dedication or note', { exact: false }).click();
    await page
      .getByLabel('Put my gift toward')
      .selectOption({ label: 'Community directory' });
    await page
      .getByLabel('Your note', { exact: true })
      .fill('Keep local growing!');
    const continueButton = page.getByRole('button', {
      name: 'Continue to preview',
    });
    await continueButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      'This is a checkout preview, not a completed donation.'
    );
    await expect(dialog).toContainText(
      'Stripe would charge $15 USD every month until canceled.'
    );
    await expect(dialog).toContainText('Community directory');
    await expect(dialog).toContainText('Keep local growing!');
    await expect(dialog.locator('input, textarea, iframe')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(continueButton).toBeFocused();
    expect(paymentRequests).toEqual([]);
  });

  test('keeps separate one-time and monthly amounts and exact cents', async ({
    page,
  }) => {
    const once = page.getByRole('radio', { name: 'One time', exact: true });
    const monthly = page.getByRole('radio', { name: 'Monthly', exact: true });
    const summary = page.getByRole('status', { name: 'Gift summary' });
    await once.check();
    await expect(
      page.getByRole('group', { name: 'Gift amount' }).getByRole('radio')
    ).toHaveCount(8);
    await page
      .getByRole('radio', { name: '$40 one time', exact: true })
      .check();
    await monthly.check();
    await expect(
      page.getByRole('radio', { name: '$15 per month', exact: true })
    ).toBeChecked();
    await page
      .getByRole('radio', { name: 'Other amount', exact: true })
      .check();
    await page.getByLabel('Your own amount (USD)').fill('12.50');
    await expect(summary).toContainText('$12.50');
    await expect(summary).toContainText('$150 over a year - dePana');
    await once.check();
    await expect(
      page.getByRole('radio', { name: '$40 one time', exact: true })
    ).toBeChecked();
    await expect(summary).toContainText('Your gift today');
    await expect(summary).not.toContainText('over a year');
    await page.getByRole('button', { name: 'Continue to preview' }).click();
    await expect(page.getByRole('dialog')).toContainText(
      'Stripe would charge $40 USD once, with no recurring payment.'
    );
    await page.getByRole('button', { name: 'Back to my gift' }).click();
    await monthly.check();
    await expect(page.getByLabel('Your own amount (USD)')).toHaveValue('12.50');
    await expect(
      page.getByRole('radio', { name: 'Other amount', exact: true })
    ).toBeChecked();
    await page.reload();
    await expect(
      page.getByRole('radio', { name: '$15 per month', exact: true })
    ).toBeChecked();
    await expect(page.getByLabel('Your own amount (USD)')).toHaveValue('');
  });

  test('rejects invalid custom gifts rather than rounding or opening checkout', async ({
    page,
  }) => {
    const input = page.getByLabel('Your own amount (USD)');
    await page
      .getByRole('radio', { name: 'Other amount', exact: true })
      .check();
    for (const value of [
      '',
      '0',
      '-10',
      '0.49',
      '12.345',
      '1e2',
      '1000000',
      'abc',
    ]) {
      await input.fill(value);
      await page.getByRole('button', { name: 'Continue to preview' }).click();
      await expect(page.getByRole('alert')).toContainText(
        'between $0.50 and $999,999.99'
      );
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(input).toBeFocused();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    for (const [value, formatted] of [
      ['0.50', '$0.50'],
      ['999999.99', '$999,999.99'],
    ]) {
      await input.fill(value);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.getByRole('button', { name: 'Continue to preview' }).click();
      await expect(page.getByRole('dialog')).toContainText(
        `Stripe would charge ${formatted} USD every month until canceled.`
      );
      await page.getByRole('button', { name: 'Back to my gift' }).click();
    }
  });

  test('monthly cards select a gift and frequency radios work by keyboard', async ({
    page,
  }) => {
    const monthly = page.getByRole('radio', { name: 'Monthly', exact: true });
    await monthly.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(
      page.getByRole('radio', { name: 'One time', exact: true })
    ).toBeChecked();
    await page.keyboard.press('ArrowRight');
    await expect(monthly).toBeChecked();
    await page.getByRole('radio', { name: 'One time', exact: true }).check();
    await page
      .getByRole('link', { name: 'Choose $10 monthly', exact: true })
      .click();
    await expect(monthly).toBeChecked();
    await expect(
      page.getByRole('radio', { name: '$10 per month', exact: true })
    ).toBeChecked();
    await expect(
      page.getByRole('form', { name: 'Choose your gift' })
    ).toBeFocused();
    await expect(
      page.getByRole('status', { name: 'Gift summary' })
    ).toContainText('$120 over a year - dePana');
    await page
      .getByRole('link', { name: 'Choose $25 monthly', exact: true })
      .click();
    await expect(
      page.getByRole('radio', { name: '$25 per month', exact: true })
    ).toBeChecked();
    await expect(
      page.getByRole('status', { name: 'Gift summary' })
    ).toContainText('$300 over a year - Pana Real');
  });

  test('keeps the form and preview inside narrow and wide viewports', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const dimensions = await page
        .locator('[data-donation-mock]')
        .evaluate((element) => ({
          content: element.scrollWidth,
          viewport: element.clientWidth,
        }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
      const continueButton = page.getByRole('button', {
        name: 'Continue to preview',
      });
      const buttonBounds = await continueButton.boundingBox();
      expect(buttonBounds?.height).toBeGreaterThanOrEqual(44);
      await continueButton.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeInViewport({ ratio: 1 });
      await expect(
        dialog.getByRole('button', { name: 'Back to my gift' })
      ).toBeInViewport({ ratio: 1 });
      await dialog.getByRole('button', { name: 'Back to my gift' }).click();
    }
  });
});

test.describe('Donation design mock without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('keeps the giving controls disabled instead of submitting a native form', async ({
    page,
  }) => {
    const response = await page.goto('/mock/donate', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-donation-mock]')).toHaveAttribute(
      'data-donation-mock-ready',
      'false'
    );
    await expect(
      page.getByRole('button', { name: 'Continue to preview' })
    ).toBeDisabled();
    await expect(
      page.getByRole('radio', { name: 'Monthly', exact: true })
    ).toBeDisabled();
    await expect(page.getByLabel('Your own amount (USD)')).toBeDisabled();
    await expect(
      page.getByText('Loading preview - JavaScript is required.')
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /^Choose \$\d+ monthly$/ })
    ).toHaveCount(0);
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
