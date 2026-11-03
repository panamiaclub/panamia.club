export const LISTING_REFRESH_DAYS = 30;
export const LISTING_REMINDER_DAYS = 7;
export const LISTING_REMINDER_COUNT = 4;
export const LISTING_FINAL_NOTICE_DAYS = 2;
export const LISTING_REFRESH_STATES = [
  'queued',
  'active',
  'held',
  'paused',
  'completed',
  'cancelled',
] as const;
export type ListingRefreshState = (typeof LISTING_REFRESH_STATES)[number];
export const OPEN_REFRESH_STATES: ListingRefreshState[] = [
  'queued',
  'active',
  'held',
  'paused',
];

export interface ListingReviewState {
  profileId: string;
  lastReviewedAt: string | null;
  remindersOptedOut: boolean;
  cycle: {
    id: string;
    state: ListingRefreshState;
    reminderCount: number;
    startedAt: string | null;
    dueAt: string | null;
    pausedAt: string | null;
    holdReason: string | null;
  } | null;
}

export function isListingReviewState(
  value: unknown,
  profileId: string
): value is ListingReviewState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  const date = (v: unknown) =>
    v === null || (typeof v === 'string' && Number.isFinite(Date.parse(v)));
  if (
    state.profileId !== profileId ||
    !date(state.lastReviewedAt) ||
    typeof state.remindersOptedOut !== 'boolean'
  )
    return false;
  if (state.cycle === null) return true;
  if (!state.cycle || typeof state.cycle !== 'object') return false;
  const cycle = state.cycle as Record<string, unknown>;
  return (
    typeof cycle.id === 'string' &&
    LISTING_REFRESH_STATES.some((item) => item === cycle.state) &&
    typeof cycle.reminderCount === 'number' &&
    cycle.reminderCount >= 0 &&
    cycle.reminderCount <= LISTING_REMINDER_COUNT &&
    date(cycle.startedAt) &&
    date(cycle.dueAt) &&
    date(cycle.pausedAt) &&
    (cycle.holdReason === null || typeof cycle.holdReason === 'string')
  );
}

export async function refreshDigest(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export function refreshSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export function refreshStopPath(cycleId: string, token: string): string {
  return `/listings/reminders/stop?cycleId=${encodeURIComponent(cycleId)}#token=${token}`;
}

export function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
