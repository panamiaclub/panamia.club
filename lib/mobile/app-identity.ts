/**
 * The app's permanent identity in the two stores.
 *
 * Both platforms treat this string as the app itself. It is the Android
 * package name and the iOS bundle ID, it keys every install and every
 * subscription, and neither store lets it change after the first release —
 * shipping a new one means a new listing with zero installs. So it is written
 * once, here, and read by everything that needs it.
 *
 * Three unrelated places need it and would otherwise each hold a copy:
 * capacitor.config.ts, which stamps it into the native projects; the Android
 * App Links file; and the Apple Universal Links file. Two of those are served
 * at runtime from the Worker and one is consumed at build time by the
 * Capacitor CLI, so a drifted copy does not fail loudly — it produces a deep
 * link association that is syntactically perfect and names an app that does
 * not exist, which presents as "links just open in the browser" with nothing
 * in any log.
 *
 * Kept free of imports on purpose. The Capacitor CLI evaluates
 * capacitor.config.ts outside the app's build, so it does not resolve the `@/`
 * aliases the rest of the codebase uses; a dependency here would be a
 * dependency that works everywhere except in the tool that needs it most.
 */

/**
 * Reverse-DNS of PANAVERSE_ROOT_DOMAIN (panamia.club), matching the convention
 * both stores expect.
 */
export const MOBILE_APP_ID = 'social.pana.app';
