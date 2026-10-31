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
    newAccount?: boolean;
    setupWrongAccount?: boolean;
    setupMalformed?: boolean;
    approved?: boolean;
  } = {}
) {
  const submissions: Record<string, unknown>[] = [];
  const contactUpdates: Record<string, unknown>[] = [];
  const addressUpdates: Record<string, unknown>[] = [];
  const setupConfirmations: Record<string, unknown>[] = [];
  const setupLookups: string[] = [];
  let baseZip = '';
  let contactEmail = 'hello@bakery.test';
  let signedIn = Boolean(options.signedIn);
  let accountEmail = panaEmail;
  let ownsListing = Boolean(options.editing);
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
        json: {
          success: true,
          data: {
            screenname: options.newAccount ? null : 'anaperson',
            createdAt: options.newAccount
              ? new Date().toISOString()
              : '2025-01-01T00:00:00Z',
            hasManagedListings: ownsListing,
          },
        },
      });
    } else if (path === '/api/profile/switch') {
      await route.fulfill({
        json: {
          data: [
            ...(options.newAccount
              ? []
              : [
                  {
                    id: 'test-personal',
                    name: 'Ana Person',
                    email: panaEmail,
                    screenname: 'anaperson',
                    isPersonal: true,
                    active: true,
                    role: 'owner',
                  },
                ]),
            ...(ownsListing
              ? [
                  {
                    id: 'test-listing',
                    name: 'Ana Bakery',
                    email: contactEmail,
                    screenname: null,
                    isPersonal: false,
                    active: Boolean(options.approved),
                    role: 'owner',
                  },
                ]
              : []),
          ],
          activeProfileId: ownsListing
            ? 'test-listing'
            : options.newAccount
              ? null
              : 'test-personal',
          pendingInvitations: [],
        },
      });
    } else if (path === '/api/getProfile') {
      await route.fulfill({
        json: {
          success: true,
          data: {
            id: ownsListing ? 'test-listing' : 'test-personal',
            userId: ownsListing ? null : 'test-pana',
            email: ownsListing ? contactEmail : panaEmail,
            name: ownsListing ? 'Ana Bakery' : 'Ana Person',
            screenname: ownsListing ? null : 'anaperson',
            active: ownsListing ? Boolean(options.approved) : true,
            status: ownsListing
              ? {
                  source: 'business_intake',
                  submitted: '2026-10-31T12:00:00Z',
                  ...(options.approved
                    ? { approved: '2026-10-31T13:00:00Z' }
                    : {}),
                }
              : {},
            descriptions: {
              fiveWords: 'Fresh bread and pastries',
              details: 'We bake bread and pastries in South Florida.',
            },
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
      const ownerEmail =
        typeof body.accountEmail === 'string'
          ? body.accountEmail.trim().toLowerCase()
          : '';
      ownsListing = signedIn && body.expectedOwnerId === 'test-pana';
      contactEmail = String(body.contactEmail);
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          profileId: 'test-listing',
          management: ownsListing ? 'account' : 'invitation',
          invitationEmail: ownsListing ? null : ownerEmail,
          invitationSent: !ownsListing && options.invitationSent !== false,
          setupPath: '/listings/setup?profileId=test-listing',
          managementPath: '/account/profile/edit',
        },
      });
    } else if (path === '/api/listings/setup') {
      if (route.request().method() === 'POST') {
        setupConfirmations.push(
          route.request().postDataJSON() as Record<string, unknown>
        );
        ownsListing = true;
        await route.fulfill({
          json: {
            success: true,
            profileId: 'test-listing',
            next: '/account/profile/edit',
          },
          headers: {
            'Set-Cookie':
              'pana_active_profile=test-listing; Path=/; HttpOnly; SameSite=Lax',
          },
        });
      } else {
        setupLookups.push(route.request().url());
        if (options.setupWrongAccount || accountEmail !== panaEmail) {
          await route.fulfill({
            status: 403,
            json: {
              error: 'This business setup invitation is not for this account.',
            },
          });
        } else {
          await route.fulfill({
            json: {
              profileId: 'test-listing',
              name: 'Ana Bakery',
              state: options.setupMalformed
                ? 'unexpected-state'
                : ownsListing
                  ? 'owned'
                  : 'confirm',
              active: Boolean(options.approved),
              reviewState: options.approved ? 'approved' : 'pending',
            },
          });
        }
      }
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
    setupConfirmations,
    setupLookups,
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
  await expect(page.locator('#email-use-pana')).toHaveCount(0);
  await expect(page.locator('#business-email')).toHaveValue(panaEmail);
  await expect(page.locator('#business-email')).toHaveAttribute('readonly', '');
  await expect(page.locator('#manage-with-pana')).toHaveCount(0);
  await expect(page.locator('#personal-email')).toHaveCount(0);
  await expect(page.getByText(copy.ownerExistingAccountNote)).toBeVisible();
  await finish(page);
  expect(submissions[0]).toMatchObject({
    onboardingMode: 'owner',
    accountEmail: panaEmail,
    contactEmail: panaEmail,
    expectedOwnerId: 'test-pana',
  });
  expect(submissions[0]).not.toHaveProperty('personalEmail');
  expect(submissions[0]).not.toHaveProperty('manageWithPana');
  await expect(page.getByText(copy.successManagedTitle)).toBeVisible();
  await expect(
    page.getByRole('link', { name: copy.successManage })
  ).toHaveAttribute('href', '/account/profile/edit');
});

test('choosing a different contact inbox does not change the managing pana', async ({
  page,
}) => {
  const { submissions } = await fixtures(page, { signedIn: true });
  await openBasics(page);
  await page.locator('#separate-contact-email').check();
  await page.locator('#listing-contact-email').fill('hello@bakery.test');
  await expect(page.locator('#business-email')).toHaveValue(panaEmail);
  await finish(page);
  expect(submissions[0]).toMatchObject({
    accountEmail: panaEmail,
    contactEmail: 'hello@bakery.test',
    expectedOwnerId: 'test-pana',
  });
  await expect(
    page.getByText(copy.successBody.replace('{{email}}', panaEmail), {
      exact: true,
    })
  ).toBeVisible();
  await expect(
    page.getByText(copy.successCopy.replace('{{email}}', 'hello@bakery.test'), {
      exact: true,
    })
  ).toBeVisible();
});

test('an account email change requires fresh confirmation before submitting', async ({
  page,
}) => {
  const { submissions, changeSession } = await fixtures(page, {
    signedIn: true,
  });
  await openBasics(page);
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await changeSession({ signedIn: true, email: 'new-personal@personal.test' });
  await openFinalStep(page);
  await page.locator('#agree-tos').check();
  await page
    .getByRole('button', { name: copy.submitButton, exact: true })
    .click();
  await expect(
    page.getByText(copy.errReviewContact, { exact: true })
  ).toBeVisible();
  expect(submissions).toHaveLength(0);
  await expect(page.locator('#business-email')).toHaveValue(
    'new-personal@personal.test'
  );
  await finish(page);
  expect(submissions[0]).toMatchObject({
    accountEmail: 'new-personal@personal.test',
    contactEmail: 'new-personal@personal.test',
    expectedOwnerId: 'test-pana',
  });
});

test('signing in mid-application never silently changes the confirmed owner', async ({
  page,
}) => {
  const { submissions, changeSession } = await fixtures(page);
  await openBasics(page);
  await page.locator('#business-email').fill('hello@bakery.test');
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await changeSession({ signedIn: true });
  await openFinalStep(page);
  await page.locator('#agree-tos').check();
  await page
    .getByRole('button', { name: copy.submitButton, exact: true })
    .click();
  await expect(
    page.getByText(copy.errReviewContact, { exact: true })
  ).toBeVisible();
  expect(submissions).toHaveLength(0);
});

test('losing the managing session asks for confirmation instead of silently leaving a listing unclaimed', async ({
  page,
}) => {
  const { submissions, changeSession } = await fixtures(page, {
    signedIn: true,
  });
  await openBasics(page);
  await page.locator('#separate-contact-email').check();
  await page.locator('#listing-contact-email').fill('hello@bakery.test');
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
  expect(submissions[0]?.expectedOwnerId).toBe('test-pana');
});

test('a guest uses one inbox and gets the direct named business setup flow', async ({
  page,
}) => {
  const { submissions } = await fixtures(page);
  await openBasics(page);
  await expect(page.locator('#email-use-pana')).toHaveCount(0);
  await page.locator('#business-email').fill(panaEmail);
  await expect(page.locator('#personal-email')).toHaveCount(0);
  await finish(page);
  expect(submissions[0]).toMatchObject({
    onboardingMode: 'owner',
    accountEmail: panaEmail,
    contactEmail: panaEmail,
    expectedOwnerId: null,
  });
  await expect(
    page.getByText(copy.successCopy.replace('{{email}}', panaEmail), {
      exact: true,
    })
  ).toHaveCount(0);
  await expect(page.getByText(copy.ownerSetupTitle)).toBeVisible();
  await expect(
    page.getByRole('link', { name: copy.ownerSetupContinue })
  ).toHaveAttribute('href', '/listings/setup?profileId=test-listing');
});

test('the main account email is mandatory, with no management opt-out', async ({
  page,
}) => {
  const { submissions } = await fixtures(page);
  await openBasics(page);
  await expect(page.locator('#business-email')).toHaveAttribute('required', '');
  await expect(page.locator('#manage-with-pana')).toHaveCount(0);
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  expect(
    await page
      .locator('#business-email')
      .evaluate((input: HTMLInputElement) => input.validity.valueMissing)
  ).toBe(true);
  expect(submissions).toHaveLength(0);
});

test('a separate business inbox is preserved and a failed setup email is reported honestly', async ({
  page,
}) => {
  const { submissions } = await fixtures(page, { invitationSent: false });
  await openBasics(page);
  await page.locator('#business-email').fill(panaEmail);
  await page.locator('#separate-contact-email').check();
  await page.locator('#listing-contact-email').fill('hello@bakery.test');
  await finish(page);
  expect(submissions[0]).toMatchObject({
    contactEmail: 'hello@bakery.test',
    accountEmail: panaEmail,
  });
  await expect(
    page.getByText(/the setup email could not be sent/)
  ).toBeVisible();
});

test('an approved business dashboard displays raw descriptions and its public ID link', async ({
  page,
}) => {
  await fixtures(page, { signedIn: true, editing: true, approved: true });
  await page.goto('/account/profile/edit');
  await expect(
    page.getByRole('heading', { name: 'Manage Ana Bakery' })
  ).toBeVisible();
  await expect(
    page.getByText('Fresh bread and pastries', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('We bake bread and pastries in South Florida.', {
      exact: true,
    })
  ).toBeVisible();
  await expect(page.getByText(/^Published /)).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View', exact: true })
  ).toHaveAttribute('href', '/listings/test-listing');
});

test('a new owner confirms once and lands in the business dashboard without personal screenname onboarding', async ({
  page,
}) => {
  const { setupLookups, setupConfirmations } = await fixtures(page, {
    signedIn: true,
    newAccount: true,
  });
  await page.goto('/listings/setup?profileId=test-listing');
  await expect(
    page.getByRole('heading', { name: 'Ana Bakery', exact: true })
  ).toBeVisible();
  expect(setupLookups).toHaveLength(1);
  expect(setupConfirmations).toHaveLength(0);
  await page
    .getByRole('button', { name: 'Confirm and manage Ana Bakery', exact: true })
    .click();
  await expect(page).toHaveURL(/\/account\/profile\/edit$/);
  await expect(
    page.getByRole('heading', { name: 'Manage Ana Bakery', exact: true })
  ).toBeVisible();
  await expect(page.getByText(/^Under review /)).toBeVisible();
  expect(setupConfirmations).toEqual([
    { profileId: 'test-listing', expectedOwnerId: 'test-pana' },
  ]);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('pana:screenname-prompt-dismissed')
    )
  ).toBe(null);
});

test('business-only account holders can return to their dashboard without creating a social profile', async ({
  page,
}) => {
  await fixtures(page, { signedIn: true, editing: true, newAccount: true });
  await page.goto('/account/profile/edit');
  await expect(
    page.getByRole('heading', { name: 'Manage Ana Bakery', exact: true })
  ).toBeVisible();
  await expect(page).toHaveURL(/\/account\/profile\/edit$/);
  await expect(
    page.getByRole('dialog').filter({ hasText: 'Choose a screenname' })
  ).toHaveCount(0);
});
test('business setup directs signed-out owners to sign in with a setup callback', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/listings/setup?profileId=test-listing');
  await expect(
    page.getByRole('link', { name: copy.setupSignIn, exact: true })
  ).toHaveAttribute(
    'href',
    '/signin?callbackUrl=%2Flistings%2Fsetup%3FprofileId%3Dtest-listing'
  );
});

test('a setup lookup for a different account never offers ownership confirmation', async ({
  page,
}) => {
  const { setupConfirmations } = await fixtures(page, {
    signedIn: true,
    setupWrongAccount: true,
  });
  await page.goto('/listings/setup?profileId=test-listing');
  await expect(
    page.getByText('This business setup invitation is not for this account.', {
      exact: true,
    })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirm and manage Ana Bakery' })
  ).toHaveCount(0);
  expect(setupConfirmations).toHaveLength(0);
});

test('a malformed setup response cannot become a successful invitation', async ({
  page,
}) => {
  await fixtures(page, { signedIn: true, setupMalformed: true });
  await page.goto('/listings/setup?profileId=test-listing');
  await expect(page.getByText(copy.setupError, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ana Bakery', exact: true })
  ).toHaveCount(0);
});

test('changing the account email clears a previously loaded setup invitation', async ({
  page,
}) => {
  const { changeSession } = await fixtures(page, { signedIn: true });
  await page.goto('/listings/setup?profileId=test-listing');
  await expect(
    page.getByRole('heading', { name: 'Ana Bakery', exact: true })
  ).toBeVisible();
  await changeSession({ signedIn: true, email: 'different@test.invalid' });
  await expect(
    page.getByText('This business setup invitation is not for this account.', {
      exact: true,
    })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ana Bakery', exact: true })
  ).toHaveCount(0);
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
