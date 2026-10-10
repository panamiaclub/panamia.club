/**
 * GIF attachments in DMs.
 *
 * Three things are worth locking down here, and they are the three that are
 * cheap to get wrong later:
 *
 * 1. `isTenorMediaUrl` is the only thing standing between the mirror route
 *    and a server-side request forgery. That route fetches a URL the client
 *    names, from inside the Worker. A naive `url.includes('tenor.com')` check
 *    passes `https://tenor.com.evil.test/x.gif` -- which is not Tenor, it is
 *    a host someone else owns -- so the tests below pin the hostile shapes,
 *    not just the happy one.
 *
 * 2. `normalizeTenorResults` parses a third party's JSON. Tenor is free to
 *    add, rename, or omit fields, and a picker that throws on one malformed
 *    row is a picker that shows nothing at all.
 *
 * 3. `attachmentLabel` was the hardcoded string 'Sent a voice memo' for every
 *    attachment type. A GIF appearing in the sidebar as a voice memo is the
 *    sort of small wrongness that makes people stop believing the rest of the
 *    interface.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isTenorMediaUrl,
  normalizeTenorResults,
  readGifCache,
  writeGifCache,
  gifCacheKey,
  GIF_CACHE_TTL_MS,
  TENOR_ATTRIBUTION,
  TENOR_SEARCH_PLACEHOLDER,
  type GifCacheEntry,
} from '@/lib/gifs/tenor';
import { attachmentLabel } from '@/app/messages/_lib/format';
import type { SocialStatusDisplay } from '@/lib/interfaces';

describe('isTenorMediaUrl', () => {
  it('accepts Tenor media hosts', () => {
    assert.equal(isTenorMediaUrl('https://media.tenor.com/abc/x.gif'), true);
    assert.equal(isTenorMediaUrl('https://media1.tenor.com/abc/x.gif'), true);
    assert.equal(isTenorMediaUrl('https://tenor.com/view/x.gif'), true);
  });

  it('rejects a lookalike host that merely starts with tenor.com', () => {
    // The attack a substring check would wave through.
    assert.equal(isTenorMediaUrl('https://tenor.com.evil.test/x.gif'), false);
    assert.equal(
      isTenorMediaUrl('https://tenor.com.attacker.io/payload.gif'),
      false
    );
  });

  it('rejects a host that merely ends with tenor.com without a dot', () => {
    assert.equal(isTenorMediaUrl('https://nottenor.com/x.gif'), false);
    assert.equal(isTenorMediaUrl('https://eviltenor.com/x.gif'), false);
  });

  it('rejects non-HTTPS schemes', () => {
    // http is downgradeable; file and gopher are the classic SSRF pivots.
    assert.equal(isTenorMediaUrl('http://media.tenor.com/x.gif'), false);
    assert.equal(isTenorMediaUrl('file:///etc/passwd'), false);
    assert.equal(isTenorMediaUrl('gopher://media.tenor.com/x'), false);
  });

  it('rejects internal addresses outright', () => {
    assert.equal(
      isTenorMediaUrl('https://169.254.169.254/latest/meta-data/'),
      false
    );
    assert.equal(isTenorMediaUrl('https://localhost/x.gif'), false);
    assert.equal(isTenorMediaUrl('https://10.0.0.1/x.gif'), false);
  });

  it('rejects garbage without throwing', () => {
    assert.equal(isTenorMediaUrl(''), false);
    assert.equal(isTenorMediaUrl('not a url'), false);
    assert.equal(isTenorMediaUrl('//media.tenor.com/x.gif'), false);
  });

  it('ignores credentials smuggled into the authority', () => {
    // https://media.tenor.com@evil.test/ resolves to evil.test, not Tenor.
    assert.equal(
      isTenorMediaUrl('https://media.tenor.com@evil.test/x.gif'),
      false
    );
  });
});

describe('normalizeTenorResults', () => {
  const row = (id: string) => ({
    id,
    content_description: `a ${id} gif`,
    media_formats: {
      mediumgif: { url: `https://media.tenor.com/${id}/medium.gif`, dims: [] },
      tinygif: { url: `https://media.tenor.com/${id}/tiny.gif`, dims: [] },
      gif: {
        url: `https://media.tenor.com/${id}/full.gif`,
        dims: [480, 270],
      },
    },
  });

  it('maps a well-formed payload', () => {
    const [first] = normalizeTenorResults({ results: [row('abc')] });
    assert.equal(first.id, 'abc');
    assert.equal(first.description, 'a abc gif');
    assert.equal(first.url, 'https://media.tenor.com/abc/medium.gif');
    assert.equal(first.previewUrl, 'https://media.tenor.com/abc/tiny.gif');
  });

  it('falls back to the full gif when mediumgif is missing', () => {
    const missing = {
      ...row('abc'),
      media_formats: {
        gif: { url: 'https://media.tenor.com/abc/full.gif', dims: [1, 2] },
      },
    };
    const [first] = normalizeTenorResults({ results: [missing] });
    assert.equal(first.url, 'https://media.tenor.com/abc/full.gif');
    // With no tiny variant the preview falls back to the same asset rather
    // than rendering a broken tile.
    assert.equal(first.previewUrl, 'https://media.tenor.com/abc/full.gif');
  });

  it('drops malformed rows instead of throwing', () => {
    const results = normalizeTenorResults({
      results: [
        row('good'),
        null,
        'nonsense',
        { id: 'no-formats' },
        { id: 'empty-formats', media_formats: {} },
        { media_formats: { gif: { url: 'https://media.tenor.com/x.gif' } } },
      ],
    });
    assert.deepEqual(
      results.map((r) => r.id),
      ['good']
    );
  });

  it('rejects rows whose media is not actually on Tenor', () => {
    // Defence in depth: the mirror route checks too, but a result that could
    // never be mirrored should not be offered in the grid in the first place.
    const hostile = {
      id: 'evil',
      content_description: 'x',
      media_formats: { gif: { url: 'https://evil.test/x.gif', dims: [] } },
    };
    assert.equal(normalizeTenorResults({ results: [hostile] }).length, 0);
  });

  it('survives a payload with no results key at all', () => {
    assert.deepEqual(normalizeTenorResults({}), []);
    assert.deepEqual(normalizeTenorResults(null), []);
    assert.deepEqual(normalizeTenorResults({ results: 'nope' }), []);
  });
});

describe('attachmentLabel', () => {
  const att = (type: string, mediaType: string) =>
    [
      { type, mediaType, url: 'https://example.test/x' },
    ] as unknown as SocialStatusDisplay['attachments'];

  it('calls a GIF a GIF', () => {
    // The regression this file exists for: before the fix this returned
    // 'Sent a voice memo' for every attachment, GIFs included.
    assert.equal(attachmentLabel(att('image', 'image/gif')), 'GIF');
  });

  it('still calls a voice memo a voice memo', () => {
    assert.equal(
      attachmentLabel(att('audio', 'audio/webm')),
      'Sent a voice memo'
    );
  });

  it('distinguishes photos and video from both', () => {
    assert.equal(attachmentLabel(att('image', 'image/png')), 'Photo');
    assert.equal(attachmentLabel(att('video', 'video/mp4')), 'Video');
  });

  it('falls back without inventing a media type', () => {
    assert.equal(attachmentLabel(undefined), 'Message');
    assert.equal(attachmentLabel([]), 'Message');
    assert.equal(
      attachmentLabel(att('document', 'application/pdf')),
      'Attachment'
    );
  });

  it('is not case-sensitive about media types', () => {
    assert.equal(attachmentLabel(att('Image', 'IMAGE/GIF')), 'GIF');
  });
});

/* ------------------------------------------------------------------------ *
 * Cache
 *
 * Tenor allows one request per second across the whole key, shared by every
 * pana at once. These rules are what keep ordinary use below that line, so
 * they are worth pinning down: a quiet regression here does not look like a
 * bug, it looks like GIF search being flaky.
 * ------------------------------------------------------------------------ */
describe('GIF cache', () => {
  const gif = {
    id: '1',
    description: 'dale',
    previewUrl: 'https://media.tenor.com/a/tiny.gif',
    url: 'https://media.tenor.com/a/medium.gif',
    width: 200,
    height: 200,
  };

  it('keys on term and limit together', () => {
    assert.equal(gifCacheKey('Dale', 24), gifCacheKey('  dale  ', 24));
    assert.notEqual(gifCacheKey('dale', 24), gifCacheKey('dale', 12));
  });

  it('returns a stored entry before it expires', () => {
    const store = new Map<string, GifCacheEntry>();
    writeGifCache(store, 'k', [gif], 1_000);
    assert.deepEqual(readGifCache(store, 'k', 1_000 + GIF_CACHE_TTL_MS - 1), [
      gif,
    ]);
  });

  it('treats an expired entry as a miss and drops it', () => {
    const store = new Map<string, GifCacheEntry>();
    writeGifCache(store, 'k', [gif], 1_000);
    assert.equal(readGifCache(store, 'k', 1_000 + GIF_CACHE_TTL_MS), null);
    assert.equal(store.size, 0, 'expired entry should not linger');
  });

  it('misses cleanly on a key it has never seen', () => {
    assert.equal(readGifCache(new Map(), 'nope', Date.now()), null);
  });

  /* Unbounded would be a slow memory leak in a long-lived isolate: every
     distinct search anyone ever types, kept forever. */
  it('evicts oldest-first once it is full', () => {
    const store = new Map<string, GifCacheEntry>();
    for (let i = 0; i < 5; i += 1) {
      writeGifCache(store, `k${i}`, [gif], 1_000, 3);
    }
    assert.equal(store.size, 3);
    assert.deepEqual([...store.keys()], ['k2', 'k3', 'k4']);
  });

  it('refreshes an existing key rather than duplicating it', () => {
    const store = new Map<string, GifCacheEntry>();
    writeGifCache(store, 'k', [gif], 1_000, 3);
    writeGifCache(store, 'other', [gif], 1_000, 3);
    writeGifCache(store, 'k', [gif], 5_000, 3);

    assert.equal(store.size, 2);
    // Re-written, so 'k' is now the newest and 'other' is next to go.
    assert.deepEqual([...store.keys()], ['other', 'k']);
    assert.equal(store.get('k')?.expiresAt, 5_000 + GIF_CACHE_TTL_MS);
  });
});

/* ------------------------------------------------------------------------ *
 * Attribution
 *
 * Tenor's terms require their mark to be visible wherever their GIFs are.
 * It is the kind of thing that gets deleted during a tidy-up, so it is
 * asserted at the source level: removing it has to fail a test, not just
 * quietly put us out of compliance.
 * https://developers.google.com/tenor/guides/attribution
 * ------------------------------------------------------------------------ */
describe('Tenor attribution', () => {
  const picker = readFileSync(
    'app/messages/_components/gif-picker.tsx',
    'utf8'
  );

  it('names Tenor in the picker', () => {
    /* Asserting the JSX interpolation, not the import -- an unused import
       would satisfy a looser check while rendering nothing, which is exactly
       the regression this is here to catch. */
    assert.match(picker, /\{TENOR_ATTRIBUTION\}/);
  });

  it('uses the sanctioned search placeholder', () => {
    assert.match(picker, /placeholder=\{TENOR_SEARCH_PLACEHOLDER\}/);
    assert.equal(TENOR_SEARCH_PLACEHOLDER, 'Search Tenor');
  });

  it('keeps the attribution strings intact', () => {
    assert.match(TENOR_ATTRIBUTION, /Tenor/);
  });
});
