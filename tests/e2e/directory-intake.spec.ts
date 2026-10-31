import { expect, test, type Page } from '@playwright/test';
import copy from '../../locales/en/getListed.json' with { type: 'json' };

const panaEmail = 'ana@personal.test';

async function fixtures(
  page: Page,
  options: {
    signedIn?: boolean;
    invitationSent?: boolean;
    editing?: boolean;
    managerChanged?: boolean;
    online?: boolean;
    addressFailure?: boolean;
  } = {}
) {
  const submissions: Record<string, unknown>[] = [];
  const contactUpdates: Record<string, unknown>[] = [];
  const addressUpdates: Record<string, unknown>[] = [];
  let baseZip = '';
  let contactEmail = 'hello@bakery.test';
  let signedIn = Boolean(options.signedIn);
  let accountEmail = panaEmail;
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' })
  );
  await page.route('https://challenges.cloudflare.com/turnstile/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.turnstile = {
        render: function (element, options) {
          queueMicrotask(function () { options.callback('browser-test-token'); });
          return 'test-widget';
        },
        reset: function () {},
        remove: function () {}
      };`,
    })
  );
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/get-session') {
      await route.fulfill({
        json: signedIn
          ? {
              session: {
                id: 'test-session',
                token: 'test-session-token',
                userId: 'test-pana',
                expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
              },
              user: {
                id: 'test-pana',
                email: accountEmail,
                name: 'Ana Person',
                emailVerified: true,
              },
            }
          : null,
      });
    } else if (path === '/api/config/turnstile') {
      await route.fulfill({ json: { siteKey: '1x00000000000000000000AA' } });
    } else if (path === '/api/user/me') {
      await route.fulfill({
        json: { success: true, data: { screenname: 'anaperson' } },
      });
    } else if (path === '/api/getProfile') {
      await route.fulfill({
        json: {
          success: true,
          data: {
            id: options.editing ? 'test-listing' : 'test-personal',
            userId: options.editing ? null : 'test-pana',
            email: options.editing ? contactEmail : panaEmail,
            name: options.editing ? 'Ana Bakery' : 'Ana Person',
            screenname: 'anaperson',
            images: {},
            onlineOnly: Boolean(options.online),
            addressPostalCode: baseZip,
            addressLine1: options.online ? 'A private old address' : null,
            addressLat: options.online ? '37.8' : null,
            addressLng: options.online ? '-122.4' : null,
          },
        },
      });
    } else if (path === '/api/listings/intake') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      submissions.push(body);
      if (options.managerChanged) {
        await route.fulfill({
          status: 409,
          json: {
            code: 'manager_changed',
            error: 'The managing account changed.',
          },
        });
        return;
      }
      const personal =
        typeof body.personalEmail === 'string'
          ? body.personalEmail.trim().toLowerCase()
          : '';
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          profileId: 'test-listing',
          management: body.manageWithPana
            ? 'account'
            : personal
              ? 'invitation'
              : 'unclaimed',
          invitationEmail: personal || null,
          invitationSent: Boolean(personal) && options.invitationSent !== false,
        },
      });
    } else if (path === '/api/profile/saveAddress') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      addressUpdates.push(body);
      if (options.addressFailure) {
        await route.fulfill({
          status: 503,
          json: {
            success: false,
            error: 'ZIP location lookup is temporarily unavailable.',
          },
        });
      } else {
        const address = body.primary_address as Record<string, unknown>;
        baseZip = String(address.zipcode);
        await route.fulfill({ json: { success: true } });
      }
    } else if (path === '/api/profile/saveContact') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      contactUpdates.push(body);
      contactEmail = String(body.email);
      await route.fulfill({ json: { success: true } });
    } else {
      await route.fulfill({
        status: 404,
        json: { error: `No browser fixture for ${path}` },
      });
    }
  });
  return {
    submissions,
    contactUpdates,
    addressUpdates,
    async changeSession(next: { signedIn: boolean; email?: string }) {
      signedIn = next.signedIn;
      accountEmail = next.email ?? panaEmail;
      const refreshed = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/auth/get-session'
      );
      await page.evaluate(() =>
        document.dispatchEvent(new Event('visibilitychange'))
      );
      await refreshed;
    },
  };
}

async function openBasics(page: Page) {
  const hydrated = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/auth/get-session'
  );
  await page.goto('/form/get-listed');
  await hydrated;
  await expect(
    page.getByRole('heading', { name: copy.title, exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: copy.start, exact: true }).click();
  await page.locator('#local-yes').click();
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await page.locator('#business-name').fill('Ana Bakery');
}

async function openLocationStep(page: Page) {
  await page.getByRole('button', { name: copy.nextSkip, exact: true }).click();
  await page
    .locator('#business-details')
    .fill('We bake bread and pastries in South Florida.');
  await page.locator('#business-five-words').fill('Fresh bread and pastries');
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await page.locator('#business-website').fill('https://bakery.test');
}

async function openFinalStep(page: Page) {
  await openLocationStep(page);
  await page.locator('#location-mobile').click();
  await page.getByRole('button', { name: copy.next, exact: true }).click();
}

async function submitListing(page: Page) {
  await page.locator('#agree-tos').check();
  await page
    .getByRole('button', { name: copy.submitButton, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: copy.successTitle })
  ).toBeVisible();
}

async function finish(page: Page) {
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await openFinalStep(page);
  await submitListing(page);
}

test('online signup asks for a mandatory base ZIP without collecting a visiting address', async ({
  page,
}) => {
  const { submissions } = await fixtures(page);
  await openBasics(page);
  await page.locator('#business-email').fill('hello@bakery.test');
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await openLocationStep(page);
  await page.locator('#location-online').click();
  const zip = page.locator('#online-base-zip');
  await expect(zip).toHaveAttribute('required', '');
  await expect(page.locator('#address-line1')).toHaveCount(0);
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await expect(zip).toBeVisible();
  await expect(page.getByText(copy.step7Heading, { exact: true })).toHaveCount(
    0
  );
  expect(
    await zip.evaluate(
      (element: HTMLInputElement) => element.validity.valueMissing
    )
  ).toBe(true);
  await zip.fill('3313');
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  expect(
    await zip.evaluate(
      (element: HTMLInputElement) => element.validity.patternMismatch
    )
  ).toBe(true);
  await zip.fill('33138');
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await submitListing(page);
  expect(submissions[0]).toMatchObject({
    onlineOnly: true,
    hasStorefront: false,
    addressPostalCode: '33138',
  });
});

test('storefront signup still permits an omitted ZIP when street and city are provided', async ({
  page,
}) => {
  const { submissions } = await fixtures(page);
  await openBasics(page);
  await page.locator('#business-email').fill('hello@bakery.test');
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await openLocationStep(page);
  await page.locator('#location-storefront').click();
  await page.locator('#address-line1').fill('A public street');
  await page.locator('#address-city').fill('Miami');
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await submitListing(page);
  expect(submissions[0]).toMatchObject({
    onlineOnly: false,
    hasStorefront: true,
    addressPostalCode: '',
  });
});

test('online location editing requires a base ZIP and does not expose or submit exact-address controls', async ({
  page,
}) => {
  const observed = await fixtures(page, {
    signedIn: true,
    editing: true,
    online: true,
  });
  await page.goto('/account/profile/address');
  const zip = page.locator('#zipcode');
  await expect(zip).toHaveAttribute('required', '');
  await expect(page.locator('#street1')).toBeHidden();
  await expect(page.locator('#geo_lat')).toBeHidden();
  await expect(page.locator('#geo_lat')).toBeDisabled();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  expect(observed.addressUpdates).toHaveLength(0);
  await zip.fill('33138');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Profile updated successfully!')).toBeVisible();
  expect(observed.addressUpdates[0]).toMatchObject({
    online_only: true,
    primary_address: { zipcode: '33138', street1: null, lat: null, lng: null },
  });
});

test('a ZIP save failure shows the server message rather than a success notification', async ({
  page,
}) => {
  await fixtures(page, {
    signedIn: true,
    editing: true,
    online: true,
    addressFailure: true,
  });
  await page.goto('/account/profile/address');
  await page.locator('#zipcode').fill('33138');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(
    page.getByText('ZIP location lookup is temporarily unavailable.').first()
  ).toBeVisible();
  await expect(page.getByText('Profile updated successfully!')).toHaveCount(0);
});

test('a signed-in pana can copy their inbox and manage the listing without another sign-in', async ({
  page,
}) => {
  const { submissions } = await fixtures(page, { signedIn: true });
  await openBasics(page);
  await expect(page.locator('#email-use-pana')).toBeChecked();
  await expect(page.locator('#business-email')).toHaveValue(panaEmail);
  await expect(page.locator('#business-email')).toHaveAttribute('readonly', '');
  await expect(page.locator('#manage-with-pana')).toBeChecked();
  await expect(page.locator('#personal-email')).toHaveCount(0);
  await expect(page.getByText(copy.emailCopyNote)).toBeVisible();
  await finish(page);
  expect(submissions[0]).toMatchObject({
    email: panaEmail,
    personalEmail: '',
    manageWithPana: true,
    expectedManagerId: 'test-pana',
  });
  await expect(page.getByText(copy.successManagedTitle)).toBeVisible();
  await expect(
    page.getByRole('link', { name: copy.successManage })
  ).toHaveAttribute('href', '/account');
});

test('choosing a different contact inbox does not change the managing pana', async ({
  page,
}) => {
  const { submissions } = await fixtures(page, { signedIn: true });
  await openBasics(page);
  await page.locator('#email-use-different').click();
  await page.locator('#business-email').fill('hello@bakery.test');
  await expect(page.locator('#manage-with-pana')).toBeChecked();
  await finish(page);
  expect(submissions[0]).toMatchObject({
    email: 'hello@bakery.test',
    manageWithPana: true,
    personalEmail: '',
  });
});

test('a copied contact stays unchanged if the same pana updates their account email mid-form', async ({
  page,
}) => {
  const { submissions, changeSession } = await fixtures(page, {
    signedIn: true,
  });
  await openBasics(page);
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await changeSession({ signedIn: true, email: 'new-personal@personal.test' });
  await openFinalStep(page);
  await submitListing(page);
  expect(submissions[0]).toMatchObject({
    email: panaEmail,
    manageWithPana: true,
  });
});

test('signing in after confirming a guest submission does not change its contact or claim it', async ({
  page,
}) => {
  const { submissions, changeSession } = await fixtures(page);
  await openBasics(page);
  await page.locator('#business-email').fill('hello@bakery.test');
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await changeSession({ signedIn: true });
  await openFinalStep(page);
  await submitListing(page);
  expect(submissions[0]).toMatchObject({
    email: 'hello@bakery.test',
    personalEmail: '',
    manageWithPana: false,
  });
});

test('losing the managing session asks for confirmation instead of silently leaving a listing unclaimed', async ({
  page,
}) => {
  const { submissions, changeSession } = await fixtures(page, {
    signedIn: true,
  });
  await openBasics(page);
  await page.locator('#email-use-different').click();
  await page.locator('#business-email').fill('hello@bakery.test');
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await changeSession({ signedIn: false });
  await openFinalStep(page);
  await page.locator('#agree-tos').check();
  await page
    .getByRole('button', { name: copy.submitButton, exact: true })
    .click();
  await expect(
    page.getByText(copy.errReviewContact, { exact: true })
  ).toBeVisible();
  await expect(page.locator('#business-name')).toHaveValue('Ana Bakery');
  expect(submissions).toHaveLength(0);
});

test('a server-side account change returns to the confirmed contact step', async ({
  page,
}) => {
  const { submissions } = await fixtures(page, {
    signedIn: true,
    managerChanged: true,
  });
  await openBasics(page);
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await openFinalStep(page);
  await page.locator('#agree-tos').check();
  await page
    .getByRole('button', { name: copy.submitButton, exact: true })
    .click();
  await expect(
    page.getByText(copy.errReviewContact, { exact: true })
  ).toBeVisible();
  await expect(page.locator('#business-name')).toHaveValue('Ana Bakery');
  expect(submissions[0]?.expectedManagerId).toBe('test-pana');
});

test('a guest may use one inbox for contact and an optional personal account invitation', async ({
  page,
}) => {
  const { submissions } = await fixtures(page);
  await openBasics(page);
  await expect(page.locator('#email-use-pana')).toHaveCount(0);
  await page.locator('#business-email').fill(panaEmail);
  await page.locator('#personal-email').fill(panaEmail);
  await finish(page);
  expect(submissions[0]).toMatchObject({
    email: panaEmail,
    personalEmail: panaEmail,
    manageWithPana: false,
  });
  await expect(page.getByText(copy.successAccountTitle)).toBeVisible();
});

test('a guest can submit without requesting any personal account', async ({
  page,
}) => {
  const { submissions } = await fixtures(page);
  await openBasics(page);
  await page.locator('#business-email').fill('hello@bakery.test');
  await finish(page);
  expect(submissions[0]).toMatchObject({
    email: 'hello@bakery.test',
    personalEmail: '',
    manageWithPana: false,
  });
  await expect(page.getByText(copy.successNextNoAccount)).toBeVisible();
});

test('a distinct personal inbox is preserved and mail failure does not promise a sent invitation', async ({
  page,
}) => {
  const { submissions } = await fixtures(page, { invitationSent: false });
  await openBasics(page);
  await page.locator('#business-email').fill('hello@bakery.test');
  await page.locator('#personal-email').fill(panaEmail);
  await finish(page);
  expect(submissions[0]).toMatchObject({
    email: 'hello@bakery.test',
    personalEmail: panaEmail,
  });
  await expect(
    page.getByText(/we could not send the sign-in link/)
  ).toBeVisible();
});

test('a signed-in pana can submit for somebody else without claiming the listing', async ({
  page,
}) => {
  const { submissions } = await fixtures(page, { signedIn: true });
  await openBasics(page);
  await page.locator('#manage-with-pana').uncheck();
  await expect(page.locator('#personal-email')).toBeVisible();
  await finish(page);
  expect(submissions[0]).toMatchObject({
    manageWithPana: false,
    personalEmail: '',
  });
  await expect(page.getByText(copy.successNextNoAccount)).toBeVisible();
});

test('a listing contact can be copied or changed later without editing the pana login', async ({
  page,
}) => {
  const { contactUpdates } = await fixtures(page, {
    signedIn: true,
    editing: true,
  });
  await page.goto('/account/profile/contact');
  await expect(page.getByLabel('Listing contact email')).toHaveValue(
    'hello@bakery.test'
  );
  await page
    .getByRole('button', { name: 'Use my Pana email', exact: true })
    .click();
  await expect(page.getByLabel('Listing contact email')).toHaveValue(panaEmail);
  await page.getByLabel('Listing contact email').fill('updates@bakery.test');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(
    page.getByText('Profile updated successfully!', { exact: true })
  ).toBeVisible();
  expect(contactUpdates[0]?.email).toBe('updates@bakery.test');
});
