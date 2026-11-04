import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import * as schema from '@/lib/schema';
import {
  LISTING_INVITATION_DAYS,
  listingInvitationIdentifier,
  listingInvitationPath,
  readListingInvitationFragment,
} from '@/lib/listing-invitation';
import { LISTING_INVITATION_COOKIE } from '@/lib/server/listing-invitation-request';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const userId = 'review-account';
const personalId = 'review-personal';
const listingId = 'review-business';
const secondId = 'another-managed-business';
const accountEmail = 'ana@personal.test.invalid';
const businessEmail = 'hello@business.test.invalid';
let session: {
  user: {
    id: string;
    email: string;
    name: string;
    isAdmin?: boolean;
    isContentModerator?: boolean;
  };
} | null;
let activeId: string | null = null;
let mailFails = false;
let zipUnavailable = false;
const emails: Array<{
  template: string;
  variables: Record<string, unknown>;
  recipient: string | undefined;
}> = [];
const uploaded: string[] = [];
const deleted: string[] = [];
const preparedActors: string[] = [];
const invalidated: string[] = [];
const zipLookups: string[] = [];
const zipAreas = {
  '33138': {
    postalCode: '33138',
    country: 'US',
    city: 'Miami',
    region: 'FL',
    lat: 25.8521,
    lng: -80.1821,
  },
  '00501': {
    postalCode: '00501',
    country: 'US',
    city: 'Holtsville',
    region: 'NY',
    lat: 40.8154,
    lng: -73.0451,
  },
} as const;

mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: { auth: async () => session },
});
mock.module(import.meta.resolve('next/headers'), {
  namedExports: {
    cookies: async () => ({
      get: () => (activeId ? { value: activeId } : undefined),
    }),
  },
});
mock.module(import.meta.resolve('next/cache'), {
  namedExports: {
    unstable_cache: (fn: unknown) => fn,
    revalidatePath: (path: string) => invalidated.push(path),
  },
});
mock.module(import.meta.resolve('../lib/email.ts'), {
  namedExports: {
    sendTemplateEmail: async (
      template: string,
      variables: Record<string, unknown>,
      recipient?: string
    ) => {
      if (mailFails) throw new Error('Test mail provider unavailable');
      emails.push({ template, variables, recipient });
    },
  },
});
mock.module(import.meta.resolve('../lib/federation/index.ts'), {
  namedExports: {
    createActorForProfile: async (id: string) => {
      preparedActors.push(id);
      return { success: true };
    },
  },
});
mock.module(import.meta.resolve('../lib/federation/wrappers/actor.ts'), {
  namedExports: {
    ensureActorForProfile: async () => {},
    syncActorFromProfile: async () => {},
  },
});
mock.module(import.meta.resolve('../lib/blob/api.ts'), {
  namedExports: {
    uploadFile: async (filename: string) => {
      uploaded.push(filename);
      return `https://files.test.invalid/${filename}`;
    },
    deleteFile: async (url: string) => deleted.push(url),
  },
});
mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
  const url = String(input);
  assert.match(url, /^https:\/\/api\.zippopotam\.us\/us\/\d{5}$/);
  zipLookups.push(url);
  if (zipUnavailable) return new Response('', { status: 503 });
  const zip = url.slice(-5);
  const area = zipAreas[zip as keyof typeof zipAreas];
  if (!area) return new Response('', { status: 404 });
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

const tables = [
  schema.users,
  schema.profiles,
  schema.profileOwners,
  schema.verification,
  schema.listingRefreshCycles,
  schema.listingRefreshDeliveries,
];
let claim: typeof import('../app/api/listings/[profileId]/claim/route');
let verify: typeof import('../app/api/listings/claim/verify/route');
let reader: typeof import('../app/api/getProfile/route');
let description: typeof import('../app/api/profile/saveDesc/route');
let categories: typeof import('../app/api/profile/saveCategories/route');
let contact: typeof import('../app/api/profile/saveContact/route');
let socials: typeof import('../app/api/profile/saveSocial/route');
let address: typeof import('../app/api/profile/saveAddress/route');
let photos: typeof import('../app/api/profile/upload/route');
let reviewApi: typeof import('../app/api/listings/review/route');
let tokens: typeof import('../lib/server/listing-claim');
let publicProfiles: typeof import('../lib/server/profile');
let invitationAdmin: typeof import('../app/api/admin/listings/[id]/invitation/route');
let invitationContextApi: typeof import('../app/api/listings/invitations/context/route');
let invitationApi: typeof import('../app/api/listings/invitations/route');
let invitations: typeof import('../lib/server/listing-invitations');
const originalHost = process.env.NEXT_PUBLIC_HOST_URL;

before(async () => {
  process.env.NEXT_PUBLIC_HOST_URL = 'https://directory.test.invalid';
  for (const table of tables) {
    const { name, columns } = getTableConfig(table);
    await pg.exec(
      `CREATE TABLE "${name}" (${columns
        .map(
          (column) =>
            `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}` +
            (column.primary ? ' PRIMARY KEY' : '') +
            (column.isUnique ? ' UNIQUE' : '')
        )
        .join(', ')})`
    );
  }
  await pg.exec(`
    CREATE UNIQUE INDEX profile_owners_profile_user_unique
      ON profile_owners (profile_id, user_id);
    ALTER TABLE profile_owners ADD FOREIGN KEY (profile_id) REFERENCES profiles (id);
    ALTER TABLE profile_owners ADD FOREIGN KEY (user_id) REFERENCES users (id);
  `);
  claim = await import('../app/api/listings/[profileId]/claim/route');
  verify = await import('../app/api/listings/claim/verify/route');
  reader = await import('../app/api/getProfile/route');
  description = await import('../app/api/profile/saveDesc/route');
  categories = await import('../app/api/profile/saveCategories/route');
  contact = await import('../app/api/profile/saveContact/route');
  socials = await import('../app/api/profile/saveSocial/route');
  address = await import('../app/api/profile/saveAddress/route');
  photos = await import('../app/api/profile/upload/route');
  reviewApi = await import('../app/api/listings/review/route');
  tokens = await import('../lib/server/listing-claim');
  publicProfiles = await import('../lib/server/profile');
  invitationAdmin =
    await import('../app/api/admin/listings/[id]/invitation/route');
  invitationContextApi =
    await import('../app/api/listings/invitations/context/route');
  invitationApi = await import('../app/api/listings/invitations/route');
  invitations = await import('../lib/server/listing-invitations');
});

beforeEach(async () => {
  for (const table of [...tables].reverse()) await db.delete(table);
  await db.insert(schema.users).values([
    {
      id: userId,
      email: accountEmail,
      name: 'Ana Person',
      accountType: 'personal',
    },
    {
      id: 'other-account',
      email: 'other@personal.test.invalid',
      name: 'Other Person',
      accountType: 'personal',
    },
  ]);
  await db.insert(schema.profiles).values([
    {
      id: personalId,
      userId,
      name: 'Ana Person',
      email: accountEmail,
      active: true,
      phoneNumber: 'personal-phone',
      pronouns: 'she/her',
      primaryImageCdn: 'https://files.test.invalid/personal.jpg',
      descriptions: { details: 'My personal introduction' },
    },
    {
      id: listingId,
      userId: null,
      name: 'Ana Bakery',
      email: businessEmail,
      active: true,
      onlineOnly: false,
      phoneNumber: 'private-business-phone',
      pronouns: 'they/them',
      pendingOwnerEmail: 'pending-private@personal.test.invalid',
      status: { source: 'business_intake' },
      descriptions: {
        fiveWords: 'Fresh bread and pastries',
        details: 'Our existing description',
        background: 'Our existing background',
        tags: 'bread,coffee',
        hearaboutus: 'A friend',
      },
      categories: { food: true, imported_category: true },
      socials: {
        instagram: 'anabakery',
        website: 'https://bakery.test.invalid',
        preserved_link: 'keep-this',
      },
      primaryImageCdn: 'https://files.test.invalid/old-logo.jpg',
      galleryImages: { gallery1CDN: 'https://files.test.invalid/gallery.jpg' },
    },
    {
      id: secondId,
      userId: null,
      name: 'Another Business',
      email: accountEmail,
      active: true,
      onlineOnly: false,
      status: { source: 'business_intake' },
      descriptions: { details: 'Another listing must not change' },
    },
  ]);
  await db.insert(schema.profileOwners).values({
    profileId: secondId,
    userId,
    role: 'owner',
  });
  session = { user: { id: userId, email: accountEmail, name: 'Ana Person' } };
  activeId = personalId;
  mailFails = false;
  zipUnavailable = false;
  emails.length =
    uploaded.length =
    deleted.length =
    preparedActors.length =
    invalidated.length =
    zipLookups.length =
      0;
});

after(async () => {
  if (originalHost === undefined) delete process.env.NEXT_PUBLIC_HOST_URL;
  else process.env.NEXT_PUBLIC_HOST_URL = originalHost;
  await pg.close();
});

function request(path: string, body?: Record<string, unknown>) {
  return new NextRequest(
    `https://directory.test.invalid${path}`,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : undefined
  );
}
const params = (id = listingId) => ({
  params: Promise.resolve({ profileId: id }),
});
const editPath = (route: string, id = listingId) =>
  `/api/profile/${route}?listingId=${encodeURIComponent(id)}`;
const getRow = (id: string) =>
  db.query.profiles.findFirst({ where: eq(schema.profiles.id, id) });
const redeem = (token: unknown) =>
  verify.POST(request('/api/listings/claim/verify', { token }));
async function ownListing() {
  await db
    .insert(schema.profileOwners)
    .values({ profileId: listingId, userId, role: 'owner' });
}

function confirmBusiness(overrides: Record<string, unknown> = {}) {
  return reviewApi.POST(
    invitationRequest('/api/listings/review', {
      profileId: listingId,
      cycleId: null,
      action: 'confirm',
      confirmed: true,
      expectedOwnerId: session?.user.id,
      expectedOwnerEmail: session?.user.email,
      ...overrides,
    })
  );
}

test('the listing-specific public entry is read-only and excludes all private contact and pending-owner fields', async () => {
  session = null;
  const before = await getRow(listingId);
  const response = await claim.GET(
    request(`/api/listings/${listingId}/claim`),
    params()
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const data = await response.json();
  assert.equal(data.profileId, listingId);
  assert.equal(data.publicPath, `/listings/${listingId}`);
  assert.equal(data.name, 'Ana Bakery');
  assert.equal(data.summary, 'Fresh bread and pastries');
  assert.equal(data.claimable, true);
  assert.equal(data.canManage, false);
  assert.equal(data.missingLocation, true);
  assert.doesNotMatch(
    JSON.stringify(data),
    /hello@|private-business-phone|pending-private@|pendingOwnerEmail/
  );
  assert.deepEqual(await getRow(listingId), before);
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
  assert.equal(emails.length, 0);
});

test('unknown/source IDs, unpublished listings and personal profiles are not public claim previews', async () => {
  for (const id of ['507f1f77bcf86cd799439011', 'missing', personalId]) {
    assert.equal(
      (await claim.GET(request('/api/test'), params(id))).status,
      404
    );
    assert.equal(
      (await claim.POST(request('/api/test', {}), params(id))).status,
      404
    );
  }
  await db
    .update(schema.profiles)
    .set({ active: false })
    .where(eq(schema.profiles.id, listingId));
  assert.equal((await claim.GET(request('/api/test'), params())).status, 404);
  assert.equal(
    (await claim.POST(request('/api/test', {}), params())).status,
    404
  );
  assert.equal(emails.length, 0);
});

test('signing in with a matching business email or opening the review cannot grant ownership', async () => {
  session = { user: { id: userId, email: businessEmail, name: 'Ana Person' } };
  const preview = await (
    await claim.GET(request('/api/test'), params())
  ).json();
  assert.equal(preview.canManage, false);
  assert.equal(preview.claimable, true);
  assert.equal(
    (await reader.GET(request(`/api/getProfile?listingId=${listingId}`)))
      .status,
    403
  );
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
  assert.equal(emails.length, 0);
  assert.equal((await getRow(personalId))?.name, 'Ana Person');
});

test('only an explicit authenticated request sends a mocked business-inbox link bound to that account and public ID', async () => {
  const personal = await getRow(personalId);
  session = null;
  assert.equal(
    (await claim.POST(request('/api/test', {}), params())).status,
    401
  );
  assert.equal(emails.length, 0);
  session = { user: { id: userId, email: accountEmail, name: 'Ana Person' } };
  const response = await claim.POST(request('/api/test', {}), params());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.success, true);
  assert.notEqual(data.sentTo, businessEmail);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].recipient, businessEmail);
  assert.equal(emails[0].template, 'listing.claim');
  const link = new URL(String(emails[0].variables.claimUrl));
  assert.equal(link.pathname, '/listings/claim');
  assert.equal(link.searchParams.get('id'), listingId);
  assert.equal(link.searchParams.has('email'), false);
  const [token] = await db.select().from(schema.verification);
  assert.equal(token.identifier, `listing-claim:${listingId}:${userId}`);
  assert.equal(link.searchParams.get('token'), token.value);
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
  assert.deepEqual(await getRow(personalId), personal);
});

test('verification grants only the requested business and returns its review without replacing personal identity', async () => {
  const personal = await getRow(personalId);
  const other = await getRow(secondId);
  const token = await tokens.createClaimToken(listingId, userId);
  const response = await redeem(token);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    profileId: listingId,
    businessName: 'Ana Bakery',
    reviewPath: `/listings/review?id=${listingId}`,
  });
  const owners = await db
    .select()
    .from(schema.profileOwners)
    .where(eq(schema.profileOwners.profileId, listingId));
  assert.deepEqual(
    owners.map((owner) => [owner.userId, owner.role]),
    [[userId, 'owner']]
  );
  assert.equal((await getRow(listingId))?.userId, null);
  assert.equal((await getRow(listingId))?.pendingOwnerEmail, null);
  assert.deepEqual(await getRow(personalId), personal);
  assert.deepEqual(await getRow(secondId), other);
  assert.deepEqual(preparedActors, [listingId]);
  assert.equal(activeId, personalId);
});

test('anonymous and wrong-account token visits do not spend the requester proof', async () => {
  const token = await tokens.createClaimToken(listingId, userId);
  session = null;
  assert.equal((await redeem(token)).status, 401);
  session = {
    user: { id: 'other-account', email: businessEmail, name: 'Other Person' },
  };
  const wrong = await redeem(token);
  assert.equal(wrong.status, 403);
  assert.equal((await wrong.json()).code, 'wrong_account');
  assert.equal((await db.select().from(schema.verification)).length, 1);
  session = { user: { id: userId, email: accountEmail, name: 'Ana Person' } };
  assert.equal((await redeem(token)).status, 200);
});

test('missing, malformed, expired, reused and unrelated authentication tokens never grant ownership', async () => {
  for (const token of ['', null, 42, { token: 'bad' }, 'unknown']) {
    assert.equal((await redeem(token)).status, 400);
  }
  const token = await tokens.createClaimToken(listingId, userId);
  await db
    .update(schema.verification)
    .set({ expiresAt: new Date(0) })
    .where(eq(schema.verification.value, token));
  assert.equal((await redeem(token)).status, 400);
  await db.insert(schema.verification).values({
    identifier: 'magic-link:private-account',
    value: 'auth-only-token',
    expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal((await redeem('auth-only-token')).status, 400);
  assert.equal((await db.select().from(schema.verification)).length, 1);
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
  const valid = await tokens.createClaimToken(listingId, userId);
  assert.equal((await redeem(valid)).status, 200);
  assert.equal((await redeem(valid)).status, 400);
});

test('concurrent redemption is single-use and a renewed link invalidates only the previous claim link', async () => {
  const old = await tokens.createClaimToken(listingId, userId);
  const current = await tokens.createClaimToken(listingId, userId);
  assert.equal((await redeem(old)).status, 400);
  const responses = await Promise.all([redeem(current), redeem(current)]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 400]
  );
  assert.equal(
    (await db.select().from(schema.profileOwners)).filter(
      (owner) => owner.profileId === listingId
    ).length,
    1
  );
});

test('someone else winning the first claim is a conflict, not a second owner', async () => {
  const token = await tokens.createClaimToken(listingId, userId);
  await db.insert(schema.profileOwners).values({
    profileId: listingId,
    userId: 'other-account',
    role: 'owner',
  });
  const response = await redeem(token);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'already_claimed');
  assert.equal((await db.select().from(schema.profileOwners)).length, 2);
  assert.equal(emails.length, 0);
});

test('existing managers get a direct review path without a claim email or another grant', async () => {
  await ownListing();
  const preview = await (
    await claim.GET(request('/api/test'), params())
  ).json();
  assert.equal(preview.canManage, true);
  assert.equal(preview.claimable, false);
  const response = await claim.POST(request('/api/test', {}), params());
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).reviewPath,
    `/listings/review?id=${listingId}`
  );
  assert.equal(emails.length, 0);
  assert.equal((await db.select().from(schema.verification)).length, 0);
  assert.equal((await db.select().from(schema.profileOwners)).length, 2);
});

test('a mail outage reports failure without granting a listing', async () => {
  mailFails = true;
  assert.equal(
    (await claim.POST(request('/api/test', {}), params())).status,
    500
  );
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
  assert.equal(emails.length, 0);
});

test('the permanent entry keeps an unpublished business manageable only for its authorized account', async () => {
  await ownListing();
  await db
    .update(schema.profiles)
    .set({ active: false })
    .where(eq(schema.profiles.id, listingId));
  const preview = await (
    await claim.GET(request('/api/test'), params())
  ).json();
  assert.equal(preview.canManage, true);
  assert.equal(preview.published, false);
  assert.doesNotMatch(
    JSON.stringify(preview),
    /hello@|private-business-phone|pending-private@/
  );
  const response = await claim.POST(request('/api/test', {}), params());
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).reviewPath,
    `/listings/review?id=${listingId}`
  );
  assert.equal(emails.length, 0);
  session = null;
  assert.equal((await claim.GET(request('/api/test'), params())).status, 404);
});

test('every scoped editor rejects foreign, missing, empty and personal IDs without active-profile fallback', async () => {
  activeId = secondId;
  const before = await db.select().from(schema.profiles);
  const writers = [
    {
      route: description.POST,
      name: 'saveDesc',
      body: { name: 'Wrong target' },
    },
    {
      route: categories.POST,
      name: 'saveCategories',
      body: { categories: { Food: true } },
    },
    {
      route: contact.POST,
      name: 'saveContact',
      body: { email: 'changed@test.invalid' },
    },
    {
      route: socials.POST,
      name: 'saveSocial',
      body: { socials: { website: 'https://changed.test.invalid' } },
    },
    {
      route: address.POST,
      name: 'saveAddress',
      body: { primary_address: { zipcode: '33138' } },
    },
    { route: photos.POST, name: 'upload', body: {} },
  ];
  for (const id of [listingId, 'missing', '', personalId]) {
    assert.equal(
      (await reader.GET(request(`/api/getProfile?listingId=${id}`))).status,
      403
    );
    for (const writer of writers) {
      assert.equal(
        (await writer.route(request(editPath(writer.name, id), writer.body)))
          .status,
        403,
        `${writer.name}: ${id}`
      );
    }
  }
  assert.deepEqual(await db.select().from(schema.profiles), before);
  assert.equal(uploaded.length, 0);
  assert.equal(deleted.length, 0);
});

test('entry, verification and all real editors preserve untouched values and the other managed business', async () => {
  const personal = await getRow(personalId);
  const second = await getRow(secondId);
  const account = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  assert.equal(
    (await claim.POST(request('/api/test', {}), params())).status,
    200
  );
  const token = new URL(String(emails[0].variables.claimUrl)).searchParams.get(
    'token'
  );
  assert.equal((await redeem(token)).status, 200);
  activeId = secondId;
  const read = await reader.GET(
    request(`/api/getProfile?listingId=${listingId}`)
  );
  assert.match(read.headers.get('cache-control') ?? '', /no-store/);
  const { data: prefilled } = await read.json();
  assert.equal(prefilled.id, listingId);
  assert.equal(prefilled.email, businessEmail);
  assert.equal(prefilled.descriptions.background, 'Our existing background');
  assert.equal(
    prefilled.images.gallery1CDN,
    'https://files.test.invalid/gallery.jpg'
  );
  assert.equal(
    (
      await description.POST(
        request(editPath('saveDesc'), {
          details: 'Our refreshed business description',
        })
      )
    ).status,
    200
  );
  assert.equal(
    (
      await categories.POST(
        request(editPath('saveCategories'), { categories: { services: true } })
      )
    ).status,
    200
  );
  assert.equal(
    (
      await contact.POST(
        request(editPath('saveContact'), {
          email: 'contact@new-business.test.invalid',
        })
      )
    ).status,
    200
  );
  assert.equal(
    (
      await socials.POST(
        request(editPath('saveSocial'), {
          socials: { website: 'https://new-bakery.test.invalid' },
        })
      )
    ).status,
    200
  );
  assert.equal(
    (
      await address.POST(
        request(editPath('saveAddress'), {
          primary_address: { zipcode: '33138' },
          online_only: false,
        })
      )
    ).status,
    200
  );
  const form = new FormData();
  form.set(
    'primary',
    new File(['isolated photo fixture'], 'logo.png', { type: 'image/png' })
  );
  const uploadResponse = await photos.POST(
    new NextRequest(`https://directory.test.invalid${editPath('upload')}`, {
      method: 'POST',
      body: form,
    })
  );
  assert.equal(uploadResponse.status, 200);
  const updated = await getRow(listingId);
  assert.deepEqual(updated?.descriptions, {
    details: 'Our refreshed business description',
    background: 'Our existing background',
    fiveWords: 'Fresh bread and pastries',
    tags: 'bread,coffee',
    hearaboutus: 'A friend',
  });
  assert.deepEqual(updated?.categories, {
    food: true,
    imported_category: true,
    services: true,
  });
  assert.equal(updated?.phoneNumber, 'private-business-phone');
  assert.equal(updated?.pronouns, 'they/them');
  assert.equal(updated?.email, 'contact@new-business.test.invalid');
  assert.deepEqual(updated?.socials, {
    instagram: 'anabakery',
    website: 'https://new-bakery.test.invalid',
    preserved_link: 'keep-this',
  });
  assert.equal(updated?.addressPostalCode, '33138');
  assert.equal(updated?.addressLat, null);
  assert.equal(updated?.onlineOnly, false);
  assert.deepEqual(updated?.galleryImages, {
    gallery1CDN: 'https://files.test.invalid/gallery.jpg',
  });
  assert.match(
    updated?.primaryImageCdn ?? '',
    /\/profile\/review-business\/primary/
  );
  assert.deepEqual(await getRow(personalId), personal);
  assert.deepEqual(await getRow(secondId), second);
  assert.deepEqual(
    await db.query.users.findFirst({ where: eq(schema.users.id, userId) }),
    account
  );
  const publicListing = await publicProfiles.getPublicListing(listingId);
  assert.equal(publicListing?.details, 'Our refreshed business description');
  assert.equal(publicListing?.primary_address.zipcode, '33138');
  const preview = await (
    await claim.GET(request('/api/test'), params())
  ).json();
  assert.doesNotMatch(
    JSON.stringify(preview),
    /contact@|private-business-phone|pendingOwnerEmail/
  );
  assert.ok(invalidated.includes(`/listings/${listingId}`));
  assert.equal(updated?.lastReviewedAt, null);
  const stateResponse = await reviewApi.GET(
    request(`/api/listings/review?profileId=${listingId}`)
  );
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(state.profileId, listingId);
  assert.equal(state.lastReviewedAt, null);
  assert.equal(
    (
      await reviewApi.GET(
        request(
          `/api/listings/review?profileId=${listingId}&complete=1&confirmed=1`
        )
      )
    ).status,
    200
  );
  assert.equal((await getRow(listingId))?.lastReviewedAt, null);
  const confirmation = await reviewApi.POST(
    invitationRequest('/api/listings/review', {
      profileId: listingId,
      cycleId: state.cycle?.id ?? null,
      action: 'confirm',
      confirmed: true,
      expectedOwnerId: userId,
      expectedOwnerEmail: accountEmail,
    })
  );
  assert.equal(confirmation.status, 200);
  assert.equal((await confirmation.json()).profileId, listingId);
  assert.ok((await getRow(listingId))?.lastReviewedAt);
  assert.deepEqual(await getRow(personalId), personal);
  assert.deepEqual(await getRow(secondId), second);
  assert.deepEqual(
    await db.query.users.findFirst({ where: eq(schema.users.id, userId) }),
    account
  );
  assert.equal(activeId, secondId);
});

test('an explicitly scoped direct-owned business contact stays separate from the owner login', async () => {
  await db.insert(schema.users).values({
    id: 'direct-owner',
    name: 'Direct Owner',
    email: 'direct@personal.test.invalid',
    accountType: 'directory',
  });
  await db
    .update(schema.profiles)
    .set({ userId: 'direct-owner' })
    .where(eq(schema.profiles.id, listingId));
  session = {
    user: {
      id: 'direct-owner',
      name: 'Direct Owner',
      email: 'direct@personal.test.invalid',
    },
  };
  const personal = await getRow(personalId);
  const account = await db.query.users.findFirst({
    where: eq(schema.users.id, 'direct-owner'),
  });
  const response = await contact.POST(
    request(editPath('saveContact'), { email: 'new@business.test.invalid' })
  );
  assert.equal(response.status, 200);
  assert.equal((await getRow(listingId))?.email, 'new@business.test.invalid');
  assert.deepEqual(
    await db.query.users.findFirst({
      where: eq(schema.users.id, 'direct-owner'),
    }),
    account
  );
  assert.deepEqual(await getRow(personalId), personal);
  assert.equal(activeId, personalId);
});

test('online review retains approximate ZIP semantics and clears private street coordinates', async () => {
  await ownListing();
  await db
    .update(schema.profiles)
    .set({
      addressLine1: 'Old private home address',
      addressLine2: 'Apartment 7',
      addressLat: '37.8',
      addressLng: '-122.4',
      addressGooglePlaceId: 'private-place',
      geo: { type: 'Point', coordinates: [-122.4, 37.8] },
    })
    .where(eq(schema.profiles.id, listingId));
  const response = await address.POST(
    request(editPath('saveAddress'), {
      online_only: true,
      primary_address: { zipcode: '33138', lat: '37.8', lng: '-122.4' },
    })
  );
  assert.equal(response.status, 200);
  const row = await getRow(listingId);
  assert.equal(row?.onlineOnly, true);
  assert.equal(row?.addressPostalCode, '33138');
  assert.equal(row?.addressLine1, null);
  assert.equal(row?.addressLine2, null);
  assert.equal(row?.addressLat, null);
  assert.equal(row?.addressLng, null);
  assert.equal(row?.addressGooglePlaceId, null);
  const publicListing = await publicProfiles.getPublicListing(listingId);
  assert.equal(publicListing?.geo, null);
  assert.equal(publicListing?.primary_address.street1, undefined);
  const preview = await (
    await claim.GET(request('/api/test'), params())
  ).json();
  assert.match(preview.locationLabel, /ZIP 33138.*approximate/);
  assert.doesNotMatch(
    JSON.stringify(preview),
    /private home|37\.8|-122\.4|private-place/
  );
  zipUnavailable = true;
  const before = await getRow(listingId);
  assert.equal(
    (
      await address.POST(
        request(editPath('saveAddress'), {
          primary_address: { zipcode: '33301' },
        })
      )
    ).status,
    503
  );
  assert.deepEqual(await getRow(listingId), before);
  const lookups = zipLookups.length;
  assert.equal(
    (
      await address.POST(
        request(editPath('saveAddress'), {
          online_only: false,
          primary_address: { zipcode: '33138' },
        })
      )
    ).status,
    200
  );
  const visiting = await getRow(listingId);
  assert.equal(visiting?.onlineOnly, false);
  assert.equal(visiting?.addressLine1, null);
  assert.equal(visiting?.addressLat, null);
  assert.equal(visiting?.addressLng, null);
  assert.deepEqual(visiting?.geo, { zipArea: zipAreas['33138'] });
  assert.equal(zipLookups.length, lookups);
  assert.equal((await publicProfiles.getPublicListing(listingId))?.geo, null);
});

test('business drafts remain manageable without a ZIP, but mobile review requires a ZIP while removing a previous public point', async () => {
  await ownListing();
  assert.equal(
    (
      await description.POST(
        request(editPath('saveDesc'), {
          details: 'A mobile service with no confirmed ZIP',
        })
      )
    ).status,
    200
  );
  let row = await getRow(listingId);
  assert.equal(row?.addressPostalCode, null);
  assert.equal(row?.onlineOnly, false);
  await db
    .update(schema.profiles)
    .set({
      addressLine1: 'A formerly public address',
      addressLat: '25.8',
      addressLng: '-80.2',
      addressGooglePlaceId: 'old-place',
      geo: { type: 'Point', coordinates: [-80.2, 25.8] },
    })
    .where(eq(schema.profiles.id, listingId));
  const before = await getRow(listingId);
  assert.equal(
    (
      await address.POST(
        request(editPath('saveAddress'), {
          online_only: false,
          primary_address: { street1: '', zipcode: '', lat: '', lng: '' },
        })
      )
    ).status,
    400
  );
  assert.deepEqual(await getRow(listingId), before);
  assert.equal(
    (
      await address.POST(
        request(editPath('saveAddress'), {
          online_only: false,
          primary_address: {
            name: '',
            street1: '',
            street2: '',
            street3: '',
            city: '',
            state: '',
            zipcode: '33138',
            country: 'US',
            hours: '',
            googlePlaceId: '',
            lat: '',
            lng: '',
          },
        })
      )
    ).status,
    200
  );
  row = await getRow(listingId);
  assert.equal(row?.onlineOnly, false);
  assert.equal(row?.addressLine1, null);
  assert.equal(row?.addressPostalCode, '33138');
  assert.equal(row?.addressLat, null);
  assert.equal(row?.addressLng, null);
  assert.equal(row?.addressGooglePlaceId, null);
  assert.deepEqual(row?.geo, { zipArea: zipAreas['33138'] });
  assert.equal((await confirmBusiness()).status, 200);
  assert.equal(zipLookups.length, 1);
});

test('final confirmation rejects missing, malformed, unknown and foreign ZIPs for public, online and mobile businesses, including direct owners and admin managers', async () => {
  await ownListing();
  await db.insert(schema.users).values({
    id: 'direct-review-owner',
    name: 'Direct Owner',
    email: 'direct@personal.test.invalid',
    accountType: 'directory',
  });
  const personal = await getRow(personalId);
  const other = await getRow(secondId);
  const accounts = await db.select().from(schema.users);
  for (const access of ['owner-link', 'direct-owner', 'admin-manager']) {
    session = {
      user: {
        id: access === 'direct-owner' ? 'direct-review-owner' : userId,
        email:
          access === 'direct-owner'
            ? 'direct@personal.test.invalid'
            : accountEmail,
        name: 'Ana Person',
        isAdmin: access === 'admin-manager',
      },
    };
    for (const mode of ['public', 'online', 'mobile']) {
      for (const zipcode of [
        null,
        '',
        '3313',
        '331380',
        'not-a-zip',
        '00000',
      ]) {
        await db
          .update(schema.profiles)
          .set({
            userId: access === 'direct-owner' ? 'direct-review-owner' : null,
            onlineOnly: mode === 'online',
            addressPostalCode: zipcode,
            addressCountry: 'US',
            addressLine1: mode === 'public' ? 'Public visiting location' : null,
            addressLat: mode === 'public' ? '25.8' : null,
            addressLng: mode === 'public' ? '-80.2' : null,
            geo: { zipArea: zipAreas['33138'] },
          })
          .where(eq(schema.profiles.id, listingId));
        const before = await getRow(listingId);
        const response = await confirmBusiness({
          zipcode: '33138',
          complete: true,
          confirmedLocation: true,
        });
        assert.equal(response.status, 400, `${access}/${mode}/${zipcode}`);
        const error = await response.json();
        assert.equal(error.success, false);
        assert.equal(error.field, 'zipcode');
        assert.equal(error.step, 'address');
        assert.match(error.error, /ZIP/);
        assert.deepEqual(await getRow(listingId), before);
      }
    }
  }
  await db
    .update(schema.profiles)
    .set({
      addressPostalCode: '33138',
      addressCountry: 'CA',
    })
    .where(eq(schema.profiles.id, listingId));
  assert.equal((await confirmBusiness()).status, 400);
  assert.deepEqual(await getRow(personalId), personal);
  assert.deepEqual(await getRow(secondId), other);
  assert.deepEqual(await db.select().from(schema.users), accounts);
  assert.equal((await db.select().from(schema.listingRefreshCycles)).length, 0);
  assert.equal(
    (await db.select().from(schema.listingRefreshDeliveries)).length,
    0
  );
  assert.equal(invalidated.length, 0);
  assert.equal(emails.length, 0);
  assert.equal(activeId, personalId);
});

test('a ZIP-only review save normalizes ZIP+4 and leading zeros without clearing public visiting details, counties or legacy points', async () => {
  await ownListing();
  await db
    .update(schema.profiles)
    .set({
      addressName: 'Visiting entrance',
      addressLine1: 'A confirmed public visiting address',
      addressLine2: 'Suite 7',
      addressLine3: 'Courtyard',
      addressLocality: 'Keep this city',
      addressRegion: 'NY',
      addressCountry: 'US',
      addressHours: 'By appointment',
      addressGooglePlaceId: 'public-place',
      addressLat: '40.8',
      addressLng: '-73.0',
      counties: { miami_dade: true, imported: true },
      geo: { type: 'Point', coordinates: [-73, 40.8], imported: 'preserve' },
    })
    .where(eq(schema.profiles.id, listingId));
  const before = await getRow(listingId);
  const response = await address.POST(
    request(editPath('saveAddress'), {
      primary_address: { zipcode: ' 00501-1234 ' },
    })
  );
  assert.equal(response.status, 200);
  const afterSave = await getRow(listingId);
  assert.deepEqual(afterSave, {
    ...before,
    updatedAt: afterSave?.updatedAt,
    addressPostalCode: '00501',
    geo: {
      type: 'Point',
      coordinates: [-73, 40.8],
      imported: 'preserve',
      zipArea: zipAreas['00501'],
    },
  });
  assert.deepEqual(zipLookups, ['https://api.zippopotam.us/us/00501']);
  const state = await (
    await reviewApi.GET(request(`/api/listings/review?profileId=${listingId}`))
  ).json();
  assert.equal(state.zipVerified, true);
  zipUnavailable = true;
  assert.equal((await confirmBusiness()).status, 200);
  assert.equal((await getRow(listingId))?.addressPostalCode, '00501');
  assert.equal(zipLookups.length, 1);
  assert.deepEqual((await getRow(listingId))?.geo, afterSave?.geo);
});

test('review address saves reject invalid or unknown ZIPs without saving any accompanying edits', async () => {
  await ownListing();
  for (const online_only of [false, true]) {
    for (const zipcode of ['', 'bad', '1234', '331380', '00000']) {
      const before = await getRow(listingId);
      const response = await address.POST(
        request(editPath('saveAddress'), {
          online_only,
          primary_address: { zipcode, street1: 'Must not be saved' },
          counties: { broward: true },
        })
      );
      assert.equal(response.status, 400);
      const error = await response.json();
      assert.equal(error.field, 'zipcode');
      assert.equal(error.step, 'address');
      assert.deepEqual(await getRow(listingId), before);
    }
  }
  assert.equal(invalidated.length, 0);
});

test('stale saved ZIPs, cached metadata and URL flags never authorize completion or a success state', async () => {
  await ownListing();
  await db
    .update(schema.profiles)
    .set({
      addressPostalCode: '33138',
      geo: { zipArea: zipAreas['33138'] },
    })
    .where(eq(schema.profiles.id, listingId));
  assert.equal((await confirmBusiness()).status, 200);
  const reviewedAt = (await getRow(listingId))?.lastReviewedAt;
  await db
    .update(schema.profiles)
    .set({
      addressPostalCode: null,
    })
    .where(eq(schema.profiles.id, listingId));
  const before = await getRow(listingId);
  const state = await (
    await reviewApi.GET(
      request(
        `/api/listings/review?profileId=${listingId}&complete=1&confirmed=1&zipcode=33138`
      )
    )
  ).json();
  assert.ok(state.lastReviewedAt);
  assert.equal(state.zipVerified, false);
  assert.equal((await confirmBusiness({ zipcode: '33138' })).status, 400);
  assert.deepEqual(await getRow(listingId), before);
  assert.deepEqual((await getRow(listingId))?.lastReviewedAt, reviewedAt);
  assert.equal(zipLookups.length, 0);
});

test('temporary ZIP lookup failures leave all review data untouched and can be retried, then verified ZIPs need no more lookups', async () => {
  await ownListing();
  await db
    .update(schema.profiles)
    .set({
      addressPostalCode: '33138-1234',
      addressLine1: 'Public visiting address',
      geo: { type: 'Point', coordinates: [-80.2, 25.8] },
    })
    .where(eq(schema.profiles.id, listingId));
  const before = await getRow(listingId);
  zipUnavailable = true;
  for (const response of [
    await address.POST(
      request(editPath('saveAddress'), {
        primary_address: { zipcode: '33138', street1: 'Must not be saved' },
      })
    ),
    await confirmBusiness(),
  ]) {
    assert.equal(response.status, 503);
    const data = await response.json();
    assert.match(data.error, /temporarily unavailable.*try again/i);
    assert.equal(data.field, 'zipcode');
    assert.equal(data.step, 'address');
  }
  assert.deepEqual(await getRow(listingId), before);
  assert.equal(invalidated.length, 0);
  zipUnavailable = false;
  assert.equal((await confirmBusiness()).status, 200);
  assert.equal((await getRow(listingId))?.addressPostalCode, '33138');
  assert.equal((await getRow(listingId))?.addressLine1, before?.addressLine1);
  assert.equal(zipLookups.length, 3);
  zipUnavailable = true;
  assert.equal((await confirmBusiness()).status, 200);
  assert.equal(zipLookups.length, 3);
  assert.equal(emails.length, 0);
});

test('personal address editors and unscoped business drafts may still omit a ZIP, and published legacy listings stay public', async () => {
  await ownListing();
  const response = await address.POST(
    request('/api/profile/saveAddress', {
      primary_address: { city: 'My personal city', zipcode: '' },
    })
  );
  assert.equal(response.status, 200);
  assert.equal((await getRow(personalId))?.addressPostalCode, null);
  activeId = listingId;
  assert.equal(
    (
      await address.POST(
        request('/api/profile/saveAddress', {
          primary_address: { city: 'Draft business city', zipcode: '' },
        })
      )
    ).status,
    200
  );
  assert.equal((await getRow(listingId))?.addressPostalCode, null);
  assert.equal((await getRow(listingId))?.active, true);
  assert.equal((await getRow(listingId))?.lastReviewedAt, null);
  assert.equal(
    (await publicProfiles.getPublicListing(listingId))?.id,
    listingId
  );
  const before = await getRow(listingId);
  assert.equal((await confirmBusiness()).status, 400);
  assert.deepEqual(await getRow(listingId), before);
  assert.equal(emails.length, 0);
  assert.equal(zipLookups.length, 0);
});

function invitationRequest(
  path: string,
  body?: Record<string, unknown>,
  context?: string,
  method = body ? 'POST' : 'GET',
  origin = 'https://directory.test.invalid'
) {
  return new NextRequest(`https://directory.test.invalid${path}`, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(context
        ? {
            Cookie: `${LISTING_INVITATION_COOKIE}=${encodeURIComponent(context)}`,
          }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function issueInvitation(id = listingId) {
  const previous = session;
  session = {
    user: { id: userId, email: accountEmail, name: 'Operator', isAdmin: true },
  };
  try {
    const response = await invitationAdmin.POST(
      invitationRequest(`/api/admin/listings/${id}/invitation`, {}),
      { params: Promise.resolve({ id }) }
    );
    assert.equal(response.status, 201);
    const data = await response.json();
    const url = new URL(data.invitationUrl);
    const token = readListingInvitationFragment(url.hash);
    assert.ok(token);
    assert.equal(url.searchParams.get('id'), id);
    return { response, data, token };
  } finally {
    session = previous;
  }
}

async function keepInvitation(token: string, id = listingId) {
  const response = await invitationContextApi.POST(
    invitationRequest('/api/listings/invitations/context', {
      profileId: id,
      token,
    })
  );
  assert.equal(response.status, 200);
  const context = response.cookies.get(LISTING_INVITATION_COOKIE)?.value;
  assert.ok(context);
  return { response, context };
}

function acceptInvitation(
  context: string,
  overrides: Record<string, unknown> = {}
) {
  return invitationApi.POST(
    invitationRequest(
      '/api/listings/invitations',
      {
        profileId: listingId,
        action: 'accept',
        expectedOwnerId: session?.user.id,
        expectedOwnerEmail: session?.user.email,
        ...overrides,
      },
      context
    )
  );
}

test('invitation issuance and revocation require an admin and never infer proof from a public listing, inbox or owner role', async () => {
  const before = await db.select().from(schema.profiles);
  for (const user of [
    null,
    { id: userId, email: businessEmail, name: 'Owner inbox' },
    {
      id: userId,
      email: accountEmail,
      name: 'Moderator',
      isContentModerator: true,
    },
  ]) {
    session = user ? { user } : null;
    assert.equal(
      (
        await invitationAdmin.POST(
          invitationRequest('/api/admin/listings/test/invitation', {}),
          { params: Promise.resolve({ id: listingId }) }
        )
      ).status,
      403
    );
    assert.equal(
      (
        await invitationAdmin.DELETE(
          invitationRequest(
            '/api/admin/listings/test/invitation',
            undefined,
            undefined,
            'DELETE'
          ),
          { params: Promise.resolve({ id: listingId }) }
        )
      ).status,
      403
    );
  }
  assert.equal((await db.select().from(schema.verification)).length, 0);
  assert.deepEqual(await db.select().from(schema.profiles), before);
  assert.equal(emails.length, 0);
});

test('an operator issues one hashed seven-day proof for the exact listing contact, never a personal login', async () => {
  const beforeProfiles = await db.select().from(schema.profiles);
  const beforeUsers = await db.select().from(schema.users);
  const { response, data, token } = await issueInvitation();
  assert.equal(data.recipient, businessEmail);
  const url = new URL(data.invitationUrl);
  assert.equal(url.pathname, '/listings/invite');
  assert.equal(
    `${url.pathname}${url.search}`,
    listingInvitationPath(listingId)
  );
  assert.equal(url.searchParams.size, 1);
  assert.equal(url.searchParams.has('token'), false);
  assert.equal(url.searchParams.has('email'), false);
  assert.equal(url.origin, 'https://directory.test.invalid');
  const expiry = Date.parse(data.expiresAt) - Date.now();
  assert.ok(expiry > LISTING_INVITATION_DAYS * 24 * 60 * 60 * 1000 - 10_000);
  assert.ok(expiry <= LISTING_INVITATION_DAYS * 24 * 60 * 60 * 1000);
  const [stored] = await db.select().from(schema.verification);
  assert.equal(stored.identifier, listingInvitationIdentifier(listingId));
  assert.doesNotMatch(
    stored.value,
    new RegExp(`${token}|${businessEmail}|${accountEmail}`)
  );
  const record = JSON.parse(stored.value);
  assert.match(record.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(record.tokenHash, token);
  assert.match(record.contactHash, /^[a-f0-9]{64}$/);
  assert.equal(record.issuedBy, userId);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.deepEqual(await db.select().from(schema.profiles), beforeProfiles);
  assert.deepEqual(await db.select().from(schema.users), beforeUsers);
  assert.equal(emails.length, 0);
});

test('issuance derives the business recipient from storage and rejects inactive, personal, missing and already-owned targets', async () => {
  session = {
    user: { id: userId, email: accountEmail, name: 'Admin', isAdmin: true },
  };
  for (const [id, expected] of [
    [personalId, 404],
    ['legacy-source-id', 404],
    [secondId, 409],
  ] as const) {
    assert.equal(
      (
        await invitationAdmin.POST(
          invitationRequest('/api/admin/listings/test/invitation', {
            email: 'attacker@test.invalid',
          }),
          { params: Promise.resolve({ id }) }
        )
      ).status,
      expected
    );
  }
  const valid = await invitationAdmin.POST(
    invitationRequest('/api/admin/listings/test/invitation', {
      email: 'attacker@test.invalid',
      recipient: 'attacker@test.invalid',
    }),
    { params: Promise.resolve({ id: listingId }) }
  );
  assert.equal(valid.status, 201);
  assert.equal((await valid.json()).recipient, businessEmail);
  await db
    .update(schema.profiles)
    .set({ active: false })
    .where(eq(schema.profiles.id, listingId));
  assert.equal(
    (
      await invitationAdmin.POST(
        invitationRequest('/api/admin/listings/test/invitation', {}),
        { params: Promise.resolve({ id: listingId }) }
      )
    ).status,
    404
  );
  assert.equal(emails.length, 0);
});

test('a bad public origin cannot replace or revoke a valid invitation or grant ownership', async () => {
  const { token } = await issueInvitation();
  const { context } = await keepInvitation(token);
  session = {
    user: { id: userId, email: accountEmail, name: 'Admin', isAdmin: true },
  };
  const before = await db.select().from(schema.verification);
  for (const origin of ['https://foreign.test.invalid', 'null', '']) {
    assert.equal(
      (
        await invitationAdmin.POST(
          invitationRequest(
            '/api/admin/listings/test/invitation',
            {},
            undefined,
            'POST',
            origin
          ),
          { params: Promise.resolve({ id: listingId }) }
        )
      ).status,
      403
    );
    assert.equal(
      (
        await invitationAdmin.DELETE(
          invitationRequest(
            '/api/admin/listings/test/invitation',
            undefined,
            undefined,
            'DELETE',
            origin
          ),
          { params: Promise.resolve({ id: listingId }) }
        )
      ).status,
      403
    );
    assert.equal(
      (
        await invitationContextApi.POST(
          invitationRequest(
            '/api/listings/invitations/context',
            { profileId: listingId, token },
            undefined,
            'POST',
            origin
          )
        )
      ).status,
      403
    );
    assert.equal(
      (
        await invitationApi.POST(
          invitationRequest(
            '/api/listings/invitations',
            {
              profileId: listingId,
              action: 'accept',
              expectedOwnerId: userId,
              expectedOwnerEmail: accountEmail,
            },
            context,
            'POST',
            origin
          )
        )
      ).status,
      403
    );
  }
  assert.deepEqual(await db.select().from(schema.verification), before);
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
});

test('inspection and scanner context are read-only, with no accounts, claims, email, actor or private-contact exposure', async () => {
  const { token } = await issueInvitation();
  session = null;
  const beforeProfiles = await db.select().from(schema.profiles);
  const beforeUsers = await db.select().from(schema.users);
  const beforeTokens = await db.select().from(schema.verification);
  const { response, context } = await keepInvitation(token);
  const cookie = response.headers.get('set-cookie') ?? '';
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /Path=\/api\/listings\/invitations/);
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  for (let i = 0; i < 3; i += 1) {
    const lookup = await invitationApi.GET(
      invitationRequest(
        `/api/listings/invitations?profileId=${listingId}`,
        undefined,
        context
      )
    );
    assert.equal(lookup.status, 200);
    assert.equal(lookup.headers.has('set-cookie'), false);
    const data = await lookup.json();
    assert.deepEqual(Object.keys(data).sort(), [
      'expiresAt',
      'profileId',
      'state',
    ]);
    assert.equal(data.state, 'available');
    assert.doesNotMatch(
      JSON.stringify(data),
      new RegExp(
        `${token}|hello@|private-business-phone|pending-private@|pendingOwnerEmail`
      )
    );
  }
  assert.deepEqual(await db.select().from(schema.profiles), beforeProfiles);
  assert.deepEqual(await db.select().from(schema.users), beforeUsers);
  assert.deepEqual(await db.select().from(schema.verification), beforeTokens);
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
  assert.equal(emails.length, 0);
  assert.equal(preparedActors.length, 0);
});

test('production invitation context is Secure and cannot carry business proof to the login or active-profile cookie', async () => {
  const { token } = await issueInvitation();
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: 'production' });
  try {
    const { response } = await keepInvitation(token);
    const cookie = response.headers.get('set-cookie') ?? '';
    assert.match(cookie, /Secure/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Path=\/api\/listings\/invitations/);
    assert.doesNotMatch(cookie, /session_token|pana_active_profile|Domain=/);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: previous });
  }
});

test('a valid invitation supports a different chosen login, explicit acceptance and the real exact-business review/save path', async () => {
  const { token } = await issueInvitation();
  const personal = await getRow(personalId);
  const otherBusiness = await getRow(secondId);
  const users = await db.select().from(schema.users);
  session = null;
  const { context } = await keepInvitation(token);
  assert.equal((await acceptInvitation(context)).status, 401);
  assert.equal((await db.select().from(schema.verification)).length, 1);
  session = { user: { id: userId, email: accountEmail, name: 'Ana Person' } };
  assert.notEqual(session.user.email, businessEmail);
  activeId = secondId;
  const accepted = await acceptInvitation(context, {
    token: 'not-a-login-token',
    next: 'https://foreign.test.invalid',
    reviewPath: '/account',
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), {
    success: true,
    profileId: listingId,
    reviewPath: `/listings/review?id=${listingId}`,
  });
  assert.match(accepted.headers.get('set-cookie') ?? '', /Max-Age=0/);
  assert.doesNotMatch(
    accepted.headers.get('set-cookie') ?? '',
    /session_token|pana_active_profile/
  );
  assert.equal((await db.select().from(schema.verification)).length, 0);
  assert.deepEqual(preparedActors, [listingId]);
  const review = await reader.GET(
    request(`/api/getProfile?listingId=${listingId}`)
  );
  assert.equal(review.status, 200);
  const { data } = await review.json();
  assert.equal(data.id, listingId);
  assert.equal(data.email, businessEmail);
  assert.equal(data.name, 'Ana Bakery');
  assert.equal(
    (
      await description.POST(
        request(editPath('saveDesc'), {
          details: 'Updated from the business invitation',
        })
      )
    ).status,
    200
  );
  assert.equal((await getRow(listingId))?.userId, null);
  assert.equal((await getRow(listingId))?.email, businessEmail);
  assert.deepEqual(await getRow(personalId), personal);
  assert.deepEqual(await getRow(secondId), otherBusiness);
  assert.deepEqual(await db.select().from(schema.users), users);
  assert.equal(activeId, secondId);
  assert.equal(emails.length, 0);
  assert.equal((await getRow(listingId))?.lastReviewedAt, null);
  const reviewState = await reviewApi.GET(
    request(`/api/listings/review?profileId=${listingId}`)
  );
  assert.equal(reviewState.status, 200);
  assert.equal((await reviewState.json()).lastReviewedAt, null);
  assert.equal((await confirmBusiness()).status, 400);
  assert.equal(
    (
      await address.POST(
        request(editPath('saveAddress'), {
          primary_address: { zipcode: '33138' },
        })
      )
    ).status,
    200
  );
  const completed = await reviewApi.POST(
    invitationRequest('/api/listings/review', {
      profileId: listingId,
      cycleId: null,
      action: 'confirm',
      confirmed: true,
      expectedOwnerId: userId,
      expectedOwnerEmail: accountEmail,
    })
  );
  assert.equal(completed.status, 200);
  assert.ok((await getRow(listingId))?.lastReviewedAt);
  assert.deepEqual(await getRow(personalId), personal);
  assert.deepEqual(await getRow(secondId), otherBusiness);
  assert.deepEqual(await db.select().from(schema.users), users);
  assert.equal(activeId, secondId);
  assert.equal(emails.length, 0);
});

test('acceptance needs explicit confirmation and current account ID/email; stale sessions do not consume proof', async () => {
  const { token } = await issueInvitation();
  const { context } = await keepInvitation(token);
  for (const body of [
    { action: 'open' },
    { action: null },
    { expectedOwnerId: 'other-account' },
    { expectedOwnerId: null },
    { expectedOwnerEmail: 'old@personal.test.invalid' },
    { expectedOwnerEmail: null },
  ]) {
    const response = await acceptInvitation(context, body);
    assert.equal(response.status, 'action' in body ? 400 : 409);
  }
  session = {
    user: {
      id: 'other-account',
      email: 'other@personal.test.invalid',
      name: 'Other',
    },
  };
  assert.equal(
    (
      await acceptInvitation(context, {
        expectedOwnerId: userId,
        expectedOwnerEmail: accountEmail,
      })
    ).status,
    409
  );
  assert.equal((await db.select().from(schema.verification)).length, 1);
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
  // A deliberate fresh confirmation may choose this other Pana; the proof is
  // business-scoped, not an invitation to impersonate an existing login.
  assert.equal((await acceptInvitation(context)).status, 200);
  const [owner] = await db
    .select()
    .from(schema.profileOwners)
    .where(eq(schema.profileOwners.profileId, listingId));
  assert.equal(owner.userId, 'other-account');
});

test('missing, tampered, hash-as-token, wrong-business and query-only proof cannot claim any listing', async () => {
  const { token } = await issueInvitation();
  const [stored] = await db.select().from(schema.verification);
  const tokenHash = JSON.parse(stored.value).tokenHash;
  for (const presented of [
    '',
    'unknown',
    tokenHash,
    'a'.repeat(64),
    null,
    123,
  ]) {
    const response = await invitationContextApi.POST(
      invitationRequest('/api/listings/invitations/context', {
        profileId: listingId,
        token: presented,
      })
    );
    assert.ok([400, 410].includes(response.status));
  }
  const queryOnly = await invitationApi.GET(
    invitationRequest(
      `/api/listings/invitations?profileId=${listingId}&token=${token}`
    )
  );
  assert.equal(queryOnly.status, 410);
  assert.equal(
    (
      await invitationApi.POST(
        invitationRequest('/api/listings/invitations', {
          profileId: listingId,
          action: 'accept',
          expectedOwnerId: userId,
          expectedOwnerEmail: accountEmail,
          token,
        })
      )
    ).status,
    409
  );
  for (const context of [
    'not-json',
    JSON.stringify({ profileId: personalId, token }),
    JSON.stringify({ profileId: secondId, token }),
    JSON.stringify({ profileId: listingId, token: 'a'.repeat(64) }),
  ]) {
    assert.ok([409, 410].includes((await acceptInvitation(context)).status));
  }
  assert.equal((await db.select().from(schema.verification)).length, 1);
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
});

test('expiry and revocation affect only listing invitations and read-only expiry checks never delete tokens', async () => {
  const { token } = await issueInvitation();
  const { context } = await keepInvitation(token);
  const legacy = await tokens.createClaimToken(listingId, userId);
  await db.insert(schema.verification).values({
    identifier: 'magic-link:test-user',
    value: 'unrelated-login-token',
    expiresAt: new Date(Date.now() + 60_000),
  });
  await db
    .update(schema.verification)
    .set({ expiresAt: new Date(0) })
    .where(
      eq(schema.verification.identifier, listingInvitationIdentifier(listingId))
    );
  const before = await db.select().from(schema.verification);
  assert.equal(
    (
      await invitationApi.GET(
        invitationRequest(
          `/api/listings/invitations?profileId=${listingId}`,
          undefined,
          context
        )
      )
    ).status,
    410
  );
  assert.equal((await acceptInvitation(context)).status, 410);
  assert.deepEqual(await db.select().from(schema.verification), before);
  session = {
    user: { id: userId, email: accountEmail, name: 'Operator', isAdmin: true },
  };
  assert.equal(
    (
      await invitationAdmin.DELETE(
        invitationRequest(
          '/api/admin/listings/test/invitation',
          undefined,
          undefined,
          'DELETE'
        ),
        { params: Promise.resolve({ id: listingId }) }
      )
    ).status,
    200
  );
  assert.equal((await db.select().from(schema.verification)).length, 2);
  assert.equal((await redeem(legacy)).status, 200);
  assert.equal((await db.select().from(schema.verification)).length, 1);
});

test('the invitation accepts the seven-day response window but stops exactly at its stored deadline', async (t) => {
  const start = Date.UTC(2026, 10, 2, 12);
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const { data, token } = await issueInvitation();
  const lifetime = LISTING_INVITATION_DAYS * 86_400_000;
  assert.equal(Date.parse(data.expiresAt), start + lifetime);
  t.mock.timers.tick(lifetime - 1);
  const valid = await invitations.inspectListingInvitation(listingId, token);
  assert.ok('state' in valid && valid.state === 'available');
  t.mock.timers.tick(1);
  const expired = await invitations.inspectListingInvitation(listingId, token);
  assert.ok('success' in expired && expired.code === 'invalid_invitation');
  const context = JSON.stringify({ profileId: listingId, token });
  assert.equal((await acceptInvitation(context)).status, 410);
  assert.equal((await db.select().from(schema.verification)).length, 1);
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
});

test('reissuing rotates only this business proof, never makes two invitations redeemable', async () => {
  const first = await issueInvitation();
  const legacy = await tokens.createClaimToken(listingId, userId);
  const second = await issueInvitation();
  assert.notEqual(first.token, second.token);
  const previous = await invitations.inspectListingInvitation(
    listingId,
    first.token
  );
  assert.ok('success' in previous && previous.success === false);
  const expiredContext = JSON.stringify({
    profileId: listingId,
    token: first.token,
  });
  assert.equal((await acceptInvitation(expiredContext)).status, 410);
  const { context } = await keepInvitation(second.token);
  assert.equal((await acceptInvitation(context)).status, 200);
  assert.equal((await db.select().from(schema.verification)).length, 1);
  // The original account-specific token remains account-bound; it only opens
  // the existing manager's review, never grants a different account.
  session = {
    user: { id: 'other-account', email: businessEmail, name: 'Other' },
  };
  assert.equal((await redeem(legacy)).status, 403);
});

test('invitation acceptance rolls back ownership, pending fields and consumption together when storage fails', async () => {
  const { token } = await issueInvitation();
  const { context } = await keepInvitation(token);
  const before = await getRow(listingId);
  await pg.exec(`
    CREATE FUNCTION refuse_invitation_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Fixture invitation deletion outage'; END;
    $$;
    CREATE TRIGGER refuse_invitation_deletion BEFORE DELETE ON verification_tokens
    FOR EACH ROW WHEN (OLD.identifier LIKE 'listing-invitation:%')
    EXECUTE FUNCTION refuse_invitation_deletion();
  `);
  try {
    assert.equal((await acceptInvitation(context)).status, 500);
    assert.equal((await db.select().from(schema.profileOwners)).length, 1);
    assert.equal((await db.select().from(schema.verification)).length, 1);
    assert.deepEqual(await getRow(listingId), before);
    assert.equal(preparedActors.length, 0);
  } finally {
    await pg.exec(
      'DROP TRIGGER refuse_invitation_deletion ON verification_tokens; DROP FUNCTION refuse_invitation_deletion();'
    );
  }
  assert.equal((await acceptInvitation(context)).status, 200);
  assert.equal((await db.select().from(schema.verification)).length, 0);
});

test('concurrent acceptance by two accounts grants exactly one owner and spends the proof once', async () => {
  const { token } = await issueInvitation();
  const results = await Promise.all([
    invitations.acceptListingInvitation(listingId, token, userId),
    invitations.acceptListingInvitation(listingId, token, 'other-account'),
  ]);
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(
    results.filter(
      (result) => !result.success && result.code === 'already_claimed'
    ).length,
    1
  );
  assert.equal(
    (await db.select().from(schema.profileOwners)).filter(
      (owner) => owner.profileId === listingId
    ).length,
    1
  );
  assert.equal((await db.select().from(schema.verification)).length, 0);
});

test('existing managers can review a used, expired or missing invitation without creating another owner', async () => {
  const { token } = await issueInvitation();
  const { context } = await keepInvitation(token);
  assert.equal((await acceptInvitation(context)).status, 200);
  const before = await db.select().from(schema.profileOwners);
  const lookup = await invitationApi.GET(
    invitationRequest(`/api/listings/invitations?profileId=${listingId}`)
  );
  assert.deepEqual(await lookup.json(), {
    profileId: listingId,
    state: 'owned',
    expiresAt: null,
  });
  assert.equal((await acceptInvitation('invalid-context')).status, 200);
  assert.deepEqual(await db.select().from(schema.profileOwners), before);
  session = {
    user: { id: 'other-account', email: businessEmail, name: 'Other' },
  };
  assert.equal(
    (
      await invitationApi.GET(
        invitationRequest(
          `/api/listings/invitations?profileId=${listingId}`,
          undefined,
          context
        )
      )
    ).status,
    409
  );
  assert.equal((await acceptInvitation(context)).status, 409);
});

test('current contact, named setup and publication changes invalidate stale invitations without editing identity', async () => {
  const { token } = await issueInvitation();
  const { context } = await keepInvitation(token);
  const personal = await getRow(personalId);
  for (const update of [
    { email: 'changed-business@test.invalid' },
    { pendingOwnerEmail: 'new-pending-owner@test.invalid' },
    { active: false },
  ]) {
    const current = await getRow(listingId);
    assert.ok(current);
    await db
      .update(schema.profiles)
      .set(update)
      .where(eq(schema.profiles.id, listingId));
    assert.ok([404, 410].includes((await acceptInvitation(context)).status));
    await db
      .update(schema.profiles)
      .set({
        email: current.email,
        pendingOwnerEmail: current.pendingOwnerEmail,
        active: current.active,
      })
      .where(eq(schema.profiles.id, listingId));
  }
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
  assert.deepEqual(await getRow(personalId), personal);
  assert.equal((await db.select().from(schema.verification)).length, 1);
});

test('successful legacy claims revoke outstanding invitation proof, including after later ownership removal', async () => {
  const { token } = await issueInvitation();
  const legacy = await tokens.createClaimToken(listingId, userId);
  assert.equal((await redeem(legacy)).status, 200);
  assert.equal((await db.select().from(schema.verification)).length, 0);
  await db
    .delete(schema.profileOwners)
    .where(eq(schema.profileOwners.profileId, listingId));
  const context = JSON.stringify({ profileId: listingId, token });
  assert.equal((await acceptInvitation(context)).status, 410);
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
});

test('a real business-contact edit permanently revokes an outstanding invitation even if the old address is restored', async () => {
  const { token } = await issueInvitation();
  await ownListing();
  assert.equal(
    (
      await contact.POST(
        request(editPath('saveContact'), {
          email: 'new-business-contact@test.invalid',
        })
      )
    ).status,
    200
  );
  assert.equal((await db.select().from(schema.verification)).length, 0);
  assert.equal(
    (
      await contact.POST(
        request(editPath('saveContact'), {
          email: businessEmail,
        })
      )
    ).status,
    200
  );
  await db
    .delete(schema.profileOwners)
    .where(eq(schema.profileOwners.profileId, listingId));
  assert.equal(
    (await acceptInvitation(JSON.stringify({ profileId: listingId, token })))
      .status,
    410
  );
  assert.equal((await getRow(personalId))?.email, accountEmail);
});

test('concurrent issuance and acceptance are serialized without leaving usable proof after a claim', async () => {
  const { token } = await issueInvitation();
  const [replacement, acceptance] = await Promise.all([
    invitations.issueListingInvitation(listingId, userId),
    invitations.acceptListingInvitation(listingId, token, userId),
  ]);
  assert.ok(replacement.success !== acceptance.success);
  if (acceptance.success)
    assert.equal((await db.select().from(schema.verification)).length, 0);
  else {
    assert.equal(acceptance.code, 'invalid_invitation');
    assert.equal((await db.select().from(schema.profileOwners)).length, 1);
  }
});
