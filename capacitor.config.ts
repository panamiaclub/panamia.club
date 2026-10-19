/**
 * Capacitor configuration — the Pana Mia app for Android and iOS.
 *
 * This app is a native shell around the deployed site rather than a second
 * implementation of it. That is a deliberate choice and not a shortcut: this
 * codebase renders on the server with RSC and runs on Cloudflare Workers, so
 * there is no static bundle to ship inside an app package. A rewrite against
 * the API would fork every page in `app/` into a second UI that has to be kept
 * in step forever, and the first thing to rot would be the surface split that
 * `lib/panaverse/surfaces.ts` exists to keep coherent.
 *
 * So the WebView loads the same deploy a browser does. A page shipped to the
 * web is shipped to both stores the moment it deploys, and there is exactly
 * one implementation of every screen.
 *
 * What the native layer is actually for is the part a browser tab cannot do:
 * a home-screen presence, a splash screen, an offline page instead of a
 * dinosaur, push notifications, and the share/camera/geolocation permissions
 * that arrive through Capacitor plugins. Those are the reasons this exists —
 * see docs/MOBILE-ROADMAP.md for the ones that are wired up and the ones that
 * are still ahead.
 *
 * Both surfaces ship inside this one app. See `allowNavigation`.
 */

import type { CapacitorConfig } from '@capacitor/cli';
import { MOBILE_APP_ID } from './lib/mobile/app-identity';

/**
 * The deploy the app talks to.
 *
 * Overridable so a build can be pointed at a preview Worker or a dev machine
 * without editing tracked config — `CAPACITOR_SERVER_URL=http://192.168.1.10:3000
 * yarn mobile:sync` puts a phone on a laptop's dev server. The default is
 * production, because that is what a store build must always ship with: a
 * release accidentally built against localhost is an app that opens to a blank
 * screen on every device that is not the machine that built it.
 *
 * Must stay in step with NEXT_PUBLIC_HOST_URL / BETTER_AUTH_URL in
 * wrangler.jsonc. The session cookie is issued for that origin, so a shell
 * pointed anywhere else is a shell nobody can sign in to.
 */
const SERVER_URL =
  process.env.CAPACITOR_SERVER_URL?.trim() || 'https://panamia.club';

/** True for http:// dev servers, which Android blocks by default. Derived
 *  rather than configured so it cannot be left on in a production build. */
const isCleartext = SERVER_URL.startsWith('http://');

const config: CapacitorConfig = {
  /* Reverse-DNS of the root domain, matching PANAVERSE_ROOT_DOMAIN. Both
   * stores treat this as the permanent identity of the app: it is the Android
   * package name and the iOS bundle ID, and neither can be changed after the
   * first release without shipping a new listing and losing every install.
   *
   * Shared with the two deep-link association routes under app/.well-known/,
   * which have to name the same app or the association silently matches
   * nothing. See lib/mobile/app-identity.ts. */
  appId: MOBILE_APP_ID,

  /* The home screen label. Pana Mia rather than Pana Social because this one
   * app carries both surfaces and Pana Mia is the front door — DEFAULT_SURFACE
   * in lib/panaverse/surfaces.ts. */
  appName: 'Pana Mia',

  /* Capacitor requires a local web directory even when it is serving a remote
   * URL. Nothing here is the app: it holds the offline page named by
   * `errorPath` below, which is the only bundled asset that is ever shown. */
  webDir: 'mobile/www',

  /* Native projects live under mobile/ rather than at the repo root, which is
   * where Capacitor puts them by default. Two large generated trees named
   * `android/` and `ios/` sitting beside `app/` and `lib/` would read as parts
   * of the site; under mobile/ it is obvious at a glance which files are the
   * shell and which are the product. */
  android: { path: 'mobile/android' },
  ios: { path: 'mobile/ios' },

  server: {
    /* Setting this is what makes the shell a shell: the WebView loads the
     * deploy directly instead of bundled files, so cookies, auth and routing
     * all behave exactly as they do in a browser on that origin. */
    url: SERVER_URL,

    /* Android serves the WebView over https so the page is a secure context.
     * Without it the scheme is http://localhost, which silently disables
     * service workers, the Web Crypto API and geolocation — and those failures
     * surface as unrelated bugs deep in the app rather than as a scheme
     * problem. */
    androidScheme: 'https',

    cleartext: isCleartext,

    /* Shown when the WebView cannot reach the deploy at all. Without it an
     * offline launch is the platform's own error page — a dinosaur on Android,
     * a blank white screen on iOS — which reads as a broken app rather than as
     * a missing connection. See mobile/www/offline.html. */
    errorPath: 'offline.html',

    /* Hosts the WebView may navigate to without handing off to the system
     * browser. Everything not listed here opens outside the app, which is the
     * right default — an arbitrary outbound link should not be able to dress
     * itself up as part of Pana Mia — but it makes this list load-bearing in
     * three separate ways:
     *
     * 1. social.panamia.club is a Custom Domain on the same Worker and the
     *    surface switcher links to it absolutely whenever PANAVERSE_SUBDOMAINS
     *    is on (see originForFrom). Leaving it out is what would turn "one app
     *    with both surfaces" into an app that ejects members to their browser
     *    the first time they tap Pana Social.
     *
     * 2. The OAuth providers have to finish inside the WebView or they do not
     *    finish at all. The callback sets the session cookie, and a cookie set
     *    in Chrome Custom Tabs or SFSafariViewController is not a cookie the
     *    WebView can read — the member would complete sign-in and land back on
     *    a signed-out app. (Google refuses OAuth in embedded WebViews on top of
     *    this; that constraint is unsolved here and written up in
     *    docs/MOBILE-ROADMAP.md.)
     *
     * 3. Stripe Checkout redirects back to a success URL on this origin, so it
     *    has the same round-trip problem as OAuth: sent to the system browser,
     *    the member pays and the app never learns that they did.
     */
    allowNavigation: [
      'panamia.club',
      '*.panamia.club',
      'accounts.google.com',
      'appleid.apple.com',
      'meta.wikimedia.org',
      'checkout.stripe.com',
      'js.stripe.com',
    ],
  },

  plugins: {
    SplashScreen: {
      /* Hidden as soon as the web app says it is ready, but never held longer
       * than launchShowDuration, because this shell has a network round-trip
       * in front of first paint that a bundled app does not.
       *
       * The responsive half is why this is not a plain fixed delay: a fixed
       * delay either uncovers a blank WebView on a slow connection or sits on
       * a splash screen that is already stale on a fast one.
       * components/mobile/NativeShell.tsx calls hide() on first paint, which
       * is the path that normally runs, typically in well under a second.
       *
       * The ceiling is why this is not launchAutoHide: false, which is what
       * this originally was. That made a JS hide() call the *only* way out of
       * the splash screen, so anything that stopped it running bricked the app
       * on a logo with no way forward -- and "anything" is a real list: the
       * site not yet having deployed NativeShell, a hydration error, a bad
       * release, a rollback. This was not theoretical. The first emulator run
       * sat on the splash indefinitely for exactly that reason, because
       * production had not shipped NativeShell yet.
       *
       * Ten seconds is deliberately generous. It is a failsafe, not a target:
       * it has to outlast a cold start on a bad connection, since uncovering a
       * blank WebView is the failure this was guarding against in the first
       * place. Anything that reaches it is already broken, and showing a
       * half-loaded page beats showing a logo forever.
       *
       * A total load failure is handled separately and faster -- server.
       * errorPath swaps in mobile/www/offline.html, which hides the splash
       * itself. */
      launchAutoHide: true,
      launchShowDuration: 10000,

      /* The cream the Pana Mia mark is drawn on, matching the `www` splash
       * background in app/manifest.webmanifest/route.ts so an install from the
       * browser and an install from a store open the same way. */
      backgroundColor: '#fff7ec',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },

    StatusBar: {
      /* Dark glyphs, because the masthead paints the status bar area in cream
       * and light glyphs would be invisible on it. The web app already asks
       * for the same thing via apple-mobile-web-app-status-bar-style in
       * app/layout.tsx; this is the native half of that. */
      style: 'LIGHT',
      backgroundColor: '#fff7ec',

      /* The masthead already paints to the top of the viewport and the layout
       * sets viewportFit: 'cover', so the web app is laying out behind the
       * status bar on purpose. Overlaying matches that; not overlaying would
       * reserve a second band of background above the masthead. */
      overlaysWebView: true,
    },
  },
};

export default config;
