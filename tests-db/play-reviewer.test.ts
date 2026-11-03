import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { verifyPassword } from 'better-auth/crypto';
import * as schema from '@/lib/schema';
import {
  PLAY_REVIEW_EMAIL,
  PLAY_REVIEW_NAME,
  PLAY_REVIEW_SCREENNAME,
} from '@/lib/play-reviewer';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const originalAdminEmails = process.env.ADMIN_EMAILS;
const password = 'reviewer-test-password-not-for-production-2026';
const replacement = 'replacement-test-password-not-for-production-2026';
const tables = [
  schema.users,
  schema.profiles,
  schema.accounts,
  schema.sessions,
  schema.socialActors,
  schema.socialGroups,
  schema.screennameHistory,
];

mock.module(import.meta.resolve('../lib/db.ts'), {
  exports: { db },
});
const { provisionPlayReviewer } = await import('../lib/server/play-reviewer');

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
  await pg.exec(
    'CREATE UNIQUE INDEX accounts_provider_account_unique ON accounts (provider_id, account_id)'
  );
});

beforeEach(async () => {
  delete process.env.ADMIN_EMAILS;
  for (const table of [...tables].reverse()) await db.delete(table);
});

after(async () => {
  if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = originalAdminEmails;
  await pg.close();
  mock.restoreAll();
});

test('creates only a hashed, verified-email, non-staff demonstration account', async () => {
  const result = await provisionPlayReviewer(password);
  assert.equal(result.created, true);
  const user = await db.query.users.findFirst();
  const profile = await db.query.profiles.findFirst();
  const account = await db.query.accounts.findFirst();
  assert.ok(user && profile && account);
  assert.equal(user.email, PLAY_REVIEW_EMAIL);
  assert.equal(user.emailVerified, true);
  assert.equal(user.screenname, PLAY_REVIEW_SCREENNAME);
  assert.equal(user.name, PLAY_REVIEW_NAME);
  assert.equal(user.accountType, 'personal');
  assert.equal(profile.userId, user.id);
  assert.equal(profile.active, false);
  assert.equal(profile.ghlOptedOut, true);
  assert.deepEqual(profile.roles, {});
  assert.deepEqual(profile.verification, {});
  assert.equal(account.userId, user.id);
  assert.equal(account.accountId, user.id);
  assert.equal(account.providerId, 'credential');
  assert.ok(account.password && account.password !== password);
  assert.ok(await verifyPassword({ hash: account.password, password }));
  assert.equal((await db.select().from(schema.users)).length, 1);
});

test('rejects unsafe passwords and a founder-email collision before any write', async () => {
  for (const invalid of ['', 'short', 'x'.repeat(129), `${password}\n`]) {
    await assert.rejects(provisionPlayReviewer(invalid), /32-128/);
  }
  process.env.ADMIN_EMAILS = PLAY_REVIEW_EMAIL.toUpperCase();
  await assert.rejects(provisionPlayReviewer(password), /ADMIN_EMAILS/);
  assert.equal((await db.select().from(schema.users)).length, 0);
});

test('does not silently replace an existing password', async () => {
  await provisionPlayReviewer(password);
  const original = await db.query.accounts.findFirst();
  await assert.rejects(
    provisionPlayReviewer(replacement),
    /explicitly request/
  );
  assert.equal(
    (await db.query.accounts.findFirst())?.password,
    original?.password
  );
});

test('explicit rotation preserves identity and account locks while revoking sessions', async () => {
  const { userId } = await provisionPlayReviewer(password);
  const lockedAt = new Date('2026-11-03T12:00:00Z');
  await db
    .update(schema.users)
    .set({ lockedAt })
    .where(eq(schema.users.id, userId));
  await db.insert(schema.sessions).values({
    userId,
    token: 'test-review-session',
    expiresAt: new Date('2027-01-01T00:00:00Z'),
  });
  assert.deepEqual(await provisionPlayReviewer(replacement, true), {
    created: false,
    userId,
  });
  const account = await db.query.accounts.findFirst();
  assert.ok(account?.password);
  assert.ok(
    await verifyPassword({ hash: account.password, password: replacement })
  );
  assert.equal(
    await verifyPassword({ hash: account.password, password }),
    false
  );
  assert.equal((await db.select().from(schema.sessions)).length, 0);
  assert.equal(
    (await db.query.users.findFirst())?.lockedAt?.getTime(),
    lockedAt.getTime()
  );
});

test('rotation refuses an ordinary, privileged, or externally linked account', async () => {
  const { userId } = await provisionPlayReviewer(password);
  const original = (await db.query.accounts.findFirst())?.password;
  await db.update(schema.profiles).set({ roles: { admin: true } });
  await assert.rejects(
    provisionPlayReviewer(replacement, true),
    /refusing changes/
  );
  await db.update(schema.profiles).set({ roles: {} });
  await db.update(schema.users).set({ name: 'An actual member' });
  await assert.rejects(
    provisionPlayReviewer(replacement, true),
    /refusing changes/
  );
  await db.update(schema.users).set({ name: PLAY_REVIEW_NAME });
  await db.insert(schema.accounts).values({
    userId,
    accountId: 'external-google-identity',
    providerId: 'google',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await assert.rejects(
    provisionPlayReviewer(replacement, true),
    /refusing changes/
  );
  assert.equal(
    (
      await db.query.accounts.findFirst({
        where: eq(schema.accounts.providerId, 'credential'),
      })
    )?.password,
    original
  );
});

test('does not take an existing identity or a case-insensitive email match', async () => {
  await db.insert(schema.users).values({
    email: PLAY_REVIEW_EMAIL.toUpperCase(),
    name: 'A different account',
  });
  await assert.rejects(provisionPlayReviewer(password), /already exists/);
  await assert.rejects(
    provisionPlayReviewer(password, true),
    /refusing changes/
  );
  assert.equal((await db.select().from(schema.profiles)).length, 0);
  assert.equal((await db.select().from(schema.accounts)).length, 0);
});

test('refuses a directory or historical handle collision without changing its owner', async () => {
  await db.insert(schema.profiles).values({
    name: 'Existing business',
    email: 'business@example.invalid',
    screenname: PLAY_REVIEW_SCREENNAME.toUpperCase(),
  });
  await assert.rejects(provisionPlayReviewer(password), /already in use/);
  assert.equal((await db.select().from(schema.users)).length, 0);
  await db.delete(schema.profiles);
  await db.insert(schema.screennameHistory).values({
    userId: 'deleted-member',
    screenname: PLAY_REVIEW_SCREENNAME,
  });
  await assert.rejects(provisionPlayReviewer(password), /already in use/);
  assert.equal((await db.select().from(schema.accounts)).length, 0);
});

test('rotation cannot accidentally create a new account', async () => {
  await assert.rejects(provisionPlayReviewer(password, true), /does not exist/);
  assert.equal((await db.select().from(schema.users)).length, 0);
});
