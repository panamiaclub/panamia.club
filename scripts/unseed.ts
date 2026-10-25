#!/usr/bin/env npx tsx
/**
 * Unseed
 *
 * Removes every row the seed scripts wrote, and nothing else.
 *
 * WHY THIS FILE EXISTS
 *
 * scripts/seed-dev-data.ts and scripts/seed-events.ts both refuse to touch a
 * remote database unless SEED_ALLOW_REMOTE=1, and the override exists because
 * there are legitimate reasons to want fixtures somewhere that is not
 * localhost — a demo on a pre-launch deployment being the obvious one.
 *
 * Until this file, taking that override was a one-way door. The only teardown
 * in the repo was scripts/reset-test-db.ts, which TRUNCATEs every table in the
 * database. That is the correct tool for CI and a catastrophic one anywhere
 * else, and its only guard is a substring check for "prod", "main" or "live"
 * in the connection string — which a Supabase pooler URL
 * (…@aws-0-us-east-1.pooler.supabase.com:5432/postgres) passes without
 * complaint. So the safe-looking option was the one that destroyed everything.
 *
 * This script is the missing half: seeding stays reversible, so demo fixtures
 * can be cleared out afterwards without taking real rows with them.
 *
 * HOW IT IDENTIFIES A SEEDED ROW
 *
 * Every id the seeders mint is prefixed `seed_` — seed_u_*, seed_p_*,
 * seed_biz_*, seed_venue_*, seed_ev_*, seed_att_*, seed_fol_*, seed_g_*,
 * seed_a_*. The match is `starts_with(id, 'seed_')` rather than
 * `id LIKE 'seed_%'` on purpose: in LIKE, `_` is a single-character wildcard,
 * so the pattern would also match a real id beginning "seedX". Nothing in the
 * database looks like that today, which is exactly why it would be a quiet
 * bug rather than a loud one.
 *
 * The one exception is actors. seed-dev-data.ts builds them through
 * createActorForProfile — the real production writer, deliberately, so the
 * fixture exercises the same code path — and that writer mints its own id
 * with no prefix. Those are matched by their profile instead.
 *
 * ORDER IS LOAD-BEARING, and it is dictated by the schema:
 *
 *   1. events        host_profile_id, host_group_id and venue_id are all
 *                    RESTRICT, so events block profiles, groups and venues.
 *                    Cascades event_attendees and event_dismissals.
 *   2. venues        operator_profile_id is RESTRICT, so venues block
 *                    profiles.
 *   3. social actors profile_id is SET NULL, not CASCADE — dropping profiles
 *                    first would leave actors behind with a null profile and
 *                    no prefix, which is to say unidentifiable. They have to
 *                    go first, while they can still be found. Cascades
 *                    social_follows, social_groups, social_group_members.
 *   4. users         cascades profiles, and profiles cascade profile_owners.
 *   5. profiles      the business rows (seed_biz_*) hang off no seeded user,
 *                    so step 4 does not reach them.
 *
 * Safe to re-run: every step is a delete by predicate, so a second run finds
 * nothing and reports zeroes.
 *
 * Usage:
 *   npx tsx scripts/unseed.ts              # dry run — counts only, no writes
 *   npx tsx scripts/unseed.ts --yes        # actually delete
 *   npx tsx scripts/unseed.ts --inventory  # inspect possible older fixtures
 *
 * Dry run is the default because the useful thing to do against an unfamiliar
 * database is to look first.
 */

import { config } from 'dotenv';
import type { SQLWrapper } from 'drizzle-orm';

config({ path: '.env.local' });

function line(label: string, value: string | number): void {
  console.log(`  ${label.padEnd(30)} ${value}`);
}

/**
 * Turn a foreign-key failure into something an operator can act on.
 *
 * This is the expected failure, not an exotic one. Every RESTRICT in the
 * schema exists to stop a seeded row being pulled out from under something
 * real — a pana who RSVPed to a demo event, or hosted at a seeded venue.
 * When that happens the teardown SHOULD stop. The raw Postgres error says so,
 * but buries it under a stack trace, so decode it instead.
 */
function reportBlocked(error: unknown): void {
  const cause = (error as { cause?: Record<string, string> })?.cause;
  const code = cause?.code;

  if (code === '23001' || code === '23503') {
    // detail reads: Key (id)=(seed_venue_libreria) is referenced from table "events".
    const key = cause?.detail?.match(/\(([^)]*)\)=\(([^)]*)\)/)?.[2];
    console.error(
      '\nStopped: a row that was not seeded still references one that was.'
    );
    if (key) line('seeded row', key);
    if (cause?.table_name) line('referenced from', cause.table_name);
    console.error(
      '\nNothing was deleted — the teardown runs in one transaction, so the\n' +
        'database is exactly as it was before this ran.\n\n' +
        'This is the schema protecting real data. Either repoint or remove the\n' +
        'referencing row, then run this again.'
    );
    return;
  }

  console.error('\nUnseed failed:', error);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--yes');

  const connectionString =
    process.env.POSTGRES_URL ?? process.env.POSTGRES_DIRECT_URL;
  if (!connectionString) {
    console.error('Error: POSTGRES_URL is required (check .env.local)');
    process.exit(1);
  }
  process.env.POSTGRES_URL = connectionString;

  const url = new URL(connectionString);
  const target = `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const allowRemote = process.env.SEED_ALLOW_REMOTE === '1';

  // Deleting is at least as consequential as seeding, so it takes the same
  // override rather than a softer one.
  if (!isLocal && !allowRemote) {
    console.error('Refusing to run: this only targets a local database.');
    console.error('Database:', target);
    console.error(
      'Set SEED_ALLOW_REMOTE=1 to override, but only for a database you own\n' +
        'and have seeded. This deletes rows.'
    );
    process.exit(1);
  }
  if (!isLocal) {
    console.warn('SEED_ALLOW_REMOTE=1 set — targeting a REMOTE database.');
    console.warn('Database:', target);
  }

  // Deferred for the same reason the seeders defer: modules under
  // lib/federation read NEXT_PUBLIC_HOST_URL and FEDERATION_DOMAIN at import
  // time, so importing before config() resolves them against the wrong
  // environment.
  const [{ db }, schema] = await Promise.all([
    import('../lib/db'),
    import('../lib/schema'),
  ]);
  const { sql, or, count } = await import('drizzle-orm');

  if (process.argv.includes('--inventory')) {
    const reservedEmail = (column: SQLWrapper) =>
      sql`${column} ~* '@([^@]*\\.)?(example\\.(com|org|net)|test|invalid)$'`;
    const fixtureUser = sql`(
      starts_with(u.id, 'seed_')
      OR u.id ~ '^(test|demo)[_-]'
      OR ${reservedEmail(sql`u.email`)}
    )`;

    console.log('UNSEED:inventory');
    console.log('Database:', target);
    console.log(
      'Read-only inventory. Emails and real account details are not logged.'
    );
    const totals = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM profiles) AS profiles,
        (SELECT count(*)::int FROM profiles WHERE active) AS active_profiles
    `);
    console.log('Totals:', JSON.stringify(totals));

    const candidateUsers = await db.execute(sql`
      SELECT u.id, u.screenname, u.account_type,
             ${reservedEmail(sql`u.email`)} AS reserved_email,
             starts_with(u.id, 'seed_') AS seeded_id
      FROM users u
      WHERE ${fixtureUser}
      ORDER BY u.id
    `);
    console.log('Candidate users:', JSON.stringify(candidateUsers));

    const candidateProfiles = await db.execute(sql`
      SELECT p.id, p.screenname, p.user_id, p.active,
             ${reservedEmail(sql`p.email`)} AS reserved_email,
             starts_with(p.id, 'seed_') AS seeded_id,
             p.status->>'source' AS source,
             (SELECT count(*)::int
              FROM profile_owners po JOIN users u ON u.id = po.user_id
              WHERE po.profile_id = p.id AND NOT ${fixtureUser})
               AS non_fixture_owners
      FROM profiles p
      WHERE starts_with(p.id, 'seed_')
         OR p.id ~ '^(test|demo)[_-]'
         OR ${reservedEmail(sql`p.email`)}
         OR p.screenname ~ '^pana[0-9]+$'
         OR p.gallery_images::text LIKE '%/img/directory/%'
      ORDER BY p.id
    `);
    console.log('Candidate profiles:', JSON.stringify(candidateProfiles));
    console.log('UNSEED:inventory:done');
    process.exit(0);
  }

  console.log(apply ? 'UNSEED:start' : 'UNSEED:dry-run');
  console.log('Database:', target, '\n');

  // starts_with, not LIKE 'seed\_%' — see the note above on `_` being a
  // single-character wildcard. Type-only import, so no runtime import escapes
  // ahead of config() above.
  const seeded = (column: SQLWrapper) => sql`starts_with(${column}, 'seed_')`;

  const steps = [
    {
      label: 'events',
      table: schema.events,
      where: seeded(schema.events.id),
      note: 'cascades event_attendees, event_dismissals',
    },
    {
      label: 'venues',
      table: schema.venues,
      where: seeded(schema.venues.id),
      note: 'before profiles — operator_profile_id is RESTRICT',
    },
    {
      label: 'social actors',
      table: schema.socialActors,
      where: or(
        seeded(schema.socialActors.id),
        seeded(schema.socialActors.profileId)
      ),
      note: 'cascades social_follows, social_groups, social_group_members',
    },
    {
      label: 'users',
      table: schema.users,
      where: seeded(schema.users.id),
      note: 'cascades profiles, profile_owners',
    },
    {
      label: 'profiles',
      table: schema.profiles,
      where: seeded(schema.profiles.id),
      note: 'business rows that hang off no seeded user',
    },
  ] as const;

  let total = 0;
  // Step results are buffered rather than printed as they happen. Printing
  // live reads as a lie when the transaction later rolls back: the first run
  // of this said "events 28 deleted" and then "Nothing was deleted" four
  // lines further down, both of which were true and which together told the
  // operator nothing they could act on.
  const report: Array<[string, string, string]> = [];

  // One transaction for the whole teardown. The first run of this script was
  // not transactional, and a RESTRICT violation on step 2 left step 1 already
  // committed — seeded events gone, everything else still there. A teardown
  // that can strand the database halfway is worse than no teardown, because
  // the operator now has to work out what survived.
  async function run(tx: typeof db): Promise<void> {
    for (const step of steps) {
      if (apply) {
        const deleted = await tx
          .delete(step.table)
          .where(step.where)
          .returning({ id: sql<string>`1` });
        total += deleted.length;
        report.push([step.label, `${deleted.length} deleted`, step.note]);
      } else {
        const [row] = await tx
          .select({ n: count() })
          .from(step.table)
          .where(step.where);
        const n = row?.n ?? 0;
        total += n;
        report.push([step.label, `${n} would be deleted`, step.note]);
      }
    }
  }

  try {
    if (apply) {
      await db.transaction(async (tx) => {
        await run(tx as unknown as typeof db);
      });
    } else {
      await run(db);
    }
  } catch (error) {
    reportBlocked(error);
    process.exit(1);
  }

  for (const [label, value, note] of report) {
    line(label, value);
    console.log(`  ${''.padEnd(30)} ${note}`);
  }

  console.log('');
  line('total rows', total);

  if (!apply) {
    console.log(
      '\nDry run — nothing was written. Re-run with --yes to delete.\n' +
        'Counts exclude rows removed by cascade, so the real total is higher.'
    );
  } else {
    console.log('\nUNSEED:done');
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Unseed failed:', error);
  process.exit(1);
});
