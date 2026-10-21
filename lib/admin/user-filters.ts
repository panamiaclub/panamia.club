/**
 * The filter vocabulary for the accounts list, with no dependencies.
 *
 * Pure for the same reason `user-locks.ts` is: these guards are needed by the
 * page, by the test suite and potentially by a client control, and the module
 * that runs the queries imports `db`. Anything importing the guards from
 * there drags a database connection along with them.
 *
 * The guards exist at all because both values arrive from the query string,
 * where anyone can type anything. `listUsers` passes the account type into a
 * comparison, so an unrecognised value must be rejected here rather than
 * carried further in.
 */

/** The states the accounts list can be narrowed to. */
export const USER_STATES = [
  'all',
  'locked',
  'unverified',
  'owners',
  'staff',
] as const;

export type UserState = (typeof USER_STATES)[number];

export function isUserState(value: unknown): value is UserState {
  return (
    typeof value === 'string' &&
    (USER_STATES as readonly string[]).includes(value)
  );
}

export const USER_SORTS = [
  'newest',
  'oldest',
  'name-asc',
  'name-desc',
  'roles',
] as const;

export type UserSort = (typeof USER_SORTS)[number];

export function isUserSort(value: unknown): value is UserSort {
  return (
    typeof value === 'string' &&
    (USER_SORTS as readonly string[]).includes(value)
  );
}

/** Mirrors the `account_type` enum on `users`. */
export const ACCOUNT_TYPES = [
  'personal',
  'directory',
  'hybrid',
  'other',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export function isAccountType(value: unknown): value is AccountType {
  return (
    typeof value === 'string' &&
    (ACCOUNT_TYPES as readonly string[]).includes(value)
  );
}
