import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  'social_group_members',
  'social_statuses',
  'social_follows',
  'social_likes',
  'venues',
  'events',
  'event_attendees',
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
      actor_id text REFERENCES social_actors(id) ON DELETE CASCADE,
      member_count integer NOT NULL DEFAULT 0,
      created_by_profile_id text REFERENCES profiles(id) ON DELETE SET NULL
    );
    CREATE TABLE social_group_members (
      id text PRIMARY KEY,
      group_id text REFERENCES social_groups(id) ON DELETE CASCADE,
      actor_id text REFERENCES social_actors(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'member',
      status text NOT NULL DEFAULT 'active'
    );
    CREATE TABLE social_statuses (
      id text PRIMARY KEY,
      actor_id text REFERENCES social_actors(id) ON DELETE CASCADE,
      group_id text REFERENCES social_groups(id) ON DELETE CASCADE,
      in_reply_to_id text REFERENCES social_statuses(id) ON DELETE SET NULL
    );
    CREATE TABLE social_follows (
      id text PRIMARY KEY,
      actor_id text REFERENCES social_actors(id) ON DELETE CASCADE,
      target_actor_id text REFERENCES social_actors(id) ON DELETE CASCADE
    );
    CREATE TABLE social_likes (
      id text PRIMARY KEY,
      actor_id text REFERENCES social_actors(id) ON DELETE CASCADE,
      status_id text REFERENCES social_statuses(id) ON DELETE CASCADE
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
    CREATE TABLE event_attendees (
      id text PRIMARY KEY,
      event_id text REFERENCES events(id) ON DELETE CASCADE,
      profile_id text REFERENCES profiles(id) ON DELETE CASCADE,
      status text NOT NULL,
      email_verified_at timestamptz
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
    TRUNCATE users, profiles, profile_owners, social_actors, social_groups, social_group_members,
      social_statuses, social_follows, social_likes, venues, events, event_attendees,
      accounts, sessions CASCADE;
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
    INSERT INTO social_groups (id, actor_id) VALUES ('seed_g_club', 'seed_a_club');
    INSERT INTO social_statuses (id, actor_id) VALUES
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
  await addRetainedGroup();
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

async function addRetainedGroup() {
  await pg.exec(`
    INSERT INTO social_actors VALUES ('real_group_actor', NULL);
    INSERT INTO social_groups (id, actor_id, member_count, created_by_profile_id)
      VALUES ('real_group', 'real_group_actor', 3, 'member_profile');
    INSERT INTO social_group_members VALUES
      ('real_admin', 'real_group', 'real_actor', 'admin', 'active'),
      ('test_member', 'real_group', 'generated_test_actor', 'member', 'active'),
      ('legacy_member', 'real_group', 'generated_legacy_actor', 'member', 'active'),
      ('pending_member', 'real_group', 'seed_a_club', 'member', 'pending');
  `);
}

test('preserves real groups and corrects their active member counts', async () => {
  await addRetainedGroup();
  await unseed(true);
  assert.deepEqual(
    (
      await pg.query(
        "SELECT member_count FROM social_groups WHERE id = 'real_group'"
      )
    ).rows,
    [{ member_count: 1 }]
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT id FROM social_group_members WHERE group_id = 'real_group'"
      )
    ).rows,
    [{ id: 'real_admin' }]
  );
});

test('dry run does not change retained group counts or membership', async () => {
  await addRetainedGroup();
  const before = await snapshot();
  await unseed();
  assert.deepEqual(await snapshot(), before);
});

test('protects the last active administrator of a retained group', async () => {
  await addRetainedGroup();
  await pg.exec(`
    UPDATE social_group_members SET role = 'member' WHERE id = 'real_admin';
    UPDATE social_group_members SET role = 'admin' WHERE id = 'test_member';
  `);
  const before = await snapshot();
  await assert.rejects(unseed(true), /last active administrator/);
  assert.deepEqual(await snapshot(), before);
});

for (const [label, insert] of [
  [
    'follow',
    "INSERT INTO social_follows VALUES ('cross_follow', 'generated_test_actor', 'real_actor')",
  ],
  [
    'like',
    "INSERT INTO social_likes VALUES ('cross_like', 'generated_test_actor', 'real_post')",
  ],
  [
    'RSVP',
    "INSERT INTO event_attendees VALUES ('cross_rsvp', 'real_event', 'unprefixed_person', 'going', now())",
  ],
] as const) {
  test(`blocks a cross-fixture ${label} rather than leaving real counters stale`, async () => {
    await pg.exec(insert);
    const before = await snapshot();
    await assert.rejects(unseed(true), /Reconcile those counters/);
    assert.deepEqual(await snapshot(), before);
  });
}

const demoGroupFingerprint = createHash('md5')
  .update('demo_group')
  .digest('hex');

test('per-group approval removes real memberships without deleting their accounts or profiles', async () => {
  await addDemoGroup();
  await pg.exec(`
    INSERT INTO social_group_members VALUES
      ('real_member', 'demo_group', 'real_actor', 'member', 'active');
  `);
  const before = await snapshot();
  await unseed(true, {
    includeDemoGroups: true,
    approvedGroupFingerprint: demoGroupFingerprint,
  });
  const remaining = await snapshot();
  assert.deepEqual(remaining.social_groups, []);
  assert.deepEqual(remaining.social_group_members, []);
  for (const table of ['users', 'profiles', 'social_actors'] as const) {
    const id = {
      users: 'member',
      profiles: 'member_profile',
      social_actors: 'real_actor',
    }[table];
    const realRow = (row: unknown) =>
      typeof row === 'object' && row !== null && 'id' in row && row.id === id;
    assert.deepEqual(
      remaining[table].filter(realRow),
      before[table].filter(realRow)
    );
  }
});

test('approval for a different group does not bypass real-membership protection', async () => {
  await addDemoGroup();
  await pg.exec(`
    INSERT INTO social_group_members VALUES
      ('real_member', 'demo_group', 'real_actor', 'member', 'active');
  `);
  const before = await snapshot();
  await assert.rejects(
    unseed(true, {
      includeDemoGroups: true,
      approvedGroupFingerprint: createHash('md5')
        .update('other_group')
        .digest('hex'),
    }),
    /last active administrator/
  );
  assert.deepEqual(await snapshot(), before);
});

test('membership approval never permits deleting real group content', async () => {
  await addDemoGroup();
  await pg.exec(`
    INSERT INTO social_statuses (id, actor_id, group_id)
      VALUES ('real_group_post', 'real_actor', 'demo_group');
  `);
  const before = await snapshot();
  await assert.rejects(
    unseed(true, {
      includeDemoGroups: true,
      approvedGroupFingerprint: demoGroupFingerprint,
    }),
    /last active administrator/
  );
  assert.deepEqual(await snapshot(), before);
});

test('group approval rejects malformed fingerprints and missing opt-in', async () => {
  await assert.rejects(
    unseed(true, {
      includeDemoGroups: true,
      approvedGroupFingerprint: 'not-a-hash',
    }),
    /32-character MD5/
  );
  await assert.rejects(
    unseed(true, { approvedGroupFingerprint: demoGroupFingerprint }),
    /requires --include-demo-groups/
  );
});

async function addDemoGroup() {
  await pg.exec(`
    INSERT INTO social_actors VALUES ('demo_group_actor', NULL);
    INSERT INTO social_groups (id, actor_id, member_count, created_by_profile_id)
      VALUES ('demo_group', 'demo_group_actor', 2, 'unprefixed_person');
    INSERT INTO social_group_members VALUES
      ('demo_admin', 'demo_group', 'generated_test_actor', 'admin', 'active'),
      ('demo_member', 'demo_group', 'generated_legacy_actor', 'member', 'active');
    INSERT INTO social_statuses (id, actor_id, group_id)
      VALUES ('demo_post', 'generated_test_actor', 'demo_group');
  `);
}

test('demo-only group deletion requires explicit opt-in', async () => {
  await addDemoGroup();
  const before = await snapshot();
  await assert.rejects(unseed(true), /last active administrator/);
  assert.deepEqual(await snapshot(), before);
});

test('opt-in removes demo-only groups, their posts and their unprefixed actors', async () => {
  await addDemoGroup();
  const report = await unseed(true, { includeDemoGroups: true });
  assert.equal(report.find(({ label }) => label === 'demo groups')?.count, 1);
  const remaining = await snapshot();
  assert.deepEqual(remaining.social_groups, []);
  assert.deepEqual(remaining.social_group_members, []);
  assert.ok(
    !remaining.social_actors.some(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        'id' in row &&
        row.id === 'demo_group_actor'
    )
  );
  assert.deepEqual(remaining.social_statuses, [
    {
      id: 'real_post',
      actor_id: 'real_actor',
      group_id: null,
      in_reply_to_id: null,
    },
  ]);
  assert.ok(
    (await unseed(true, { includeDemoGroups: true })).every(
      ({ count }) => count === 0
    )
  );
});

test('demo-group dry run reports groups without writing', async () => {
  await addDemoGroup();
  const before = await snapshot();
  const report = await unseed(false, { includeDemoGroups: true });
  assert.equal(report.find(({ label }) => label === 'demo groups')?.count, 1);
  assert.deepEqual(await snapshot(), before);
});

test('opt-in preserves fixture-created groups that have real members', async () => {
  await addRetainedGroup();
  await pg.exec(`
    UPDATE social_groups SET created_by_profile_id = 'unprefixed_person'
    WHERE id = 'real_group';
  `);
  await unseed(true, { includeDemoGroups: true });
  assert.deepEqual(
    (
      await pg.query(
        "SELECT member_count FROM social_groups WHERE id = 'real_group'"
      )
    ).rows,
    [{ member_count: 1 }]
  );
});

for (const [label, insert] of [
  [
    'a real creator',
    "UPDATE social_groups SET created_by_profile_id = 'member_profile' WHERE id = 'demo_group'",
  ],
  [
    'a pending real member',
    "INSERT INTO social_group_members VALUES ('real_pending', 'demo_group', 'real_actor', 'member', 'pending')",
  ],
  [
    'a real post',
    "INSERT INTO social_statuses (id, actor_id, group_id) VALUES ('real_group_post', 'real_actor', 'demo_group')",
  ],
  [
    'a real reply outside the group',
    "INSERT INTO social_statuses (id, actor_id, in_reply_to_id) VALUES ('real_reply', 'real_actor', 'demo_post')",
  ],
  [
    'a real like',
    "INSERT INTO social_likes VALUES ('real_group_like', 'real_actor', 'demo_post')",
  ],
  [
    'a real event',
    "UPDATE events SET host_profile_id = NULL, host_group_id = 'demo_group' WHERE id = 'real_event'",
  ],
] as const) {
  test(`opt-in refuses to remove a group with ${label}`, async () => {
    await addDemoGroup();
    await pg.exec(insert);
    const before = await snapshot();
    await assert.rejects(
      unseed(true, { includeDemoGroups: true }),
      /last active administrator/
    );
    assert.deepEqual(await snapshot(), before);
  });
}
