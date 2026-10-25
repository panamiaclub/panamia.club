import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const userId = 'signup-member';
const email = 'signup-member@test.invalid';
let session: {
  user: { id: string; email: string; name: string | null };
} | null;

mock.module(import.meta.resolve('../lib/db.ts'), {
  namedExports: { db },
});
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: { auth: async () => session },
});

const tables = [
  schema.users,
  schema.profiles,
  schema.screennameHistory,
  schema.socialActors,
  schema.socialGroups,
  schema.profileOwners,
];
let route: typeof import('../app/api/user/screenname/set/route');
let NextRequest: typeof import('next/server').NextRequest;

before(async () => {
  // Keep the route's real queries and writes, isolated from any shared database.
  for (const table of tables) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map(
      (column) =>
        `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}`
    );
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(', ')})`);
  }
  route = await import('../app/api/user/screenname/set/route');
  ({ NextRequest } = await import('next/server'));
});

beforeEach(async () => {
  for (const table of tables) {
    await db.delete(table);
  }
  await db.insert(schema.users).values({ id: userId, email, name: null });
  session = { user: { id: userId, email, name: null } };
});

after(async () => {
  await pg.close();
});

function claim(body: Record<string, unknown>) {
  return route.POST(
    new NextRequest('https://signup.test.invalid/api/user/screenname/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

async function assertSetupUnchanged() {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  assert.equal(user?.screenname, null);
  assert.equal(user?.name, null);
  assert.deepEqual(await db.select().from(schema.profiles), []);
  assert.deepEqual(await db.select().from(schema.screennameHistory), []);
}

const missingValues = [
  { label: 'omitted', value: undefined },
  { label: 'null', value: null },
  { label: 'empty', value: '' },
  { label: 'whitespace-only', value: ' \t\n ' },
  { label: 'numeric', value: 123 },
  { label: 'object', value: {} },
  { label: 'array', value: [] },
];

for (const { label, value } of missingValues) {
  test(`first claim rejects an ${label} name without saving setup`, async () => {
    const response = await claim({ screenname: 'anamartinez', name: value });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'Name is required',
    });
    await assertSetupUnchanged();
  });

  test(`first claim rejects an ${label} screenname without saving setup`, async () => {
    const response = await claim({ screenname: value, name: 'Ana Martinez' });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'Screenname is required',
    });
    await assertSetupUnchanged();
  });
}

test('a provider name does not substitute for the required name field', async () => {
  session = { user: { id: userId, email, name: 'Provider Name' } };
  const response = await claim({ screenname: 'anamartinez', name: '   ' });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Name is required');
  await assertSetupUnchanged();
});

test('a valid first claim saves the trimmed name and handle on the user and profile', async () => {
  const response = await claim({
    screenname: '  anamartinez  ',
    name: '  Ana Martinez  ',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: { screenname: 'anamartinez', timelineReset: false },
  });
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    with: { profile: true },
  });
  assert.equal(user?.screenname, 'anamartinez');
  assert.equal(user?.name, 'Ana Martinez');
  assert.equal(user?.profile?.screenname, 'anamartinez');
  assert.equal(user?.profile?.name, 'Ana Martinez');
});

test('first claims preserve the existing 80-character display name cap', async () => {
  const response = await claim({
    screenname: 'anamartinez',
    name: `  ${'a'.repeat(81)}  `,
  });

  assert.equal(response.status, 200);
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  assert.equal(profile?.name, 'a'.repeat(80));
});

test('a supplied name is mirrored onto a pre-existing personal profile', async () => {
  await db.insert(schema.profiles).values({
    userId,
    email,
    name: 'Legacy Name',
  });
  const response = await claim({
    screenname: 'anamartinez',
    name: 'Ana Martinez',
  });

  assert.equal(response.status, 200);
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  assert.equal(profile?.name, 'Ana Martinez');
  assert.equal(profile?.screenname, 'anamartinez');
});

test('existing members can change only their handle without blanking their name', async () => {
  await db
    .update(schema.users)
    .set({ screenname: 'ana-old', name: 'Ana Martinez' })
    .where(eq(schema.users.id, userId));
  await db.insert(schema.profiles).values({
    userId,
    email,
    name: 'Ana Martinez',
    screenname: 'ana-old',
  });

  const response = await claim({ screenname: 'ana-new' });

  assert.equal(response.status, 200);
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    with: { profile: true },
  });
  assert.equal(user?.screenname, 'ana-new');
  assert.equal(user?.name, 'Ana Martinez');
  assert.equal(user?.profile?.screenname, 'ana-new');
  assert.equal(user?.profile?.name, 'Ana Martinez');
  const history = await db.query.screennameHistory.findFirst();
  assert.equal(history?.screenname, 'ana-old');
  assert.equal(history?.redirectTo, 'ana-new');
});

test('an unchanged existing handle still succeeds without resubmitting a name', async () => {
  await db
    .update(schema.users)
    .set({ screenname: 'anamartinez' })
    .where(eq(schema.users.id, userId));

  const response = await claim({ screenname: 'anamartinez' });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: { screenname: 'anamartinez', timelineReset: false },
  });
});

test('handle-only changes still respect the existing cooldown', async () => {
  await db
    .update(schema.users)
    .set({
      screenname: 'ana-old',
      lastScreennameChange: new Date(),
    })
    .where(eq(schema.users.id, userId));

  const response = await claim({ screenname: 'ana-new' });

  assert.equal(response.status, 429);
  assert.match(
    (await response.json()).error,
    /You can change your screenname again on/
  );
});

test('claiming a handle still requires authentication', async () => {
  session = null;
  const response = await claim({
    screenname: 'anamartinez',
    name: 'Ana Martinez',
  });

  assert.equal(response.status, 401);
  await assertSetupUnchanged();
});
