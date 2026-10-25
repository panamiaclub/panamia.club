'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import {
  OpportunityFacts,
  OpportunityState,
  WORK_CARD,
  WORK_DIALOG,
  WORK_SECONDARY,
  WorkError,
  WorkFilters,
  useWorkDialogFocus,
} from '@/components/connectors/workflow-parts';
import type {
  ConnectorOpportunity,
  OpportunityCrewMember,
} from '@/lib/connectors/opportunities-model';
import {
  matchesOpportunity,
  opportunityStatus,
} from '@/lib/connectors/opportunities-model';
import { getPod } from '@/lib/connectors/model';
import { saveConnectorWork } from '@/lib/connectors/client';

export function OpportunityBoard({
  opportunities,
  crew,
  onEdit,
}: {
  opportunities: readonly ConnectorOpportunity[];
  crew: readonly OpportunityCrewMember[];
  onEdit: (
    opportunity: ConnectorOpportunity,
    opener: HTMLElement | null
  ) => void;
}) {
  const router = useRouter();
  const dialogFocus = useWorkDialogFocus();
  const openingEditor = useRef(false);
  const [filters, setFilters] = useState({
    house: 'all',
    pod: 'all',
    query: '',
  });
  const [includeClosed, setIncludeClosed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const selected = opportunities.find((item) => item.id === selectedId);
  const visible = opportunities
    .filter(
      (item) =>
        (includeClosed || !item.closedAt) && matchesOpportunity(item, filters)
    )
    .sort(
      (a, b) =>
        Number(opportunityStatus(b) === 'open') -
        Number(opportunityStatus(a) === 'open')
    );
  const busy = saving || pending;

  async function toggleClosed(opportunity: ConnectorOpportunity) {
    setSaving(true);
    setError(null);
    const failure = await saveConnectorWork(
      '/api/admin/connectors/opportunities',
      'PATCH',
      { id: opportunity.id, closed: !opportunity.closedAt }
    );
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    setMessage(
      opportunity.closedAt
        ? 'Reopened in HQ.'
        : 'Closed to new signups. Existing commitments remain visible.'
    );
    if (!opportunity.closedAt) dialogFocus.opener.current = null;
    setSelectedId(null);
    setConfirmClose(false);
    startTransition(() => router.refresh());
  }

  return (
    <section
      className={WORK_CARD}
      aria-label="Published connector opportunities"
    >
      <h2 className="text-xl font-extrabold tracking-tight">
        Where a little help is needed
      </h2>
      <p className="text-pana-ink/65 mt-2 mb-5 text-sm leading-relaxed">
        Published here, discoverable in HQ. Every signup comes from the same
        commitments.
      </p>
      <WorkFilters value={filters} onChange={setFilters} />
      <label className="text-pana-ink/65 mb-4 inline-flex min-h-9 items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={includeClosed}
          onChange={(event) => setIncludeClosed(event.target.checked)}
        />
        Include closed opportunities
      </label>
      <p
        role="status"
        className="text-pana-indigo mb-3 text-sm font-bold empty:hidden"
      >
        {message}
      </p>
      {!selected && <WorkError message={error} />}
      {visible.length === 0 ? (
        <div className="border-pana-ink/20 rounded-xl border border-dashed px-5 py-9 text-center">
          <h3 className="text-lg font-extrabold">No needs match just yet.</h3>
          <p className="text-pana-ink/65 mt-2 text-sm">
            Publish an opportunity or try a different filter.
          </p>
        </div>
      ) : (
        <ul className="divide-pana-ink/15 divide-y">
          {visible.map((opportunity) => (
            <li
              key={opportunity.id}
              className="grid min-w-0 items-center gap-4 py-5 first:pt-1 last:pb-0 md:grid-cols-[minmax(0,1fr)_8rem_9rem_auto]"
            >
              <div className="min-w-0">
                <HousePill houseId={opportunity.house} />
                <h3 className="mt-2 text-sm font-extrabold">
                  {opportunity.title}
                </h3>
                <p className="text-pana-ink/60 mt-1 text-xs">
                  {opportunity.pod
                    ? getPod(opportunity.pod).name
                    : 'Programme-wide'}
                  {opportunity.when ? ` / ${opportunity.when}` : ''}
                </p>
              </div>
              <div>
                <span className="text-pana-ink/60 mb-1 block text-[0.6rem] font-extrabold tracking-wider uppercase">
                  Crew
                </span>
                <p className="text-sm font-extrabold">
                  {opportunity.signups}
                  {opportunity.spots === null
                    ? ' signed up'
                    : ` / ${opportunity.spots} people`}
                </p>
                {opportunity.spots !== null && (
                  <div className="bg-pana-ink/5 mt-2 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-pana-indigo h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (opportunity.signups / opportunity.spots) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
              <div>
                <OpportunityState opportunity={opportunity} />
              </div>
              <button
                type="button"
                className={`${WORK_SECONDARY} justify-self-start whitespace-nowrap`}
                onClick={(event) => {
                  dialogFocus.remember(event);
                  openingEditor.current = false;
                  setSelectedId(opportunity.id);
                  setConfirmClose(false);
                  setError(null);
                }}
              >
                View crew
                <span className="sr-only"> for {opportunity.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-pana-ink/60 mt-5 text-xs leading-relaxed">
        Signup totals include completed commitments. Finishing work does not
        reopen an agreed spot; releasing a self-chosen commitment does.
      </p>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !busy) setSelectedId(null);
        }}
      >
        <DialogContent
          className={WORK_DIALOG}
          onCloseAutoFocus={(event) => {
            if (openingEditor.current) event.preventDefault();
            else dialogFocus.restore(event);
          }}
        >
          {selected && (
            <>
              <HousePill houseId={selected.house} />
              <DialogTitle className="pr-4 text-2xl leading-snug font-extrabold">
                {confirmClose ? 'Close this opportunity?' : selected.title}
              </DialogTitle>
              <DialogDescription className="text-pana-ink/65 whitespace-pre-wrap">
                {confirmClose
                  ? "It will stop accepting signups in HQ. Existing commitments stay on their owners' boards so nobody loses track of their work."
                  : selected.details}
              </DialogDescription>
              {!confirmClose && (
                <>
                  <OpportunityFacts opportunity={selected} />
                  <OpportunityState opportunity={selected} />
                  <h3 className="mt-2 text-sm font-extrabold">
                    Who&apos;s on it
                  </h3>
                  {crew.some(
                    (person) => person.opportunityId === selected.id
                  ) ? (
                    <ul className="divide-pana-ink/15 divide-y">
                      {crew
                        .filter(
                          (person) => person.opportunityId === selected.id
                        )
                        .map((person) => (
                          <li
                            key={person.profileId}
                            className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                          >
                            <span>{person.displayName}</span>
                            <ProgressPill progress={person.progress} />
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="text-pana-ink/65 text-sm">
                      Nobody has picked this up yet.
                    </p>
                  )}
                </>
              )}
              <WorkError message={error} />
              <div className="flex flex-wrap justify-end gap-2">
                {!confirmClose && (
                  <button
                    type="button"
                    disabled={busy}
                    className={WORK_SECONDARY}
                    onClick={() => {
                      openingEditor.current = true;
                      setSelectedId(null);
                      onEdit(selected, dialogFocus.opener.current);
                    }}
                  >
                    Edit request
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  className={WORK_SECONDARY}
                  onClick={() => {
                    if (confirmClose || selected.closedAt)
                      toggleClosed(selected);
                    else setConfirmClose(true);
                  }}
                >
                  {busy
                    ? 'Saving...'
                    : selected.closedAt
                      ? 'Reopen in HQ'
                      : confirmClose
                        ? 'Close to signups'
                        : 'Close opportunity'}
                </button>
                {confirmClose && (
                  <button
                    type="button"
                    disabled={busy}
                    className={WORK_SECONDARY}
                    onClick={() => setConfirmClose(false)}
                  >
                    Keep open
                  </button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
