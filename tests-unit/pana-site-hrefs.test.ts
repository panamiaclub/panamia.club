/**
 * Tests that a tile crossing a surface boundary keeps the path that surface
 * actually lives at.
 *
 * `resolvePanaSites` rewrites each registry tile against the host being
 * served. For a tile that points at a surface's *root* it also decides whether
 * to name the prefix or a bare "/", because a surface's front door wears a
 * different URL depending on where you are standing: social.panamia.club/ and
 * panamia.club/s are the same feed, and only the first is the one a member
 * would repeat out loud.
 *
 * The rule that was wrong, and the reason this file exists: crossing origins
 * used to assume "/". That holds for a surface with its own subdomain, since
 * arriving on social.panamia.club puts you at the feed by construction. It is
 * false for a surface with `subdomain: null`, which is served from the shared
 * root domain — whose "/" belongs to the main site. Events is path-only (see
 * the SURFACES entry, which explains why), so the account menu on
 * admin.panamia.club and social.panamia.club sent every reader to the homepage
 * instead of to the calendar. The surface was reachable the whole time; the
 * only broken thing was the link.
 *
 * These assertions are written against the registry rather than against the
 * strings it currently holds, for the reason pana-site-tones.test.ts sets out
 * at length: a test that hardcodes "/e" passes on the day somebody gives
 * Events a subdomain and silently stops testing the rule. Giving a surface a
 * subdomain, or taking one away, should flip these expectations on its own.
 *
 * No database, no network, no React: the registry is plain data.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { PANA_SITES, resolvePanaSites } from '@/lib/panaverse/sites';
import {
  SURFACES,
  hostnameFor,
  surfaceForPath,
  type PanaverseSurface,
} from '@/lib/panaverse/surfaces';

const ROOT = 'panamia.club';

/* The flag gates whether cross-surface links may leave the host in hand at
   all; with it off every tile stays relative and the bug under test cannot
   occur. Production runs with it on, so that is what is exercised here. */
const previous = process.env.PANAVERSE_SUBDOMAINS;
before(() => {
  process.env.PANAVERSE_SUBDOMAINS = '1';
});
after(() => {
  if (previous === undefined) delete process.env.PANAVERSE_SUBDOMAINS;
  else process.env.PANAVERSE_SUBDOMAINS = previous;
});

/** Registry tiles that point at the root of some surface, paired with it. */
const rootTiles = PANA_SITES.flatMap((site) => {
  if (!site.href) return [];
  const owner = surfaceForPath(site.href);
  return site.href === owner.rootPath ? [{ site, owner }] : [];
});

/** Every surface a reader could be standing on. */
const hosts = SURFACES.map((s) => hostnameFor(s, ROOT));

const hrefFor = (id: string, host: string): string => {
  const found = resolvePanaSites(host, ROOT).find((s) => s.id === id);
  assert.ok(found?.href, `no resolved href for site "${id}" from ${host}`);
  return found.href;
};

/** The path part of a tile href, which may be relative or absolute. */
const pathOf = (href: string): string =>
  href.startsWith('http') ? new URL(href).pathname : href;

describe('a surface is linked at the path it is served from', () => {
  assert.ok(rootTiles.length > 0, 'expected at least one front-door tile');

  for (const { site, owner } of rootTiles) {
    /* The distinction the bug turned on. A surface with no subdomain shares
       the root domain with the main site and is only ever reachable at its
       prefix; one with a subdomain owns its origin, where "/" is its front
       door. */
    const pathOnly = owner.subdomain === null;

    test(`${site.id} keeps a usable path from every surface host`, () => {
      for (const host of hosts) {
        const path = pathOf(hrefFor(site.id, host));

        if (pathOnly && hostnameFor(owner, ROOT) !== host) {
          assert.equal(
            path,
            owner.rootPath,
            `the "${site.id}" tile on ${host} resolved to "${path}". ` +
              `"${owner.name}" has no subdomain, so it is served from ${ROOT}${owner.rootPath}; ` +
              `a bare "/" there lands on the main site instead.`
          );
        } else {
          assert.ok(
            path === '/' || path === owner.rootPath,
            `the "${site.id}" tile on ${host} resolved to "${path}", which is neither its front door nor "${owner.rootPath}"`
          );
        }
      }
    });
  }
});

describe('a surface that owns an origin still gets the short URL', () => {
  /* The other half of the rule, and the behaviour the fix had to preserve:
     the reason the cross-origin case ever said "/" is that it is right for a
     subdomained surface. Losing it would make every such tile name a prefix
     its own hostname does not need. */
  const subdomained = rootTiles.filter(({ owner }) => owner.subdomain !== null);

  test('crossing to its hostname lands on "/"', () => {
    assert.ok(subdomained.length > 0, 'expected a subdomained front-door tile');

    for (const { site, owner } of subdomained) {
      const from = hosts.find((h) => h !== hostnameFor(owner, ROOT));
      assert.ok(from, 'expected another surface host to stand on');

      const href = hrefFor(site.id, from);
      assert.equal(
        href,
        `https://${hostnameFor(owner, ROOT)}/`,
        `the "${site.id}" tile should cross to its own origin's front door`
      );
    }
  });

  test('standing on it already, the tile is relative', () => {
    for (const { site, owner } of subdomained) {
      assert.equal(hrefFor(site.id, hostnameFor(owner, ROOT)), '/');
    }
  });
});

describe('the surface that reported this', () => {
  /* Named explicitly, because a rule-shaped test can pass while the thing
     somebody reported is still broken: if Events were dropped from the
     registry every loop above would vacuously succeed. */
  const events = SURFACES.find((s: PanaverseSurface) => s.id === 'events');

  test('Events is still a registered, path-only surface', () => {
    assert.ok(events, 'no "events" surface in the registry');
    assert.equal(
      events.subdomain,
      null,
      'Events gained a subdomain — if that is deliberate, the expectations above now cover it as a subdomained surface and this test should be retired'
    );
  });

  test('the account menu reaches the calendar from Pana Admin', () => {
    const admin = SURFACES.find((s) => s.id === 'admin');
    assert.ok(admin, 'no "admin" surface in the registry');

    assert.equal(
      hrefFor('events', hostnameFor(admin, ROOT)),
      `https://${ROOT}${events!.rootPath}`
    );
  });
});
