import { expect, test, type Page } from '@playwright/test';

const listingId = 'public-business-id';
const accountEmail = 'ana@personal.test';
const businessEmail = 'hello@bakery.test';
const entryPath = `/listings/claim/start?id=${listingId}`;
const reviewPath = `/listings/review?id=${listingId}`;
const verificationPath = `/listings/claim?token=claim-token&id=${listingId}`;
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0u8AAAAASUVORK5CYII=',
  'base64'
);

async function fixtures(
  page: Page,
  options: {
    signedIn?: boolean;
    owned?: boolean;
    otherOwner?: boolean;
    wrongAccount?: boolean;
    verification?: 'expired' | 'used';
    addressFailure?: boolean;
    forbiddenRead?: boolean;
    wrongProfileRead?: boolean;
    newAccount?: boolean;
    hasAddress?: boolean;
    unpublished?: boolean;
  } = {}
) {
  let signedIn = options.signedIn === true;
  let accountId = options.wrongAccount ? 'wrong-account' : 'review-account';
  let owned = options.owned === true;
  let used = false;
  const signIns: Record<string, unknown>[] = [];
  const claims: string[] = [];
  const verifications: Record<string, unknown>[] = [];
  const reads: string[] = [];
  const writes: Array<{
    path: string;
    listingId: string | null;
    body: Record<string, unknown>;
  }> = [];
  const switches: string[] = [];
  const profile: Record<string, unknown> = {
    id: listingId,
    userId: null,
    name: 'Ana Bakery',
    email: businessEmail,
    active: !options.unpublished,
    screenname: null,
    status: { source: 'business_intake' },
    phoneNumber: 'private-business-phone',
    pendingOwnerEmail: 'pending-private@personal.test',
    descriptions: {
      fiveWords: 'Fresh bread and pastries',
      details: 'Our existing description',
      background: 'Our existing background',
      tags: 'bread,coffee',
    },
    categories: { food: true },
    socials: { website: 'https://bakery.test', instagram: 'anabakery' },
    images: {
      primaryCDN: 'https://files.test.invalid/old-logo.png',
      gallery1CDN: 'https://files.test.invalid/gallery.png',
    },
    onlineOnly: false,
    addressPostalCode: null,
    addressLine1: options.hasAddress ? 'An old visiting address' : null,
    addressLocality: null,
    addressRegion: null,
    addressLat: options.hasAddress ? '25.8' : null,
    addressLng: options.hasAddress ? '-80.2' : null,
    counties: { miami_dade: true },
  };

  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
  await page.route(
    (url) => url.protocol === 'https:',
    (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') {
        return route.fulfill({ contentType: 'text/css', body: '' });
      }
      if (url.hostname === 'files.test.invalid') {
        return route.fulfill({ contentType: 'image/png', body: image });
      }
      if (url.hostname === 'challenges.cloudflare.com') {
        return route.fulfill({
          contentType: 'application/javascript',
          body: `window.turnstile = {
          render: function (element, options) {
            queueMicrotask(function () { options.callback('review-test-token'); });
            return 'review-test-widget';
          }, reset: function () {}, remove: function () {}
        };`,
        });
      }
      return route.abort('blockedbyclient');
    }
  );

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/auth/get-session') {
      await route.fulfill({
        json: signedIn
          ? {
              session: {
                id: 'review-session',
                token: 'review-session-token',
                userId: accountId,
                expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
              },
              user: {
                id: accountId,
                email: accountEmail,
                name: 'Ana Person',
                emailVerified: true,
              },
            }
          : null,
      });
    } else if (path === '/api/auth/sign-out') {
      signedIn = false;
      await route.fulfill({ json: { success: true } });
    } else if (path === '/api/auth/sign-in/magic-link') {
      signIns.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ json: { status: true } });
    } else if (path === '/api/config/turnstile') {
      await route.fulfill({ json: { siteKey: 'listing-review-test-key' } });
    } else if (path === '/api/auth/verify-turnstile') {
      await route.fulfill({ json: { success: true } });
    } else if (path === '/api/user/me') {
      await route.fulfill({
        json: {
          success: true,
          data: {
            screenname: options.newAccount ? null : 'anaperson',
            createdAt: options.newAccount
              ? new Date().toISOString()
              : '2025-01-01T00:00:00Z',
            hasManagedListings: owned || !options.newAccount,
          },
        },
      });
    } else if (path === '/api/profile/switch') {
      if (route.request().method() === 'POST') {
        switches.push(route.request().postData() ?? '');
      }
      await route.fulfill({
        json: {
          data: [
            ...(!options.newAccount
              ? [
                  {
                    id: 'personal-id',
                    name: 'Ana Person',
                    email: accountEmail,
                    isPersonal: true,
                    active: true,
                    role: 'owner',
                  },
                  {
                    id: 'second-business',
                    name: 'Other Managed Business',
                    isPersonal: false,
                    active: true,
                    role: 'owner',
                  },
                ]
              : []),
            ...(owned
              ? [
                  {
                    id: listingId,
                    name: 'Ana Bakery',
                    email: businessEmail,
                    isPersonal: false,
                    active: true,
                    role: 'owner',
                  },
                ]
              : []),
          ],
          activeProfileId: options.newAccount ? null : 'second-business',
          pendingInvitations: [],
        },
      });
    } else if (path === `/api/listings/${listingId}/claim`) {
      if (route.request().method() === 'POST') {
        claims.push(route.request().url());
        await route.fulfill({
          json: { success: true, sentTo: 'h••••@bakery.test' },
        });
      } else {
        await route.fulfill({
          json: {
            profileId: listingId,
            name: profile.name,
            summary: 'Fresh bread and pastries',
            imageUrl: 'https://files.test.invalid/old-logo.png',
            publicPath: `/listings/${listingId}`,
            locationLabel: 'Location not added yet',
            missingLocation: true,
            canManage: signedIn && owned && accountId === 'review-account',
            claimable: !owned && !options.otherOwner,
            published: !options.unpublished,
          },
        });
      }
    } else if (path.startsWith('/api/listings/') && path.endsWith('/claim')) {
      await route.fulfill({
        status: 404,
        json: { error: 'That public business listing could not be found.' },
      });
    } else if (path === '/api/listings/claim/verify') {
      verifications.push(
        route.request().postDataJSON() as Record<string, unknown>
      );
      if (accountId !== 'review-account') {
        await route.fulfill({
          status: 403,
          json: {
            code: 'wrong_account',
            error:
              'This link was issued to a different account. Sign in with the account that requested it.',
          },
        });
      } else if (options.verification || used) {
        await route.fulfill({
          status: 400,
          json: {
            code: 'invalid_token',
            error:
              'This link has expired or already been used. Request a new one from the listing.',
          },
        });
      } else {
        used = true;
        owned = true;
        await route.fulfill({
          json: {
            success: true,
            profileId: listingId,
            businessName: 'Ana Bakery',
            reviewPath,
          },
        });
      }
    } else if (path === '/api/getProfile') {
      reads.push(route.request().url());
      const requested = url.searchParams.get('listingId');
      if (requested !== listingId || !owned || options.forbiddenRead) {
        await route.fulfill({
          status: 403,
          json: {
            success: false,
            error: 'You do not manage that business listing.',
          },
        });
      } else {
        await route.fulfill({
          json: {
            success: true,
            data: options.wrongProfileRead
              ? {
                  ...profile,
                  id: 'second-business',
                  name: 'Other Managed Business',
                  email: 'private-other@test.invalid',
                }
              : profile,
          },
        });
      }
    } else if (path.startsWith('/api/profile/save')) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      writes.push({ path, listingId: url.searchParams.get('listingId'), body });
      if (path === '/api/profile/saveAddress' && options.addressFailure) {
        await route.fulfill({
          status: 503,
          json: {
            success: false,
            error: 'ZIP location lookup is temporarily unavailable.',
          },
        });
        return;
      }
      if (path === '/api/profile/saveDesc') {
        if ('name' in body) profile.name = body.name;
        const descriptions = {
          ...(profile.descriptions as Record<string, unknown>),
        };
        for (const [field, key] of [
          ['five_words', 'fiveWords'],
          ['details', 'details'],
          ['background', 'background'],
          ['tags', 'tags'],
        ]) {
          if (field in body) descriptions[key] = body[field];
        }
        profile.descriptions = descriptions;
      } else if (path === '/api/profile/saveContact') {
        if ('email' in body) profile.email = body.email;
        if ('phone_number' in body) profile.phoneNumber = body.phone_number;
      } else if (path === '/api/profile/saveCategories') {
        profile.categories = {
          ...(profile.categories as Record<string, unknown>),
          ...(body.categories as Record<string, unknown>),
        };
      } else if (path === '/api/profile/saveSocial') {
        profile.socials = {
          ...(profile.socials as Record<string, unknown>),
          ...(body.socials as Record<string, unknown>),
        };
      } else if (path === '/api/profile/saveAddress') {
        const address = body.primary_address as
          Record<string, unknown> | undefined;
        if (address && 'zipcode' in address)
          profile.addressPostalCode = address.zipcode;
        if (address && 'street1' in address)
          profile.addressLine1 = address.street1;
        if (address && 'city' in address)
          profile.addressLocality = address.city;
        if (address && 'state' in address)
          profile.addressRegion = address.state;
        if ('online_only' in body) profile.onlineOnly = body.online_only;
        if (profile.onlineOnly === true) {
          profile.addressLine1 = null;
          profile.addressLat = null;
          profile.addressLng = null;
        }
      }
      await route.fulfill({ json: { success: true } });
    } else if (path === '/api/profile/upload') {
      writes.push({
        path,
        listingId: url.searchParams.get('listingId'),
        body: { uploaded: true },
      });
      profile.images = {
        primaryCDN: 'https://files.test.invalid/new-logo.png',
        gallery1CDN: 'https://files.test.invalid/gallery.png',
      };
      await route.fulfill({ json: { success: true } });
    } else {
      await route.fulfill({
        status: 404,
        json: { error: `No isolated fixture for ${path}` },
      });
    }
  });
  return {
    claims,
    signIns,
    verifications,
    reads,
    writes,
    switches,
    profile,
    signIn() {
      signedIn = true;
      accountId = 'review-account';
    },
  };
}

function expectListingReads(reads: string[]) {
  // Shared header widgets may also read their ordinary active profile.
  const scoped = reads
    .map((url) => new URL(url).searchParams.get('listingId'))
    .filter((id) => id !== null);
  expect(scoped.length).toBeGreaterThan(0);
  expect(scoped.every((id) => id === listingId)).toBe(true);
}

test('anonymous entry, Pana sign-in, explicit verification and all prefilled review steps stay on the exact business', async ({
  page,
}) => {
  const fixture = await fixtures(page, { newAccount: true });
  await page.goto(entryPath);
  await expect(
    page.getByRole('heading', { name: 'Review and claim your listing' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ana Bakery', exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Fresh bread and pastries', { exact: true })
  ).toBeVisible();
  await expect(page.getByText(businessEmail, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText('private-business-phone', { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByText('pending-private@personal.test', { exact: true })
  ).toHaveCount(0);
  const signIn = page.getByRole('link', {
    name: 'Sign in to review and claim',
  });
  expect(
    new URL(
      (await signIn.getAttribute('href')) ?? '',
      'http://fixture.test'
    ).searchParams.get('callbackUrl')
  ).toBe(entryPath);
  expect(fixture.claims).toHaveLength(0);
  await signIn.click();
  const emailOption = page.getByRole('button', {
    name: 'Sign in with email',
    exact: true,
  });
  await expect(
    page.getByRole('heading', { name: 'Welcome to Pana MIA', exact: true })
  ).toBeVisible();
  if (await emailOption.isVisible()) await emailOption.click();
  await page.getByPlaceholder('your@email.com').fill(accountEmail);
  await page
    .getByRole('button', { name: 'Send sign-in link', exact: true })
    .click();
  await expect.poll(() => fixture.signIns.length).toBe(1);
  expect(fixture.signIns[0].email).toBe(accountEmail);
  const callback = new URL(String(fixture.signIns[0].callbackURL));
  expect(`${callback.pathname}${callback.search}`).toBe(entryPath);
  fixture.signIn();
  await page.goto(`${callback.pathname}${callback.search}`);
  await expect(
    page.getByRole('button', { name: 'Send ownership verification email' })
  ).toBeVisible();
  expect(fixture.claims).toHaveLength(0);
  expect(fixture.verifications).toHaveLength(0);
  expect(page.url()).not.toContain('/welcome');
  await page
    .getByRole('button', { name: 'Send ownership verification email' })
    .click();
  await expect(page.getByText('Check the business inbox')).toBeVisible();
  expect(fixture.claims).toHaveLength(1);
  await expect(page.getByText(businessEmail, { exact: true })).toHaveCount(0);

  await page.goto(verificationPath);
  const review = page.getByRole('link', {
    name: 'Review your listing',
    exact: true,
  });
  await expect(review).toHaveAttribute('href', reviewPath);
  expect(fixture.verifications).toEqual([{ token: 'claim-token' }]);
  await review.click();
  await expect(
    page.getByRole('heading', { name: 'Review Ana Bakery', exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('listing-review-desktop.png'),
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'Review location first', exact: true })
    .click();
  await expect(
    page.getByRole('radio', {
      name: 'Keep current location details for now',
      exact: true,
    })
  ).toBeChecked();
  await page
    .getByRole('radio', {
      name: 'Public visiting address or ZIP area',
      exact: true,
    })
    .click();
  await page.getByLabel('ZIP code', { exact: true }).fill('33138');
  await page.getByLabel('City', { exact: true }).fill('Miami');
  await page.getByLabel('State', { exact: true }).fill('FL');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/account/profile/desc\\?listingId=${listingId}$`)
  );
  await expect(
    page.getByLabel('Short description', { exact: true })
  ).toHaveValue('Fresh bread and pastries');
  await expect(
    page.getByLabel('About this business', { exact: true })
  ).toHaveValue('Our existing description');
  await expect(page.getByLabel('Background', { exact: true })).toHaveValue(
    'Our existing background'
  );
  await page
    .getByLabel('About this business', { exact: true })
    .fill('Our refreshed bakery description');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: 'Food', exact: true })
  ).toBeChecked();
  await page.getByRole('checkbox', { name: 'Services', exact: true }).check();
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(
    page.getByLabel('Listing contact email', { exact: true })
  ).toHaveValue(businessEmail);
  await expect(page.getByLabel('Phone Number', { exact: true })).toHaveValue(
    'private-business-phone'
  );
  await expect(page.getByText('Pronouns:', { exact: true })).toHaveCount(0);
  await page
    .getByLabel('Listing contact email', { exact: true })
    .fill('contact@new-bakery.test');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(page.getByLabel('Instagram', { exact: true })).toHaveValue(
    'anabakery'
  );
  await page
    .getByLabel('Website', { exact: true })
    .fill('https://new-bakery.test');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(
    page.getByRole('img', { name: 'Primary', exact: true })
  ).toHaveAttribute('src', 'https://files.test.invalid/old-logo.png');
  await page
    .locator('#images_primary')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: image });
  await page
    .getByRole('button', { name: 'Save photos and finish', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your review is complete', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View updated listing', exact: true })
  ).toHaveAttribute('href', `/listings/${listingId}`);
  await expect(
    page.getByRole('link', { name: 'Manage this business', exact: true })
  ).toHaveAttribute('href', reviewPath);
  expect(fixture.writes.map((write) => write.path)).toEqual([
    '/api/profile/saveAddress',
    '/api/profile/saveDesc',
    '/api/profile/saveCategories',
    '/api/profile/saveContact',
    '/api/profile/saveSocial',
    '/api/profile/upload',
  ]);
  expect(fixture.writes.every((write) => write.listingId === listingId)).toBe(
    true
  );
  expectListingReads(fixture.reads);
  expect(fixture.writes[0].body).toMatchObject({
    primary_address: { zipcode: '33138' },
  });
  expect(fixture.writes[0].body.online_only).not.toBe(true);
  expect(fixture.writes[3].body).not.toHaveProperty('pronouns');
  expect(fixture.switches).toHaveLength(0);
});

test('an existing owner reviews the business directly while a different managed identity remains active', async ({
  page,
}) => {
  const fixture = await fixtures(page, { signedIn: true, owned: true });
  await page.goto(entryPath);
  await expect(
    page.getByRole('link', { name: 'Review your listing', exact: true })
  ).toHaveAttribute('href', reviewPath);
  await expect(
    page.getByRole('button', { name: 'Send ownership verification email' })
  ).toHaveCount(0);
  await page
    .getByRole('link', { name: 'Review your listing', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Review description', exact: true })
    .click();
  await expect(page.getByLabel('Business name', { exact: true })).toHaveValue(
    'Ana Bakery'
  );
  await page
    .getByLabel('About this business', { exact: true })
    .fill('Owner refreshed description');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/account/profile/categories\\?listingId=${listingId}$`)
  );
  expect(fixture.claims).toHaveLength(0);
  expect(fixture.verifications).toHaveLength(0);
  expect(fixture.switches).toHaveLength(0);
  expect(fixture.writes[0].listingId).toBe(listingId);
});

test('untouched descriptions, categories and private contact stay unchanged and public link updates are partial', async ({
  page,
}) => {
  const fixture = await fixtures(page, { signedIn: true, owned: true });
  fixture.profile.email = 'Hello@Bakery.TEST';
  fixture.profile.descriptions = {
    fiveWords: 'Fresh bread and pastries',
    details: 'Existing details',
    background: null,
  };
  fixture.profile.socials = {
    website: null,
    instagram: 'anabakery',
    imported_link: 'preserve-me',
  };
  await page.goto(`/account/profile/desc?listingId=${listingId}`);
  await expect(
    page.getByLabel('About this business', { exact: true })
  ).toHaveValue('Existing details');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: 'Food', exact: true })
  ).toBeChecked();
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(
    page.getByLabel('Listing contact email', { exact: true })
  ).toHaveValue('Hello@Bakery.TEST');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(page.getByLabel('Instagram', { exact: true })).toHaveValue(
    'anabakery'
  );
  expect(fixture.writes).toHaveLength(0);
  await page
    .getByLabel('Website', { exact: true })
    .fill('https://new-bakery.test');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Keep current photos and finish',
      exact: true,
    })
  ).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0].body).toEqual({
    socials: { website: 'https://new-bakery.test' },
  });
  expect(fixture.profile.email).toBe('Hello@Bakery.TEST');
  expect(fixture.profile.descriptions).toEqual({
    fiveWords: 'Fresh bread and pastries',
    details: 'Existing details',
    background: null,
  });
  expect(fixture.profile.socials).toEqual({
    website: 'https://new-bakery.test',
    instagram: 'anabakery',
    imported_link: 'preserve-me',
  });
});

test('missing location can be left unconfirmed without inventing a ZIP or online-only choice', async ({
  page,
}) => {
  const fixture = await fixtures(page, { signedIn: true, owned: true });
  await page.goto(`/account/profile/address?listingId=${listingId}`);
  await expect(
    page.getByRole('radio', {
      name: 'Keep current location details for now',
      exact: true,
    })
  ).toBeChecked();
  await page
    .getByRole('button', {
      name: 'Keep current location and continue',
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel('About this business', { exact: true })
  ).toBeVisible();
  expect(fixture.writes).toHaveLength(0);
  expect(fixture.profile.addressPostalCode).toBeNull();
  expect(fixture.profile.onlineOnly).toBe(false);
});

test('an unpublished business stays manageable without offering a broken public listing destination', async ({
  page,
}) => {
  const fixture = await fixtures(page, {
    signedIn: true,
    owned: true,
    unpublished: true,
  });
  await page.goto(entryPath);
  await expect(
    page.getByText('This listing is not public yet.', { exact: false })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View the public listing', exact: true })
  ).toHaveCount(0);
  await page
    .getByRole('link', { name: 'Review your listing', exact: true })
    .click();
  await page.getByRole('link', { name: 'Review photos', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Keep current photos and finish',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your review is complete', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View updated listing', exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Manage this business', exact: true })
  ).toHaveAttribute('href', reviewPath);
  expect(fixture.claims).toHaveLength(0);
});

test('online location uses the existing ZIP validation and does not submit a previous street or exact point', async ({
  page,
}) => {
  const fixture = await fixtures(page, {
    signedIn: true,
    owned: true,
    hasAddress: true,
  });
  await page.goto(`/account/profile/address?listingId=${listingId}`);
  await page
    .getByRole('radio', {
      name: 'Online business, without a public storefront',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Street 1', { exact: true })).toBeHidden();
  await expect(page.getByLabel('Latitude', { exact: true })).toBeHidden();
  await page.getByLabel('Business base ZIP code').fill('bad-zip');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  expect(fixture.writes).toHaveLength(0);
  await page.getByLabel('Business base ZIP code').fill('33138');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(
    page.getByLabel('About this business', { exact: true })
  ).toBeVisible();
  expect(fixture.writes[0].body).toMatchObject({
    online_only: true,
    primary_address: { zipcode: '33138' },
  });
  expect(fixture.writes[0].body.primary_address).not.toHaveProperty('street1');
  expect(fixture.writes[0].body.primary_address).not.toHaveProperty('lat');
  expect(fixture.profile.addressLine1).toBeNull();
  expect(fixture.profile.addressLat).toBeNull();
});

test('mobile confirmation explicitly clears a previous public address without requiring a ZIP', async ({
  page,
}) => {
  const fixture = await fixtures(page, {
    signedIn: true,
    owned: true,
    hasAddress: true,
  });
  await page.goto(`/account/profile/address?listingId=${listingId}`);
  await page
    .getByRole('radio', {
      name: 'Mobile or by appointment, without a public address',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Street 1', { exact: true })).toBeHidden();
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(
    page.getByLabel('About this business', { exact: true })
  ).toBeVisible();
  expect(fixture.writes[0].body).toMatchObject({
    online_only: false,
    primary_address: {
      street1: '',
      zipcode: '',
      lat: '',
      lng: '',
      googlePlaceId: '',
    },
  });
});

test('a failed location save stays on the form and explains the failure', async ({
  page,
}) => {
  const fixture = await fixtures(page, {
    signedIn: true,
    owned: true,
    addressFailure: true,
  });
  await page.goto(`/account/profile/address?listingId=${listingId}`);
  await page
    .getByRole('radio', {
      name: 'Online business, without a public storefront',
      exact: true,
    })
    .click();
  await page.getByLabel('Business base ZIP code').fill('33138');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'ZIP location lookup is temporarily unavailable.' })
      .first()
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/account/profile/address\\?listingId=${listingId}$`)
  );
  expect(fixture.profile.addressPostalCode).toBeNull();
});

test('anonymous verification returns through sign-in without spending the claim link', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  await page.goto(verificationPath);
  const link = page.getByRole('link', {
    name: 'Sign in to finish claiming',
    exact: true,
  });
  await expect(link).toBeVisible();
  const signInUrl = new URL(
    (await link.getAttribute('href')) ?? '',
    'http://fixture.test'
  );
  expect(signInUrl.searchParams.get('callbackUrl')).toBe(verificationPath);
  expect(fixture.verifications).toHaveLength(0);
  fixture.signIn();
  await page.goto(verificationPath);
  await expect(
    page.getByRole('link', { name: 'Review your listing', exact: true })
  ).toHaveAttribute('href', reviewPath);
  expect(fixture.verifications).toHaveLength(1);
});

test('wrong-account verification provides an account switch and keeps the original return token', async ({
  page,
}) => {
  const fixture = await fixtures(page, { signedIn: true, wrongAccount: true });
  await page.goto(verificationPath);
  await expect(page.getByRole('alert')).toContainText('different account');
  await page
    .getByRole('button', {
      name: 'Use the account that requested this link',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/signin\?callbackUrl=/);
  expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(
    verificationPath
  );
  fixture.signIn();
  await page.goto(verificationPath);
  await expect(
    page.getByRole('link', { name: 'Review your listing', exact: true })
  ).toHaveAttribute('href', reviewPath);
  expect(fixture.verifications).toHaveLength(2);
});

for (const state of ['expired', 'used'] as const) {
  test(`${state} verification returns to the same listing for recovery`, async ({
    page,
  }) => {
    const fixture = await fixtures(page, {
      signedIn: true,
      owned: state === 'used',
      verification: state,
    });
    await page.goto(verificationPath);
    await expect(page.getByRole('alert')).toContainText(
      'expired or already been used'
    );
    const recovery = page.getByRole('link', {
      name: 'Return to this listing or request a new link',
      exact: true,
    });
    await expect(recovery).toHaveAttribute('href', entryPath);
    await recovery.click();
    if (state === 'used') {
      await expect(
        page.getByRole('link', { name: 'Review your listing', exact: true })
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole('button', {
          name: 'Send ownership verification email',
          exact: true,
        })
      ).toBeVisible();
    }
    expect(fixture.claims).toHaveLength(0);
  });
}

test('another owner, a missing listing and a missing ID have clear safe outcomes', async ({
  page,
}) => {
  const fixture = await fixtures(page, { signedIn: true, otherOwner: true });
  await page.goto(entryPath);
  await expect(page.getByText(/managed by another account/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Send ownership verification email' })
  ).toHaveCount(0);
  await page.goto('/listings/claim/start?id=legacy-source-id');
  await expect(page.getByRole('alert')).toContainText('could not be found');
  await page.goto('/listings/claim/start');
  await expect(page.getByRole('alert')).toContainText('No listing selected');
  await page.goto('/listings/review');
  await expect(
    page.getByRole('heading', { name: 'No listing selected', exact: true })
  ).toBeVisible();
  await page.goto('/listings/claim');
  await expect(page.getByRole('alert')).toContainText('missing its token');
  expect(fixture.claims).toHaveLength(0);
  expect(fixture.writes).toHaveLength(0);
});

for (const wrongProfileRead of [false, true]) {
  test(`an unauthorized or mismatched private read never displays another active profile (${wrongProfileRead})`, async ({
    page,
  }) => {
    const fixture = await fixtures(page, {
      signedIn: true,
      owned: true,
      forbiddenRead: !wrongProfileRead,
      wrongProfileRead,
    });
    await page.goto(`/account/profile/contact?listingId=${listingId}`);
    await expect(
      page.getByRole('heading', {
        name: 'This business could not be opened',
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByLabel('Listing contact email', { exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByText('private-other@test.invalid', { exact: true })
    ).toHaveCount(0);
    expect(fixture.writes).toHaveLength(0);
    expectListingReads(fixture.reads);
  });
}

test('the mobile review keeps photos unchanged and offers exact-business completion links', async ({
  page,
}) => {
  const fixture = await fixtures(page, { signedIn: true, owned: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/account/profile/images?listingId=${listingId}`);
  await expect(
    page.getByRole('navigation', { name: 'Listing review', exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Keep current photos and finish',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your review is complete', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View updated listing', exact: true })
  ).toHaveAttribute('href', `/listings/${listingId}`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('listing-review-mobile.png'),
    fullPage: true,
  });
  expect(fixture.writes).toHaveLength(0);
});
