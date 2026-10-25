import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rosterTallies } from '@/lib/connectors/roster';
import type { RosterMember } from '@/lib/connectors/roster';
import { isCadence } from '@/lib/connectors/events';
import { isProgress } from '@/lib/connectors/commitments';
import { HOUSES, PODS, TIERS } from '@/lib/connectors/model';
import type { HouseId, PodId, TierId } from '@/lib/connectors/model';

function member(
  id: string,
  pod: PodId,
  houses: HouseId[],
  tier: TierId
): RosterMember {
  return {
    profileId: id,
    displayName: id,
    email: `${id}@example.test`,
    imageUrl: null,
    membership: {
      status: 'active',
      pod,
      houses,
      tier,
      bring: '',
      appliedAt: '2026-01-01T00:00:00.000Z',
      decidedAt: '2026-01-02T00:00:00.000Z',
      decidedBy: null,
      offboardedAt: null,
      offboardedBy: null,
      offboardReason: null,
      reactivatedAt: null,
      reactivatedBy: null,
    },
  };
}

describe('rosterTallies', () => {
  test('an empty roster still names every bucket', () => {
    /* The bars have to render at zero rather than vanish. A house nobody is
       in is a fact about the programme worth seeing; a missing row just looks
       like the house was retired. */
    const tallies = rosterTallies([]);

    assert.equal(tallies.total, 0);
    assert.deepEqual(
      tallies.pods.map((p) => p.id),
      PODS.map((p) => p.id)
    );
    assert.deepEqual(
      tallies.houses.map((h) => h.id),
      HOUSES.map((h) => h.id)
    );
    assert.deepEqual(
      tallies.tiers.map((t) => t.id),
      TIERS.map((t) => String(t.id))
    );
    assert.ok(tallies.houses.every((h) => h.count === 0));
  });

  test('counts a person once per pod and once per tier', () => {
    const tallies = rosterTallies([
      member('a', 'miami', ['education'], 1),
      member('b', 'miami', ['education'], 2),
      member('c', 'broward', ['education'], 1),
    ]);

    assert.equal(tallies.total, 3);
    assert.equal(tallies.pods.find((p) => p.id === 'miami')?.count, 2);
    assert.equal(tallies.pods.find((p) => p.id === 'broward')?.count, 1);
    assert.equal(tallies.tiers.find((t) => t.id === '1')?.count, 2);
  });

  test('house counts can exceed the headcount, because houses are a set', () => {
    /* This is the one place the band is allowed to "disagree" with the total,
       and the console says so in words underneath the bars. Somebody who runs
       a reading group and books the venue for it is in two houses, and
       picking one would be a lie about half their work. */
    const tallies = rosterTallies([
      member('a', 'miami', ['education', 'culturalWorkers'], 2),
    ]);

    assert.equal(tallies.total, 1);
    assert.equal(
      tallies.houses.reduce((sum, h) => sum + h.count, 0),
      2
    );
  });
});

describe('isCadence', () => {
  test('accepts the four the table allows', () => {
    for (const value of ['once', 'weekly', 'weekends', 'monthly']) {
      assert.equal(isCadence(value), true);
    }
  });

  test('rejects the fixture-era spelling', () => {
    /* The mock said `oneTime`; the CHECK constraint in drizzle/0057 says
       `once`. If this ever starts passing, a form is writing a value the
       database will refuse. */
    assert.equal(isCadence('oneTime'), false);
  });

  test('rejects nonsense without throwing', () => {
    for (const value of [null, undefined, 42, {}, '']) {
      assert.equal(isCadence(value), false);
    }
  });
});

describe('isProgress', () => {
  test('accepts the three the table allows', () => {
    for (const value of ['notSet', 'inProgress', 'done']) {
      assert.equal(isProgress(value), true);
    }
  });

  test('rejects anything else', () => {
    for (const value of ['almost', 'DONE', null, 3]) {
      assert.equal(isProgress(value), false);
    }
  });
});
