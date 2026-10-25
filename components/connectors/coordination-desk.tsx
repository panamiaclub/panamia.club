'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  HousePill,
  ProgressPill,
} from '@/components/connectors/dashboard-parts';
import { LoadTable } from '@/components/connectors/load-table';
import type { LoadRow } from '@/components/connectors/load-table';
import { StaffingTable } from '@/components/connectors/staffing-table';
import type { StaffingRow } from '@/components/connectors/staffing-table';
import { OpportunityBoard } from '@/components/connectors/opportunity-board';
import { OpportunityEditor } from '@/components/connectors/opportunity-editor';
import {
  ADMIN_WORK_BUTTON,
  WORK_CARD,
  WORK_DIALOG,
  WORK_FIELD,
  WORK_SECONDARY,
  WorkError,
  WorkFilters,
  useWorkDialogFocus,
} from '@/components/connectors/workflow-parts';
import type { ConnectorCommitmentWithOwner } from '@/lib/connectors/commitments';
import type {
  ConnectorOpportunity,
  OpportunityCrewMember,
} from '@/lib/connectors/opportunities-model';
import { opportunityStatus } from '@/lib/connectors/opportunities-model';
import type { AssignableEvent } from '@/lib/connectors/event-link';
import type { PodId } from '@/lib/connectors/model';
import { getHouse } from '@/lib/connectors/model';
import { formatMinutes } from '@/lib/connectors/hours';
import { saveConnectorWork } from '@/lib/connectors/client';

export interface CoordinationPerson extends LoadRow {
  pod: PodId;
}
type DeskTab = 'needs' | 'commitments' | 'people';

export function CoordinationDesk({
  opportunities,
  crew,
  commitments,
  people,
  events,
  staffing,
}: {
  opportunities: readonly ConnectorOpportunity[];
  crew: readonly OpportunityCrewMember[];
  commitments: readonly ConnectorCommitmentWithOwner[];
  people: readonly CoordinationPerson[];
  events: readonly AssignableEvent[];
  staffing: StaffingRow[];
}) {
  const router = useRouter();
  const dialogFocus = useWorkDialogFocus();
  const [tab, setTab] = useState<DeskTab>('needs');
  const [editor, setEditor] = useState<ConnectorOpportunity | null | undefined>(
    undefined
  );
  const [filters, setFilters] = useState({
    house: 'all',
    pod: 'all',
    query: '',
  });
  const [peopleFilters, setPeopleFilters] = useState({
    house: 'all',
    pod: 'all',
    query: '',
  });
  const [personFilter, setPersonFilter] = useState('all');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const busy = saving || pending;
  const selected = commitments.find((row) => row.id === selectedId);
  const active = commitments.filter((row) => row.progress !== 'done');
  const openNeeds = opportunities.filter(
    (item) => opportunityStatus(item) === 'open'
  ).length;
  const members = new Map(people.map((person) => [person.profileId, person]));
  const owners = new Map([
    ...people.map((person) => [person.profileId, person.displayName] as const),
    ...commitments.map((row) => [row.profileId, row.ownerName] as const),
  ]);
  const query = filters.query.trim().toLowerCase();
  const visibleWork = commitments.filter(
    (row) =>
      (includeCompleted || row.progress !== 'done') &&
      (filters.house === 'all' || row.house === filters.house) &&
      (filters.pod === 'all' ||
        members.get(row.profileId)?.pod === filters.pod) &&
      (personFilter === 'all' || personFilter === row.profileId) &&
      (!query ||
        `${row.what} ${row.ownerName} ${row.when ?? ''} ${row.eventTitle ?? ''} ${getHouse(row.house).name}`
          .toLowerCase()
          .includes(query))
  );
  const visiblePeople = people.filter(
    (person) =>
      (peopleFilters.house === 'all' ||
        person.houses.includes(peopleFilters.house)) &&
      (peopleFilters.pod === 'all' || person.pod === peopleFilters.pod) &&
      person.displayName
        .toLowerCase()
        .includes(peopleFilters.query.trim().toLowerCase())
  );
  const stats = [
    { label: 'Open needs', value: openNeeds, note: 'Accepting signups in HQ' },
    {
      label: 'Places filled',
      value: opportunities.reduce((sum, item) => sum + item.signups, 0),
      note: 'Signups, including completed work',
    },
    {
      label: 'Active commitments',
      value: active.length,
      note: `${commitments.length - active.length} followed through`,
    },
    {
      label: 'Not started',
      value: active.filter((row) => row.progress === 'notSet').length,
      note: 'A place to start a check-in',
    },
  ];

  async function remove() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const failure = await saveConnectorWork(
      `/api/admin/connectors/tasks?id=${encodeURIComponent(selected.id)}`,
      'DELETE'
    );
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    setSelectedId(null);
    dialogFocus.opener.current = null;
    setConfirmRemove(false);
    setMessage(
      'Removed from the connector board. Load and any opportunity crew count will update too.'
    );
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-pana-ink/65 max-w-xl text-sm leading-relaxed">
          Publish needs, see who&apos;s on them, and make room for
          follow-through. Connector HQ reads the same work.
        </p>
        <button
          type="button"
          className={ADMIN_WORK_BUTTON}
          onClick={(event) => {
            dialogFocus.remember(event);
            setEditor(null);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Publish opportunity
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border-pana-ink/15 rounded-2xl border bg-white p-4 sm:p-5"
          >
            <dt className="text-pana-ink/65 text-[0.65rem] font-extrabold tracking-wide uppercase">
              {stat.label}
            </dt>
            <dd className="mt-2 text-3xl font-extrabold tracking-tight">
              {stat.value}
            </dd>
            <p className="text-pana-ink/60 mt-2 text-xs leading-relaxed">
              {stat.note}
            </p>
          </div>
        ))}
      </dl>
      <nav
        aria-label="Coordination desk"
        data-work-navigation
        className="border-pana-ink/15 flex min-w-0 gap-5 overflow-x-auto border-b"
      >
        {(
          [
            { id: 'needs', label: 'Open needs' },
            { id: 'commitments', label: 'Commitments' },
            { id: 'people', label: 'People & load' },
          ] as const
        ).map((item) => (
          <button
            type="button"
            key={item.id}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
            className={`min-h-12 shrink-0 border-b-[3px] px-0.5 text-xs font-extrabold sm:text-sm ${tab === item.id ? 'border-pana-ink text-pana-ink' : 'text-pana-ink/60 border-transparent'}`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === 'needs' && (
        <OpportunityBoard
          opportunities={opportunities}
          crew={crew}
          onEdit={(opportunity, opener) => {
            dialogFocus.opener.current = opener;
            setEditor(opportunity);
          }}
        />
      )}
      {tab === 'commitments' && (
        <section className={WORK_CARD} aria-label="Programme commitments">
          <h2 className="text-xl font-extrabold tracking-tight">
            The work, in one place.
          </h2>
          <p className="text-pana-ink/65 mt-2 mb-5 text-sm leading-relaxed">
            Assigned tasks, opportunity signups, and self-directed work.
            Progress belongs to the connector; this view follows their updates.
          </p>
          <WorkFilters
            value={filters}
            onChange={setFilters}
            searchLabel="Search commitments or people"
          />
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <label className="min-w-0 text-xs font-bold">
              Connector
              <select
                value={personFilter}
                onChange={(event) => setPersonFilter(event.target.value)}
                className={`${WORK_FIELD} mt-1.5`}
              >
                <option value="all">All connectors</option>
                {[...owners]
                  .sort((a, b) => a[1].localeCompare(b[1]))
                  .map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-pana-ink/65 inline-flex min-h-11 items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={(event) => setIncludeCompleted(event.target.checked)}
              />
              Include completed work
            </label>
          </div>
          <p
            role="status"
            className="text-pana-indigo mb-3 text-sm font-bold empty:hidden"
          >
            {message}
          </p>
          <p className="text-pana-ink/60 mb-3 text-xs">
            {visibleWork.length} matching{' '}
            {visibleWork.length === 1 ? 'commitment' : 'commitments'}. Pod
            filters use the active roster.
          </p>
          {visibleWork.length === 0 ? (
            <p className="text-pana-ink/65 border-pana-ink/20 rounded-xl border border-dashed px-4 py-8 text-center text-sm">
              No commitments match. Try including completed work or changing a
              filter.
            </p>
          ) : (
            <ul className="divide-pana-ink/15 divide-y">
              {visibleWork.map((row) => (
                <li
                  key={row.id}
                  className="grid min-w-0 items-center gap-3 py-4 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <HousePill houseId={row.house} />
                      <span className="text-pana-ink/60 text-[0.65rem] font-bold">
                        {row.assignedBy
                          ? 'Assigned'
                          : row.opportunityId
                            ? 'Picked up'
                            : 'Self-directed'}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-extrabold">{row.what}</h3>
                    <p className="text-pana-ink/65 mt-1 text-xs">
                      {row.ownerName}
                      {row.when ? ` / ${row.when}` : ''} /{' '}
                      {row.estimatedMinutes === null
                        ? 'Effort not estimated'
                        : `${formatMinutes(row.estimatedMinutes)} estimated`}
                    </p>
                    {row.eventTitle && (
                      <p className="text-pana-indigo mt-1 text-xs">
                        For {row.eventTitle}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <ProgressPill progress={row.progress} />
                    <button
                      type="button"
                      aria-label={`Details for ${row.what} (${row.ownerName})`}
                      className="text-pana-indigo min-h-11 text-xs font-bold underline underline-offset-4"
                      onClick={(event) => {
                        dialogFocus.remember(event);
                        setSelectedId(row.id);
                        setConfirmRemove(false);
                        setError(null);
                      }}
                    >
                      Details
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {tab === 'people' && (
        <>
          <section className={WORK_CARD} aria-label="Connector workload">
            <h2 className="text-xl font-extrabold tracking-tight">
              People, not just slots.
            </h2>
            <p className="text-pana-ink/65 mt-2 mb-5 text-sm leading-relaxed">
              Outstanding commitments, not weekly capacity. Unestimated work
              stays visible. Open someone&apos;s work before assigning more.
            </p>
            <WorkFilters
              value={peopleFilters}
              onChange={setPeopleFilters}
              searchLabel="Search connectors"
            />
            <LoadTable
              rows={visiblePeople}
              events={events}
              onViewWork={(id) => {
                setPersonFilter(id);
                setFilters({ house: 'all', pod: 'all', query: '' });
                setTab('commitments');
              }}
            />
          </section>
          <details className={WORK_CARD}>
            <summary className="cursor-pointer text-sm font-extrabold">
              Outstanding event work
            </summary>
            <p className="text-pana-ink/65 mt-3 mb-4 text-xs leading-relaxed">
              This existing staffing view counts open commitment rows, not
              unique people or reserved opportunity places. Completed work is
              excluded here, but keeps its place in an opportunity&apos;s crew
              count.
            </p>
            <StaffingTable rows={staffing} />
          </details>
        </>
      )}
      {editor !== undefined && (
        <OpportunityEditor
          key={editor?.id ?? 'new'}
          opportunity={editor}
          events={events}
          onClose={(saved) => {
            if (saved) {
              dialogFocus.opener.current = null;
              setTab('needs');
            }
            setEditor(undefined);
          }}
          onCloseAutoFocus={dialogFocus.restore}
        />
      )}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !busy) setSelectedId(null);
        }}
      >
        <DialogContent
          className={WORK_DIALOG}
          onCloseAutoFocus={dialogFocus.restore}
        >
          {selected && (
            <>
              <DialogTitle className="pr-4 text-xl font-extrabold">
                {confirmRemove ? 'Take this off the board?' : selected.what}
              </DialogTitle>
              <DialogDescription className="text-pana-ink/65">
                {confirmRemove
                  ? `This removes the commitment from ${selected.ownerName}'s board and updates their load. ${selected.opportunityId ? 'Their opportunity crew count also updates.' : 'It does not mark the work done.'}`
                  : `${selected.ownerName}'s commitment. Only the connector can change progress; coordinators can remove work that no longer belongs on their board.`}
              </DialogDescription>
              {!confirmRemove && <ProgressPill progress={selected.progress} />}
              <WorkError message={error} />
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className={WORK_SECONDARY}
                  onClick={() => {
                    if (confirmRemove) remove();
                    else setConfirmRemove(true);
                  }}
                >
                  {busy
                    ? 'Saving...'
                    : confirmRemove
                      ? 'Remove from board'
                      : 'Remove commitment'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={WORK_SECONDARY}
                  onClick={() => setSelectedId(null)}
                >
                  {confirmRemove ? 'Keep it' : 'Got it'}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
