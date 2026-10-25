import { SCOPE_TONE } from '@/lib/directory-scopes';
import { SURFACE_TONE, type SurfaceTone } from '@/lib/panaverse/branding';
import {
  frontDoorPath,
  originForFrom,
  resolveSurface,
  surfaceForPath,
  getRootDomain,
} from '@/lib/panaverse/surfaces';

/**
 * The other Pana sites, as the masthead account menu lists them.
 *
 * Deliberately not `SHARED_ROOMS` (lib/panaverse/branding.ts): that list
 * answers "what else is on the main site" for the surface switcher, and is
 * scoped to rooms that are real and shipped. This one answers a different
 * question — "where else can I go in the Pana world" — so it leads with the
 * named offerings a member would recognise from a flyer, and is allowed to
 * name ones that are not built yet.
 *
 * A site with `href: null` is announced rather than linked. Naming an
 * unbuilt offering is a promise, so it renders as a dimmed, unclickable row
 * with a "coming soon" badge: nothing here is ever a link to a 404.
 * Hidden offerings stay registered without appearing in the account menu.
 *
 * Paths are stored relative, and resolved against the host being served by
 * `resolvePanaSites` — a server call, because `originForFrom` reads
 * PANAVERSE_ROOT_DOMAIN, which is a Worker var and not a NEXT_PUBLIC_ one. In
 * a client bundle that var is simply absent and the helper would silently fall
 * back to the compiled-in default, which is a class of bug that only appears
 * in the environment you cannot test locally. So the env read stays where the
 * env exists, and the answer travels down as data.
 *
 * A site on the surface already being served keeps its relative path and
 * navigates on the client. One belonging to another surface is made absolute,
 * because crossing surfaces really does mean crossing origins now that each
 * has a hostname of its own. Before PANAVERSE_SUBDOMAINS was turned on these
 * were relative unconditionally, which was right then and became a trap the
 * moment the flag flipped: a member on social.pana.social following `/d` got
 * the directory without ever leaving the social hostname.
 */
export interface PanaSite {
  /** Stable key for React and for tests. */
  id: string;
  /** i18n key under `common:identity.sites`. */
  labelKey: string;
  /**
   * Where it lives, or null when it is not built yet.
   *
   * Relative in this registry; `resolvePanaSites` returns an absolute URL for
   * anything that crosses a surface boundary.
   */
  href: string | null;
  /** Temporarily omit this destination from the account menu. */
  hidden?: boolean;
  /**
   * Show this destination only to staff, in the account menu's footer.
   *
   * Filtered in `components/account/pana-sites.tsx` against the client
   * session's `isAdmin`, not here, because this registry is resolved in the
   * root layout and the root layout has no session — adding one would mean an
   * auth lookup on every page render of every surface to decide whether to
   * draw one row.
   *
   * Hiding is a courtesy, not the control. `/admin` is refused server-side by
   * `checkAdminAuth()` whether or not a menu entry pointed at it, and the path is
   * not a secret. What the flag buys is that the account menu does not offer
   * every member a door they cannot open.
   */
  adminOnly?: boolean;
  /**
   * The destination's accent colour, or absent for a neutral one.
   *
   * Never written as a literal. Every value below is read out of `SCOPE_TONE`
   * (lib/directory-scopes.ts) or `SURFACE_TONE` (lib/panaverse/branding.ts),
   * so a noun that is recoloured in one of those maps recolours here in the
   * same edit rather than in a second one somebody has to remember. This repo
   * has twice shipped a private copy of a rule that happened to agree with
   * the canonical one at the time it was written — #309 and #314 — and both
   * times the agreement is what kept the drift invisible. A hand-written list
   * of six tone strings here would be the third.
   *
   * Optional rather than required, because neutral is a real answer and not a
   * gap. Pana Ink and PanaVizion have neither a scope nor a surface, so there
   * is no canonical tone to read for them and inventing one would be exactly
   * the brand language the marks do not have. The absence says "not one of
   * the coloured destination kinds", which is true and useful.
   *
   * Lives on the registry rather than beside `SITE_ICONS` in the component so
   * that a unit test can read it: `components/account/pana-sites.tsx` imports
   * a CSS module, which `node --test` cannot load. Keeping it here is what
   * makes the derivation assertable, and an unassertable derivation is how
   * the two drifted copies above survived review.
   */
  tone?: SurfaceTone;
}

export const PANA_SITES: readonly PanaSite[] = [
  {
    id: 'social',
    labelKey: 'panaSocial',
    href: '/s',
    tone: SURFACE_TONE.social,
  },
  /* Directly under Pana Social because it is a room inside it: `/groups` is
   * one of that surface's paths, so this tile resolves to the social origin
   * from the main site without needing a special case here.
   *
   * This is the only way into /groups from the masthead. The account menu
   * used to carry an "All groups" row as well, pointing at the same page;
   * that row is gone, because /groups now opens with your own groups and so
   * answers both "the rest of mine" and "show me what exists" in one place. */
  { id: 'groups', labelKey: 'groups', href: '/groups', tone: SCOPE_TONE.group },
  /* No tone for either of these two, on purpose. Neither is a search scope
   * nor a surface, so neither has a canonical colour to read — and picking
   * one for them would be inventing the brand language `branding.ts` says the
   * panas do not have. They render on the neutral disc, which is what says
   * "named offering, not one of the coloured destinations". */
  { id: 'ink', labelKey: 'panaInk', href: null, hidden: true },
  { id: 'vizion', labelKey: 'panaVizion', href: '/podcasts', hidden: true },
  // `/d` is the canonical directory URL — `/directory` and `/directorio`
  // redirect here, so linking it directly saves a hop.
  {
    id: 'directory',
    labelKey: 'directory',
    href: '/d',
    tone: SCOPE_TONE.directory,
  },
  { id: 'events', labelKey: 'events', href: '/e', tone: SCOPE_TONE.event },
  // Linked rather than null even though the HQ behind it is still fixtures:
  // `/connectors` is a real route that explains the programme to anyone who
  // is not in it yet, so the tile always lands somewhere true. The branch
  // between the explainer and the member dashboard happens on that page, not
  // in this registry -- a tile cannot know who is clicking it.
  //
  // "Get Involved" used to sit immediately above this as an unbuilt tile.
  // Connectors is the built answer to the same question, so naming both only
  // offered the member a choice between a working door and a closed one. The
  // offering itself is untouched: `/get-involved` is still a live page and
  // still listed in PANA_OFFERINGS -- it just no longer needs a seat in this
  // grid to be found.
  {
    id: 'connectors',
    labelKey: 'connectors',
    href: '/connectors',
    tone: SURFACE_TONE.connectors,
  },
  /* The back office is a staff-only footer row, not a public destination tile.
   * Keep it registered so its cross-surface URL and warning tone are resolved
   * in the same place as the other destinations. */
  {
    id: 'admin',
    labelKey: 'admin',
    href: '/admin',
    adminOnly: true,
    tone: SURFACE_TONE.admin,
  },
];

export function visiblePanaSites(
  sites: readonly PanaSite[],
  isAdmin: boolean
): readonly PanaSite[] {
  return sites.filter((site) => !site.hidden && (!site.adminOnly || isAdmin));
}

/**
 * `PANA_SITES` with every cross-surface path resolved against the host being
 * served. Call this on the server and pass the result down.
 *
 * A site the current surface already owns is left relative, so it still
 * navigates on the client and does not reload the document for a move within
 * the same room. Everything else becomes an absolute URL on its owning
 * surface's origin — which is also what gives a member on social.pana.social a
 * route back to the main site, the thing that went missing when the masthead
 * drawer was removed and PANAVERSE_SUBDOMAINS was turned on.
 *
 * Unbuilt sites (`href: null`) pass through untouched: there is no origin to
 * resolve, and they are announced rather than linked.
 */
export function resolvePanaSites(
  host: string | null | undefined,
  rootDomain = getRootDomain()
): readonly PanaSite[] {
  /* The origin this request is already being served from. Comparing against
   * this rather than against surface ids is what keeps the fallback honest:
   * while PANAVERSE_SUBDOMAINS is off every surface shares one origin, so an
   * id comparison would have called `/d` "cross-surface" from
   * social.pana.social and handed back an absolute URL pointing at the host it
   * was already on — turning a client navigation into a full document load for
   * no crossing at all. Same origin, same relative path, whatever the flag
   * says. */
  const currentOrigin = originForFrom(
    resolveSurface(host, rootDomain),
    host,
    rootDomain
  );

  return PANA_SITES.map((site) => {
    if (!site.href) return site;

    const owner = surfaceForPath(site.href);
    const origin = originForFrom(owner, host, rootDomain);
    const sameOrigin = origin === currentOrigin;

    /* A surface's front door is "/" on its own origin, so the tile should name
     * that rather than the prefix: https://social.pana.social/ and, from the
     * social host itself, a plain "/". Both serve the feed; only one of them is
     * the URL a member would repeat out loud.
     *
     * Which host decides is the host the reader will *arrive* on, not the one
     * they are leaving. That distinction is invisible while every surface owns
     * a subdomain — crossing origins lands on the owner's own hostname, where
     * the front door is "/" by construction — and load-bearing the moment one
     * does not. Events is path-only (`subdomain: null`), so crossing to it
     * lands on the shared root domain, whose "/" is the main site's homepage.
     * Assuming "/" there sent every reader on admin.pana.social and
     * social.pana.social to pana.social instead of to the calendar.
     *
     * Asking `frontDoorPath` about the destination host answers both cases
     * with one rule: social.pana.social resolves to social, so "/"; pana.social
     * resolves to the main site, so Events keeps its "/e". Only paths that
     * *are* the surface's root are touched; /d is a room, not a front door. */
    const path =
      site.href === owner.rootPath
        ? frontDoorPath(
            owner,
            sameOrigin ? host : new URL(origin).host,
            rootDomain
          )
        : site.href;

    if (sameOrigin) {
      return path === site.href ? site : { ...site, href: path };
    }

    return { ...site, href: `${origin}${path}` };
  });
}
