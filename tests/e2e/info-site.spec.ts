import { test, expect, type Page } from '@playwright/test';
import { INFO_LINKS, getInfoCanonicalUrl } from '../../lib/info-site';
import en from '../../locales/en/info.json' with { type: 'json' };

const TURNSTILE_SCRIPT = `
window.turnstile = {
  render(element, options) {
    const widget = document.createElement('div');
    widget.style.width = '300px';
    widget.textContent = 'Security check passed';
    element.appendChild(widget);
    setTimeout(() => options.callback('info-test-token'), 0);
    return 'info-test-widget';
  },
  remove() {},
  reset() {}
};
`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('i18nextLng')) {
      localStorage.setItem('i18nextLng', 'en');
    }
  });
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: null })
  );
  await page.route('**/api/config/turnstile', (route) =>
    route.fulfill({ json: { siteKey: 'info-test-site-key' } })
  );
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: TURNSTILE_SCRIPT,
    })
  );
});

async function fillNewsletter(page: Page) {
  await expect(
    page.getByText('Security check passed', { exact: true })
  ).toBeVisible();
  await page.getByLabel('Name (optional)', { exact: true }).fill('Local Pana');
  await page
    .getByLabel('Email address', { exact: true })
    .fill('pana@example.org');
  await page.getByLabel(en.newsletter.consent, { exact: true }).check();
  await expect(
    page.getByRole('button', { name: en.newsletter.submit, exact: true })
  ).toBeEnabled();
}

test('the staged info page has current links, legal pages, and its own chrome', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto('/info');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'The future is local.'
  );
  await expect(page).toHaveTitle('Pana MIA Club | The Future Is Local');
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    getInfoCanonicalUrl()
  );

  for (const { id, href } of INFO_LINKS) {
    const { title, description } = en.paths[id];
    await expect(
      page.getByRole('link', { name: `${title} ${description}`, exact: true })
    ).toHaveAttribute('href', href);
  }
  const footer = page.getByRole('contentinfo');
  await expect(
    footer.getByRole('link', { name: 'Privacy Policy', exact: true })
  ).toHaveAttribute('href', '/legal/privacy');
  await expect(
    footer.getByRole('link', { name: 'Terms of Service', exact: true })
  ).toHaveAttribute('href', '/legal/terms');
  await expect(
    page.getByText('Security check passed', { exact: true })
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('the info hostname serves the same page at its root', async ({
  page,
}, testInfo) => {
  const url = new URL('/', testInfo.project.use.baseURL);
  url.hostname = 'info.localhost';
  const response = await page.goto(url.href);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'The future is local.'
  );
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
});

test('the printed zine QR URL reaches the info page and preserves tracking', async ({
  page,
}, testInfo) => {
  const url = new URL(
    '/linkedin-bio?fbclid=printed-zine&utm_source=zine',
    testInfo.project.use.baseURL
  );
  url.hostname = 'info.localhost';
  const response = await page.goto(url.href);
  const redirect = await response?.request().redirectedFrom()?.response();
  expect(redirect?.status()).toBe(308);
  expect(await redirect?.headerValue('location')).toBe(`/info${url.search}`);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(new URL(`/info${url.search}`, url).href);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'The future is local.'
  );
});

test('the old newsletter URL reaches the new signup section', async ({
  page,
}) => {
  const redirect = await page.request.get('/newsletter-sign-up-702983', {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe('/info#newsletter-signup');
  const response = await page.goto('/newsletter-sign-up-702983');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/info#newsletter-signup$/);
  await expect(
    page.getByRole('heading', { name: en.newsletter.title, exact: true })
  ).toBeVisible();
});

test('the info page switches to Spanish', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/info');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(async () => {
    if ((await heading.textContent()) !== 'El futuro es local.') {
      await page.getByRole('button', { name: 'Read in Spanish' }).click();
    }
    await expect(heading).toHaveText('El futuro es local.', { timeout: 1000 });
  }).toPass();
  await expect(
    page.getByRole('button', { name: 'Leer en inglés' })
  ).toBeVisible();
  await expect(
    page.getByLabel('Correo electrónico', { exact: true })
  ).toBeVisible();
  await page.reload();
  await expect(heading).toHaveText('El futuro es local.');
  await expect(page.locator('#info-top')).toHaveAttribute('lang', 'es');
  await expect(
    page.getByText('Security check passed', { exact: true })
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('newsletter signup requires consent and sends the existing API payload', async ({
  page,
}) => {
  let payload: unknown;
  await page.route('**/api/createSignup', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ json: { success: true } });
  });
  await page.goto('/info');
  await expect(
    page.getByRole('button', { name: en.newsletter.submit, exact: true })
  ).toBeDisabled();
  await fillNewsletter(page);
  await page
    .getByRole('button', { name: en.newsletter.submit, exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(en.newsletter.success);
  expect(payload).toEqual({
    name: 'Local Pana',
    email: 'pana@example.org',
    signup_type: 'info_site',
    turnstileToken: 'info-test-token',
  });
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(
    ''
  );
});

for (const failure of ['duplicate', 'server', 'network'] as const) {
  test(`newsletter ${failure} failures never claim success or erase the email`, async ({
    page,
  }) => {
    await page.route('**/api/createSignup', (route) => {
      if (failure === 'network') return route.abort();
      return route.fulfill(
        failure === 'duplicate'
          ? { json: { error: 'You are already registered.' } }
          : { status: 503, json: { error: 'Unavailable' } }
      );
    });
    await page.goto('/info');
    await fillNewsletter(page);
    await page
      .getByRole('button', { name: en.newsletter.submit, exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      failure === 'duplicate' ? en.newsletter.duplicate : en.newsletter.failed
    );
    await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(
      'pana@example.org'
    );
    await expect(
      page.getByText(en.newsletter.success, { exact: true })
    ).toHaveCount(0);
  });
}

test('a blocked security challenge has a visible error and disables signup', async ({
  page,
}) => {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.abort()
  );
  await page.goto('/info');
  await expect(page.getByRole('alert')).toContainText(
    en.newsletter.unavailable
  );
  await expect(
    page.getByRole('button', { name: en.newsletter.submit, exact: true })
  ).toBeDisabled();
});

test('the info page fits a narrow mobile screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/info');
  await fillNewsletter(page);
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
});
