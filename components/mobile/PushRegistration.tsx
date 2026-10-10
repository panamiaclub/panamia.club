'use client';

/**
 * Registers the device for push notifications, and routes taps on them.
 *
 * Mounted beside NativeShell in the root layout and renders nothing. Like
 * NativeShell, the Capacitor import is lazy and inside the native branch, so
 * a browser visitor downloads none of it.
 *
 * ## Why this waits for sign-in
 *
 * iOS grants exactly one permission prompt per install. Decline it and the
 * only route back is Settings, by way of a member who has to be told the
 * switch exists and where it lives — in practice, permanently off.
 *
 * So the prompt is spent at the first moment it can be answered sensibly.
 * Asking on cold launch means asking a stranger, before there is an account
 * for anything to be notified about, and "would you like notifications?" with
 * no notion of what for is the version people decline. After sign-in there is
 * a reason: follows, replies and messages addressed to them specifically.
 *
 * The rule is simply: no account, nothing to notify about, do not ask.
 *
 * ## Why it re-registers every launch
 *
 * Push tokens rotate without notice — restore from backup, some OS upgrades,
 * a long spell uninstalled. The server upserts, so a repeat registration of
 * an unchanged token costs one row update and nothing else, while a changed
 * one is only ever noticed by asking.
 *
 * It is also what keeps a shared handset honest. Registration reassigns the
 * token to whoever is signed in now (see lib/push/tokens.ts), so the first
 * launch after a new member signs in stops the previous member's
 * notifications reaching them.
 */

import { useEffect } from 'react';
import { useSession } from '@/lib/auth-client';
import { isNativeApp, nativePlatform } from '@/lib/mobile/native';
import { setCurrentPushToken } from '@/lib/mobile/push-client';

export function PushRegistration() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!isNativeApp()) return;
    // See the header: no account, nothing to notify about, do not ask.
    if (!userId) return;

    const platform = nativePlatform();
    if (platform !== 'ios' && platform !== 'android') return;

    /* Same shape as NativeShell: addListener is async, so these are promises
     * of handles. Awaiting them before returning would make the effect unable
     * to clean up synchronously, which under React's strict double-mount
     * leaks a listener per mount — and a duplicated tap handler navigates
     * twice. */
    const pending: Promise<{ remove: () => void }>[] = [];
    let cancelled = false;

    void (async () => {
      const { PushNotifications } = await import(
        '@capacitor/push-notifications'
      );

      if (cancelled) return;

      /* Checked before requesting. checkPermissions reports a decision the
       * member already made, and calling requestPermissions after a denial is
       * a silent no-op on both platforms — so without this the code would
       * look like it was asking again and quietly never be heard. */
      let permission = await PushNotifications.checkPermissions();

      if (permission.receive === 'prompt-with-rationale') {
        /* Android 13+ may say the member dismissed a previous prompt without
         * deciding. Asking again is allowed here and is not nagging: a
         * dismissal is not a refusal. */
        permission = await PushNotifications.requestPermissions();
      } else if (permission.receive === 'prompt') {
        permission = await PushNotifications.requestPermissions();
      }

      if (cancelled || permission.receive !== 'granted') return;

      /* Listeners are attached before register(), because register() is what
       * causes the OS to deliver the token to the `registration` listener.
       * Reversing the order loses the token of a device that answers quickly,
       * and that device is then registered nowhere until its next launch. */
      pending.push(
        PushNotifications.addListener('registration', (token) => {
          /* Remembered so sign-out can name this device while the session
           * still exists — see lib/mobile/push-client.ts. */
          setCurrentPushToken(token.value);

          void fetch('/api/push/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token.value, platform }),
          }).catch((error) => {
            /* Not surfaced to the member. They did not ask for this and
             * cannot act on it; the next launch retries. */
            console.error('[push] registration request failed', error);
          });
        })
      );

      pending.push(
        PushNotifications.addListener('registrationError', (error) => {
          console.error('[push] registration failed', error);
        })
      );

      /* A tapped notification. Without this the app comes to the foreground
       * showing whatever it was last on, so a tap on "someone replied to you"
       * lands on an unrelated page and reads as the notification having done
       * nothing.
       *
       * The URL is the one put in the payload by lib/push/index.ts, and it is
       * always a path on this deploy. It is still checked rather than
       * trusted: this handler takes its instruction from data that arrived
       * over the network, and following an absolute URL from it would turn a
       * spoofed push into an open redirect inside the WebView. Rejecting
       * anything that is not a single-slash-rooted path also rejects
       * protocol-relative `//evil.example`, which is a path by appearance
       * only. */
      pending.push(
        PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            const url = action.notification.data?.url;
            if (typeof url !== 'string') return;
            if (!url.startsWith('/') || url.startsWith('//')) return;

            window.location.assign(url);
          }
        )
      );

      await PushNotifications.register();
    })();

    return () => {
      cancelled = true;
      for (const handle of pending) {
        void handle.then((h) => h.remove()).catch(() => {});
      }
    };
    /* Keyed on the member, so signing in as somebody else re-registers and
     * reassigns the device rather than leaving it pointed at the previous
     * account. */
  }, [userId]);

  return null;
}
