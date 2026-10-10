/**
 * GIF attachments in DMs.
 *
 * Three things are worth locking down here, and they are the three that are
 * cheap to get wrong later:
 *
 * 1. `isGifMediaUrl` is the only thing standing between the mirror route and
 *    a server-side request forgery. That route fetches a URL the client
 *    names, from inside the Worker. A naive `url.includes('giphy.com')` check
 *    passes `https://giphy.com.evil.test/x.gif` -- which is not GIPHY, it is
 *    a host someone else owns -- so the tests below pin the hostile shapes,
 *    not just the happy one.
 *
 * 2. `normalizeGifResults` parses a third party's JSON. GIPHY is free to add,
 *    rename, or omit fields, and a picker that throws on one malformed row is
 *    a picker that shows nothing at all. GIPHY in particular returns image
 *    dimensions as *strings* ("480", not 480), which a reasonable-looking
 *    `typeof === 'number'` guard would silently discard in full.
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
  isGifMediaUrl,
  normalizeGifResults,
  readGifCache,
  writeGifCache,
  gifCacheKey,
  GIF_CACHE_TTL_MS,
  GIPHY_ATTRIBUTION,
  GIPHY_SEARCH_PLACEHOLDER,
  type GifCacheEntry,
} from '@/lib/gifs/giphy';
import { attachmentLabel } from '@/app/messages/_lib/format';
import type { SocialStatusDisplay } from '@/lib/interfaces';

describe('isGifMediaUrl', () => {
  it('accepts GIPHY media hosts', () => {
    assert.equal(isGifMediaUrl('https://media.giphy.com/abc/x.gif'), true);
    assert.equal(isGifMediaUrl('https://giphy.com/gifs/x'), true);
  });

  /* GIPHY serves the same object from media0 through media4 and from i.,
     rotating between them, so the allowlist has to cover the whole suffix
     rather than one pinned hostname. A GIF that mirrors today and 404s
     tomorrow because the CDN picked a different shard is not a bug anyone
     would find quickly. */
  it('accepts every rotating media shard, not just one', () => {
    for (const host of [
      'media0.giphy.com',
      'media1.giphy.com',
      'media2.giphy.com',
      'media3.giphy.com',
      'media4.giphy.com',
      'i.giphy.com',
    ]) {
      assert.equal(
        isGifMediaUrl(`https://${host}/media/abc/giphy.gif`),
        true,
        `${host} should be allowed`
      );
    }
  });

  it('rejects a lookalike host that merely starts with giphy.com', () => {
    // The SSRF case: giphy.com.evil.test resolves to evil.test.
    assert.equal(isGifMediaUrl('https://giphy.com.evil.test/x.gif'), false);
    assert.equal(
      isGifMediaUrl('https://giphy.com.attacker.io/payload.gif'),
      false
    );
  });

  it('rejects a host that merely ends with giphy.com without a dot', () => {
    assert.equal(isGifMediaUrl('https://notgiphy.com/x.gif'), false);
    assert.equal(isGifMediaUrl('https://evilgiphy.com/x.gif'), false);
  });

  it('rejects non-https schemes', () => {
    assert.equal(isGifMediaUrl('http://media.giphy.com/x.gif'), false);
    assert.equal(isGifMediaUrl('file:///etc/passwd'), false);
    assert.equal(isGifMediaUrl('gopher://media.giphy.com/x'), false);
  });

  it('rejects internal addresses outright', () => {
    assert.equal(
      isGifMediaUrl('https://169.254.169.254/latest/meta-data/'),
      false
    );
    assert.equal(isGifMediaUrl('https://localhost/x.gif'), false);
    assert.equal(isGifMediaUrl('https://10.0.0.1/x.gif'), false);
  });

  it('rejects things that are not URLs at all', () => {
    assert.equal(isGifMediaUrl(''), false);
    assert.equal(isGifMediaUrl('not a url'), false);
    assert.equal(isGifMediaUrl('//media.giphy.com/x.gif'), false);
  });

  it('rejects userinfo smuggled in front of the real host', () => {
    // https://media.giphy.com@evil.test/ resolves to evil.test, not GIPHY.
    assert.equal(
      isGifMediaUrl('https://media.giphy.com@evil.test/x.gif'),
      false
    );
  });
});

describe('normalizeGifResults', () => {
  /* Shaped after a real GIPHY /v1/gifs/search payload: results under `data`,
     renditions under `images`, dimensions as strings. */
  const row = (id: string) => ({
    id,
    title: `${id} GIF`,
    alt_text: `${id} alt`,
    images: {
      fixed_width_small: {
        url: `https://media.giphy.com/media/${id}/200w_s.gif`,
        width: '100',
        height: '100',
      },
      downsized_medium: {
        url: `https://media.giphy.com/media/${id}/giphy.gif`,
        width: '480',
        height: '270',
      },
      original: {
        url: `https://media.giphy.com/media/${id}/original.gif`,
        width: '800',
        height: '450',
      },
    },
  });

  it('prefers the send rendition and the small preview', () => {
    const [first] = normalizeGifResults({ data: [row('abc')] });
    assert.equal(first.id, 'abc');
    assert.equal(first.url, 'https://media.giphy.com/media/abc/giphy.gif');
    assert.equal(
      first.previewUrl,
      'https://media.giphy.com/media/abc/200w_s.gif'
    );
  });

  /* The one that would have shipped broken: GIPHY sends "480", not 480. A
     typeof === 'number' guard drops every row and the picker renders empty
     with no error anywhere. */
  it('reads string dimensions as numbers', () => {
    const [first] = normalizeGifResults({ data: [row('abc')] });
    assert.equal(first.width, 480);
    assert.equal(first.height, 270);
    assert.equal(typeof first.width, 'number');
  });

  it('prefers alt_text over title for the description', () => {
    const [first] = normalizeGifResults({ data: [row('abc')] });
    assert.equal(first.description, 'abc alt');

    const noAlt = { ...row('abc'), alt_text: undefined };
    const [second] = normalizeGifResults({ data: [noAlt] });
    assert.equal(second.description, 'abc GIF');
  });

  it('falls back when the preferred renditions are missing', () => {
    const missing = {
      id: 'abc',
      title: 'x',
      images: {
        original: {
          url: 'https://media.giphy.com/media/abc/original.gif',
          width: '1',
          height: '2',
        },
      },
    };
    const [first] = normalizeGifResults({ data: [missing] });
    assert.equal(first.url, 'https://media.giphy.com/media/abc/original.gif');
    // Preview falls back to the same URL rather than leaving a broken img.
    assert.equal(
      first.previewUrl,
      'https://media.giphy.com/media/abc/original.gif'
    );
  });

  it('drops malformed rows instead of throwing on them', () => {
    const results = normalizeGifResults({
      data: [
        row('good'),
        null,
        'nope',
        {},
        { id: 'no-images' },
        /* Has a usable URL but no id. Dropped on purpose: the id is the
           React key and GIPHY's own handle for the GIF, so a row without one
           cannot be rendered in a list or reported back to them. */
        {
          images: {
            downsized_medium: { url: 'https://media.giphy.com/x.gif' },
          },
        },
        row('second'),
      ],
    });
    assert.equal(results.length, 2, 'the valid rows survive, the rest do not');
    assert.deepEqual(
      results.map((r) => r.id),
      ['good', 'second']
    );
  });

  it('rejects rows whose media is not actually on GIPHY', () => {
    const hostile = {
      id: 'evil',
      title: 'x',
      images: {
        downsized_medium: {
          url: 'https://giphy.com.evil.test/x.gif',
          width: '1',
          height: '1',
        },
      },
    };
    assert.equal(normalizeGifResults({ data: [hostile] }).length, 0);
  });

  it('survives a response that is not the shape it expects', () => {
    assert.deepEqual(normalizeGifResults({}), []);
    assert.deepEqual(normalizeGifResults(null), []);
    assert.deepEqual(normalizeGifResults({ data: 'nope' }), []);
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
 * A GIPHY beta key allows one hundred calls an HOUR across the whole app,
 * shared by every pana at once. That is the tightest constraint in the
 * feature by a wide margin, and this cache is the only thing keeping normal
 * use under it. A quiet regression here does not look like a bug, it looks
 * like GIF search being flaky for everyone at once.
 * ------------------------------------------------------------------------ */
describe('GIF cache', () => {
  const gif = {
    id: '1',
    description: 'dale',
    previewUrl: 'https://media.giphy.com/media/a/200w_s.gif',
    url: 'https://media.giphy.com/media/a/giphy.gif',
    width: 200,
    height: 200,
  };

  /* The TTL is deliberately matched to GIPHY's quota window rather than
     picked for freshness. At 60 minutes a distinct term costs one call an
     hour, so the cap allows ~100 distinct searches; at the old 10 minutes it
     cost six, which would have allowed only ~16. Shortening this is a
     capacity decision, not a tuning one. */
  it('holds entries for a full hour, matching the quota window', () => {
    assert.equal(GIF_CACHE_TTL_MS, 60 * 60_000);
  });

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
 * GIPHY's terms require all apps using the API to "conspicuously display
 * 'Powered By GIPHY' attribution marks where the API is utilized". It is the
 * kind of thing that gets deleted during a tidy-up, so it is asserted at the
 * source level: removing it has to fail a test, not just quietly put us out
 * of compliance.
 * https://developers.giphy.com/docs/api/
 * ------------------------------------------------------------------------ */
describe('GIPHY attribution', () => {
  const picker = readFileSync(
    'app/messages/_components/gif-picker.tsx',
    'utf8'
  );

  it('names GIPHY in the picker', () => {
    /* Asserting the JSX interpolation, not the import -- an unused import
       would satisfy a looser check while rendering nothing, which is exactly
       the regression this is here to catch. */
    assert.match(picker, /\{GIPHY_ATTRIBUTION\}/);
  });

  it('uses the sanctioned search placeholder', () => {
    assert.match(picker, /placeholder=\{GIPHY_SEARCH_PLACEHOLDER\}/);
    assert.equal(GIPHY_SEARCH_PLACEHOLDER, 'Search GIPHY');
  });

  it('keeps the attribution wording exactly as GIPHY requires', () => {
    // Their capitalisation, not ours: "Powered By GIPHY".
    assert.equal(GIPHY_ATTRIBUTION, 'Powered By GIPHY');
  });
});
