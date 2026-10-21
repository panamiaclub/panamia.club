import { CommitmentsTable } from '@/components/connectors/dashboard-parts';
import { LoadTable } from '@/components/connectors/load-table';
import { StaffingTable } from '@/components/connectors/staffing-table';
import { AdminPageHeader, Panel, StatBand } from '@/components/Admin/parts';
import { ConnectorAdminTabs } from '@/components/Admin/connectors-tabs';
import { requireConnectorsAdmin } from '@/lib/connectors/admin-gate';
import { listRoster } from '@/lib/connectors/roster';
import {
  connectorLoads,
  eventStaffing,
  listAssignableEvents,
  listOpenCommitments,
} from '@/lib/connectors/commitments';
import { EMPTY_STAFFING, isUnderstaffed } from '@/lib/connectors/event-link';
import { EMPTY_LOAD, formatMinutes } from '@/lib/connectors/hours';
import { ADMIN_CHROME } from '@/lib/admin/theme';

/**
 * Handing work out, with some idea of who can take it.
 *
 * The assign form used to sit at the bottom of the dashboard under the open
 * commitments table, which meant the only thing visible while choosing a name
 * from the dropdown was a list of tasks sorted by nothing in particular. You
 * could see all the work and none of the workers. Picking fairly meant
 * reading the whole table and counting in your head, so in practice people
 * picked whoever they had just been talking to.
 *
 * This page answers the question actually being asked at the moment of
 * assigning — who has room — and then lets you act on the answer in place.
 *
 * ## The form lives in the row, not in a panel of its own
 *
 * It was briefly a second panel beside the load table, which was an
 * improvement on stacking but still asked the same question twice: you found
 * somebody with room by reading the list, then found them again in a
 * dropdown. The dropdown was a worse copy of the thing next to it — the same
 * names with none of the information you had just used to choose between
 * them.
 *
 * So assigning starts from the row. The person is already decided by the time
 * the form appears, which removes the picker, narrows the house list to the
 * houses they are actually in before the first render, and keeps their load
 * on screen while you describe the work.
 *
 * That gives the roster the full width back. Crew by event and the open
 * commitments stay beneath it: both are read after a name has been chosen
 * rather than while choosing one.
 *
 * ## Load is observed, not declared
 *
 * Nobody states a capacity, so none is shown. See `components/connectors/
 * load-table.tsx` for why the bars are relative and why unsized work is
 * counted separately instead of being treated as zero.
 *
 * The figure is hours **outstanding**, not hours per week. Commitments carry
 * `when` as free text — "before the next huddle", "Saturdays" — so there is no
 * date to bucket by and any per-week number would be invented. Outstanding is
 * what can be counted honestly from what exists.
 *
 * ## Events are here too, as the other half of the question
 *
 * Load answers "who has room". Staffing answers "what still needs people".
 * Assigning well needs both: a free connector is only useful next to the
 * thing nobody has picked up.
 *
 * This became possible with drizzle/0061. Before it, a commitment could not
 * name an event, so `connector_events.volunteersNeeded` counted up from
 * nothing and an event asking for five people had no way to say whether it
 * had four or none. Staffing is still not folded into load — an event is a
 * target to fill, not work owned by a person, and a connector's hours are
 * counted from their commitments whether or not those name an event.
 */

export const metadata = {
  title: 'Connector scheduling | Pana Admin',
  robots: { index: false, follow: false },
};

export default async function AdminConnectorSchedulingPage() {
  await requireConnectorsAdmin('/admin/connectors/scheduling');

  const [roster, loads, openWork, assignable] = await Promise.all([
    listRoster(),
    connectorLoads(),
    listOpenCommitments(40),
    listAssignableEvents(),
  ]);

  /* Two queries rather than one because the id spaces are separate — a public
   * event and a programme event can hold the same cuid2 without colliding in
   * their own tables, so one map keyed by bare id could cross them. */
  const [programmeStaffing, publicStaffing] = await Promise.all([
    eventStaffing(
      'programme',
      assignable.filter((e) => e.kind === 'programme').map((e) => e.id)
    ),
    eventStaffing(
      'public',
      assignable.filter((e) => e.kind === 'public').map((e) => e.id)
    ),
  ]);

  const staffingRows = assignable.map((event) => ({
    event,
    staffing:
      (event.kind === 'programme' ? programmeStaffing : publicStaffing).get(
        event.id
      ) ?? EMPTY_STAFFING,
  }));

  const shortHanded = staffingRows.filter((row) =>
    isUnderstaffed(row.staffing, row.event.volunteersNeeded)
  ).length;

  /* Driven by the roster, not by the load map: a connector with nothing open
   * has no row in that map at all, and they are precisely the people this page
   * exists to surface. Defaulting to EMPTY_LOAD keeps them in the table. */
  const loadRows = roster.map((member) => ({
    profileId: member.profileId,
    displayName: member.displayName,
    houses: member.membership.houses,
    load: loads.get(member.profileId) ?? EMPTY_LOAD,
  }));

  const totalMinutes = loadRows.reduce(
    (sum, row) => sum + row.load.estimatedMinutes,
    0
  );
  const totalUnsized = loadRows.reduce(
    (sum, row) => sum + row.load.unestimated,
    0
  );
  const withRoom = loadRows.filter((row) => row.load.open === 0).length;

  const band = [
    {
      label: 'Hours outstanding',
      value: totalMinutes > 0 ? formatMinutes(totalMinutes) : '—',
      note:
        totalUnsized > 0
          ? `${totalUnsized} commitment${totalUnsized === 1 ? '' : 's'} not sized`
          : 'Everything open has an estimate',
    },
    {
      label: 'Nothing open',
      value: String(withRoom),
      note: `of ${loadRows.length} on the roster`,
    },
    {
      label: 'Open commitments',
      value: String(openWork.length >= 40 ? '40+' : openWork.length),
      note: 'Across the whole programme',
    },
    {
      label: 'Short-handed',
      value: String(shortHanded),
      note:
        staffingRows.length === 0
          ? 'Nothing on the calendar'
          : `of ${staffingRows.length} upcoming`,
    },
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow="Community"
        title="Scheduling"
        description={
          <p>
            Who is carrying what, so a new task goes to somebody who can take
            it. Load is counted from open commitments — it is not a capacity,
            because the programme has never set one.
          </p>
        }
      />

      <ConnectorAdminTabs />

      <div className="flex flex-col gap-6">
        <StatBand stats={band} />

        <Panel title="Load by connector">
          <p className="text-pana-ink/70 mb-4 text-sm leading-relaxed">
            Give a task from the row of whoever should take it — the form opens
            against that person, so the house list is already narrowed to the
            houses they are in.
          </p>
          <LoadTable rows={loadRows} events={assignable} />
        </Panel>

        <Panel title="Crew by event">
          <p className="text-pana-ink/70 mb-4 text-sm leading-relaxed">
            Counted from commitments that name the event. Short-handed ones come
            first — an event that never asked for a crew is not short, it is
            simply unquantified, so it sits lower whatever its numbers.
          </p>
          <StaffingTable rows={staffingRows} />
        </Panel>

        <Panel title="Open commitments">
          {openWork.length === 0 ? (
            <p className="text-pana-ink/60 text-sm leading-relaxed">
              Nothing outstanding. Either the programme is caught up or nobody
              has written anything down.
            </p>
          ) : (
            <CommitmentsTable rows={openWork} chrome={ADMIN_CHROME} />
          )}
        </Panel>
      </div>
    </>
  );
}
