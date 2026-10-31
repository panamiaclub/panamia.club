import type { SearchResultsInterface } from '@/lib/query/directory';
import type { Coords } from '@/app/p/[user]/_lib/profile-view';
import { profileCategoryList } from '@/lib/lists';

/**
 * Presentation helpers for the directory result card.
 *
 * Kept apart from the components so the rounding rules live in one place: a
 * distance has to read the same here as it does on the profile page, or the
 * same business appears to move between the two screens.
 */

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  profileCategoryList.map((category) => [category.value, category.desc])
);

/**
 * Round to the precision the number actually carries.
 *
 * A distance derived from a geocoded street address is not accurate to three
 * decimals, and printing "1.634 miles away" claims a precision the directory
 * does not have. Close by gets one decimal because the difference between
 * half a mile and two miles decides whether you walk; past ten miles the
 * decimal stops meaning anything.
 */
export function formatDistance(miles: number): string {
  if (miles < 0.1) return 'less than 0.1 miles away';
  if (miles < 10) {
    const rounded = Math.round(miles * 10) / 10;
    return `${rounded} ${rounded === 1 ? 'mile' : 'miles'} away`;
  }
  return `${Math.round(miles)} miles away`;
}

/**
 * How soon an event is, in the words someone would use.
 *
 * "in 3 days" answers whether to keep reading; "March 14" makes the reader do
 * the arithmetic themselves. The exact date is on the event page, which is one
 * click away for anyone who wants it.
 */
export function formatWhen(startsAt: string): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';

  // Compared at day boundaries rather than by elapsed hours: an event at 9am
  // tomorrow is "tomorrow", not "in 16 hours" and certainly not "today".
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round(
    (startOfDay(start) - startOfDay(new Date())) / 86_400_000
  );

  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days < 14) return 'next week';
  if (days < 31) return `in ${Math.round(days / 7)} weeks`;
  const months = Math.round(days / 30);
  return `in ${months} month${months === 1 ? '' : 's'}`;
}

/** Coordinates of a result, or null when it has never been geocoded. */
export function resultCoords(result: SearchResultsInterface): Coords | null {
  if (result.online_only) return null;
  const coordinates = result.geo?.coordinates as unknown;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const [lng, lat] = [Number(coordinates[0]), Number(coordinates[1])];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lat, lng };
}

/**
 * Where a result should link.
 *
 * An unclaimed listing has no handle and therefore no profile page, so it gets
 * the claim flow instead — the only route into claiming that a visitor who
 * recognises the business will ever be shown.
 */
export function resultHref(result: SearchResultsInterface): string {
  return result.screenname
    ? `/p/${result.screenname}`
    : `/listings/claim/start?id=${result._id}`;
}
