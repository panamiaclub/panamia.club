import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatGift,
  getMonthlyDonationTier,
  isDonationAmount,
  parseCustomAmount,
  parseDonationReturn,
} from '../lib/donations';

test('custom USD gifts preserve exact cents and enforce Stripe payment bounds', () => {
  for (const [input, cents] of [
    ['0.50', 50],
    ['12.50', 1250],
    [' 15 ', 1500],
    ['999999.99', 99_999_999],
  ] as const) {
    assert.equal(parseCustomAmount(input), cents);
  }
  for (const input of [
    '',
    '-1',
    '0',
    '0.49',
    '1e2',
    '12.345',
    '1000000',
    'NaN',
  ]) {
    assert.equal(parseCustomAmount(input), null);
  }
  for (const input of [null, '1500', 49, 50.5, Infinity, NaN, 100_000_000]) {
    assert.equal(isDonationAmount(input), false);
  }
  assert.equal(isDonationAmount(50), true);
  assert.equal(isDonationAmount(99_999_999), true);
  assert.equal(formatGift(1250), '$12.50');
  assert.equal(formatGift(1250 * 12), '$150');
});

test('membership tiers are derived from cents and never granted to one-time gifts', () => {
  for (const [cents, tier] of [
    [50, 0],
    [999, 0],
    [1000, 1],
    [1499, 1],
    [1500, 2],
    [2499, 2],
    [2500, 3],
    [99_999_999, 3],
  ]) {
    assert.equal(getMonthlyDonationTier(cents, true), tier);
    assert.equal(getMonthlyDonationTier(cents, false), 0);
  }
});

test('canceled checkout restores only a validated amount and frequency', () => {
  assert.deepEqual(
    parseDonationReturn({
      canceled: '1',
      frequency: 'one-time',
      amount: '4000',
    }),
    { frequency: 'one-time', cents: 4000 }
  );
  assert.deepEqual(
    parseDonationReturn({
      canceled: '1',
      frequency: 'monthly',
      amount: '1250',
    }),
    { frequency: 'monthly', cents: 1250 }
  );
  for (const params of [
    { frequency: 'monthly', amount: '1500' },
    { canceled: '1', frequency: 'weekly', amount: '1500' },
    { canceled: '1', frequency: 'monthly', amount: '49' },
    { canceled: '1', frequency: 'monthly', amount: '1e3' },
    { canceled: '1', frequency: 'monthly', amount: '100000000' },
    { canceled: '1', frequency: ['monthly', 'one-time'], amount: '1500' },
  ]) {
    assert.equal(parseDonationReturn(params), null);
  }
});
