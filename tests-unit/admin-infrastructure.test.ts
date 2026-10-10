import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type DatabaseSnapshot,
  type DatabaseStats,
  databaseVerdict,
  describeBytes,
} from '@/lib/admin/livesite';

/**
 * Infrastructure band.
 *
 * These assert on tone and on the one noun that distinguishes a verdict from
 * its neighbours, never on whole sentences. The copy on this page is meant to
 * be rewritten; the classification is not.
 *
 * The ordering tests matter most. Every branch below is reachable only
 * because the ones above it did not fire, so a reordering that looks harmless
 * silently makes a check unreachable -- which is a failure that no type and
 * no single-branch test would catch.
 */

/** A healthy server, far from every threshold. */
function stats(over: Partial<DatabaseStats> = {}): DatabaseStats {
  return {
    connections: 10,
    maxConnections: 60,
    reserved: 3,
    active: 2,
    idleInTransaction: 0,
    canReadAllStats: true,
    sizeBytes: 50 * 1024 * 1024,
    ...over,
  };
}

function ok(over: Partial<DatabaseStats> = {}): DatabaseSnapshot {
  return { available: true, stats: stats(over) };
}

describe('describeBytes', () => {
  it('reports bytes below a kilobyte', () => {
    assert.equal(describeBytes(0), '0 B');
    assert.equal(describeBytes(1023), '1023 B');
  });

  it('switches unit exactly at each power of 1024', () => {
    assert.equal(describeBytes(1024), '1 KB');
    assert.equal(describeBytes(1024 * 1024), '1 MB');
    assert.equal(describeBytes(1024 * 1024 * 1024), '1.0 GB');
  });

  it('keeps megabytes whole and gigabytes to one decimal', () => {
    // A database that grows by a megabyte between page loads should not
    // redraw the number; one that grows by a tenth of a gig should.
    assert.equal(describeBytes(512 * 1024 * 1024), '512 MB');
    assert.equal(describeBytes(1.55 * 1024 * 1024 * 1024), '1.6 GB');
  });

  it('does not render a negative size', () => {
    assert.equal(describeBytes(-1), '0 B');
  });
});

describe('databaseVerdict', () => {
  it('warns, not alarms, when the database will not describe itself', () => {
    // Losing visibility is not the same as being unhealthy, and dressing it
    // up as an alarm would train the reader to ignore red.
    const v = databaseVerdict({
      available: false,
      reason: 'permission denied',
    });
    assert.equal(v.tone, 'warn');
    assert.match(v.headline, /not reporting/i);
    assert.match(v.detail, /permission denied/);
  });

  it('warns when the server states no ceiling, before any ratio is computed', () => {
    // Guards a division that would otherwise be against zero.
    const v = databaseVerdict(ok({ maxConnections: 0, connections: 400 }));
    assert.equal(v.tone, 'warn');
    assert.match(v.headline, /ceiling unknown/i);
    assert.match(v.detail, /400/);
  });

  it('alarms at ninety percent of the usable ceiling', () => {
    // 60 - 3 reserved = 57 usable; 90% of 57 is 51.3.
    assert.equal(databaseVerdict(ok({ connections: 52 })).tone, 'alarm');
  });

  it('warns at seventy-five percent and alarms above ninety', () => {
    assert.equal(databaseVerdict(ok({ connections: 43 })).tone, 'warn');
    assert.equal(databaseVerdict(ok({ connections: 56 })).tone, 'alarm');
  });

  it('measures against the usable ceiling, not the raw max', () => {
    // 44 of 57 usable is 77% and warns; 44 of 60 would be 73% and would not.
    // Ordinary roles cannot take the reserved slots, so the lower number is
    // the true one.
    const v = databaseVerdict(ok({ connections: 44 }));
    assert.equal(v.tone, 'warn');
    assert.match(v.detail, /of 57/);
  });

  it('counts headroom down to the usable ceiling', () => {
    const v = databaseVerdict(ok({ connections: 55 }));
    assert.equal(v.tone, 'alarm');
    assert.match(v.detail, /leaving 2\b/);
  });

  it('raises idle-in-transaction only once connections are not the story', () => {
    const v = databaseVerdict(ok({ connections: 10, idleInTransaction: 5 }));
    assert.equal(v.tone, 'warn');
    assert.match(v.headline, /idle in transaction/i);
  });

  it('lets a connection alarm outrank idle-in-transaction', () => {
    // Both are true. The ceiling is the one that takes the site down, and the
    // held transactions are a plausible cause of it -- so the alarm leads and
    // the panel still shows the idle count as a fact.
    const v = databaseVerdict(ok({ connections: 55, idleInTransaction: 9 }));
    assert.equal(v.tone, 'alarm');
    assert.match(v.headline, /out of connections/i);
  });

  it('tolerates a couple of idle transactions without comment', () => {
    assert.equal(databaseVerdict(ok({ idleInTransaction: 2 })).tone, 'ok');
  });

  it('never treats hidden state as zero idle transactions', () => {
    // null means "not allowed to say". A masked server must not read as a
    // clean one.
    const v = databaseVerdict(ok({ idleInTransaction: null, active: null }));
    assert.equal(v.tone, 'ok');
    assert.doesNotMatch(v.headline, /idle in transaction/i);
  });

  it('says so when it cannot see connection state', () => {
    const v = databaseVerdict(
      ok({ canReadAllStats: false, active: null, idleInTransaction: null }),
    );
    assert.equal(v.tone, 'ok');
    assert.match(v.detail, /hidden from this role/i);
  });

  it('stays quiet about visibility when it can see everything', () => {
    assert.doesNotMatch(databaseVerdict(ok()).detail, /hidden/i);
  });

  it('reports size without judging it', () => {
    // No plan is knowable from inside the database, so no gauge is honest.
    const v = databaseVerdict(ok({ sizeBytes: 40 * 1024 * 1024 * 1024 }));
    assert.equal(v.tone, 'ok');
    assert.match(v.detail, /40\.0 GB/);
  });
});
