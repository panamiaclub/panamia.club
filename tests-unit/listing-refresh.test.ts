import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysAfter,
  isListingReviewState,
  LISTING_REFRESH_DAYS,
  LISTING_REMINDER_DAYS,
  refreshStopPath,
} from '@/lib/listing-refresh';
import { renderTemplate } from '@/lib/email-templates';

test('review deadlines use explicit thirty-day and seven-day elapsed intervals', () => {
  const start = new Date('2026-11-03T12:00:00Z');
  assert.equal(LISTING_REFRESH_DAYS, 30);
  assert.equal(LISTING_REMINDER_DAYS, 7);
  assert.equal(daysAfter(start, 30).toISOString(), '2026-12-03T12:00:00.000Z');
  assert.equal(daysAfter(start, 7).toISOString(), '2026-11-10T12:00:00.000Z');
});

test('review-state guards reject another business, invalid dates and unsupported lifecycle states', () => {
  const state = {
    profileId: 'business',
    lastReviewedAt: null,
    remindersOptedOut: false,
    cycle: {
      id: 'cycle',
      state: 'active',
      reminderCount: 0,
      startedAt: '2026-11-03T12:00:00Z',
      dueAt: '2026-12-03T12:00:00Z',
      pausedAt: null,
      holdReason: null,
    },
  };
  assert.equal(isListingReviewState(state, 'business'), true);
  assert.equal(isListingReviewState(state, 'different'), false);
  assert.equal(
    isListingReviewState(
      { ...state, cycle: { ...state.cycle, state: 'unknown' } },
      'business'
    ),
    false
  );
  assert.equal(
    isListingReviewState(
      { ...state, cycle: { ...state.cycle, dueAt: 'invalid' } },
      'business'
    ),
    false
  );
  assert.equal(
    isListingReviewState(
      { ...state, cycle: { ...state.cycle, reminderCount: 5 } },
      'business'
    ),
    false
  );
});

test('stop-reminder links contain only a scoped cycle ID in the query, with proof in the fragment', () => {
  const url = new URL(
    refreshStopPath('cycle /?&', 'ab'.repeat(32)),
    'https://pana.test'
  );
  assert.equal(url.searchParams.get('cycleId'), 'cycle /?&');
  assert.equal(url.searchParams.size, 1);
  assert.equal(url.searchParams.has('token'), false);
  assert.match(url.hash, /^#token=/);
});

test('final reminder copy requires confirmation, explains recoverable hiding and escapes public business input', () => {
  const mail = renderTemplate('listing.refresh', {
    businessName: '<script>business</script>',
    reviewUrl: 'https://pana.test/listings/invite?id=business#token=fixture',
    stopUrl:
      'https://pana.test/listings/reminders/stop?cycleId=cycle#token=fixture',
    finalNotice: true,
    deadline: '2026-12-03',
    deliveryId: 'delivery-reference',
  });
  assert.match(mail.subject, /Final listing reminder/);
  assert.doesNotMatch(mail.html, /<script>business<\/script>/);
  assert.match(mail.text, /Signing in or claiming alone does not finish/);
  assert.match(mail.text, /No private home address or invented ZIP/);
  assert.match(mail.text, /delivery-reference/);
  assert.match(mail.html, /temporary pause, not a deletion/);
});
