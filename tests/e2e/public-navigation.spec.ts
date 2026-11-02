import { test, expect } from '@playwright/test';

// These tests used to assert `not.toHaveTitle(/404/)` plus a `toHaveURL`
// substring. Both were inert:
//
//   - This app's not-found page renders <h1>404 - Page Not Found</h1> but keeps
//     the default <title>Pana Mia</title>. A title-based 404 check therefore
//     never fired on the page it was written to catch. Measured directly
//     against /form/become-a-pana-single, a route that 404s today.
//   - An unanchored toHaveURL matched the path anywhere in the URL, including
//     inside a query string, so /become-a-pana "passed" while sitting on
//     /signin?callbackUrl=/form/become-a-pana.
//
// Together they passed against a stub server that served one static page for
// every route (14 of 24 tests in this file, measured). Each test now asserts
// the HTTP status and a heading only that route renders, so a wrong page, a
// blank page and a 404 all fail. The URL is asserted only where a redirect is
// the behaviour under test, and anchored to the origin so a callbackUrl cannot
// satisfy it.

test.describe('Public Navigation', () => {
  test('homepage loads successfully', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/Pana Mia/i);
    await expect(page.locator('h1').first()).toContainText('The Future');
  });

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    test(`homepage tagline scales at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const res = await page.goto('/');
      expect(res?.status()).toBe(200);

      const headline = page.locator('.home-hero-field .hero-headline');
      const tagline = page.locator('.home-hero-field .hero-subheadline');
      await expect(tagline).toHaveText(
        'Your Portal for Everything South Florida'
      );
      await expect(tagline.locator('strong')).toHaveCSS('font-weight', '700');

      const [headlineSize, taglineSize] = await Promise.all(
        [headline, tagline].map((locator) =>
          locator.evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize)
          )
        )
      );
      expect(taglineSize).toBeCloseTo(Math.max(17, headlineSize / 3), 2);
    });
  }

  test('about page loads', async ({ page }) => {
    const res = await page.goto('/about-us');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText(
      'Local is a relationship'
    );
  });

  for (const [path, heading] of [
    ['/our-impact', 'Our Impact'],
    ['/ecosystem', 'Our Ecosystem'],
    ['/support-pana', 'Support Pana'],
    ['/programs', 'Programs'],
  ]) {
    test(`${path} parent page loads`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1').first()).toContainText(heading);
    });
  }

  test('directory search loads', async ({ page }) => {
    const res = await page.goto('/directory/search');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText('Directory search');
  });

  // The scope menu moved to the home hero and the four scopes became four
  // pages. These assert the halves of that: the menu exists where the search
  // is now chosen, and each scope's page answers on its own route.
  test('home search offers a scope menu', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(
      page.getByRole('button', { name: /Search scope/ })
    ).toBeVisible();
  });

  // Public social pages wear the same masthead as the feed, so category
  // discovery must remain usable without exposing member-only search.
  test('social masthead offers categories and locks member discovery', async ({
    page,
  }) => {
    const res = await page.goto('/groups');
    expect(res?.status()).toBe(200);

    const masthead = page.getByRole('banner');
    const input = masthead.getByRole('combobox', {
      name: 'Find a group...',
      exact: true,
    });
    await expect(input).toHaveAttribute('placeholder', 'Find a group...');
    await expect(masthead.getByRole('search')).toHaveAttribute(
      'action',
      '/groups'
    );
    await expect(
      masthead.getByRole('button', { name: 'Search', exact: true })
    ).toBeVisible();

    const categories = masthead.getByRole('group', {
      name: 'Search categories',
    });
    await expect(async () => {
      if (!(await categories.isVisible())) await input.click();
      await expect(categories).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });

    await expect(categories.getByRole('button')).toHaveCount(4);
    await expect(
      categories.getByRole('button', { name: 'Groups', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      categories.getByRole('button', { name: /Panas/ })
    ).toBeDisabled();
    await expect(
      masthead.getByRole('link', { name: 'Sign in to find members' })
    ).toBeVisible();
  });

  test('panas search page loads', async ({ page }) => {
    const res = await page.goto('/panas');
    expect(res?.status()).toBe(200);
    // Signed out, so the gate rather than the grid. Asserted deliberately:
    // member search is the one scope of the four that is not public, and a
    // regression here would leak rather than merely look wrong.
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('panas matched');
  });

  // /directory/<scope> was how all four scopes were reached before they became
  // separate pages. Those URLs are public and were linked, so they redirect
  // rather than 404. Asserted at the origin so a callbackUrl cannot satisfy it.
  for (const [legacy, destination] of [
    ['/directory/all/art', '/directory/search/art'],
    ['/directory/events/salsa', '/e?q=salsa'],
    ['/directory/groups/art', '/groups?q=art'],
    ['/directory/panas/maria', '/panas?q=maria'],
  ]) {
    test(`${legacy} redirects to ${destination}`, async ({ page }) => {
      const res = await page.goto(legacy, { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBe(200);
      await expect(page).toHaveURL(
        new RegExp(
          `^https?://[^/]+${destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
        )
      );
    });
  }

  test('donate page loads', async ({ page }) => {
    const res = await page.goto('/donate');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText(
      'The future is local.'
    );
  });

  // /affiliate is a redirect shim: it banks an affiliate code in localStorage
  // and then router.replace()s away. The old test asserted toHaveURL(/affiliate/),
  // which only passed by catching the transient pre-redirect URL — it asserted
  // the page had not done the one thing it exists to do.
  test('affiliate link forwards to the homepage', async ({ page }) => {
    const res = await page.goto('/affiliate?code=e2e-smoke');
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/);
    await expect(page.locator('h1').first()).toContainText('The Future');
  });

  test('become a pana forwards to the directory listing form', async ({
    page,
  }) => {
    const res = await page.goto('/become-a-pana');
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/form\/get-listed$/);
    await expect(page.locator('h1').first()).toContainText('Get listed');
  });

  test('contact form loads', async ({ page }) => {
    const res = await page.goto('/form/contact-us');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText('Contact Us');
  });

  test('/contact-us redirects to the contact form', async ({ page }) => {
    const res = await page.goto('/contact-us');
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/form\/contact-us\/?$/);
    await expect(page.locator('h1').first()).toContainText('Contact Us');
  });

  test('links page loads', async ({ page }) => {
    const res = await page.goto('/links');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toHaveText('Pana MIA Club');
  });

  test('podcasts page loads', async ({ page }) => {
    const res = await page.goto('/podcasts');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText(
      'Pana MIA Club Podcasts'
    );
  });

  test('terms of service loads', async ({ page }) => {
    const res = await page.goto('/legal/terms');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText('Terms of Service');
  });

  test('old terms URL redirects to new location', async ({ page }) => {
    const res = await page.goto('/doc/terms-and-conditions');
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/legal\/terms\/?$/);
    await expect(page.locator('h1').first()).toContainText('Terms of Service');
  });

  test('privacy policy loads', async ({ page }) => {
    const res = await page.goto('/legal/privacy');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText('Privacy Policy');
  });

  test('DMCA policy loads', async ({ page }) => {
    const res = await page.goto('/legal/dmca');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText('DMCA Policy');
  });

  test('affiliate terms loads', async ({ page }) => {
    const res = await page.goto('/doc/affiliate-terms-and-conditions');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText(
      'Terms and Conditions'
    );
  });
});

test.describe('Profile Pages', () => {
  test('profile page with valid handle loads', async ({ page }) => {
    // Navigate to directory first to find a valid profile
    await page.goto('/directory/search');

    // `count()` does not auto-wait. The previous `if (count > 0) ... else
    // test.skip()` called it immediately, so under parallel load it read 0
    // before results rendered and turned "not loaded yet" into "no data,
    // skip" -- this test silently removed itself from the suite and its
    // assertions never ran. Wait for the list to settle, then decide.
    const card = page.locator('.dirsearch-card').first();
    const hasResults = await card
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasResults, 'directory search returned no profiles');

    // Capture the name from the card so the destination can be checked against
    // data only this profile renders.
    const name = (
      await card.locator('.dirsearch-card-name').innerText()
    ).trim();
    expect(name.length).toBeGreaterThan(0);

    // Each card carries three links to the same profile. The cover image is
    // `tabindex="-1"`, a decorative duplicate of the name link, and is not what
    // a visitor clicks -- target the real one.
    await card.locator('a[href^="/p/"]:not([tabindex="-1"])').first().click();

    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/p\/[^?#]+/);

    // Profile headings are user data, so assert the one string this route is
    // known to produce: the name carried over from the card. A wrong page and
    // a blank page both fail this, which the 404 negative below cannot do on
    // its own -- it passes on any page lacking the string, including an empty
    // one. Keeping it is only meaningful now that a positive precedes it.
    await expect(page.locator('body')).toContainText(name);
    await expect(page.locator('body')).not.toContainText('Page Not Found');
  });
});

test.describe('Navigation Links', () => {
  test('homepage menu matches the public site map', async ({ page }) => {
    await page.goto('/');

    const trigger = page.getByRole('button', { name: 'Menu', exact: true });
    const drawer = page.getByRole('dialog', { name: 'Menu', exact: true });

    await expect(async () => {
      if (!(await drawer.isVisible())) await trigger.click();
      await expect(drawer).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });

    for (const label of [
      'About Pana',
      'Our Impact',
      'Our Ecosystem',
      'Support Pana',
      'Programs',
      'Shop',
    ]) {
      await expect(
        drawer.getByRole('link', { name: label, exact: true }).first()
      ).toBeVisible();
    }

    await expect(
      drawer.getByRole('link', {
        name: 'Community connectors program',
        exact: true,
      })
    ).toHaveCount(0);

    for (const [parent, children] of [
      ['About Pana', ['Our Story', 'Meet the Team', 'Why local', 'Pillars']],
      [
        'Our Impact',
        [
          'Community connectors program',
          'Stories of Impact',
          'Download our Impact',
        ],
      ],
      [
        'Our Ecosystem',
        [
          'Collaborative Partners',
          'Collaborative Projects',
          'Pana Certified',
          'Sponsors+Funders',
        ],
      ],
      ['Support Pana', ['Giving Circle', 'Sponsorship']],
      [
        'Programs',
        [
          'Pillar Breakdown by Program',
          'Collective Tech',
          'Community Building',
          'Culture Work',
        ],
      ],
    ] as const) {
      const toggle = drawer.getByRole('button', {
        name: `Expand ${parent} submenu`,
        exact: true,
      });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(
        drawer.getByRole('button', {
          name: `Collapse ${parent} submenu`,
          exact: true,
        })
      ).toHaveAttribute('aria-expanded', 'true');

      for (const child of children) {
        await expect(
          drawer.getByRole('link', { name: child, exact: true }).first()
        ).toBeVisible();
      }
    }

    for (const [parent, children] of [
      ['Collective Tech', ['Directory', 'Pana Social']],
      [
        'Community Building',
        ['Connectors Program', 'Collaborative Events (Service Offerings)'],
      ],
      ['Culture Work', ['Pana Ink Press', 'Collaborative Projects']],
    ] as const) {
      await drawer
        .getByRole('button', {
          name: `Expand ${parent} submenu`,
          exact: true,
        })
        .click();

      for (const child of children) {
        await expect(
          drawer.getByRole('link', { name: child, exact: true }).first()
        ).toBeVisible();
      }
    }

    await drawer
      .getByRole('button', {
        name: 'Expand Pana Ink Press submenu',
        exact: true,
      })
      .click();
    await expect(
      drawer.getByRole('link', { name: 'Panavizion', exact: true })
    ).toBeVisible();

    for (const removedLabel of ['Events', 'PanaVizión', 'Get Involved']) {
      await expect(
        drawer.getByRole('link', { name: removedLabel, exact: true })
      ).toHaveCount(0);
    }
  });
});

test.describe('Custom Sign-In Page', () => {
  test('signin page loads successfully', async ({ page }) => {
    const res = await page.goto('/signin');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText(
      'Welcome to Pana MIA'
    );
  });

  test('signin page displays Pana MIA branding', async ({ page }) => {
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });

    // Check for welcome message - wait longer for client-side hydration
    const welcomeText = page.getByText('Welcome to Pana MIA');
    await expect(welcomeText).toBeVisible({ timeout: 15000 });
  });

  // These two tests previously asserted that Google and Apple buttons were
  // always present, and that the email option was always a toggle. Both
  // described the old sign-in page, which rendered every provider whether or
  // not it had credentials, so an unconfigured deployment showed four dead
  // controls above the one path that always works. signin-view.tsx now filters
  // to configured providers, which means neither the buttons nor the toggle
  // exist in an environment with no OAuth secrets — CI being exactly that.
  // Asserting on a specific provider therefore tests the runner's env, not the
  // page. What the page actually guarantees is the two invariants below, and
  // they hold whether zero or four providers are configured.

  test('signin page never renders an unusable OAuth button', async ({
    page,
  }) => {
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });

    // Wait for hydration via something unconditional before counting, so an
    // empty result means "none rendered" rather than "not rendered yet".
    await expect(page.getByText('Welcome to Pana MIA')).toBeVisible({
      timeout: 15000,
    });

    const deadProviderButtons = page.getByRole('button', {
      name: /^Continue with /,
      disabled: true,
    });
    await expect(deadProviderButtons).toHaveCount(0);
  });

  test('signin page always offers an email sign-in path', async ({ page }) => {
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });

    // isVisible() does not auto-wait, so gate on something unconditional
    // first. Without this the toggle check can resolve false purely because
    // React has not hydrated, silently skipping the click and leaving the
    // assertion below to fail 15s later for the wrong reason.
    await expect(page.getByText('Welcome to Pana MIA')).toBeVisible({
      timeout: 15000,
    });

    const emailInput = page.getByPlaceholder('your@email.com');
    const emailToggle = page.getByRole('button', {
      name: 'Sign in with email',
    });

    // With OAuth configured the form sits behind a toggle; with none it is
    // opened directly, because a toggle guarding the only option is a dead
    // click. Accept either route, then assert the destination is the same.
    if (await emailToggle.isVisible()) {
      await emailToggle.click();
    }

    await expect(emailInput).toBeVisible({ timeout: 15000 });
  });

  test('signin page has terms link', async ({ page }) => {
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });

    // Find terms link (may have trailing slash) - wait for hydration
    const termsLink = page.locator('a[href^="/legal/terms"]').first();
    await expect(termsLink).toBeVisible({ timeout: 15000 });
  });

  test('signin page has contact help link', async ({ page }) => {
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });

    // Find the "Contact us" link in the signin card (not footer) - wait for hydration
    const contactLink = page.locator('.max-w-md a[href^="/form/contact-us"]');
    await expect(contactLink).toBeVisible({ timeout: 15000 });
  });

  test('signin page preserves callback URL', async ({ page }) => {
    // Navigate to signin with a callback URL
    const res = await page.goto('/signin?callbackUrl=/m/discover');

    // The sign-in page renders and keeps the callback rather than dropping it
    // on a redirect.
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText(
      'Welcome to Pana MIA'
    );
    await expect(page).toHaveURL(
      /^https?:\/\/[^/]+\/signin\?callbackUrl=(\/|%2F)m(\/|%2F)discover$/
    );
  });
});
