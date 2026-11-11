import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  chatE2eeBackups,
  chatE2eeDevices,
  chatE2eeEnrollments,
  chatE2eeEvents,
  chatE2eeKeyPackages,
  chatE2eeMedia,
  chatE2eeObjectDeletions,
  chatE2eeRequestNonces,
  chatE2eeWelcomes,
} from '@/lib/schema';
import { privateBucket } from '@/lib/server/encryption-media';

export const ENCRYPTED_CHAT_RETENTION_JOB = 'encrypted-chat-retention';
const BATCH = 1000;

/** Runs even when new encrypted sends are paused. Application tombstones retain
 * sequence numbers; active control frames must survive for offline MLS peers. */
export async function purgeEncryptedChat(limit = BATCH) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('Invalid encrypted-chat retention batch.');
  const now = new Date();
  const report = await db.transaction(async (tx) => {
    const expiredDevices = await tx
      .select({ id: chatE2eeDevices.id })
      .from(chatE2eeDevices)
      .where(
        and(
          isNull(chatE2eeDevices.revokedAt),
          lt(chatE2eeDevices.expiresAt, now)
        )
      )
      .limit(limit);
    if (expiredDevices.length)
      await tx
        .update(chatE2eeDevices)
        .set({ revokedAt: now })
        .where(
          inArray(
            chatE2eeDevices.id,
            expiredDevices.map((row) => row.id)
          )
        );
    const frames = await tx
      .select({ id: chatE2eeEvents.id })
      .from(chatE2eeEvents)
      .where(
        and(
          eq(chatE2eeEvents.kind, 'message'),
          isNotNull(chatE2eeEvents.frame),
          or(
            isNotNull(chatE2eeEvents.deletedAt),
            lt(chatE2eeEvents.expiresAt, now)
          )
        )
      )
      .orderBy(asc(chatE2eeEvents.expiresAt))
      .limit(limit);
    if (frames.length)
      await tx
        .update(chatE2eeEvents)
        .set({ frame: null })
        .where(
          inArray(
            chatE2eeEvents.id,
            frames.map((row) => row.id)
          )
        );
    const media = await tx
      .select({ id: chatE2eeMedia.id })
      .from(chatE2eeMedia)
      .where(lt(chatE2eeMedia.expiresAt, now))
      .orderBy(asc(chatE2eeMedia.expiresAt))
      .limit(limit);
    if (media.length)
      await tx.delete(chatE2eeMedia).where(
        inArray(
          chatE2eeMedia.id,
          media.map((row) => row.id)
        )
      );
    const backups = await tx
      .select({ id: chatE2eeBackups.id })
      .from(chatE2eeBackups)
      .where(lt(chatE2eeBackups.expiresAt, now))
      .orderBy(asc(chatE2eeBackups.expiresAt))
      .limit(limit);
    if (backups.length)
      await tx.delete(chatE2eeBackups).where(
        inArray(
          chatE2eeBackups.id,
          backups.map((row) => row.id)
        )
      );
    const enrollments = await tx
      .select({ id: chatE2eeEnrollments.id })
      .from(chatE2eeEnrollments)
      .where(lt(chatE2eeEnrollments.expiresAt, now))
      .limit(limit);
    if (enrollments.length)
      await tx.delete(chatE2eeEnrollments).where(
        inArray(
          chatE2eeEnrollments.id,
          enrollments.map((row) => row.id)
        )
      );
    const nonces = await tx
      .select({ id: chatE2eeRequestNonces.id })
      .from(chatE2eeRequestNonces)
      .where(lt(chatE2eeRequestNonces.expiresAt, now))
      .limit(limit);
    if (nonces.length)
      await tx.delete(chatE2eeRequestNonces).where(
        inArray(
          chatE2eeRequestNonces.id,
          nonces.map((row) => row.id)
        )
      );
    const packages = await tx
      .select({ id: chatE2eeKeyPackages.id })
      .from(chatE2eeKeyPackages)
      .where(
        or(
          and(
            isNull(chatE2eeKeyPackages.claimedAt),
            lt(chatE2eeKeyPackages.expiresAt, now)
          ),
          sql`EXISTS (SELECT 1 FROM chat_e2ee_devices d WHERE d.id = ${chatE2eeKeyPackages.deviceId}
        AND (d.revoked_at IS NOT NULL OR d.expires_at <= now()))`
        )
      )
      .limit(limit);
    if (packages.length)
      await tx.delete(chatE2eeKeyPackages).where(
        inArray(
          chatE2eeKeyPackages.id,
          packages.map((row) => row.id)
        )
      );
    const welcomes = await tx
      .select({ id: chatE2eeWelcomes.id })
      .from(chatE2eeWelcomes)
      .where(
        sql`EXISTS (SELECT 1 FROM chat_e2ee_devices d WHERE d.id = ${chatE2eeWelcomes.deviceId}
        AND (d.revoked_at IS NOT NULL OR d.expires_at <= now()))`
      )
      .limit(limit);
    if (welcomes.length)
      await tx.delete(chatE2eeWelcomes).where(
        inArray(
          chatE2eeWelcomes.id,
          welcomes.map((row) => row.id)
        )
      );
    return {
      devicesExpired: expiredDevices.length,
      applicationFramesPurged: frames.length,
      mediaExpired: media.length,
      backupsExpired: backups.length,
      enrollmentsExpired: enrollments.length,
      noncesExpired: nonces.length,
      keyPackagesExpired: packages.length,
      welcomesExpired: welcomes.length,
      objectsDeleted: 0,
      objectsDeferred: 0,
    };
  });
  const pending = await db
    .select({ objectKey: chatE2eeObjectDeletions.objectKey })
    .from(chatE2eeObjectDeletions)
    .orderBy(asc(chatE2eeObjectDeletions.createdAt))
    .limit(limit);
  if (!pending.length) return report;
  const keys = pending.map((row) => row.objectKey);
  try {
    await privateBucket().delete(keys);
  } catch (error) {
    await db
      .update(chatE2eeObjectDeletions)
      .set({ attempts: sql`${chatE2eeObjectDeletions.attempts} + 1` })
      .where(inArray(chatE2eeObjectDeletions.objectKey, keys));
    console.error(
      '[encrypted-chat-retention] private object deletion deferred',
      {
        count: keys.length,
        error: error instanceof Error ? error.name : 'UnknownError',
      }
    );
    return { ...report, objectsDeferred: keys.length };
  }
  await db
    .delete(chatE2eeObjectDeletions)
    .where(inArray(chatE2eeObjectDeletions.objectKey, keys));
  return { ...report, objectsDeleted: keys.length };
}
