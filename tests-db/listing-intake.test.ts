import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';
import { groupOnlineZipListings, type OnlineZipArea } from '@/lib/online-zip';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const email = 'ana@test.invalid';
const userId = 'ana-account';
const personalId = 'ana-personal-profile';
let session: {
  user: {
    id: string;
    email: string;
    name: string;
    isAdmin?: boolean;
    isContentModerator?: boolean;
  };
} | null;
let activeProfileId: string | undefined;
let verificationPasses = true;
let invitationFails = false;
let notificationFails = false;
const failingRecipients = new Set<string>();
const delayedRecipients = new Map<
  string,
  { wait: Promise<void>; started: () => void }
>();
const invitations: Array<{
  email: string;
  callback: string;
  metadata?: { listingSetupId: string };
}> = [];
const invalidatedPaths: string[] = [];
const emails: Array<{
  template: string;
  variables: Record<string, unknown>;
  recipient?: string;
}> = [];
const zipRequests: string[] = [];
let zipUnavailable = false;
const zipArea = (zip: string): OnlineZipArea =>
  zip === '33301'
    ? {
        postalCode: zip,
        country: 'US',
        city: 'Fort Lauderdale',
        region: 'FL',
        lat: 26.1216,
        lng: -80.1288,
      }
    : {
        postalCode: zip,
        country: 'US',
        city: 'Miami',
        region: 'FL',
        lat: 25.8521,
        lng: -80.1821,
      };

mock.module(import.meta.resolve('next/cache'), {
  namedExports: {
    unstable_cache: (fn: unknown) => fn,
    revalidatePath: (path: string) => {
      invalidatedPaths.push(path);
    },
    revalidateTag: () => {},
  },
});
mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
  const url = String(input);
  const match = /^https:\/\/api\.zippopotam\.us\/us\/(\d{5})$/.exec(url);
  assert.ok(match, `Unexpected network request: ${url}`);
  zipRequests.push(url);
  if (zipUnavailable) return new Response('', { status: 503 });
  if (match[1] === '00000') return new Response('', { status: 404 });
  const area = zipArea(match[1]);
  return Response.json({
    'post code': area.postalCode,
    'country abbreviation': 'US',
    places: [
      {
        'place name': area.city,
        'state abbreviation': area.region,
        latitude: String(area.lat),
        longitude: String(area.lng),
      },
    ],
  });
});

mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    auth: async () => session,
    sendMagicLinkTo: async (
      recipient: string,
      _headers: Headers,
      callback: string,
      metadata?: { listingSetupId: string }
    ) => {
      invitations.push({
        email: recipient,
        callback,
        ...(metadata ? { metadata } : {}),
      });
      if (invitationFails) throw new Error('Invitation provider unavailable');
    },
    emailMigrationConfirmationHtml: () => '<p>Email changed</p>',
    emailMigrationConfirmationText: () => 'Email changed',
  },
});
mock.module(import.meta.resolve('../lib/turnstile.ts'), {
  namedExports: { verifyTurnstile: async () => verificationPasses },
});
mock.module(import.meta.resolve('../lib/email.ts'), {
  namedExports: {
    sendTemplateEmail: async (
      template: string,
      variables: Record<string, unknown>,
      recipient?: string
    ) => {
      emails.push({ template, variables, recipient });
      const delayed = recipient ? delayedRecipients.get(recipient) : undefined;
      if (delayed) {
        delayed.started();
        await delayed.wait;
      }
      if (
        notificationFails ||
        (recipient && failingRecipients.has(recipient))
      ) {
        throw new Error('Mail provider unavailable');
      }
    },
    sendEmail: async () => {},
  },
});
mock.module(import.meta.resolve('../lib/server/referrals.ts'), {
  namedExports: {
    attachReferralToUser: async () => {},
    getActiveCookieAttribution: async () => null,
    resolveReferralAttribution: async () => null,
  },
});
mock.module(import.meta.resolve('next/headers'), {
  namedExports: {
    cookies: async () => ({
      get: () => (activeProfileId ? { value: activeProfileId } : undefined),
    }),
    headers: async () => new Headers({ host: 'directory.test.invalid' }),
  },
});
mock.module(import.meta.resolve('next/navigation'), {
  namedExports: {
    notFound: () => {
      throw new Error('TEST_NOT_FOUND');
    },
    permanentRedirect: (path: string) => {
      throw new Error(`TEST_REDIRECT:${path}`);
    },
  },
});
const BusinessProfile = () => null;
mock.module(
  import.meta.resolve('../app/p/[user]/_components/business-profile.tsx'),
  {
    namedExports: { BusinessProfile },
  }
);

const tables = [
  schema.users,
  schema.profiles,
  schema.profileOwners,
  schema.articles,
  schema.recommendationLists,
  schema.recommendationListItems,
  schema.mentorSessions,
  schema.emailMigrations,
  schema.sessions,
  schema.profileSignals,
  schema.venues,
  schema.events,
];
let intake: typeof import('../app/api/listings/intake/route');
let decisions: typeof import('../app/api/admin/profile/action/route');
let contact: typeof import('../app/api/profile/saveContact/route');
let resend: typeof import('../app/api/profile/sendSubmission/route');
let mentoring: typeof import('../app/api/mentoring/profile/route');
let booking: typeof import('../app/api/mentoring/sessions/route');
let author: typeof import('../app/api/user/author/[id]/route');
let migration: typeof import('../app/api/user/complete-email-migration/route');
let pending: typeof import('../lib/server/pending-listing-owner');
let addressUpdate: typeof import('../app/api/profile/saveAddress/route');
let directory: typeof import('../lib/server/directory');
let profileReader: typeof import('../lib/server/profile');
let setup: typeof import('../app/api/listings/setup/route');
let setupEmail: typeof import('../lib/server/listing-setup');
let ownership: typeof import('../lib/server/profile-owners');
let publicListingPage: typeof import('../app/listings/[profileId]/page');
let adminListingPreviewPage: typeof import('../app/admin/listings/[profileId]/preview/page');
let featured: typeof import('../app/api/directory/featured/route');
let sitemap: typeof import('../app/sitemap');
let recommendationLists: typeof import('../lib/federation/wrappers/recommendation-list');
let userMe: typeof import('../app/api/user/me/route');
let suggestions: typeof import('../lib/server/suggest');
let adminListings: typeof import('../app/api/admin/listings/route');
let listingNotifications: typeof import('../lib/server/listing-notifications');
let NextRequest: typeof import('next/server').NextRequest;
const originalHost = process.env.NEXT_PUBLIC_HOST_URL;

before(async () => {
  process.env.NEXT_PUBLIC_HOST_URL = 'https://directory.test.invalid';
  for (const table of tables) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map(
      (column) =>
        `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}` +
        (column.primary ? ' PRIMARY KEY' : '') +
        (column.isUnique ? ` CONSTRAINT "${column.uniqueName}" UNIQUE` : '')
    );
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(', ')})`);
  }
  await pg.exec(`
    ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
    CREATE UNIQUE INDEX profile_owners_profile_user_unique
      ON profile_owners (profile_id, user_id);
    ALTER TABLE profile_owners ADD FOREIGN KEY (user_id) REFERENCES users (id);
    ALTER TABLE profile_owners ADD FOREIGN KEY (profile_id) REFERENCES profiles (id);
  `);
  await pg.exec(
    await readFile(
      new URL('../drizzle/0072_profile_contact_email.sql', import.meta.url),
      'utf8'
    )
  );
  await pg.exec(
    'CREATE FUNCTION pana_unaccent(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT value $$'
  );
  intake = await import('../app/api/listings/intake/route');
  decisions = await import('../app/api/admin/profile/action/route');
  contact = await import('../app/api/profile/saveContact/route');
  resend = await import('../app/api/profile/sendSubmission/route');
  mentoring = await import('../app/api/mentoring/profile/route');
  booking = await import('../app/api/mentoring/sessions/route');
  author = await import('../app/api/user/author/[id]/route');
  migration = await import('../app/api/user/complete-email-migration/route');
  pending = await import('../lib/server/pending-listing-owner');
  addressUpdate = await import('../app/api/profile/saveAddress/route');
  directory = await import('../lib/server/directory');
  profileReader = await import('../lib/server/profile');
  setup = await import('../app/api/listings/setup/route');
  setupEmail = await import('../lib/server/listing-setup');
  ownership = await import('../lib/server/profile-owners');
  publicListingPage = await import('../app/listings/[profileId]/page');
  adminListingPreviewPage =
    await import('../app/admin/listings/[profileId]/preview/page');
  featured = await import('../app/api/directory/featured/route');
  sitemap = await import('../app/sitemap');
  recommendationLists =
    await import('../lib/federation/wrappers/recommendation-list');
  userMe = await import('../app/api/user/me/route');
  suggestions = await import('../lib/server/suggest');
  adminListings = await import('../app/api/admin/listings/route');
  listingNotifications = await import('../lib/server/listing-notifications');
  ({ NextRequest } = await import('next/server'));
});

beforeEach(async () => {
  for (const table of [...tables].reverse()) await db.delete(table);
  await db.insert(schema.users).values({
    id: userId,
    email,
    name: 'Ana Person',
    accountType: 'personal',
  });
  await db.insert(schema.profiles).values({
    id: personalId,
    userId,
    email,
    name: 'Ana Person',
    active: true,
    onlineOnly: false,
  });
  session = { user: { id: userId, email, name: 'Ana Person' } };
  activeProfileId = undefined;
  verificationPasses = true;
  invitationFails = false;
  notificationFails = false;
  failingRecipients.clear();
  delayedRecipients.clear();
  invitations.length = 0;
  emails.length = 0;
  zipRequests.length = 0;
  zipUnavailable = false;
  invalidatedPaths.length = 0;
});

after(async () => {
  if (originalHost === undefined) delete process.env.NEXT_PUBLIC_HOST_URL;
  else process.env.NEXT_PUBLIC_HOST_URL = originalHost;
  await pg.close();
});

function request(body: Record<string, unknown>) {
  return new NextRequest('https://directory.test.invalid/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function submit(overrides: Record<string, unknown> = {}) {
  return intake.POST(
    request({
      name: 'Ana Bakery',
      email,
      fiveWords: 'Fresh bread and pastries',
      instagram: 'anabakery',
      agreeTos: true,
      turnstileToken: 'verified-test-token',
      ...overrides,
    })
  );
}

async function saved(profileId: string) {
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, profileId),
  });
  assert.ok(profile);
  return profile;
}

function ownerSubmit(overrides: Record<string, unknown> = {}) {
  return submit({
    onboardingMode: 'owner',
    accountEmail: email,
    expectedOwnerId: session?.user.id ?? null,
    ...overrides,
  });
}

function setupRequest(profileId: string) {
  return new NextRequest(
    `https://directory.test.invalid/api/listings/setup?profileId=${encodeURIComponent(profileId)}`
  );
}

test('owner signup automatically connects the signed-in account without publishing or replacing its profile', async () => {
  const response = await ownerSubmit();
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.management, 'account');
  assert.equal(result.managementPath, '/account/profile/edit');
  assert.equal(
    result.setupPath,
    `/listings/setup?profileId=${result.profileId}`
  );
  assert.match(
    response.headers.get('set-cookie') ?? '',
    new RegExp(`pana_active_profile=${result.profileId}`)
  );
  assert.match(response.headers.get('set-cookie') ?? '', /HttpOnly/i);
  const profile = await saved(result.profileId);
  assert.equal(profile.email, email);
  assert.equal(profile.userId, null);
  assert.equal(profile.pendingOwnerEmail, null);
  assert.equal(profile.active, false);
  assert.equal(profile.screenname, null);
  assert.equal((await db.query.profileOwners.findFirst())?.userId, userId);
  assert.equal((await saved(personalId)).userId, userId);
  assert.equal((await db.query.users.findFirst())?.accountType, 'personal');
  assert.deepEqual(invitations, []);
});

test('owner signup separates the contact inbox from account identity', async () => {
  const response = await ownerSubmit({
    contactEmail: '  UPDATES@BAKERY.TEST ',
  });
  assert.equal(response.status, 201);
  const profile = await saved((await response.json()).profileId);
  assert.equal(profile.email, 'updates@bakery.test');
  assert.equal((await db.query.profileOwners.findFirst())?.userId, userId);
  assert.equal((await db.query.users.findFirst())?.email, email);
});

test('a guest gets one named setup email addressed to the main account inbox', async () => {
  session = null;
  const response = await ownerSubmit({ contactEmail: 'business@test.invalid' });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.invitationSent, true);
  assert.deepEqual(invitations, [
    {
      email,
      callback: result.setupPath,
      metadata: { listingSetupId: result.profileId },
    },
  ]);
  assert.deepEqual(emails.map((mail) => mail.template).sort(), [
    'admin.profile_submission',
    'profile.submitted',
  ]);
  assert.deepEqual(
    emails
      .filter((mail) => mail.template === 'profile.submitted')
      .map((mail) => mail.recipient),
    ['business@test.invalid'],
    'The main inbox already received its named setup receipt'
  );
  const listing = await saved(result.profileId);
  assert.equal(listing.email, 'business@test.invalid');
  assert.equal(listing.pendingOwnerEmail, email);
  assert.equal(listing.active, false);
  assert.equal((await db.select().from(schema.users)).length, 1);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.deepEqual(
    await setupEmail.listingSetupEmailContext(email, result.profileId),
    {
      id: result.profileId,
      name: 'Ana Bakery',
    }
  );
  assert.equal(
    await setupEmail.listingSetupEmailContext(
      'business@test.invalid',
      result.profileId
    ),
    null
  );
});

test('a setup email outage preserves the application and reports the delivery failure', async (context) => {
  context.mock.method(console, 'error', () => {});
  session = null;
  invitationFails = true;
  const response = await ownerSubmit();
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.invitationSent, false);
  assert.equal((await saved(result.profileId)).pendingOwnerEmail, email);
  assert.equal(
    emails.find((mail) => mail.template === 'profile.submitted')?.recipient,
    email
  );
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
});

test('ordinary profile lookup does not attach a new anonymously submitted business', async () => {
  session = null;
  const profileId = (await (await ownerSubmit()).json()).profileId;
  await db.delete(schema.profiles).where(eq(schema.profiles.id, personalId));
  assert.equal(await profileReader.ensureProfile(userId, email), null);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.equal((await saved(profileId)).userId, null);
  assert.equal((await saved(profileId)).pendingOwnerEmail, email);
});

test('new owner submissions reject changed accounts, changed emails, missing confirmation, and management opt-outs', async () => {
  for (const values of [
    { expectedOwnerId: 'previous-account' },
    { expectedOwnerId: null },
    { accountEmail: 'another@test.invalid' },
  ]) {
    assert.equal((await ownerSubmit(values)).status, 409);
  }
  for (const values of [
    { expectedOwnerId: undefined },
    { accountEmail: '' },
    { accountEmail: 'not-an-email' },
    { manageWithPana: false },
  ]) {
    assert.equal((await ownerSubmit(values)).status, 400);
  }
  session = null;
  assert.equal((await ownerSubmit({ expectedOwnerId: userId })).status, 409);
  assert.equal((await db.select().from(schema.profiles)).length, 1);
  assert.deepEqual(emails, []);
});

test('business setup lookup is read-only, and explicit confirmation selects only the intended business', async () => {
  session = null;
  const profileId = (await (await ownerSubmit()).json()).profileId;
  session = { user: { id: userId, email, name: 'Ana' } };
  const response = await setup.GET(setupRequest(profileId));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.name, 'Ana Bakery');
  assert.equal(data.state, 'confirm');
  assert.equal(data.reviewState, 'pending');
  assert.equal(data.publicPath, null);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(JSON.stringify(data).includes(email), false);
  assert.equal(JSON.stringify(data).includes('access'), false);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.equal((await saved(profileId)).pendingOwnerEmail, email);

  const confirmed = await setup.POST(
    request({ profileId, expectedOwnerId: userId })
  );
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).next, '/account/profile/edit');
  assert.match(
    confirmed.headers.get('set-cookie') ?? '',
    new RegExp(`pana_active_profile=${profileId}`)
  );
  assert.equal((await db.query.profileOwners.findFirst())?.userId, userId);
  assert.equal((await saved(profileId)).pendingOwnerEmail, null);
  assert.equal((await saved(profileId)).userId, null);
  assert.equal((await saved(profileId)).active, false);
  assert.equal((await setup.GET(setupRequest(profileId))).status, 200);
  assert.equal(
    (await setup.POST(request({ profileId, expectedOwnerId: userId }))).status,
    200
  );
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
  assert.equal((await saved(personalId)).userId, userId);
});

test('setup rejects anonymous visitors, the business contact alone, stale accounts, and non-business profiles', async () => {
  session = null;
  const profileId = (
    await (await ownerSubmit({ contactEmail: 'business@test.invalid' })).json()
  ).profileId;
  assert.equal((await setup.GET(setupRequest(profileId))).status, 401);
  assert.equal(
    (await setup.POST(request({ profileId, expectedOwnerId: userId }))).status,
    401
  );
  await db
    .insert(schema.users)
    .values({ id: 'contact-account', email: 'business@test.invalid' });
  session = {
    user: {
      id: 'contact-account',
      email: 'business@test.invalid',
      name: 'Business inbox',
    },
  };
  assert.equal((await setup.GET(setupRequest(profileId))).status, 403);
  assert.equal(
    (
      await setup.POST(
        request({ profileId, expectedOwnerId: 'contact-account' })
      )
    ).status,
    403
  );
  session = { user: { id: userId, email, name: 'Ana' } };
  assert.equal(
    (await setup.POST(request({ profileId, expectedOwnerId: 'old-account' })))
      .status,
    409
  );
  assert.equal((await setup.GET(setupRequest(personalId))).status, 403);
  assert.equal(
    (
      await setup.POST(
        request({ profileId: personalId, expectedOwnerId: userId })
      )
    ).status,
    403
  );
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
});

test('a failed first ownership write rolls back both the grant and the saved invitation', async () => {
  session = null;
  const profileId = (await (await ownerSubmit()).json()).profileId;
  await assert.rejects(
    pending.acceptPendingInvitation('deleted-account', email, profileId)
  );
  assert.equal((await saved(profileId)).pendingOwnerEmail, email);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
});

test('a setup write outage reports failure without losing the pending invitation', async (context) => {
  context.mock.method(console, 'error', () => {});
  session = null;
  const profileId = (await (await ownerSubmit()).json()).profileId;
  session = { user: { id: userId, email, name: 'Ana' } };
  const transaction = context.mock.method(db, 'transaction', async () => {
    throw new Error('Database unavailable');
  });
  const response = await setup.POST(
    request({ profileId, expectedOwnerId: userId })
  );
  assert.equal(response.status, 500);
  assert.match(
    (await response.json()).error,
    /Could not open your business dashboard/
  );
  transaction.mock.restore();
  assert.equal((await saved(profileId)).pendingOwnerEmail, email);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.equal(
    (await setup.POST(request({ profileId, expectedOwnerId: userId }))).status,
    200
  );
});

test('setup distinguishes a declined listing from one still awaiting review', async () => {
  session = null;
  const profileId = (await (await ownerSubmit()).json()).profileId;
  session = { user: { id: userId, email, name: 'Ana' } };
  const listing = await saved(profileId);
  await db
    .update(schema.profiles)
    .set({
      status: {
        ...(listing.status as Record<string, unknown>),
        declined: new Date().toISOString(),
      },
    })
    .where(eq(schema.profiles.id, profileId));
  const response = await setup.GET(setupRequest(profileId));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reviewState, 'declined');
});

test('setup and legacy first claims cannot silently produce two owners', async () => {
  session = null;
  const profileId = (await (await ownerSubmit()).json()).profileId;
  await db
    .insert(schema.users)
    .values({ id: 'legacy-claimant', email: 'legacy@test.invalid' });
  const results = await Promise.all([
    pending.acceptPendingInvitation(userId, email, profileId),
    ownership.claimUnownedProfile(profileId, 'legacy-claimant'),
  ]);
  const outcomes = results.map((result) =>
    typeof result === 'string' ? result : result.outcome
  );
  assert.equal(outcomes.filter((outcome) => outcome === 'accepted').length, 1);
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
  assert.equal((await saved(profileId)).pendingOwnerEmail, null);
  assert.equal((await saved(profileId)).userId, null);
});

test('staff approval publishes an ownerless public page and does not require account setup', async () => {
  session = null;
  const profileId = (await (await ownerSubmit()).json()).profileId;
  const listing = await saved(profileId);
  const response = await decisions.POST(
    request({
      profileId,
      action: 'approve',
      access: (listing.status as { access: string }).access,
    })
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).data[0].publicPath,
    `/listings/${profileId}`
  );
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  const profile = await profileReader.getPublicListing(profileId);
  assert.ok(profile);
  assert.equal(profile.screenname, null);
  assert.ok(invalidatedPaths.includes(`/listings/${profileId}`));
  const mail = emails.find((email) => email.template === 'profile.published');
  assert.equal(
    mail?.variables.profileUrl,
    `https://directory.test.invalid/listings/${profileId}`
  );
  const page = await publicListingPage.default({
    params: Promise.resolve({ profileId }),
  });
  assert.equal(page.type, BusinessProfile);
  const metadata = await publicListingPage.generateMetadata({
    params: Promise.resolve({ profileId }),
  });
  assert.deepEqual(metadata.alternates, {
    canonical: `https://directory.test.invalid/listings/${profileId}`,
  });
  assert.equal(JSON.stringify(metadata).includes(email), false);
  assert.equal(JSON.stringify(metadata).includes('access'), false);
});

test('public ID pages reject pending, declined, unknown, and personal profiles', async () => {
  session = null;
  const profileId = (await (await ownerSubmit()).json()).profileId;
  for (const id of [profileId, personalId, 'unknown-profile']) {
    assert.equal(await profileReader.getPublicListing(id), null);
    await assert.rejects(
      publicListingPage.default({ params: Promise.resolve({ profileId: id }) }),
      /TEST_NOT_FOUND/
    );
  }
  await db
    .update(schema.profiles)
    .set({ screenname: 'pending-shop' })
    .where(eq(schema.profiles.id, profileId));
  assert.equal(await profileReader.getPublicProfile('pending-shop'), null);
  await db
    .update(schema.profiles)
    .set({
      status: { source: 'business_intake', declined: new Date().toISOString() },
    })
    .where(eq(schema.profiles.id, profileId));
  assert.equal(await profileReader.getPublicListing(profileId), null);
});

test('listing previews reject anonymous, non-admin, and moderator sessions before reading profiles', async () => {
  session = null;
  const profileId = (await (await ownerSubmit()).json()).profileId;
  const lookup = mock.method(db.query.profiles, 'findFirst');
  try {
    for (const viewer of [
      null,
      { user: { id: userId, email, name: 'Ana Person' } },
      {
        user: {
          id: userId,
          email,
          name: 'Ana Person',
          isContentModerator: true,
        },
      },
    ]) {
      session = viewer;
      assert.equal(await profileReader.getAdminListingPreview(profileId), null);
      await assert.rejects(
        adminListingPreviewPage.default({
          params: Promise.resolve({ profileId }),
        }),
        /TEST_NOT_FOUND/
      );
    }
    assert.equal(lookup.mock.callCount(), 0);
  } finally {
    lookup.mock.restore();
  }
});

test('admins can preview pending and declined profiles without making them public', async () => {
  session = null;
  const profileId = (await (await ownerSubmit()).json()).profileId;
  session = {
    user: { id: userId, email, name: 'Ana Person', isAdmin: true },
  };
  for (const status of [
    { source: 'business_intake' },
    { source: 'business_intake', declined: new Date().toISOString() },
  ]) {
    await db
      .update(schema.profiles)
      .set({ status, screenname: 'pending-shop' })
      .where(eq(schema.profiles.id, profileId));
    const profile = await profileReader.getAdminListingPreview(profileId);
    assert.ok(profile);
    assert.equal(profile.id, profileId);
    assert.equal(profile.name, 'Ana Bakery');
    assert.equal(profile.screenname, 'pending-shop');
    assert.equal(profile.active, false);
    const page = await adminListingPreviewPage.default({
      params: Promise.resolve({ profileId }),
    });
    const content = page.props.children[1];
    assert.equal(content.type, BusinessProfile);
    assert.equal(content.props.profile.id, profileId);
    assert.equal(content.props.handle, 'pending-shop');
    assert.equal(content.props.preview, true);
    assert.equal(await profileReader.getPublicListing(profileId), null);
    assert.equal(await profileReader.getPublicProfile('pending-shop'), null);
    assert.equal((await saved(profileId)).active, false);
  }
});

test('admin profile previews reject missing and non-intake profiles and stay unindexed', async () => {
  session = {
    user: { id: userId, email, name: 'Ana Person', isAdmin: true },
  };
  for (const profileId of [personalId, 'unknown-profile']) {
    assert.equal(await profileReader.getAdminListingPreview(profileId), null);
    await assert.rejects(
      adminListingPreviewPage.default({
        params: Promise.resolve({ profileId }),
      }),
      /TEST_NOT_FOUND/
    );
  }
  assert.equal(adminListingPreviewPage.dynamic, 'force-dynamic');
  assert.deepEqual(adminListingPreviewPage.metadata.robots, {
    index: false,
    follow: false,
  });
});

test('a legacy directory account without a profile handle retains its canonical user-handle URL', async () => {
  await db
    .update(schema.users)
    .set({ accountType: 'directory', screenname: 'legacy-shop' })
    .where(eq(schema.users.id, userId));
  const listing = await profileReader.getPublicListing(personalId);
  assert.ok(listing);
  assert.equal(listing.screenname, 'legacy-shop');
  await assert.rejects(
    publicListingPage.default({
      params: Promise.resolve({ profileId: personalId }),
    }),
    /TEST_REDIRECT:\/p\/legacy-shop/
  );
});

test('directory claimed status reflects ownership, not the presence of a handle', async () => {
  await db.insert(schema.profiles).values([
    {
      id: 'owned-no-handle',
      name: 'Owned Shop',
      email: 'owned@test.invalid',
      userId: null,
      onlineOnly: false,
      active: true,
    },
    {
      id: 'handle-no-owner',
      name: 'Unclaimed Shop',
      email: 'unclaimed@test.invalid',
      userId: null,
      onlineOnly: false,
      active: true,
      screenname: 'unclaimed-shop',
    },
  ]);
  await ownership.addProfileOwner('owned-no-handle', userId);
  const results = await directory.getSearch({
    pageNum: 1,
    pageLimit: 20,
    searchTerm: '',
    filterCategories: '',
    geolat: '',
    geolng: '',
    radius: 'all',
    resultsView: '',
  });
  assert.equal(
    results.data.find((profile) => profile.id === 'owned-no-handle')?.claimed,
    true
  );
  assert.equal(
    results.data.find((profile) => profile.id === 'handle-no-owner')?.claimed,
    false
  );
});

test('featured cards and sitemap entries include approved handleless listings, not pending or personal profiles', async () => {
  await db.insert(schema.profiles).values([
    {
      id: 'featured-no-handle',
      name: 'Featured Shop',
      email: 'feature@test.invalid',
      userId: null,
      active: true,
      onlineOnly: false,
      primaryImageCdn: 'https://images.test.invalid/business.jpg',
    },
    {
      id: 'featured-pending',
      name: 'Pending Shop',
      email: 'pending-feature@test.invalid',
      userId: null,
      active: false,
      onlineOnly: false,
      primaryImageCdn: 'https://images.test.invalid/pending.jpg',
    },
  ]);
  const featuredResponse = await featured.GET(
    new NextRequest('https://directory.test.invalid/api/directory/featured')
  );
  assert.equal(featuredResponse.status, 200);
  const featuredData = (await featuredResponse.json()).data;
  assert.deepEqual(
    featuredData.map((profile: { id: string }) => profile.id),
    ['featured-no-handle']
  );
  assert.equal(featuredData[0].screenname, null);
  const entries = await sitemap.default();
  assert.ok(
    entries.some(
      (entry) =>
        entry.url ===
        'https://directory.test.invalid/listings/featured-no-handle'
    )
  );
  assert.equal(
    entries.some((entry) => entry.url.includes('featured-pending')),
    false
  );
  assert.equal(
    entries.some((entry) => entry.url.includes(personalId)),
    false
  );
});

test('directory autocomplete includes a handleless approved business with a public ID destination', async () => {
  await db.insert(schema.profiles).values([
    {
      id: 'autocomplete-business',
      name: 'Handleless Shop',
      email: 'autocomplete@test.invalid',
      userId: null,
      active: true,
      onlineOnly: false,
    },
    {
      id: 'autocomplete-pending',
      name: 'Handleless Pending',
      email: 'autocomplete-pending@test.invalid',
      userId: null,
      active: false,
      onlineOnly: false,
    },
  ]);
  const results = await suggestions.getSuggestions('Handleless', {
    viewerIsSignedIn: false,
    scope: 'directory',
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, 'directory');
  assert.equal(results[0].href, '/listings/autocomplete-business');
});

test('recommendation lists link to public IDs and keep withdrawn listings as unavailable notes', async () => {
  const now = new Date();
  await db.insert(schema.profiles).values([
    {
      id: 'recommended-no-handle',
      name: 'Recommended Shop',
      email: 'recommended@test.invalid',
      userId: null,
      active: true,
      onlineOnly: false,
    },
    {
      id: 'recommended-withdrawn',
      name: 'Withdrawn Shop',
      email: 'withdrawn@test.invalid',
      userId: null,
      active: false,
      onlineOnly: false,
    },
  ]);
  const [list] = await db
    .insert(schema.recommendationLists)
    .values({
      id: 'test-list',
      ownerUserId: userId,
      title: 'My favorite shops',
      slug: 'favorite-shops',
      visibility: 'public',
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await db.insert(schema.recommendationListItems).values([
    {
      id: 'first-item',
      listId: list.id,
      profileId: 'recommended-no-handle',
      profileNameAtAdd: 'Recommended Shop',
      position: 0,
      note: 'Great bread',
      createdAt: now,
    },
    {
      id: 'second-item',
      listId: list.id,
      profileId: 'recommended-withdrawn',
      profileNameAtAdd: 'Previous name',
      position: 1,
      note: 'My old recommendation',
      createdAt: now,
    },
  ]);
  const items = await recommendationLists.getListItems(list.id);
  const publicItems = items.map(recommendationLists.serializeListItem);
  assert.equal(publicItems[0].profileId, 'recommended-no-handle');
  assert.equal(publicItems[0].isUnavailable, false);
  assert.equal(publicItems[1].profileId, null);
  assert.equal(publicItems[1].isUnavailable, true);
  assert.equal(publicItems[1].profileName, 'Previous name');
  assert.equal(publicItems[1].note, 'My old recommendation');
  const federated = recommendationLists.serializeListAsCollection(
    list,
    items,
    'ana-person'
  );
  const firstLink = federated.orderedItems[0].tag[0];
  assert.ok(firstLink);
  assert.ok(firstLink.href.endsWith('/listings/recommended-no-handle'));
  assert.deepEqual(federated.orderedItems[1].tag, []);
});

test('business managers without personal profiles are recognized separately from social onboarding', async () => {
  assert.equal(
    (await (await userMe.GET()).json()).data.hasManagedListings,
    false
  );
  const profileId = (await (await ownerSubmit()).json()).profileId;
  await db.delete(schema.profiles).where(eq(schema.profiles.id, personalId));
  const data = (await (await userMe.GET()).json()).data;
  assert.equal(data.hasManagedListings, true);
  assert.equal(data.screenname, null);
  assert.equal((await saved(profileId)).userId, null);
});

test('staff review distinguishes connected owners from unanswered setup invitations', async () => {
  const ownedId = (await (await ownerSubmit({ name: 'Connected Shop' })).json())
    .profileId;
  session = null;
  const invitedId = (await (await ownerSubmit({ name: 'Invited Shop' })).json())
    .profileId;
  session = { user: { id: userId, email, name: 'Ana', isAdmin: true } };
  const response = await adminListings.GET();
  assert.equal(response.status, 200);
  const pending = (await response.json()).pending as Array<{
    id: string;
    claimed: boolean;
    pendingOwnerEmail: string;
  }>;
  assert.equal(
    pending.find((listing) => listing.id === ownedId)?.claimed,
    true
  );
  assert.equal(
    pending.find((listing) => listing.id === invitedId)?.claimed,
    false
  );
  assert.equal(
    pending.find((listing) => listing.id === invitedId)?.pendingOwnerEmail,
    email
  );
});

async function decide(
  profileId: string,
  action: 'approve' | 'decline' = 'approve'
) {
  const listing = await saved(profileId);
  return decisions.POST(
    request({
      profileId,
      action,
      access: (listing.status as { access: string }).access,
    })
  );
}

function recipientsFor(template: string) {
  return emails
    .filter((mail) => mail.template === template)
    .map((mail) => mail.recipient)
    .sort();
}

test('approval emails go to the owner sign-in email and a separate business contact', async () => {
  const profileId = (
    await (await ownerSubmit({ contactEmail: 'business@test.invalid' })).json()
  ).profileId;
  emails.length = 0;
  assert.equal((await decide(profileId)).status, 200);
  assert.deepEqual(
    recipientsFor('profile.published'),
    [email, 'business@test.invalid'].sort()
  );
  assert.equal((await saved(profileId)).active, true);
  assert.ok(
    emails.every(
      (mail) =>
        !('approve_url' in mail.variables) && !('signInUrl' in mail.variables)
    )
  );
  await decide(profileId);
  assert.equal(
    recipientsFor('profile.published').length,
    2,
    'Reopening an approval does not resend the decision'
  );
});

test('decline emails reach both owner and business inbox without publishing', async () => {
  const profileId = (
    await (await ownerSubmit({ contactEmail: 'business@test.invalid' })).json()
  ).profileId;
  emails.length = 0;
  assert.equal((await decide(profileId, 'decline')).status, 200);
  assert.deepEqual(
    recipientsFor('profile.not_published'),
    [email, 'business@test.invalid'].sort()
  );
  assert.equal((await saved(profileId)).active, false);
});

test('guests receive approval at the application account email before finishing setup', async () => {
  session = null;
  const profileId = (
    await (await ownerSubmit({ contactEmail: 'business@test.invalid' })).json()
  ).profileId;
  emails.length = 0;
  await decide(profileId);
  assert.deepEqual(
    recipientsFor('profile.published'),
    [email, 'business@test.invalid'].sort()
  );
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.equal((await saved(profileId)).pendingOwnerEmail, email);
});

test('connected listing owners receive decisions at their current sign-in email after an email change', async () => {
  session = null;
  const profileId = (
    await (await ownerSubmit({ contactEmail: 'business@test.invalid' })).json()
  ).profileId;
  session = { user: { id: userId, email, name: 'Ana' } };
  await setup.POST(request({ profileId, expectedOwnerId: userId }));
  await db
    .update(schema.users)
    .set({ email: 'new-account@test.invalid' })
    .where(eq(schema.users.id, userId));
  emails.length = 0;
  await decide(profileId);
  assert.deepEqual(recipientsFor('profile.published'), [
    'business@test.invalid',
    'new-account@test.invalid',
  ]);
  assert.equal((await saved(profileId)).pendingOwnerEmail, null);
});

test('matching account and contact addresses are normalized and receive just one receipt and decision', async () => {
  await db
    .update(schema.users)
    .set({ email: email.toUpperCase() })
    .where(eq(schema.users.id, userId));
  const profileId = (
    await (
      await ownerSubmit({ contactEmail: ` ${email.toUpperCase()} ` })
    ).json()
  ).profileId;
  assert.deepEqual(recipientsFor('profile.submitted'), [email]);
  emails.length = 0;
  await decide(profileId);
  assert.deepEqual(recipientsFor('profile.published'), [email]);
});

test('listing notification recipients use explicit ownership rather than email-matching other accounts', async () => {
  const businessEmail = 'business@test.invalid';
  await db
    .insert(schema.users)
    .values({ id: 'business-contact-account', email: businessEmail });
  await db
    .update(schema.profiles)
    .set({ email: businessEmail })
    .where(eq(schema.profiles.id, personalId));
  assert.deepEqual(
    (
      await listingNotifications.listingNotificationRecipients(
        await saved(personalId)
      )
    ).sort(),
    [email, businessEmail].sort()
  );
  const profileId = (
    await (await ownerSubmit({ contactEmail: businessEmail })).json()
  ).profileId;
  await db
    .update(schema.profiles)
    .set({ pendingOwnerEmail: 'superseded@test.invalid' })
    .where(eq(schema.profiles.id, profileId));
  assert.deepEqual(
    (
      await listingNotifications.listingNotificationRecipients(
        await saved(profileId)
      )
    ).sort(),
    [email, businessEmail].sort(),
    'A superseded invitation is not an extra notification recipient'
  );
});

test('submission receipts and resends copy the connected owner account as well as the business inbox', async () => {
  const profileId = (
    await (await ownerSubmit({ contactEmail: 'business@test.invalid' })).json()
  ).profileId;
  assert.deepEqual(
    recipientsFor('profile.submitted'),
    [email, 'business@test.invalid'].sort()
  );
  emails.length = 0;
  assert.equal((await resend.POST(request({ profileId }))).status, 200);
  assert.deepEqual(
    recipientsFor('profile.submitted'),
    [email, 'business@test.invalid'].sort()
  );
});

test('a failed business copy cannot suppress or abandon delivery to the owner sign-in email', async (context) => {
  context.mock.method(console, 'error', () => {});
  const profileId = (
    await (await ownerSubmit({ contactEmail: 'business@test.invalid' })).json()
  ).profileId;
  emails.length = 0;
  failingRecipients.add('business@test.invalid');
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sending = new Promise<void>((resolve) => {
    started = resolve;
  });
  delayedRecipients.set(email, { wait: waiting, started });
  let finished = false;
  const responsePromise = decide(profileId).then((response) => {
    finished = true;
    return response;
  });
  try {
    await sending;
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(
      finished,
      false,
      'The request awaits the owner mail even after the business copy fails'
    );
  } finally {
    release();
  }
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.match(
    (await response.json()).data[0].message,
    /one or more notification emails could not be sent/
  );
  assert.deepEqual(
    recipientsFor('profile.published'),
    [email, 'business@test.invalid'].sort()
  );
  assert.equal((await saved(profileId)).active, true);
});

test('online intake requires a ZIP and rejects invalid or contradictory location choices before lookup', async () => {
  for (const overrides of [
    { onlineOnly: true },
    { onlineOnly: true, addressPostalCode: '331380' },
    { onlineOnly: true, addressPostalCode: 33138 },
    { onlineOnly: 'true', addressPostalCode: '33138' },
    {
      onlineOnly: true,
      hasStorefront: true,
      addressPostalCode: '33138',
      addressLine1: 'A public street',
      addressLocality: 'Miami',
    },
  ]) {
    const response = await submit(overrides);
    assert.equal(response.status, 400);
    assert.equal((await db.select().from(schema.profiles)).length, 1);
  }
  assert.deepEqual(zipRequests, []);
});

test('online intake persists a canonical ZIP area without storing a street address or exact point', async () => {
  session = null;
  const response = await submit({
    onlineOnly: true,
    addressPostalCode: ' 33138-1234 ',
    addressLine1: '123 Private Home Road',
    addressLocality: 'Private city',
    lat: 37.8,
    lng: -122.4,
  });
  assert.equal(response.status, 201);
  const profile = await saved((await response.json()).profileId);
  assert.equal(profile.onlineOnly, true);
  assert.equal(profile.addressPostalCode, '33138');
  assert.equal(profile.addressLocality, 'Miami');
  assert.equal(profile.addressCountry, 'US');
  assert.equal(profile.addressLine1, null);
  assert.equal(profile.addressLat, null);
  assert.equal(profile.addressLng, null);
  assert.deepEqual(profile.geo, { zipArea: zipArea('33138') });
  assert.deepEqual(zipRequests, ['https://api.zippopotam.us/us/33138']);
  const publicResults = await directory.getSearch({
    pageNum: 1,
    pageLimit: 20,
    searchTerm: '',
    filterCategories: '',
    geolat: '',
    geolng: '',
    radius: 'all',
    resultsView: '',
  });
  assert.deepEqual(
    publicResults.data,
    [],
    'A pending listing must not create a public ZIP bubble'
  );
});

test('unknown ZIPs and lookup outages do not create partially located online listings', async () => {
  assert.equal(
    (await submit({ onlineOnly: true, addressPostalCode: '00000' })).status,
    400
  );
  zipUnavailable = true;
  assert.equal(
    (await submit({ onlineOnly: true, addressPostalCode: '33138' })).status,
    503
  );
  assert.equal((await db.select().from(schema.profiles)).length, 1);
  assert.deepEqual(emails, []);
});

test('storefront and mobile intake keep their existing optional ZIP behavior', async () => {
  const storefront = await submit({
    hasStorefront: true,
    addressLine1: 'A public street',
    addressLocality: 'Miami',
  });
  assert.equal(storefront.status, 201);
  const physical = await saved((await storefront.json()).profileId);
  assert.equal(physical.onlineOnly, false);
  assert.equal(physical.addressLine1, 'A public street');
  assert.equal(physical.addressPostalCode, null);
  const mobile = await submit({
    name: 'Ana Mobile Services',
    addressPostalCode: '33138',
  });
  assert.equal(mobile.status, 201);
  assert.equal(
    (await saved((await mobile.json()).profileId)).addressPostalCode,
    null
  );
  assert.deepEqual(zipRequests, []);
});

test('address editing enforces online ZIPs, accepts either postal alias, and ignores private coordinates', async () => {
  assert.equal(
    (await addressUpdate.POST(request({ online_only: true }))).status,
    400
  );
  assert.equal(
    (
      await addressUpdate.POST(
        request({
          online_only: true,
          primary_address: { zipcode: '3313' },
        })
      )
    ).status,
    400
  );
  const response = await addressUpdate.POST(
    request({
      online_only: true,
      primary_address: {
        postalCode: '33138-1234',
        line1: 'A private home',
        lat: '37.8',
        lng: '-122.4',
      },
    })
  );
  assert.equal(response.status, 200);
  const profile = await saved(personalId);
  assert.equal(profile.onlineOnly, true);
  assert.equal(profile.addressPostalCode, '33138');
  assert.equal(profile.addressLine1, null);
  assert.equal(profile.addressLat, null);
  assert.equal(profile.addressLng, null);
  assert.deepEqual(profile.geo, { zipArea: zipArea('33138') });
  assert.equal(
    (
      await addressUpdate.POST(
        request({
          primary_address: { zipcode: '' },
        })
      )
    ).status,
    400,
    'An already-online listing cannot clear its required ZIP'
  );
});

test('a failed ZIP edit preserves the previous location and online choice', async () => {
  await db
    .update(schema.profiles)
    .set({
      addressLine1: 'A public street',
      addressLat: '25.76',
      addressLng: '-80.19',
    })
    .where(eq(schema.profiles.id, personalId));
  zipUnavailable = true;
  assert.equal(
    (
      await addressUpdate.POST(
        request({
          online_only: true,
          primary_address: { zipcode: '33138' },
        })
      )
    ).status,
    503
  );
  const profile = await saved(personalId);
  assert.equal(profile.onlineOnly, false);
  assert.equal(profile.addressLine1, 'A public street');
  assert.equal(Number(profile.addressLat), 25.76);
});

test('public online profiles mask old exact points and street fields', async () => {
  await db
    .update(schema.profiles)
    .set({
      screenname: 'online-ana',
      onlineOnly: true,
      addressPostalCode: '33138-1234',
      addressLine1: 'A private home',
      addressLat: '37.8',
      addressLng: '-122.4',
      geo: { type: 'Point', coordinates: [-122.4, 37.8] },
    })
    .where(eq(schema.profiles.id, personalId));
  const profile = await profileReader.getPublicProfile('online-ana');
  assert.ok(profile);
  assert.equal(profile.geo, null);
  assert.equal(profile.addressLat, null);
  assert.equal(profile.addressLng, null);
  assert.equal(profile.addressLine1, null);
  assert.equal(profile.primary_address.street1, undefined);
  assert.equal(profile.primary_address.zipcode, '33138');
});

test('nearby online results use ZIP areas rather than old home coordinates and group only real matches', async () => {
  await db.insert(schema.profiles).values([
    {
      id: 'zip-near',
      email: 'near@test.invalid',
      name: 'Nearby online shop',
      onlineOnly: true,
      active: true,
      addressPostalCode: '33138',
      addressCountry: 'US',
      addressLat: '37.8',
      addressLng: '-122.4',
      geo: { type: 'Point', coordinates: [-122.4, 37.8] },
    },
    {
      id: 'zip-far',
      email: 'far@test.invalid',
      name: 'Broward online shop',
      onlineOnly: true,
      active: true,
      addressPostalCode: '33301',
      addressCountry: 'US',
      addressLat: '25.85',
      addressLng: '-80.18',
      geo: { type: 'Point', coordinates: [-80.18, 25.85] },
    },
    {
      id: 'zip-pending',
      email: 'pending@test.invalid',
      name: 'Pending online shop',
      onlineOnly: true,
      active: false,
      addressPostalCode: '33138',
    },
  ]);
  const options = {
    pageNum: 1,
    pageLimit: 20,
    searchTerm: '',
    filterCategories: '',
    geolat: '25.85',
    geolng: '-80.18',
    radius: '5' as const,
    resultsView: '',
  };
  const nearby = await directory.getSearch(options);
  assert.deepEqual(
    nearby.data.map((row) => row.id),
    ['zip-near']
  );
  assert.equal(nearby.data[0].geo, null);
  assert.deepEqual(nearby.data[0].online_zip, zipArea('33138'));
  const all = await directory.getSearch({ ...options, radius: 'all' });
  assert.equal(all.data.length, 2);
  const groups = groupOnlineZipListings(all.data, (row) => row.online_zip);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => group.items.length === 1));
  assert.ok(all.data.every((row) => row.geo === null));
});

test('an existing pana can submit and manage a separate listing with the same email', async () => {
  const response = await submit({
    manageWithPana: true,
    expectedManagerId: userId,
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.management, 'account');
  assert.equal(result.invitationEmail, null);
  assert.equal(result.invitationSent, false);
  const listing = await saved(result.profileId);
  assert.equal(listing.email, email);
  assert.equal(listing.userId, null);
  assert.equal(listing.pendingOwnerEmail, null);
  assert.equal(listing.active, false);
  assert.equal((await saved(personalId)).name, 'Ana Person');
  assert.equal((await db.query.users.findFirst())?.accountType, 'personal');
  const owner = await db.query.profileOwners.findFirst();
  assert.equal(owner?.userId, userId);
  assert.equal(owner?.profileId, listing.id);
  assert.deepEqual(invitations, []);

  const notification = emails.find(
    (mail) => mail.template === 'admin.profile_submission'
  );
  assert.ok(notification);
  assert.equal(notification.variables.name, 'Ana Bakery');
  const approve = new URL(String(notification.variables.approve_url));
  assert.equal(approve.searchParams.get('profileId'), listing.id);
  assert.equal(approve.searchParams.has('email'), false);
});

test('a custom business contact still belongs to the signed-in pana, not a new login', async () => {
  const response = await submit({
    email: '  HELLO@BAKERY.TEST  ',
    manageWithPana: true,
  });
  assert.equal(response.status, 201);
  const listing = await saved((await response.json()).profileId);
  assert.equal(listing.email, 'hello@bakery.test');
  assert.equal((await db.query.profileOwners.findFirst())?.userId, userId);
  assert.equal((await db.query.users.findFirst())?.email, email);
  assert.equal((await saved(personalId)).email, email);
  assert.deepEqual(invitations, []);
});

test('a guest can submit without creating or inviting a personal account', async () => {
  session = null;
  const response = await submit({ email: 'hello@bakery.test' });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.management, 'unclaimed');
  assert.equal(result.invitationEmail, null);
  assert.equal((await saved(result.profileId)).userId, null);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.equal((await db.select().from(schema.users)).length, 1);
  assert.deepEqual(invitations, []);
  assert.equal(
    emails.find((mail) => mail.template === 'profile.submitted')?.recipient,
    'hello@bakery.test'
  );
});

test('a guest invites their chosen personal address and must explicitly accept ownership', async () => {
  session = null;
  const response = await submit({
    email: 'hello@bakery.test',
    personalEmail: '  OWNER@PERSONAL.TEST  ',
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.management, 'invitation');
  assert.equal(result.invitationEmail, 'owner@personal.test');
  assert.equal(result.invitationSent, true);
  assert.deepEqual(invitations, [
    {
      email: 'owner@personal.test',
      callback: '/account',
    },
  ]);
  assert.equal((await saved(result.profileId)).email, 'hello@bakery.test');
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.equal(
    (await pending.listPendingInvitations('owner@personal.test'))[0]?.profileId,
    result.profileId
  );

  await db.insert(schema.users).values({
    id: 'invited-owner',
    email: 'owner@personal.test',
  });
  assert.equal(
    await pending.acceptPendingInvitation(
      'invited-owner',
      'owner@personal.test',
      result.profileId
    ),
    'accepted'
  );
  assert.equal(
    (await db.query.profileOwners.findFirst())?.userId,
    'invited-owner'
  );
  assert.equal((await saved(result.profileId)).userId, null);
});

test('a guest with one inbox can request their account invitation at the contact address', async () => {
  session = null;
  const response = await submit({ personalEmail: email });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.management, 'invitation');
  assert.equal(result.invitationEmail, email);
  assert.equal(invitations[0]?.email, email);
  assert.equal((await saved(result.profileId)).pendingOwnerEmail, email);
});

test('a signed-in submitter can leave another listing unclaimed', async () => {
  const response = await submit({ manageWithPana: false });
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.management, 'unclaimed');
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.deepEqual(invitations, []);
});

test('a signed-in submitter can invite somebody else instead of becoming the owner', async () => {
  const response = await submit({
    manageWithPana: false,
    personalEmail: 'actual-owner@personal.test',
  });
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.management, 'invitation');
  assert.equal(invitations[0]?.email, 'actual-owner@personal.test');
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
});

test('an expired session cannot silently turn a managed application into an unclaimed one', async () => {
  session = null;
  const response = await submit({ manageWithPana: true });
  assert.equal(response.status, 401);
  assert.equal((await db.select().from(schema.profiles)).length, 1);
  assert.deepEqual(emails, []);
});

test('a stale manager selection cannot assign a listing to a different authenticated account', async () => {
  const response = await submit({
    manageWithPana: true,
    expectedManagerId: 'previous-account',
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'manager_changed');
  assert.equal((await db.select().from(schema.profiles)).length, 1);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.deepEqual(emails, []);
});

test('an ownership write failure rolls back the listing instead of leaving a partial submission', async (context) => {
  context.mock.method(console, 'error', () => {});
  session = { user: { id: 'deleted-account', email, name: 'Deleted' } };
  const response = await submit({ manageWithPana: true });
  assert.equal(response.status, 500);
  assert.equal((await db.select().from(schema.profiles)).length, 1);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.deepEqual(emails, []);
});

test('personal names do not count as duplicate listings, but repeat applications do', async () => {
  const response = await submit({ name: 'Ana Person', manageWithPana: true });
  assert.equal(response.status, 201);
  const repeat = await submit({
    name: 'ANA PERSON',
    email: email.toUpperCase(),
  });
  assert.equal(repeat.status, 409);
  assert.match((await repeat.json()).error, /name and contact email/);
  const different = await submit({ name: 'Ana Studio', manageWithPana: true });
  assert.equal(different.status, 201);
  assert.equal((await db.select().from(schema.profiles)).length, 3);
});

test('concurrent duplicate submissions save only one listing and owner', async (context) => {
  context.mock.method(console, 'error', () => {});
  const responses = await Promise.all([
    submit({ manageWithPana: true }),
    submit({ manageWithPana: true }),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort((a, b) => a - b),
    [201, 409]
  );
  assert.equal((await db.select().from(schema.profiles)).length, 2);
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
});

test('Turnstile remains required before an application or ownership is written', async () => {
  verificationPasses = false;
  const response = await submit({ manageWithPana: true });
  assert.equal(response.status, 400);
  assert.equal((await db.select().from(schema.profiles)).length, 1);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
});

test('an invitation mail failure preserves the application and reports that no link was sent', async (context) => {
  context.mock.method(console, 'error', () => {});
  invitationFails = true;
  session = null;
  const response = await submit({ personalEmail: 'owner@personal.test' });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.management, 'invitation');
  assert.equal(result.invitationSent, false);
  assert.equal(
    (await saved(result.profileId)).pendingOwnerEmail,
    'owner@personal.test'
  );
  assert.equal(
    (await pending.listPendingInvitations('owner@personal.test')).length,
    1
  );
});

test('a notification outage does not lose an application or its chosen owner', async (context) => {
  context.mock.method(console, 'error', () => {});
  notificationFails = true;
  const response = await submit({ manageWithPana: true });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal((await saved(result.profileId)).active, false);
  assert.equal(
    (await db.query.profileOwners.findFirst())?.profileId,
    result.profileId
  );
});

test('legacy approval links select the access-key holder, not the first matching email', async () => {
  const first = await (await submit({ name: 'First Listing' })).json();
  const second = await (await submit({ name: 'Second Listing' })).json();
  const secondListing = await saved(second.profileId);
  const status = secondListing.status as { access: string };
  const response = await decisions.POST(
    request({
      email,
      access: status.access,
      action: 'approve',
    })
  );
  assert.equal((await response.json()).success, true);
  assert.equal((await saved(first.profileId)).active, false);
  assert.equal((await saved(second.profileId)).active, true);
  assert.equal((await saved(personalId)).status, null);
});

test('new approval links survive changes to the listing contact address', async () => {
  const result = await (await submit({ manageWithPana: true })).json();
  const listing = await saved(result.profileId);
  const status = listing.status as { access: string };
  activeProfileId = listing.id;
  assert.equal(
    (await contact.POST(request({ email: 'new-contact@bakery.test' }))).status,
    200
  );
  const response = await decisions.POST(
    request({
      profileId: listing.id,
      access: status.access,
      action: 'approve',
    })
  );
  assert.equal((await response.json()).success, true);
  assert.equal((await saved(listing.id)).active, true);
  assert.equal((await saved(personalId)).status, null);
});

test('neither a shared inbox nor a profile id substitutes for the review capability', async () => {
  const result = await (await submit()).json();
  const response = await decisions.POST(
    request({
      profileId: result.profileId,
      email,
      access: 'not-the-review-key',
      action: 'approve',
    })
  );
  assert.equal((await response.json()).success, false);
  assert.equal((await saved(result.profileId)).active, false);
});

test('staff can resend an unclaimed submission without becoming its owner', async () => {
  const listing = await (await submit()).json();
  session = { user: { id: userId, email, name: 'Ana Admin', isAdmin: true } };
  emails.length = 0;
  const response = await resend.POST(request({ profileId: listing.profileId }));
  assert.equal(response.status, 200);
  const notification = emails.find(
    (mail) => mail.template === 'admin.profile_submission'
  );
  assert.ok(notification);
  assert.equal(
    new URL(String(notification.variables.approve_url)).searchParams.get(
      'profileId'
    ),
    listing.profileId
  );
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
});

test('submission resends use the owned profile id and reject email-based ownership guesses', async () => {
  const owned = await (await submit({ manageWithPana: true })).json();
  const unclaimed = await (await submit({ name: 'Somebody Else' })).json();
  emails.length = 0;
  const response = await resend.POST(request({ profileId: owned.profileId }));
  assert.equal(response.status, 200);
  assert.equal(
    emails.find((mail) => mail.template === 'admin.profile_submission')
      ?.variables.name,
    'Ana Bakery'
  );
  assert.equal(
    (await resend.POST(request({ profileId: unclaimed.profileId }))).status,
    403
  );
  session = null;
  assert.equal(
    (await resend.POST(request({ profileId: owned.profileId }))).status,
    401
  );
});

test('editing a listing contact email leaves the personal profile and login unchanged', async () => {
  const result = await (await submit({ manageWithPana: true })).json();
  activeProfileId = result.profileId;
  const response = await contact.POST(
    request({ email: '  HELLO@BAKERY.TEST  ' })
  );
  assert.equal(response.status, 200);
  assert.equal((await saved(result.profileId)).email, 'hello@bakery.test');
  assert.equal((await saved(personalId)).email, email);
  assert.equal((await db.query.users.findFirst())?.email, email);
  assert.equal(
    (await contact.POST(request({ email }))).status,
    200,
    'the Pana inbox may be copied back onto the listing'
  );
});

test('listing contact validation and active-profile authorization remain enforced', async () => {
  const owned = await (await submit({ manageWithPana: true })).json();
  activeProfileId = owned.profileId;
  assert.equal(
    (await contact.POST(request({ email: 'not-an-email' }))).status,
    400
  );
  assert.equal((await saved(owned.profileId)).email, email);

  const unclaimed = await (await submit({ name: 'Not Mine' })).json();
  activeProfileId = unclaimed.profileId;
  assert.equal(
    (await contact.POST(request({ email: 'stolen@bakery.test' }))).status,
    400
  );
  assert.equal((await saved(unclaimed.profileId)).email, email);
  assert.equal((await saved(personalId)).email, email);
});

test('a later Pana email change does not change the copied listing contact email', async () => {
  const result = await (await submit({ manageWithPana: true })).json();
  await db.insert(schema.emailMigrations).values({
    userId,
    oldEmail: email,
    newEmail: 'new-pana@personal.test',
    migrationToken: 'account-email-change',
    expiresAt: new Date(Date.now() + 60_000),
  });
  const response = await migration.POST(
    request({ token: 'account-email-change' })
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await db.query.users.findFirst())?.email,
    'new-pana@personal.test'
  );
  assert.equal((await saved(personalId)).email, 'new-pana@personal.test');
  assert.equal((await saved(result.profileId)).email, email);
  assert.equal((await db.query.profileOwners.findFirst())?.userId, userId);
});

test('mentoring edits update only the human identity, not listings sharing the inbox', async () => {
  const result = await (await submit({ manageWithPana: true })).json();
  const response = await mentoring.PATCH(
    request({
      enabled: true,
      expertise: ['art'],
      languages: ['en'],
      bio: 'A sufficiently detailed mentoring biography.',
    })
  );
  assert.equal(response.status, 200);
  assert.equal((await saved(result.profileId)).mentoring, null);
  assert.equal(
    ((await saved(personalId)).mentoring as { enabled: boolean }).enabled,
    true
  );
});

test('booking resolves the mentor account, not a listing with the same contact', async () => {
  await db
    .insert(schema.users)
    .values({ id: 'mentor-account', email: 'mentor@personal.test' });
  await db.insert(schema.profiles).values({
    email: 'mentor@personal.test',
    name: 'Mentor Business',
    status: { source: 'business_intake' },
  });
  await db.insert(schema.profiles).values({
    userId: 'mentor-account',
    email: 'mentor@personal.test',
    name: 'Mentor Person',
    mentoring: { enabled: true },
  });
  const response = await booking.POST(
    request({
      mentorEmail: 'mentor@personal.test',
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      duration: 30,
      topic: 'Creative business support',
      sessionType: 'pana_support',
    })
  );
  assert.equal(response.status, 201);
  assert.equal(
    (await db.query.mentorSessions.findFirst())?.mentorEmail,
    'mentor@personal.test'
  );
});

test('author verification comes from the personal identity, never another profile sharing its email', async () => {
  const result = await (await submit()).json();
  await db
    .update(schema.profiles)
    .set({ active: true, verification: { panaVerified: true } })
    .where(eq(schema.profiles.id, result.profileId));
  const response = await author.GET(request({}), {
    params: Promise.resolve({ id: userId }),
  });
  assert.equal((await response.json()).verified, false);
});
