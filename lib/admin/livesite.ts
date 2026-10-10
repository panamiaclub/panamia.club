import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { PURGE_JOB, SYNTHETIC_JOB } from '@/lib/jobs/ledger';
import { PROBE_SLOW_MS } from '@/lib/jobs/synthetic-check';
import { BUSINESS_INTAKE_SOURCE } from '@/lib/server/profile-owners';

/**
 * The numbers behind /admin/livesite.
 *
 * ## Why this is one statement and not twelve queries
 *
 * The obvious shape for a dashboard is a `Promise.all` of `count()` calls, one
 * per number. That is the wrong shape here, for a reason specific to how this
 * app reaches Postgres.
 *
 * `lib/db.ts` builds a postgres.js client per request and caps it at `max: 1`
 * on the `POSTGRES_URL` path. postgres.js queues concurrent queries onto the
 * connections it has, so at `max: 1` every `await Promise.all([...])` in this
 * codebase runs *sequentially* — the comment on the Hyperdrive branch says so
 * outright. Twelve counts would be twelve round trips, serialised, and
 * wrangler.jsonc documents production as taking the unpooled path where a
 * round trip is a full TCP + TLS + SCRAM handshake away.
 *
 * So the whole band is one statement with a subquery per number. Postgres
 * plans each independently and the page pays one round trip no matter how
 * many numbers get added later.
 *
 * There is an irony worth naming: the page whose job is to surface the
 * connection problem is the page most punished by it. That is also why this
 * is the file to revisit first if the Hyperdrive binding is ever restored —
 * not to change it, but because the reason for its shape will have gone.
 *
 * ## Why the queue predicates are duplicated rather than imported
 *
 * Each one mirrors the route that owns the queue — `/api/admin/listings` for
 * waiting listings, `/admin/contactus` for open submissions. Those routes
 * select whole rows and this needs a count, so there is no shared query to
 * call; what is shared is the *definition*, and that is the thing to keep
 * honest. Each predicate below names the route it must agree with. If one
 * moves, this number silently starts lying, which on a health dashboard is
 * worse than not showing it.
 *
 * The listings predicate is the one to be careful with. `active = false`
 * alone matches nearly every row on the table — every signed-in member has a
 * profile — so the source and decision checks are not refinements, they are
 * what makes the number mean "waiting" instead of "exists".
 */

/** A count now, the same count over the window before it. */
export interface Trend {
  current: number;
  previous: number;
}

/**
 * Describes a trend without inventing precision.
 *
 * Deliberately returns no percentage when the previous window was zero: the
 * first week of anything would read as an infinite rise, and "up 100%" from a
 * base of one is true and useless. At the volumes this site runs at the two
 * raw numbers carry more than a ratio does.
 *
 * Lives here rather than in the page because it is a statement about `Trend`,
 * not about markup, and because the zero case is the kind of thing that wants
 * a test more than it wants a component.
 */
export function trendNote(trend: Trend, window: string): string {
  const { current, previous } = trend;
  if (previous === 0) return current === 0 ? window : `${window}, none before`;
  const delta = current - previous;
  if (delta === 0) return `${window}, level with the week before`;
  return `${window}, ${delta > 0 ? 'up' : 'down'} from ${previous}`;
}

export interface CommunitySnapshot {
  /** New accounts, last 7 days against the 7 before them. */
  signups: Trend;
  /** New profiles of any kind, same windows. */
  profiles: Trend;
  /** Published events with a start time still ahead of now. */
  upcomingEvents: number;
  /** Accounts in total, as context for the trends. */
  totalUsers: number;

  /** Things waiting on a human. Each maps to a tool on this surface. */
  queues: {
    /** Business intake applications, undecided. → /admin/listings */
    listings: number;
    /** Contact form messages still open. → /admin/contactus */
    contact: number;
    /** Relay abuse reports still open. → /admin/reports */
    reports: number;
    /** Newsletter signups nobody has acknowledged. No screen owns this yet. */
    newsletter: number;
  };
}

/**
 * Read the community band.
 *
 * Every count is scoped by `created_at` against `now()` in Postgres rather
 * than a date computed in JS. The Worker and the database agree on UTC, but
 * events written before the #328 timezone fix are stored four hours off, and
 * a boundary computed on one side of the wire is one more place for that to
 * matter. `now()` also means the window moves with the request instead of
 * with the deploy.
 */
export async function communitySnapshot(): Promise<CommunitySnapshot> {
  const [row] = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM users
        WHERE created_at >= now() - interval '7 days')::int       AS signups_current,
      (SELECT count(*) FROM users
        WHERE created_at >= now() - interval '14 days'
          AND created_at <  now() - interval '7 days')::int       AS signups_previous,

      (SELECT count(*) FROM profiles
        WHERE created_at >= now() - interval '7 days')::int       AS profiles_current,
      (SELECT count(*) FROM profiles
        WHERE created_at >= now() - interval '14 days'
          AND created_at <  now() - interval '7 days')::int       AS profiles_previous,

      -- Mirrors the public events feed: published only, still ahead of now.
      (SELECT count(*) FROM events
        WHERE status = 'published'
          AND starts_at >= now())::int                            AS upcoming_events,

      (SELECT count(*) FROM users)::int                           AS total_users,

      -- Mirrors app/api/admin/listings/route.ts. All three clauses matter:
      -- see the note at the top of this file.
      (SELECT count(*) FROM profiles
        WHERE active = false
          AND status ->> 'source' = ${BUSINESS_INTAKE_SOURCE}
          AND status ->> 'approved' IS NULL
          AND status ->> 'declined' IS NULL)::int                 AS queue_listings,

      -- Mirrors /admin/contactus and /admin/reports, which both trade on the
      -- 'open' member of their own status enum.
      (SELECT count(*) FROM contact_submissions
        WHERE status = 'open')::int                               AS queue_contact,
      (SELECT count(*) FROM relay_reports
        WHERE status = 'open')::int                               AS queue_reports,

      (SELECT count(*) FROM newsletter_signups
        WHERE acknowledged = false)::int                          AS queue_newsletter
  `)) as unknown as {
    signups_current: number;
    signups_previous: number;
    profiles_current: number;
    profiles_previous: number;
    upcoming_events: number;
    total_users: number;
    queue_listings: number;
    queue_contact: number;
    queue_reports: number;
    queue_newsletter: number;
  }[];

  return {
    signups: {
      current: row.signups_current,
      previous: row.signups_previous,
    },
    profiles: {
      current: row.profiles_current,
      previous: row.profiles_previous,
    },
    upcomingEvents: row.upcoming_events,
    totalUsers: row.total_users,
    queues: {
      listings: row.queue_listings,
      contact: row.queue_contact,
      reports: row.queue_reports,
      newsletter: row.queue_newsletter,
    },
  };
}

// =============================================================================
// Machinery -- the scheduled jobs
// =============================================================================

/**
 * How often the sweep is meant to run. Mirrors `"crons": ["10 * * * *"]` in
 * wrangler.jsonc; if that changes, these change with it.
 */
const CRON_INTERVAL_SECONDS = 60 * 60;

/**
 * How long a gap has to be before it means something.
 *
 * Two intervals, not one. A single missed run is an ordinary event -- a
 * deploy landing on the hour, a Cloudflare hiccup -- and a dashboard that
 * cries about it gets ignored on the day it is right. Two consecutive misses
 * is a pattern.
 */
const STALE_AFTER_SECONDS = 2 * CRON_INTERVAL_SECONDS;

/**
 * How long an unfinished run is given before it counts as dead.
 *
 * Cron Triggers at an hourly interval get a 15-minute CPU budget (see the
 * note in wrangler.jsonc). A run still open past that was killed; it is not
 * thinking.
 */
const IN_FLIGHT_GRACE_SECONDS = 15 * 60;

export interface JobRunSummary {
  /** The cron expression that fired it, or 'manual'. */
  trigger: string;
  startedAt: Date;
  /** Null means the run never came back. */
  finishedAt: Date | null;
  /** Null while in flight. */
  ok: boolean | null;
  errorCount: number;
  /** Measured in Postgres, not in the Worker. See the note below. */
  secondsSinceStart: number;
  /** Null when the run never finished. */
  durationSeconds: number | null;
  /** From the report blob: expired media R2 refused to delete. */
  storiesDeferred: number;
  storiesDeleted: number;
  mediaDeleted: number;
  notificationsDeleted: number;
}

export interface MachinerySnapshot {
  /** False when job_runs does not exist. See the note below. */
  migrated: boolean;
  lastRun: JobRunSummary | null;
  /** Runs started in the last 24h. On an hourly cron, 24 is the full house. */
  runs24h: number;
  /** Of those, how many reported failure. */
  failures24h: number;
  /** Runs that opened and never closed, past the grace period. */
  killed: number;
}

/** Postgres undefined_table. The one error here that is not a fault. */
function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    String((error as { code: unknown }).code) === '42P01'
  );
}

/** Pull a non-negative integer out of the report blob, or zero. */
function reportNumber(report: unknown, key: string): number {
  if (!report || typeof report !== 'object') return 0;
  const value = (report as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * Read the machinery band.
 *
 * ## Why a missing table is a value and not an exception
 *
 * `migrated: false` is returned when job_runs is absent, rather than letting
 * the error out. Migrations have twice reached production unapplied in this
 * repo -- scripts/check-pending-migrations.ts was written because of it -- so
 * this is a state that has actually happened, not a defensive flourish.
 *
 * The consequence of not handling it is specific and bad: /admin/livesite is
 * the page somebody opens *because* the site is behaving strangely. If a
 * missing table took the whole page down, the one tool for diagnosing a
 * half-applied deploy would be the tool that a half-applied deploy breaks.
 *
 * Every other error propagates. "The database is unreachable" must not be
 * quietly rendered as "no runs yet".
 *
 * ## Why the ages are computed in Postgres
 *
 * `now() - started_at` is evaluated by the database, which is also the clock
 * that wrote `started_at`. Subtracting in the Worker would compare two
 * machines' clocks, and the whole band hinges on one subtraction: the gap
 * between now and the newest run is the primary alarm, because a cron that
 * has stopped firing writes nothing at all -- it leaves a ledger full of
 * green rows that simply stops growing.
 */
export async function machinerySnapshot(
  job: string = PURGE_JOB
): Promise<MachinerySnapshot> {
  let row: {
    runs_24h: number;
    failures_24h: number;
    killed: number;
    last_trigger: string | null;
    last_started_at: Date | null;
    last_finished_at: Date | null;
    last_ok: boolean | null;
    last_error_count: number | null;
    last_report: unknown;
    seconds_since_start: number | null;
    duration_seconds: number | null;
  };

  try {
    const rows = (await db.execute(sql`
      SELECT
        (SELECT count(*) FROM job_runs
          WHERE job = ${job}
            AND started_at >= now() - interval '24 hours')::int  AS runs_24h,

        (SELECT count(*) FROM job_runs
          WHERE job = ${job}
            AND ok = false
            AND started_at >= now() - interval '24 hours')::int   AS failures_24h,

        -- Opened and never closed, past the point where it could still be
        -- thinking. These are Workers that were killed mid-sweep.
        (SELECT count(*) FROM job_runs
          WHERE job = ${job}
            AND finished_at IS NULL
            AND started_at < now()
              - (${IN_FLIGHT_GRACE_SECONDS} || ' seconds')::interval)::int AS killed,

        l.trigger                                                 AS last_trigger,
        l.started_at                                              AS last_started_at,
        l.finished_at                                             AS last_finished_at,
        l.ok                                                      AS last_ok,
        l.error_count                                             AS last_error_count,
        l.report                                                  AS last_report,
        extract(epoch from (now() - l.started_at))::int           AS seconds_since_start,
        extract(epoch from (l.finished_at - l.started_at))::int   AS duration_seconds

      -- LEFT JOIN LATERAL so the row survives an empty ledger: the scalar
      -- subqueries above still need somewhere to land when there is no last
      -- run, and an inner join would return nothing at all.
      FROM (SELECT 1) AS one
      LEFT JOIN LATERAL (
        SELECT trigger, started_at, finished_at, ok, error_count, report
        FROM job_runs
        WHERE job = ${job}
        ORDER BY started_at DESC
        LIMIT 1
      ) l ON true
    `)) as unknown as (typeof row)[];
    row = rows[0];
  } catch (error) {
    if (isUndefinedTable(error)) {
      return {
        migrated: false,
        lastRun: null,
        runs24h: 0,
        failures24h: 0,
        killed: 0,
      };
    }
    throw error;
  }

  const lastRun: JobRunSummary | null = row.last_started_at
    ? {
        trigger: row.last_trigger ?? 'unknown',
        startedAt: new Date(row.last_started_at),
        finishedAt: row.last_finished_at
          ? new Date(row.last_finished_at)
          : null,
        ok: row.last_ok,
        errorCount: row.last_error_count ?? 0,
        secondsSinceStart: row.seconds_since_start ?? 0,
        durationSeconds: row.duration_seconds,
        storiesDeferred: reportNumber(row.last_report, 'storiesDeferred'),
        storiesDeleted: reportNumber(row.last_report, 'storiesDeleted'),
        mediaDeleted: reportNumber(row.last_report, 'mediaDeleted'),
        notificationsDeleted: reportNumber(
          row.last_report,
          'notificationsDeleted'
        ),
      }
    : null;

  return {
    migrated: true,
    lastRun,
    runs24h: row.runs_24h,
    failures24h: row.failures_24h,
    killed: row.killed,
  };
}

/**
 * Render a gap in whole units, largest that fits.
 *
 * Rounded down deliberately: "1 hour ago" for a 119-minute gap understates
 * the problem, so the floor is applied to the unit, not the value -- 119
 * minutes is "1 hour", 121 is "2 hours". Good enough for prose, and the
 * alarms are driven by the raw seconds, not by this string.
 */
export function describeGap(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) return safe === 1 ? '1 second' : `${safe} seconds`;
  const minutes = Math.floor(safe / 60);
  if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour' : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

export type VerdictTone = 'ok' | 'warn' | 'alarm';

export interface MachineryVerdict {
  tone: VerdictTone;
  headline: string;
  detail: string;
}

/**
 * Turn the machinery snapshot into one sentence and a tone.
 *
 * ## Why the order of these checks is the design
 *
 * They are not independent conditions ranked by severity; each one makes the
 * ones below it unreadable. A job that has stopped running cannot report that
 * it is failing, so "has it run" has to be settled before "did it work" --
 * otherwise a dead cron renders as whatever its last successful run said,
 * which is the exact failure this band exists to catch.
 *
 * Likewise a run that was killed mid-sweep is checked before plain staleness,
 * because the two look identical in the gap and need different people: one is
 * "the schedule stopped firing", the other is "the work no longer fits in the
 * budget". Collapsing them into "it has been a while" loses the distinction
 * that tells you which.
 *
 * Pure, and separate from the page, because this ordering is the part worth
 * testing -- and because the honest cases here (no ledger, nothing recorded
 * yet) are states nobody can conveniently reproduce in a browser.
 */
export function machineryVerdict(snap: MachinerySnapshot): MachineryVerdict {
  if (!snap.migrated) {
    return {
      tone: 'warn',
      headline: 'No run ledger yet',
      detail:
        'The job_runs table is missing, so nothing is recording what the ' +
        'hourly sweep does. The sweep itself is unaffected. Apply migration ' +
        '0063 with npx drizzle-kit migrate.',
    };
  }

  const last = snap.lastRun;

  if (!last) {
    return {
      tone: 'warn',
      headline: 'Nothing recorded yet',
      detail:
        'The ledger is empty. The sweep runs at ten past the hour, so the ' +
        'first entry should appear within the hour of this going live.',
    };
  }

  const age = describeGap(last.secondsSinceStart);

  if (last.finishedAt === null) {
    if (last.secondsSinceStart > IN_FLIGHT_GRACE_SECONDS) {
      return {
        tone: 'alarm',
        headline: 'A run stopped mid-sweep',
        detail:
          `Started ${age} ago and never finished. The Worker was killed ` +
          'before it could report -- usually the CPU budget, which is 15 ' +
          'minutes at an hourly interval. Expired media is not being ' +
          'reclaimed while this persists.',
      };
    }
    return {
      tone: 'ok',
      headline: 'Running now',
      detail: `Started ${age} ago, still going.`,
    };
  }

  if (last.secondsSinceStart > STALE_AFTER_SECONDS) {
    return {
      tone: 'alarm',
      headline: 'The hourly sweep has stopped',
      detail:
        `The last run was ${age} ago and it is meant to run every hour. ` +
        'Nothing will raise this as a failure, because a job that is not ' +
        'running cannot fail -- check Cron Triggers on the Worker.',
    };
  }

  if (last.ok === false) {
    return {
      tone: 'alarm',
      headline: 'The last run failed',
      detail:
        `It ran ${age} ago and reported an error. Expired stories and their ` +
        'media stay in place until a run succeeds.',
    };
  }

  if (last.storiesDeferred > 0) {
    const n = last.storiesDeferred;
    return {
      tone: 'warn',
      headline: `${n} ${n === 1 ? 'story' : 'stories'} could not be cleared`,
      detail:
        'R2 refused to delete their media, so the rows were deliberately ' +
        'left in place to retry rather than orphaning the files. It fixes ' +
        'itself if R2 recovers; a run of these is a bucket problem.',
    };
  }

  if (last.errorCount > 0) {
    const n = last.errorCount;
    return {
      tone: 'warn',
      headline: `Last run finished with ${n} ${n === 1 ? 'error' : 'errors'}`,
      detail: `It completed ${age} ago, but not everything it tried worked.`,
    };
  }

  if (snap.failures24h > 0) {
    const n = snap.failures24h;
    return {
      tone: 'warn',
      headline: 'Running again, after trouble',
      detail:
        `The last run was clean, but ${n} of the ${snap.runs24h} runs in ` +
        'the past day failed.',
    };
  }

  if (snap.killed > 0) {
    const n = snap.killed;
    return {
      tone: 'warn',
      headline: 'Earlier runs were cut short',
      detail:
        `The last run finished cleanly, but ${n} ${n === 1 ? 'run' : 'runs'} ` +
        'in the ledger opened and never closed.',
    };
  }

  return {
    tone: 'ok',
    headline: 'Running on schedule',
    detail: `Last run ${age} ago, clean. ${snap.runs24h} in the past day.`,
  };
}

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

/**
 * How close the database is to refusing work.
 *
 * Deliberately a ratio and not a count. Supabase instance sizes carry very
 * different `max_connections` -- a micro sits around 60, larger tiers run into
 * the hundreds -- so a hardcoded "20 connections is a lot" would be wrong on
 * every tier but one. The server is asked what its own ceiling is.
 */
const CONNECTIONS_ALARM = 0.9;
const CONNECTIONS_WARN = 0.75;

export interface DatabaseStats {
  /** Backends on the server right now, including the one reading this. */
  connections: number;
  /** The server's own ceiling, read from pg_settings. */
  maxConnections: number;
  /** Slots held back for superusers; ordinary roles cannot have these. */
  reserved: number;
  /**
   * Connections running a query, or null when this role may not see the
   * `state` column for other roles' backends. Null means "not allowed to
   * say", which is a different thing from zero and must render differently.
   */
  active: number | null;
  /**
   * Connections holding a transaction open without doing anything. Null for
   * the same reason as `active`.
   *
   * Worth its own number because it is the shape of connection exhaustion
   * that is nobody's fault at the moment it happens: the slot is held, the
   * locks are held, and the query that would explain it finished long ago.
   */
  idleInTransaction: number | null;
  /** Whether this role can see other roles' backends in full. */
  canReadAllStats: boolean;
  /** Size on disk of the current database. */
  sizeBytes: number;
}

export type DatabaseSnapshot =
  | { available: true; stats: DatabaseStats }
  | { available: false; reason: string };

/** Postgres insufficient_privilege. */
function isInsufficientPrivilege(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    String((error as { code: unknown }).code) === '42501'
  );
}

/**
 * Read the database's own view of its health.
 *
 * ## Why this asks Postgres whether it is allowed to answer
 *
 * `pg_stat_activity` hides most columns of other roles' backends unless the
 * reader belongs to `pg_read_all_stats`. The rows are still counted, so
 * `count(*)` is always right, but `count(*) FILTER (WHERE state = 'active')`
 * silently returns a number far too low when the columns are masked -- and a
 * silently-too-low number on a health dashboard is worse than no number,
 * because it reads as "quiet" exactly when the server is busy.
 *
 * So the statement asks for role membership directly rather than assuming
 * either way. Whether Supabase grants that membership to the `postgres` role
 * is a question about somebody else's platform that could change under us; a
 * runtime answer cannot go stale.
 *
 * The membership test goes through pg_roles rather than naming the role in
 * `pg_has_role`, because `pg_has_role('pg_read_all_stats', ...)` raises if the
 * role does not exist. A subquery against the catalogue yields NULL instead,
 * which is the honest answer to "are you a member of a role that is not
 * there".
 *
 * ## What the connection count includes
 *
 * Client backends only. Postgres also runs background workers -- autovacuum,
 * the WAL writer, pg_cron -- and those are not what `max_connections` governs,
 * so counting them would inflate the number against its own ceiling. Supabase
 * documents the same filter for the same reason.
 *
 * What it does include is every other client on the server, not just this app:
 * Auth, Storage, PostgREST and the health checker all hold connections out of
 * the same total, as do the backends Supavisor opens even though this app
 * bypasses the pooler. That breadth is the point -- the question is whether the
 * *server* is near its ceiling, not whether this Worker is.
 *
 * It does not include clients connected *to* the pooler, only the pooler's own
 * connections onward to Postgres. Those are different limits and Supabase
 * counts them separately.
 *
 * Note that the reader is part of what it measures. At `max: 1` per request
 * this page contributes exactly one connection, so the number is one higher
 * than it would be if nobody were looking.
 */
export async function databaseSnapshot(): Promise<DatabaseSnapshot> {
  try {
    const rows = (await db.execute(sql`
      SELECT
        (SELECT count(*) FROM pg_stat_activity
          WHERE backend_type = 'client backend')::int  AS connections,

        (SELECT setting::int FROM pg_settings
          WHERE name = 'max_connections')                AS max_connections,

        (SELECT setting::int FROM pg_settings
          WHERE name = 'superuser_reserved_connections') AS reserved,

        (SELECT count(*) FROM pg_stat_activity
          WHERE backend_type = 'client backend'
            AND state = 'active')::int                   AS active,

        -- LIKE, not equality: there are two of these states, and
        -- 'idle in transaction (aborted)' is the worse one. A connection
        -- holding an aborted transaction open is doing nothing and will
        -- never do anything, and it still owns the slot.
        (SELECT count(*) FROM pg_stat_activity
          WHERE backend_type = 'client backend'
            AND state LIKE 'idle in transaction%')::int  AS idle_in_transaction,

        -- NULL when the predefined role is absent, which reads as "no" below.
        (SELECT pg_has_role(current_user, oid, 'member')
           FROM pg_roles WHERE rolname = 'pg_read_all_stats') AS can_read_all_stats,

        -- float8 rather than the native bigint: postgres.js hands int8 back as
        -- a string to avoid precision loss, and a database would have to reach
        -- nine petabytes before a double lost a byte of this.
        pg_database_size(current_database())::float8 AS size_bytes
    `)) as unknown as Array<{
      connections: number;
      max_connections: number | null;
      reserved: number | null;
      active: number;
      idle_in_transaction: number;
      can_read_all_stats: boolean | null;
      size_bytes: number;
    }>;

    const row = rows[0];
    if (!row) {
      return { available: false, reason: 'The server returned no rows.' };
    }

    const full = row.can_read_all_stats === true;

    return {
      available: true,
      stats: {
        connections: row.connections,
        // A server that will not state its own ceiling cannot be measured
        // against it. Zero propagates to the verdict, which checks for it.
        maxConnections: row.max_connections ?? 0,
        reserved: row.reserved ?? 0,
        active: full ? row.active : null,
        idleInTransaction: full ? row.idle_in_transaction : null,
        canReadAllStats: full,
        sizeBytes: row.size_bytes,
      },
    };
  } catch (error) {
    // A refusal is a state to report, not a page to lose. Everything else
    // propagates -- an unreachable database must not render as a permissions
    // note, which would send somebody to fix the wrong thing.
    if (isInsufficientPrivilege(error)) {
      return {
        available: false,
        reason:
          'This database role may not read server statistics, so connection ' +
          'use and size cannot be shown.',
      };
    }
    throw error;
  }
}

/**
 * Bytes as something a person can hold in their head.
 *
 * Binary units, because that is what Postgres means and what every other tool
 * in this stack will report. One decimal place above a megabyte: the second
 * digit of a gigabyte figure is the one that moves week to week, and the ones
 * after it are noise.
 */
export function describeBytes(bytes: number): string {
  const safe = Math.max(0, bytes);
  if (safe < 1024) return `${Math.round(safe)} B`;
  const kb = safe / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export interface DatabaseVerdict {
  tone: VerdictTone;
  headline: string;
  detail: string;
}

/**
 * Turn the database snapshot into one sentence and a tone.
 *
 * ## Why connections are the only thing that raises an alarm here
 *
 * Size is reported and never judged. The ceiling it would be judged against
 * depends on the Supabase plan: Free projects go read-only at 500 MB of
 * database size, while Pro has an auto-scaling disk and no single number to
 * compare with. Picking one and rendering "X of Y" would be confidently wrong
 * on whichever plan this project is not on, and a gauge that is wrong about
 * headroom is worse than a number with no gauge at all.
 *
 * Connections have no such problem. The server states its own ceiling, so the
 * ratio is true on every tier without anybody configuring anything.
 *
 * ## Why running out of connections is a live risk rather than a theoretical one
 *
 * Supabase's guidance is that serverless and edge runtimes should reach
 * Postgres through the transaction pooler, precisely because they open many
 * short-lived connections and scale horizontally. This app is a Worker and
 * takes a direct connection instead -- the POSTGRES_URL secret short-circuits
 * the Hyperdrive branch in lib/db.ts -- so every concurrent request is its own
 * unpooled backend against a ceiling that starts at 60 on the smaller compute
 * tiers.
 *
 * Which makes this number the one on the page most worth watching, and gives
 * the band a second job: it is the evidence for fixing that, where previously
 * there was only an argument.
 */
export function databaseVerdict(snap: DatabaseSnapshot): DatabaseVerdict {
  if (!snap.available) {
    return {
      tone: 'warn',
      headline: 'The database is not reporting on itself',
      detail: snap.reason,
    };
  }

  const s = snap.stats;
  const size = describeBytes(s.sizeBytes);

  // A server that would not state its own ceiling. The counts are still real,
  // so they are worth showing, but nothing can be judged against nothing.
  if (s.maxConnections <= 0) {
    return {
      tone: 'warn',
      headline: 'Connection ceiling unknown',
      detail:
        `${s.connections} connections open and ${size} on disk, but the ` +
        'server did not report max_connections, so there is nothing to ' +
        'measure that against.',
    };
  }

  // Ordinary roles cannot have the reserved slots, so the real ceiling for
  // this app is lower than the headline number.
  const usable = Math.max(1, s.maxConnections - s.reserved);
  const ratio = s.connections / usable;
  const headroom = usable - s.connections;

  if (ratio >= CONNECTIONS_ALARM) {
    return {
      tone: 'alarm',
      headline: 'The database is nearly out of connections',
      detail:
        `${s.connections} of ${usable} are in use, leaving ${headroom}. ` +
        'New requests start failing outright at the ceiling, and this app ' +
        'opens a connection per request without pooling.',
    };
  }

  if (ratio >= CONNECTIONS_WARN) {
    return {
      tone: 'warn',
      headline: 'Connection use is climbing',
      detail:
        `${s.connections} of ${usable} are in use. Auth, Storage and the ` +
        'health checker draw on the same total, so the headroom is shared.',
    };
  }

  // Only worth raising once the ceiling itself is not the story. A handful of
  // these is ordinary; it is the shape of exhaustion that nobody notices,
  // because the query that would explain the held slot finished long ago.
  if (s.idleInTransaction !== null && s.idleInTransaction > 2) {
    return {
      tone: 'warn',
      headline: `${s.idleInTransaction} connections idle in transaction`,
      detail:
        'These hold their slot and their locks without doing any work. A ' +
        'few is normal; a number that climbs and never falls is a ' +
        'transaction somebody forgot to close.',
    };
  }

  return {
    tone: 'ok',
    headline: 'The database has room',
    detail:
      `${s.connections} of ${usable} connections in use, ${size} on disk.` +
      (s.canReadAllStats
        ? ''
        : ' Connection states are hidden from this role, so only the total ' +
          'is exact.'),
  };
}



/* ---------------------------------------------------------------------------
 * Band 4 -- Visitor experience
 *
 * The first band that is a request rather than a reading. The other three all
 * look outward from inside the system, so every one of them can stay green
 * while the site returns 500 to everybody.
 *
 * This reads the ledger rows written by lib/jobs/synthetic-check.ts. See that
 * file for why these are synthetic probes rather than real user monitoring,
 * and what that choice cannot see.
 * ------------------------------------------------------------------------- */

export interface UptimeProbe {
  path: string;
  label: string;
  status: number | null;
  ok: boolean;
  ms: number;
  error?: string;
}

export interface UptimeSnapshot {
  /** False when job_runs does not exist. Same contract as the machinery band. */
  migrated: boolean;
  /** Null until the first probe run lands. */
  checkedAt: Date | null;
  secondsSinceCheck: number;
  probes: UptimeProbe[];
  failures: number;
  slowestMs: number;
  /** Probe runs in the last 24h that reported at least one failure. */
  badRuns24h: number;
  runs24h: number;
}

/** Narrow one probe out of the stored report blob, dropping anything malformed. */
function parseProbes(report: unknown): UptimeProbe[] {
  if (!report || typeof report !== 'object') return [];
  const raw = (report as Record<string, unknown>).probes;
  if (!Array.isArray(raw)) return [];

  const probes: UptimeProbe[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.path !== 'string') continue;
    probes.push({
      path: e.path,
      label: typeof e.label === 'string' ? e.label : e.path,
      status: typeof e.status === 'number' ? e.status : null,
      ok: e.ok === true,
      ms: typeof e.ms === 'number' && Number.isFinite(e.ms) ? e.ms : 0,
      ...(typeof e.error === 'string' ? { error: e.error } : {}),
    });
  }
  return probes;
}

/**
 * Read the visitor-experience band.
 *
 * Deliberately not machinerySnapshot(SYNTHETIC_JOB), even though that function
 * takes the job name and would return rows. Its JobRunSummary carries the
 * purge's vocabulary -- storiesDeleted, mediaDeleted -- which would be four
 * permanent zeroes here, and it discards the report body, which for a probe
 * run is the entire point. The staleness and failure logic it owns stays with
 * the purge; what this band needs from a row is the blob.
 */
export async function uptimeSnapshot(): Promise<UptimeSnapshot> {
  const empty: UptimeSnapshot = {
    migrated: true,
    checkedAt: null,
    secondsSinceCheck: 0,
    probes: [],
    failures: 0,
    slowestMs: 0,
    badRuns24h: 0,
    runs24h: 0,
  };

  let row: {
    started_at: Date | null;
    seconds_since: number | null;
    report: unknown;
    error_count: number | null;
    runs_24h: number;
    bad_runs_24h: number;
  };

  try {
    const rows = (await db.execute(sql`
      SELECT
        (SELECT count(*) FROM job_runs
          WHERE job = ${SYNTHETIC_JOB}
            AND started_at >= now() - interval '24 hours')::int AS runs_24h,

        (SELECT count(*) FROM job_runs
          WHERE job = ${SYNTHETIC_JOB}
            AND ok = false
            AND started_at >= now() - interval '24 hours')::int AS bad_runs_24h,

        l.started_at                                    AS started_at,
        extract(epoch from (now() - l.started_at))::int  AS seconds_since,
        l.report                                        AS report,
        l.error_count                                   AS error_count

      -- Same LEFT JOIN LATERAL shape as the machinery band, and for the same
      -- reason: the counts above still need a row when the ledger is empty.
      FROM (SELECT 1) AS one
      LEFT JOIN LATERAL (
        SELECT started_at, report, error_count
        FROM job_runs
        WHERE job = ${SYNTHETIC_JOB}
        ORDER BY started_at DESC
        LIMIT 1
      ) l ON true
    `)) as unknown as (typeof row)[];
    row = rows[0];
  } catch (error) {
    // A missing table is a state, not a fault -- see machinerySnapshot.
    if (isUndefinedTable(error)) return { ...empty, migrated: false };
    throw error;
  }

  if (!row?.started_at) return empty;

  const probes = parseProbes(row.report);
  return {
    migrated: true,
    checkedAt: new Date(row.started_at),
    secondsSinceCheck: row.seconds_since ?? 0,
    probes,
    // Counted from the probes themselves rather than trusting error_count, so
    // the number always matches the list rendered beside it.
    failures: probes.filter((p) => !p.ok).length,
    slowestMs: probes.reduce((max, p) => Math.max(max, p.ms), 0),
    runs24h: row.runs_24h,
    badRuns24h: row.bad_runs_24h,
  };
}

export interface UptimeVerdict {
  tone: VerdictTone;
  headline: string;
  detail: string;
}

export function uptimeVerdict(snap: UptimeSnapshot): UptimeVerdict {
  if (!snap.migrated) {
    return {
      tone: 'warn',
      headline: 'No run ledger yet',
      detail:
        'The job_runs table is missing, so uptime probes have nowhere to ' +
        'record. Apply migration 0063.',
    };
  }

  if (!snap.checkedAt) {
    return {
      tone: 'warn',
      headline: 'Not checked yet',
      detail:
        'Probes run at ten past the hour alongside the expiry sweep, so the ' +
        'first result should appear within the hour of this going live.',
    };
  }

  const age = describeGap(snap.secondsSinceCheck);

  // Stale probes are worth more than the last result they left behind: an
  // all-green check from six hours ago says nothing about now, and reading it
  // as health is the specific way a dashboard lies.
  if (snap.secondsSinceCheck > STALE_AFTER_SECONDS) {
    return {
      tone: 'warn',
      headline: 'These results are stale',
      detail:
        `The last check ran ${age} ago and they are meant to run hourly. ` +
        'This says the cron has stopped, not that the site is down -- the ' +
        'machinery band above is where that gets diagnosed.',
    };
  }

  if (snap.failures > 0) {
    const broken = snap.probes.filter((p) => !p.ok);
    const named = broken
      .map((p) => `${p.label} (${p.error ?? 'failed'})`)
      .join(', ');

    // Every probe failing is a different claim from some of them failing, and
    // worth separating because the probes run from inside the Worker that
    // serves the site. If a Cloudflare Worker turns out not to be able to
    // fetch its own zone, the symptom is all four failing at once from the
    // first run onwards -- indistinguishable from a total outage on the
    // numbers alone, but trivially distinguishable by whether the site
    // answers when you open it. Saying so here stops a prober fault from
    // being read as a site fault.
    const everything = broken.length === snap.probes.length;

    return {
      tone: 'alarm',
      headline: everything
        ? 'Every visitor-facing check is failing'
        : snap.failures === 1
          ? 'A visitor-facing check is failing'
          : `${snap.failures} visitor-facing checks are failing`,
      detail:
        `Checked ${age} ago: ${named}. ` +
        (everything
          ? 'All of them failed together, so open the site before treating ' +
            'this as an outage -- the probes run from inside the Worker that ' +
            'serves it, and a fault in the checking is the other explanation ' +
            'for this shape.'
          : 'These are anonymous requests to the live site, so anything ' +
            'failing here is failing for real visitors too.'),
    };
  }

  if (snap.slowestMs > PROBE_SLOW_MS) {
    return {
      tone: 'warn',
      headline: 'The site is answering slowly',
      detail:
        `Everything answered ${age} ago, but the slowest took ` +
        `${(snap.slowestMs / 1000).toFixed(1)}s. One slow sample is noise; ` +
        'several in a row is a trend worth chasing.',
    };
  }

  return {
    tone: 'ok',
    headline: 'The site is answering visitors',
    detail:
      `All ${snap.probes.length} checks passed ${age} ago, slowest ` +
      `${(snap.slowestMs / 1000).toFixed(1)}s.` +
      (snap.badRuns24h > 0
        ? ` ${snap.badRuns24h} of ${snap.runs24h} checks in the last 24 hours had a failure.`
        : ''),
  };
}
