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
import { isTenorMediaUrl, normalizeTenorResults } from '@/lib/gifs/tenor';
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
