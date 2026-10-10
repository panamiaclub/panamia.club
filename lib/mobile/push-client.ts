/**
 * The device's own push registration, as the browser-side code sees it.
 *
 * Capacitor's push plugin hands the token to a `registration` listener once
 * and offers no way to ask for it again. So the token is remembered here when
 * it arrives, and read back from here when something needs to refer to this
 * device — in practice, sign-out.
 *
 * Deliberately a plain module with no Capacitor import. Anything that signs
 * out imports this (see lib/auth-client.ts), which is to say most of the app,
 * and it must stay free for browser visitors: with no token remembered every
 * function here returns immediately, and nothing from @capacitor is pulled
 * into the bundle.
 */

/* Module scope rather than state. The token belongs to the device, not to any
 * component, and it has to outlive whichever tree registered it — a member can
 * sign out from a page that never mounted PushRegistration. */
let currentToken: string | null = null;

/** Called by components/mobile/PushRegistration.tsx when a token arrives. */
export function setCurrentPushToken(token: string): void {
  currentToken = token;
}

export function getCurrentPushToken(): string | null {
  return currentToken;
}

/**
 * Tell the server to stop sending push to this device.
 *
 * Must be called while the member is still signed in — the endpoint is
 * session-authenticated, so after sign-out there is no way to prove the device
 * was theirs. See the call site in lib/auth-client.ts.
 *
 * Resolves rather than throwing on failure. The caller is in the middle of
 * signing out, which has to succeed regardless.
 */
export async function unregisterThisDevice(): Promise<void> {
  if (!currentToken) return;

  const token = currentToken;
  /* Cleared first so a failed request cannot leave a stale token behind to be
   * re-sent later under whoever signs in next. */
  currentToken = null;

  try {
    await fetch('/api/push/unregister', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      /* The sign-out navigation follows immediately. keepalive lets the
       * request outlive the page it started on, which is the difference
       * between this usually working and usually being cancelled. */
      keepalive: true,
    });
  } catch {
    // Best effort; see the note on the caller.
  }
}
