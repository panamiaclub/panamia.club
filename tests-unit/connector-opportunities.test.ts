import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  matchesOpportunity,
  opportunityInputSchema,
  opportunityStatus,
  spotsRemaining,
} from '@/lib/connectors/opportunities-model';
import type { ConnectorOpportunity } from '@/lib/connectors/opportunities-model';

const input = {
  title: 'Host a welcome table',
  details: 'Help people find their pod.',
  house: 'education',
};
const opportunity: ConnectorOpportunity = {
  id: 'opportunity',
  ...input,
  house: 'education',
  pod: 'miami',
  when: null,
  location: null,
  estimatedMinutes: null,
  spots: 2,
  signups: 1,
  eventId: null,
  connectorEventId: null,
  eventTitle: null,
  eventStartsAt: null,
  eventAvailable: true,
  closedAt: null,
  createdAt: '2026-01-01T12:00:00.000Z',
};

test('opportunity inputs trim text and keep unknown effort, unrestricted pod and uncapped crew distinct', () => {
  assert.deepEqual(
    opportunityInputSchema.parse({
      ...input,
      title: '  Host a welcome table  ',
      when: '  ',
      location: '  Downtown  ',
    }),
    {
      ...input,
      pod: null,
      when: null,
      location: 'Downtown',
      estimatedMinutes: null,
      spots: null,
      event: null,
    }
  );
});

test('opportunity validation accepts all real houses, pods and boundary sizes', () => {
  for (const house of [
    'education',
    'relationshipBuilding',
    'narrativeShifters',
    'culturalWorkers',
  ]) {
    for (const pod of [null, 'miami', 'broward', 'palmBeach']) {
      assert.equal(
        opportunityInputSchema.safeParse({
          ...input,
          house,
          pod,
          estimatedMinutes: 6000,
          spots: 9999,
        }).success,
        true
      );
    }
  }
  assert.equal(
    opportunityInputSchema.safeParse({
      ...input,
      estimatedMinutes: 1,
      spots: 1,
    }).success,
    true
  );
});

test('opportunity validation rejects malformed and oversized published requests', () => {
  for (const bad of [
    { title: '' },
    { title: '  ' },
    { title: 'x'.repeat(151) },
    { details: ' ' },
    { details: 'x'.repeat(2001) },
    { house: 'worldBuilding' },
    { house: null },
    { pod: 'elsewhere' },
    { when: 'x'.repeat(121) },
    { location: 'x'.repeat(251) },
    { event: 'event:unknown' },
    { event: 'public:' },
    { event: 12 },
  ])
    assert.equal(
      opportunityInputSchema.safeParse({ ...input, ...bad }).success,
      false,
      JSON.stringify(bad)
    );
  for (const bad of [null, [], 'opportunity', false])
    assert.equal(opportunityInputSchema.safeParse(bad).success, false);
});

test('opportunity validation never coerces strings, zero, fractions or nonfinite counts and minutes', () => {
  for (const field of ['spots', 'estimatedMinutes']) {
    for (const bad of [0, -1, 0.5, 10000, '2', true, NaN, Infinity]) {
      assert.equal(
        opportunityInputSchema.safeParse({ ...input, [field]: bad }).success,
        false
      );
    }
  }
  assert.equal(
    opportunityInputSchema.safeParse({ ...input, estimatedMinutes: 6001 })
      .success,
    false
  );
});

test('both typed event references are accepted, without inventing an event', () => {
  for (const event of [
    'programme:next-huddle',
    'public:official-event',
    null,
  ]) {
    assert.equal(
      opportunityInputSchema.parse({ ...input, event }).event,
      event
    );
  }
});

test('places remaining clamp at zero, while an open invitation has no invented denominator', () => {
  assert.equal(spotsRemaining(opportunity), 1);
  assert.equal(spotsRemaining({ spots: 2, signups: 2 }), 0);
  assert.equal(spotsRemaining({ spots: 2, signups: 3 }), 0);
  assert.equal(spotsRemaining({ spots: null, signups: 200 }), null);
});

test('availability distinguishes closed requests, unavailable events, full crews, and open work', () => {
  assert.equal(opportunityStatus(opportunity), 'open');
  assert.equal(opportunityStatus({ ...opportunity, signups: 2 }), 'full');
  assert.equal(
    opportunityStatus({ ...opportunity, spots: null, signups: 200 }),
    'open'
  );
  assert.equal(
    opportunityStatus({ ...opportunity, signups: 2, eventAvailable: false }),
    'unavailable'
  );
  assert.equal(
    opportunityStatus({
      ...opportunity,
      eventAvailable: false,
      closedAt: '2026-02-01',
    }),
    'closed'
  );
});

test('my-pod discovery includes programme-wide work without fencing off other houses', () => {
  const filters = { house: 'all', pod: 'mine', query: '' };
  assert.equal(matchesOpportunity(opportunity, filters, 'miami'), true);
  assert.equal(
    matchesOpportunity({ ...opportunity, pod: null }, filters, 'broward'),
    true
  );
  assert.equal(matchesOpportunity(opportunity, filters, 'broward'), false);
  assert.equal(
    matchesOpportunity(opportunity, { ...filters, pod: 'all' }, 'broward'),
    true
  );
});

test('opportunity filters combine house, pod and case-insensitive text including canonical house names', () => {
  const filters = { house: 'education', pod: 'miami', query: '  WELCOME  ' };
  assert.equal(matchesOpportunity(opportunity, filters), true);
  assert.equal(
    matchesOpportunity(opportunity, { ...filters, query: 'find their pod' }),
    true
  );
  assert.equal(
    matchesOpportunity(opportunity, { ...filters, query: 'Education' }),
    true
  );
  assert.equal(
    matchesOpportunity(opportunity, { ...filters, house: 'culturalWorkers' }),
    false
  );
  assert.equal(
    matchesOpportunity(opportunity, { ...filters, pod: 'broward' }),
    false
  );
  assert.equal(
    matchesOpportunity(opportunity, { ...filters, query: 'unmatched' }),
    false
  );
});
