import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import * as schema from '@/lib/schema';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const userId = 'review-account';
const personalId = 'review-personal';
const listingId = 'review-business';
const secondId = 'another-managed-business';
const accountEmail = 'ana@personal.test.invalid';
const businessEmail = 'hello@business.test.invalid';
let session: { user: { id: string; email: string; name: string } } | null;
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
  if (zipUnavailable) return new Response('', { status: 503 });
  return Response.json({
    'post code': '33138',
    'country abbreviation': 'US',
    places: [
      {
        'place name': 'Miami',
        'state abbreviation': 'FL',
        latitude: '25.8521',
        longitude: '-80.1821',
      },
    ],
  });
});

const tables = [
  schema.users,
  schema.profiles,
  schema.profileOwners,
  schema.verification,
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
let tokens: typeof import('../lib/server/listing-claim');
let publicProfiles: typeof import('../lib/server/profile');
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
  tokens = await import('../lib/server/listing-claim');
  publicProfiles = await import('../lib/server/profile');
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
});

test('business details remain manageable without a ZIP, and mobile confirmation removes a previous public point', async () => {
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
            zipcode: '',
            country: '',
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
  assert.equal(row?.addressPostalCode, null);
  assert.equal(row?.addressLat, null);
  assert.equal(row?.addressLng, null);
  assert.equal(row?.addressGooglePlaceId, null);
  assert.equal(row?.geo, null);
});
