/**
 * Push notification delivery.
 *
 * The public entry point is sendPushToUser(). Everything below it — JWT
 * signing, the two transports, token storage — is an implementation detail
 * that callers should not need to reach for.
 *
 * ## Where this sits
 *
 * The `notifications` table records that something happened. This module
 * delivers that fact to a lock screen. The two are deliberately independent:
 * a notification is created and stored whether or not push is configured,
 * whether or not the member has a device registered, and whether or not
 * delivery succeeds. Push is an additional channel, never the system of
 * record.
 *
 * That independence is what makes it safe for createNotification() to call
 * this at all — see lib/notifications.ts.
 *
 * ## Why this is awaited rather than fired and forgotten
 *
 * The obvious shape for best-effort work is a floating promise. It does not
 * work here. Route handlers in this app have no executionCtx.waitUntil (the
 * same constraint documented in app/api/getDirectorySearch/route.ts), so work
 * still in flight when the response is returned is cancelled more often than
 * it completes. An unawaited push would be delivered sometimes, which is
 * worse than either alternative because it cannot be diagnosed.
 *
 * So delivery is awaited, and the cost of that is bounded instead: the whole
 * fan-out races a timeout, and a member with no registered devices does no
 * work at all beyond one indexed lookup.
 *
 * ## Why there is no preference check
 *
 * users.notification_preferences exists in the schema and is read by nothing.
 * No UI writes it. Gating on it would mean gating on a column whose value is
 * always null — which either disables push for everyone or is a no-op, and
 * both are worse than being honest about it.
 *
 * The real preference is the operating system's. A device only appears in
 * device_tokens because the member was asked and agreed, both platforms offer
 * per-app notification settings that work whatever this server believes, and
 * revoking permission stops delivery at the device. Adding a second,
 * in-app switch is worth doing when there are categories worth separating;
 * until then it would be a control that duplicates one the member already
 * has.
 */
import { sendApns } from './apns';
import { sendFcm } from './fcm';
import { getDeviceTokensForUsers, pruneDeadTokens } from './tokens';
import type { PushMessage } from './types';

export type { PushMessage, PushResult } from './types';
export {
  registerDeviceToken,
  unregisterDeviceToken,
  getDeviceTokensForUser,
  type DevicePlatform,
} from './tokens';

/**
 * How long the whole fan-out may take before the caller gives up waiting.
 *
 * This is a ceiling on how much a push can slow down the action that
 * triggered it — posting a comment, sending a message. Both services
 * normally answer in well under a second, so reaching this means something
 * is wrong, and in that case the right behaviour is to let the member's
 * action complete and lose the push rather than hold the request open.
 */
const PUSH_TIMEOUT_MS = 5000;

function isPushConfigured(): boolean {
  const apns =
    !!process.env.APNS_KEY_ID?.trim() &&
    !!process.env.APNS_PRIVATE_KEY?.trim() &&
    !!process.env.APPLE_APP_TEAM_ID?.trim();

  const fcm =
    !!process.env.FCM_PROJECT_ID?.trim() &&
    !!process.env.FCM_CLIENT_EMAIL?.trim() &&
    !!process.env.FCM_PRIVATE_KEY?.trim();

  return apns || fcm;
}

/**
 * Deliver a message to every device a member has registered.
 *
 * Never throws and never rejects. Callers are in the middle of doing
 * something the member asked for, and a push service having a bad minute must
 * not turn a successful comment into a failed request.
 *
 * Returns the number of devices reached, which is useful in logs and tests
 * and ignorable everywhere else.
 */
export async function sendPushToUser(
  userId: string,
  message: PushMessage
): Promise<number> {
  return sendPushToUsers([userId], message);
}

/** Batch equivalent, with one indexed token lookup and one shared deadline. */
export async function sendPushToUsers(
  userIds: string[],
  message: PushMessage
): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    /* Checked before the query so that an environment with no push setup —
     * local development, preview deploys, CI — does no database work at all
     * on a path that runs for every notification in the system. */
    if (userIds.length === 0 || !isPushConfigured()) return 0;

    const delivery = (async () => {
      const devices = await getDeviceTokensForUsers([...new Set(userIds)]);
      if (devices.length === 0) return 0;

      const results = await Promise.all(
        devices.map(async (device) => {
          try {
            return device.platform === 'ios'
              ? await sendApns(device.token, message)
              : await sendFcm(device.token, message);
          } catch (error) {
            /* A thrown error is a transport problem, not a verdict on the
             * token, so it must not be mistaken for a dead device. */
            return {
              status: 'failed' as const,
              reason: error instanceof Error ? error.message : 'unknown',
            };
          }
        })
      );

      for (const [i, result] of results.entries()) {
        if (result.status === 'failed') {
          console.error('[push] delivery failed', {
            platform: devices[i].platform,
            reason: result.reason,
          });
        }
      }

      const dead = devices
        .filter((_, i) => results[i].status === 'dead')
        .map((device) => device.token);

      if (dead.length > 0) {
        await pruneDeadTokens(dead).catch((error) => {
          console.error('[push] failed to prune dead tokens', error);
        });
      }

      return results.filter((result) => result.status === 'sent').length;
    })();

    /* Resolves rather than rejects on timeout: a slow service is an expected
     * condition, not an exception. The in-flight requests are abandoned
     * rather than cancelled, which is acceptable for a best-effort channel —
     * a late delivery is still a delivery. */
    return await Promise.race([
      delivery,
      new Promise<number>((resolve) => {
        timer = setTimeout(() => {
          console.error('[push] delivery timed out');
          resolve(0);
        }, PUSH_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.error('[push] send failed', error);
    return 0;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
