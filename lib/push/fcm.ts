/**
 * Firebase Cloud Messaging delivery, HTTP v1 API.
 *
 * The legacy FCM endpoint that took a plain server key is retired. v1 needs a
 * service account and an OAuth access token per hour, which is what jwt.ts
 * supplies — more setup, but the credential is revocable and scoped rather
 * than a single everlasting key.
 */
import { getFcmAccessToken } from './jwt';
import type { PushMessage, PushResult } from './types';

/**
 * Error codes meaning the token is permanently gone.
 *
 * UNREGISTERED covers uninstalled apps and tokens the device has rotated
 * away from. INVALID_ARGUMENT is included because FCM also returns it for a
 * token that is structurally wrong — one that could never have come from this
 * project — and such a token will not become valid later.
 */
const FCM_DEAD_CODES = new Set(['UNREGISTERED', 'INVALID_ARGUMENT']);

export async function sendFcm(
  deviceToken: string,
  message: PushMessage
): Promise<PushResult> {
  const projectId = process.env.FCM_PROJECT_ID?.trim();
  if (!projectId) return { status: 'failed', reason: 'fcm-not-configured' };

  const accessToken = await getFcmAccessToken();
  if (!accessToken) return { status: 'failed', reason: 'fcm-not-configured' };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: message.title, body: message.body },
          /* FCM data values must be strings — numbers and nulls are rejected
           * for the whole message, so the map is built conditionally rather
           * than with undefined holes. */
          ...(message.url ? { data: { url: message.url } } : {}),
          android: {
            /* Without high priority the message can be held until the device
             * next leaves Doze, which for an idle phone overnight can be
             * hours. */
            priority: 'HIGH',
            notification: { sound: 'default' },
          },
        },
      }),
    }
  );

  if (response.ok) return { status: 'sent' };

  let reason = `http-${response.status}`;
  try {
    const body = (await response.json()) as {
      error?: { status?: string; message?: string };
    };
    reason = body.error?.status ?? body.error?.message ?? reason;
  } catch {
    // Non-JSON body; the status code is all we have.
  }

  /* A 404 from this endpoint means the token is unknown to the project, which
   * is the same situation as UNREGISTERED reported in the body. */
  if (response.status === 404 || FCM_DEAD_CODES.has(reason)) {
    return { status: 'dead', reason };
  }

  return { status: 'failed', reason };
}
