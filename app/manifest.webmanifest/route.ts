/**
 * Web app manifest, one per panaverse surface.
 *
 * A manifest describes exactly one installable app, but this deploy serves two
 * surfaces — Pana Mia at the apex and Pana Social at /s — and while
 * PANAVERSE_SUBDOMAINS is off they share a single origin. A static
 * public/manifest.webmanifest would therefore give both surfaces the same
 * name, icon and start URL: installing Pana Social from /s would put a Pana
 * Mia tile on the home screen.
 *
 * So this is generated the same way the root layout generates its metadata —
 * from the surface registry, keyed on the request. Adding a surface stays one
 * entry in surfaces.ts plus a pair of icons, never a second manifest to keep
 * in sync.
 *
 * Deliberately a route handler rather than Next's app/manifest.ts convention:
 * this app runs on vinext, not Next, so framework special-file conventions are
 * not guaranteed. Route handlers at dotted paths are proven here — /feed.json
 * and /.well-known/gpc.json both serve in production.
 */

import { NextResponse } from 'next/server';
import {
  SURFACES,
  DEFAULT_SURFACE,
  resolveSurface,
  panaverseSubdomainsEnabled,
  type PanaverseSurface,
} from '@/lib/panaverse/surfaces';
import { SURFACE_DESCRIPTION, SURFACE_ICON } from '@/lib/panaverse/branding';

/** Background behind the icon on the splash screen, and the browser UI tint.
 *  Token values from app/globals.css, not new colours. */
const SURFACE_COLORS: Record<string, { theme: string; background: string }> = {
  // Cream behind the Pana Mia mark, matching the site's own paper.
  www: { theme: '#ff8100', background: '#fff7ec' },
  // The social mark is drawn on black and reads as an app tile already, so the
  // splash matches it rather than fighting it.
  social: { theme: '#ff8100', background: '#000000' },
  // Same orange and the same cream as the main site: Connectors is a room in
  // Pana Mia, not a second brand, and the splash is the first thing an
  // installed app says. Spelled out rather than left to the `?? www` fallback
  // below, so a future change to Pana Mia's splash cannot silently repaint
  // this one.
  connectors: { theme: '#ff8100', background: '#fff7ec' },
};

/**
 * Where the installed app opens, and what counts as "inside" it.
 *
 * Both track PANAVERSE_SUBDOMAINS, because the flag decides whether a surface
 * has an origin of its own. While it is off, Pana Social lives under /s on the
 * shared host and must scope itself there or it would claim the whole site.
 * Once a surface subdomain is bound, the Worker serves that surface's root
 * path at `/`, so the installed app owns the entire origin.
 *
 * A surface with `subdomain: null` never reaches that second state. Events is
 * path-only — it is a surface with its own name, mark and tone, served at
 * panamia.club/e — so `ownsOrigin` stays false for it whatever the flag says,
 * and the installed app opens and scopes to /e. That is the point: scoping it
 * to `/` would make installing Events quietly capture every other surface
 * sharing the root domain.
 */
function launchPaths(surface: PanaverseSurface): {
  start_url: string;
  scope: string;
} {
  const ownsOrigin = panaverseSubdomainsEnabled() && surface.subdomain !== null;
  const base = ownsOrigin ? '/' : surface.rootPath;
  return { start_url: base, scope: base };
}

export function GET(request: Request) {
  const url = new URL(request.url);

  /* The surface is passed explicitly by whichever page linked this manifest,
   * because a manifest request carries the origin but not the path that asked
   * for it — on a shared origin the Host header alone cannot tell /s from /.
   * Falls back to host resolution so a bare fetch still returns something
   * coherent rather than nothing. */
  const requested = url.searchParams.get('s');
  const surface =
    SURFACES.find((s) => s.id === requested) ??
    resolveSurface(request.headers.get('host')) ??
    DEFAULT_SURFACE;

  const icon = SURFACE_ICON[surface.id] ?? SURFACE_ICON.www;
  const colors = SURFACE_COLORS[surface.id] ?? SURFACE_COLORS.www;
  const { start_url, scope } = launchPaths(surface);

  return NextResponse.json(
    {
      /* Stable identity. Without it the install is keyed on start_url, so
       * moving the front door would read as a different app. */
      id: `pana-${surface.id}`,
      name: surface.name,
      short_name: surface.name,
      description: SURFACE_DESCRIPTION[surface.id],
      start_url,
      scope,
      display: 'standalone',
      theme_color: colors.theme,
      background_color: colors.background,
      icons: [
        {
          src: `/logos/${icon}_192.png`,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: `/logos/${icon}_512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        /* Android crops icons to whatever shape the launcher uses, so the
         * maskable variant carries the mark at 78% with the rest as bleed. */
        {
          src: `/logos/${icon}_maskable_512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json',
        /* Safe to cache at the edge: the response varies only by hostname and
         * the ?s= parameter, both of which are already part of the cache key.
         * Nothing here is session-scoped. */
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
}
