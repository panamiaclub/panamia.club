import test from 'node:test';
import assert from 'assert/strict';

import {
  REASON_MIN,
  REASON_MAX,
  checkReason,
  reasonError,
} from '@/lib/admin/user-locks';
import {
  ACCOUNT_TYPES,
  USER_SORTS,
  USER_STATES,
  isAccountType,
  isUserSort,
  isUserState,
} from '@/lib/admin/user-filters';

/**
 * The parts of account locking that can be tested without a database.
 *
 * The transaction itself cannot be exercised here — there is no local
 * Postgres — but the guards in front of it can, and they are the part most
 * likely to be quietly weakened later. A reason minimum that drifts between
 * the form and the API produces a button that fails with no explanation, so
 * the constant is asserted rather than assumed.
 */

test('a blank reason is rejected', () => {
  assert.equal(checkReason(''), 'too-short');
  assert.equal(checkReason('   '), 'too-short');
});

test('whitespace does not pad a reason to length', () => {
  // The CHECK in 0058 trims before measuring; this must agree with it, or the
  // form accepts something the database then refuses.
  const padded = `${' '.repeat(40)}spam${' '.repeat(40)}`;
  assert.equal(checkReason(padded), 'too-short');
});

test('a reason at exactly the minimum passes', () => {
  assert.equal(checkReason('x'.repeat(REASON_MIN)), null);
  assert.equal(checkReason('x'.repeat(REASON_MIN - 1)), 'too-short');
});

test('an overlong reason is rejected at the boundary', () => {
  assert.equal(checkReason('x'.repeat(REASON_MAX)), null);
  assert.equal(checkReason('x'.repeat(REASON_MAX + 1)), 'too-long');
});

test('reason errors name the bound they enforce', () => {
  // So the message cannot drift out of step with the constant it describes.
  assert.ok(reasonError('too-short').includes(String(REASON_MIN)));
  assert.ok(reasonError('too-long').includes(String(REASON_MAX)));
});

test('unknown filter values are refused rather than passed to SQL', () => {
  assert.equal(isUserState('locked'), true);
  assert.equal(isUserState('all'), true);
  assert.equal(isUserState('; DROP TABLE users'), false);
  assert.equal(isUserState(undefined), false);
  assert.equal(isUserState(42), false);

  assert.equal(isAccountType('directory'), true);
  assert.equal(isAccountType('nonsense'), false);
  assert.equal(isAccountType(null), false);

  assert.equal(isUserSort('name-asc'), true);
  assert.equal(isUserSort('email'), false);
  assert.equal(isUserSort(undefined), false);
});

test('every declared filter and sort is accepted by its own guard', () => {
  // Catches a value being added to one list and forgotten in the other.
  for (const state of USER_STATES) assert.equal(isUserState(state), true);
  for (const type of ACCOUNT_TYPES) assert.equal(isAccountType(type), true);
  for (const sort of USER_SORTS) assert.equal(isUserSort(sort), true);
});
