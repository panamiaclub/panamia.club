import { AdminPageHeader } from '@/components/Admin/parts';
import { ConnectorAdminTabs } from '@/components/Admin/connectors-tabs';
import { CoordinationDesk } from '@/components/connectors/coordination-desk';
import { requireConnectorsAdmin } from '@/lib/connectors/admin-gate';
import { listRoster } from '@/lib/connectors/roster';
import {
  connectorLoads,
  eventStaffing,
  listAssignableEvents,
  listOpenCommitments,
} from '@/lib/connectors/commitments';
import {
  listOpportunities,
  listOpportunityCrew,
} from '@/lib/connectors/opportunities';
import { EMPTY_STAFFING } from '@/lib/connectors/event-link';
import { EMPTY_LOAD } from '@/lib/connectors/hours';

export const metadata = {
  title: 'Connector coordination | Pana Admin',
  robots: { index: false, follow: false },
};

export default async function AdminConnectorSchedulingPage() {
  await requireConnectorsAdmin('/admin/connectors/scheduling');

  const [roster, loads, commitments, assignable, opportunities, crew] =
    await Promise.all([
      listRoster(),
      connectorLoads(),
      listOpenCommitments(null, true),
      listAssignableEvents(),
      listOpportunities(),
      listOpportunityCrew(),
    ]);
  const [programmeStaffing, publicStaffing] = await Promise.all([
    eventStaffing(
      'programme',
      assignable
        .filter((event) => event.kind === 'programme')
        .map((event) => event.id)
    ),
    eventStaffing(
      'public',
      assignable
        .filter((event) => event.kind === 'public')
        .map((event) => event.id)
    ),
  ]);
  const staffing = assignable.map((event) => ({
    event,
    staffing:
      (event.kind === 'programme' ? programmeStaffing : publicStaffing).get(
        event.id
      ) ?? EMPTY_STAFFING,
  }));
  const people = roster.map((member) => ({
    profileId: member.profileId,
    displayName: member.displayName,
    houses: member.membership.houses,
    pod: member.membership.pod,
    load: loads.get(member.profileId) ?? EMPTY_LOAD,
  }));

  return (
    <>
      <AdminPageHeader
        eyebrow="Community"
        title="Keep the work moving."
        description={
          <p>
            The coordinator desk for Pana Connectors. Open needs, shared
            commitments, and a clearer picture of what everyone is carrying.
          </p>
        }
      />
      <ConnectorAdminTabs />
      <CoordinationDesk
        opportunities={opportunities}
        crew={crew}
        commitments={commitments}
        people={people}
        events={assignable}
        staffing={staffing}
      />
    </>
  );
}
