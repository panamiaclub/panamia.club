import { expect, test, type Page } from '@playwright/test';

import type { BillingDetails } from '@/lib/billing';
import { installNativeApiFixtures } from './fixtures/native-app-api';

test.use({ timezoneId: 'UTC' });

async function installBillingFixtures(page: Page) {
  await installNativeApiFixtures(page);
  const portalBodies: unknown[] = [];
  const data: BillingDetails = {
    customers: [
      {
        id: 'cus_ui_donor',
        email: 'native@example.invalid',
        subscriptions: [
          {
            id: 'sub_ui_donation',
            status: 'active',
            cancelAtPeriodEnd: false,
            cancelAt: null,
            currentPeriodEnd: '2026-12-01T00:00:00.000Z',
            items: [
              {
                name: 'Donation',
                amount: 1550,
                currency: 'usd',
                interval: 'month',
                intervalCount: 1,
              },
            ],
          },
        ],
      },
    ],
  };
  const state = {
    data,
    fail: false,
    portalBodies,
    portalUrl: 'https://billing.stripe.com/p/session/ui-fixture',
    returnUrl: '',
  };

  await page.route('**/api/getSessionUser', (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'native-test-user',
          email: 'native@example.invalid',
          name: 'Native Viewer',
          screenname: 'native-viewer',
          accountType: 'personal',
        },
      },
    })
  );
  await page.route('**/api/getProfile', (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'personal',
          _id: 'personal',
          name: 'Native Viewer',
          screenname: 'native-viewer',
          defaultCcLicense: 'cc-by-4',
          images: { primaryCDN: '/logos/pana_logo_long_orange.png' },
        },
      },
    })
  );
  await page.route('**/api/user/screenname/check?*', (route) =>
    route.fulfill({ json: { available: true } })
  );
  for (const path of ['/api/crm/contact', '/api/crm/sms-subscription']) {
    await page.route(`**${path}`, (route) =>
      route.fulfill({ json: { data: null } })
    );
  }
  await page.route('**/api/referrals/me', (route) =>
    route.fulfill({
      json: {
        code: null,
        referralUrl: null,
        milestones: { people: 0, accounts: 0, directory: 0, connectors: 0 },
      },
    })
  );
  await page.route('**/api/account/billing', (route) =>
    route.fulfill(
      state.fail
        ? {
            status: 503,
            json: { error: 'Billing is temporarily unavailable.' },
          }
        : { json: state.data }
    )
  );
  await page.route('**/api/account/billing/portal', (route) => {
    state.portalBodies.push(route.request().postDataJSON());
    state.returnUrl = `${new URL(route.request().url()).origin}/account/user/edit#billing`;
    return route.fulfill({
      json: { url: state.portalUrl },
    });
  });
  await page.route('https://billing.stripe.com/**', (route) => {
    return route.fulfill({
      contentType: 'text/html',
      body: `<h1>Stripe portal fixture</h1><a href="${state.returnUrl}">Return to Pana</a>`,
    });
  });
  return state;
}

test('the account navigation exposes recurring donations and Stripe management', async ({
  page,
}) => {
  await installBillingFixtures(page);
  await page.goto('/account/user/edit', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Subscriptions & donations' })
    .click();
  await expect(page).toHaveURL(/\/account\/user\/edit#billing$/);
  const billing = page.locator('#billing');
  await expect(billing.getByRole('heading')).toHaveText(
    'Subscriptions & donations'
  );
  await expect(
    billing.getByText('$15.50 per month', { exact: true })
  ).toBeVisible();
  await expect(billing.getByText('active', { exact: true })).toBeVisible();
  await expect(
    billing.getByRole('button', { name: 'Manage in Stripe' })
  ).toBeVisible();
  await expect(
    billing.getByText('One-time gifts', { exact: true })
  ).toBeVisible();
});

test('the selected customer opens Stripe and cancellation is current on return', async ({
  page,
}) => {
  const state = await installBillingFixtures(page);
  await page.goto('/account/user/edit#billing', {
    waitUntil: 'domcontentloaded',
  });
  await page
    .locator('#billing')
    .getByRole('button', { name: 'Manage in Stripe' })
    .click();
  await expect(page).toHaveURL(
    'https://billing.stripe.com/p/session/ui-fixture'
  );
  expect(state.portalBodies).toEqual([{ customerId: 'cus_ui_donor' }]);
  state.data.customers[0].subscriptions[0].status = 'canceled';
  await page.getByRole('link', { name: 'Return to Pana' }).click();
  await expect(page).toHaveURL(/\/account\/user\/edit#billing$/);
  await expect(
    page.locator('#billing').getByText('canceled', { exact: true })
  ).toBeVisible();
});

test('billing failures are not presented as empty accounts and can be retried', async ({
  page,
}) => {
  const state = await installBillingFixtures(page);
  state.fail = true;
  await page.goto('/account/user/edit#billing', {
    waitUntil: 'domcontentloaded',
  });

  const billing = page.locator('#billing');
  await expect(billing.getByRole('alert')).toHaveText(
    'Billing is temporarily unavailable.'
  );
  await expect(
    billing.getByText('No subscriptions or recurring donations found')
  ).toHaveCount(0);
  state.fail = false;
  await billing.getByRole('button', { name: 'Try again' }).click();
  await expect(
    billing.getByText('$15.50 per month', { exact: true })
  ).toBeVisible();
});

test('an insecure portal URL leaves the donor on Pana with an actionable error', async ({
  page,
}) => {
  const state = await installBillingFixtures(page);
  state.portalUrl = 'http://billing.stripe.com/insecure-fixture';
  await page.route('http://billing.stripe.com/**', (route) =>
    route.fulfill({ body: 'Unexpected insecure navigation' })
  );
  await page.goto('/account/user/edit#billing', {
    waitUntil: 'domcontentloaded',
  });
  const billing = page.locator('#billing');
  await billing.getByRole('button', { name: 'Manage in Stripe' }).click();
  await expect(billing.getByRole('alert')).toHaveText(
    'Stripe did not return a secure billing URL'
  );
  await expect(
    billing.getByRole('button', { name: 'Manage in Stripe' })
  ).toBeEnabled();
  await expect(page).toHaveURL(/\/account\/user\/edit#billing$/);
});

test('empty accounts explain guest matching and offer another gift', async ({
  page,
}) => {
  const state = await installBillingFixtures(page);
  state.data.customers = [];
  await page.goto('/account/user/edit#billing', {
    waitUntil: 'domcontentloaded',
  });
  const billing = page.locator('#billing');
  await expect(
    billing.getByText('No subscriptions or recurring donations found')
  ).toBeVisible();
  await expect(
    billing.getByRole('link', { name: 'Support Pana' })
  ).toHaveAttribute('href', '/support-pana');
  await expect(
    billing.getByRole('button', { name: 'Manage in Stripe' })
  ).toHaveCount(0);
});

test('scheduled cancellation and the management action remain usable on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await installBillingFixtures(page);
  state.data.customers[0].subscriptions[0].cancelAtPeriodEnd = true;
  state.data.customers[0].subscriptions[0].cancelAt =
    '2026-12-01T00:00:00.000Z';
  await page.goto('/account/user/edit#billing', {
    waitUntil: 'domcontentloaded',
  });
  const billing = page.locator('#billing');
  await expect(billing.getByText('Cancels on Dec 1, 2026')).toBeVisible();
  await expect(
    billing.getByRole('button', { name: 'Manage in Stripe' })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
