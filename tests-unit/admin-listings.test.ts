/**
 * Tests for the directory review queue's rules.
 *
 * Two things here are worth pinning. The first is `computeFlags`, which is the
 * actual product of this screen — the queue's job is not to list names, it is
 * to say what is worth a second look about each one, and a flag that fires on
 * the wrong rows is worse than no flag because a reviewer learns to ignore it.
 * The second is `queueOrder`, which encodes the only ordering decision the page
 * makes and deliberately offers no way to change.
 *
 * `normalizeListingName` gets its own block because duplicate detection lives
 * or dies on it: too aggressive and two different businesses collide, too
 * timid and an obvious re-submission sails through unflagged.
 *
 * No database and no network — every function here takes a plain object.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  REVIEW_SLA_DAYS,
  THIN_DETAILS_CHARS,
  computeFlags,
  daysWaiting,
  listingStats,
  normalizeListingName,
  queueOrder,
  waitLabel,
  type QueueListing,
} from '@/lib/admin/listings';

const LONG_ENOUGH = 'x'.repeat(THIN_DETAILS_CHARS + 10);
const NO_OTHERS = new Set<string>();

/** A submission with nothing wrong with it, as the baseline to deviate from. */
const CLEAN = {
  name: 'Taller Lucia',
  details: LONG_ENOUGH,
  instagram: 'tallerlucia',
  website: 'https://tallerlucia.example',
  locallyBased: 'yes',
};

function daysAgo(days: number): string {
  const when = new Date();
  when.setDate(when.getDate() - days);
  return when.toISOString();
}

function listing(overrides: Partial<QueueListing> = {}): QueueListing {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'Taller Lucia',
    email: 'hola@tallerlucia.example',
    submittedAt: daysAgo(1),
    locality: 'Miami',
    region: 'FL',
    fiveWords: 'Hand thrown ceramics in Miami',
    details: LONG_ENOUGH,
    tags: ['Art'],
    instagram: 'tallerlucia',
    website: 'https://tallerlucia.example',
    phoneNumber: '',
    pendingOwnerEmail: 'lucia@example.com',
    claimed: false,
    accountType: 'directory',
    locallyBased: 'yes',
    flags: [],
    ...overrides,
  };
}

describe('normalizeListingName', () => {
  test('ignores the things a business spells differently on two days', () => {
    const canonical = normalizeListingName('Taller Lucía');
    for (const variant of [
      'taller lucía',
      'TALLER LUCÍA',
      'Taller  Lucía',
      'Taller-Lucía',
      'The Taller Lucía LLC',
      'Taller Lucia',
    ]) {
      assert.equal(
        normalizeListingName(variant),
        canonical,
        `${variant} should normalise to the same name`
      );
    }
  });

  test('treats an ampersand and the word as the same thing', () => {
    assert.equal(
      normalizeListingName('Flor & Fauna'),
      normalizeListingName('Flor and Fauna')
    );
  });

  test('keeps genuinely different businesses apart', () => {
    assert.notEqual(
      normalizeListingName('Cafe Habana'),
      normalizeListingName('Cafe Havana')
    );
  });

  test('a name with nothing but punctuation normalises to empty', () => {
    // The route filters these out before building the duplicate set. If it did
    // not, every nameless row would match every other nameless row.
    assert.equal(normalizeListingName('---'), '');
  });
});

describe('computeFlags', () => {
  test('a complete application raises nothing', () => {
    assert.deepEqual(computeFlags(CLEAN, NO_OTHERS), []);
  });

  test('no socials needs both to be missing', () => {
    assert.deepEqual(
      computeFlags({ ...CLEAN, instagram: '', website: '' }, NO_OTHERS),
      ['no-socials']
    );
    assert.deepEqual(
      computeFlags({ ...CLEAN, instagram: '' }, NO_OTHERS),
      [],
      'a website alone is still something to check against'
    );
    assert.deepEqual(
      computeFlags({ ...CLEAN, website: '' }, NO_OTHERS),
      [],
      'an Instagram alone is still something to check against'
    );
  });

  test('a duplicate is matched on the normalised name, not the literal one', () => {
    const existing = new Set([normalizeListingName('Taller Lucia')]);
    assert.deepEqual(
      computeFlags({ ...CLEAN, name: 'THE TALLER LUCIA LLC' }, existing),
      ['possible-duplicate']
    );
  });

  test('an empty name never matches an empty name', () => {
    // Guards the case where both sides normalise away to nothing.
    const existing = new Set(['']);
    assert.deepEqual(computeFlags({ ...CLEAN, name: '!!!' }, existing), []);
  });

  test('"no" and "other" are different answers and get different notes', () => {
    assert.deepEqual(
      computeFlags({ ...CLEAN, locallyBased: 'no' }, NO_OTHERS),
      ['outside-area']
    );
    assert.deepEqual(
      computeFlags({ ...CLEAN, locallyBased: 'other' }, NO_OTHERS),
      ['locality-unclear']
    );
    assert.deepEqual(
      computeFlags({ ...CLEAN, locallyBased: '' }, NO_OTHERS),
      [],
      'an unanswered question is not an answer of no'
    );
  });

  test('thin details is measured on trimmed length', () => {
    assert.deepEqual(
      computeFlags({ ...CLEAN, details: '   ' }, NO_OTHERS),
      ['thin-details'],
      'whitespace is not a description'
    );
    assert.deepEqual(
      computeFlags(
        { ...CLEAN, details: 'x'.repeat(THIN_DETAILS_CHARS) },
        NO_OTHERS
      ),
      [],
      'exactly at the threshold is long enough'
    );
    assert.deepEqual(
      computeFlags(
        { ...CLEAN, details: 'x'.repeat(THIN_DETAILS_CHARS - 1) },
        NO_OTHERS
      ),
      ['thin-details']
    );
  });

  test('a bad application collects every flag it earns', () => {
    const flags = computeFlags(
      {
        name: 'Taller Lucia',
        details: 'we sell things',
        instagram: '',
        website: '',
        locallyBased: 'no',
      },
      new Set([normalizeListingName('Taller Lucia')])
    );
    assert.deepEqual(flags.sort(), [
      'no-socials',
      'outside-area',
      'possible-duplicate',
      'thin-details',
    ]);
  });
});

describe('queueOrder', () => {
  test('oldest first', () => {
    const rows = [
      listing({ id: 'newest', submittedAt: daysAgo(1) }),
      listing({ id: 'oldest', submittedAt: daysAgo(40) }),
      listing({ id: 'middle', submittedAt: daysAgo(20) }),
    ];
    assert.deepEqual(
      queueOrder(rows).map((row) => row.id),
      ['oldest', 'middle', 'newest']
    );
  });

  test('does not mutate the array it was handed', () => {
    const rows = [
      listing({ id: 'newest', submittedAt: daysAgo(1) }),
      listing({ id: 'oldest', submittedAt: daysAgo(40) }),
    ];
    queueOrder(rows);
    assert.equal(rows[0].id, 'newest');
  });
});

describe('waiting time', () => {
  test('reads the way a reviewer would say it', () => {
    assert.equal(waitLabel(0), 'today');
    assert.equal(waitLabel(1), '1 day');
    assert.equal(waitLabel(9), '9 days');
  });

  test('something submitted today has waited zero days', () => {
    assert.equal(daysWaiting(new Date().toISOString()), 0);
  });
});

describe('listingStats', () => {
  test('counts what is over the window, not what is merely old', () => {
    const rows = [
      listing({ submittedAt: daysAgo(REVIEW_SLA_DAYS + 1) }),
      listing({ submittedAt: daysAgo(REVIEW_SLA_DAYS) }),
      listing({ submittedAt: daysAgo(1) }),
    ];
    const overdue = listingStats(rows).find((stat) =>
      stat.label.startsWith('Over')
    );
    assert.equal(
      overdue?.value,
      '1',
      'exactly at the window is not yet over it'
    );
  });

  test('unclaimed means no manager, regardless of whether a setup invitation exists', () => {
    const rows = [
      listing({ pendingOwnerEmail: '', claimed: false }),
      listing({ pendingOwnerEmail: 'lucia@example.com', claimed: false }),
      listing({ pendingOwnerEmail: '', claimed: true }),
    ];
    const needALook = listingStats(rows).find(
      (stat) => stat.label === 'Need a look'
    );
    assert.match(needALook?.note ?? '', /^2 also unclaimed$/);
  });

  test('an empty queue reports zeroes rather than throwing', () => {
    const stats = listingStats([]);
    assert.equal(stats[0].value, '0');
    assert.equal(
      stats.find((stat) => stat.label === 'Oldest')?.value,
      'today',
      'no backlog reads as nothing waiting, not as NaN'
    );
  });
});

describe('listing profile links', () => {
  const source = readFileSync(
    new URL('../app/admin/listings/page.tsx', import.meta.url),
    'utf8'
  );

  test('waiting listing names open their private profile preview', () => {
    assert.match(
      source,
      /<Link\s+href=\{listingPreviewPath\(listing\.id\)\}[^>]*>\s*\{listing\.name\}\s*<\/Link>/
    );
  });

  test('decided names use public profiles only for approved listings', () => {
    assert.match(
      source,
      /<Link\s+href=\{\s*row\.decision === 'approved'\s*\? listingPublicPath\(row\)\s*:\s*listingPreviewPath\(row\.id\)\s*\}[^>]*>\s*\{row\.name\}\s*<\/Link>/
    );
  });
});

describe('read-only listing previews', () => {
  const source = (path: string) =>
    readFileSync(new URL(path, import.meta.url), 'utf8');

  test('the viewer skips public signal requests and refuses profile actions', () => {
    const viewer = source('../app/p/[user]/_components/profile-viewer.tsx');
    assert.match(viewer, /if \(preview \|\| status === 'loading'\) return/);
    assert.match(viewer, /if \(preview\) return false/);
    assert.match(viewer, /isOwner: !preview && isOwner/);
    assert.match(viewer, /showsPanaActions:\s*!preview &&/);
  });

  test('profile rendering propagates preview mode to its interactive sections', () => {
    const profile = source('../app/p/[user]/_components/business-profile.tsx');
    for (const component of [
      'ProfileViewer',
      'ProfileHero',
      'MentoringSection',
    ]) {
      assert.match(
        profile,
        new RegExp(`<${component}\\s[^>]*preview=\\{preview\\}`)
      );
    }
    assert.match(profile, /!preview &&\s*\(claimed \?/);
    assert.match(
      source('../app/p/[user]/_components/profile-hero.tsx'),
      /\{!preview && \(\s*<div>[\s\S]*onClick=\{handleShare\}/
    );
    assert.match(
      source('../app/p/[user]/_components/mentoring-section.tsx'),
      /!preview && <BookSessionButton/
    );
  });
});
