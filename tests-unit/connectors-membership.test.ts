import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseConnector } from '@/lib/connectors/membership';

/**
 * `parseConnector` is the only thing standing between whatever is in the
 * `profiles.connector` JSONB column and the HQ page rendering it.
 *
 * It is worth testing in isolation for two reasons. The first is that the
 * column is schemaless, so nothing upstream guarantees the shape — a blob
 * written by an older build, hand-edited during support, or restored from a
 * backup all arrive here looking like `unknown`. The second is that it is pure
 * and synchronous, so the whole decision table can be pinned down here without
 * waiting on the database tests.
 *
 * The behaviour being pinned down is specifically the *degrading*: a bad
 * record must come back as `null` ("not a connector yet", a state the UI
 * already renders) rather than as a half-built object that crashes later in
 * `getHouse`, somewhere far from the cause.
 *
 * The status rules get their own block at the bottom. Those are the ones with
 * teeth — everything else here decides how a membership renders, but status
 * decides whether somebody is in the programme at all.
 */

const VALID = {
  status: 'active',
  pod: 'miami',
  houses: ['education'],
  tier: 1,
  bring: 'A van most weekends',
  appliedAt: '2025-01-01T00:00:00.000Z',
  commitments: [],
};

describe('parseConnector — rejecting what cannot be rendered', () => {
  test('returns null for values that are not records', () => {
    for (const value of [null, undefined, 'miami', 42, true, []]) {
      assert.equal(parseConnector(value), null);
    }
  });

  test('returns null when the pod is missing or unknown', () => {
    assert.equal(parseConnector({ ...VALID, pod: undefined }), null);
    assert.equal(parseConnector({ ...VALID, pod: 'orlando' }), null);
    assert.equal(parseConnector({ ...VALID, pod: 3 }), null);
  });

  test('returns null when no house survives, so HQ routes back to the form', () => {
    assert.equal(parseConnector({ ...VALID, houses: [] }), null);
    assert.equal(parseConnector({ ...VALID, houses: ['retiredHouse'] }), null);
    assert.equal(parseConnector({ ...VALID, houses: 'education' }), null);
  });
});

describe('parseConnector — keeping what can be rendered', () => {
  test('drops an unknown house rather than the whole membership', () => {
    const parsed = parseConnector({
      ...VALID,
      houses: ['education', 'retiredHouse', 'culturalWorkers'],
    });

    assert.deepEqual(parsed?.houses, ['education', 'culturalWorkers']);
  });

  test('de-duplicates houses', () => {
    const parsed = parseConnector({
      ...VALID,
      houses: ['education', 'education'],
    });

    assert.deepEqual(parsed?.houses, ['education']);
  });

  test('clamps an out-of-range tier to the first one', () => {
    for (const tier of [0, 4, '2', null, undefined]) {
      assert.equal(parseConnector({ ...VALID, tier })?.tier, 1);
    }
    assert.equal(parseConnector({ ...VALID, tier: 3 })?.tier, 3);
  });

  test('trims bring and tolerates it being absent', () => {
    assert.equal(
      parseConnector({ ...VALID, bring: '  a van  ' })?.bring,
      'a van'
    );
    assert.equal(parseConnector({ ...VALID, bring: undefined })?.bring, '');
    assert.equal(parseConnector({ ...VALID, bring: 12 })?.bring, '');
  });
});

describe('parseConnector — explicit major and minor houses', () => {
  test('explicit roles are authoritative and supply the compatibility houses', () => {
    for (const houses of [
      undefined,
      [],
      ['relationshipBuilding', 'education'],
    ]) {
      const parsed = parseConnector({
        ...VALID,
        houses,
        majorHouse: 'culturalWorkers',
        minorHouse: 'education',
      });
      assert.equal(parsed?.majorHouse, 'culturalWorkers');
      assert.equal(parsed?.minorHouse, 'education');
      assert.deepEqual(parsed?.houses, ['culturalWorkers', 'education']);
      assert.equal(parsed?.status, 'active');
    }
  });

  test('one through four unranked houses preserve access without guessing roles', () => {
    const houses = [
      'narrativeShifters',
      'education',
      'culturalWorkers',
      'relationshipBuilding',
    ];
    for (let count = 1; count <= houses.length; count++) {
      const interests = houses.slice(0, count);
      const parsed = parseConnector({ ...VALID, houses: interests, tier: 3 });
      assert.equal(parsed?.status, 'active');
      assert.equal(parsed?.tier, 3);
      assert.deepEqual(parsed?.houses, interests);
      assert.equal(parsed?.majorHouse, null);
      assert.equal(parsed?.minorHouse, null);
    }
  });

  test('incomplete, unknown, or duplicate roles do not strand an older membership', () => {
    for (const focus of [
      { majorHouse: 'education' },
      { minorHouse: 'culturalWorkers' },
      { majorHouse: 'education', minorHouse: 'education' },
      { majorHouse: 'retiredHouse', minorHouse: 'education' },
      { majorHouse: 'education', minorHouse: null },
      { majorHouse: 1, minorHouse: ['education'] },
    ]) {
      const parsed = parseConnector({ ...VALID, ...focus });
      assert.equal(parsed?.status, 'active');
      assert.deepEqual(parsed?.houses, VALID.houses);
      assert.equal(parsed?.majorHouse, null);
      assert.equal(parsed?.minorHouse, null);
    }
  });
});

describe('parseConnector — the legacy commitments key', () => {
  /* drizzle/0056 moved commitments into their own table and deliberately left
   * the old jsonb key in place: the copy is additive so a code rollback does
   * not lose anybody's real work. That means live rows still carry this key
   * for a while, and the parser has to walk past it rather than trip over it.
   * These tests are what stops a later tidy-up from reintroducing a read. */

  const legacy = [
    {
      id: 'c1',
      what: 'Table at the free market',
      when: 'Early November',
      house: 'education',
      progress: 'inProgress',
      createdAt: '2025-02-01T00:00:00.000Z',
    },
  ];

  test('a membership carrying the old key still parses', () => {
    const parsed = parseConnector({ ...VALID, commitments: legacy });

    assert.equal(parsed?.status, VALID.status);
    assert.deepEqual(parsed?.houses, VALID.houses);
  });

  test('the old key is not carried onto the parsed membership', () => {
    const parsed = parseConnector({ ...VALID, commitments: legacy });

    assert.equal(
      Object.prototype.hasOwnProperty.call(parsed ?? {}, 'commitments'),
      false
    );
  });

  test('a malformed old key cannot break a good membership', () => {
    for (const commitments of [undefined, 'none', 42, [null, 'nope']]) {
      assert.ok(parseConnector({ ...VALID, commitments }));
    }
  });
});

describe('parseConnector — status is the gate', () => {
  test('keeps each real status', () => {
    for (const status of ['pending', 'active', 'declined', 'inactive']) {
      assert.equal(parseConnector({ ...VALID, status })?.status, status);
    }
  });

  /* The important one. A record with no status is either a row written before
   * the gate existed or a blob somebody hand-edited badly, and in both cases
   * the safe reading is that nobody has accepted this person yet. Defaulting
   * the other way would silently let anyone through whose record predates the
   * gate, and an unearned membership is invisible — whereas somebody waiting
   * on an approval they already had just asks, and an admin clicks Accept. */
  test('treats a missing or unrecognised status as pending, never active', () => {
    for (const status of [undefined, null, '', 'approved', 'ACTIVE', 7, {}]) {
      assert.equal(parseConnector({ ...VALID, status })?.status, 'pending');
    }
  });

  test('does not let a legacy record imply membership', () => {
    const legacy = {
      pod: 'miami',
      houses: ['education'],
      tier: 2,
      bring: 'A van',
      joinedAt: '2025-01-01T00:00:00.000Z',
    };

    const parsed = parseConnector(legacy);

    assert.equal(parsed?.status, 'pending');
    // The old field still carries the only date the record has.
    assert.equal(parsed?.appliedAt, '2025-01-01T00:00:00.000Z');
  });

  test('leaves a membership undecided until somebody decides it', () => {
    const parsed = parseConnector(VALID);

    assert.equal(parsed?.decidedAt, null);
    assert.equal(parsed?.decidedBy, null);
  });

  test('keeps who decided it and when', () => {
    const parsed = parseConnector({
      ...VALID,
      decidedAt: '2025-03-01T00:00:00.000Z',
      decidedBy: 'admin-1',
    });

    test('keeps the internal offboarding record', () => {
      const parsed = parseConnector({
        ...VALID,
        status: 'inactive',
        offboardedAt: '2026-10-21T21:45:00.000Z',
        offboardedBy: 'admin-2',
        offboardReason: '  Moved out of the region  ',
      });

      assert.equal(parsed?.offboardedAt, '2026-10-21T21:45:00.000Z');
      assert.equal(parsed?.offboardedBy, 'admin-2');
      assert.equal(parsed?.offboardReason, 'Moved out of the region');
    });

    assert.equal(parsed?.decidedAt, '2025-03-01T00:00:00.000Z');
    assert.equal(parsed?.decidedBy, 'admin-1');
  });

  test('keeps reactivation provenance without dropping the offboarding record', () => {
    const parsed = parseConnector({
      ...VALID,
      offboardedAt: '2026-10-21T21:45:00.000Z',
      offboardedBy: 'admin-2',
      offboardReason: '  Demo offboarding  ',
      reactivatedAt: '2026-10-25T19:30:00.000Z',
      reactivatedBy: 'admin-3',
    });
    assert.equal(parsed?.offboardedBy, 'admin-2');
    assert.equal(parsed?.offboardReason, 'Demo offboarding');
    assert.equal(parsed?.reactivatedAt, '2026-10-25T19:30:00.000Z');
    assert.equal(parsed?.reactivatedBy, 'admin-3');
  });

  test('legacy or malformed reactivation metadata is nullable', () => {
    for (const value of [undefined, null, 42, {}]) {
      const parsed = parseConnector({
        ...VALID,
        reactivatedAt: value,
        reactivatedBy: value,
      });
      assert.equal(parsed?.reactivatedAt, null);
      assert.equal(parsed?.reactivatedBy, null);
    }
  });
});
