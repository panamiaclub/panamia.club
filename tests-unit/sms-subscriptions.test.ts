import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { normalizeSmsPhone } from '@/lib/sms-subscriptions';

describe('normalizeSmsPhone', () => {
  test('normalizes common US phone formats to E.164', () => {
    assert.equal(normalizeSmsPhone('(305) 555-0123'), '+13055550123');
    assert.equal(normalizeSmsPhone('1-305-555-0123'), '+13055550123');
  });

  test('preserves valid international country codes', () => {
    assert.equal(normalizeSmsPhone('+44 20 7946 0958'), '+442079460958');
  });

  test('rejects blank, short and ambiguous numbers', () => {
    assert.equal(normalizeSmsPhone(''), null);
    assert.equal(normalizeSmsPhone('555-0123'), null);
    assert.equal(normalizeSmsPhone('001 305 555 0123'), null);
  });
});
