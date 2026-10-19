/**
 * Tests for the Permissions-Policy response header.
 *
 * This header is one string, set in one place, and a single character in it is
 * the difference between a working feature and a dead button. `geolocation=()`
 * is not "restrict geolocation" — an empty allowlist denies the API to *every*
 * origin, the document's own included, so `getCurrentPosition()` rejects with
 * PERMISSION_DENIED before the browser ever offers its prompt. That shipped,
 * and the directory's "Use my location" control failed closed into its
 * permission-denied branch for every visitor. Nothing threw, nothing logged,
 * and the UI's own copy ("Location is off") made it read like a user choice.
 *
 * So these assert the allowlist *value*, not merely the directive's presence.
 * A test that only checked `includes('geolocation')` would have passed against
 * the broken header. The paired negative assertion is the whole point: it is
 * the one that fails if someone tightens `(self)` back to `()`.
 *
 * No network and no database — `proxy()` builds a response from a request.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { proxy } from '@/proxy';

function policyFor(path = '/directory'): string {
  const response = proxy(new NextRequest(`https://panamia.club${path}`));
  const header = response.headers.get('Permissions-Policy');
  assert.ok(header, 'expected a Permissions-Policy header');
  return header;
}

/** Pull one directive's allowlist out of the header string. */
function allowlist(header: string, directive: string): string | null {
  const found = header
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${directive}=`));
  return found ? found.slice(directive.length + 1) : null;
}

describe('Permissions-Policy — features the site itself calls', () => {
  test('geolocation is allowed for self, not disabled outright', () => {
    // The regression. `(self)` keeps the API available to first-party code
    // while still denying it to any embedded third-party frame; `()` denies
    // it to everyone and breaks the directory's distance sort.
    assert.equal(allowlist(policyFor(), 'geolocation'), '(self)');
  });

  test('geolocation is not an empty allowlist', () => {
    // Stated separately because this is the assertion with the useful failure
    // message. If someone "hardens" the header back to `()`, this names the
    // mistake rather than reporting a generic string mismatch.
    assert.notEqual(
      allowlist(policyFor(), 'geolocation'),
      '()',
      'geolocation=() blocks the API for this origin too, not just third parties'
    );
  });

  test('camera and microphone stay first-party', () => {
    const header = policyFor();
    assert.equal(allowlist(header, 'camera'), '(self)');
    assert.equal(allowlist(header, 'microphone'), '(self)');
  });

  test('payment stays fully disabled', () => {
    // Deliberately `()`: nothing in the app calls the Payment Request API, so
    // there is no first-party use to preserve. This asserts the distinction is
    // intentional rather than letting a blanket "everything should be self"
    // edit loosen it.
    assert.equal(allowlist(policyFor(), 'payment'), '()');
  });

  test('the header is set on app routes generally, not just the directory', () => {
    for (const path of ['/', '/directory', '/form/get-listed']) {
      assert.equal(
        allowlist(policyFor(path), 'geolocation'),
        '(self)',
        `expected geolocation=(self) on ${path}`
      );
    }
  });
});
