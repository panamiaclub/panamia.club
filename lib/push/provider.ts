import { z } from 'zod';
import { pushAlert, type PushMessagePreview } from './payload';

export interface PushEnv {
  PUSH_APNS_CONFIG?: string;
  PUSH_FCM_SERVICE_ACCOUNT?: string;
}

export class PushProviderError extends Error {}

const apnsConfigSchema = z.object({
  teamId: z.string().min(1),
  keyId: z.string().min(1),
  privateKey: z.string().min(1),
  environment: z.enum(['sandbox', 'production']),
});
const fcmConfigSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

function parsePushConfig<T>(
  value: string | undefined,
  schema: z.ZodType<T>,
  provider: 'APNs' | 'FCM'
): T {
  if (!value) throw new PushProviderError(`${provider} is not configured`);
  let input: unknown;
  try {
    input = JSON.parse(value);
  } catch {
    throw new PushProviderError(`Invalid ${provider} configuration`);
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new PushProviderError(`Invalid ${provider} configuration`);
  return parsed.data;
}

export function validatePushConfiguration(
  env: PushEnv,
  platform: 'ios' | 'android'
): void {
  if (platform === 'ios') {
    parsePushConfig(env.PUSH_APNS_CONFIG, apnsConfigSchema, 'APNs');
  } else {
    parsePushConfig(env.PUSH_FCM_SERVICE_ACCOUNT, fcmConfigSchema, 'FCM');
  }
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export async function signPushJwt(
  header: Record<string, string>,
  claims: Record<string, string | number>,
  pem: string,
  algorithm: 'ES256' | 'RS256'
): Promise<string> {
  const encode = (value: object) =>
    base64url(new TextEncoder().encode(JSON.stringify(value)));
  const input = `${encode(header)}.${encode(claims)}`;
  const keyBytes = Uint8Array.from(
    atob(pem.replaceAll('\\n', '\n').replace(/-----[^-]+-----|\s/g, '')),
    (char) => char.charCodeAt(0)
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    algorithm === 'ES256'
      ? { name: 'ECDSA', namedCurve: 'P-256' }
      : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    algorithm === 'ES256'
      ? { name: 'ECDSA', hash: 'SHA-256' }
      : 'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(input)
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

export function createPushSender(env: PushEnv, request: typeof fetch = fetch) {
  // Invocation-local promises: never share in-flight I/O between Workers requests.
  let apnsJwt: Promise<string> | undefined;
  let googleToken: Promise<string> | undefined;
  const send = (url: string, init: RequestInit) =>
    request(url, { ...init, signal: AbortSignal.timeout(8000) });
  return async (
    device: {
      platform: string;
      token: string;
      messagePreviews?: boolean;
    },
    notificationId: string,
    preview?: PushMessagePreview
  ): Promise<'sent' | 'invalid'> => {
    const alert = pushAlert(
      notificationId,
      device.messagePreviews ? preview : undefined
    );
    const now = Math.floor(Date.now() / 1000);
    if (device.platform === 'ios') {
      const config = parsePushConfig(
        env.PUSH_APNS_CONFIG,
        apnsConfigSchema,
        'APNs'
      );
      apnsJwt ??= signPushJwt(
        { alg: 'ES256', kid: config.keyId },
        { iss: config.teamId, iat: now },
        config.privateKey,
        'ES256'
      );
      const host =
        config.environment === 'sandbox'
          ? 'api.sandbox.push.apple.com'
          : 'api.push.apple.com';
      const response = await send(
        `https://${host}/3/device/${encodeURIComponent(device.token)}`,
        {
          method: 'POST',
          headers: {
            authorization: `bearer ${await apnsJwt}`,
            'apns-topic': 'social.pana.app',
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'apns-expiration': String(now + 3600),
            'apns-collapse-id': notificationId,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            aps: {
              alert: { title: alert.title, body: alert.body },
              sound: 'default',
            },
            notificationId,
          }),
        }
      );
      if (response.ok) return 'sent';
      const error = (await response.json()) as { reason?: string };
      if (response.status === 410 || error.reason === 'Unregistered')
        return 'invalid';
      throw new PushProviderError(`APNs delivery failed (${response.status})`);
    }

    const config = parsePushConfig(
      env.PUSH_FCM_SERVICE_ACCOUNT,
      fcmConfigSchema,
      'FCM'
    );
    googleToken ??= (async () => {
      const assertion = await signPushJwt(
        { alg: 'RS256', typ: 'JWT' },
        {
          iss: config.client_email,
          scope: 'https://www.googleapis.com/auth/firebase.messaging',
          aud: 'https://oauth2.googleapis.com/token',
          iat: now,
          exp: now + 3600,
        },
        config.private_key,
        'RS256'
      );
      const response = await send('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
      });
      if (!response.ok)
        throw new PushProviderError(
          `FCM authentication failed (${response.status})`
        );
      const data = (await response.json()) as { access_token?: string };
      if (!data.access_token)
        throw new PushProviderError('FCM authentication returned no token');
      return data.access_token;
    })();
    const response = await send(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.project_id)}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await googleToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: { title: alert.title, body: alert.body },
            data: { notificationId },
            android: {
              priority: 'high',
              ttl: '3600s',
              notification: {
                channel_id: 'pana-notifications',
                tag: notificationId,
                visibility: 'PRIVATE',
              },
            },
          },
        }),
      }
    );
    if (response.ok) return 'sent';
    const error = (await response.json()) as {
      error?: { details?: { errorCode?: string }[] };
    };
    if (
      error.error?.details?.some(
        (detail) => detail.errorCode === 'UNREGISTERED'
      )
    )
      return 'invalid';
    throw new PushProviderError(`FCM delivery failed (${response.status})`);
  };
}
