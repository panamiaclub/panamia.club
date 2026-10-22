import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  normalizeReferralAttributionId,
  normalizeReferralCode,
  REFERRAL_EVENT_TYPES,
} from '@/lib/referrals';

describe('community referral attribution', () => {
  test('normalizes supported URL-safe codes', () => {
    assert.equal(normalizeReferralCode('  abcdEFGH_123  '), 'abcdEFGH_123');
    assert.equal(normalizeReferralCode('too short'), null);
    assert.equal(normalizeReferralCode('../not-a-code'), null);
  });

  test('accepts only unguessable-looking attribution ids', () => {
    assert.equal(
      normalizeReferralAttributionId('abcDEF_1234567890-xyz'),
      'abcDEF_1234567890-xyz'
    );
    assert.equal(normalizeReferralAttributionId('short'), null);
    assert.equal(normalizeReferralAttributionId('../cookie'), null);
  });

  test('keeps the three milestones independent', () => {
    assert.deepEqual(REFERRAL_EVENT_TYPES, [
      'account_created',
      'directory_submitted',
      'connector_active',
    ]);
  });
});
