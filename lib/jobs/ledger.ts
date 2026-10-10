/**
 * The scheduled-job ledger: one row per run, so "did the machinery work" has
 * an answer that outlives a console log.
 *
 * ## This module is not allowed to break the job it records
 *
 * Every function here swallows its own failures. That is deliberate and it is
 * the most important thing about this file.
 *
 * The hourly purge is real work -- it reclaims R2 objects that nothing else
 * reclaims. Recording that it happened is bookkeeping. If the bookkeeping
 * throws and takes the purge with it, this module has made the system worse
 * in exchange for observing it, which is the one outcome worth engineering
 * against.
 *
 * This is not hypothetical caution. Migrations have twice reached production
 * unapplied in this repo (see scripts/check-pending-migrations.ts, which
 * exists because of it). If 0063 lands late, every call here hits a table
 * that does not exist. Swallowing means the sweep carries on untouched and
 * /admin/livesite says "not migrated yet"; not swallowing would mean the
 * deploy silently stops the only thing keeping the bucket from growing
 * forever.
 *
 * So: failures go to console.error, tagged, and nothing propagates. A missing
 * ledger row is a gap in a dashboard. A missing purge is a bill.
 *
 * ## Why a row is written at the start
 *
 * A run that dies mid-flight -- CPU budget exceeded, isolate evicted, deploy
 * landing on top of it -- never executes its own epilogue. If rows were only
 * written on completion, that case would look exactly like "the cron never
 * fired", and those two need different people to fix them.
 *
 * Writing at the start costs one extra statement an hour and makes the
 * distinction permanent: `finished_at IS NULL` on an old row is a run that
 * was killed.
 */

import { sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { db } from '@/lib/db';

/** The hourly sweep in lib/jobs/purge-expired.ts. */
export const PURGE_JOB = 'purge';

/**
 * The hourly uptime probes in lib/jobs/synthetic-check.ts.
 *
 * A second job name rather than a second table: `job` is already the
 * discriminator here, `report` is already free-form jsonb, and the retention
 * trim below is already indiscriminate. Everything a probe run needs to
 * record fits what 0063 built, so this costs no migration -- and no entry in
 * lib/legal/data-inventory.ts, which a new table would have required.
 *
 * The dashboard reads these through uptimeSnapshot() rather than
 * machinerySnapshot(job), even though the latter takes a job name. That
 * function's row shape is the purge's vocabulary -- storiesDeleted,
 * mediaDeleted -- and it discards the report body, which for a probe run is
 * the only part worth reading.
 */
export const SYNTHETIC_JOB = 'synthetic';

/**
 * How long ledger history is kept.
 *
 * Hourly, so 30 days is about 720 rows -- small enough that the horizon is
 * set by what is useful to look at rather than by storage. A fortnight of
 * context either side of "when did this start going wrong" is roughly the
 * question people actually ask.
 */
const RETENTION_DAYS = 30;

/**
 * A started run, or null if the ledger could not record one.
 *
 * Null is an ordinary value here, not an error: see the note at the top. The
 * caller passes it straight back to `completeJobRun`, which does nothing with
 * it, so no call site needs to branch on whether the ledger is working.
 */
export type JobRunHandle = string | null;

function warn(stage: string, error: unknown): void {
  console.error(
    `[ledger] ${stage} failed:`,
    error instanceof Error ? error.message : String(error)
  );
}

/**
 * Record that a job has started. Returns a handle for `completeJobRun`.
 *
 * `trigger` is the cron expression for a scheduled run, or 'manual' for one
 * somebody invoked by hand -- the distinction matters on the dashboard,
 * where a schedule that has quietly stopped and is being covered by manual
 * runs otherwise looks exactly like a healthy schedule.
 */
export async function beginJobRun(
  job: string,
  trigger: string
): Promise<JobRunHandle> {
  try {
    // cuid2 rather than gen_random_uuid(), so ids here look like ids
    // everywhere else -- every other table in lib/schema generates them this
    // way, and a lone uuid in a text id column is the kind of inconsistency
    // that costs somebody an afternoon later.
    const id = createId();
    await db.execute(sql`
      INSERT INTO job_runs (id, job, trigger, started_at)
      VALUES (${id}, ${job}, ${trigger}, now())
    `);
    return id;
  } catch (error) {
    warn('beginJobRun', error);
    return null;
  }
}

export interface JobRunOutcome {
  ok: boolean;
  /** The job's own report. Stored verbatim; shape belongs to the job. */
  report: unknown;
  errorCount: number;
}

/**
 * Close out a run, then trim history past the retention horizon.
 *
 * The trim rides along here rather than living in its own scheduled task, on
 * the principle the purge already follows: a cleanup that needs its own
 * cleanup has not finished the job. It is one bounded DELETE against an
 * indexed column, hourly.
 *
 * A null handle means the start was never recorded, so there is nothing to
 * update -- but the trim still runs, because a ledger that cannot write is
 * exactly the situation where old rows would otherwise accumulate unattended.
 */
export async function completeJobRun(
  handle: JobRunHandle,
  outcome: JobRunOutcome
): Promise<void> {
  if (handle) {
    try {
      await db.execute(sql`
        UPDATE job_runs
        SET finished_at = now(),
            ok = ${outcome.ok},
            report = ${JSON.stringify(outcome.report ?? null)}::jsonb,
            error_count = ${outcome.errorCount}
        WHERE id = ${handle}
      `);
    } catch (error) {
      warn('completeJobRun', error);
    }
  }

  try {
    await db.execute(sql`
      DELETE FROM job_runs
      WHERE started_at < now() - (${RETENTION_DAYS} || ' days')::interval
    `);
  } catch (error) {
    warn('trim', error);
  }
}
