import SurfaceLink from '@/components/panaverse/SurfaceLink';
import { TallyBars } from '@/components/connectors/dashboard-parts';
import {
  EventBoard,
  RosterEditor,
} from '@/components/connectors/admin-console';
import { AdminPageHeader, Panel, StatBand } from '@/components/Admin/parts';
import { requireConnectorsAdmin } from '@/lib/connectors/admin-gate';
import { countConnectorApplications } from '@/lib/connectors/membership';
import { listRoster, rosterTallies } from '@/lib/connectors/roster';
import { commitmentTotals } from '@/lib/connectors/commitments';
import { listEventsForAdmin } from '@/lib/connectors/events';
import { ADMIN_CHROME } from '@/lib/admin/theme';
import { PODS } from '@/lib/connectors/model';

/**
 * The programme admin view — the state of the programme, at a glance.
 *
 * This is a redraw of the Connector Dashboard the panas keep in Google Sheets:
 * same stat band, same pod and house breakdowns, same roster. Somebody who has
 * been reading the sheet should recognise it immediately and not have to be
 * retrained.
 *
 * What it changes is where the numbers come from. In the sheet every figure is
 * typed by hand and drifts — the header says twenty-six connectors over a list
 * of nineteen, and nobody can tell which is wrong. Here every number is
 * counted from the rows underneath it, so the band cannot disagree with the
 * table. `rosterTallies()` takes the roster as an argument for exactly that
 * reason: the band provably counts the same rows the editor renders.
 *
 * ## Why this page got smaller
 *
 * It used to carry everything: the application queue, the roster, the events,
 * the commitments table and the assign form, in one column. That is three jobs
 * stacked on one scroll — deciding who gets in, keeping the roster right, and
 * handing out work — and they are done by different people at different times.
 * Each now has its own page, and this one keeps only what answers "how is the
 * programme doing", which is the question somebody opening it cold is asking.
 *
 * The three pages used to carry a tab strip across the top of each. The admin
 * sidebar now nests Applications and Scheduling under Pana Connectors, which
 * says the same thing in the place a reader already looks for navigation, so
 * the strip was two controls for one job sitting a few hundred pixels apart.
 * It went, and with it the pending-application count that Scheduling was
 * querying purely to badge a tab it no longer draws. The count still appears
 * on this page, in the stat band, where it is read rather than decorative.
 *
 * Events stayed here rather than moving to Scheduling. They are the
 * programme's calendar, not one person's workload, and nothing about running
 * an event is attributed to a connector — `lead` is free text. Scheduling is
 * about who has room to take something on; an event has no owner to load.
 *
 * ## Why it lives here and not under /connectors
 *
 * It moved off the Connectors surface because of who it is for. Connectors is
 * a members' surface: a pana lands there to find their house, their pod and
 * what they said they would do. This page is nobody's own — it is a staff tool
 * that happens to be about connectors, and it belongs with the other staff
 * tools. `/connectors/admin` still answers and redirects here.
 *
 * The consequence is that the furniture changed colour. The panels, the stat
 * band and the table headers wear the admin blue rather than the Connectors
 * indigo, because an admin needs to be able to tell at a glance that they are
 * holding tools that change what other people see. House colours stay as they
 * are: those identify data, not the tool showing it.
 *
 * ## What the mock had that this does not
 *
 * Three panels are gone rather than ported, and the reason is the same in each
 * case: nothing could have filled them.
 *
 *   - **Birthdays.** There is no date of birth on a profile — not in the
 *     schema, not on the join form. Collecting one is a product decision with
 *     a privacy answer attached, not a gap to quietly fill.
 *   - **Open asks.** No table, and the fixture's "asked by" names were people
 *     who do not exist.
 *   - **Volunteer sign-up counts.** The mock read "3 more of 8". There is no
 *     sign-up table, so the 5 was invented. Events say how many are wanted
 *     and do not claim to know how many have come forward.
 *
 * The sheet's "Sync with Google Sheets" banner and "Add to the sheet" picker
 * are not here either: if this page exists, the sheet is no longer the system
 * of record and syncing back would just recreate the drift. The sheet's
 * read-only action log is worth having and is still missing — it wants an
 * audit trail behind it before it means anything.
 */

export const metadata = {
  title: 'Connectors | Pana Admin',
  robots: { index: false, follow: false },
};

export default async function AdminConnectorsPage() {
  await requireConnectorsAdmin('/admin/connectors');

  /* Four independent reads. None of them depends on another, so running them
   * in series would make the page as slow as their sum for no reason. */
  const [pendingCount, roster, totals, events] = await Promise.all([
    countConnectorApplications(),
    listRoster(),
    commitmentTotals(),
    listEventsForAdmin(),
  ]);

  const tallies = rosterTallies(roster);

  const rosterRows = roster.map((member) => ({
    profileId: member.profileId,
    displayName: member.displayName,
    pod: member.membership.pod,
    houses: member.membership.houses,
    tier: member.membership.tier,
  }));

  const band = [
    {
      label: 'Connectors',
      value: String(tallies.total),
      note: `${pendingCount} waiting on a decision`,
    },
    {
      label: 'Open commitments',
      value: String(totals.open),
      note: `${totals.done} closed out`,
    },
    {
      label: 'Assigned by staff',
      value: String(totals.assigned),
      note: 'The rest people took on themselves',
    },
    {
      label: 'Upcoming events',
      value: String(events.upcoming.length),
      note:
        events.staleRecurring.length > 0
          ? `${events.staleRecurring.length} need a new date`
          : 'Calendar is current',
    },
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow="Community"
        title="Connector dashboard"
        description={
          <>
            <p>
              Every number on this page is counted from the rows below it. If
              the cards and a table ever disagree, the bug is here and not in
              your reading of it.
            </p>
            <p className="mt-3 text-sm">
              <SurfaceLink
                href="/connectors/hq"
                className={`font-extrabold underline underline-offset-4 ${ADMIN_CHROME.ACCENT}`}
              >
                Open Connector HQ
              </SurfaceLink>
              <span className="text-pana-ink/60">
                {' '}
                — the members&rsquo; view of the same programme.
              </span>
            </p>
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <StatBand stats={band} />

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Connectors by pod">
            <TallyBars rows={tallies.pods} />
            <p className="text-pana-ink/60 mt-4 text-xs leading-relaxed">
              Pods are geographic. {PODS.map((p) => p.region).join(', ')}.
            </p>
          </Panel>

          <Panel title="Connectors by house">
            <TallyBars rows={tallies.houses} />
            <p className="text-pana-ink/60 mt-4 text-xs leading-relaxed">
              Houses describe the kind of work, not where somebody lives. Counts
              add up to more than {tallies.total} because a connector can be in
              more than one.
            </p>
          </Panel>
        </div>

        <Panel title="Roster">
          <RosterEditor rows={rosterRows} />
        </Panel>

        {/* Inside a Panel, not loose on the page. The cards are cream and so
         * is the admin background — on bare page they were a cream rectangle
         * on cream paper, readable only by their border. A Panel puts white
         * underneath them, which is the same relationship they have on
         * Connectors HQ, where cream-inside-white is the documented rule for
         * anything sitting within a panel. */}
        <Panel title="Coming up">
          <EventBoard
            upcoming={events.upcoming}
            staleRecurring={events.staleRecurring}
          />
        </Panel>
      </div>
    </>
  );
}
