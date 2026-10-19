'use client';

/**
 * The web app's half of the native shell.
 *
 * The shell is a WebView pointed at this deploy (see capacitor.config.ts), so
 * the site is doing its own rendering exactly as it does in a browser. What it
 * is not doing by default is any of the things a browser normally handles on
 * its behalf: dismissing the launch screen, answering the Android back button,
 * and turning a tapped link to panamia.club into in-app navigation rather than
 * a page the member never arrives at. This component is where those are wired.
 *
 * Renders nothing. It is mounted for its effects, beside ScreennameGate in the
 * root layout, because every one of these concerns is app-wide — a back button
 * that only worked on the pages which remembered to opt in would be a back
 * button that appears broken at random.
 *
 * Every plugin is imported lazily, inside the native branch. That import is
 * the thing that would otherwise cost browser visitors: `isNativeApp()` is a
 * property read on a global the native runtime injects, so in a browser this
 * component does nothing and downloads nothing.
 */

import { useEffect } from 'react';
import { isNativeApp, NATIVE_APP_CLASS } from '@/lib/mobile/native';
import { DEFAULT_ROOT_DOMAIN } from '@/lib/panaverse/surfaces';

export function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) return;

    /* Lets CSS target the app without a prop or a context. Set in an effect
     * rather than during render because the server has no way to know (see
     * lib/mobile/native.ts) — rendering it into the HTML would be a guess, and
     * a wrong guess is a hydration mismatch. */
    document.documentElement.classList.add(NATIVE_APP_CLASS);

    /* Listener handles, collected so cleanup can remove them. Capacitor's
     * addListener is async, so what is stored is the promise of a handle —
     * awaiting it before returning would mean an effect that cannot clean up
     * synchronously, and under React's strict double-mount that leaks one
     * listener per mount. Two back-button listeners is one tap going back
     * twice. */
    const pending: Promise<{ remove: () => void }>[] = [];

    let cancelled = false;

    void (async () => {
      const [{ App }, { SplashScreen }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/splash-screen'),
      ]);

      if (cancelled) return;

      /* The splash screen has a ten-second failsafe in capacitor.config.ts but
       * is meant to come down long before that, and this is what takes it down
       * — after hydration, from the live page. That ordering is the point: a
       * purely timed splash either uncovers an empty WebView while the deploy
       * is still answering, or lingers over a page that has been ready for a
       * second.
       *
       * Two other things hide it, and both are fallbacks rather than
       * duplicates of this. The bundled offline page hides it for the case
       * where this code never runs because the deploy was unreachable (see
       * mobile/www/offline.html), and the config's launchShowDuration catches
       * the case where the page loads but this code still does not run — an
       * older deploy, a hydration error, a rollback. */
      await SplashScreen.hide();

      /* Android's hardware back button. Without a listener Capacitor's default
       * is to exit the app on every press, which on a browsing app means a tap
       * anywhere three levels deep quits to the home screen.
       *
       * `canGoBack` is the WebView's own history, so this follows the trail
       * the member actually walked, including client-side navigations within a
       * surface. Only at the bottom of that stack does back mean leave — which
       * is the platform convention, and what members expect from a root page.
       *
       * iOS never fires this: there is no hardware button, and the edge-swipe
       * gesture is handled by the WebView itself. */
      pending.push(
        App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
          } else {
            void App.exitApp();
          }
        })
      );

      /* Universal Links and App Links: a panamia.club URL tapped in another app
       * opens this one, and the OS hands over the URL that did it.
       *
       * Navigating explicitly is what makes that land somewhere useful.
       * Without this the app opens on whatever it was last showing — or its
       * start URL on a cold launch — so a member who tapped a link to a
       * particular listing arrives at the home page, which reads as the link
       * having been ignored.
       *
       * What counts as "ours" is any https host on the panaverse root domain,
       * NOT just the origin currently loaded. That distinction is the whole
       * point of shipping both surfaces in one app: this WebView may be
       * showing panamia.club when a social.panamia.club link arrives, and those
       * are different origins. Comparing against window.location.origin would
       * silently drop exactly half the deep links — the cross-surface half —
       * and produce the ignored-link behaviour this listener exists to fix.
       *
       * Anything outside that domain is dropped rather than followed. This
       * listener should only ever be handed a URL the app has declared it
       * handles (see app/.well-known/ and the native claims described there),
       * so an unexpected origin means something went wrong, and treating it as
       * a navigation instruction would turn a stray deep link into an open
       * redirect inside the WebView. */
      pending.push(
        App.addListener('appUrlOpen', ({ url }) => {
          let target: URL;
          try {
            target = new URL(url);
          } catch {
            return;
          }

          const root = DEFAULT_ROOT_DOMAIN;
          const isOurs =
            target.protocol === 'https:' &&
            (target.hostname === root || target.hostname.endsWith(`.${root}`));

          if (!isOurs) return;

          /* Same origin keeps the URL relative so the WebView treats it as
           * ordinary in-app navigation. A claimed host on a different origin
           * is a surface crossing, which needs the absolute URL — and is
           * allowed to stay in the app by the allowNavigation list in
           * capacitor.config.ts. */
          window.location.assign(
            target.origin === window.location.origin
              ? `${target.pathname}${target.search}${target.hash}`
              : target.href
          );
        })
      );
    })();

    return () => {
      cancelled = true;
      /* Runs whether or not the async block got that far, because a promise
       * pushed before unmount still resolves to a live listener. */
      for (const handle of pending) {
        void handle.then((h) => h.remove()).catch(() => {});
      }
    };
  }, []);

  return null;
}
