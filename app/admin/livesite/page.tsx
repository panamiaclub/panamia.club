import {
  AttentionStrip,
  type ExternalConsole,
  InfrastructurePanel,
  MachineryPanel,
  type RunFact,
  type WaitingItem,
} from '@/components/Admin/livesite-parts';
import { StatBand } from '@/components/Admin/parts';
import { requireAdmin } from '@/lib/admin/gate';
import {
  communitySnapshot,
  databaseSnapshot,
  databaseVerdict,
  describeBytes,
  describeGap,
  machinerySnapshot,
  machineryVerdict,
  trendNote,
} from '@/lib/admin/livesite';

/**
 * The consoles this page deliberately does not reimplement.
 *
 * Cloudflare already draws request volume and error rate better than this
 * page would, and reading those numbers here needs an account-scoped token
 * with Account Analytics: Read, which does not exist yet. The link is worth
 * more than a half-built chart in the meantime: it is where an admin would
 * go next regardless.
 *
 * The `?to=/:account/` form lets Cloudflare resolve the account itself, so
 * the account ID stays out of the HTML.
 */
const CONSOLES: readonly ExternalConsole[] = [
  {
    name: 'Requests and errors',
    blocked: 'needs a Cloudflare token with Account Analytics: Read.',
    href: 'https://dash.cloudflare.com/?to=/:account/workers/services/view/panamia-next/production/metrics',
    linkLabel: 'Cloudflare metrics',
  },
  {
    name: 'Query performance and logs',
    blocked: 'lives in Supabase and is better read there.',
    href: 'https://supabase.com/dashboard/project/_/reports/database',
    linkLabel: 'Supabase reports',
  },
];

/**
 * /admin/livesite -- is the site healthy, and is anything waiting on us?
 *
 * ## Boring when fine, loud when not
 *
 * A dashboard that always looks the same is a dashboard nobody reads, and one
 * nobody reads is worse than none at all because it is still *believed*. So
 * the attention strip renders a single quiet line when every queue is empty
 * and only grows rows when something is genuinely waiting. The page changes
 * shape when the site needs you, which is the one signal that survives being
 * seen every day.
 *
 * That is also why the queue counts are kept out of the stat band. A band of
 * five numbers that usually includes two zeroes trains you to skim all five.
 * The band carries things that are always worth a glance; the strip carries
 * things that are only ever there because they need doing.
 *
 * ## Why this does not contradict the overview
 *
 * `components/Admin/overview.tsx` deliberately shows no counts, on the
 * argument that a tool directory quoting numbers it does not own will drift
 * from the tools themselves. That still holds. The difference is ownership:
 * this page's whole job is those numbers, it reads them live per request, and
 * every one links to the tool that can clear it. The overview points at
 * doors; this one reads the building.
 *
 * ## Bands two and three
 *
 * Machinery (did the hourly job run?) reads the `job_runs` ledger that
 * lib/jobs/ledger.ts writes from the scheduled handler.
 *
 * Infrastructure splits by whether the answer is reachable. The database half
 * is measured, because Postgres will describe its own connection use and size
 * over the connection this page already holds -- no credential, no setup. The
 * Cloudflare half is not, because request volume and error rate need an
 * account-scoped Analytics token that does not exist yet, so the band links
 * to the console instead of drawing a worse version of the chart that lives
 * there. Same house pattern as `UNBUILT_TOOLS` in lib/admin/views.ts -- write
 * the gap down so it does not quietly become folklore.
 *
 * That split is also the answer to "what do we need to connect?". Supabase:
 * nothing. Cloudflare: one token, and the band says which permission.
 */

export const metadata = { title: 'Live site - Pana Admin' };

/** Always fresh. A cached health dashboard is a lie with a timestamp on it. */
export const dynamic = 'force-dynamic';

export default async function LiveSitePage() {
  await requireAdmin('/admin/livesite');

  // Two statements rather than one, which is a deliberate exception to the
  // rule stated in lib/admin/livesite.ts. Folding the machinery subqueries
  // into the community statement would save a round trip and would also mean
  // a missing `job_runs` table takes the community band down with it -- the
  // precise failure the reader goes out of its way to survive. Isolation is
  // worth the trip.
  //
  // Issued together so they parallelise if the Hyperdrive pool is ever
  // restored; at the current `max: 1` they simply queue, which is what two
  // sequential awaits would have done anyway.
  const [snap, machinery, database] = await Promise.all([
    communitySnapshot(),
    machinerySnapshot(),
    databaseSnapshot(),
  ]);

  const verdict = machineryVerdict(machinery);
  const last = machinery.lastRun;

  const facts: RunFact[] = [];
  if (last) {
    facts.push({
      label: 'Last run',
      value: `${describeGap(last.secondsSinceStart)} ago`,
    });
    if (last.durationSeconds !== null) {
      facts.push({ label: 'Took', value: describeGap(last.durationSeconds) });
    }
    facts.push({
      label: 'Cleared',
      value:
        last.storiesDeleted === 0 && last.notificationsDeleted === 0
          ? 'nothing to do'
          : `${last.storiesDeleted} ${
              last.storiesDeleted === 1 ? 'story' : 'stories'
            }, ${last.mediaDeleted} media, ${last.notificationsDeleted} notifications`,
    });
    facts.push({
      label: 'In the past day',
      value: `${machinery.runs24h} ${machinery.runs24h === 1 ? 'run' : 'runs'}`,
    });
    // Only worth saying when it is not the schedule. A row that says "10 * * * *"
    // on every run is noise; one that says somebody ran it by hand is the
    // thing that explains why a stopped cron looked healthy.
    if (last.trigger === 'manual') {
      facts.push({ label: 'Fired', value: 'by hand' });
    }
  }

  const infra = databaseVerdict(database);

  // Connections lead because they are the number with a ceiling. Size follows
  // because it is the number that only moves one way.
  const infraFacts: RunFact[] = [];
  if (database.available) {
    const s = database.stats;
    const usable = Math.max(0, s.maxConnections - s.reserved);
    infraFacts.push({
      label: 'Connections',
      value: usable > 0 ? `${s.connections} of ${usable}` : `${s.connections}`,
    });
    infraFacts.push({
      label: 'Active',
      // Null means the role is not allowed to see connection state. Rendering
      // that as 0 would read as a quiet server at exactly the moment it was
      // busy, so it says so instead.
      value: s.active === null ? 'hidden from this role' : `${s.active}`,
    });
    if (s.idleInTransaction !== null && s.idleInTransaction > 0) {
      infraFacts.push({
        label: 'Idle in transaction',
        value: `${s.idleInTransaction}`,
      });
    }
    infraFacts.push({
      label: 'Database size',
      value: describeBytes(s.sizeBytes),
    });
  }

  const waiting: WaitingItem[] = [
    {
      label: 'directory listing',
      plural: 'directory listings',
      count: snap.queues.listings,
      href: '/admin/listings',
      verb: 'waiting to be let in',
    },
    {
      label: 'contact message',
      plural: 'contact messages',
      count: snap.queues.contact,
      href: '/admin/contactus',
      verb: 'still open',
    },
    {
      label: 'abuse report',
      plural: 'abuse reports',
      count: snap.queues.reports,
      href: '/admin/reports',
      verb: 'needing triage',
    },
    {
      label: 'newsletter signup',
      plural: 'newsletter signups',
      count: snap.queues.newsletter,
      href: null,
      verb: 'not yet acknowledged',
    },
  ].filter((q) => q.count > 0);

  const totalWaiting = waiting.reduce((n, q) => n + q.count, 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold text-pana-ink">Live site</h1>
        <p className="mt-1 max-w-2xl text-sm text-pana-ink/70">
          How the website is holding up, and what is waiting on a human.
        </p>
      </header>

      <AttentionStrip waiting={waiting} />

      <StatBand
        stats={[
          {
            label: 'New panas',
            value: String(snap.signups.current),
            note: trendNote(snap.signups, 'last 7 days'),
          },
          {
            label: 'New profiles',
            value: String(snap.profiles.current),
            note: trendNote(snap.profiles, 'last 7 days'),
          },
          {
            label: 'Upcoming events',
            value: String(snap.upcomingEvents),
            note: 'published, still ahead',
          },
          {
            label: 'Panas in total',
            value: snap.totalUsers.toLocaleString(),
            note: 'accounts, all time',
          },
          {
            label: 'Waiting on us',
            value: String(totalWaiting),
            note: waiting.length ? 'across every queue' : 'all queues clear',
          },
        ]}
      />

      <MachineryPanel
        tone={verdict.tone}
        headline={verdict.headline}
        detail={verdict.detail}
        facts={facts}
      />

      <InfrastructurePanel
        tone={infra.tone}
        headline={infra.headline}
        detail={infra.detail}
        facts={infraFacts}
        consoles={CONSOLES}
      />
    </div>
  );
}
