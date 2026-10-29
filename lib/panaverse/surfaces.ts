/**
 * Panaverse surface registry.
 *
 * A "surface" is one Pana Mia offering with its own front door: the main site
 * at the apex, Pana Social at social.<root>, and whatever comes next. All of
 * them share one codebase, one database, one deploy, and one account — they
 * differ only in hostname and chrome.
 *
 * This module is the single source of truth for that mapping. Adding a surface
 * should be one entry here plus a DNS record, never a second application.
 *
 * Dependency-free on purpose: the Worker entry, auth config, and UI all read it.
 */

import { getConfiguredFederationDomain } from '@/lib/federation/domain';
import { DEFAULT_ROOT_DOMAIN } from './root-domain';

export { DEFAULT_ROOT_DOMAIN } from './root-domain';

export type SurfaceId =
  'www' | 'info' | 'social' | 'events' | 'connectors' | 'admin';

export interface PanaverseSurface {
  id: SurfaceId;
  /** Shown in the surface switcher. */
  name: string;
  /** One line describing what this surface is for. */
  tagline: string;
  /**
   * Label under the root domain, or null for the apex.
   * `social` → social.panamia.club
   */
  subdomain: string | null;
  /**
   * Where this surface's front door lives in the shared route tree. Requesting
   * the surface hostname's root serves this path.
   */
  rootPath: string;
  /**
   * Path prefixes this surface owns. Used to light up the active entry in the
   * switcher — NOT to restrict routing, since every route stays reachable from
   * every hostname.
   */
  paths: string[];
  /**
   * Registered here, but the hostname is not bound yet.
   *
   * PANAVERSE_SUBDOMAINS is a single global flag. While it is on, adding a
   * surface to this list makes its cross-surface links go absolute
   * — which for a host with no DNS record turns a working relative link into a
   * dead end. That is the exact state the flag exists to prevent, and the flag
   * cannot prevent it for one surface at a time.
   *
   * Opt-in, so adding it changes nothing for the surfaces already shipping:
   * only a surface that sets this is held back, and it is held back to exactly
   * the flag-off behaviour (stay on the host in hand). `*.localhost` is exempt
   * for the same reason it is exempt from the flag — it resolves without DNS,
   * so dev goes on exercising the production-shaped path either way.
   *
   * Clearing this is the go-live switch, and it is deliberately a code change
   * rather than an env var: PANAVERSE_SUBDOMAINS is pinned in wrangler.jsonc
   * and applies on deploy, so an env flag would buy no extra agility while
   * hiding the launch state from the registry that claims to be the source of
   * truth for it. See docs/DOMAINS.md.
   *
   * A path-only surface is different: Events uses `subdomain: null`, so its
   * links resolve to the root domain rather than staying on the host in hand.
   * Reserve this flag for surfaces awaiting a hostname.
   */
  subdomainPending?: boolean;
}

/**
 * The registrable domain the panaverse hangs off. Every surface is a subdomain
 * of this, which is what lets one session cookie cover all of them — cookies
 * cannot be shared across registrable domains.
 *
 * This is deliberately independent from DEFAULT_FEDERATION_DOMAIN. The web app
 * currently serves from panamia.club, while federated identities remain pinned
 * to pana.social so existing actor IDs never change with the website hostname.
 * See lib/federation/domain.ts.
 */
export function getRootDomain(): string {
  return process.env.PANAVERSE_ROOT_DOMAIN?.trim() || DEFAULT_ROOT_DOMAIN;
}

/**
 * Whether a surface's subdomain is actually reachable.
 *
 * Off by default, because a surface subdomain only works once DNS exists for
 * it, and DNS is dashboard work outside this repo (see docs/DOMAINS.md). While
 * it is off, cross-surface links stay on the host in hand: Pana Social is
 * reached at /s on whatever hostname is already serving, rather than at a
 * social.<root> that resolves nowhere. A link to a host with no record is a
 * dead end, not a slower route, so the unset default is the safe one.
 *
 * This gates links only. Every surface route is reachable from every hostname
 * either way, so flipping this on moves the front door without moving a route.
 */
export function panaverseSubdomainsEnabled(): boolean {
  const raw = process.env.PANAVERSE_SUBDOMAINS?.trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

export const SURFACES: readonly PanaverseSurface[] = [
  {
    id: 'www',
    name: 'Pana Mia',
    tagline: 'The directory, the org, and how to get involved.',
    subdomain: null,
    rootPath: '/',
    paths: ['/directory', '/directorio', '/d', '/listings', '/venues', '/a'],
  },
  {
    id: 'info',
    name: 'Pana Mia Info',
    tagline: 'Start here for local connections and ways to get involved.',
    subdomain: 'info',
    rootPath: '/info',
    paths: ['/info'],
  },
  {
    id: 'social',
    name: 'Pana Social',
    tagline: 'The community timeline, federated with the fediverse.',
    subdomain: 'social',
    rootPath: '/s',
    // `/p` is social's for chrome, but it does not own every page under it:
    // a business or unclaimed listing at /p/<user> is directory content and
    // says so with its own canonical. See app/p/[user]/page.tsx.
    //
    // `/g` and `/groups` are top level rather than under `/s` on purpose, and
    // for the same reason `/p` and `/inbox` already are: the end state noted
    // in worker/index.ts is moving these routes into a route group so the
    // surface root is "/". A group nested at /s/g/<handle> would have to move
    // when that happens and break every link minted in the meantime, while
    // /g/<handle> is already where it will live. It also keeps the pair
    // legible -- /p/<user> is a person, /g/<handle> is a group.
    //
    // `/search` is deliberately absent: it is now a redirect into whichever
    // scope was asked for, so it never renders social chrome and claiming it
    // here would only be stale documentation. Searching from this surface
    // uses the category selected in components/panaverse/SocialSearch.tsx.
    paths: ['/s', '/p', '/g', '/groups', '/timeline', '/inbox', '/messages'],
  },
  {
    id: 'events',
    name: 'Pana Events',
    tagline: 'What is on, and why you would want to be there.',
    // No subdomain at all, and that is the whole of what makes this surface
    // path-only. `originFor` and `originForFrom` both fall through to the root
    // domain for a surface without one, so a link to Events resolves to
    // pana.social/e from whatever host is in hand — including admin.pana.social
    // and social.pana.social, which would otherwise have kept the reader on
    // their own hostname wearing their own masthead. `www` has always worked
    // this way; Events is the second surface to want it.
    subdomain: null,
    rootPath: '/e',
    // `/e` rather than `/events`, and the pair is not a duplication. `/e` is
    // the calendar — the listings, the detail pages, the host tools — and was
    // claimed long before this surface existed, so it is what every minted
    // link and every share already points at. `/events` is the offering front
    // page: the marketing answer to "what is the calendar for", which belongs
    // on the main site next to the other offerings rather than behind the
    // calendar's own hostname. Same split as social's `/s` versus the apex.
    //
    // Claiming both prefixes anyway, because the switcher's active state
    // should light up on either: a reader who lands on /events has plainly
    // arrived at Events, whichever host told them about it.
    paths: ['/e', '/events'],
  },
  {
    id: 'connectors',
    name: 'Pana Connectors',
    tagline: 'Headquarters for the Community Connectors programme.',
    subdomain: 'connectors',
    rootPath: '/connectors',
    // One prefix, unlike Social's multiple routes. Connectors is a new surface with no
    // history, so everything it owns was built under `/connectors` from the
    // start and there are no older top-level routes to keep claiming. The
    // rooms inside it -- `/connectors/hq`, `/connectors/join` -- are covered
    // by the prefix match and do not need naming individually.
    paths: ['/connectors'],
  },
  {
    id: 'admin',
    name: 'Admin',
    tagline: 'Staff tools for running Pana Mia.',
    subdomain: 'admin',
    rootPath: '/admin',
    // Unlike the three surfaces above, this one is not for members. It is
    // listed here anyway rather than left as a bare `/admin` section, because
    // the registry is what mints a trusted auth origin (see auth.ts) and what
    // hands a surface its own chrome — and an admin console wearing the
    // directory's masthead is how a staff tool gets mistaken for a public
    // page. Membership here is not an advertisement: nothing in the shipping
    // masthead enumerates SURFACES, so a surface becomes visible only when
    // something deliberately links it. See lib/panaverse/sites.ts.
    //
    // The doubled path in admin.pana.social/admin/connectors is real and is
    // the accepted cost. Paths are global — every route answers on every
    // hostname, and the Worker deliberately does not rewrite them (see
    // worker/index.ts: vinext has no middleware-rewrite signalling, so serving
    // /admin/connectors under the URL /connectors would leave the client
    // router fetching RSC payloads for a path that does not exist). So
    // admin.pana.social/connectors cannot mean the admin console; it would
    // serve the public Connectors landing page, which is what /connectors
    // already is for everyone. Social dodges this by owning short top-level
    // paths it claimed first; /connectors was taken before this surface
    // existed. Admins land on the front door and click through, so the long
    // URL is the one they share, not the one they navigate.
    paths: ['/admin'],
  },
];

export const DEFAULT_SURFACE: PanaverseSurface = SURFACES[0];

export function getSurface(id: SurfaceId): PanaverseSurface {
  const surface = SURFACES.find((s) => s.id === id);
  if (!surface) throw new Error(`Unknown panaverse surface: ${id}`);
  return surface;
}

/** The public hostname this surface is served from. */
export function hostnameFor(
  surface: PanaverseSurface,
  rootDomain = getRootDomain()
): string {
  return surface.subdomain ? `${surface.subdomain}.${rootDomain}` : rootDomain;
}

export function originFor(
  surface: PanaverseSurface,
  rootDomain = getRootDomain()
): string {
  return `https://${hostnameFor(surface, rootDomain)}`;
}

/**
 * Where this surface's front door is, as a path, from the host in hand.
 *
 * A surface's root path is fixed in the registry; the URL its front door
 * actually wears is not. On its own hostname the surface is served at `/` —
 * social.pana.social/ is the feed, see app/page.tsx — and only from elsewhere
 * does it need its prefix. A masthead that always linked `rootPath` would send
 * a member on social.pana.social from `/` to `/s`, the same page one URL
 * uglier; one that always linked `/` would send a member reading pana.social/s
 * to the main site's homepage instead of back to the feed.
 */
export function frontDoorPath(
  surface: PanaverseSurface,
  host: string | null | undefined,
  rootDomain = getRootDomain()
): string {
  return resolveSurface(host, rootDomain).id === surface.id
    ? '/'
    : surface.rootPath;
}

/**
 * The origin of `target` as reached from the host currently being served.
 *
 * `originFor` always points at the configured root domain, which is right in
 * production and wrong everywhere else: on social.localhost:3002 it would send
 * a member to https://pana.social — the live site — for what should be a link
 * across the hall. This swaps the surface label on the host in hand instead,
 * keeping scheme and port, so cross-surface links behave in dev and in prod
 * without a branch at every call site.
 *
 * Hosts that are not under the root domain — *.workers.dev previews, and any
 * future alias — have no sibling to swap to, so they fall back to the
 * canonical origin. That fallback is only safe while the root domain is the
 * host that actually serves production: while it named panamia.club, every
 * link out of here pointed at a different app behind an expired certificate.
 */
export function originForFrom(
  target: PanaverseSurface,
  currentHost: string | null | undefined,
  rootDomain = getRootDomain()
): string {
  if (!currentHost) return originFor(target, rootDomain);

  const hostname = normaliseHostname(currentHost);
  const root = normaliseHostname(rootDomain);
  const port = currentHost.trim().match(/:(\d+)$/)?.[1] ?? '';

  const isLocal = hostname === 'localhost' || hostname.endsWith('.localhost');

  // *.localhost always resolves without DNS, so dev keeps its surface
  // subdomains and goes on exercising the production-shaped path. Every other
  // host needs a real record, which is the thing that does not exist yet —
  // globally while the flag is off, and per-surface for one that is registered
  // but not bound.
  if (!isLocal && (!panaverseSubdomainsEnabled() || target.subdomainPending)) {
    return `https://${hostname}${port ? `:${port}` : ''}`;
  }

  const isUnderRoot = hostname === root || hostname.endsWith(`.${root}`);
  if (!isLocal && !isUnderRoot) return originFor(target, rootDomain);

  // Strip the label the current surface occupies, leaving the base the
  // panaverse hangs off: "social.localhost" -> "localhost".
  const current = resolveSurface(hostname, rootDomain);
  const base =
    current.subdomain && hostname.startsWith(`${current.subdomain}.`)
      ? hostname.slice(current.subdomain.length + 1)
      : hostname;

  // `base` has to be the domain the panaverse actually hangs off. When it is
  // not, the current host is some other subdomain under the root — today
  // relay.pana.social, tomorrow an api.* — and swapping labels would invent
  // social.relay.pana.social. Those hosts have no sibling, so they take the
  // canonical origin. This only became reachable when the root domain moved to
  // pana.social and brought the relay under it.
  if (!isLocal && base !== root) return originFor(target, rootDomain);

  const host = target.subdomain ? `${target.subdomain}.${base}` : base;
  return `${isLocal ? 'http' : 'https'}://${host}${port ? `:${port}` : ''}`;
}

/**
 * Hostnames that should land on a surface without being subdomains of the root
 * domain. The fediverse identity domain is the case that matters: handles live
 * on it permanently (see lib/federation/domain.ts), so visitors who type it
 * should get Pana Social rather than the main site.
 *
 * Only a *deliberately configured* federation domain counts. When
 * FEDERATION_DOMAIN is unset the domain is inherited from the UI host, which
 * means the "alias" would be the exact hostname already serving the main site
 * — aliasing it to Pana Social strips the main site of its chrome on the apex.
 * An unconfigured environment therefore has no aliases at all.
 *
 * Note these are NOT cookie-sharing hosts. A session cookie scoped to the root
 * domain cannot cover a different registrable domain, so an alias host is for
 * federation and redirects, not for signed-in browsing.
 */
function aliasHostsFor(surface: PanaverseSurface): string[] {
  if (surface.id !== 'social') return [];
  const federation = getConfiguredFederationDomain();
  return federation ? [federation] : [];
}

/** Strip port and normalise case so callers can pass a raw Host header. */
function normaliseHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/:\d+$/, '');
}

/**
 * Resolve the surface serving a request.
 *
 * Falls back to the main site, which keeps localhost, *.workers.dev previews,
 * and any unrecognised host behaving exactly as they did before surfaces
 * existed: every route reachable from one hostname.
 *
 * `social.localhost` resolves to the social surface so the split can be
 * exercised locally — browsers route *.localhost to the loopback address.
 */
export function resolveSurface(
  hostname: string | null | undefined,
  rootDomain = getRootDomain()
): PanaverseSurface {
  if (!hostname) return DEFAULT_SURFACE;
  const host = normaliseHostname(hostname);
  const root = normaliseHostname(rootDomain);

  // A real surface hostname always wins over an alias. Otherwise pinning
  // FEDERATION_DOMAIN to the root domain would hand the apex to Pana Social.
  if (host === root) return DEFAULT_SURFACE;

  const suffix = `.${root}`;
  const label = host.endsWith(suffix)
    ? host.slice(0, -suffix.length)
    : host.endsWith('.localhost')
      ? host.slice(0, -'.localhost'.length)
      : null;

  if (label) {
    const bySubdomain = SURFACES.find((s) => s.subdomain === label);
    if (bySubdomain) return bySubdomain;
    return DEFAULT_SURFACE;
  }

  for (const surface of SURFACES) {
    if (aliasHostsFor(surface).some((a) => normaliseHostname(a) === host)) {
      return surface;
    }
  }

  return DEFAULT_SURFACE;
}

/** The surface a path belongs to, for the switcher's active state. */
export function surfaceForPath(pathname: string): PanaverseSurface {
  const match = SURFACES.filter((s) => s.id !== DEFAULT_SURFACE.id).find((s) =>
    s.paths.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  );
  return match ?? DEFAULT_SURFACE;
}

/** Drop the query and hash, then any trailing slash, so `/s/?x=1` reads `/s`. */
function pathOnly(href: string): string {
  const path = href.split('?')[0].split('#')[0];
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * Would following `href` from `fromPath` change which surface's chrome the
 * page wears?
 *
 * Callers use this to choose between `next/link` and a plain anchor, and the
 * distinction is not cosmetic. The chrome is chosen in the root layout from
 * the request headers, and the App Router does not re-render a shared root
 * layout on a client navigation — so a `<Link>` that crosses a surface
 * boundary lands on the new path still wearing the old surface's masthead.
 * Pana Mia's wordmark sat over the Pana Social feed until the member
 * refreshed, which reads as a broken page rather than as a stale layout.
 *
 * Only same-origin relative paths can hit that: an absolute href is another
 * origin and the browser reloads the document anyway. That is also why this
 * needs no knowledge of PANAVERSE_SUBDOMAINS. With the flag on, cross-surface
 * hrefs are absolute and take the first branch; with it off they are relative
 * and the path comparison decides. Turning the flag on therefore changes which
 * branch runs, not what the member sees.
 */
export function crossesSurface(href: string, fromPath: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return true;
  if (!href.startsWith('/')) return false;
  return (
    surfaceForPath(pathOnly(href)).id !== surfaceForPath(pathOnly(fromPath)).id
  );
}
