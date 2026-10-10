/**
 * Synthetic uptime probes: fetch a handful of real URLs hourly and record what
 * a visitor would have got.
 *
 * ## Why this exists
 *
 * Nothing in /admin/livesite answered "are people hitting errors right now".
 * The three existing bands watch the community, the cron, and the database --
 * all of them look outward from inside the system. None of them is a request.
 *
 * Cloudflare already records every 5xx in Workers Observability at 100%
 * sampling, and that remains the better data: it is every real request rather
 * than four synthetic ones. It is also unreachable from here. Reading it needs
 * an account-owned API token, and the token this account can mint is a user
 * token (`cfut_`), which the GraphQL analytics endpoint refuses with
 * "authorization denied". Until somebody with Super Admin on the owning
 * account issues an account token, this is the available signal.
 *
 * ## What it can and cannot see
 *
 * It catches the failures that take the site down for everybody: a bad deploy,
 * an expired certificate, a dead database, a route that 500s. That is the
 * majority of what "the site is broken" means in practice.
 *
 * It cannot catch a failure that only some people hit -- a signed-in-only
 * crash, a bug behind a form submit, a slow query for one big account. These
 * probes are anonymous GETs. Real user monitoring is the thing that sees
 * those, and it is a larger change with a sharper edge: an error recorder that
 * writes to Postgres amplifies the outage it is reporting when Postgres is
 * what failed. Deliberately not attempted here.
 *
 * ## Why it must never break the purge
 *
 * It shares an invocation with the hourly expiry sweep, which reclaims R2
 * objects nothing else reclaims. By lib/jobs/ledger.ts's rule -- a missing
 * ledger row is a gap in a dashboard, a missing purge is a bill -- monitoring
 * is never allowed to cost maintenance. So every probe is bounded by its own
 * timeout, the whole batch is bounded by running in parallel, and
 * recordSyntheticRun() swallows everything it can throw.
 */

import {
  SYNTHETIC_JOB,
  beginJobRun,
  completeJobRun,
  type JobRunHandle,
} from './ledger';
import { DEFAULT_SURFACE, originFor } from '@/lib/panaverse/surfaces';

/**
 * How long a single probe may take before it is called a failure.
 *
 * Eight seconds is far past anything healthy -- the slowest of these answered
 * in under a second when measured -- so a probe that hits this has not found
 * a slow page, it has found one that is not coming back. Bounded because the
 * purge runs after these and must not inherit a hung socket.
 */
const PROBE_TIMEOUT_MS = 8_000;

/**
 * Answered, but slower than a visitor should accept. Recorded rather than
 * alarmed on: one slow hourly sample is noise, a run of them is a trend, and
 * the dashboard is where that distinction gets made.
 */
export const PROBE_SLOW_MS = 3_000;

/**
 * The probe set.
 *
 * Four, chosen to fail independently. Adding more costs an hourly request
 * each and buys less than it looks: these already separate the edge from the
 * render from the database, so a fifth page mostly re-tests the fourth.
 *
 * Every path here was confirmed to answer 200 in production before being
 * added. A probe that 404s because its route moved is reported as a failure
 * on purpose -- a stale probe list is itself worth hearing about, and the
 * alternative is a check that silently stops checking anything.
 */
export const PROBES: readonly { path: string; label: string }[] = [
  { path: '/', label: 'home' },
  { path: '/directory', label: 'directory page' },
  // The only probe that provably reaches Postgres and returns its rows, so it
  // is the one that fails when the database is the problem rather than the
  // render. Carries ?q= because the endpoint counts matches for a term.
  { path: '/api/directory/scope-counts?q=a', label: 'directory API' },
  { path: '/api/events', label: 'events API' },
];

export interface ProbeResult {
  path: string;
  label: string;
  /** Final status after redirects, or null if nothing answered. */
  status: number | null;
  ok: boolean;
  ms: number;
  /** Present only on failure. Short: this lands in a jsonb blob. */
  error?: string;
}

export interface SyntheticReport {
  baseUrl: string;
  probes: ProbeResult[];
  failures: number;
  slowestMs: number;
}

/**
 * One probe. Resolves to a result even when it fails -- a thrown probe would
 * take its three siblings down with it under Promise.all.
 */
async function probe(
  baseUrl: string,
  spec: { path: string; label: string }
): Promise<ProbeResult> {
  const url = new URL(spec.path, baseUrl);
  // Cache-busted so this measures the origin rather than Cloudflare's copy of
  // it. A cached 200 would keep reporting health after the Worker behind it
  // started failing, which is the exact outage this is meant to catch.
  url.searchParams.set('__probe', String(Date.now()));

  const started = Date.now();
  try {
    const response = await fetch(url.toString(), {
      headers: {
        // Identifies these in logs so an hourly blip in the analytics is not
        // mistaken for a visitor.
        'User-Agent': 'panamia-uptime-probe',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    // 3xx is already resolved by then -- fetch follows redirects by default,
    // so this is the status of whatever actually answered.
    const ok = response.status >= 200 && response.status < 400;
    return {
      path: spec.path,
      label: spec.label,
      status: response.status,
      ok,
      ms,
      ...(ok ? {} : { error: `HTTP ${response.status}` }),
    };
  } catch (error) {
    const ms = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    return {
      path: spec.path,
      label: spec.label,
      status: null,
      ok: false,
      ms,
      // Truncated: a DNS or TLS failure can carry a long chain, and this is
      // going into a jsonb column read by a dashboard.
      error: message.slice(0, 200),
    };
  }
}

/**
 * Run every probe in parallel and summarise.
 *
 * Parallel so the batch costs one timeout rather than four. These are four
 * requests an hour against the site's own edge; the load is not a
 * consideration, the wall clock ahead of the purge is.
 */
export async function runSyntheticProbes(
  baseUrl: string = originFor(DEFAULT_SURFACE)
): Promise<SyntheticReport> {
  const probes = await Promise.all(PROBES.map((spec) => probe(baseUrl, spec)));
  return {
    baseUrl,
    probes,
    failures: probes.filter((p) => !p.ok).length,
    slowestMs: probes.reduce((max, p) => Math.max(max, p.ms), 0),
  };
}

/**
 * Run the probes and write the result to the ledger. Never throws.
 *
 * The swallow is the point, not a convenience: this runs ahead of the expiry
 * purge inside the same scheduled invocation, and an exception escaping here
 * would mean a monitoring check had cancelled the maintenance it was meant to
 * be watching over.
 */
export async function recordSyntheticRun(trigger: string): Promise<void> {
  let run: JobRunHandle = null;
  try {
    run = await beginJobRun(SYNTHETIC_JOB, trigger);
    const report = await runSyntheticProbes();

    // Logged individually so a live tail shows which probe broke, matching
    // how the purge surfaces its own per-item errors.
    for (const failed of report.probes.filter((p) => !p.ok)) {
      console.error(
        '[uptime]',
        failed.label,
        failed.path,
        failed.error ?? 'failed'
      );
    }
    console.log('[uptime]', trigger, JSON.stringify(report));

    await completeJobRun(run, {
      ok: report.failures === 0,
      report,
      errorCount: report.failures,
    });
  } catch (error) {
    // Reached only if something outside the per-probe handling failed, since
    // probe() resolves rather than rejects. Recorded if the ledger still
    // works, dropped if it does not.
    const message = error instanceof Error ? error.message : String(error);
    console.error('[uptime] run failed:', message);
    try {
      await completeJobRun(run, {
        ok: false,
        report: { error: message },
        errorCount: 1,
      });
    } catch {
      // Ledger is down too. Nothing further to try, and nothing here is
      // important enough to risk the purge that runs next.
    }
  }
}
