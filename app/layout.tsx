import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import '../styles/flower-power.css';
import { Providers } from './providers';
import { ThemeProvider } from '@/components/theme-provider';
import { FlowerPowerProvider } from '@/components/flower-power/FlowerPowerProvider';
import MainHeader from '@/components/MainHeader';
import MainFooter from '@/components/MainFooter';
import ScreennameGate from '@/components/ScreennameGate';
import { NativeShell } from '@/components/mobile/NativeShell';
import { NativeAppLayout } from '@/components/mobile/NativeAppLayout';
import {
  resolveSurface,
  originForFrom,
  surfaceForPath,
  getRootDomain,
} from '@/lib/panaverse/surfaces';
import { SURFACE_DESCRIPTION, SURFACE_ICON } from '@/lib/panaverse/branding';
import {
  PATHNAME_HEADER,
  SEARCH_HEADER,
  resolveChromeSurface,
  resolveInstallSurface,
  wearsGuestChrome,
  wearsOwnChrome,
  wearsSurfaceChrome,
} from '@/lib/panaverse/chrome';
import { SurfaceGuestHeader } from '@/components/panaverse/SurfaceGuestHeader';
import { SurfaceGuestFooter } from '@/components/panaverse/SurfaceGuestFooter';
import { SurfaceMemberHeader } from '@/components/panaverse/SurfaceMemberHeader';
import { SurfaceMemberFooter } from '@/components/panaverse/SurfaceMemberFooter';
import { PanaSitesProvider } from '@/components/panaverse/PanaSitesProvider';
import { resolvePanaSites } from '@/lib/panaverse/sites';
import {
  DEFAULT_SOCIAL_PREVIEW_HEIGHT,
  DEFAULT_SOCIAL_PREVIEW_PATH,
  DEFAULT_SOCIAL_PREVIEW_WIDTH,
} from '@/lib/social-preview';
import BugReportDialog from '@/components/BugReportDialog';

/**
 * Title and description for any page that does not set its own.
 *
 * Pana Social's pages are mostly client components with no metadata export, so
 * every one of them inherited the literal string "Pana Mia" — a member on
 * social.pana.social got a browser tab, a bookmark, and a shared link all
 * branded as the main site.
 *
 * Deliberately sets only `title`, with no `title.template`. Every page in this
 * app that titles itself already spells out its own suffix ("Events | Pana
 * MIA", "Terms of Service - Pana MIA Club"), so introducing a template would
 * append a second one to all of them. Overriding just the default changes
 * exactly the pages that never had a title of their own, and leaves the main
 * site byte-identical.
 */
export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host');
  const surface = resolveSurface(host);
  const pathname = requestHeaders.get(PATHNAME_HEADER);

  /* Same rule the chrome uses, for the same reason: while PANAVERSE_SUBDOMAINS
   * is off, pana.social/s resolves to the default surface, so a host-keyed
   * title names the feed "Pana Mia". See `resolveChromeSurface`. */
  const chromeSurface = resolveChromeSurface(surface, pathname);
  const description = SURFACE_DESCRIPTION[chromeSurface.id];
  const previewImage = new URL(
    DEFAULT_SOCIAL_PREVIEW_PATH,
    `https://${getRootDomain()}`
  ).href;

  /* A page a surface is borrowing points its canonical at the surface that
   * owns it.
   *
   * Every route answers on every hostname, so the directory genuinely returns
   * 200 on both pana.social and social.pana.social. To a crawler that is two
   * URLs with identical content competing for the same ranking, and the
   * directory is the main site's most valuable page — exactly the wrong thing
   * to split. A redirect would have settled it by definition; keeping the
   * member on their surface means saying which copy is the original instead.
   *
   * Gated on the same predicate as the chrome, so the two cannot disagree: if
   * a page is framed as borrowed, it is also declared as borrowed. */
  const owner = wearsGuestChrome(chromeSurface, pathname)
    ? surfaceForPath(pathname as string)
    : null;

  /* The install tags — manifest link and Apple app meta — are deliberately not
   * here, even though this object has `manifest` and `appleWebApp` fields for
   * exactly that. They are rendered in the layout's own <head> instead.
   *
   * Setting them here does produce correct tags with correct values; it puts
   * them in the wrong place. This runtime streams metadata into the body and
   * relies on a client script to lift it into <head>, and that script moves
   * icon links but not the manifest link. The result was
   * `LINK < DIV < DIV < BODY < HTML`, and Chromium only searches <head> for a
   * manifest, so `Page.getAppManifest` returned url:null with errors:[] — the
   * tag was present, well-formed and completely invisible. An empty error list
   * is what "never looked" reports, and it reads exactly like "nothing wrong".
   *
   * <head> children written as JSX land in the real <head> (the font links
   * below have always proved it), so the install identity goes where the
   * browser is known to look rather than where the framework offers to put
   * it. */
  return {
    title: chromeSurface.name,
    description,
    openGraph: {
      title: chromeSurface.name,
      description,
      type: 'website',
      siteName: 'Pana MIA Club',
      images: [
        {
          url: previewImage,
          width: DEFAULT_SOCIAL_PREVIEW_WIDTH,
          height: DEFAULT_SOCIAL_PREVIEW_HEIGHT,
          alt: 'Pana MIA Club — The Future Is Local',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: chromeSurface.name,
      description,
      images: [previewImage],
    },
    ...(owner && pathname
      ? {
          /* Both halves are load-bearing, and the second is the one that
           * actually covers the directory.
           *
           * `canonical` handles pages that declare none of their own. But page
           * metadata beats layout metadata, and the directory sets its own —
           * relative, as `/directory/search`. A relative canonical resolves
           * against `metadataBase`, falling back to the host being served, so
           * on social.pana.social it would resolve to social's own origin and
           * cheerfully declare the borrowed copy the original. Pointing
           * `metadataBase` at the owning surface fixes every relative URL a
           * borrowed page emits, including ones written before this existed,
           * without editing the pages themselves. */
          metadataBase: new URL(originForFrom(owner, host)),
          alternates: {
            canonical: `${originForFrom(owner, host)}${pathname}`,
          },
        }
      : {}),
  };
}

/**
 * Viewport and installed-app chrome.
 *
 * `viewportFit: 'cover'` is the half that is easy to miss: the safe-area-inset
 * env() variables all resolve to 0 without it, so any padding written against
 * them silently does nothing. It is what lets content reach the edges of a
 * notched screen while the CSS keeps controls clear of the notch and the home
 * indicator — which matters the moment this is installed and runs without
 * browser chrome to absorb those areas.
 *
 * `themeColor` is the shared Pana orange rather than a per-surface value:
 * every surface flies the same mark in the same orange on purpose (see
 * lib/panaverse/branding.ts), so the browser UI tint is genuinely common to
 * all of them and does not need to be resolved per request.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ff8100',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? '';
  /* Drives the "you're visiting a test site" call to action, so a false
   * negative tells real visitors to leave. Keyed on the configured root domain
   * rather than a literal: this was hardcoded to panamia.club, a different and
   * older deployment, which meant the live site failed its own production
   * check and pointed everyone at the other app. */
  const isProductionSite = host.includes(getRootDomain());

  /* Which panaverse surface is serving this request.
   *
   * The Worker already routes hostnames — social.pana.social sends `/` to the
   * social front door — but the layout did not know surfaces existed, so every
   * host got the Pana Mia Club masthead and footer. That is the single reason
   * Pana Social still read as a section of the main site rather than a place of
   * its own: a member crossed an origin and landed under the same header.
   *
   * Surfaces other than the main site bring their own chrome, so the shared
   * layout stays out of their way. It still provides everything that is
   * genuinely global — fonts, theme, providers, the screenname gate — because
   * those are properties of the account, not of the room it is being used in.
   *
   * Exercise this locally at social.localhost:3002; `resolveSurface` maps
   * *.localhost the same way it maps *.pana.social. */
  const surface = resolveSurface(host);

  /* A few routes are doorways rather than rooms and frame themselves on every
   * surface — see lib/panaverse/chrome.ts. Sign-in is the one that exists
   * today: it used to render the Pana Mia wordmark in the masthead and then
   * again above the card, and on a surface hostname it rendered with nothing
   * at all. The path comes from the Worker because the runtime hands the
   * server renderer a Host header but no pathname. */
  const pathname = requestHeaders.get(PATHNAME_HEADER);

  /* Which surface's chrome to wear, which is not always the surface the
   * hostname names. While PANAVERSE_SUBDOMAINS is off, pana.social/s resolves
   * to the default surface, so the two predicates below would both decline it
   * and the feed would fall through to the Pana Mia masthead — newsletter bar,
   * footer and all — on the one page built to read as somewhere else. See
   * `resolveChromeSurface`; it is the identity function once the subdomains
   * land. */
  const chromeSurface = resolveChromeSurface(surface, pathname);

  const standalone = wearsOwnChrome(pathname, chromeSurface);
  const wearsMainChrome = chromeSurface.id === 'www' && !standalone;

  /* Pages this surface is borrowing from another one get a slim bar and a slim
   * footer instead. See lib/panaverse/chrome.ts — the short version is that
   * every route answers on every hostname, so without this the main site's
   * directory rendered on social.pana.social with no chrome at all and no way
   * back to the feed. The footer is not symmetry: it carries the legal links
   * that MainFooter would otherwise have been the only source of. */
  const guest = wearsGuestChrome(chromeSurface, pathname);

  /* A surface over one of its own rooms wears its own masthead. This is the
   * case the other two predicates left uncovered, and it was the one members
   * actually lived in: social.pana.social/s matched neither `wearsMainChrome`
   * nor `guest`, so the timeline rendered with no header at all — no mark, no
   * account, no way back to Pana Mia. See lib/panaverse/chrome.ts. */
  const ownSurface = wearsSurfaceChrome(chromeSurface, pathname);

  /* Which app this page would install as, which is not always the surface the
   * hostname names, and not always the page the member is looking at.
   *
   * See `resolveInstallSurface` for the three rules and why a doorway needs the
   * third one. */
  const installSurface = resolveInstallSurface(
    surface,
    pathname,
    requestHeaders.get(SEARCH_HEADER)
  );

  /* Where the account menu's tiles point, resolved here because this is where
   * the host is known and where the Worker's env is readable. Keyed on the
   * hostname rather than on `chromeSurface`: the question a tile answers is
   * "which origin am I on now", and a borrowed page is still served from the
   * hostname the member chose. */
  const panaSites = resolvePanaSites(host);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Install identity. See the note in generateMetadata for why these
         * are written here by hand rather than through its `manifest` and
         * `appleWebApp` fields: those render into the body, and a manifest
         * link outside <head> is one the browser never reads.
         *
         * The surface is passed explicitly because a manifest request carries
         * the origin but not the path that asked for it, and while
         * PANAVERSE_SUBDOMAINS is off both surfaces answer on one origin — so
         * the Host header alone cannot tell Pana Social from Pana Mia. See
         * app/manifest.webmanifest/route.ts. */}
        <link
          rel="manifest"
          href={`/manifest.webmanifest?s=${installSurface.id}`}
        />
        {/* The home screen label, and so part of the install identity rather
         * than the page's chrome: it follows installSurface for the same
         * reason the manifest does. */}
        <meta name="apple-mobile-web-app-title" content={installSurface.name} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* iOS takes the home screen icon from this link, not from the
         * manifest's icons array, and falls back to a screenshot of the page
         * when it is missing — so without this an installed Pana Social would
         * sit on the home screen as a thumbnail of whatever was on screen at
         * the moment it was added. 192 rather than 512 because iOS downscales
         * and the 512 is an upscale of a 225px source (see the PR): the
         * smaller file is the one with real detail in it. */}
        <link
          rel="apple-touch-icon"
          href={`/logos/${SURFACE_ICON[installSurface.id]}_192.png`}
        />
        {/* Translucent rather than 'default': the masthead already paints to
         * the top of the viewport, so an opaque status bar would sit on a
         * second band of background above it. */}
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400..900&family=Montserrat:wght@400;500;600;700&family=Rubik:wght@400;500&display=swap"
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Pana MIA Articles"
          href="/feed.xml"
        />
        <link
          rel="alternate"
          type="application/feed+json"
          title="Pana MIA Articles (JSON)"
          href="/feed.json"
        />
      </head>
      <body className="font-sans">
        {/* `forcedTheme` overrides whatever next-themes has in localStorage.
            The theme picker was removed along with the masthead toggle, so
            without this anyone who had already chosen dark or flower-power
            would be stuck there with no control to change it back. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          forcedTheme="light"
          disableTransitionOnChange
        >
          <FlowerPowerProvider>
            <Providers>
              {/* Wraps both mastheads: the account menu is reached through
                  MainHeader on the main site and SurfaceIdentity on a
                  surface, and it needs the same resolved tiles either way. */}
              <PanaSitesProvider sites={panaSites}>
                <NativeAppLayout
                  surfaceId={surface.id}
                  header={
                    <>
                      {wearsMainChrome && (
                        <MainHeader isProductionSite={isProductionSite} />
                      )}
                      {guest && pathname && (
                        <SurfaceGuestHeader
                          surface={chromeSurface}
                          host={host}
                          pathname={pathname}
                          owner={surfaceForPath(pathname)}
                        />
                      )}
                      {ownSurface && pathname && (
                        <SurfaceMemberHeader
                          surface={chromeSurface}
                          host={host}
                        />
                      )}
                    </>
                  }
                  footer={
                    <>
                      {wearsMainChrome && <MainFooter />}
                      {guest && pathname && (
                        <SurfaceGuestFooter
                          surface={chromeSurface}
                          owner={surfaceForPath(pathname)}
                        />
                      )}
                      {ownSurface && (
                        <SurfaceMemberFooter surface={chromeSurface} />
                      )}
                    </>
                  }
                >
                  {children}
                </NativeAppLayout>
                <BugReportDialog />
                <ScreennameGate />
                {/* Renders nothing, and nothing in a browser. Mounted here
                    because what it wires up — dismissing the native splash,
                    the Android back button, deep-link navigation — is app-wide
                    and must not depend on which page happened to load first.
                    See components/mobile/NativeShell.tsx. */}
                <NativeShell />
              </PanaSitesProvider>
            </Providers>
          </FlowerPowerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
