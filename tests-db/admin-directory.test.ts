import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import * as schema from '@/lib/schema';
import type { DirectoryRoster } from '@/lib/admin/directory';

const pg = new PGlite();
const db = drizzle(pg, { schema });
let session: {
  user: { id: string; isAdmin: boolean; isContentModerator?: boolean };
} | null;
const invalidated: string[] = [];
const cachedQueries = new Map<string, { tags: string[]; value: unknown }>();
mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: { auth: async () => session },
});
mock.module(import.meta.resolve('next/cache'), {
  namedExports: {
    revalidatePath: (path: string) => invalidated.push(path),
    unstable_cache:
      (
        fn: (...args: unknown[]) => Promise<unknown>,
        keyParts: string[] = [],
        options: { tags?: string[] } = {}
      ) =>
      async (...args: unknown[]) => {
        const key = JSON.stringify([keyParts, args]);
        const cached = cachedQueries.get(key);
        if (cached) return cached.value;
        const value = await fn(...args);
        cachedQueries.set(key, { tags: options.tags ?? [], value });
        return value;
      },
    revalidateTag: (tag: string, profile: { expire: number }) => {
      assert.equal(profile.expire, 0);
      for (const [key, entry] of cachedQueries) {
        if (entry.tags.includes(tag)) cachedQueries.delete(key);
      }
    },
  },
});

const tables = [
  schema.users,
  schema.profiles,
  schema.profileOwners,
  schema.listingRefreshCycles,
  schema.listingRefreshDeliveries,
  schema.profileSignals,
  schema.venues,
  schema.events,
];
let rosterApi: typeof import('../app/api/admin/directory/route');
let exportApi: typeof import('../app/api/admin/directory/export/route');
let statusApi: typeof import('../app/api/admin/directory/[id]/status/route');
let publicProfiles: typeof import('../lib/server/profile');
let searchApi: typeof import('../app/api/getDirectorySearch/route');
let featuredApi: typeof import('../app/api/directory/featured/route');

before(async () => {
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
  rosterApi = await import('../app/api/admin/directory/route');
  exportApi = await import('../app/api/admin/directory/export/route');
  statusApi = await import('../app/api/admin/directory/[id]/status/route');
  publicProfiles = await import('../lib/server/profile');
  searchApi = await import('../app/api/getDirectorySearch/route');
  featuredApi = await import('../app/api/directory/featured/route');
});

beforeEach(async () => {
  for (const table of [...tables].reverse()) await db.delete(table);
  session = { user: { id: 'staff', isAdmin: true } };
  invalidated.length = 0;
  cachedQueries.clear();
  await db.insert(schema.users).values([
    {
      id: 'owner',
      email: 'owner@test.invalid',
      name: 'Business Owner',
      accountType: 'personal',
    },
    {
      id: 'coowner',
      email: 'coowner@test.invalid',
      name: 'Co-owner',
      accountType: 'personal',
    },
    {
      id: 'directory',
      email: 'directory@test.invalid',
      name: 'Directory Owner',
      accountType: 'directory',
    },
    {
      id: 'hybrid',
      email: 'hybrid@test.invalid',
      name: 'Hybrid Owner',
      accountType: 'hybrid',
    },
    {
      id: 'other',
      email: 'other@test.invalid',
      name: 'Other Account',
      accountType: 'other',
    },
  ]);
  const recent = new Date(Date.now() - 3 * 86400000);
  const old = new Date(Date.now() - 45 * 86400000);
  await db.insert(schema.profiles).values([
    {
      id: 'business',
      name: 'Cafe "Sun", Miami',
      email: 'contact@test.invalid',
      phoneNumber: '+1-305-555-0101',
      primaryImageCdn: 'https://files.test.invalid/cafe.png',
      screenname: 'cafe-sun',
      active: true,
      categories: { food: true },
      createdAt: recent,
      addressLocality: 'Miami',
      addressRegion: 'FL',
      status: {
        source: 'business_intake',
        approved: old.toISOString(),
        access: 'keep-capability',
        notes: 'Keep notes',
      },
    },
    {
      id: 'inactive',
      name: 'Inactive Business',
      email: 'inactive@test.invalid',
      active: false,
      createdAt: old,
      status: { approved: old.toISOString() },
    },
    {
      id: 'legacy',
      name: 'Legacy Shop',
      email: 'legacy@test.invalid',
      active: true,
      createdAt: old,
    },
    {
      id: 'directory-profile',
      userId: 'directory',
      name: 'Directory Shop',
      email: 'directory@test.invalid',
      active: true,
      createdAt: recent,
    },
    {
      id: 'hybrid-profile',
      userId: 'hybrid',
      name: 'Hybrid Shop',
      email: 'hybrid@test.invalid',
      active: true,
      createdAt: old,
    },
    {
      id: 'personal',
      userId: 'owner',
      name: 'Private Person',
      email: 'owner@test.invalid',
      active: true,
      status: { approved: old.toISOString() },
    },
    {
      id: 'other-profile',
      userId: 'other',
      name: 'Unresolved Person',
      email: 'other@test.invalid',
      active: true,
    },
    {
      id: 'pending',
      name: 'Pending Shop',
      email: 'pending@test.invalid',
      active: false,
      status: { source: 'business_intake' },
    },
    {
      id: 'declined',
      name: 'Declined Shop',
      email: 'declined@test.invalid',
      active: false,
      status: { source: 'business_intake', declined: old.toISOString() },
    },
  ]);
  await db.insert(schema.profileOwners).values([
    { profileId: 'business', userId: 'owner', role: 'owner' },
    { profileId: 'business', userId: 'coowner', role: 'owner' },
  ]);
});

after(async () => {
  await pg.close();
});

function change(id: string, body: unknown) {
  return statusApi.POST(
    new NextRequest(`https://test.invalid/api/admin/directory/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

test('all directory reads and writes require an admin, not just a moderator or owner', async () => {
  for (const user of [
    null,
    { id: 'owner', isAdmin: false },
    { id: 'moderator', isAdmin: false, isContentModerator: true },
  ]) {
    session = user ? { user } : null;
    assert.equal((await rosterApi.GET()).status, 403);
    assert.equal((await exportApi.GET()).status, 403);
    assert.equal(
      (await change('business', { active: false, expectedActive: true }))
        .status,
      403
    );
  }
  assert.equal(
    (
      await db.query.profiles.findFirst({
        where: eq(schema.profiles.id, 'business'),
      })
    )?.active,
    true
  );
});

test('roster contains business profiles once, excludes accounts and unapproved applications', async () => {
  const response = await rosterApi.GET();
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get('Cache-Control') ?? '',
    /private, no-store/
  );
  const { businesses, asOf } = (await response.json()) as DirectoryRoster;
  assert.deepEqual(businesses.map((row) => row.id).sort(), [
    'business',
    'directory-profile',
    'hybrid-profile',
    'inactive',
    'legacy',
  ]);
  const business = businesses.find((row) => row.id === 'business')!;
  assert.equal(business.owner, 'Business Owner; Co-owner');
  assert.equal(business.category, 'Food');
  assert.equal(business.location, 'Miami, FL');
  assert.equal(business.email, 'contact@test.invalid');
  assert.equal(business.screenname, 'cafe-sun');
  assert.ok(Number.isFinite(Date.parse(asOf)));
  assert.ok(!JSON.stringify(businesses).includes('keep-capability'));
  assert.ok(!JSON.stringify(businesses).includes('owner@test.invalid'));
});

test('CSV exports the full business roster including inactive profiles with safe cells', async () => {
  await db
    .update(schema.profiles)
    .set({ name: '  =HYPERLINK("bad")' })
    .where(eq(schema.profiles.id, 'legacy'));
  const response = await exportApi.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type') ?? '', /text\/csv/);
  assert.match(
    response.headers.get('Content-Disposition') ?? '',
    /attachment; filename="directory-businesses-\d{4}-\d{2}-\d{2}\.csv"/
  );
  assert.match(
    response.headers.get('Cache-Control') ?? '',
    /private, no-store/
  );
  const csv = await response.text();
  assert.equal(csv.trim().split('\r\n').length, 6);
  assert.match(csv, /"Cafe ""Sun"", Miami"/);
  assert.match(csv, /"Inactive Business".*"Inactive"/);
  assert.match(csv, /"'  =HYPERLINK\(""bad""\)"/);
  assert.match(csv, /"'\+1-305-555-0101"/);
  assert.ok(!csv.includes('Private Person'));
  assert.ok(!csv.includes('Pending Shop'));
  assert.ok(!csv.includes('Declined Shop'));
});

test('deactivation is persistent and reversible, keeps ownership/account data, cancels renewal writes', async () => {
  const before = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, 'business'),
  });
  const ownerBefore = await db.query.users.findFirst({
    where: eq(schema.users.id, 'owner'),
  });
  await db
    .insert(schema.listingRefreshCycles)
    .values({ id: 'cycle', profileId: 'business', state: 'active' });
  await db.insert(schema.listingRefreshDeliveries).values({
    cycleId: 'cycle',
    round: 1,
    status: 'sending',
    recipientHash: 'recipient',
    routingHash: 'routing',
    stopTokenHash: 'stop',
  });
  assert.ok(await publicProfiles.getPublicListing('business'));
  const response = await change('business', {
    active: false,
    expectedActive: true,
  });
  assert.equal(response.status, 200);
  const after = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, 'business'),
  });
  assert.equal(after?.active, false);
  assert.equal(after?.email, before?.email);
  assert.deepEqual(after?.status, {
    ...(before?.status as object),
    directoryVisibility: {
      active: false,
      changedBy: 'staff',
      changedAt: (
        after?.status as { directoryVisibility: { changedAt: string } }
      ).directoryVisibility.changedAt,
    },
  });
  assert.equal(await publicProfiles.getPublicListing('business'), null);
  assert.equal(await publicProfiles.getPublicProfile('cafe-sun'), null);
  assert.deepEqual(
    await db.query.users.findFirst({ where: eq(schema.users.id, 'owner') }),
    ownerBefore
  );
  assert.equal((await db.select().from(schema.profileOwners)).length, 2);
  assert.equal(
    (await db.query.listingRefreshCycles.findFirst())?.state,
    'cancelled'
  );
  assert.equal(
    (await db.query.listingRefreshDeliveries.findFirst())?.status,
    'cancelled'
  );
  assert.ok(invalidated.includes('/listings/business'));
  assert.ok(invalidated.includes('/p/cafe-sun'));
  assert.ok(invalidated.includes('/directory/search'));

  assert.equal(
    (await change('business', { active: false, expectedActive: true })).status,
    409
  );
  assert.equal(
    (await change('business', { active: true, expectedActive: false })).status,
    200
  );
  assert.ok(await publicProfiles.getPublicListing('business'));
  assert.ok(await publicProfiles.getPublicProfile('cafe-sun'));
});

test('legacy listings remain manageable after deactivation without an approval stamp', async () => {
  assert.equal(
    (await change('legacy', { active: false, expectedActive: true })).status,
    200
  );
  const { businesses } = (await (
    await rosterApi.GET()
  ).json()) as DirectoryRoster;
  assert.equal(businesses.find((row) => row.id === 'legacy')?.active, false);
  assert.equal(
    (await change('legacy', { active: true, expectedActive: false })).status,
    200
  );
});

test('deactivation of a linked directory account hides its handle without changing its account type', async () => {
  await db
    .update(schema.users)
    .set({ screenname: 'directory-shop' })
    .where(eq(schema.users.id, 'directory'));
  assert.ok(await publicProfiles.getPublicProfile('directory-shop'));
  assert.equal(
    (await change('directory-profile', { active: false, expectedActive: true }))
      .status,
    200
  );
  assert.equal(await publicProfiles.getPublicProfile('directory-shop'), null);
  assert.equal(
    (
      await db.query.users.findFirst({
        where: eq(schema.users.id, 'directory'),
      })
    )?.accountType,
    'directory'
  );
  assert.ok(invalidated.includes('/p/directory-shop'));
  assert.equal(
    (await change('directory-profile', { active: true, expectedActive: false }))
      .status,
    200
  );
  assert.ok(await publicProfiles.getPublicProfile('directory-shop'));
});

test('visibility changes invalidate cached directory variants and featured cards', async () => {
  const search = async (query: string) => {
    const response = await searchApi.GET(
      new NextRequest(`https://test.invalid/api/getDirectorySearch${query}`)
    );
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    return (await response.json()) as { data: { _id: string }[] };
  };
  const featured = async () => {
    const response = await featuredApi.GET(
      new NextRequest('https://test.invalid/api/directory/featured')
    );
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    return (await response.json()) as { data: { id: string }[] };
  };
  for (const query of ['', '?fcat=food']) {
    assert.ok((await search(query)).data.some((row) => row._id === 'business'));
  }
  assert.ok((await featured()).data.some((row) => row.id === 'business'));
  assert.ok(cachedQueries.size >= 3);

  assert.equal(
    (await change('business', { active: false, expectedActive: true })).status,
    200
  );
  for (const query of ['', '?fcat=food']) {
    assert.ok(
      !(await search(query)).data.some((row) => row._id === 'business')
    );
  }
  assert.equal((await featured()).data.length, 0);

  assert.equal(
    (await change('business', { active: true, expectedActive: false })).status,
    200
  );
  assert.ok((await search('')).data.some((row) => row._id === 'business'));
  assert.ok((await featured()).data.some((row) => row.id === 'business'));
});

test('cannot activate pending, declined, personal, or unresolved profiles through visibility', async () => {
  for (const id of [
    'pending',
    'declined',
    'personal',
    'other-profile',
    'missing',
  ]) {
    assert.equal(
      (await change(id, { active: true, expectedActive: false })).status,
      404,
      id
    );
  }
});

test('invalid status payloads fail without changing business visibility', async () => {
  for (const body of [
    null,
    [],
    {},
    { active: 'false', expectedActive: true },
    { active: false },
    { active: true, expectedActive: true },
  ]) {
    assert.equal(
      (await change('business', body)).status,
      400,
      JSON.stringify(body)
    );
  }
  assert.equal(
    (
      await db.query.profiles.findFirst({
        where: eq(schema.profiles.id, 'business'),
      })
    )?.active,
    true
  );
});

test('database read failures return errors, never a successful empty roster or CSV', async (t) => {
  t.mock.method(console, 'error', () => {});
  const failure = t.mock.method(db, 'select', () => {
    throw new Error('Database unavailable');
  });
  for (const response of [await rosterApi.GET(), await exportApi.GET()]) {
    assert.equal(response.status, 500);
    assert.match(
      response.headers.get('Content-Type') ?? '',
      /application\/json/
    );
  }
  failure.mock.restore();
});
