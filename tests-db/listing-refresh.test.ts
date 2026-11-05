import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import * as schema from '@/lib/schema';
import { daysAfter, refreshDigest } from '@/lib/listing-refresh';
import { readListingInvitationFragment } from '@/lib/listing-invitation';
import { LISTING_INVITATION_COOKIE } from '@/lib/server/listing-invitation-request';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const businessId = 'refresh-business';
const otherBusinessId = 'other-business';
const userId = 'pana-owner';
const personalId = 'personal-profile';
const businessEmail = 'hello@business.test.invalid';
const personalEmail = 'ana@personal.test.invalid';
const origin = 'https://refresh.test.invalid';
const start = Date.UTC(2026, 10, 3, 12);
let session: {
  user: {
    id: string;
    email: string;
    name: string;
    isAdmin?: boolean;
    isContentModerator?: boolean;
  };
} | null;
let mailFails = false;
let onMail: (() => Promise<void>) | null = null;
let ghlSuppressed = false;
let ghlFails = false;
let activeId = personalId;
let zipUnavailable = false;
const zipLookups: string[] = [];
const zipArea = {
  postalCode: '33138',
  country: 'US',
  city: 'Miami',
  region: 'FL',
  lat: 25.8521,
  lng: -80.1821,
};
const emails: {
  template: string;
  variables: Record<string, unknown>;
  to: string | undefined;
  options: unknown;
}[] = [];
const invalidated: string[] = [];

mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: { auth: async () => session },
});
mock.module(import.meta.resolve('next/headers'), {
  namedExports: { cookies: async () => ({ get: () => ({ value: activeId }) }) },
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
      to?: string,
      options?: unknown
    ) => {
      emails.push({ template, variables, to, options });
      if (onMail) await onMail();
      if (mailFails) throw new Error('Fixture email provider failure');
    },
  },
});
mock.module(import.meta.resolve('../lib/ghl.ts'), {
  namedExports: {
    GHL_DND_CHANNELS: ['Email', 'SMS', 'WhatsApp', 'Call'],
    GhlClient: {
      create: () => ({
        getContactById: async () => {
          if (ghlFails) throw new Error('Fixture preference outage');
          return {
            dnd: ghlSuppressed,
            dndSettings: {
              Email: { status: ghlSuppressed ? 'active' : 'inactive' },
            },
          };
        },
        setDndAll: async () => {
          if (ghlFails) throw new Error('Fixture preference outage');
        },
        setDndChannels: async () => {
          if (ghlFails) throw new Error('Fixture preference outage');
        },
      }),
    },
  },
});
mock.module(import.meta.resolve('../lib/federation/index.ts'), {
  namedExports: { createActorForProfile: async () => ({ success: true }) },
});
mock.module(import.meta.resolve('../lib/federation/wrappers/actor.ts'), {
  namedExports: { ensureActorForProfile: async () => {} },
});
mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
  const url = String(input);
  if (/^https:\/\/api\.zippopotam\.us\/us\/\d{5}$/.test(url)) {
    zipLookups.push(url);
    if (zipUnavailable) return new Response('', { status: 503 });
    if (!url.endsWith('/33138')) return new Response('', { status: 404 });
    return Response.json({
      'post code': '33138',
      'country abbreviation': 'US',
      places: [
        {
          'place name': zipArea.city,
          'state abbreviation': zipArea.region,
          latitude: String(zipArea.lat),
          longitude: String(zipArea.lng),
        },
      ],
    });
  }
  throw new Error(
    `Unexpected network request in isolated test: ${String(input)}`
  );
});

let lifecycle: typeof import('../lib/server/listing-refresh');
let job: typeof import('../lib/jobs/listing-refresh');
let admin: typeof import('../app/api/admin/listings/[id]/refresh/route');
let review: typeof import('../app/api/listings/review/route');
let stop: typeof import('../app/api/listings/review/stop/route');
let invitations: typeof import('../app/api/listings/invitations/route');
let context: typeof import('../app/api/listings/invitations/context/route');
let claim: typeof import('../app/api/listings/[profileId]/claim/route');
let publicProfiles: typeof import('../lib/server/profile');
let directory: typeof import('../lib/server/directory');
let decisions: typeof import('../lib/server/listing-decision');
let unsubscribe: typeof import('../app/api/crm/contact/unsubscribe/route');
let dnd: typeof import('../app/api/crm/contact/dnd/route');
const originalHost = process.env.NEXT_PUBLIC_HOST_URL;

before(async () => {
  process.env.NEXT_PUBLIC_HOST_URL = origin;
  for (const table of [
    schema.users,
    schema.profiles,
    schema.profileOwners,
    schema.verification,
    schema.smsSubscriptions,
    schema.profileSignals,
    schema.venues,
    schema.events,
  ]) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns
      .filter(
        (column) =>
          !['last_reviewed_at', 'email_opted_out'].includes(column.name)
      )
      .map(
        (column) =>
          `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}` +
          (column.primary ? ' PRIMARY KEY' : '') +
          (column.isUnique ? ' UNIQUE' : '')
      );
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(', ')})`);
  }
  await pg.exec(`
    CREATE UNIQUE INDEX profile_owners_profile_user_unique ON profile_owners(profile_id, user_id);
    ALTER TABLE profile_owners ADD FOREIGN KEY (profile_id) REFERENCES profiles(id);
    ALTER TABLE profile_owners ADD FOREIGN KEY (user_id) REFERENCES users(id);
    CREATE FUNCTION pana_unaccent(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT value $$;
  `);
  await pg.exec(`INSERT INTO profiles (id, email, name, active, status)
    VALUES ('migration-existing-business', 'existing@test.invalid', 'Existing Business', true, '{"source":"business_intake"}')`);
  await pg.exec(
    await readFile(
      new URL('../drizzle/0076_listing_refresh.sql', import.meta.url),
      'utf8'
    )
  );
  const existing = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, 'migration-existing-business'),
  });
  assert.equal(existing?.active, true);
  assert.equal(existing?.userId, null);
  assert.equal(existing?.email, 'existing@test.invalid');
  assert.equal(existing?.lastReviewedAt, null);
  assert.equal((await db.select().from(schema.listingRefreshCycles)).length, 0);
  assert.equal((await db.select().from(schema.profileOwners)).length, 0);
  lifecycle = await import('../lib/server/listing-refresh');
  job = await import('../lib/jobs/listing-refresh');
  admin = await import('../app/api/admin/listings/[id]/refresh/route');
  review = await import('../app/api/listings/review/route');
  stop = await import('../app/api/listings/review/stop/route');
  invitations = await import('../app/api/listings/invitations/route');
  context = await import('../app/api/listings/invitations/context/route');
  claim = await import('../app/api/listings/[profileId]/claim/route');
  publicProfiles = await import('../lib/server/profile');
  directory = await import('../lib/server/directory');
  decisions = await import('../lib/server/listing-decision');
  unsubscribe = await import('../app/api/crm/contact/unsubscribe/route');
  dnd = await import('../app/api/crm/contact/dnd/route');
});

beforeEach(async () => {
  await db.delete(schema.listingRefreshDeliveries);
  await db.delete(schema.listingRefreshCycles);
  await db.delete(schema.profileOwners);
  await db.delete(schema.verification);
  await db.delete(schema.smsSubscriptions);
  await db.delete(schema.profiles);
  await db.delete(schema.users);
  await db.insert(schema.users).values([
    {
      id: userId,
      email: personalEmail,
      name: 'Ana Person',
      accountType: 'personal',
    },
    {
      id: 'staff',
      email: 'staff@test.invalid',
      name: 'Staff',
      accountType: 'personal',
    },
    {
      id: 'stranger',
      email: 'stranger@test.invalid',
      name: 'Stranger',
      accountType: 'personal',
    },
  ]);
  await db.insert(schema.profiles).values([
    {
      id: personalId,
      userId,
      email: personalEmail,
      name: 'Ana Person',
      active: true,
      emailOptedOut: false,
      descriptions: { details: 'Personal information stays unchanged' },
    },
    {
      id: businessId,
      email: businessEmail,
      name: 'Ana Bakery',
      userId: null,
      active: true,
      emailOptedOut: false,
      onlineOnly: false,
      status: {
        source: 'business_intake',
        approved: new Date(start).toISOString(),
      },
      descriptions: { details: 'Our existing business information' },
      addressLat: '25.8',
      addressLng: '-80.2',
      addressPostalCode: '33138',
      addressCountry: 'US',
      geo: { zipArea },
      primaryImageCdn: 'https://files.test.invalid/logo.png',
      phoneNumber: 'private-business-phone',
    },
    {
      id: otherBusinessId,
      email: personalEmail,
      name: 'Other Business',
      userId: null,
      active: true,
      emailOptedOut: false,
      onlineOnly: false,
      status: { source: 'business_intake' },
      descriptions: { details: 'Do not change this business' },
    },
  ]);
  await db
    .insert(schema.profileOwners)
    .values({ profileId: otherBusinessId, userId, role: 'owner' });
  session = { user: { id: userId, email: personalEmail, name: 'Ana' } };
  mailFails = false;
  onMail = null;
  ghlSuppressed = false;
  ghlFails = false;
  activeId = personalId;
  zipUnavailable = false;
  zipLookups.length = 0;
  emails.length = 0;
  invalidated.length = 0;
});
after(async () => {
  if (originalHost === undefined) delete process.env.NEXT_PUBLIC_HOST_URL;
  else process.env.NEXT_PUBLIC_HOST_URL = originalHost;
  await pg.close();
});

function request(
  path: string,
  body?: Record<string, unknown>,
  cookie?: string
) {
  return new NextRequest(`${origin}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(cookie
        ? {
            Cookie: `${LISTING_INVITATION_COOKIE}=${encodeURIComponent(cookie)}`,
          }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const params = (id = businessId) => ({ params: Promise.resolve({ id }) });
const row = () =>
  db.query.profiles.findFirst({ where: eq(schema.profiles.id, businessId) });
const cycle = () =>
  db.query.listingRefreshCycles.findFirst({
    where: eq(schema.listingRefreshCycles.profileId, businessId),
  });
const notices = () =>
  emails.filter((email) => email.template === 'listing.refresh');
async function enroll() {
  const previous = session;
  session = {
    user: {
      id: 'staff',
      email: 'staff@test.invalid',
      name: 'Staff',
      isAdmin: true,
    },
  };
  const response = await admin.POST(
    request('/api/admin/listings/test/refresh', {
      profileId: businessId,
      action: 'start',
      expectedActorId: 'staff',
      confirmed: true,
    }),
    params()
  );
  session = previous;
  assert.equal(response.status, 200);
  return (await response.json()).cycleId as string;
}
async function own() {
  await db
    .insert(schema.profileOwners)
    .values({ profileId: businessId, userId, role: 'owner' });
}
async function confirm(
  id: string | null,
  overrides: Record<string, unknown> = {}
) {
  return review.POST(
    request('/api/listings/review', {
      profileId: businessId,
      action: 'confirm',
      confirmed: true,
      cycleId: id,
      expectedOwnerId: session?.user.id,
      expectedOwnerEmail: session?.user.email,
      ...overrides,
    })
  );
}
async function tickThroughReminders(t: {
  mock: { timers: { tick: (ms: number) => void } };
}) {
  await job.runListingRefreshes();
  for (let round = 1; round <= 4; round += 1) {
    t.mock.timers.tick(7 * 86_400_000);
    await job.runListingRefreshes();
  }
}
const browse = () =>
  directory.getSearch({
    pageNum: 1,
    pageLimit: 30,
    searchTerm: '',
    filterCategories: '',
    geolat: '',
    geolng: '',
    radius: 'all',
    resultsView: 'map',
  });

test('migration adds a private, unenrolled lifecycle with no production-data side effects', async () => {
  assert.equal((await db.select().from(schema.listingRefreshCycles)).length, 0);
  assert.equal(
    (await db.select().from(schema.listingRefreshDeliveries)).length,
    0
  );
  assert.equal((await row())?.active, true);
  assert.equal((await row())?.lastReviewedAt, null);
  assert.equal((await job.runListingRefreshes()).noticesSent, 0);
  assert.equal(emails.length, 0);
  await enroll();
  assert.equal((await db.select().from(schema.listingRefreshCycles)).length, 1);
  await pg.exec(
    'CREATE ROLE refresh_anon; GRANT SELECT ON listing_refresh_cycles, listing_refresh_deliveries TO refresh_anon; SET ROLE refresh_anon;'
  );
  try {
    assert.equal(
      (await pg.query('SELECT * FROM listing_refresh_cycles')).rows.length,
      0
    );
  } finally {
    await pg.exec('RESET ROLE;');
  }
});

test('only explicit admin enrollment starts a cycle; previews, owners, moderators and sign-in do not', async () => {
  const before = await row();
  for (const user of [
    null,
    { id: userId, email: personalEmail, name: 'Owner' },
    {
      id: 'staff',
      email: 'staff@test.invalid',
      name: 'Moderator',
      isContentModerator: true,
    },
  ]) {
    session = user ? { user } : null;
    assert.equal(
      (
        await admin.POST(
          request('/api/admin/listings/test/refresh', {
            profileId: businessId,
            action: 'start',
            confirmed: true,
          }),
          params()
        )
      ).status,
      403
    );
  }
  session = {
    user: {
      id: 'staff',
      email: 'staff@test.invalid',
      name: 'Staff',
      isAdmin: true,
    },
  };
  assert.equal(
    (await admin.GET(request('/api/admin/listings/test/refresh'), params()))
      .status,
    200
  );
  assert.equal(
    (
      await admin.POST(
        request('/api/admin/listings/test/refresh', {
          profileId: otherBusinessId,
          action: 'start',
          confirmed: true,
          expectedActorId: 'staff',
        }),
        params()
      )
    ).status,
    409
  );
  assert.equal(
    (
      await admin.POST(
        request('/api/admin/listings/test/refresh', {
          profileId: businessId,
          action: 'start',
          confirmed: false,
          expectedActorId: 'staff',
        }),
        params()
      )
    ).status,
    409
  );
  assert.deepEqual(await row(), before);
  assert.equal(await cycle(), undefined);
  await enroll();
  assert.equal((await cycle())?.state, 'queued');
  assert.equal((await cycle())?.dueAt, null);
  assert.equal(emails.length, 0);
  assert.equal((await db.select().from(schema.verification)).length, 0);
});

test('the exact weekly schedule hides only the unconfirmed business at day 30, never on day 29', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const personal = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, personalId),
  });
  const other = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, otherBusinessId),
  });
  await enroll();
  const initial = await job.runListingRefreshes();
  assert.equal(initial.noticesSent, 1);
  assert.equal(notices()[0].to, businessEmail);
  assert.deepEqual(notices()[0].options, { requireDelivery: true });
  assert.equal(notices()[0].variables.reminderNotice, false);
  assert.equal((await cycle())?.startedAt?.getTime(), start);
  assert.equal(
    (await cycle())?.dueAt?.getTime(),
    daysAfter(new Date(start), 30).getTime()
  );
  t.mock.timers.tick(6 * 86_400_000);
  await job.runListingRefreshes();
  assert.equal(notices().length, 1);
  t.mock.timers.tick(86_400_000);
  const simultaneous = await Promise.all([
    job.runListingRefreshes(),
    job.runListingRefreshes(),
  ]);
  assert.equal(
    simultaneous.reduce((sum, report) => sum + report.remindersSent, 0),
    1
  );
  for (let round = 2; round <= 4; round += 1) {
    t.mock.timers.tick(7 * 86_400_000);
    await job.runListingRefreshes();
  }
  assert.equal(notices().length, 5);
  assert.equal((await cycle())?.reminderCount, 4);
  assert.deepEqual(
    notices().map((notice) => notice.variables.reminderNotice),
    [false, true, true, true, true]
  );
  assert.equal(notices()[4].variables.finalNotice, true);
  assert.equal(
    (await db.select().from(schema.listingRefreshDeliveries)).length,
    5
  );
  t.mock.timers.tick(2 * 86_400_000 - 1);
  assert.equal((await job.runListingRefreshes()).paused, 0);
  assert.equal((await row())?.active, true);
  t.mock.timers.tick(1);
  assert.equal((await job.runListingRefreshes()).paused, 1);
  assert.equal((await row())?.active, false);
  assert.equal((await cycle())?.state, 'paused');
  assert.equal((await row())?.lastReviewedAt, null);
  assert.equal(await publicProfiles.getPublicListing(businessId), null);
  assert.equal(
    (await browse()).data.some((listing) => listing.id === businessId),
    false
  );
  assert.deepEqual(
    await db.query.profiles.findFirst({
      where: eq(schema.profiles.id, personalId),
    }),
    personal
  );
  assert.deepEqual(
    await db.query.profiles.findFirst({
      where: eq(schema.profiles.id, otherBusinessId),
    }),
    other
  );
  assert.ok(invalidated.includes(`/listings/${businessId}`));
});

test('reminders rotate seven-day business proof while keeping private contacts and tokens out of stored delivery records', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  await enroll();
  await job.runListingRefreshes();
  const first = new URL(String(notices()[0].variables.reviewUrl));
  assert.equal(first.pathname, '/listings/invite');
  assert.equal(first.searchParams.get('id'), businessId);
  assert.equal(first.searchParams.has('token'), false);
  const firstToken = readListingInvitationFragment(first.hash);
  assert.ok(firstToken);
  t.mock.timers.tick(7 * 86_400_000);
  await job.runListingRefreshes();
  const second = new URL(String(notices()[1].variables.reviewUrl));
  const secondToken = readListingInvitationFragment(second.hash);
  assert.ok(secondToken);
  assert.notEqual(firstToken, secondToken);
  const delivery = await db.select().from(schema.listingRefreshDeliveries);
  assert.doesNotMatch(
    JSON.stringify(delivery),
    new RegExp(`${businessEmail}|${personalEmail}|${firstToken}|${secondToken}`)
  );
  assert.equal((await row())?.userId, null);
  assert.equal(
    (await db.select().from(schema.profileOwners)).filter(
      (owner) => owner.profileId === businessId
    ).length,
    0
  );
});

test('a paused unclaimed business can securely claim and confirm later, without restoring it merely by claiming', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const id = await enroll();
  await tickThroughReminders(t);
  const recoveryUrl = new URL(String(notices()[4].variables.reviewUrl));
  const token = readListingInvitationFragment(recoveryUrl.hash);
  assert.ok(token);
  t.mock.timers.tick(2 * 86_400_000);
  await job.runListingRefreshes();
  const preview = await claim.GET(
    request(`/api/listings/${businessId}/claim`),
    { params: Promise.resolve({ profileId: businessId }) }
  );
  assert.equal(preview.status, 200);
  assert.doesNotMatch(
    JSON.stringify(await preview.json()),
    /hello@|private-business-phone|pendingOwnerEmail/
  );
  const staged = await context.POST(
    request('/api/listings/invitations/context', {
      profileId: businessId,
      token,
    })
  );
  assert.equal(staged.status, 200);
  const cookie = staged.cookies.get(LISTING_INVITATION_COOKIE)?.value;
  assert.ok(cookie);
  const accepted = await invitations.POST(
    request(
      '/api/listings/invitations',
      {
        profileId: businessId,
        action: 'accept',
        expectedOwnerId: userId,
        expectedOwnerEmail: personalEmail,
      },
      cookie
    )
  );
  assert.equal(accepted.status, 200);
  assert.equal((await row())?.active, false);
  assert.equal((await cycle())?.state, 'paused');
  assert.equal((await row())?.lastReviewedAt, null);
  activeId = otherBusinessId;
  const response = await confirm(id);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).restored, true);
  assert.equal((await row())?.active, true);
  assert.equal((await row())?.lastReviewedAt?.getTime(), Date.now());
  assert.equal((await row())?.addressPostalCode, '33138');
  assert.equal((await row())?.onlineOnly, false);
  assert.equal((await row())?.email, businessEmail);
  assert.equal((await row())?.userId, null);
  assert.equal((await cycle())?.state, 'completed');
  assert.equal(
    (await browse()).data.some((listing) => listing.id === businessId),
    true
  );
  assert.equal(
    (
      await db.query.profiles.findFirst({
        where: eq(schema.profiles.id, personalId),
      })
    )?.email,
    personalEmail
  );
});

test('an authorized confirmation with an existing verified ZIP stops future reminders without requiring edits or a street address', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  await own();
  const id = await enroll();
  await job.runListingRefreshes();
  assert.equal(notices()[0].to, personalEmail);
  assert.equal(
    new URL(String(notices()[0].variables.reviewUrl)).pathname,
    '/listings/review'
  );
  const before = await row();
  const response = await confirm(id);
  assert.equal(response.status, 200);
  const afterReview = await row();
  assert.deepEqual(afterReview?.descriptions, before?.descriptions);
  assert.equal(afterReview?.addressPostalCode, '33138');
  assert.equal(zipLookups.length, 0);
  assert.equal(afterReview?.active, true);
  t.mock.timers.tick(90 * 86_400_000);
  await job.runListingRefreshes();
  assert.equal(notices().length, 1);
  assert.equal((await cycle())?.state, 'completed');
  assert.equal((await row())?.active, true);
});

test('missing ZIP alone never enrolls, emails or hides an existing published business', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  await db
    .update(schema.profiles)
    .set({
      addressPostalCode: null,
      geo: null,
    })
    .where(eq(schema.profiles.id, businessId));
  const before = await row();
  t.mock.timers.tick(90 * 86_400_000);
  await job.runListingRefreshes();
  assert.deepEqual(await row(), before);
  assert.equal((await db.select().from(schema.listingRefreshCycles)).length, 0);
  assert.equal(emails.length, 0);
  assert.equal(zipLookups.length, 0);
  assert.equal(
    (await publicProfiles.getPublicListing(businessId))?.id,
    businessId
  );
});

test('ZIP failures cannot complete open cycles, cancel pending deliveries, change opt-out policy or restore an overdue listing', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  await own();
  const id = await enroll();
  await tickThroughReminders(t);
  t.mock.timers.tick(2 * 86_400_000);
  await job.runListingRefreshes();
  assert.equal((await cycle())?.state, 'paused');
  assert.equal((await row())?.active, false);
  const pending = await db.query.listingRefreshDeliveries.findFirst({
    where: eq(schema.listingRefreshDeliveries.cycleId, id),
  });
  assert.ok(pending);
  await db
    .update(schema.listingRefreshDeliveries)
    .set({
      status: 'sending',
      sentAt: null,
    })
    .where(eq(schema.listingRefreshDeliveries.id, pending.id));
  for (const state of ['queued', 'active', 'held', 'paused'] as const) {
    await db
      .update(schema.listingRefreshCycles)
      .set({ state })
      .where(eq(schema.listingRefreshCycles.id, id));
    for (const zipcode of [null, 'bad-zip', '00000', '33138']) {
      await db
        .update(schema.profiles)
        .set({
          addressPostalCode: zipcode,
          geo: null,
        })
        .where(eq(schema.profiles.id, businessId));
      zipUnavailable = zipcode === '33138';
      const before = await row();
      const beforeCycle = await cycle();
      const beforeDeliveries = await db
        .select()
        .from(schema.listingRefreshDeliveries);
      const beforeEmails = emails.length;
      const beforeInvalidations = invalidated.length;
      const response = await confirm(id);
      assert.equal(response.status, zipUnavailable ? 503 : 400);
      const error = await response.json();
      assert.equal(error.field, 'zipcode');
      assert.equal(error.step, 'address');
      assert.deepEqual(await row(), before);
      assert.deepEqual(await cycle(), beforeCycle);
      assert.deepEqual(
        await db.select().from(schema.listingRefreshDeliveries),
        beforeDeliveries
      );
      assert.equal(emails.length, beforeEmails);
      assert.equal(invalidated.length, beforeInvalidations);
    }
  }
  zipUnavailable = false;
  assert.equal((await confirm(id)).status, 200);
  assert.equal((await cycle())?.state, 'completed');
  assert.equal((await row())?.active, true);
  assert.equal(
    (
      await db.query.listingRefreshDeliveries.findFirst({
        where: eq(schema.listingRefreshDeliveries.id, pending.id),
      })
    )?.status,
    'cancelled'
  );
});

test('a missing primary photo leaves every open cycle and delivery unchanged, including an eligible overdue pause', async () => {
  await own();
  const { pauseGuard, isReviewPausedListing, listingStatus } =
    await import('../lib/server/listing-refresh-status');
  const personal = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, personalId),
  });
  const other = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, otherBusinessId),
  });
  const accounts = await db.select().from(schema.users);
  const owners = await db.select().from(schema.profileOwners);
  for (const state of ['queued', 'active', 'held', 'paused'] as const) {
    await db.delete(schema.listingRefreshDeliveries);
    await db.delete(schema.listingRefreshCycles);
    const id = `missing-photo-${state}`;
    await db
      .update(schema.profiles)
      .set({
        primaryImageCdn: null,
        galleryImages: {
          gallery1CDN: 'https://files.test.invalid/gallery.png',
        },
        lastReviewedAt: new Date('2025-01-01T00:00:00Z'),
        active: state !== 'paused',
        status: {
          source: 'business_intake',
          approved: new Date(start).toISOString(),
        },
      })
      .where(eq(schema.profiles.id, businessId));
    await db.insert(schema.listingRefreshCycles).values({
      id,
      profileId: businessId,
      state,
      reminderCount: state === 'paused' ? 4 : 1,
      startedAt: new Date(start),
      dueAt: daysAfter(new Date(start), 30),
      pausedAt: state === 'paused' ? daysAfter(new Date(start), 30) : null,
      nextReminderAt: state === 'active' ? daysAfter(new Date(start), 7) : null,
      holdReason: state === 'held' ? 'operator_hold' : null,
    });
    if (state === 'paused') {
      const current = await row();
      assert.ok(current);
      await db
        .update(schema.profiles)
        .set({
          status: {
            ...listingStatus(current.status),
            refreshPause: {
              reason: 'review_overdue',
              cycleId: id,
              guard: await pauseGuard(current),
            },
          },
        })
        .where(eq(schema.profiles.id, businessId));
      assert.equal(await isReviewPausedListing(await row()), true);
    }
    await db.insert(schema.listingRefreshDeliveries).values({
      cycleId: id,
      round: 1,
      status: 'sending',
      recipientHash: await refreshDigest(personalEmail),
      routingHash: await refreshDigest('isolated-photo-fixture'),
      stopTokenHash: await refreshDigest('isolated-stop-fixture'),
      attemptedAt: new Date(start),
    });
    const before = await row();
    const cycleBefore = await cycle();
    const deliveriesBefore = await db
      .select()
      .from(schema.listingRefreshDeliveries);
    const response = await confirm(id, {
      primaryPhotoSaved: true,
      primaryImageCdn: 'https://files.test.invalid/submitted-photo.png',
    });
    assert.equal(response.status, 400, state);
    assert.equal((await response.json()).field, 'primary');
    assert.deepEqual(await row(), before, state);
    assert.deepEqual(await cycle(), cycleBefore, state);
    assert.deepEqual(
      await db.select().from(schema.listingRefreshDeliveries),
      deliveriesBefore,
      state
    );
    assert.equal(invalidated.length, 0);

    for (const action of ['stop_reminders', 'allow_reminders']) {
      const preference = await review.POST(
        request('/api/listings/review', {
          profileId: businessId,
          action,
          cycleId: id,
          expectedOwnerId: userId,
          expectedOwnerEmail: personalEmail,
        })
      );
      assert.equal(preference.status, 200, `${state}/${action}`);
      assert.equal((await row())?.active, before?.active);
      assert.deepEqual((await row())?.lastReviewedAt, before?.lastReviewedAt);
    }
    if (state === 'paused') {
      assert.equal((await cycle())?.state, 'paused');
      await db
        .update(schema.profiles)
        .set({
          primaryImageCdn: 'https://files.test.invalid/saved-primary.png',
        })
        .where(eq(schema.profiles.id, businessId));
      const completed = await confirm(id);
      assert.equal(completed.status, 200);
      assert.equal((await completed.json()).restored, true);
      assert.equal((await row())?.active, true);
      assert.equal((await cycle())?.state, 'completed');
    }
  }
  assert.deepEqual(
    await db.query.profiles.findFirst({
      where: eq(schema.profiles.id, personalId),
    }),
    personal
  );
  assert.deepEqual(
    await db.query.profiles.findFirst({
      where: eq(schema.profiles.id, otherBusinessId),
    }),
    other
  );
  assert.deepEqual(await db.select().from(schema.users), accounts);
  assert.deepEqual(await db.select().from(schema.profileOwners), owners);
  assert.equal(zipLookups.length, 0);
  assert.equal(emails.length, 0);
});

test('missing confirmation, wrong listing, wrong account and stale cycles cannot stop reminders or overwrite a personal identity', async () => {
  await own();
  const id = await enroll();
  const before = await row();
  assert.equal((await confirm(id, { confirmed: false })).status, 400);
  assert.equal((await confirm(id, { cycleId: 'stale-cycle' })).status, 409);
  assert.equal(
    (await confirm(id, { expectedOwnerId: 'stranger' })).status,
    409
  );
  assert.equal((await confirm(id, { profileId: personalId })).status, 403);
  assert.equal((await confirm(id, { profileId: 'missing' })).status, 403);
  session = {
    user: { id: 'stranger', email: 'stranger@test.invalid', name: 'Stranger' },
  };
  assert.equal((await confirm(id)).status, 403);
  session = null;
  assert.equal(
    (await review.GET(request(`/api/listings/review?profileId=${businessId}`)))
      .status,
    401
  );
  assert.deepEqual(await row(), before);
  assert.equal((await cycle())?.state, 'queued');
});

test('claimed businesses notify current account emails rather than the copied business contact or active business', async () => {
  await own();
  const id = await enroll();
  activeId = otherBusinessId;
  await job.runListingRefreshes();
  assert.equal(notices().length, 1);
  assert.equal(notices()[0].to, personalEmail);
  assert.equal(
    new URL(String(notices()[0].variables.reviewUrl)).searchParams.get('id'),
    businessId
  );
  assert.equal((await cycle())?.id, id);
  assert.equal(
    (
      await db.query.profiles.findFirst({
        where: eq(schema.profiles.id, otherBusinessId),
      })
    )?.lastReviewedAt,
    null
  );
});

test('failed initial delivery does not start a clock or hide a listing, and it is not blindly retried', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const id = await enroll();
  mailFails = true;
  const result = await job.runListingRefreshes();
  assert.equal(result.errors, 1);
  assert.equal((await cycle())?.state, 'held');
  assert.equal((await cycle())?.startedAt, null);
  assert.equal((await cycle())?.dueAt, null);
  t.mock.timers.tick(60 * 86_400_000);
  await job.runListingRefreshes();
  assert.equal(notices().length, 1);
  assert.equal((await row())?.active, true);
  assert.equal(
    (await lifecycle.controlListingRefresh(businessId, 'retry', '', false))
      .success,
    false
  );
  mailFails = false;
  assert.equal(
    (await lifecycle.controlListingRefresh(businessId, 'retry', '', true))
      .success,
    true
  );
  await job.runListingRefreshes();
  assert.equal((await cycle())?.id, id);
  assert.equal((await cycle())?.startedAt?.getTime(), Date.now());
  assert.equal(
    (await cycle())?.dueAt?.getTime(),
    daysAfter(new Date(), 30).getTime()
  );
});

test('a missing acknowledgement is held after an hour and never becomes an automatic duplicate email', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const id = await enroll();
  await db.insert(schema.listingRefreshDeliveries).values({
    cycleId: id,
    round: 0,
    status: 'sending',
    recipientHash: await refreshDigest(businessEmail),
    routingHash: await refreshDigest('fixture'),
    stopTokenHash: await refreshDigest('fixture-stop'),
    attemptedAt: new Date(start),
  });
  t.mock.timers.tick(60 * 60 * 1000);
  assert.equal((await job.runListingRefreshes()).held, 1);
  assert.equal((await cycle())?.holdReason, 'delivery_unknown');
  assert.equal(notices().length, 0);
  t.mock.timers.tick(45 * 86_400_000);
  await job.runListingRefreshes();
  assert.equal((await row())?.active, true);
  assert.equal(notices().length, 0);
});

test('late reminders remain a week apart and the final notice always gets at least two days before hiding', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  await enroll();
  await job.runListingRefreshes();
  for (let round = 1; round <= 4; round += 1) {
    t.mock.timers.tick(8 * 86_400_000);
    await job.runListingRefreshes();
  }
  assert.equal((await cycle())?.dueAt?.getTime(), start + 34 * 86_400_000);
  assert.equal((await row())?.active, true);
  t.mock.timers.tick(2 * 86_400_000 - 1);
  assert.equal((await job.runListingRefreshes()).paused, 0);
  t.mock.timers.tick(1);
  assert.equal((await job.runListingRefreshes()).paused, 1);
});

test('opt-out inspection is read-only; explicit scoped opt-out stops reminders but neither claims nor hides a business', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  await db
    .update(schema.profiles)
    .set({ primaryImageCdn: null })
    .where(eq(schema.profiles.id, businessId));
  const id = await enroll();
  await job.runListingRefreshes();
  const link = new URL(String(notices()[0].variables.stopUrl));
  const token = readListingInvitationFragment(link.hash);
  assert.ok(token);
  assert.equal(link.searchParams.size, 1);
  assert.equal(link.searchParams.get('cycleId'), id);
  session = null;
  const before = await row();
  assert.deepEqual(await row(), before);
  const response = await stop.POST(
    request('/api/listings/review/stop', { cycleId: id, token, action: 'stop' })
  );
  assert.equal(response.status, 200);
  assert.equal((await cycle())?.state, 'held');
  t.mock.timers.tick(60 * 86_400_000);
  await job.runListingRefreshes();
  assert.equal(notices().length, 1);
  assert.equal((await row())?.active, true);
  assert.equal((await row())?.userId, null);
  assert.equal(
    (await lifecycle.startListingRefresh(businessId, 'staff')).success,
    false
  );
});

test('opted-out and bounced listings are held, not treated as nonresponders', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const id = await enroll();
  await job.runListingRefreshes();
  await lifecycle.controlListingRefresh(businessId, 'hold', 'bounced', false);
  t.mock.timers.tick(50 * 86_400_000);
  await job.runListingRefreshes();
  assert.equal((await row())?.active, true);
  assert.equal((await cycle())?.holdReason, 'bounced');
  assert.equal((await cycle())?.id, id);
  assert.equal(
    (await lifecycle.controlListingRefresh(businessId, 'retry', '', true))
      .success,
    false
  );
});

test('historical CRM Email DND and unavailable preference lookups block delivery and auto-hiding', async () => {
  await db
    .update(schema.profiles)
    .set({ ghlContactId: 'fixture-contact' })
    .where(eq(schema.profiles.id, businessId));
  await enroll();
  ghlSuppressed = true;
  await job.runListingRefreshes();
  assert.equal(notices().length, 0);
  assert.equal((await cycle())?.holdReason, 'recipient_opted_out');
  await lifecycle.controlListingRefresh(businessId, 'cancel', '', false);
  ghlSuppressed = false;
  ghlFails = true;
  await enroll();
  await job.runListingRefreshes();
  assert.equal(notices().length, 0);
  const rows = await db.select().from(schema.listingRefreshCycles);
  assert.equal(
    rows.some((entry) => entry.holdReason === 'preference_unavailable'),
    true
  );
  assert.equal((await row())?.active, true);
});

test('account-wide unsubscribe and Email-channel DND are honored even when CRM synchronization fails', async () => {
  await own();
  await enroll();
  ghlFails = true;
  assert.equal(
    (await unsubscribe.POST(request('/api/crm/contact/unsubscribe', {})))
      .status,
    200
  );
  assert.equal(
    (
      await db.query.profiles.findFirst({
        where: eq(schema.profiles.id, personalId),
      })
    )?.emailOptedOut,
    true
  );
  await job.runListingRefreshes();
  assert.equal(notices().length, 0);
  await db
    .update(schema.profiles)
    .set({ emailOptedOut: false, ghlContactId: 'fixture' })
    .where(eq(schema.profiles.id, personalId));
  const response = await dnd.PATCH(
    request('/api/crm/contact/dnd', { channel: 'Email', suppressed: true })
  );
  assert.equal(response.status, 503);
  assert.equal(
    (
      await db.query.profiles.findFirst({
        where: eq(schema.profiles.id, personalId),
      })
    )?.emailOptedOut,
    true
  );
});

test('staff declines and explicit cancellation remain authoritative after a review pause', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  await own();
  await enroll();
  await tickThroughReminders(t);
  t.mock.timers.tick(2 * 86_400_000);
  await job.runListingRefreshes();
  await decisions.decideListing({
    profileId: businessId,
    decision: 'decline',
    decidedBy: 'staff@test.invalid',
  });
  assert.equal((await cycle())?.state, 'cancelled');
  assert.equal((await confirm(null)).status, 200);
  assert.equal((await row())?.active, false);
  assert.equal(await publicProfiles.getPublicListing(businessId), null);
});

test('manual hidden-state changes cannot be overridden using an old overdue marker', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  await own();
  const id = await enroll();
  await tickThroughReminders(t);
  t.mock.timers.tick(2 * 86_400_000);
  await job.runListingRefreshes();
  await db
    .update(schema.profiles)
    .set({ administrative: { suspended: true } })
    .where(eq(schema.profiles.id, businessId));
  const response = await confirm(id);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).restored, false);
  assert.equal((await row())?.active, false);
});

test('a confirmation arriving during delivery cancels the cycle instead of restarting its timer', async () => {
  await own();
  const id = await enroll();
  onMail = async () => {
    assert.equal((await confirm(id)).status, 200);
  };
  await job.runListingRefreshes();
  assert.equal((await cycle())?.state, 'completed');
  assert.equal((await cycle())?.nextReminderAt, null);
  assert.equal((await cycle())?.startedAt, null);
});

test('new contacts and lost ownership cannot use an old reminder proof to alter another business or its recipients', async () => {
  const id = await enroll();
  await job.runListingRefreshes();
  const token = readListingInvitationFragment(
    new URL(String(notices()[0].variables.stopUrl)).hash
  );
  assert.ok(token);
  await db
    .update(schema.profiles)
    .set({ email: 'new@business.test.invalid' })
    .where(eq(schema.profiles.id, businessId));
  assert.equal(
    (
      await stop.POST(
        request('/api/listings/review/stop', {
          cycleId: id,
          token,
          action: 'stop',
        })
      )
    ).status,
    403
  );
  assert.equal(
    (
      await stop.POST(
        request('/api/listings/review/stop', {
          cycleId: 'another-cycle',
          token,
          action: 'stop',
        })
      )
    ).status,
    404
  );
  assert.equal((await row())?.active, true);
});

test('an external email opt-out after the final notice prevents day-30 hiding', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  await db
    .update(schema.profiles)
    .set({ ghlContactId: 'fixture-contact' })
    .where(eq(schema.profiles.id, businessId));
  await enroll();
  await tickThroughReminders(t);
  ghlSuppressed = true;
  t.mock.timers.tick(2 * 86_400_000);
  await job.runListingRefreshes();
  assert.equal((await row())?.active, true);
  assert.equal((await cycle())?.state, 'held');
  assert.equal((await cycle())?.holdReason, 'recipient_opted_out');
});

test('enrollment cannot target a personal, unknown, pending or staff-hidden profile', async () => {
  assert.equal(
    (await lifecycle.startListingRefresh(personalId, 'staff')).success,
    false
  );
  assert.equal(
    (await lifecycle.startListingRefresh('unknown', 'staff')).success,
    false
  );
  await db
    .update(schema.profiles)
    .set({ active: false })
    .where(eq(schema.profiles.id, businessId));
  assert.equal(
    (await lifecycle.startListingRefresh(businessId, 'staff')).success,
    false
  );
  assert.equal((await db.select().from(schema.listingRefreshCycles)).length, 0);
});

test('concurrent enrollment creates exactly one open lifecycle rather than two timer sequences', async () => {
  const outcomes = await Promise.all([
    lifecycle.startListingRefresh(businessId, 'staff'),
    lifecycle.startListingRefresh(businessId, 'staff'),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.success).length, 1);
  assert.equal((await db.select().from(schema.listingRefreshCycles)).length, 1);
  assert.equal(notices().length, 0);
});

test('cancelling an overdue cycle does not publish the listing or allow stale proof to undo the cancellation', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  await own();
  const id = await enroll();
  await tickThroughReminders(t);
  t.mock.timers.tick(2 * 86_400_000);
  await job.runListingRefreshes();
  await lifecycle.controlListingRefresh(businessId, 'cancel', '', false);
  assert.equal((await row())?.active, false);
  assert.equal((await confirm(id)).status, 409);
  assert.equal((await confirm(null)).status, 200);
  assert.equal((await row())?.active, false);
});

test('a changed contact or ownership handoff after notices does not hide a new unnotified recipient', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start });
  await own();
  await enroll();
  await tickThroughReminders(t);
  await db
    .delete(schema.profileOwners)
    .where(eq(schema.profileOwners.profileId, businessId));
  await db
    .update(schema.profiles)
    .set({ email: 'new-contact@test.invalid' })
    .where(eq(schema.profiles.id, businessId));
  t.mock.timers.tick(2 * 86_400_000);
  await job.runListingRefreshes();
  assert.equal((await row())?.active, true);
  assert.equal((await cycle())?.state, 'held');
  assert.equal((await cycle())?.holdReason, 'contact_changed');
});
