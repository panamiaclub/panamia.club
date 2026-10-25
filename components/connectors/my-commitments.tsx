'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Check, Clock3, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  HousePill,
  ProgressPill,
  formatDay,
} from '@/components/connectors/dashboard-parts';
import {
  WORK_BUTTON,
  WORK_CARD,
  WORK_DIALOG,
  WORK_FIELD,
  WORK_SECONDARY,
  OpportunityFacts,
  focusWorkNavigation,
  useWorkDialogFocus,
  WorkError,
} from '@/components/connectors/workflow-parts';
import { HOUSES } from '@/lib/connectors/model';
import type { CommitmentProgress, HouseId } from '@/lib/connectors/model';
import type { ConnectorCommitment } from '@/lib/connectors/commitments';
import type { ConnectorOpportunity } from '@/lib/connectors/opportunities-model';
import { opportunityStatus } from '@/lib/connectors/opportunities-model';
import { formatMinutes, MAX_HOURS, parseHours } from '@/lib/connectors/hours';
import { saveConnectorWork } from '@/lib/connectors/client';

export function MyCommitments({
  commitments,
  houses,
  opportunities,
  completed = false,
  onBrowse,
}: {
  commitments: readonly ConnectorCommitment[];
  houses: readonly HouseId[];
  opportunities: readonly ConnectorOpportunity[];
  completed?: boolean;
  onBrowse: () => void;
}) {
  const router = useRouter();
  const dialogFocus = useWorkDialogFocus();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const busy = saving || pending;
  const selected = commitments.find((row) => row.id === selectedId);
  const selectedOpportunity = opportunities.find(
    (item) => item.id === selected?.opportunityId
  );
  const rows = commitments.filter(
    (row) => (row.progress === 'done') === completed
  );

  async function send(
    body: Record<string, unknown>,
    success: string,
    method: 'POST' | 'PATCH' = 'PATCH'
  ) {
    setSaving(true);
    setError(null);
    const failure = await saveConnectorWork(
      '/api/connectors/commitments',
      method,
      body
    );
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    if (
      body.remove === true ||
      (typeof body.progress === 'string' &&
        (body.progress === 'done') !== completed)
    ) {
      dialogFocus.opener.current = null;
      focusWorkNavigation();
    }
    setMessage(success);
    setAdding(false);
    setSelectedId(null);
    setConfirmRemove(false);
    startTransition(() => router.refresh());
  }

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const hours = data.get('hours');
    const estimatedMinutes = parseHours(typeof hours === 'string' ? hours : '');
    if (estimatedMinutes === 'invalid') {
      setError(`Hours must be between 0 and ${MAX_HOURS}.`);
      return;
    }
    const what = data.get('what');
    if (typeof what !== 'string' || !what.trim()) {
      setError('Say what you will do.');
      return;
    }
    await send(
      {
        what,
        when: data.get('when'),
        house: data.get('house'),
        estimatedMinutes,
      },
      'Your commitment is on the board and in the coordinator view.',
      'POST'
    );
  }

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight">
            {completed ? 'Small things add up.' : 'On your board'}
          </h2>
          <p className="text-pana-ink/65 mt-1 text-xs leading-relaxed">
            {completed
              ? "Here's what you've followed through on."
              : 'Work you picked up and work your coordinators set for you.'}
          </p>
        </div>
        {!completed && (
          <button
            type="button"
            className={`${WORK_SECONDARY} shrink-0 whitespace-nowrap`}
            onClick={(event) => {
              dialogFocus.remember(event);
              setError(null);
              setAdding(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add my own
          </button>
        )}
      </div>
      <div className="mb-3 empty:hidden" role="status">
        {message && (
          <p className="text-pana-indigo text-sm font-bold">{message}</p>
        )}
      </div>
      {!adding && !selected && <WorkError message={error} />}
      <div className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <div className={`${WORK_CARD} border-dashed py-10 text-center`}>
            <h3 className="text-xl font-extrabold">
              {completed
                ? 'Your first follow-through is ahead.'
                : "You're clear for now."}
            </h3>
            <p className="text-pana-ink/65 mx-auto mt-3 mb-5 max-w-sm text-sm">
              {completed
                ? 'Mark something done when you have followed through. It will live here, not disappear.'
                : 'Pick up something that fits, or write down a small commitment of your own.'}
            </p>
            <button type="button" className={WORK_BUTTON} onClick={onBrowse}>
              Find a way to help
            </button>
          </div>
        ) : (
          rows.map((row) => {
            const opportunity = opportunities.find(
              (item) => item.id === row.opportunityId
            );
            return (
              <article key={row.id} className={WORK_CARD}>
                <div className="flex flex-wrap items-center gap-2">
                  <HousePill houseId={row.house} />
                  <span className="text-pana-ink/60 text-[0.65rem] font-bold">
                    {row.assignedBy
                      ? 'Assigned by a coordinator'
                      : row.opportunityId
                        ? 'You picked this up'
                        : 'Your own commitment'}
                  </span>
                </div>
                <h3 className="mt-3 mb-3 text-lg leading-snug font-extrabold tracking-tight">
                  {row.what}
                </h3>
                <div className="text-pana-ink/65 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  <p className="flex items-start gap-2">
                    <CalendarDays
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    {row.when ??
                      (opportunity?.eventStartsAt
                        ? formatDay(new Date(opportunity.eventStartsAt))
                        : 'Timing to be agreed')}
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {row.estimatedMinutes === null
                      ? 'Effort not estimated'
                      : `${formatMinutes(row.estimatedMinutes)} estimated`}
                  </p>
                </div>
                {row.eventTitle && (
                  <p className="text-pana-indigo mt-2 text-xs font-bold">
                    For {row.eventTitle}
                    {opportunity?.eventStartsAt
                      ? ` / ${formatDay(new Date(opportunity.eventStartsAt))}`
                      : ''}
                  </p>
                )}
                {opportunity &&
                  ['closed', 'unavailable'].includes(
                    opportunityStatus(opportunity)
                  ) && (
                    <p className="bg-pana-butter-2 mt-3 rounded-lg px-3 py-2 text-xs">
                      This opportunity is no longer accepting signups. Check in
                      with your coordinator about the work already on your
                      board.
                    </p>
                  )}
                <div className="border-pana-ink/10 mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <ProgressPill progress={row.progress} />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label={`Details for ${row.what}`}
                      className="text-pana-ink/65 min-h-11 text-xs font-bold underline underline-offset-4"
                      onClick={(event) => {
                        dialogFocus.remember(event);
                        setSelectedId(row.id);
                        setConfirmRemove(false);
                        setError(null);
                      }}
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className={
                        row.progress === 'done' ? WORK_SECONDARY : WORK_BUTTON
                      }
                      onClick={() =>
                        send(
                          {
                            id: row.id,
                            progress:
                              row.progress === 'inProgress'
                                ? 'done'
                                : 'inProgress',
                          },
                          row.progress === 'inProgress'
                            ? 'Followed through. Moved to Completed, with coordinator progress updated.'
                            : 'Progress updated on your board and the coordinator view.'
                        )
                      }
                    >
                      {row.progress === 'inProgress' && (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      )}
                      {row.progress === 'notSet'
                        ? "I'm on it"
                        : row.progress === 'inProgress'
                          ? 'Mark done'
                          : 'Reopen'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
      <Dialog
        open={adding}
        onOpenChange={(open) => {
          if (!busy) setAdding(open);
        }}
      >
        <DialogContent
          className={WORK_DIALOG}
          onCloseAutoFocus={dialogFocus.restore}
        >
          <DialogTitle className="text-2xl font-extrabold">
            Make it your own.
          </DialogTitle>
          <DialogDescription className="text-pana-ink/65">
            Be specific enough that you know what showing up looks like. Small
            is fine.
          </DialogDescription>
          <form onSubmit={add} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold sm:col-span-2">
              What will you do?
              <input
                name="what"
                required
                maxLength={500}
                className={`${WORK_FIELD} mt-1.5`}
                placeholder="A small, specific thing you can do"
              />
            </label>
            <label className="text-xs font-bold">
              House
              <select
                name="house"
                defaultValue={houses[0] ?? HOUSES[0].id}
                className={`${WORK_FIELD} mt-1.5`}
              >
                {[...HOUSES]
                  .sort(
                    (a, b) =>
                      Number(houses.includes(b.id)) -
                      Number(houses.includes(a.id))
                  )
                  .map((house) => (
                    <option value={house.id} key={house.id}>
                      {house.name}
                      {houses.includes(house.id) ? '' : ' (another house)'}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-xs font-bold">
              Estimated effort in hours
              <input
                name="hours"
                inputMode="decimal"
                placeholder="Not estimated yet"
                className={`${WORK_FIELD} mt-1.5`}
              />
            </label>
            <label className="text-xs font-bold sm:col-span-2">
              When
              <input
                name="when"
                maxLength={120}
                className={`${WORK_FIELD} mt-1.5`}
                placeholder="A date, before the next huddle, or flexible"
              />
            </label>
            <div className="sm:col-span-2">
              <WorkError message={error} />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setAdding(false)}
                className={WORK_SECONDARY}
              >
                Not now
              </button>
              <button disabled={busy} className={WORK_BUTTON}>
                {busy ? 'Saving...' : 'Add my commitment'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
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
          <DialogTitle className="pr-5 text-xl font-extrabold">
            {confirmRemove
              ? selected?.opportunityId
                ? 'Release your spot?'
                : 'Remove this commitment?'
              : selected?.what}
          </DialogTitle>
          <DialogDescription className="text-pana-ink/65">
            {confirmRemove
              ? selected?.opportunityId
                ? 'Your commitment will leave the board and the coordinator crew count will update. If the opportunity is still open, someone else can take the spot.'
                : 'This commitment will leave your board and the coordinator view.'
              : selected?.assignedBy
                ? 'Assigned work stays on your board. If plans change, check in with the coordinator.'
                : selected?.opportunityId
                  ? 'You picked this up. If plans change, you can release your spot.'
                  : 'This is your own commitment.'}
          </DialogDescription>
          {selected && selectedOpportunity && !confirmRemove && (
            <>
              <p className="text-pana-ink/65 text-sm leading-relaxed whitespace-pre-wrap">
                {selectedOpportunity.details}
              </p>
              <OpportunityFacts
                opportunity={{
                  ...selectedOpportunity,
                  when: selected.when,
                  estimatedMinutes: selected.estimatedMinutes,
                }}
              />
            </>
          )}
          {selected && !confirmRemove && (
            <label className="text-xs font-bold">
              Progress
              <select
                aria-label={`Progress on ${selected.what}`}
                className={`${WORK_FIELD} mt-2`}
                value={selected.progress}
                disabled={busy}
                onChange={(event) => {
                  const progress = event.target.value;
                  if (
                    progress === 'notSet' ||
                    progress === 'inProgress' ||
                    progress === 'done'
                  )
                    send(
                      {
                        id: selected.id,
                        progress: progress satisfies CommitmentProgress,
                      },
                      'Progress updated in both views.'
                    );
                }}
              >
                <option value="notSet">Not started</option>
                <option value="inProgress">In progress</option>
                <option value="done">Done</option>
              </select>
            </label>
          )}
          <WorkError message={error} />
          <div className="flex flex-wrap justify-end gap-2">
            {selected &&
              !selected.assignedBy &&
              (confirmRemove ? (
                <button
                  type="button"
                  disabled={busy}
                  className={WORK_BUTTON}
                  onClick={() =>
                    send(
                      { id: selected.id, remove: true },
                      selected.opportunityId
                        ? 'Spot released. Your board and the coordinator crew count have been updated.'
                        : 'Commitment removed from the shared view.'
                    )
                  }
                >
                  {busy
                    ? 'Saving...'
                    : selected.opportunityId
                      ? 'Release my spot'
                      : 'Remove commitment'}
                </button>
              ) : (
                <button
                  type="button"
                  className={WORK_SECONDARY}
                  onClick={() => setConfirmRemove(true)}
                >
                  {selected.opportunityId
                    ? 'Release my spot'
                    : 'Remove commitment'}
                </button>
              ))}
            <button
              type="button"
              disabled={busy}
              className={WORK_SECONDARY}
              onClick={() => setSelectedId(null)}
            >
              {confirmRemove ? 'Keep it' : 'Got it'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
