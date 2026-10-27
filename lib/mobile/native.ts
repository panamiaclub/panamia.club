/**
 * Is this page running inside the native shell?
 *
 * The shell loads the deployed site in a WebView rather than bundling it (see
 * capacitor.config.ts), so every module in `app/` and `components/` runs in
 * both places. This is the single source of truth for telling them apart.
 *
 * Deliberately reads `window.Capacitor` directly instead of importing
 * `@capacitor/core`. The bridge is injected into the page by the native
 * runtime, so the global is the actual fact on the ground — the npm package is
 * a typed wrapper around it. Importing that wrapper here would pull Capacitor
 * into the main web bundle for every browser visitor, the overwhelming
 * majority of whom will never run the app, in order to answer a question that
 * is one property read. Modules that need real plugin APIs import them lazily
 * behind `isNativeApp()`; see components/mobile/NativeShell.tsx.
 *
 * This is also why the check is not "is the user agent a phone". A member
 * browsing pana.social in mobile Safari is on a phone and is not in the app:
 * they have browser chrome, a URL bar, and a back gesture the app has to
 * provide for itself. Sniffing the user agent would give both of them the same
 * treatment and get one of them wrong.
 */

/**
 * The shape the native runtime injects. Only the parts read here are
 * described — this is not a re-declaration of the plugin API.
 */
interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
}

declare global {
  interface Window {
    Capacitor?: CapacitorBridge;
  }
}

export type NativePlatform = 'ios' | 'android';

/**
 * Marks `<html>` while the shell is running, so CSS can adapt without any
 * component having to thread a prop down to reach it.
 *
 * Exported rather than written as a literal in both places: a class name that
 * is set in one file and matched in another is a string that silently stops
 * matching the day one of them is edited.
 */
export const NATIVE_APP_CLASS = 'native-app';

/** A modal may prevent this event to consume Android back before navigation. */
export const NATIVE_BACK_BUTTON_EVENT = 'native-back-button';

/**
 * True only inside the shell.
 *
 * Returns false during server rendering, which is the safe answer rather than
 * a correct one: the server cannot know, because the WebView sends the same
 * request a browser does and the bridge only exists once the document is
 * running on the device. Anything that must differ in the app therefore has to
 * be decided on the client, after hydration — rendering it on the server would
 * mean guessing, and a guess here is a hydration mismatch.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return window.Capacitor?.isNativePlatform?.() === true;
}

/**
 * Which store's app this is, or null in a browser.
 *
 * The two platforms genuinely differ in ways the web app has to care about —
 * Android has a hardware back button and iOS does not, and only iOS reserves
 * space for a home indicator — so this exists to answer those questions rather
 * than to allow general-purpose platform branching.
 */
export function nativePlatform(): NativePlatform | null {
  if (!isNativeApp()) return null;
  const platform = window.Capacitor?.getPlatform?.();
  return platform === 'ios' || platform === 'android' ? platform : null;
}

export function hasNativeGoogleSignIn(): boolean {
  return (
    nativePlatform() === 'android' &&
    window.Capacitor?.isPluginAvailable?.('SocialLogin') === true
  );
}
