import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  chatE2eeBackups,
  chatE2eeBackupMedia,
  chatE2eeDevices,
  chatE2eeIdentities,
  chatE2eeMedia,
  chatE2eeEvents,
  chatE2eeWelcomes,
} from '@/lib/schema';
import { encryptedRecordSchema } from '@/lib/e2ee/crypto-format';
import { fromBase64, toBase64 } from '@/lib/e2ee/encoding';
import { sha256, E2EE_REQUEST_MS } from '@/lib/e2ee/identity-contract';
import {
  activationSchema,
  backupAttestationSchema,
  backupContext,
  uploadBackupSchema,
  E2EE_MAX_BACKUP_BYTES,
} from '@/lib/e2ee/recovery-contract';
import { E2EE_MESSAGE_MS } from '@/lib/e2ee/room-contract';
import {
  authorizeEncryptionDevice,
  encryptionFail,
  encryptionInput,
  encryptionProfile,
  requireEncryptionEnabled,
  verifiedStatement,
  type DeviceContext,
  type EncryptionScope,
  type EncryptionTransport,
  type EncryptionTx,
} from './encryption-context';
import { isRoomDevice, roomAccess } from './encryption-rooms';
import { finalizePrivateObjectWrite, privateBucket } from './encryption-media';

async function stillApproved(tx: EncryptionTx, device: DeviceContext) {
  if (device.stateHash === null)
    encryptionFail(
      409,
      'DEVICE_CHECKPOINT_REQUIRED',
      'The device state must be checkpointed.'
    );
  const access = await encryptionProfile(tx, device);
  const [current] = await tx
    .select({ id: chatE2eeDevices.id })
    .from(chatE2eeDevices)
    .innerJoin(
      chatE2eeIdentities,
      eq(chatE2eeIdentities.profileId, chatE2eeDevices.profileId)
    )
    .where(
      and(
        eq(chatE2eeDevices.id, device.deviceId),
        eq(chatE2eeDevices.userId, device.userId),
        eq(chatE2eeDevices.profileId, device.profileId),
        eq(chatE2eeDevices.rootVersion, device.rootVersion),
        eq(chatE2eeIdentities.rootVersion, device.rootVersion),
        isNull(chatE2eeDevices.revokedAt),
        gt(chatE2eeDevices.expiresAt, new Date()),
        eq(chatE2eeDevices.stateHash, device.stateHash)
      )
    )
    .for('share', { of: chatE2eeDevices });
  if (!current)
    encryptionFail(
      403,
      'DEVICE_APPROVAL_REQUIRED',
      'This approved device changed while its backup was uploading.'
    );
  return access;
}

function backupMetadata(row: typeof chatE2eeBackups.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind,
    rootVersion: row.rootVersion,
    roomId: row.roomId,
    sha256: row.sha256,
    byteLength: row.byteLength,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

export async function uploadEncryptionBackup(
  transport: EncryptionTransport,
  value: unknown
) {
  const input = encryptionInput(uploadBackupSchema, value);
  if (
    input.record.purpose !== `${input.kind}-backup` ||
    input.record.context !==
      backupContext(
        transport.scope,
        input.rootVersion,
        input.kind,
        input.roomId
      ) ||
    (input.kind === 'identity' &&
      (input.roomId !== null || input.mediaIds.length)) ||
    (input.kind === 'history' &&
      (input.roomId === null || input.rootAttestation !== null)) ||
    new Set(input.mediaIds).size !== input.mediaIds.length
  )
    encryptionFail(
      400,
      'BACKUP_SCOPE_MISMATCH',
      'The encrypted backup must bind its exact account, profile and purpose.'
    );
  let encodedCiphertext: Uint8Array;
  try {
    encodedCiphertext = fromBase64(
      input.record.ciphertext,
      E2EE_MAX_BACKUP_BYTES
    );
  } catch {
    encryptionFail(
      413,
      'BACKUP_TOO_LARGE',
      'This encrypted history backup exceeds its supported size.'
    );
  }
  if (
    encodedCiphertext.length < 16 ||
    (input.kind === 'identity' && encodedCiphertext.length > 64 * 1024)
  )
    encryptionFail(400, 'INVALID_BACKUP', 'Invalid encrypted backup size.');
  const bytes = new TextEncoder().encode(
    JSON.stringify(encryptedRecordSchema.parse(input.record))
  );
  const digest = await sha256(bytes);
  const bucket = privateBucket();
  const prepared = await db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected,
      true
    );
    if (device.stateHash === null)
      encryptionFail(
        409,
        'DEVICE_CHECKPOINT_REQUIRED',
        'Checkpoint this device before uploading recovery material.'
      );
    const access = await encryptionProfile(tx, transport.scope);
    const [identity] = await tx
      .select()
      .from(chatE2eeIdentities)
      .where(eq(chatE2eeIdentities.profileId, device.profileId));
    if (!identity || identity.rootVersion !== input.rootVersion)
      encryptionFail(
        409,
        'IDENTITY_KEY_CHANGED',
        'This backup belongs to a different profile identity version.'
      );
    if (input.kind === 'identity') {
      if (!access.owner || !input.rootAttestation)
        encryptionFail(
          403,
          'OWNER_APPROVAL_REQUIRED',
          'An owner-held profile key must authorize identity backups.'
        );
      const signed = await verifiedStatement(
        'identity-backup',
        input.rootAttestation,
        identity.rootPublicKey,
        backupAttestationSchema
      );
      if (
        signed.userId !== device.userId ||
        signed.profileId !== device.profileId ||
        signed.actorId !== device.actorId ||
        signed.rootVersion !== input.rootVersion ||
        signed.backupId !== input.id ||
        signed.sha256 !== digest ||
        Math.abs(signed.issuedAt - Date.now()) > E2EE_REQUEST_MS
      )
        encryptionFail(
          400,
          'BACKUP_PROOF_MISMATCH',
          'The identity-backup proof does not match these exact encrypted bytes.'
        );
    } else {
      if (!input.roomId)
        encryptionFail(
          400,
          'ROOM_REQUIRED',
          'A history backup requires its conversation.'
        );
      const access = await roomAccess(tx, device, input.roomId);
      if (!isRoomDevice(access.room, device))
        encryptionFail(
          409,
          'MEMBERSHIP_UPDATE_PENDING',
          'Join the conversation before creating its backup.'
        );
      if (input.mediaIds.length) {
        const [welcome] = await tx
          .select({ sequence: chatE2eeWelcomes.joinedSequence })
          .from(chatE2eeWelcomes)
          .where(
            and(
              eq(chatE2eeWelcomes.roomId, input.roomId),
              eq(chatE2eeWelcomes.deviceId, device.deviceId),
              eq(chatE2eeWelcomes.cryptoGroupId, access.room.cryptoGroupId)
            )
          )
          .orderBy(desc(chatE2eeWelcomes.joinedSequence))
          .limit(1);
        const joined =
          welcome?.sequence ??
          (access.room.founderDeviceId === device.deviceId ? 0 : null);
        if (joined === null)
          encryptionFail(
            409,
            'WELCOME_REQUIRED',
            'An authenticated welcome is required.'
          );
        const media = await tx
          .select({ id: chatE2eeMedia.id })
          .from(chatE2eeMedia)
          .innerJoin(
            chatE2eeEvents,
            eq(chatE2eeEvents.id, chatE2eeMedia.messageId)
          )
          .where(
            and(
              inArray(chatE2eeMedia.id, input.mediaIds),
              eq(chatE2eeMedia.roomId, input.roomId),
              eq(chatE2eeMedia.state, 'bound'),
              gt(chatE2eeMedia.expiresAt, new Date()),
              gt(chatE2eeEvents.expiresAt, new Date()),
              isNull(chatE2eeEvents.deletedAt),
              sql`${chatE2eeEvents.sequence} >= ${access.hiddenBeforeSequence}`,
              or(
                gt(chatE2eeEvents.sequence, joined),
                sql`EXISTS (
              SELECT 1 FROM chat_e2ee_backup_media c
              JOIN chat_e2ee_backups b ON b.id = c.backup_id
              WHERE c.media_id = ${chatE2eeMedia.id} AND b.user_id = ${device.userId}
                AND b.profile_id = ${device.profileId} AND b.state = 'stored'
                AND (b.expires_at IS NULL OR b.expires_at > now())
            )`
              )
            )
          );
        if (media.length !== input.mediaIds.length)
          encryptionFail(
            403,
            'BACKUP_MEDIA_FORBIDDEN',
            'Only retained media already authorized for this account can be backed up.'
          );
      }
    }
    const [previous] = await tx
      .select()
      .from(chatE2eeBackups)
      .where(eq(chatE2eeBackups.id, input.id));
    if (previous) {
      if (
        previous.userId !== device.userId ||
        previous.profileId !== device.profileId ||
        previous.sha256 !== digest ||
        previous.kind !== input.kind ||
        previous.roomId !== input.roomId ||
        previous.rootVersion !== input.rootVersion
      )
        encryptionFail(
          409,
          'BACKUP_ID_USED',
          'A backup retry must contain its original encrypted bytes and scope.'
        );
      return { device, row: previous };
    }
    const [pending] = await tx
      .select({ total: count() })
      .from(chatE2eeBackups)
      .where(
        and(
          eq(chatE2eeBackups.userId, device.userId),
          eq(chatE2eeBackups.profileId, device.profileId),
          eq(chatE2eeBackups.state, 'reserved'),
          gt(chatE2eeBackups.expiresAt, new Date())
        )
      );
    if (pending.total >= 3)
      encryptionFail(
        429,
        'PENDING_BACKUP_LIMIT',
        'Finish or discard pending encrypted backups first.'
      );
    const [row] = await tx
      .insert(chatE2eeBackups)
      .values({
        id: input.id,
        userId: device.userId,
        profileId: device.profileId,
        uploaderDeviceId: device.deviceId,
        rootVersion: input.rootVersion,
        kind: input.kind,
        slot:
          input.kind === 'identity'
            ? `identity:${input.rootVersion}`
            : `history:${input.roomId}:${input.rootVersion}`,
        roomId: input.roomId,
        objectKey: `backups/${input.id}`,
        byteLength: bytes.length,
        sha256: digest,
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    return { device, row };
  });
  if (prepared.row.state === 'stored') return backupMetadata(prepared.row);
  await bucket.put(prepared.row.objectKey, bytes, {
    httpMetadata: { contentType: 'application/octet-stream' },
  });
  return finalizePrivateObjectWrite(prepared.row.objectKey, () =>
    db.transaction(async (tx) => {
      const access = await stillApproved(tx, prepared.device);
      if (input.kind === 'identity' && !access.owner)
        encryptionFail(
          403,
          'OWNER_APPROVAL_REQUIRED',
          'Profile ownership changed before backup completion.'
        );
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`${prepared.device.userId}:${prepared.device.profileId}:${prepared.row.slot}`}))`
      );
      const [current] = await tx
        .select()
        .from(chatE2eeBackups)
        .where(eq(chatE2eeBackups.id, input.id))
        .for('update');
      if (
        !current ||
        (current.expiresAt && current.expiresAt.getTime() <= Date.now())
      )
        encryptionFail(409, 'BACKUP_EXPIRED', 'This pending backup expired.');
      if (current.state === 'stored') return backupMetadata(current);
      await tx
        .delete(chatE2eeBackups)
        .where(
          and(
            eq(chatE2eeBackups.userId, current.userId),
            eq(chatE2eeBackups.profileId, current.profileId),
            eq(chatE2eeBackups.slot, current.slot),
            eq(chatE2eeBackups.state, 'stored'),
            ne(chatE2eeBackups.id, current.id)
          )
        );
      const [stored] = await tx
        .update(chatE2eeBackups)
        .set({
          state: 'stored',
          expiresAt:
            input.kind === 'identity'
              ? null
              : new Date(Date.now() + E2EE_MESSAGE_MS),
        })
        .where(eq(chatE2eeBackups.id, current.id))
        .returning();
      if (input.mediaIds.length)
        await tx
          .insert(chatE2eeBackupMedia)
          .values(
            input.mediaIds.map((mediaId) => ({
              id: crypto.randomUUID(),
              backupId: stored.id,
              mediaId,
            }))
          )
          .onConflictDoNothing();
      return backupMetadata(stored);
    })
  );
}

export async function listEncryptionBackups(
  scope: EncryptionScope,
  cursor?: string
) {
  requireEncryptionEnabled();
  let before: { at: string; id: string } | null = null;
  if (cursor) {
    try {
      before = z
        .object({ at: z.iso.datetime(), id: z.uuid() })
        .strict()
        .parse(
          JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(
              fromBase64(cursor, 512)
            )
          )
        );
    } catch {
      encryptionFail(
        400,
        'INVALID_BACKUP_CURSOR',
        'Invalid encrypted recovery-backup cursor.'
      );
    }
  }
  return db.transaction(async (tx) => {
    await encryptionProfile(tx, scope);
    const rows = await tx
      .select()
      .from(chatE2eeBackups)
      .where(
        and(
          eq(chatE2eeBackups.userId, scope.userId),
          eq(chatE2eeBackups.profileId, scope.profileId),
          eq(chatE2eeBackups.state, 'stored'),
          or(
            isNull(chatE2eeBackups.expiresAt),
            gt(chatE2eeBackups.expiresAt, new Date())
          ),
          before
            ? or(
                lt(chatE2eeBackups.createdAt, new Date(before.at)),
                and(
                  eq(chatE2eeBackups.createdAt, new Date(before.at)),
                  lt(chatE2eeBackups.id, before.id)
                )
              )
            : undefined
        )
      )
      .orderBy(desc(chatE2eeBackups.createdAt), desc(chatE2eeBackups.id))
      .limit(101);
    const page = rows.slice(0, 100);
    const last = page.at(-1);
    return {
      backups: page.map(backupMetadata),
      nextCursor:
        rows.length > 100 && last
          ? toBase64(
              new TextEncoder().encode(
                JSON.stringify({
                  at: last.createdAt.toISOString(),
                  id: last.id,
                })
              )
            )
          : null,
    };
  });
}

export async function downloadEncryptionBackup(
  scope: EncryptionScope,
  backupId: string
) {
  requireEncryptionEnabled();
  encryptionInput(z.uuid(), backupId);
  const metadata = await db.transaction(async (tx) => {
    await encryptionProfile(tx, scope);
    const [row] = await tx
      .select()
      .from(chatE2eeBackups)
      .where(
        and(
          eq(chatE2eeBackups.id, backupId),
          eq(chatE2eeBackups.userId, scope.userId),
          eq(chatE2eeBackups.profileId, scope.profileId),
          eq(chatE2eeBackups.state, 'stored'),
          or(
            isNull(chatE2eeBackups.expiresAt),
            gt(chatE2eeBackups.expiresAt, new Date())
          )
        )
      );
    if (!row)
      encryptionFail(
        404,
        'BACKUP_UNAVAILABLE',
        'This encrypted backup is unavailable.'
      );
    return row;
  });
  const object = await privateBucket().get(metadata.objectKey);
  if (!object)
    encryptionFail(
      404,
      'BACKUP_UNAVAILABLE',
      'This encrypted backup is unavailable.'
    );
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (
    bytes.length !== metadata.byteLength ||
    (await sha256(bytes)) !== metadata.sha256
  )
    encryptionFail(
      409,
      'BACKUP_CHANGED',
      'The encrypted backup is incomplete or was changed.'
    );
  const record = encryptionInput(
    encryptedRecordSchema,
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  );
  return { ...backupMetadata(metadata), record };
}

export async function activateProfileEncryption(
  transport: EncryptionTransport,
  input: unknown
) {
  const value = encryptionInput(
    z.object({ statement: z.unknown() }).strict(),
    input
  );
  return db.transaction(async (tx) => {
    const access = await encryptionProfile(tx, transport.scope, true);
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    if (!access.owner)
      encryptionFail(
        403,
        'OWNER_APPROVAL_REQUIRED',
        'A profile owner must explicitly activate encrypted messaging.'
      );
    const [ready] = await tx
      .select({ id: chatE2eeDevices.id })
      .from(chatE2eeDevices)
      .where(
        and(
          eq(chatE2eeDevices.id, device.deviceId),
          sql`${chatE2eeDevices.readyAt} IS NOT NULL`
        )
      );
    if (!ready)
      encryptionFail(
        409,
        'PREKEYS_REQUIRED',
        'Publish this approved device prekeys before activating encryption.'
      );
    const [identity] = await tx
      .select()
      .from(chatE2eeIdentities)
      .where(eq(chatE2eeIdentities.profileId, device.profileId));
    if (!identity)
      encryptionFail(
        404,
        'IDENTITY_UNAVAILABLE',
        'Set up the profile encryption identity first.'
      );
    const proof = await verifiedStatement(
      'profile-activation',
      value.statement,
      identity.rootPublicKey,
      activationSchema
    );
    if (
      proof.userId !== device.userId ||
      proof.profileId !== device.profileId ||
      proof.actorId !== device.actorId ||
      proof.rootVersion !== identity.rootVersion ||
      proof.deviceId !== device.deviceId ||
      Math.abs(proof.issuedAt - Date.now()) > E2EE_REQUEST_MS
    )
      encryptionFail(
        400,
        'ACTIVATION_MISMATCH',
        'The activation must bind this exact profile, device and recovery backup.'
      );
    const [backup] = await tx
      .select()
      .from(chatE2eeBackups)
      .where(
        and(
          eq(chatE2eeBackups.id, proof.backupId),
          eq(chatE2eeBackups.userId, device.userId),
          eq(chatE2eeBackups.profileId, device.profileId),
          eq(chatE2eeBackups.kind, 'identity'),
          eq(chatE2eeBackups.rootVersion, identity.rootVersion),
          eq(chatE2eeBackups.state, 'stored'),
          eq(chatE2eeBackups.sha256, proof.sha256)
        )
      );
    if (!backup)
      encryptionFail(
        409,
        'RECOVERY_BACKUP_REQUIRED',
        'Save the personal recovery key and encrypted identity backup before activation.'
      );
    await tx
      .update(chatE2eeIdentities)
      .set({ encryptionRequired: true, updatedAt: new Date() })
      .where(eq(chatE2eeIdentities.profileId, device.profileId));
    return { encryptionRequired: true, rootVersion: identity.rootVersion };
  });
}
