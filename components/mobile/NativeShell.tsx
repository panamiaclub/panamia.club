'use client';

/**
 * The web app's half of the native shell.
 *
 * The shell is a WebView pointed at this deploy (see capacitor.config.ts), so
 * the site is doing its own rendering exactly as it does in a browser. What it
 * is not doing by default is any of the things a browser normally handles on
 * its behalf: dismissing the launch screen, answering the Android back button,
 * and turning a tapped link to pana.social into in-app navigation rather than
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

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  hasOpenNativeOverlay,
  isNativeApp,
  NATIVE_APP_CLASS,
  NATIVE_BACK_BUTTON_EVENT,
} from '@/lib/mobile/native';
import {
  NATIVE_LAUNCH_URL_KEY,
  nativeDeepLinkUrl,
  nativeLaunchUrlFingerprint,
} from '@/lib/mobile/auth-links';

export function NativeShell() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
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
    let lastOpenedUrl: string | null = null;

    const openUrl = async (url: string, fromLaunch = false) => {
      if (lastOpenedUrl === url || cancelled) return;
      lastOpenedUrl = url;
      const target = nativeDeepLinkUrl(url, window.location.origin);
      if (!target) {
        console.warn('[mobile] rejected an untrusted app link');
        return;
      }

      const fingerprint = await nativeLaunchUrlFingerprint(url);
      if (cancelled) return;
      if (
        fromLaunch &&
        sessionStorage.getItem(NATIVE_LAUNCH_URL_KEY) === fingerprint
      ) {
        return;
      }
      sessionStorage.setItem(NATIVE_LAUNCH_URL_KEY, fingerprint);
      if (target.href !== window.location.href) {
        if (
          target.origin === window.location.origin &&
          !target.pathname.startsWith('/api/') &&
          !target.pathname.startsWith('/signin')
        ) {
          routerRef.current.push(
            `${target.pathname}${target.search}${target.hash}`
          );
        } else {
          // Auth links need their existing document navigation and cookie exchange.
          window.location.assign(target.href);
        }
      }
    };

    const reportLinkError = (error: unknown) => {
      console.error('[mobile] app link navigation failed', error);
    };

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
          if (
            !window.dispatchEvent(
              new Event(NATIVE_BACK_BUTTON_EVENT, { cancelable: true })
            )
          ) {
            return;
          }
          if (hasOpenNativeOverlay()) {
            document.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
                cancelable: true,
              })
            );
            return;
          }
          if (canGoBack) {
            window.history.back();
          } else {
            void App.exitApp();
          }
        })
      );

      // HTTPS App/Universal Links and the narrowly scoped email-auth scheme
      // share the same origin validation. Register before reading the cold
      // launch URL so a link arriving during startup cannot be missed.
      let receivedLaunch = false;
      pending.push(
        App.addListener('appUrlOpen', ({ url }) => {
          receivedLaunch = true;
          void openUrl(url).catch(reportLinkError);
        })
      );
      const launch = await App.getLaunchUrl();
      if (!receivedLaunch && launch?.url) await openUrl(launch.url, true);
    })().catch((error: unknown) => {
      console.error('[mobile] native shell setup failed', error);
    });

    return () => {
      cancelled = true;
      /* Runs whether or not the async block got that far, because a promise
       * pushed before unmount still resolves to a live listener. */
      for (const handle of pending) {
        void handle
          .then((h) => h.remove())
          .catch((error: unknown) => {
            console.warn('[mobile] native listener cleanup failed', error);
          });
      }
    };
  }, []);

  return null;
}
