'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ADMIN_WORK_BUTTON,
  WORK_DIALOG,
  WORK_FIELD,
  WORK_SECONDARY,
  WorkError,
} from '@/components/connectors/workflow-parts';
import { HOUSES, PODS } from '@/lib/connectors/model';
import { eventValue } from '@/lib/connectors/event-link';
import type { AssignableEvent } from '@/lib/connectors/event-link';
import type { ConnectorOpportunity } from '@/lib/connectors/opportunities-model';
import {
  OPPORTUNITY_DETAILS_MAX,
  OPPORTUNITY_LOCATION_MAX,
  OPPORTUNITY_SPOTS_MAX,
  OPPORTUNITY_TITLE_MAX,
  opportunityInputSchema,
} from '@/lib/connectors/opportunities-model';
import {
  formatMinutes,
  HOUR_PRESETS,
  MAX_HOURS,
  minutesToHoursInput,
  parseHours,
} from '@/lib/connectors/hours';
import { saveConnectorWork } from '@/lib/connectors/client';
import { formatDay } from '@/components/connectors/dashboard-parts';
import { cn } from '@/lib/utils';

export function OpportunityEditor({
  opportunity,
  events,
  onClose,
  onCloseAutoFocus,
}: {
  opportunity: ConnectorOpportunity | null;
  events: readonly AssignableEvent[];
  onClose: (saved?: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(
    minutesToHoursInput(opportunity?.estimatedMinutes ?? null)
  );
  const currentEvent = opportunity?.eventId
    ? eventValue({ kind: 'public', id: opportunity.eventId })
    : opportunity?.connectorEventId
      ? eventValue({ kind: 'programme', id: opportunity.connectorEventId })
      : '';
  const busy = saving || pending;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const estimatedMinutes = parseHours(hours);
    if (estimatedMinutes === 'invalid') {
      setError(`Estimated hours must be between 0 and ${MAX_HOURS}.`);
      return;
    }
    const spots = fields.get('spots');
    const parsed = opportunityInputSchema.safeParse({
      title: fields.get('title'),
      details: fields.get('details'),
      house: fields.get('house'),
      pod: fields.get('pod') || null,
      when: fields.get('when'),
      location: fields.get('location'),
      estimatedMinutes,
      spots: spots === '' ? null : Number(spots),
      event: fields.get('event') || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    setError(null);
    const failure = await saveConnectorWork(
      '/api/admin/connectors/opportunities',
      opportunity ? 'PATCH' : 'POST',
      { ...parsed.data, ...(opportunity ? { id: opportunity.id } : {}) }
    );
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    startTransition(() => {
      router.refresh();
      onClose(true);
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className={WORK_DIALOG}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle className="text-2xl font-extrabold">
          {opportunity ? 'Shape the request.' : 'Publish a way to help.'}
        </DialogTitle>
        <DialogDescription className="text-pana-ink/65 leading-relaxed">
          {opportunity
            ? 'Changes apply to future signups. Existing commitments keep what people agreed to. Close and republish if the work has fundamentally changed.'
            : 'This appears in Connector HQ. People can pick it up immediately, and the crew count updates here.'}
        </DialogDescription>
        <form onSubmit={submit} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold sm:col-span-2">
            What needs doing?
            <input
              name="title"
              required
              maxLength={OPPORTUNITY_TITLE_MAX}
              defaultValue={opportunity?.title ?? ''}
              className={`${WORK_FIELD} mt-1.5`}
              placeholder="A small, specific thing someone can do"
            />
          </label>
          <label className="text-xs font-bold sm:col-span-2">
            A little context
            <textarea
              name="details"
              required
              maxLength={OPPORTUNITY_DETAILS_MAX}
              defaultValue={opportunity?.details ?? ''}
              rows={3}
              className={`${WORK_FIELD} mt-1.5`}
              placeholder="What will someone do, and what would help them say yes?"
            />
          </label>
          <label className="text-xs font-bold">
            House
            <select
              name="house"
              defaultValue={opportunity?.house ?? HOUSES[0].id}
              className={`${WORK_FIELD} mt-1.5`}
            >
              {HOUSES.map((house) => (
                <option key={house.id} value={house.id}>
                  {house.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold">
            Pod
            <select
              name="pod"
              defaultValue={opportunity?.pod ?? ''}
              className={`${WORK_FIELD} mt-1.5`}
            >
              <option value="">Programme-wide</option>
              {PODS.map((pod) => (
                <option key={pod.id} value={pod.id}>
                  {pod.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold sm:col-span-2">
            For an event (optional)
            <select
              name="event"
              defaultValue={currentEvent}
              className={`${WORK_FIELD} mt-1.5`}
            >
              <option value="">Not tied to an event</option>
              {currentEvent &&
                !events.some((item) => eventValue(item) === currentEvent) && (
                  <option value={currentEvent}>
                    Current event:{' '}
                    {opportunity?.eventTitle ?? 'no longer available'}
                  </option>
                )}
              {events.map((item) => (
                <option key={eventValue(item)} value={eventValue(item)}>
                  {item.kind === 'programme'
                    ? 'Connector event'
                    : 'Panamia event'}{' '}
                  / {formatDay(new Date(item.startsAt))} / {item.title}
                </option>
              ))}
            </select>
            <span className="text-pana-ink/60 mt-1 block font-normal">
              Only upcoming connector gatherings and Panamia-hosted events are
              offered. Linked signups also staff the event.
            </span>
          </label>
          <label className="text-xs font-bold sm:col-span-2">
            When
            <input
              name="when"
              maxLength={120}
              defaultValue={opportunity?.when ?? ''}
              className={`${WORK_FIELD} mt-1.5`}
              placeholder="A date, before the next huddle, or flexible"
            />
            <span className="text-pana-ink/60 mt-1 block font-normal">
              Leave blank to use the linked event date, or agree timing
              together.
            </span>
          </label>
          <label className="text-xs font-bold">
            Where
            <input
              name="location"
              maxLength={OPPORTUNITY_LOCATION_MAX}
              defaultValue={opportunity?.location ?? ''}
              className={`${WORK_FIELD} mt-1.5`}
              placeholder="A place, neighborhood, or from anywhere"
            />
          </label>
          <label className="text-xs font-bold">
            People needed
            <input
              name="spots"
              type="number"
              min={1}
              max={OPPORTUNITY_SPOTS_MAX}
              step={1}
              defaultValue={opportunity?.spots ?? ''}
              className={`${WORK_FIELD} mt-1.5`}
              placeholder="No fixed limit"
            />
            <span className="text-pana-ink/60 mt-1 block font-normal">
              Blank is an open invitation, not zero spots.
            </span>
          </label>
          <fieldset className="min-w-0 sm:col-span-2">
            <legend className="text-xs font-bold">Estimated effort</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {HOUR_PRESETS.map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setHours(minutesToHoursInput(value))}
                  aria-pressed={parseHours(hours) === value}
                  className={cn(
                    WORK_SECONDARY,
                    'px-3',
                    parseHours(hours) === value &&
                      'border-pana-indigo bg-pana-butter-2'
                  )}
                >
                  {formatMinutes(value)}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-xs">
              Or enter hours
              <input
                inputMode="decimal"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                className={`${WORK_FIELD} mt-1.5`}
                placeholder="Not estimated yet"
              />
            </label>
          </fieldset>
          <div className="sm:col-span-2">
            <WorkError message={error} />
          </div>
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              disabled={busy}
              className={WORK_SECONDARY}
              onClick={() => onClose()}
            >
              Not now
            </button>
            <button disabled={busy} className={ADMIN_WORK_BUTTON}>
              {busy
                ? 'Saving...'
                : opportunity
                  ? 'Save changes'
                  : 'Publish opportunity'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
