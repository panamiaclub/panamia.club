/* Presentation metadata for the panaverse chrome, shared by every mock that
 * wears it — /mock/panaverse compares the surfaces, /mock/feed lives inside
 * one. It sits at app/mock/_data rather than under a single route because the
 * moment two mocks describe the same masthead from two files, they drift, and
 * a switcher that disagrees with itself is worse than no switcher.
 *
 * Unlike the other mocks, the surfaces here are NOT invented. The live ones
 * come straight out of `lib/panaverse/surfaces.ts` — the same registry the
 * Worker routes hostnames on — so this mock cannot drift from what actually
 * ships. The page reads the registry on the server and hands it down; only the
 * presentation metadata below is a fixture.
 *
 * The "rooms" are the honest part of the picture. Events, peer mentoring, and
 * the resilience network are not roadmap items: they are real routes that
 * exist in `app/` today, served from the main site. Showing them as rooms
 * rather than surfaces is the argument that a panaverse offering does not need
 * its own hostname to be real — and that promoting one later is a registry
 * entry, not a rewrite.
 */

import { MOCK_VIEWER } from '../feed/_data/mock-feed';
import {
  SURFACE_BLURB as REAL_SURFACE_BLURB,
  SURFACE_MARK,
  SURFACE_TONE as REAL_SURFACE_TONE,
  type SurfaceMark,
  type SurfaceTone,
} from '@/lib/panaverse/branding';

export type { SurfaceTone };

/** A surface as the switcher needs to render it. Mirrors PanaverseSurface
 *  from lib/panaverse/surfaces.ts, flattened for the client. */
export interface MockSurface {
  /** PanaverseSurface.id */
  id: string;
  /** PanaverseSurface.name */
  name: string;
  /** hostnameFor(surface) — the host this surface is actually served from. */
  hostname: string;
  /** PanaverseSurface.rootPath — where its front door lives in the route tree. */
  rootPath: string;
}

/** Presentation metadata, keyed by PanaverseSurface.id. Re-exported from the
 *  shipping source rather than copied, so a mock cannot show an accent the
 *  real chrome has stopped using. Widened to Record<string, …> because the
 *  mock surfaces carry a plain string id. */
export const SURFACE_TONE: Record<string, SurfaceTone> = REAL_SURFACE_TONE;

/** The real wordmark each surface flies. Re-exported from the shipping source
 *  rather than copied, so a mock masthead cannot show a mark the real one has
 *  stopped using. Widened to Record<string, …> because the mock surfaces carry
 *  a plain string id. */
export type SurfaceLogo = SurfaceMark;

export const SURFACE_LOGO: Record<string, SurfaceLogo> = SURFACE_MARK;

/** What each surface is for, in the second person. The registry taglines are
 *  written for a developer reading the file; these are written for a member
 *  deciding where to click. */
export const SURFACE_BLURB: Record<string, string> = REAL_SURFACE_BLURB;

/** The masthead nav each surface carries. Different per surface on purpose:
 *  a shared nav listing every route in the panaverse is how you end up with a
 *  directory link in a timeline. What stays constant is the wordmark, the
 *  switcher, and the avatar — enough to read as one organisation without
 *  pretending the rooms have the same job. */
export const SURFACE_NAV: Record<string, string[]> = {
  www: ['Directory', 'Events', 'About', 'Get involved'],
  social: ['Home', 'Explore', 'Groups', 'Notifications'],
};

/** A real, shipped part of Pana Mia that is served from the main site rather
 *  than its own hostname. Each one is a candidate to become a surface. */
export interface MockRoom {
  name: string;
  /** The route it lives at today. */
  path: string;
  blurb: string;
  tone: SurfaceTone;
  /** The hostname it would take if it were promoted to a surface — shown to
   *  make the point that promoting it is a DNS record plus a registry entry. */
  couldBecome: string;
}

export const SHARED_ROOMS: MockRoom[] = [
  /* Events used to lead this list. It was promoted to a real surface —
     registered in lib/panaverse/surfaces.ts, served at `panamia.club/e` with
     `subdomain: null` — so it was removed from here rather than left in both
     places, which would have printed it twice in the switcher. The live
     `SHARED_ROOMS` in lib/panaverse/branding.ts dropped it for the same
     reason. Note that promotion did not need a hostname: a surface is a thing
     with its own name, mark and tone, not a thing with its own DNS record. */
  {
    name: 'Peer Mentoring',
    path: '/m',
    /* Room blurbs are one truncating line in the panel, so they are written to
       fit — a room that needs two lines to explain itself is arguing to be a
       surface. */
    blurb: 'Book time with a Pana',
    tone: 'blue',
    couldBecome: 'mentoring.panamia.club',
  },
  {
    name: 'Resilience Network',
    path: '/r',
    blurb: 'Mutual aid groups',
    tone: 'red',
    couldBecome: 'resilience.panamia.club',
  },
];

/** The signed-in member, imported rather than redeclared.
 *
 * This is the argument of the switcher expressed as an import: the feed mock
 * and this mock render the same person because there is one account. A second
 * copy of the viewer here could drift, and a drifting identity is exactly the
 * failure the panaverse is meant to prevent. */
export const MOCK_MEMBER = {
  ...MOCK_VIEWER,
  /** socialActors.preferredUsername + FEDERATION_DOMAIN. Pinned to the
   *  identity domain, NOT the UI host — see lib/federation/domain.ts. This is
   *  the string that proves the account is the same one everywhere. */
  fediverseHandle: `@${MOCK_VIEWER.handle}@panamia.club`,
};
