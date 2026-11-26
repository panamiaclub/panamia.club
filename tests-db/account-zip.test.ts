import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const userId = 'zip-member';
let session: { user: { id: string; email: string } } | null;
mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: { auth: async () => session },
});
mock.module(import.meta.resolve('../lib/server/profile-owners.ts'), {
  namedExports: { administersOtherProfile: async () => true },
});

let route: typeof import('../app/api/user/zip/route');
let me: typeof import('../app/api/user/me/route');
let gate: typeof import('../lib/server/account-zip');
let zipPage: typeof import('../app/welcome/zip/page');
let author: typeof import('../app/api/user/author/[id]/route');
let NextRequest: typeof import('next/server').NextRequest;

before(async () => {
  for (const table of [schema.users, schema.profiles]) {
    const { name, columns } = getTableConfig(table);
    await pg.exec(
      `CREATE TABLE "${name}" (${columns
        .map(
          (column) =>
            `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}`
        )
        .join(', ')})`
    );
  }
  route = await import('../app/api/user/zip/route');
  me = await import('../app/api/user/me/route');
  gate = await import('../lib/server/account-zip');
  zipPage = await import('../app/welcome/zip/page');
  author = await import('../app/api/user/author/[id]/route');
  ({ NextRequest } = await import('next/server'));
});

beforeEach(async () => {
  await db.delete(schema.profiles);
  await db.delete(schema.users);
  await db.insert(schema.users).values({
    id: userId,
    email: 'member@test.invalid',
    name: 'Existing Member',
    screenname: 'existing-member',
    lastScreennameChange: new Date(),
    createdAt: new Date('2020-01-01'),
  });
  await db.insert(schema.users).values({
    id: 'other-member',
    email: 'other@test.invalid',
    zipCode: '33138',
  });
  session = { user: { id: userId, email: 'member@test.invalid' } };
});

after(async () => pg.close());

function save(body: unknown) {
  return route.POST(
    new NextRequest('https://pana.test/api/user/zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

test('requires authentication and never accepts a caller-selected account', async () => {
  session = null;
  assert.equal((await save({ zipCode: '02108' })).status, 401);
  session = { user: { id: userId, email: 'member@test.invalid' } };
  assert.equal(
    (await save({ zipCode: '02108', userId: 'other-member' })).status,
    200
  );
  const other = await db.query.users.findFirst({
    where: eq(schema.users.id, 'other-member'),
  });
  assert.equal(other?.zipCode, '33138');
});

test('rejects missing, malformed, and non-US formats without overwriting a saved ZIP', async () => {
  await save({ zipCode: '02108' });
  for (const value of [
    undefined,
    null,
    '',
    '   ',
    33138,
    {},
    [],
    '3313',
    '331380',
    '33138abc',
    '33138-123',
    '33138 1234',
    'M5V 1A1',
  ]) {
    assert.equal(
      (await save({ zipCode: value })).status,
      400,
      JSON.stringify(value)
    );
  }
  for (const body of [null, [], '33138']) {
    assert.equal((await save(body)).status, 400);
  }
  const malformed = new NextRequest('https://pana.test/api/user/zip', {
    method: 'POST',
    body: '{',
  });
  assert.equal((await route.POST(malformed)).status, 400);
  assert.equal(
    (
      await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      })
    )?.zipCode,
    '02108'
  );
});

test('saves normalized ZIPs for existing and first-run accounts without changing identity or public addresses', async () => {
  await db.insert(schema.profiles).values({
    id: 'business-profile',
    userId,
    email: 'shop@test.invalid',
    name: 'Public Shop',
    addressPostalCode: '33138',
    verifiedZipCode: '33301',
  });
  for (const zipCode of [' 00501-1234 ', '00501']) {
    const response = await save({ zipCode });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      data: { zipCode: '00501' },
    });
  }
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  assert.equal(user?.name, 'Existing Member');
  assert.equal(user?.screenname, 'existing-member');
  assert.ok(user?.lastScreennameChange);
  const profile = await db.query.profiles.findFirst();
  assert.equal(profile?.addressPostalCode, '33138');
  assert.equal(profile?.verifiedZipCode, '33301');
  assert.equal(profile?.name, 'Public Shop');

  await db.delete(schema.profiles);
  await db
    .update(schema.users)
    .set({ screenname: null, name: null })
    .where(eq(schema.users.id, userId));
  assert.equal((await save({ zipCode: '90210' })).status, 200);
  assert.deepEqual(await db.select().from(schema.profiles), []);
});

test('reports a missing account rather than claiming to save successfully', async () => {
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  assert.equal((await save({ zipCode: '33138' })).status, 404);
});

test('requires a ZIP for old and new accounts, including business-owner setup and personal onboarding', async () => {
  for (const createdAt of [new Date('2020-01-01'), new Date()]) {
    await db
      .update(schema.users)
      .set({ createdAt })
      .where(eq(schema.users.id, userId));
    for (const pathname of [
      '/s',
      '/welcome',
      '/welcome/start',
      '/listings/setup',
      '/form/get-listed',
    ]) {
      await assert.rejects(gate.requireAccountZip(pathname, '?from=invite'), {
        message: `NEXT_REDIRECT:/welcome/zip?next=${encodeURIComponent(`${pathname}?from=invite`)}`,
      });
    }
  }
  await save({ zipCode: '02108' });
  await gate.requireAccountZip('/s');
});

test('does not redirect signed-out visitors, and keeps ZIP setup, sign-in, legal and account deletion accessible', async () => {
  for (const pathname of [
    '/welcome/zip',
    '/welcome/zip/',
    '/signin',
    '/signin/reviewer',
    '/legal/privacy',
    '/legal/terms',
    '/account/user/edit',
  ]) {
    await gate.requireAccountZip(pathname);
  }
  session = null;
  await gate.requireAccountZip('/s');
});

test('ZIP setup preserves safe return paths and rejects external destinations and self-loops', async () => {
  const result = await zipPage.default({
    searchParams: Promise.resolve({ next: '/listings/setup?token=example' }),
  });
  assert.equal(result.props.destination, '/listings/setup?token=example');
  for (const next of [
    'https://outside.test',
    '//outside.test',
    '/\\outside.test',
    '/welcome/zip',
    '/welcome/zip/?next=/s',
  ]) {
    const result = await zipPage.default({
      searchParams: Promise.resolve({ next }),
    });
    assert.equal(result.props.destination, '/welcome');
  }
  await save({ zipCode: '02108' });
  await assert.rejects(
    zipPage.default({
      searchParams: Promise.resolve({ next: '/s?view=local' }),
    }),
    { message: 'NEXT_REDIRECT:/s?view=local' }
  );
});

test('ZIP setup requires sign-in and preserves the interrupted journey', async () => {
  session = null;
  const callback = `/welcome/zip?next=${encodeURIComponent('/s?view=local')}`;
  await assert.rejects(
    zipPage.default({
      searchParams: Promise.resolve({ next: '/s?view=local' }),
    }),
    {
      message: `NEXT_REDIRECT:/signin?callbackUrl=${encodeURIComponent(callback)}`,
    }
  );
});

test('only the authenticated member can read their account ZIP; public author responses omit it', async () => {
  await save({ zipCode: '02108' });
  const response = await me.GET();
  assert.equal((await response.json()).data.zipCode, '02108');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  session = null;
  assert.equal((await me.GET()).status, 401);
  const publicResponse = await author.GET(
    new NextRequest(`https://pana.test/api/user/author/${userId}`),
    { params: Promise.resolve({ id: userId }) }
  );
  assert.deepEqual(await publicResponse.json(), {
    screenname: 'existing-member',
    verified: false,
  });
});
