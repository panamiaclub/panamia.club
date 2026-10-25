'use client';

import { useId, useRef } from 'react';
import { CalendarDays, Clock3, MapPin } from 'lucide-react';
import { HOUSES, PODS } from '@/lib/connectors/model';
import { formatMinutes } from '@/lib/connectors/hours';
import type { ConnectorOpportunity } from '@/lib/connectors/opportunities-model';
import { opportunityStatus } from '@/lib/connectors/opportunities-model';
import { formatDay } from '@/components/connectors/dashboard-parts';
import { cn } from '@/lib/utils';
import { ADMIN_CHROME } from '@/lib/admin/theme';

export const WORK_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-transparent bg-pana-indigo px-4 py-2 text-xs font-extrabold text-pana-cream transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pana-indigo';
export const WORK_SECONDARY =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pana-ink/25 bg-transparent px-4 py-2 text-xs font-extrabold text-pana-ink hover:bg-pana-cream disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pana-indigo';
export const ADMIN_WORK_BUTTON = cn(
  WORK_BUTTON,
  ADMIN_CHROME.FILL,
  ADMIN_CHROME.ON_FILL
);
export const WORK_FIELD =
  'w-full min-w-0 rounded-xl border border-pana-ink/25 bg-white px-3 py-2.5 text-sm text-pana-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pana-indigo';
export const WORK_CARD =
  'min-w-0 rounded-2xl border border-pana-ink/15 bg-white p-5 [overflow-wrap:anywhere] sm:p-6';
export const WORK_DIALOG =
  'max-h-[calc(100dvh-3rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-pana-ink/25 bg-pana-cream text-pana-ink [overflow-wrap:anywhere] sm:rounded-2xl';

export function focusWorkNavigation() {
  document
    .querySelector<HTMLButtonElement>(
      '[data-work-navigation] [aria-current="page"]'
    )
    ?.focus();
}

export function useWorkDialogFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    opener,
    remember: (event: { currentTarget: HTMLElement }) => {
      opener.current = event.currentTarget;
    },
    restore: (event: Event) => {
      event.preventDefault();
      if (opener.current?.isConnected) opener.current.focus();
      else focusWorkNavigation();
    },
  };
}

export function WorkError({ message }: { message: string | null }) {
  return message ? (
    <p
      role="alert"
      className="border-pana-burnt bg-pana-butter-2 text-pana-ink rounded-xl border px-4 py-3 text-sm"
    >
      {message}
    </p>
  ) : null;
}

export interface WorkFilterValue {
  house: string;
  pod: string;
  query: string;
}

export function WorkFilters({
  value,
  onChange,
  myPod = false,
  searchLabel = 'Search opportunities',
}: {
  value: WorkFilterValue;
  onChange: (value: WorkFilterValue) => void;
  myPod?: boolean;
  searchLabel?: string;
}) {
  const id = useId();
  return (
    <div className="mb-5 flex min-w-0 flex-wrap gap-2">
      <label className="sr-only" htmlFor={`${id}-house`}>
        Filter by house
      </label>
      <select
        id={`${id}-house`}
        value={value.house}
        onChange={(event) => onChange({ ...value, house: event.target.value })}
        className={cn(
          WORK_FIELD,
          'w-auto max-w-full flex-[1_1_9rem] rounded-full text-xs sm:flex-initial'
        )}
      >
        <option value="all">All houses</option>
        {HOUSES.map((house) => (
          <option key={house.id} value={house.id}>
            {house.name}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`${id}-pod`}>
        Filter by pod
      </label>
      <select
        id={`${id}-pod`}
        value={value.pod}
        onChange={(event) => onChange({ ...value, pod: event.target.value })}
        className={cn(
          WORK_FIELD,
          'w-auto max-w-full flex-[1_1_10rem] rounded-full text-xs sm:flex-initial'
        )}
      >
        {myPod && <option value="mine">My pod + programme-wide</option>}
        <option value="all">Across all pods</option>
        {PODS.map((pod) => (
          <option key={pod.id} value={pod.id}>
            {pod.name}
          </option>
        ))}
      </select>
      <label className="min-w-0 flex-[1_1_11rem]">
        <span className="sr-only">{searchLabel}</span>
        <input
          type="search"
          value={value.query}
          onChange={(event) =>
            onChange({ ...value, query: event.target.value })
          }
          className={cn(WORK_FIELD, 'rounded-full text-xs')}
          placeholder="Find your thing..."
        />
      </label>
    </div>
  );
}

export function OpportunityFacts({
  opportunity,
}: {
  opportunity: ConnectorOpportunity;
}) {
  return (
    <div className="text-pana-ink/65 flex flex-col gap-2 text-xs">
      <p className="flex items-start gap-2">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {opportunity.when ??
            (opportunity.eventStartsAt
              ? formatDay(new Date(opportunity.eventStartsAt))
              : 'Timing to be agreed')}
        </span>
      </p>
      {opportunity.eventTitle && (
        <p className="text-pana-indigo text-xs font-bold">
          {opportunity.eventTitle}
          {opportunity.eventStartsAt
            ? ` / ${formatDay(new Date(opportunity.eventStartsAt))}`
            : ''}
        </p>
      )}
      <p className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {opportunity.location ??
            (opportunity.pod
              ? PODS.find((pod) => pod.id === opportunity.pod)?.name
              : 'Programme-wide')}
        </span>
      </p>
      <p className="flex items-start gap-2">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {opportunity.estimatedMinutes === null
            ? 'Effort not estimated'
            : `${formatMinutes(opportunity.estimatedMinutes)} estimated`}
        </span>
      </p>
    </div>
  );
}

export function OpportunityState({
  opportunity,
}: {
  opportunity: ConnectorOpportunity;
}) {
  const status = opportunityStatus(opportunity);
  const label =
    status === 'closed'
      ? 'Closed by coordinators'
      : status === 'unavailable'
        ? 'Event no longer available'
        : status === 'full'
          ? 'Crew complete'
          : opportunity.spots === null
            ? 'Open invitation'
            : `${opportunity.spots - opportunity.signups} ${opportunity.spots - opportunity.signups === 1 ? 'spot' : 'spots'} open`;
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${status === 'open' ? 'border-pana-ink/20 bg-pana-butter-2' : 'border-pana-ink/15 bg-pana-cream text-pana-ink/65'}`}
    >
      {label}
    </span>
  );
}
