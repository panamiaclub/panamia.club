/**
 * Which routes bring their own chrome.
 *
 * Most pages are content inside a surface and wear that surface's header and
 * footer. A few are doorways rather than rooms — they belong to the panaverse
 * as a whole rather than to any one surface, and they carry their own framing.
 * Sign-in is the case that matters: it is reachable from every hostname, it is
 * the first thing a signed-out visitor sees, and wrapping it in a directory nav
 * they cannot use yet only buries the one control on the page.
 *
 * The root layout consults this to decide whether to render main-site chrome,
 * which is why it lives beside the surface registry rather than inside a route.
 */

import {
  DEFAULT_SURFACE,
  surfaceForPath,
  type PanaverseSurface,
} from './surfaces';

/**
 * Route prefixes that render standalone. A prefix matches the path itself and
 * anything beneath it, so `/signin` also covers a future `/signin/verify`.
 */
export const STANDALONE_ROUTES: readonly string[] = ['/signin'];

/**
 * Request header carrying the path being served.
 *
 * The runtime hands the server renderer the Host header but not the path, so
 * the root layout has no way to tell a doorway from a room. The Worker sets
 * this on every request it forwards.
 *
 * Set by the Worker and never read from the client: a spoofable value here
 * would let anyone strip the chrome off any page.
 */
export const PATHNAME_HEADER = 'x-pana-pathname';

/**
 * Request header carrying the query string of the path being served.
 *
 * Deliberately a second header rather than a suffix on PATHNAME_HEADER. Every
 * path predicate here and in `surfaceForPath` matches on prefixes, and `/s?x=1`
 * is equal to neither `/s` nor `/s/` — folding the query into that header would
 * have quietly unmatched every surface route that happens to carry one, turning
 * a member's own timeline into a borrowed page.
 *
 * Set by the Worker and never read from the client, for the same reason as
 * PATHNAME_HEADER.
 */
export const SEARCH_HEADER = 'x-pana-search';

/** Strip a trailing slash so `/signin/` matches `/signin`. */
function normalisePath(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0];
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * Does this route supply its own chrome?
 *
 * Returns false for an empty path, which is what a caller sees when the
 * pathname could not be determined. Falling back to "wears the usual chrome"
 * keeps an unknown route looking like the site it is part of rather than
 * stripping it bare.
 */
export function wearsOwnChrome(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = normalisePath(pathname);
  return STANDALONE_ROUTES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

/**
 * Is this surface serving a route that belongs to a different one?
 *
 * Every route stays reachable from every hostname — that is a deliberate
 * property of the registry, not an oversight, because one deploy serves the
 * whole panaverse. The consequence is that social.panamia.club/directory/search
 * renders the main site's directory, and until now it rendered it with no
 * header, no footer and no link home: the root layout withheld main-site chrome
 * on surface hostnames, and Pana Social had none of its own to put there. A
 * member who followed a directory link out of the feed simply arrived nowhere.
 *
 * Redirecting to the main site would also have closed the hole, and is the
 * cheaper fix, but it answers a member asking to see the directory by moving
 * them to a different hostname — which is precisely the "these are two separate
 * products" message the panaverse switcher exists to dispel. So the surface
 * keeps the member and frames the borrowed page instead.
 *
 * Three exclusions, each for a different reason:
 *   - The main site already has chrome of its own; this is only for surfaces
 *     that would otherwise render bare.
 *   - Doorways (`wearsOwnChrome`) frame themselves on every surface by design.
 *   - The surface's own routes are its home turf, not a borrowed room.
 *
 * The root path is home turf too, and has to be special-cased because it does
 * not look like it. `surfaceForPath('/')` answers with the default surface —
 * correctly, since `/` matches no surface prefix — so on a surface hostname the
 * front door would be read as a page borrowed from the main site and framed
 * with the guest bar. On social.panamia.club the root *is* the feed (see
 * app/page.tsx), and the page a surface serves at its own root is the one page
 * it most certainly owns.
 *
 * An unknown path returns false rather than true. The pathname is absent only
 * when the request did not come through the Worker, and in that case leaving
 * the page exactly as it renders today is the safer failure.
 */
export function wearsGuestChrome(
  surface: PanaverseSurface,
  pathname: string | null | undefined
): boolean {
  if (!pathname) return false;
  if (surface.id === DEFAULT_SURFACE.id) return false;
  if (wearsOwnChrome(pathname)) return false;
  const path = normalisePath(pathname);
  if (path === '/') return false;
  return surfaceForPath(path).id !== surface.id;
}

/**
 * Is this surface serving one of its own rooms, and therefore owed its own
 * masthead?
 *
 * This is the case the other two predicates leave uncovered, and it was the
 * one a member actually lived in. The root layout withholds MainHeader and
 * MainFooter on surface hostnames — correctly, because the Pana Mia masthead
 * over a timeline is what made Pana Social read as a section of the main site
 * rather than a place of its own. `wearsGuestChrome` then covers pages a
 * surface has borrowed. Between them sat the surface's *own* front door:
 * social.panamia.club/s matched neither, so the timeline rendered with no
 * header, no footer, no nav and no route back to Pana Mia. A signed-in member
 * on the surface built for them got the barest page on the site.
 *
 * Three exclusions, matching the predicates this sits beside:
 *   - The main site has MainHeader; this is only for surfaces that would
 *     otherwise render bare.
 *   - Doorways (`wearsOwnChrome`) frame themselves on every surface.
 *   - Borrowed pages get the guest bar, which says whose page it is — a full
 *     surface masthead there would claim the surface owns it.
 *
 * An unknown path returns false, for the same reason `wearsGuestChrome` does:
 * the pathname is absent only when the request did not come through the
 * Worker, and rendering the page as it renders today is the safer failure.
 */
export function wearsSurfaceChrome(
  surface: PanaverseSurface,
  pathname: string | null | undefined
): boolean {
  if (!pathname) return false;
  if (surface.id === DEFAULT_SURFACE.id) return false;
  if (wearsOwnChrome(pathname)) return false;
  return !wearsGuestChrome(surface, pathname);
}

/**
 * Where a same-site request was headed before it was diverted, if it said.
 *
 * Only an absolute path counts. A `callbackUrl` is attacker-supplied in the
 * sense that anyone can put anything in a link, and while the worst outcome
 * here is a mislabelled home screen tile rather than an open redirect, there is
 * no reason to let an off-site value name one of our surfaces. `//evil.example`
 * is rejected too: it reads as a path but is protocol-relative, and resolves to
 * another origin entirely.
 */
function intendedPath(search: string | null | undefined): string | null {
  if (!search) return null;
  const raw = new URLSearchParams(search).get('callbackUrl');
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return normalisePath(raw);
}

/**
 * Which surface's chrome this request should wear.
 *
 * The three chrome predicates below all key off the surface the *hostname*
 * names, which is right once every surface has an origin and wrong until then.
 * While PANAVERSE_SUBDOMAINS is off — the configuration we actually ship —
 * panamia.club/s resolves to the default surface, so `wearsGuestChrome` and
 * `wearsSurfaceChrome` both return false on their first line and the feed falls
 * through to `wearsMainChrome`. Pana Social renders wearing the Pana Mia
 * masthead, its newsletter bar and its footer: the exact "a section of the main
 * site" reading the surface chrome was built to dispel, produced by the surface
 * chrome being switched off.
 *
 * It also takes the safe-area padding with it. Those rules are written against
 * `.panaverse-masthead`, so an installed app on a notched phone put the main
 * site's bar under the status bar with nothing compensating — a layout bug with
 * no layout cause, inherited entirely from resolving the wrong surface.
 *
 * This is the rule `resolveInstallSurface` already applies, and the mismatch is
 * what made the bug visible: install identity follows the path, chrome follows
 * the host, so the feed installs as Pana Social and then opens as Pana Mia.
 * Lifting the shared part here keeps the two answers from drifting again.
 *
 * Inert once the subdomains land: a non-default host returns immediately, so
 * with PANAVERSE_SUBDOMAINS on this is the identity function and every
 * predicate sees exactly what it sees today.
 */
export function resolveChromeSurface(
  surface: PanaverseSurface,
  pathname: string | null | undefined
): PanaverseSurface {
  if (surface.id !== DEFAULT_SURFACE.id) return surface;
  if (!pathname) return surface;
  return surfaceForPath(normalisePath(pathname));
}

/**
 * Which app an install started from this request would create.
 *
 * Three rules, narrowing:
 *
 *   - The host decides whenever it names a surface. social.panamia.club owns its
 *     origin outright, so every page on it installs as Pana Social.
 *   - Otherwise the path decides. While PANAVERSE_SUBDOMAINS is off — the
 *     configuration we actually ship — Pana Social lives at panamia.club/s,
 *     where the host resolves to the default surface, so keying the install off
 *     the host alone hands a member installing from the feed a tile labelled
 *     Pana Mia that opens the directory.
 *   - Otherwise, on a doorway only, the callback decides.
 *
 * The third rule exists because the first two describe the page you are on, and
 * a doorway is by definition a page you did not ask for. `/s` returns 200 and
 * emits the social manifest, but a signed-out member never sees it: the bounce
 * to `/signin` happens on the client, after that HTML has already landed. So
 * the page they actually install from is the doorway, `/signin` is not a social
 * route, and they get Pana Mia with a start_url of `/` — a directory app under
 * the name of one they never installed. The masthead's join link points at
 * `/signin?callbackUrl=%2Fs`, which makes that the ordinary way to reach social
 * while signed out, not an edge case.
 *
 * Restricted to doorways rather than read wherever it appears: `callbackUrl` on
 * an ordinary page is a link that page happens to contain, and has no bearing
 * on what that page is. On a doorway it is the only record of where the member
 * was going, which is the one question an install needs answered.
 *
 * An unknown path falls back to the surface the host named, for the same reason
 * the chrome predicates do: the pathname is absent only when the request did
 * not come through the Worker, and today's answer is the safer failure.
 */
export function resolveInstallSurface(
  surface: PanaverseSurface,
  pathname: string | null | undefined,
  search?: string | null
): PanaverseSurface {
  /* Rules one and two, shared with the chrome predicates so the tile a member
   * installs and the masthead it opens under cannot disagree. */
  const byChrome = resolveChromeSurface(surface, pathname);
  if (byChrome.id !== DEFAULT_SURFACE.id) return byChrome;
  if (!pathname) return surface;

  const path = normalisePath(pathname);
  if (!wearsOwnChrome(path)) return surface;
  const intended = intendedPath(search);
  return intended ? surfaceForPath(intended) : surface;
}
