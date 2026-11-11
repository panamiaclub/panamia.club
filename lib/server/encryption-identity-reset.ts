import { and, count, eq, gt, inArray, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  chatE2eeBackups,
  chatE2eeDevices,
  chatE2eeIdentities,
  chatE2eeKeyPackages,
} from '@/lib/schema';
import {
  deviceCertificateSchema,
  deviceCredential,
  E2EE_DEVICE_MS,
  E2EE_REQUEST_MS,
  sha256,
  signedStatementSchema,
} from '@/lib/e2ee/identity-contract';
import { fromBase64 } from '@/lib/e2ee/encoding';
import {
  backupContext,
  identityResetClaimsSchema,
  identityResetInputSchema,
} from '@/lib/e2ee/recovery-contract';
import {
  encryptionFail,
  encryptionInput,
  encryptionProfile,
  requireEncryptionEnabled,
  verifiedStatement,
  type EncryptionScope,
  type EncryptionTx,
} from './encryption-context';
import { finalizePrivateObjectWrite, privateBucket } from './encryption-media';

/** Explicit future-only reset, not account-login enrollment or history recovery.
 * The changed root must be reverified by peers; old MLS devices are all revoked. */
export async function resetEncryptionIdentity(
  scope: EncryptionScope,
  value: unknown
) {
  requireEncryptionEnabled();
  const input = encryptionInput(identityResetInputSchema, value);
  const claims = await verifiedStatement(
    'identity-reset',
    input.statement,
    input.rootPublicKey,
    identityResetClaimsSchema
  );
  const certificate = await verifiedStatement(
    'device-certificate',
    input.certificate,
    input.rootPublicKey,
    deviceCertificateSchema
  );
  const bytes = new TextEncoder().encode(JSON.stringify(input.record));
  let ciphertext: Uint8Array;
  try {
    ciphertext = fromBase64(input.record.ciphertext, 64 * 1024);
  } catch {
    encryptionFail(
      400,
      'INVALID_BACKUP',
      'The reset requires a bounded canonical encrypted identity backup.'
    );
  }
  const result = {
    requestId: claims.requestId,
    rootPublicKey: claims.rootPublicKey,
    rootVersion: claims.rootVersion,
    deviceId: claims.deviceId,
    stateHash: claims.stateHash,
  };
  if (
    claims.userId !== scope.userId ||
    claims.profileId !== scope.profileId ||
    claims.actorId !== scope.actorId ||
    claims.rootPublicKey !== input.rootPublicKey ||
    claims.rootPublicKey === claims.previousRootPublicKey ||
    claims.rootVersion !== claims.previousRootVersion + 1 ||
    certificate.profileId !== scope.profileId ||
    certificate.actorId !== scope.actorId ||
    certificate.userId !== scope.userId ||
    certificate.deviceId !== claims.deviceId ||
    certificate.requestId !== claims.requestId ||
    certificate.rootVersion !== claims.rootVersion ||
    certificate.signingKey === input.rootPublicKey ||
    certificate.expiresAt <= Date.now() ||
    certificate.expiresAt - certificate.issuedAt > E2EE_DEVICE_MS ||
    Math.abs(certificate.issuedAt - claims.issuedAt) > 10 * 60_000 ||
    (await sha256(
      new TextEncoder().encode(
        JSON.stringify(signedStatementSchema.parse(input.certificate))
      )
    )) !== claims.certificateSha256 ||
    input.record.purpose !== 'identity-backup' ||
    input.record.context !==
      backupContext(scope, claims.rootVersion, 'identity', null) ||
    ciphertext.length < 16 ||
    (await sha256(bytes)) !== claims.backupSha256
  )
    encryptionFail(
      400,
      'IDENTITY_RESET_MISMATCH',
      'The explicit reset must bind its exact owner, fresh device, new identity and encrypted recovery backup.'
    );

  const authorize = async (tx: EncryptionTx) => {
    const access = await encryptionProfile(tx, scope, true);
    if (!access.owner)
      encryptionFail(
        403,
        'OWNER_APPROVAL_REQUIRED',
        'Only a current profile owner can explicitly reset encryption.'
      );
    const [identity] = await tx
      .select()
      .from(chatE2eeIdentities)
      .where(eq(chatE2eeIdentities.profileId, scope.profileId))
      .for('update');
    if (!identity)
      encryptionFail(
        404,
        'IDENTITY_UNAVAILABLE',
        'Set up the profile encryption identity first.'
      );
    if (
      identity.lastResetId === claims.requestId &&
      identity.rootPublicKey === claims.rootPublicKey &&
      identity.rootVersion === claims.rootVersion
    ) {
      const [device] = await tx
        .select({ id: chatE2eeDevices.id })
        .from(chatE2eeDevices)
        .where(
          and(
            eq(chatE2eeDevices.id, claims.deviceId),
            eq(chatE2eeDevices.profileId, scope.profileId),
            eq(chatE2eeDevices.checkpointId, claims.requestId),
            eq(chatE2eeDevices.stateHash, claims.stateHash)
          )
        );
      if (!device)
        encryptionFail(
          409,
          'IDENTITY_RESET_CHANGED',
          'This identity reset has already advanced. Open its current device state.'
        );
      return true;
    }
    if (
      identity.rootVersion !== claims.previousRootVersion ||
      identity.rootPublicKey !== claims.previousRootPublicKey
    )
      encryptionFail(
        409,
        'IDENTITY_KEY_CHANGED',
        'The previous profile identity changed before this reset.'
      );
    if (Math.abs(claims.issuedAt - Date.now()) > E2EE_REQUEST_MS)
      encryptionFail(
        400,
        'IDENTITY_RESET_EXPIRED',
        'Confirm a fresh explicit encryption reset.'
      );
    if (
      identity.lastResetAt &&
      identity.lastResetAt.getTime() > Date.now() - 86_400_000
    )
      encryptionFail(
        429,
        'IDENTITY_RESET_COOLDOWN',
        'Encryption identities can be reset at most once in 24 hours.'
      );
    const [rootReuse] = await tx
      .select({ id: chatE2eeIdentities.profileId })
      .from(chatE2eeIdentities)
      .where(
        inArray(chatE2eeIdentities.rootPublicKey, [
          claims.rootPublicKey,
          certificate.signingKey,
        ])
      );
    const [deviceReuse] = await tx
      .select({ id: chatE2eeDevices.id })
      .from(chatE2eeDevices)
      .where(
        or(
          eq(chatE2eeDevices.id, claims.deviceId),
          inArray(chatE2eeDevices.signingKey, [
            claims.rootPublicKey,
            certificate.signingKey,
          ])
        )
      );
    if (rootReuse || deviceReuse)
      encryptionFail(
        409,
        'KEY_SCOPE_REUSE',
        'An identity reset requires fresh, profile-specific root and device keys.'
      );
    return false;
  };
  const completed = await db.transaction(async (tx) => {
    if (await authorize(tx)) return true;
    const [reserved] = await tx
      .select()
      .from(chatE2eeBackups)
      .where(eq(chatE2eeBackups.id, claims.backupId))
      .for('update');
    if (reserved) {
      if (
        reserved.userId !== scope.userId ||
        reserved.profileId !== scope.profileId ||
        reserved.sha256 !== claims.backupSha256 ||
        reserved.rootVersion !== claims.rootVersion ||
        reserved.uploaderDeviceId !== claims.deviceId ||
        reserved.state !== 'reserved'
      )
        encryptionFail(
          409,
          'BACKUP_ID_USED',
          'The identity reset backup changed.'
        );
    } else {
      const [pending] = await tx
        .select({ total: count() })
        .from(chatE2eeBackups)
        .where(
          and(
            eq(chatE2eeBackups.userId, scope.userId),
            eq(chatE2eeBackups.profileId, scope.profileId),
            eq(chatE2eeBackups.state, 'reserved'),
            gt(chatE2eeBackups.expiresAt, new Date())
          )
        );
      if (pending.total >= 3)
        encryptionFail(
          429,
          'PENDING_BACKUP_LIMIT',
          'Finish or expire pending identity resets before starting another.'
        );
      await tx.insert(chatE2eeBackups).values({
        id: claims.backupId,
        userId: scope.userId,
        profileId: scope.profileId,
        uploaderDeviceId: claims.deviceId,
        rootVersion: claims.rootVersion,
        kind: 'identity',
        slot: `identity:${claims.rootVersion}`,
        objectKey: `backups/${claims.backupId}`,
        byteLength: bytes.length,
        sha256: claims.backupSha256,
        expiresAt: new Date(Date.now() + 86_400_000),
      });
    }
    return false;
  });
  if (completed) return result;
  await privateBucket().put(`backups/${claims.backupId}`, bytes, {
    httpMetadata: { contentType: 'application/octet-stream' },
  });
  return finalizePrivateObjectWrite(`backups/${claims.backupId}`, () =>
    db.transaction(async (tx) => {
      if (await authorize(tx)) return result;
      const previous = await tx
        .select({ id: chatE2eeDevices.id })
        .from(chatE2eeDevices)
        .where(eq(chatE2eeDevices.profileId, scope.profileId));
      await tx
        .update(chatE2eeDevices)
        .set({ revokedAt: new Date() })
        .where(eq(chatE2eeDevices.profileId, scope.profileId));
      if (previous.length)
        await tx.delete(chatE2eeKeyPackages).where(
          inArray(
            chatE2eeKeyPackages.deviceId,
            previous.map((device) => device.id)
          )
        );
      await tx
        .update(chatE2eeIdentities)
        .set({
          rootPublicKey: claims.rootPublicKey,
          rootVersion: claims.rootVersion,
          rotationRequired: false,
          encryptionRequired: true,
          lastResetId: claims.requestId,
          lastResetAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(chatE2eeIdentities.profileId, scope.profileId));
      await tx.insert(chatE2eeDevices).values({
        id: claims.deviceId,
        profileId: scope.profileId,
        userId: scope.userId,
        signingKey: certificate.signingKey,
        credential: deviceCredential(certificate),
        certificate: input.certificate,
        rootVersion: claims.rootVersion,
        stateHash: claims.stateHash,
        checkpointId: claims.requestId,
        expiresAt: new Date(certificate.expiresAt),
      });
      await tx
        .delete(chatE2eeBackups)
        .where(
          and(
            eq(chatE2eeBackups.profileId, scope.profileId),
            eq(chatE2eeBackups.kind, 'identity'),
            lt(chatE2eeBackups.rootVersion, claims.rootVersion)
          )
        );
      await tx
        .update(chatE2eeBackups)
        .set({ state: 'stored', expiresAt: null })
        .where(eq(chatE2eeBackups.id, claims.backupId));
      return result;
    })
  );
}
