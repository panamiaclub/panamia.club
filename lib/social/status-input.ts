/**
 * Shared parsing for the fields a status write accepts from a client.
 *
 * Two routes create statuses -- `/api/social/statuses` and
 * `/api/social/groups/[handle]/posts` -- and they take the same optional
 * fields. The group route originally hardcoded `cc-by-4` and dropped
 * `location` entirely, which was invisible while the only group composer was a
 * bare textarea that sent neither. The moment a full composer points at that
 * route, a silently discarded licence is a wrong rights statement on somebody
 * else's work.
 *
 * These live here rather than being copied into the second route because this
 * codebase has already paid for that mistake once: the directory's
 * account-type gate had to be repaired in four separate places because it was
 * written four times. A parser duplicated into two routes is two places for
 * the bounds check to drift.
 *
 * Both functions are total -- they return a usable value or `undefined` and
 * never throw, so a caller cannot forget to catch. Malformed input is dropped
 * rather than rejected, matching what `/api/social/statuses` already did.
 */

import type { StatusLocation } from '@/lib/federation/wrappers/status';

export type CcLicense = 'cc-by-4' | 'cc-by-sa-4' | 'cc-0';

const VALID_LICENSES: readonly CcLicense[] = ['cc-by-4', 'cc-by-sa-4', 'cc-0'];

/**
 * Narrow a client-supplied licence to one we publish, defaulting to `cc-by-4`.
 *
 * Defaulting rather than rejecting is deliberate and matches the existing
 * route: an unrecognised licence is a client bug, and failing the whole post
 * over it loses the member's writing to protect a field they did not set.
 */
export function parseCcLicense(value: unknown): CcLicense {
  return typeof value === 'string' &&
    (VALID_LICENSES as readonly string[]).includes(value)
    ? (value as CcLicense)
    : 'cc-by-4';
}

/**
 * Validate an attached place.
 *
 * Accepts coordinates, a name, or both, because the composer can produce
 * either -- a dropped pin has no name and a typed neighbourhood has no
 * coordinates. A payload with neither is not a location and returns
 * `undefined`.
 *
 * The latitude and longitude bounds are checked rather than trusted. They are
 * what stops a transposed lat/lng pair from being stored as a real place, and
 * `NaN` fails every comparison here, so it is excluded without a separate
 * test.
 */
export function parseStatusLocation(
  value: unknown
): StatusLocation | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const loc = value as Record<string, unknown>;

  const hasCoordinates =
    typeof loc.latitude === 'number' &&
    typeof loc.longitude === 'number' &&
    loc.latitude >= -90 &&
    loc.latitude <= 90 &&
    loc.longitude >= -180 &&
    loc.longitude <= 180;

  const hasName = typeof loc.name === 'string' && loc.name.trim().length > 0;

  if (!hasCoordinates && !hasName) return undefined;

  return {
    type: 'Place',
    ...(hasCoordinates && {
      latitude: loc.latitude as number,
      longitude: loc.longitude as number,
    }),
    ...(hasName && { name: (loc.name as string).trim() }),
    ...(loc.precision === 'precise' || loc.precision === 'general'
      ? { precision: loc.precision }
      : {}),
  };
}
