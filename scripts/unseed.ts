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
 * Current fixtures use `seed_`. The older 100-business fixture uses
 * `seeduser_` for users and `seedprof_` for profiles. Only those exact
 * namespaces are removed; names and email addresses are never delete criteria.
 * The match is `starts_with(id, 'seed_')` rather than
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
 *   4. profiles      includes identity profiles attached to seeded users,
 *                    even if the profile itself has an unprefixed id.
 *                    Cascades profile_owners.
 *   5. users         cascades authentication accounts and sessions.
 *
 * Safe to re-run: every step is a delete by predicate, so a second run finds
 * nothing and reports zeroes.
 *
 * Usage:
 *   npx tsx scripts/unseed.ts              # dry run — counts only, no writes
 *   npx tsx scripts/unseed.ts --yes        # actually delete
 *   npx tsx scripts/unseed.ts --inventory  # inspect possible older fixtures
 *   npx tsx scripts/unseed.ts --yes --include-demo-groups
 *                                         # also remove wholly fixture-owned groups
 *
 * Dry run is the default because the useful thing to do against an unfamiliar
 * database is to look first.
 */

import { config } from 'dotenv';
import { count, eq, inArray, or, sql, type SQLWrapper } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';

config({ path: '.env.local', quiet: true });

const seeded = (column: SQLWrapper) => sql`starts_with(${column}, 'seed_')`;
const seededUser = (column: SQLWrapper) =>
  sql`(${seeded(column)} OR starts_with(${column}, 'seeduser_'))`;
const seededProfile = (column: SQLWrapper) =>
  sql`(${seeded(column)} OR starts_with(${column}, 'seedprof_'))`;
const fixtureProfile = (id: SQLWrapper, userId: SQLWrapper) =>
  sql`COALESCE(${seededProfile(id)} OR ${seededUser(userId)}, false)`;

export interface UnseedStepResult {
  label: string;
  count: number;
  note: string;
}

function line(label: string, value: string | number): void {
  console.log(`  ${label.padEnd(30)} ${value}`);
}

/**
 * Turn a foreign-key failure into something an operator can act on.
 *
 * This is the expected failure, not an exotic one. Every RESTRICT in the
 * schema exists to stop a seeded row being pulled out from under something
 * real — an event hosted by a seeded profile or held at a seeded venue.
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

export async function unseed(
  apply = false,
  options: {
    includeDemoGroups?: boolean;
    includeDemoEvents?: boolean;
    approvedGroupFingerprint?: string;
  } = {}
): Promise<UnseedStepResult[]> {
  if (
    options.approvedGroupFingerprint !== undefined &&
    !/^[a-f0-9]{32}$/.test(options.approvedGroupFingerprint)
  ) {
    throw new Error(
      'An approved group fingerprint must be a 32-character MD5 ID hash.'
    );
  }
  if (options.approvedGroupFingerprint && !options.includeDemoGroups) {
    throw new Error(
      'An approved group fingerprint requires --include-demo-groups.'
    );
  }
  const fixtureEvent = (column: SQLWrapper) =>
    options.includeDemoEvents
      ? sql`(${seeded(column)} OR starts_with(${column}, 'demo_ev_'))`
      : seeded(column);

  const [{ db }, schema] = await Promise.all([
    import('../lib/db'),
    import('../lib/schema'),
  ]);
  const profileWhere = fixtureProfile(
    schema.profiles.id,
    schema.profiles.userId
  );
  const profileIds = db
    .select({ id: schema.profiles.id })
    .from(schema.profiles)
    .where(profileWhere);
  const fixtureActorWhere = or(
    seeded(schema.socialActors.id),
    inArray(schema.socialActors.profileId, profileIds)
  );
  const fixtureActorIds = db
    .select({ id: schema.socialActors.id })
    .from(schema.socialActors)
    .where(fixtureActorWhere);

  // Buffer results until commit, so a rollback never prints successful deletes.
  return db.transaction(
    async (tx) => {
      const demoGroups = options.includeDemoGroups
        ? await tx
            .select({
              id: schema.socialGroups.id,
              actorId: schema.socialGroups.actorId,
            })
            .from(schema.socialGroups).where(sql`
              ${schema.socialGroups.createdByProfileId} IN (${profileIds})
              AND ${schema.socialGroups.actorId} NOT IN (${fixtureActorIds})
              AND EXISTS (
                SELECT 1 FROM social_actors a
                WHERE a.id = ${schema.socialGroups.actorId}
                  AND a.profile_id IS NULL
              )
              AND EXISTS (
                SELECT 1 FROM social_group_members m
                WHERE m.group_id = ${schema.socialGroups.id}
                  AND m.actor_id IN (${fixtureActorIds})
                  AND m.role = 'admin' AND m.status = 'active'
              )
              AND (
                NOT EXISTS (
                  SELECT 1 FROM social_group_members m
                  WHERE m.group_id = ${schema.socialGroups.id}
                    AND m.actor_id NOT IN (${fixtureActorIds})
                    AND m.actor_id <> ${schema.socialGroups.actorId}
                )
                OR md5(${schema.socialGroups.id}) = ${options.approvedGroupFingerprint ?? ''}
              )
              AND NOT EXISTS (
                SELECT 1 FROM social_statuses s
                WHERE s.group_id = ${schema.socialGroups.id}
                  AND s.actor_id NOT IN (${fixtureActorIds})
                  AND s.actor_id <> ${schema.socialGroups.actorId}
              )
              AND NOT EXISTS (
                SELECT 1 FROM social_statuses reply
                JOIN social_statuses parent ON parent.id = reply.in_reply_to_id
                WHERE parent.group_id = ${schema.socialGroups.id}
                  AND reply.actor_id NOT IN (${fixtureActorIds})
                  AND reply.actor_id <> ${schema.socialGroups.actorId}
              )
              AND NOT EXISTS (
                SELECT 1 FROM social_likes l
                JOIN social_statuses s ON s.id = l.status_id
                WHERE s.group_id = ${schema.socialGroups.id}
                  AND l.actor_id NOT IN (${fixtureActorIds})
                  AND l.actor_id <> ${schema.socialGroups.actorId}
              )
              AND NOT EXISTS (
                SELECT 1 FROM events e
                WHERE e.host_group_id = ${schema.socialGroups.id}
                  AND NOT ${fixtureEvent(sql`e.id`)}
              )
            `)
        : [];
      const actorWhere = or(
        fixtureActorWhere,
        inArray(
          schema.socialActors.id,
          demoGroups.map(({ actorId }) => actorId)
        )
      );
      const actorIds = tx
        .select({ id: schema.socialActors.id })
        .from(schema.socialActors)
        .where(actorWhere);
      const steps = [
        {
          label: 'events',
          table: schema.events,
          where: fixtureEvent(schema.events.id),
          note: 'cascades event_attendees, event_dismissals',
        },
        {
          label: 'venues',
          table: schema.venues,
          where: seeded(schema.venues.id),
          note: 'before profiles — operator_profile_id is RESTRICT',
        },
        ...(options.includeDemoGroups
          ? [
              {
                label: 'demo groups',
                table: schema.socialGroups,
                where: inArray(
                  schema.socialGroups.id,
                  demoGroups.map(({ id }) => id)
                ),
                note: 'fixture creator/content; real memberships require per-group approval',
              },
            ]
          : []),
        {
          label: 'social actors',
          table: schema.socialActors,
          where: actorWhere,
          note: 'cascades social_follows, social_groups, social_group_members',
        },
        {
          label: 'profiles',
          table: schema.profiles,
          where: profileWhere,
          note: 'current and legacy fixtures; cascades profile_owners',
        },
        {
          label: 'users',
          table: schema.users,
          where: seededUser(schema.users.id),
          note: 'current and legacy fixtures; cascades accounts, sessions',
        },
      ] as const;

      const protectedProfiles = await tx
        .select({ id: schema.profiles.id })
        .from(schema.profiles).where(sql`
          ${profileWhere}
          AND (
            (${schema.profiles.userId} IS NOT NULL
             AND NOT ${seededUser(schema.profiles.userId)})
            OR EXISTS (
              SELECT 1 FROM profile_owners po
              WHERE po.profile_id = ${schema.profiles.id}
                AND NOT ${seededUser(sql`po.user_id`)}
            )
          )
        `);
      if (protectedProfiles.length > 0) {
        throw new Error(
          `Stopped: ${protectedProfiles.length} fixture profile(s) belong to real accounts. Nothing was deleted.`
        );
      }

      const realListings = await tx
        .select({ id: schema.profileOwners.id })
        .from(schema.profileOwners)
        .innerJoin(
          schema.profiles,
          eq(schema.profiles.id, schema.profileOwners.profileId)
        )
        .where(
          sql`${seededUser(schema.profileOwners.userId)} AND NOT ${profileWhere}`
        );
      if (realListings.length > 0) {
        throw new Error(
          'Stopped: a test account administers a real listing. Transfer ownership first. Nothing was deleted.'
        );
      }

      const realActorProfiles = await tx
        .select({ id: schema.socialActors.id })
        .from(schema.socialActors)
        .innerJoin(
          schema.profiles,
          eq(schema.profiles.id, schema.socialActors.profileId)
        )
        .where(sql`${actorWhere} AND NOT ${profileWhere}`);
      if (realActorProfiles.length > 0) {
        throw new Error(
          'Stopped: a seeded actor is attached to a real profile. Nothing was deleted.'
        );
      }

      const orphanedGroups = await tx
        .select({ id: schema.socialGroups.id })
        .from(schema.socialGroups).where(sql`
          ${schema.socialGroups.actorId} NOT IN (${actorIds})
          AND EXISTS (
            SELECT 1 FROM social_group_members m
            WHERE m.group_id = ${schema.socialGroups.id}
              AND m.status = 'active' AND m.role = 'admin'
              AND m.actor_id IN (${actorIds})
          )
          AND NOT EXISTS (
            SELECT 1 FROM social_group_members m
            WHERE m.group_id = ${schema.socialGroups.id}
              AND m.status = 'active' AND m.role = 'admin'
              AND m.actor_id NOT IN (${actorIds})
          )
        `);
      if (orphanedGroups.length > 0) {
        throw new Error(
          `Stopped: ${orphanedGroups.length} retained group(s) would lose their last active administrator. Transfer administration first. Nothing was deleted.`
        );
      }

      const externalFollows = await tx
        .select({ id: schema.socialFollows.id })
        .from(schema.socialFollows)
        .where(
          sql`
          (${schema.socialFollows.actorId} IN (${actorIds}))
          <> (${schema.socialFollows.targetActorId} IN (${actorIds}))
        `
        )
        .limit(1);
      const externalLikes = await tx
        .select({ id: schema.socialLikes.id })
        .from(schema.socialLikes)
        .innerJoin(
          schema.socialStatuses,
          eq(schema.socialStatuses.id, schema.socialLikes.statusId)
        )
        .where(
          sql`
          ${schema.socialLikes.actorId} IN (${actorIds})
          AND ${schema.socialStatuses.actorId} NOT IN (${actorIds})
        `
        )
        .limit(1);
      const externalRsvps = await tx
        .select({ id: schema.eventAttendees.id })
        .from(schema.eventAttendees)
        .where(
          sql`
          ${schema.eventAttendees.profileId} IN (${profileIds})
          AND NOT ${fixtureEvent(schema.eventAttendees.eventId)}
          AND ${schema.eventAttendees.status} = 'going'
          AND ${schema.eventAttendees.emailVerifiedAt} IS NOT NULL
        `
        )
        .limit(1);
      if (
        externalFollows.length ||
        externalLikes.length ||
        externalRsvps.length
      ) {
        throw new Error(
          'Stopped: test accounts have follows, likes or verified RSVPs involving real data. Reconcile those counters before cleanup. Nothing was deleted.'
        );
      }

      if (apply) {
        await tx.execute(sql`
          UPDATE social_groups g
          SET member_count = GREATEST(g.member_count - (
            SELECT count(*)::int FROM social_group_members m
            WHERE m.group_id = g.id AND m.status = 'active'
              AND m.actor_id IN (${actorIds})
          ), 0)
          WHERE g.actor_id NOT IN (${actorIds})
            AND EXISTS (
              SELECT 1 FROM social_group_members m
              WHERE m.group_id = g.id AND m.status = 'active'
                AND m.actor_id IN (${actorIds})
            )
        `);
      }

      const report: UnseedStepResult[] = [];
      for (const step of steps) {
        if (apply) {
          const deleted = await tx
            .delete(step.table)
            .where(step.where)
            .returning({ id: sql<string>`1` });
          report.push({
            label: step.label,
            count: deleted.length,
            note: step.note,
          });
        } else {
          const [row] = await tx
            .select({ n: count() })
            .from(step.table)
            .where(step.where);
          report.push({ label: step.label, count: row.n, note: step.note });
        }
      }
      return report;
    },
    { accessMode: apply ? 'read write' : 'read only' }
  );
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--yes');
  const connectionString =
    process.env.POSTGRES_URL ?? process.env.POSTGRES_DIRECT_URL;
  if (!connectionString) {
    throw new Error('POSTGRES_URL is required (check .env.local)');
  }
  process.env.POSTGRES_URL = connectionString;

  const url = new URL(connectionString);
  const target = `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!isLocal && process.env.SEED_ALLOW_REMOTE !== '1') {
    throw new Error(
      'Refusing to run against a remote database. Set SEED_ALLOW_REMOTE=1 ' +
        'only for a database you own and have seeded.'
    );
  }
  if (!isLocal) {
    console.warn('SEED_ALLOW_REMOTE=1 set — targeting a REMOTE database.');
  }
  console.log('Database:', target);

  if (process.argv.includes('--inventory')) {
    const { db } = await import('../lib/db');
    const reservedEmail = (column: SQLWrapper) =>
      sql`${column} ~* '@([^@]*\\.)?(example\\.(com|org|net)|test|invalid)$'`;
    console.log('UNSEED:inventory');
    console.log(
      'Read-only inventory. Emails and real account details are not logged.'
    );
    const totals = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM profiles) AS profiles,
        (SELECT count(*)::int FROM profiles WHERE active) AS active_profiles,
        (SELECT md5(COALESCE(string_agg(id, ',' ORDER BY id), ''))
         FROM users WHERE NOT ${seededUser(sql`id`)}) AS real_user_ids,
        (SELECT md5(COALESCE(string_agg(id, ',' ORDER BY id), ''))
         FROM profiles
         WHERE NOT ${fixtureProfile(sql`id`, sql`user_id`)}) AS real_profile_ids
    `);
    console.log('Totals:', JSON.stringify(totals));

    const candidateUsers = await db.execute(sql`
      SELECT u.id, u.screenname, u.account_type,
             ${reservedEmail(sql`u.email`)} AS reserved_email,
             ${seededUser(sql`u.id`)} AS seeded_id
      FROM users u
      WHERE ${seededUser(sql`u.id`)} OR ${reservedEmail(sql`u.email`)}
      ORDER BY u.id
    `);
    console.log('Candidate users:', JSON.stringify(candidateUsers));

    const candidateProfiles = await db.execute(sql`
      SELECT p.id, p.screenname, p.user_id, p.active,
             ${reservedEmail(sql`p.email`)} AS reserved_email,
             ${fixtureProfile(sql`p.id`, sql`p.user_id`)} AS seeded_id,
             p.status->>'source' AS source,
             (SELECT count(*)::int FROM profile_owners po
              WHERE po.profile_id = p.id AND NOT ${seededUser(sql`po.user_id`)})
               AS non_fixture_owners
      FROM profiles p
      WHERE ${fixtureProfile(sql`p.id`, sql`p.user_id`)}
         OR ${reservedEmail(sql`p.email`)}
         OR p.gallery_images::text LIKE '%/img/directory/%'
      ORDER BY p.id
    `);
    console.log('Candidate profiles:', JSON.stringify(candidateProfiles));
    const profileIds = sql`
      SELECT id FROM profiles WHERE ${fixtureProfile(sql`id`, sql`user_id`)}
    `;
    const actorIds = sql`
      SELECT id FROM social_actors
      WHERE ${seeded(sql`id`)} OR profile_id IN (${profileIds})
    `;
    const candidateEvents = await db.execute(sql`
      SELECT e.id, e.host_profile_id, e.host_group_id, e.venue_id,
             ${seeded(sql`e.id`)} AS seeded_id,
             starts_with(e.id, 'demo_ev_') AS demo_id,
             COALESCE(strpos(e.description, 'Sample event added for the ') > 0, false)
               AS sample_notice,
             (SELECT count(*)::int FROM event_attendees a
              WHERE a.event_id = e.id
                AND (a.profile_id IS NULL OR a.profile_id NOT IN (${profileIds})))
               AS non_fixture_attendees
      FROM events e
      WHERE ${seeded(sql`e.id`)} OR starts_with(e.id, 'demo_ev_')
         OR e.host_profile_id IN (${profileIds})
         OR EXISTS (
           SELECT 1 FROM social_groups g
           WHERE g.id = e.host_group_id AND g.created_by_profile_id IN (${profileIds})
         )
      ORDER BY e.id
    `);
    console.log('Candidate events:', JSON.stringify(candidateEvents));
    const candidateVenues = await db.execute(sql`
      SELECT v.id, v.operator_profile_id,
             ${seeded(sql`v.id`)} AS seeded_id,
             (SELECT count(*)::int FROM events e WHERE e.venue_id = v.id) AS events
      FROM venues v
      WHERE ${seeded(sql`v.id`)} OR v.operator_profile_id IN (${profileIds})
      ORDER BY v.id
    `);
    console.log('Candidate venues:', JSON.stringify(candidateVenues));
    const externalReferences = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM social_follows f
         WHERE (f.actor_id IN (${actorIds}))
            <> (f.target_actor_id IN (${actorIds}))) AS follows,
        (SELECT count(*)::int FROM social_likes l
         JOIN social_statuses s ON s.id = l.status_id
         WHERE l.actor_id IN (${actorIds})
           AND s.actor_id NOT IN (${actorIds})) AS likes,
        (SELECT count(*)::int FROM social_group_members m
         JOIN social_groups g ON g.id = m.group_id
         WHERE m.actor_id IN (${actorIds})
           AND g.actor_id NOT IN (${actorIds})) AS group_memberships,
        (SELECT count(*)::int FROM event_attendees a
         WHERE a.profile_id IN (${profileIds})
           AND NOT ${seeded(sql`a.event_id`)}
           AND a.status = 'going'
           AND a.email_verified_at IS NOT NULL) AS verified_rsvps
    `);
    console.log('External references:', JSON.stringify(externalReferences));
    const groupRoles = await db.execute(sql`
      SELECT m.role, m.status, count(*)::int AS memberships,
             count(DISTINCT m.group_id)::int AS groups
      FROM social_group_members m
      JOIN social_groups g ON g.id = m.group_id
      WHERE m.actor_id IN (${actorIds})
        AND g.actor_id NOT IN (${actorIds})
      GROUP BY m.role, m.status
      ORDER BY m.role, m.status
    `);
    console.log('Fixture group roles:', JSON.stringify(groupRoles));
    const groupSafety = await db.execute(sql`
      SELECT md5(g.id) AS group_fingerprint,
             g.created_by_profile_id IS NULL AS creator_missing,
             COALESCE(g.created_by_profile_id IN (${profileIds}), false)
               AS fixture_creator,
             EXISTS (
               SELECT 1 FROM social_actors a
               WHERE a.id = g.actor_id AND a.profile_id IS NOT NULL
             ) AS actor_has_profile,
             EXISTS (
               SELECT 1 FROM social_group_members m
               WHERE m.group_id = g.id AND m.actor_id NOT IN (${actorIds})
                 AND m.actor_id <> g.actor_id
             ) AS real_members,
             EXISTS (
               SELECT 1 FROM social_statuses s
               WHERE s.group_id = g.id AND s.actor_id NOT IN (${actorIds})
                 AND s.actor_id <> g.actor_id
             ) AS real_posts,
             EXISTS (
               SELECT 1 FROM social_statuses reply
               JOIN social_statuses parent ON parent.id = reply.in_reply_to_id
               WHERE parent.group_id = g.id
                 AND reply.actor_id NOT IN (${actorIds})
                 AND reply.actor_id <> g.actor_id
             ) AS real_replies,
             EXISTS (
               SELECT 1 FROM social_likes l
               JOIN social_statuses s ON s.id = l.status_id
               WHERE s.group_id = g.id AND l.actor_id NOT IN (${actorIds})
                 AND l.actor_id <> g.actor_id
             ) AS real_likes,
             EXISTS (
               SELECT 1 FROM events e
               WHERE e.host_group_id = g.id AND NOT (
                 ${seeded(sql`e.id`)} OR starts_with(e.id, 'demo_ev_')
               )
             ) AS real_events
      FROM social_groups g
      WHERE EXISTS (
        SELECT 1 FROM social_group_members m
        WHERE m.group_id = g.id AND m.role = 'admin' AND m.status = 'active'
          AND m.actor_id IN (${actorIds})
      )
      AND NOT EXISTS (
        SELECT 1 FROM social_group_members m
        WHERE m.group_id = g.id AND m.role = 'admin' AND m.status = 'active'
          AND m.actor_id NOT IN (${actorIds})
      )
      ORDER BY g.id
    `);
    console.log('Fixture group safety:', JSON.stringify(groupSafety));
    console.log('UNSEED:inventory:done');
    return;
  }

  console.log(apply ? 'UNSEED:start' : 'UNSEED:dry-run');

  let report: UnseedStepResult[];
  try {
    const approvedGroupIndex = process.argv.indexOf(
      '--approved-group-fingerprint'
    );
    if (approvedGroupIndex >= 0 && !process.argv[approvedGroupIndex + 1]) {
      throw new Error('--approved-group-fingerprint requires an ID hash.');
    }
    report = await unseed(apply, {
      includeDemoGroups: process.argv.includes('--include-demo-groups'),
      includeDemoEvents: process.argv.includes('--include-demo-events'),
      approvedGroupFingerprint:
        approvedGroupIndex >= 0
          ? process.argv[approvedGroupIndex + 1]
          : undefined,
    });
  } catch (error) {
    reportBlocked(error);
    process.exit(1);
  }

  for (const { label, count, note } of report) {
    line(label, `${count} ${apply ? 'deleted' : 'would be deleted'}`);
    console.log(`  ${''.padEnd(30)} ${note}`);
  }

  console.log('');
  line(
    'total rows',
    report.reduce((total, step) => total + step.count, 0)
  );

  if (!apply) {
    console.log(
      '\nDry run — nothing was written. Re-run with --yes to delete.\n' +
        'Counts exclude rows removed by cascade, so the real total is higher.'
    );
  } else {
    console.log('\nUNSEED:done');
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().then(
    () => process.exit(0),
    (error) => {
      console.error('Unseed failed:', error);
      process.exit(1);
    }
  );
}
