/**
 * Firebase Cloud Messaging delivery, HTTP v1 API.
 *
 * The legacy FCM endpoint that took a plain server key is retired. v1 needs a
 * service account and an OAuth access token per hour, which is what jwt.ts
 * supplies — more setup, but the credential is revocable and scoped rather
 * than a single everlasting key.
 */
import { z } from 'zod';
import { getFcmAccessToken } from './jwt';
import { boundPushMessage } from './payload';
import type { PushMessage, PushResult } from './types';

const FCM_ERROR_TYPE = 'type.googleapis.com/google.firebase.fcm.v1.FcmError';
const BAD_REQUEST_TYPE = 'type.googleapis.com/google.rpc.BadRequest';
const fcmErrorSchema = z.object({
  error: z.object({
    status: z.string().optional(),
    details: z
      .array(
        z.object({
          '@type': z.string(),
          errorCode: z.string().optional(),
        })
      )
      .optional(),
  }),
});

export async function sendFcm(
  deviceToken: string,
  message: PushMessage
): Promise<PushResult> {
  const projectId = process.env.FCM_PROJECT_ID?.trim();
  if (!projectId) return { status: 'failed', reason: 'fcm-not-configured' };

  const accessToken = await getFcmAccessToken();
  if (!accessToken) return { status: 'failed', reason: 'fcm-not-configured' };

  const bounded = boundPushMessage(message);
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
          notification: { title: bounded.title, body: bounded.body },
          /* FCM data values must be strings — numbers and nulls are rejected
           * for the whole message, so the map is built conditionally rather
           * than with undefined holes. */
          ...(bounded.url ? { data: { url: bounded.url } } : {}),
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
    const parsed = fcmErrorSchema.safeParse(await response.json());
    if (parsed.success) {
      const { status, details = [] } = parsed.data.error;
      reason = status ?? reason;
      const fcmCode = details.find(
        (detail) => detail['@type'] === FCM_ERROR_TYPE
      )?.errorCode;

      if (response.status === 404 && fcmCode === 'UNREGISTERED') {
        return { status: 'dead', reason: fcmCode };
      }

      // Generic INVALID_ARGUMENT also covers oversized/malformed payloads.
      // Only FCM's typed invalid-token detail, without a request violation,
      // is evidence that the registration itself should be removed.
      if (
        response.status === 400 &&
        status === 'INVALID_ARGUMENT' &&
        fcmCode === 'INVALID_ARGUMENT' &&
        !details.some((detail) => detail['@type'] === BAD_REQUEST_TYPE)
      ) {
        return { status: 'dead', reason: fcmCode };
      }
    }
  } catch {
    // Non-JSON body; the status code is all we have.
  }

  return { status: 'failed', reason };
}
