import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const email = 'solo-vendor@test.invalid';
const userId = 'solo-vendor';
const listingId = 'solo-vendor-listing';
const tables = [
  schema.users,
  schema.profiles,
  schema.screennameHistory,
  schema.socialActors,
  schema.socialGroups,
  schema.profileOwners,
];

mock.module(import.meta.resolve('../lib/db.ts'), {
  namedExports: { db },
});
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    auth: async () => ({ user: { id: userId, email, name: 'Solo Vendor' } }),
  },
});

let route: typeof import('../app/api/user/screenname/set/route');
let handles: typeof import('../lib/screenname');
let profiles: typeof import('../lib/server/profile');
let NextRequest: typeof import('next/server').NextRequest;

before(async () => {
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
  `);
  await db.insert(schema.profiles).values({
    id: 'migration-control',
    email: 'migration@test.invalid',
    name: 'Existing Shop',
  });
  await pg.exec(
    await readFile(
      new URL('../drizzle/0072_profile_contact_email.sql', import.meta.url),
      'utf8'
    )
  );
  assert.equal(
    (await db.query.profiles.findFirst())?.id,
    'migration-control',
    'the real migration must preserve existing profiles'
  );

  route = await import('../app/api/user/screenname/set/route');
  handles = await import('../lib/screenname');
  profiles = await import('../lib/server/profile');
  ({ NextRequest } = await import('next/server'));
});

beforeEach(async () => {
  for (const table of [...tables].reverse()) await db.delete(table);
  await db.insert(schema.users).values({ id: userId, email });
  await db.insert(schema.profiles).values({
    id: listingId,
    userId: null,
    email,
    name: 'Solo Vendor Bakery',
    status: { source: 'business_intake' },
  });
});

after(async () => {
  await pg.close();
});

test('a member can create their personal identity after listing with the same inbox', async () => {
  const response = await route.POST(
    new NextRequest('https://signup.test.invalid/api/user/screenname/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screenname: 'solovendor', name: 'Solo Vendor' }),
    })
  );
  assert.equal(response.status, 200);
  const personal = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  assert.ok(personal);
  assert.notEqual(personal.id, listingId);
  assert.equal(personal.email, email);
  assert.equal(personal.screenname, 'solovendor');

  const listing = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, listingId),
  });
  assert.equal(listing?.userId, null);
  assert.equal(listing?.name, 'Solo Vendor Bakery');
  assert.equal(listing?.screenname, null);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
});

test('email-based legacy adoption still excludes a directory listing', async () => {
  assert.equal(await profiles.ensureProfile(userId, email), null);
  const listing = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, listingId),
  });
  assert.equal(listing?.userId, null);
});

test('an imported personal profile is adopted instead of the listing sharing its email', async () => {
  await db.insert(schema.profiles).values({
    id: 'legacy-person',
    email,
    name: 'Legacy Person',
  });
  const personal = await profiles.ensureProfile(userId, email);
  assert.equal(personal?.id, 'legacy-person');
  assert.equal(personal?.userId, userId);
  assert.equal(
    (
      await db.query.profiles.findFirst({
        where: eq(schema.profiles.id, listingId),
      })
    )?.userId,
    null
  );
});

test('sharing an inbox never lets a person take a listing handle', async () => {
  await db
    .update(schema.profiles)
    .set({ screenname: 'vendor-bakery' })
    .where(eq(schema.profiles.id, listingId));
  assert.equal(
    await handles.isScreennameAvailable('vendor-bakery', email),
    false
  );
});

test('a person can still keep their own mirrored handle', async () => {
  await db
    .update(schema.users)
    .set({ screenname: 'solovendor' })
    .where(eq(schema.users.id, userId));
  await db.insert(schema.profiles).values({
    userId,
    email,
    name: 'Solo Vendor',
    screenname: 'solovendor',
  });
  assert.equal(await handles.isScreennameAvailable('solovendor', email), true);
});

test('differently named directory listings can share an inbox', async () => {
  await db.insert(schema.profiles).values({
    email,
    name: 'Solo Vendor Studio',
    status: { source: 'business_intake' },
  });
  const matches = await db.query.profiles.findMany({
    where: eq(schema.profiles.email, email),
  });
  assert.equal(matches.length, 2);
});

test('duplicate directory names and emails are still constrained case-insensitively', async () => {
  const { describeDbError } = await import('../lib/server/db-error');
  await assert.rejects(
    db.insert(schema.profiles).values({
      email: email.toUpperCase(),
      name: 'SOLO VENDOR BAKERY',
      status: { source: 'business_intake' },
    }),
    (error: unknown) => {
      const details = describeDbError(error);
      assert.equal(details.code, '23505');
      assert.equal(details.constraint, 'profiles_listing_name_email_unique');
      return true;
    }
  );
});

test('account emails and the personal identity slot remain unique', async () => {
  const { describeDbError } = await import('../lib/server/db-error');
  await assert.rejects(
    db.insert(schema.users).values({ email }),
    (error: unknown) => {
      assert.equal(describeDbError(error).constraint, 'users_email_unique');
      return true;
    }
  );
  await db.insert(schema.profiles).values({ userId, email, name: 'Person' });
  await assert.rejects(
    db.insert(schema.profiles).values({
      userId,
      email: 'another@test.invalid',
      name: 'Another identity',
    }),
    (error: unknown) => {
      assert.equal(
        describeDbError(error).constraint,
        'profiles_user_id_unique'
      );
      return true;
    }
  );
});
