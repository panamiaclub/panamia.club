/**
 * Tests that every masthead a signed-in member can live under mounts the
 * account controls.
 *
 * Pana Social has more than one masthead, and that is the whole bug. The
 * notifications bell was added to `MainHeader`, which flies over the main
 * site — but a member on social.panamia.club is under
 * `SurfaceMemberHeader`, the masthead a surface wears over its own rooms.
 * The bell was never added there, so on the feed, the page members use most,
 * there was no bell at all. And because chat shipped with its only entry
 * point inside the bell's panel, there was no route to /messages either: the
 * feature was unreachable from the one surface built to use it. The first
 * thing asked about it was "where do I send messages?".
 *
 * No type and no render test would have caught that, because each masthead
 * is correct in isolation. What was wrong was that the *set* of mastheads
 * had grown and the controls had not — a fact about which component mounts
 * which, invisible to anything that looks at one file at a time. So this
 * asserts over the set: a third masthead has to be added here, and adding it
 * means carrying the controls.
 *
 * `SurfaceGuestHeader` is deliberately not in the list. It is the slim bar a
 * surface wears over a page it has *borrowed* from another surface, where
 * the job is a route back rather than a full account rail. If it ever grows
 * into a masthead members live under, it belongs here.
 *
 * Source-level for the same reason `pana-site-tones` is: the claim is about
 * what a file mounts. No database, no network, no React renderer.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Every masthead a signed-in member can be looking at. */
const MASTHEADS = [
  {
    name: 'MainHeader',
    path: '../components/MainHeader.tsx',
    why: 'the main site',
  },
  {
    name: 'SurfaceMemberHeader',
    path: '../components/panaverse/SurfaceMemberHeader.tsx',
    why: 'a surface over its own rooms -- the feed, and where this was missing',
  },
] as const;

/** The controls that must be reachable from any of them. */
const CONTROLS = [
  { component: 'MessagesLink', leadsTo: '/messages' },
  { component: 'NotificationsMenu', leadsTo: '/updates' },
] as const;

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('every member-facing masthead carries the account controls', () => {
  for (const masthead of MASTHEADS) {
    for (const control of CONTROLS) {
      test(`${masthead.name} (${masthead.why}) mounts ${control.component}`, () => {
        const code = source(masthead.path);

        assert.ok(
          code.includes(`import { ${control.component} }`),
          `${masthead.name} does not import ${control.component}, so ${control.leadsTo} cannot be reached from it`
        );

        /* Imported but never rendered is the failure mode an import check
           alone would miss, and it looks identical in review. */
        assert.match(
          code,
          new RegExp(`<${control.component}\\s*/>`),
          `${masthead.name} imports ${control.component} but never renders it`
        );
      });
    }
  }
});

describe('the account controls gate themselves', () => {
  /* SurfaceMemberHeader renders on the server and has no session to check, so
     a control that relied on its caller to gate it would either be absent
     from the feed or would render for signed-out visitors and 401 on every
     query behind it. Owning the gate is what makes them safe to mount from a
     server component -- which is the fix this whole file exists to protect. */
  for (const file of [
    '../components/account/messages-link.tsx',
    '../components/account/notifications-menu.tsx',
  ]) {
    test(`${file.split('/').pop()} reads the session itself`, () => {
      const code = source(file);

      assert.ok(
        code.includes('useSession'),
        'control does not read the session, so a server-rendered masthead cannot mount it safely'
      );
      assert.match(
        code,
        /return null/,
        'control reads the session but never declines to render without one'
      );
    });
  }
});
