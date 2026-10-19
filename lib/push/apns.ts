/**
 * Apple Push Notification service delivery.
 *
 * One HTTP request per device, authenticated with the ES256 JWT from jwt.ts.
 * APNs requires HTTP/2; workerd's fetch negotiates it, so no special client
 * is needed here — but that is the reason this cannot be ported to a plain
 * Node http.request without an http2 client.
 */
import { MOBILE_APP_ID } from '@/lib/mobile/app-identity';
import { getApnsToken } from './jwt';
import { boundPushMessage } from './payload';
import type { PushMessage, PushResult } from './types';

/**
 * Sandbox and production are separate worlds, not environments of one
 * service. A device token minted by a build signed for development is
 * meaningless to the production host and vice versa, and the mismatch comes
 * back as BadDeviceToken — which reads as "this device is gone" rather than
 * "you are talking to the wrong host". Builds installed from Xcode are
 * sandbox; TestFlight and App Store builds are production.
 */
function apnsHost(): string {
  return process.env.APNS_PRODUCTION?.trim() === '1'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
}

/**
 * Reasons Apple gives that mean the token is permanently gone.
 *
 * Deliberately narrow. Everything not listed here is treated as transient and
 * leaves the token in place, because deleting on an ambiguous failure
 * silently unsubscribes a member who did nothing wrong and whose app will
 * not register again until its next launch.
 */
const APNS_DEAD_REASONS = new Set([
  'BadDeviceToken',
  'Unregistered',
  'DeviceTokenNotForTopic',
]);

export async function sendApns(
  deviceToken: string,
  message: PushMessage
): Promise<PushResult> {
  const jwt = await getApnsToken();
  if (!jwt) return { status: 'failed', reason: 'apns-not-configured' };

  const bounded = boundPushMessage(message);
  const payload = {
    aps: {
      alert: { title: bounded.title, body: bounded.body },
      sound: 'default',
      ...(message.badge !== undefined ? { badge: message.badge } : {}),
    },
    /* Custom keys sit alongside `aps`, not inside it. Anything inside is
     * interpreted by the system; anything outside is handed to the app. */
    ...(bounded.url ? { url: bounded.url } : {}),
  };

  const response = await fetch(`${apnsHost()}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      /* The topic is the bundle identifier, which is why this imports the
       * same constant the Capacitor config and the association routes use —
       * a divergence here would be a silent non-delivery. */
      'apns-topic': MOBILE_APP_ID,
      'apns-push-type': 'alert',
      /* 10 = deliver immediately. The alternative, 5, lets the system hold
       * the notification to save power, which is wrong for a message someone
       * is waiting on. */
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) return { status: 'sent' };

  /* APNs puts the machine-readable cause in a JSON body, not the status line.
   * A 400 can mean a dead token or a malformed payload, and only the reason
   * distinguishes them — so the body is parsed before deciding to delete. */
  let reason = `http-${response.status}`;
  try {
    const body = (await response.json()) as { reason?: string };
    if (body.reason) reason = body.reason;
  } catch {
    // Non-JSON body; the status code is all we have.
  }

  if (response.status === 410 || APNS_DEAD_REASONS.has(reason)) {
    return { status: 'dead', reason };
  }

  return { status: 'failed', reason };
}
