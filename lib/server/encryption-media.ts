import { and, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  chatE2eeMedia,
  chatE2eeEvents,
  chatE2eeWelcomes,
  chatE2eeBackups,
  chatE2eeBackupMedia,
  chatE2eeObjectDeletions,
} from '@/lib/schema';
import { getPrivateChatStorage } from '@/lib/r2';
import { E2EE_MAX_MEDIA_BYTES } from '@/lib/e2ee/crypto-format';
import { sha256, sha256Schema } from '@/lib/e2ee/identity-contract';
import { getHiddenActorIds } from '@/lib/federation/wrappers/block-filter';
import {
  authorizeEncryptionDevice,
  encryptionFail,
  encryptionInput,
  type EncryptionTransport,
} from './encryption-context';
import { isRoomDevice, ownDirectory, roomAccess } from './encryption-rooms';

const reservationSchema = z
  .object({
    id: z.uuid(),
    roomId: z.uuid(),
    byteLength: z
      .number()
      .int()
      .min(17)
      .max(E2EE_MAX_MEDIA_BYTES + 16),
    sha256: sha256Schema,
  })
  .strict();

export function privateBucket() {
  const bucket = getPrivateChatStorage();
  if (!bucket)
    encryptionFail(
      503,
      'PRIVATE_STORAGE_UNAVAILABLE',
      'Private encrypted storage is unavailable. Public media storage cannot be used.'
    );
  return bucket;
}

export async function finalizePrivateObjectWrite<T>(
  objectKey: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (failure) {
    try {
      const [media, backups] = await Promise.all([
        db
          .select({ id: chatE2eeMedia.id })
          .from(chatE2eeMedia)
          .where(eq(chatE2eeMedia.objectKey, objectKey))
          .limit(1),
        db
          .select({ id: chatE2eeBackups.id })
          .from(chatE2eeBackups)
          .where(eq(chatE2eeBackups.objectKey, objectKey))
          .limit(1),
      ]);
      if (!media.length && !backups.length)
        await db
          .insert(chatE2eeObjectDeletions)
          .values({ objectKey })
          .onConflictDoNothing();
    } catch (trackingFailure) {
      console.error(
        '[encrypted-chat] private object finalization tracking failed',
        {
          error:
            trackingFailure instanceof Error
              ? trackingFailure.name
              : 'UnknownError',
        }
      );
      throw new AggregateError(
        [failure, trackingFailure],
        'Private object finalization and cleanup tracking failed.'
      );
    }
    throw failure;
  }
}

export async function reserveEncryptedMedia(
  transport: EncryptionTransport,
  value: unknown
) {
  const input = encryptionInput(reservationSchema, value);
  privateBucket();
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected,
      true
    );
    await ownDirectory(tx, device);
    const { room } = await roomAccess(tx, device, input.roomId);
    if (!isRoomDevice(room, device))
      encryptionFail(
        409,
        'MEMBERSHIP_UPDATE_PENDING',
        'Join the secure conversation before attaching media.'
      );
    const [existing] = await tx
      .select()
      .from(chatE2eeMedia)
      .where(eq(chatE2eeMedia.id, input.id));
    if (existing) {
      if (
        existing.roomId !== input.roomId ||
        existing.uploaderDeviceId !== device.deviceId ||
        existing.byteLength !== input.byteLength ||
        existing.sha256 !== input.sha256 ||
        existing.state === 'deleting' ||
        existing.expiresAt.getTime() <= Date.now()
      )
        encryptionFail(
          409,
          'MEDIA_ID_USED',
          'An encrypted-media retry must contain its original scope and bytes.'
        );
      return { id: existing.id, state: existing.state };
    }
    const [pending] = await tx
      .select({
        bytes: sql<number>`COALESCE(SUM(${chatE2eeMedia.byteLength}), 0)::integer`,
      })
      .from(chatE2eeMedia)
      .where(
        and(
          eq(chatE2eeMedia.uploaderDeviceId, device.deviceId),
          inArray(chatE2eeMedia.state, ['reserved', 'stored']),
          gt(chatE2eeMedia.expiresAt, new Date())
        )
      );
    if (pending.bytes + input.byteLength > 4 * (E2EE_MAX_MEDIA_BYTES + 16))
      encryptionFail(
        429,
        'PENDING_MEDIA_LIMIT',
        'Send or discard pending encrypted attachments before uploading more.'
      );
    await tx.insert(chatE2eeMedia).values({
      ...input,
      uploaderDeviceId: device.deviceId,
      objectKey: `media/${room.id}/${input.id}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    return { id: input.id, state: 'reserved' };
  });
}

export async function uploadEncryptedMedia(
  transport: EncryptionTransport,
  mediaId: string,
  bytes: Uint8Array
) {
  encryptionInput(z.uuid(), mediaId);
  if (bytes.length < 17 || bytes.length > E2EE_MAX_MEDIA_BYTES + 16)
    encryptionFail(
      413,
      'MEDIA_TOO_LARGE',
      'Encrypted attachments must be 10 MB or less before encryption.'
    );
  const digest = await sha256(bytes);
  if (digest !== transport.expected.bodySha256)
    encryptionFail(
      400,
      'MEDIA_DIGEST_MISMATCH',
      'The upload does not match the signed device request.'
    );
  const bucket = privateBucket();
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    await ownDirectory(tx, device);
    const [hint] = await tx
      .select()
      .from(chatE2eeMedia)
      .where(eq(chatE2eeMedia.id, mediaId));
    if (!hint || hint.uploaderDeviceId !== device.deviceId)
      encryptionFail(
        404,
        'MEDIA_UNAVAILABLE',
        'This encrypted attachment is unavailable.'
      );
    const { room } = await roomAccess(tx, device, hint.roomId);
    if (!isRoomDevice(room, device))
      encryptionFail(
        409,
        'MEMBERSHIP_UPDATE_PENDING',
        'Join the current secure conversation before uploading.'
      );
    const [media] = await tx
      .select()
      .from(chatE2eeMedia)
      .where(eq(chatE2eeMedia.id, mediaId))
      .for('update');
    if (
      !media ||
      media.state === 'deleting' ||
      media.expiresAt.getTime() <= Date.now() ||
      media.byteLength !== bytes.length ||
      media.sha256 !== digest
    )
      encryptionFail(
        409,
        'MEDIA_CHANGED',
        'The encrypted upload does not match its reserved bytes or lifetime.'
      );
    if (media.state === 'reserved') {
      await bucket.put(media.objectKey, bytes, {
        httpMetadata: { contentType: 'application/octet-stream' },
      });
      await tx
        .update(chatE2eeMedia)
        .set({ state: 'stored' })
        .where(eq(chatE2eeMedia.id, mediaId));
    }
    return { id: mediaId, stored: true };
  });
}

export async function readEncryptedMedia(
  transport: EncryptionTransport,
  mediaId: string,
  backupId?: string
) {
  encryptionInput(z.uuid(), mediaId);
  if (backupId !== undefined) encryptionInput(z.uuid(), backupId);
  const bucket = privateBucket();
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    await ownDirectory(tx, device);
    const [media] = await tx
      .select()
      .from(chatE2eeMedia)
      .where(
        and(
          eq(chatE2eeMedia.id, mediaId),
          eq(chatE2eeMedia.state, 'bound'),
          gt(chatE2eeMedia.expiresAt, new Date())
        )
      );
    if (!media?.messageId)
      encryptionFail(
        404,
        'MEDIA_UNAVAILABLE',
        'This encrypted attachment is unavailable.'
      );
    const access = await roomAccess(tx, device, media.roomId);
    const [event] = await tx
      .select()
      .from(chatE2eeEvents)
      .where(
        and(
          eq(chatE2eeEvents.id, media.messageId),
          eq(chatE2eeEvents.roomId, media.roomId),
          eq(chatE2eeEvents.kind, 'message'),
          isNull(chatE2eeEvents.deletedAt),
          gt(chatE2eeEvents.expiresAt, new Date())
        )
      );
    const [welcome] = await tx
      .select({ joinedSequence: chatE2eeWelcomes.joinedSequence })
      .from(chatE2eeWelcomes)
      .where(
        and(
          eq(chatE2eeWelcomes.roomId, media.roomId),
          eq(
            chatE2eeWelcomes.cryptoGroupId,
            event?.cryptoGroupId ?? access.room.cryptoGroupId
          ),
          eq(chatE2eeWelcomes.deviceId, device.deviceId)
        )
      )
      .orderBy(sql`${chatE2eeWelcomes.joinedSequence} DESC`)
      .limit(1);
    const joined =
      welcome?.joinedSequence ??
      (access.room.founderDeviceId === device.deviceId ? 0 : null);
    let recovered = false;
    let originalSessionMember = false;
    if (event && event.cryptoGroupId !== access.room.cryptoGroupId) {
      const [transition] = await tx
        .select({ roster: chatE2eeEvents.nextRoster })
        .from(chatE2eeEvents)
        .where(
          and(
            eq(chatE2eeEvents.roomId, media.roomId),
            eq(chatE2eeEvents.cryptoGroupId, event.cryptoGroupId),
            eq(chatE2eeEvents.kind, 'commit'),
            lt(chatE2eeEvents.sequence, event.sequence)
          )
        )
        .orderBy(desc(chatE2eeEvents.sequence))
        .limit(1);
      originalSessionMember =
        event.senderDeviceId === device.deviceId ||
        !!transition?.roster?.some(
          (entry) =>
            entry.deviceId === device.deviceId &&
            entry.signingKey === device.signingKey &&
            entry.credential === device.credential
        );
    }
    if (backupId !== undefined) {
      const [coverage] = await tx
        .select({ id: chatE2eeBackupMedia.id })
        .from(chatE2eeBackupMedia)
        .innerJoin(
          chatE2eeBackups,
          eq(chatE2eeBackups.id, chatE2eeBackupMedia.backupId)
        )
        .where(
          and(
            eq(chatE2eeBackups.id, backupId),
            eq(chatE2eeBackupMedia.mediaId, media.id),
            eq(chatE2eeBackups.userId, device.userId),
            eq(chatE2eeBackups.profileId, device.profileId),
            eq(chatE2eeBackups.roomId, media.roomId),
            eq(chatE2eeBackups.kind, 'history'),
            eq(chatE2eeBackups.state, 'stored'),
            gt(chatE2eeBackups.expiresAt, new Date())
          )
        );
      if (!coverage)
        encryptionFail(
          404,
          'MEDIA_UNAVAILABLE',
          'This encrypted attachment is unavailable.'
        );
      recovered = true;
    }
    if (
      !event ||
      (!recovered &&
        !originalSessionMember &&
        (!isRoomDevice(access.room, device) ||
          joined === null ||
          event.sequence <= joined ||
          event.cryptoGroupId !== access.room.cryptoGroupId)) ||
      event.sequence < access.hiddenBeforeSequence ||
      (await getHiddenActorIds(device.actorId, tx)).includes(
        event.senderActorId
      )
    )
      encryptionFail(
        404,
        'MEDIA_UNAVAILABLE',
        'This encrypted attachment is unavailable.'
      );
    const object = await bucket.get(media.objectKey);
    if (!object)
      encryptionFail(
        404,
        'MEDIA_UNAVAILABLE',
        'This encrypted attachment is unavailable.'
      );
    return new Response(await object.arrayBuffer(), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="encrypted.bin"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}

export async function discardEncryptedMedia(
  transport: EncryptionTransport,
  mediaId: string
) {
  encryptionInput(z.uuid(), mediaId);
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    const [media] = await tx
      .select()
      .from(chatE2eeMedia)
      .where(
        and(
          eq(chatE2eeMedia.id, mediaId),
          eq(chatE2eeMedia.uploaderDeviceId, device.deviceId)
        )
      )
      .for('update');
    if (!media || media.messageId)
      encryptionFail(
        404,
        'MEDIA_UNAVAILABLE',
        'This pending encrypted attachment is unavailable.'
      );
    await tx.delete(chatE2eeMedia).where(eq(chatE2eeMedia.id, mediaId));
    return { discarded: true, id: mediaId };
  });
}
