import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import {
  PANA_SITES,
  resolvePanaSites,
  visiblePanaSites,
} from '@/lib/panaverse/sites';

const publicSites = ['social', 'groups', 'directory', 'events', 'connectors'];

describe('account menu destinations', () => {
  test('keeps five public destinations beside the leading Account tile', () => {
    assert.deepEqual(
      visiblePanaSites(PANA_SITES, false).map((site) => site.id),
      publicSites
    );
  });

  test('keeps Ink and Vizion hidden even for admins', () => {
    assert.deepEqual(
      visiblePanaSites(PANA_SITES, true).map((site) => site.id),
      [...publicSites, 'admin']
    );
  });

  test('hides offerings without deleting their registered destinations', () => {
    const ink = PANA_SITES.find((site) => site.id === 'ink');
    const vizion = PANA_SITES.find((site) => site.id === 'vizion');
    assert.ok(ink?.hidden);
    assert.ok(vizion?.hidden);
    assert.equal(ink.href, null);
    assert.equal(vizion.href, '/podcasts');

    assert.deepEqual(visiblePanaSites([{ ...vizion, hidden: false }], false), [
      { ...vizion, hidden: false },
    ]);
  });

  test('preserves visibility and staff gating after cross-surface resolution', () => {
    for (const host of [
      'pana.social',
      'social.pana.social',
      'admin.pana.social',
    ]) {
      const resolved = resolvePanaSites(host, 'pana.social');
      assert.deepEqual(
        visiblePanaSites(resolved, false).map((site) => site.id),
        publicSites
      );
      const admin = visiblePanaSites(resolved, true).find(
        (site) => site.id === 'admin'
      );
      assert.ok(admin?.href);
      assert.equal(admin.adminOnly, true);
      assert.equal(
        admin.href,
        resolved.find((site) => site.id === 'admin')?.href
      );
    }
  });

  test('places Admin and About Pana in the pinned footer before Sign Out', () => {
    const source = readFileSync(
      new URL('../components/account/identity-menu.tsx', import.meta.url),
      'utf8'
    );
    const start = source.indexOf('footer={(close) => (');
    const end = source.indexOf('\n    >', start);
    assert.ok(start >= 0 && end > start);
    const footer = source.slice(start, end);
    const admin = footer.indexOf('<AdminMenuLink');
    const about = footer.indexOf("t('nav.siteMenu.aboutPana')");
    const signOut = footer.indexOf('<LogOut');
    assert.ok(admin >= 0 && admin < about && about < signOut);
  });

  test('renders Admin as a session-gated row, not a destination bubble', () => {
    const source = readFileSync(
      new URL('../components/account/pana-sites.tsx', import.meta.url),
      'utf8'
    );
    const admin = source.slice(source.indexOf('export function AdminMenuLink'));
    assert.match(admin, /session\?\.user\?\.isAdmin === true/);
    assert.match(admin, /<SurfaceLink\b/);
    assert.match(
      admin,
      /className=\{cn\(styles\.row, styles\.rowQuiet, styles\.rowAdmin\)\}/
    );
    assert.doesNotMatch(admin, /styles\.tile/);
  });
});
