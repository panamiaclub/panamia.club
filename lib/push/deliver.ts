import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  notifications,
  pushDeliveries,
  pushDevices,
  sessions,
} from '@/lib/schema';
import { isBlockedBetweenUsers } from '@/lib/notifications';
import { createPushSender, PushProviderError, type PushEnv } from './provider';

export async function deliverPendingPush(env: PushEnv) {
  const send = createPushSender(env);
  await db
    .delete(pushDevices)
    .where(lt(pushDevices.updatedAt, new Date(Date.now() - 30 * 86400000)));
  await db
    .delete(pushDeliveries)
    .where(lt(pushDeliveries.createdAt, new Date(Date.now() - 86400000)));
  // Lease in one statement. Concurrent/retried cron invocations cannot claim
  // the same job; a crashed invocation becomes eligible again in five minutes.
  const jobs = await db
    .update(pushDeliveries)
    .set({
      attempts: sql`${pushDeliveries.attempts} + 1`,
      availableAt: sql`now() + interval '5 minutes'`,
    })
    .where(
      sql`(device_id, notification_id) IN (
      SELECT device_id, notification_id FROM push_deliveries
      WHERE available_at <= now() AND attempts < 8
      ORDER BY available_at LIMIT 25 FOR UPDATE SKIP LOCKED
    )`
    )
    .returning();
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    const key = and(
      eq(pushDeliveries.deviceId, job.deviceId),
      eq(pushDeliveries.notificationId, job.notificationId)
    );
    try {
      const [row] = await db
        .select({
          device: pushDevices,
          notification: notifications,
          session: sessions,
        })
        .from(pushDeliveries)
        .innerJoin(pushDevices, eq(pushDevices.id, pushDeliveries.deviceId))
        .innerJoin(
          notifications,
          eq(notifications.id, pushDeliveries.notificationId)
        )
        .innerJoin(sessions, eq(sessions.id, pushDevices.sessionId))
        .where(key);
      if (!row) continue;
      const { device, notification, session } = row;
      if (
        session.expiresAt <= new Date() ||
        session.userId !== device.userId ||
        notification.target !== device.userId ||
        notification.read ||
        (notification.expiresAt && notification.expiresAt <= new Date()) ||
        (await isBlockedBetweenUsers(notification.actor, notification.target))
      ) {
        await db.delete(pushDeliveries).where(key);
        continue;
      }
      const outcome = await send(device, notification.id);
      if (outcome === 'invalid') {
        // Match the exact token so a concurrent rotation cannot be revoked.
        await db
          .delete(pushDevices)
          .where(
            and(
              eq(pushDevices.id, device.id),
              eq(pushDevices.token, device.token)
            )
          );
      } else {
        await db.delete(pushDeliveries).where(key);
        sent++;
      }
    } catch (error) {
      failed++;
      console.error('[push] Delivery failed; retry pending', {
        attempt: job.attempts,
        exhausted: job.attempts >= 8,
        reason:
          error instanceof PushProviderError
            ? error.message
            : 'Provider transport, signing, or database error',
      });
      await db
        .update(pushDeliveries)
        .set({
          availableAt: new Date(
            Date.now() + Math.min(60, 2 ** job.attempts) * 60000
          ),
        })
        .where(key);
    }
  }
  // Logout deletes the session and cascades devices/jobs. Expired sessions
  // still exist in Better Auth, so prune those registrations explicitly.
  await db
    .delete(pushDevices)
    .where(
      sql`${pushDevices.sessionId} IN (SELECT id FROM sessions WHERE expires_at <= now())`
    );
  return { sent, failed };
}
