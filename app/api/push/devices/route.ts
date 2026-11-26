import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { resolvePushSession } from '@/auth';
import { db } from '@/lib/db';
import { pushDevices } from '@/lib/schema';
import { registerPushDevice } from '@/lib/push/devices';
import {
  PushProviderError,
  validatePushConfiguration,
} from '@/lib/push/provider';

const deviceSchema = z.object({
  id: z.uuid(),
  platform: z.enum(['ios', 'android']),
  token: z
    .string()
    .min(20)
    .max(4096)
    .regex(/^[A-Za-z0-9_:.-]+$/),
});
const reply = (data: object, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

async function mutate(request: Request, remove: boolean) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return reply({ error: 'Invalid origin' }, 403);
  }
  try {
    const session = await resolvePushSession(request.headers);
    if (!session) return reply({ error: 'Unauthorized' }, 401);
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return reply({ error: 'Invalid JSON' }, 400);
    }
    if (remove) {
      const parsed = z.object({ id: z.uuid() }).safeParse(input);
      if (!parsed.success) return reply({ error: 'Invalid device' }, 400);
      await db
        .delete(pushDevices)
        .where(
          and(
            eq(pushDevices.id, parsed.data.id),
            eq(pushDevices.sessionId, session.id),
            eq(pushDevices.userId, session.userId)
          )
        );
    } else {
      const parsed = deviceSchema.safeParse(input);
      if (!parsed.success) return reply({ error: 'Invalid device' }, 400);
      if (
        parsed.data.platform === 'ios' &&
        !/^[a-fA-F0-9]{64,200}$/.test(parsed.data.token)
      ) {
        return reply({ error: 'Invalid APNs token' }, 400);
      }
      const configured =
        parsed.data.platform === 'ios'
          ? process.env.PUSH_APNS_CONFIG
          : process.env.PUSH_FCM_SERVICE_ACCOUNT;
      if (!configured)
        return reply(
          { error: 'Push delivery is not configured for this platform yet.' },
          503
        );
      try {
        validatePushConfiguration(
          {
            PUSH_APNS_CONFIG: process.env.PUSH_APNS_CONFIG,
            PUSH_FCM_SERVICE_ACCOUNT: process.env.PUSH_FCM_SERVICE_ACCOUNT,
          },
          parsed.data.platform
        );
      } catch (error) {
        if (error instanceof PushProviderError)
          return reply({ error: error.message }, 503);
        throw error;
      }
      await registerPushDevice(session, parsed.data);
    }
    return reply({ success: true });
  } catch {
    // Never log a request body, provider token, or credentials.
    console.error('[push] Device registration update failed');
    return reply({ error: 'Could not update push registration' }, 500);
  }
}

export const PUT = (request: Request) => mutate(request, false);
export const DELETE = (request: Request) => mutate(request, true);
