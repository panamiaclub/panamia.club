/**
 * Tests that the account menu's destination colours are derived, not copied.
 *
 * The account menu tints its destination discs and Admin row so that a noun
 * reads the same colour there as it does in the search scope bar. The colour
 * itself is not interesting; where it comes from is. Each one is read out of
 * `SCOPE_TONE` (lib/directory-scopes.ts) or `SURFACE_TONE`
 * (lib/panaverse/branding.ts), so recolouring a scope upstream recolours the
 * tile with no second edit.
 *
 * That is the whole point of these assertions, and it is why they compare
 * against the canonical maps rather than against the strings those maps
 * currently hold. `assert.equal(events.tone, 'pink')` would pass today and
 * keep passing on the day somebody recoloured the event scope and left the
 * tile behind — which is precisely the failure this repo has shipped twice.
 * `ScopeMenu` grew a private copy of the members-only rule (#309), and
 * `getSuggestions` grew a second one that had drifted by the time it was
 * found (#314). Both survived review because a duplicate that agrees with
 * its original is invisible until it stops agreeing. Comparing to the source
 * is the only version of this test that fails on the drift rather than on the
 * colour.
 *
 * No database, no network, no React: the registry is plain data.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SCOPE_TONE } from '@/lib/directory-scopes';
import { SURFACE_TONE } from '@/lib/panaverse/branding';
import { PANA_SITES, type PanaSite } from '@/lib/panaverse/sites';

const site = (id: string): PanaSite => {
  const found = PANA_SITES.find((s) => s.id === id);
  assert.ok(found, `no site registered with id "${id}"`);
  return found;
};

describe('account tile tones are derived from the canonical maps', () => {
  test('scope-backed tiles follow SCOPE_TONE', () => {
    assert.equal(site('directory').tone, SCOPE_TONE.directory);
    assert.equal(site('events').tone, SCOPE_TONE.event);
    assert.equal(site('groups').tone, SCOPE_TONE.group);
  });

  test('surface-backed tiles follow SURFACE_TONE', () => {
    assert.equal(site('social').tone, SURFACE_TONE.social);
    assert.equal(site('connectors').tone, SURFACE_TONE.connectors);
    assert.equal(site('admin').tone, SURFACE_TONE.admin);
  });

  test('offerings with no scope and no surface stay neutral', () => {
    /* Not an oversight. Pana Ink and PanaVizion have nothing canonical to
       read, and picking a colour for them would be inventing the brand
       language lib/panaverse/branding.ts says the marks do not have. The
       absence is the statement: "not one of the coloured destination
       kinds". */
    assert.equal(site('ink').tone, undefined);
    assert.equal(site('vizion').tone, undefined);
  });

  test('blue stays the admin warning', () => {
    /* SURFACE_TONE.admin documents blue as the one tone that is a warning
       rather than wayfinding — every member surface is warm, so a staff tool
       that looked like one invites somebody to forget which they are holding
       a publish button on. A second blue destination spends that signal.
       Note SCOPE_TONE.pana is also blue, which is why the
       Account tile is deliberately untoned and is not in this registry. */
    const blue = PANA_SITES.filter((s) => s.tone === SURFACE_TONE.admin);
    assert.deepEqual(
      blue.map((s) => s.id),
      ['admin']
    );
  });
});

describe('every tile tone has somewhere to resolve', () => {
  /* branding.ts warns that a tone with no `[data-tone]` block in globals.css
     renders with no accent at all rather than visibly wrong, which is the
     failure mode hardest to catch by looking. The tiles add a second way to
     hit it: `.tileIcon[data-tone]` reads `--surface-tone-on`, a token added
     for this feature, so a tone whose block predates it would paint a
     coloured disc with an invisible glyph. Both are checked against the
     stylesheet itself rather than against a list kept here. */
  const css = readFileSync(
    new URL('../app/globals.css', import.meta.url),
    'utf8'
  );

  const toned = PANA_SITES.filter((s) => s.tone);

  test('globals.css defines a block for each tone in use', () => {
    assert.ok(toned.length > 0, 'expected at least one toned tile');
    for (const s of toned) {
      assert.ok(
        css.includes(`[data-tone='${s.tone}']`),
        `app/globals.css has no [data-tone='${s.tone}'] block, so the "${s.id}" tile would render untinted`
      );
    }
  });

  test('each of those blocks sets the glyph colour', () => {
    for (const s of toned) {
      const block = css.slice(css.indexOf(`[data-tone='${s.tone}']`));
      const body = block.slice(0, block.indexOf('}'));
      assert.ok(
        body.includes('--surface-tone-on'),
        `[data-tone='${s.tone}'] does not set --surface-tone-on, so the "${s.id}" glyph would inherit ink and may be illegible on the fill`
      );
    }
  });
});
