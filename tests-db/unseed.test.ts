import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/lib/schema';

const pg = new PGlite();
const db = drizzle(pg, { schema });

mock.module(import.meta.resolve('../lib/db.ts'), {
  namedExports: { db },
});

const { unseed } = await import('../scripts/unseed');

const tables = [
  'users',
  'profiles',
  'profile_owners',
  'social_actors',
  'social_groups',
  'social_statuses',
  'social_follows',
  'venues',
  'events',
  'accounts',
  'sessions',
] as const;

async function snapshot() {
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    rows[table] = (await pg.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
  }
  return rows;
}

before(async () => {
  // These isolated tables retain the production FKs that determine teardown order.
  await pg.exec(`
    CREATE TABLE users (id text PRIMARY KEY, email text UNIQUE NOT NULL);
    CREATE TABLE profiles (
      id text PRIMARY KEY,
      user_id text UNIQUE REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE profile_owners (
      id text PRIMARY KEY,
      profile_id text REFERENCES profiles(id) ON DELETE CASCADE,
      user_id text REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE social_actors (
      id text PRIMARY KEY,
      profile_id text REFERENCES profiles(id) ON DELETE SET NULL
    );
    CREATE TABLE social_groups (
      id text PRIMARY KEY,
      actor_id text REFERENCES social_actors(id) ON DELETE CASCADE
    );
    CREATE TABLE social_statuses (
      id text PRIMARY KEY,
      actor_id text REFERENCES social_actors(id) ON DELETE CASCADE
    );
    CREATE TABLE social_follows (
      id text PRIMARY KEY,
      actor_id text REFERENCES social_actors(id) ON DELETE CASCADE,
      target_actor_id text REFERENCES social_actors(id) ON DELETE CASCADE
    );
    CREATE TABLE venues (
      id text PRIMARY KEY,
      operator_profile_id text REFERENCES profiles(id) ON DELETE RESTRICT
    );
    CREATE TABLE events (
      id text PRIMARY KEY,
      host_profile_id text REFERENCES profiles(id) ON DELETE RESTRICT,
      host_group_id text REFERENCES social_groups(id) ON DELETE RESTRICT,
      venue_id text REFERENCES venues(id) ON DELETE RESTRICT
    );
    CREATE TABLE accounts (
      id text PRIMARY KEY,
      user_id text REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE sessions (
      id text PRIMARY KEY,
      user_id text REFERENCES users(id) ON DELETE CASCADE
    );
  `);
});

beforeEach(async () => {
  await pg.exec(`
    TRUNCATE users, profiles, profile_owners, social_actors, social_groups,
      social_statuses, social_follows, venues, events, accounts, sessions CASCADE;
    INSERT INTO users VALUES
      ('seed_u_1', 'pana1@example.test'),
      ('seeduser_old-cafe', 'old-cafe@business.invalid'),
      ('member', 'member@community.invalid'),
      ('seedXreal', 'customer@example.test');
    INSERT INTO profiles VALUES
      ('unprefixed_person', 'seed_u_1'),
      ('seedprof_old-cafe', 'seeduser_old-cafe'),
      ('seed_biz_unclaimed', NULL),
      ('member_profile', 'member'),
      ('seedXprofile', 'seedXreal');
    INSERT INTO profile_owners VALUES
      ('owner_test', 'unprefixed_person', 'seed_u_1'),
      ('owner_legacy', 'seedprof_old-cafe', 'seeduser_old-cafe'),
      ('owner_real', 'member_profile', 'member');
    INSERT INTO social_actors VALUES
      ('generated_test_actor', 'unprefixed_person'),
      ('generated_legacy_actor', 'seedprof_old-cafe'),
      ('seed_a_club', NULL),
      ('real_actor', 'member_profile'),
      ('literal_actor', 'seedXprofile');
    INSERT INTO social_groups VALUES ('seed_g_club', 'seed_a_club');
    INSERT INTO social_statuses VALUES
      ('test_post', 'generated_test_actor'),
      ('legacy_post', 'generated_legacy_actor'),
      ('real_post', 'real_actor');
    INSERT INTO social_follows VALUES
      ('test_follow', 'generated_test_actor', 'generated_legacy_actor'),
      ('real_follow', 'real_actor', 'literal_actor');
    INSERT INTO venues VALUES
      ('seed_venue_cafe', 'seedprof_old-cafe'),
      ('real_venue', 'member_profile');
    INSERT INTO events VALUES
      ('seed_ev_cafe', 'seedprof_old-cafe', NULL, 'seed_venue_cafe'),
      ('seed_ev_club', NULL, 'seed_g_club', NULL),
      ('real_event', 'member_profile', NULL, 'real_venue');
    INSERT INTO accounts VALUES
      ('test_login', 'seed_u_1'), ('legacy_login', 'seeduser_old-cafe'),
      ('real_login', 'member');
    INSERT INTO sessions VALUES
      ('test_session', 'seed_u_1'), ('legacy_session', 'seeduser_old-cafe'),
      ('real_session', 'member');
  `);
});

after(async () => {
  await pg.close();
});

test('dry run counts current and legacy fixtures without changing any rows', async () => {
  const before = await snapshot();
  const report = await unseed();

  assert.deepEqual(
    report.map(({ label, count }) => [label, count]),
    [
      ['events', 2],
      ['venues', 1],
      ['social actors', 3],
      ['profiles', 3],
      ['users', 2],
    ]
  );
  assert.deepEqual(await snapshot(), before);
});

test('deletes fixtures, unprefixed actors and authentication data, preserving real rows', async () => {
  const before = await snapshot();
  const report = await unseed(true);

  assert.deepEqual(
    report.map(({ count }) => count),
    [2, 1, 3, 3, 2]
  );
  const remaining = await snapshot();
  assert.deepEqual(remaining.users, [
    { id: 'member', email: 'member@community.invalid' },
    { id: 'seedXreal', email: 'customer@example.test' },
  ]);
  assert.deepEqual(remaining.profiles, [
    { id: 'member_profile', user_id: 'member' },
    { id: 'seedXprofile', user_id: 'seedXreal' },
  ]);
  assert.deepEqual(remaining.social_groups, []);
  assert.deepEqual(remaining.social_actors, [
    { id: 'literal_actor', profile_id: 'seedXprofile' },
    { id: 'real_actor', profile_id: 'member_profile' },
  ]);
  for (const [table, id] of [
    ['profile_owners', 'owner_real'],
    ['social_statuses', 'real_post'],
    ['social_follows', 'real_follow'],
    ['venues', 'real_venue'],
    ['events', 'real_event'],
    ['accounts', 'real_login'],
    ['sessions', 'real_session'],
  ] as const) {
    assert.deepEqual(
      remaining[table],
      before[table].filter(
        (row) =>
          typeof row === 'object' &&
          row !== null &&
          'id' in row &&
          row.id === id
      )
    );
  }
});

test('a second cleanup is a no-op', async () => {
  await unseed(true);
  const before = await snapshot();
  const report = await unseed(true);
  assert.ok(report.every(({ count }) => count === 0));
  assert.deepEqual(await snapshot(), before);
});

test('does not broaden exact namespace prefixes or delete by email', async () => {
  await pg.exec(`
    INSERT INTO users VALUES ('seeduserX-real', 'pana2@example.test');
    INSERT INTO profiles VALUES ('seedprofX-real', 'seeduserX-real');
  `);
  await unseed(true);
  const remaining = await pg.query(
    "SELECT id FROM users WHERE id = 'seeduserX-real'"
  );
  assert.equal(remaining.rows.length, 1);
  assert.equal(
    (await pg.query("SELECT id FROM profiles WHERE id = 'seedprofX-real'")).rows
      .length,
    1
  );
});

test('refuses to delete a seeded listing claimed by a real account', async () => {
  await pg.exec(`
    INSERT INTO profile_owners VALUES ('claimed', 'seedprof_old-cafe', 'member');
  `);
  const before = await snapshot();
  await assert.rejects(
    unseed(true),
    /fixture profile.*belong to real accounts/
  );
  assert.deepEqual(await snapshot(), before);
});

test('refuses to delete a seeded profile attached directly to a real user', async () => {
  await pg.exec(`
    INSERT INTO users VALUES ('new_member', 'new@community.invalid');
    UPDATE profiles SET user_id = 'new_member' WHERE id = 'seedprof_old-cafe';
  `);
  const before = await snapshot();
  await assert.rejects(
    unseed(true),
    /fixture profile.*belong to real accounts/
  );
  assert.deepEqual(await snapshot(), before);
});

test('requires transfer when a test account administers a real listing', async () => {
  await pg.exec(`
    INSERT INTO profile_owners VALUES ('shared', 'member_profile', 'seed_u_1');
  `);
  const before = await snapshot();
  await assert.rejects(unseed(true), /test account administers a real listing/);
  assert.deepEqual(await snapshot(), before);
});

test('protects real profiles attached to a seeded actor id', async () => {
  await pg.exec(`
    DELETE FROM social_follows WHERE target_actor_id = 'literal_actor';
    UPDATE social_actors SET id = 'seed_actor_reused' WHERE id = 'literal_actor';
  `);
  const before = await snapshot();
  await assert.rejects(
    unseed(true),
    /seeded actor is attached to a real profile/
  );
  assert.deepEqual(await snapshot(), before);
});

test('rolls back earlier deletes when a real event references a seeded venue', async () => {
  await pg.exec(`
    UPDATE events SET venue_id = 'seed_venue_cafe' WHERE id = 'real_event';
  `);
  const before = await snapshot();
  await assert.rejects(
    unseed(true),
    (error: unknown) =>
      error instanceof Error &&
      error.cause instanceof Error &&
      /foreign key constraint/.test(error.cause.message)
  );
  assert.deepEqual(await snapshot(), before);
});

test('rolls back earlier deletes when a real event references a seeded host', async () => {
  await pg.exec(`
    UPDATE events SET host_profile_id = 'seedprof_old-cafe' WHERE id = 'real_event';
  `);
  const before = await snapshot();
  await assert.rejects(
    unseed(true),
    (error: unknown) =>
      error instanceof Error &&
      error.cause instanceof Error &&
      /foreign key constraint/.test(error.cause.message)
  );
  assert.deepEqual(await snapshot(), before);
});
