/**
 * Tests for the sign-in redirect URL builder.
 *
 * `callbackUrl` is a query parameter whose value is itself a URL, which is the
 * kind of nesting that looks fine until a destination carries its own query
 * string. These pages used to build the URL by hand, and the hand-built
 * version interpolated the path raw:
 *
 *     `/signin?callbackUrl=/m/schedule/book?mentor=${handle}`
 *
 * A reader sees one parameter. A URL parser sees two, because the second `?`
 * is just a character and `mentor` becomes a sibling of `callbackUrl` rather
 * than part of it. The member then lands on a booking form with no mentor,
 * which refuses to submit and cannot say why.
 *
 * So the assertions below are mostly about separators surviving the round
 * trip. Parsing the result rather than string-matching it is deliberate: the
 * bug being pinned is precisely that a parser disagrees with the eye.
 *
 * No session, no router, no network — `signInPath` takes a string.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { signInPath } from '@/lib/signin-redirect';

/** What a browser would hand back to the sign-in page for a given path. */
function parseCallback(path: string): string | null {
  return new URL(path, 'https://panamia.club').searchParams.get('callbackUrl');
}

describe('signInPath', () => {
  test('always points at the branded sign-in page', () => {
    assert.equal(
      new URL(signInPath('/m/profile'), 'https://panamia.club').pathname,
      '/signin'
    );
  });

  test('round-trips a plain path', () => {
    assert.equal(parseCallback(signInPath('/m/profile')), '/m/profile');
  });

  test('keeps a destination query string attached to the destination', () => {
    // The regression: ?mentor= has to come back as part of callbackUrl, not
    // as a second parameter of /signin.
    const path = signInPath('/m/schedule/book?mentor=jose');
    assert.equal(parseCallback(path), '/m/schedule/book?mentor=jose');
    assert.equal(
      new URL(path, 'https://panamia.club').searchParams.get('mentor'),
      null,
      'mentor leaked out of callbackUrl and became a sibling parameter'
    );
  });

  test('survives a destination with several parameters', () => {
    const target = '/e/summer-jam/manage?tab=attendees&page=2';
    assert.equal(parseCallback(signInPath(target)), target);
  });

  test('survives separators a route param could smuggle in', () => {
    // Slugs are generated URL-safe, but the slug in the path is whatever the
    // visitor typed, so the builder cannot assume it is tame.
    for (const slug of ['a?b', 'a&b', 'a#b', 'a b', 'a/b']) {
      const target = `/a/${slug}/edit`;
      assert.equal(
        parseCallback(signInPath(target)),
        target,
        `destination mangled for slug ${JSON.stringify(slug)}`
      );
    }
  });

  test('does not double-encode a path that already contains an escape', () => {
    const target = '/a/caf%C3%A9/edit';
    assert.equal(parseCallback(signInPath(target)), target);
  });
});
