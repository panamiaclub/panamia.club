import { and, count, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  chatE2eeDevices,
  chatE2eeEnrollments,
  chatE2eeIdentities,
  chatE2eeKeyPackages,
  profileOwners,
  profiles,
} from '@/lib/schema';
import {
  deviceCertificateSchema,
  deviceCredential,
  deviceRevocationSchema,
  enrollmentSchema,
  E2EE_DEVICE_MS,
  E2EE_ENROLLMENT_MS,
  E2EE_KEY_PACKAGE_MS,
  E2EE_MAX_DEVICES,
  E2EE_MAX_KEY_PACKAGES,
  E2EE_REQUEST_MS,
  publicKeySchema,
  sha256,
  sha256Schema,
  signedStatementSchema,
  type SignedStatement,
} from '@/lib/e2ee/identity-contract';
import { fromBase64, toBase64 } from '@/lib/e2ee/encoding';
import {
  authorizeEncryptionDevice,
  encryptionFail,
  encryptionInput,
  encryptionProfile,
  requireEncryptionEnabled,
  verifiedStatement,
  type EncryptionScope,
  type EncryptionTx,
  type ExpectedDeviceRequest,
} from './encryption-context';

const beginSchema = z
  .object({
    requestId: z.uuid(),
    deviceId: z.uuid(),
    signingKey: publicKeySchema,
  })
  .strict();
const proofSchema = z
  .object({ requestId: z.uuid(), proof: signedStatementSchema })
  .strict();
const approvalSchema = z
  .object({
    requestId: z.uuid(),
    rootPublicKey: publicKeySchema,
    certificate: signedStatementSchema,
  })
  .strict();
const revokeSchema = z.object({ statement: signedStatementSchema }).strict();
const packagesSchema = z
  .object({
    packages: z
      .array(
        z
          .object({
            id: z.uuid(),
            bytes: z.string().min(4).max(87384),
            sha256: sha256Schema,
            expiresAt: z.iso.datetime(),
          })
          .strict()
      )
      .min(1)
      .max(25),
  })
  .strict();

function publicDevice(
  device: typeof chatE2eeDevices.$inferSelect,
  prekeyCount = 0
) {
  return {
    id: device.id,
    profileId: device.profileId,
    userId: device.userId,
    signingKey: device.signingKey,
    credential: device.credential,
    certificate: device.certificate,
    rootVersion: device.rootVersion,
    stateHash: device.stateHash,
    checkpointId: device.checkpointId,
    prekeyCount,
    createdAt: device.createdAt.toISOString(),
    expiresAt: device.expiresAt.toISOString(),
    revokedAt: device.revokedAt?.toISOString() ?? null,
    readyAt: device.readyAt?.toISOString() ?? null,
    revocation: device.revocation,
  };
}

async function requesterStillAuthorized(
  tx: EncryptionTx,
  profileId: string,
  userId: string
) {
  const [profile] = await tx
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.id, profileId));
  if (profile?.userId === userId) return true;
  const [grant] = await tx
    .select({ id: profileOwners.id })
    .from(profileOwners)
    .where(
      and(
        eq(profileOwners.profileId, profileId),
        eq(profileOwners.userId, userId)
      )
    )
    .for('share');
  return !!grant;
}

export async function getEncryptionIdentity(scope: EncryptionScope) {
  requireEncryptionEnabled();
  return db.transaction(async (tx) => {
    const access = await encryptionProfile(tx, scope);
    const [identity] = await tx
      .select()
      .from(chatE2eeIdentities)
      .where(eq(chatE2eeIdentities.profileId, scope.profileId));
    const devices = await tx
      .select()
      .from(chatE2eeDevices)
      .where(eq(chatE2eeDevices.profileId, scope.profileId));
    const packages = devices.length
      ? await tx
          .select({
            deviceId: chatE2eeKeyPackages.deviceId,
            total: count(),
          })
          .from(chatE2eeKeyPackages)
          .where(
            and(
              inArray(
                chatE2eeKeyPackages.deviceId,
                devices.map((device) => device.id)
              ),
              isNull(chatE2eeKeyPackages.claimedAt),
              gt(chatE2eeKeyPackages.expiresAt, new Date())
            )
          )
          .groupBy(chatE2eeKeyPackages.deviceId)
      : [];
    const counts = new Map(
      packages.map((entry) => [entry.deviceId, entry.total])
    );
    const pending = await tx
      .select()
      .from(chatE2eeEnrollments)
      .where(
        and(
          eq(chatE2eeEnrollments.profileId, scope.profileId),
          gt(chatE2eeEnrollments.expiresAt, new Date()),
          isNull(chatE2eeEnrollments.approvedAt),
          access.owner
            ? undefined
            : eq(chatE2eeEnrollments.userId, scope.userId)
        )
      );
    return {
      profileId: scope.profileId,
      actorId: scope.actorId,
      canApprove: access.owner,
      identity: identity
        ? {
            rootPublicKey: identity.rootPublicKey,
            rootVersion: identity.rootVersion,
            encryptionRequired: identity.encryptionRequired,
            rotationRequired: identity.rotationRequired,
          }
        : null,
      devices: devices.map((device) =>
        publicDevice(device, counts.get(device.id) ?? 0)
      ),
      pending: pending.map((row) => ({
        id: row.id,
        challenge: row.challenge,
        proof: row.proof,
        expiresAt: row.expiresAt.toISOString(),
      })),
    };
  });
}

export async function beginEncryptionEnrollment(
  scope: EncryptionScope,
  input: unknown
) {
  requireEncryptionEnabled();
  const value = encryptionInput(beginSchema, input);
  fromBase64(value.signingKey, 32);
  return db.transaction(async (tx) => {
    await encryptionProfile(tx, scope, true);
    const [device] = await tx
      .select({ id: chatE2eeDevices.id })
      .from(chatE2eeDevices)
      .where(eq(chatE2eeDevices.id, value.deviceId));
    if (device)
      encryptionFail(
        409,
        'DEVICE_ID_USED',
        'Create fresh device keys; an existing or revoked device cannot be re-enrolled.'
      );
    const [previous] = await tx
      .select()
      .from(chatE2eeEnrollments)
      .where(eq(chatE2eeEnrollments.id, value.requestId));
    if (previous) {
      if (
        previous.profileId === scope.profileId &&
        previous.userId === scope.userId &&
        previous.deviceId === value.deviceId &&
        previous.challenge.signingKey === value.signingKey &&
        previous.expiresAt.getTime() > Date.now() &&
        !previous.approvedAt
      )
        return previous.challenge;
      encryptionFail(
        409,
        'ENROLLMENT_ID_USED',
        'Create a fresh enrollment request.'
      );
    }
    await tx
      .delete(chatE2eeEnrollments)
      .where(
        and(
          eq(chatE2eeEnrollments.profileId, scope.profileId),
          eq(chatE2eeEnrollments.userId, scope.userId),
          lt(chatE2eeEnrollments.expiresAt, new Date()),
          isNull(chatE2eeEnrollments.approvedAt)
        )
      );
    const [pendingCount] = await tx
      .select({ total: count() })
      .from(chatE2eeEnrollments)
      .where(
        and(
          eq(chatE2eeEnrollments.profileId, scope.profileId),
          eq(chatE2eeEnrollments.userId, scope.userId),
          isNull(chatE2eeEnrollments.approvedAt)
        )
      );
    if (pendingCount.total >= 5)
      encryptionFail(
        429,
        'ENROLLMENT_LIMIT',
        'Wait for a pending device request to expire or be approved.'
      );
    const [sameDevice] = await tx
      .select({ id: chatE2eeEnrollments.id })
      .from(chatE2eeEnrollments)
      .where(
        and(
          eq(chatE2eeEnrollments.profileId, scope.profileId),
          eq(chatE2eeEnrollments.deviceId, value.deviceId)
        )
      );
    if (sameDevice)
      encryptionFail(
        409,
        'ENROLLMENT_PENDING',
        'This device already has a pending enrollment.'
      );
    const challenge = enrollmentSchema.parse({
      version: 1,
      profileId: scope.profileId,
      actorId: scope.actorId,
      deviceId: value.deviceId,
      userId: scope.userId,
      signingKey: value.signingKey,
      requestId: value.requestId,
      nonce: toBase64(crypto.getRandomValues(new Uint8Array(32))),
      expiresAt: Date.now() + E2EE_ENROLLMENT_MS,
    });
    await tx.insert(chatE2eeEnrollments).values({
      id: value.requestId,
      profileId: scope.profileId,
      userId: scope.userId,
      deviceId: value.deviceId,
      challenge,
      expiresAt: new Date(challenge.expiresAt),
    });
    return challenge;
  });
}

export async function proveEncryptionEnrollment(
  scope: EncryptionScope,
  input: unknown
) {
  requireEncryptionEnabled();
  const value = encryptionInput(proofSchema, input);
  return db.transaction(async (tx) => {
    await encryptionProfile(tx, scope, true);
    const [enrollment] = await tx
      .select()
      .from(chatE2eeEnrollments)
      .where(
        and(
          eq(chatE2eeEnrollments.id, value.requestId),
          eq(chatE2eeEnrollments.profileId, scope.profileId),
          eq(chatE2eeEnrollments.userId, scope.userId)
        )
      )
      .for('update');
    if (
      !enrollment ||
      enrollment.approvedAt ||
      enrollment.expiresAt.getTime() <= Date.now()
    )
      encryptionFail(
        409,
        'ENROLLMENT_EXPIRED',
        'This enrollment is unavailable or expired.'
      );
    const proof = await verifiedStatement(
      'enrollment',
      value.proof,
      enrollment.challenge.signingKey,
      enrollmentSchema
    );
    if (
      JSON.stringify(proof) !==
      JSON.stringify(enrollmentSchema.parse(enrollment.challenge))
    )
      encryptionFail(
        400,
        'ENROLLMENT_MISMATCH',
        'The device proof does not match its enrollment challenge.'
      );
    await tx
      .update(chatE2eeEnrollments)
      .set({ proof: value.proof })
      .where(eq(chatE2eeEnrollments.id, enrollment.id));
    return { pendingApproval: true, requestId: enrollment.id };
  });
}

export async function approveEncryptionEnrollment(
  scope: EncryptionScope,
  input: unknown
) {
  requireEncryptionEnabled();
  const value = encryptionInput(approvalSchema, input);
  fromBase64(value.rootPublicKey, 32);
  return db.transaction(async (tx) => {
    const access = await encryptionProfile(tx, scope, true);
    if (!access.owner)
      encryptionFail(
        403,
        'OWNER_APPROVAL_REQUIRED',
        'A profile owner with its encryption authorization key must approve devices.'
      );
    const [enrollment] = await tx
      .select()
      .from(chatE2eeEnrollments)
      .where(
        and(
          eq(chatE2eeEnrollments.id, value.requestId),
          eq(chatE2eeEnrollments.profileId, scope.profileId)
        )
      )
      .for('update');
    if (!enrollment || !enrollment.proof)
      encryptionFail(
        409,
        'DEVICE_PROOF_REQUIRED',
        'The requesting device must prove ownership of its key first.'
      );
    if (
      !(await requesterStillAuthorized(tx, scope.profileId, enrollment.userId))
    )
      encryptionFail(
        403,
        'REQUESTER_ACCESS_REVOKED',
        'The requesting account no longer has access to this profile.'
      );
    const [identity] = await tx
      .select()
      .from(chatE2eeIdentities)
      .where(eq(chatE2eeIdentities.profileId, scope.profileId));
    if (identity && identity.rootPublicKey !== value.rootPublicKey)
      encryptionFail(
        409,
        'IDENTITY_KEY_CHANGED',
        'An existing profile encryption identity cannot be replaced by signing in.'
      );
    if (identity?.rotationRequired)
      encryptionFail(
        409,
        'IDENTITY_ROTATION_REQUIRED',
        'Profile ownership changed. Reset and reverify the profile encryption identity before approving devices.'
      );
    if (!identity && enrollment.userId !== scope.userId)
      encryptionFail(
        403,
        'OWNER_SETUP_REQUIRED',
        'An owner must enroll their own first device before delegating access.'
      );
    const rootVersion = identity?.rootVersion ?? 1;
    const certificate = await verifiedStatement(
      'device-certificate',
      value.certificate,
      value.rootPublicKey,
      deviceCertificateSchema
    );
    const { expiresAt: _expiresAt, ...challenge } = enrollmentSchema.parse(
      enrollment.challenge
    );
    const {
      rootVersion: _rootVersion,
      issuedAt,
      expiresAt,
      ...certified
    } = certificate;
    if (
      JSON.stringify(certified) !== JSON.stringify(challenge) ||
      certificate.rootVersion !== rootVersion ||
      certificate.profileId !== scope.profileId ||
      certificate.actorId !== scope.actorId
    )
      encryptionFail(
        400,
        'CERTIFICATE_MISMATCH',
        'The approval does not bind this exact profile, account and device.'
      );
    const [existing] = await tx
      .select()
      .from(chatE2eeDevices)
      .where(eq(chatE2eeDevices.id, enrollment.deviceId));
    if (enrollment.approvedAt && existing) {
      if (
        !existing.revokedAt &&
        existing.expiresAt.getTime() > Date.now() &&
        existing.certificate.version === value.certificate.version &&
        existing.certificate.payload === value.certificate.payload &&
        existing.certificate.signature === value.certificate.signature
      )
        return publicDevice(existing);
      encryptionFail(
        409,
        'DEVICE_ID_USED',
        'This device cannot be reactivated with an old approval.'
      );
    }
    const now = Date.now();
    if (
      enrollment.expiresAt.getTime() <= now ||
      Math.abs(issuedAt - now) > E2EE_REQUEST_MS ||
      expiresAt <= now ||
      expiresAt <= issuedAt ||
      expiresAt > issuedAt + E2EE_DEVICE_MS
    )
      encryptionFail(
        409,
        'APPROVAL_EXPIRED',
        'Create a fresh device approval.'
      );
    await verifiedStatement(
      'enrollment',
      enrollment.proof,
      certificate.signingKey,
      enrollmentSchema
    );
    if (certificate.signingKey === value.rootPublicKey)
      encryptionFail(
        400,
        'SEPARATE_KEYS_REQUIRED',
        'Profile authorization and MLS device keys must be different.'
      );
    const rootReuse = await tx
      .select({
        profileId: chatE2eeIdentities.profileId,
        rootPublicKey: chatE2eeIdentities.rootPublicKey,
      })
      .from(chatE2eeIdentities)
      .where(
        or(
          eq(chatE2eeIdentities.rootPublicKey, certificate.signingKey),
          eq(chatE2eeIdentities.rootPublicKey, value.rootPublicKey)
        )
      );
    if (
      rootReuse.some(
        (root) =>
          root.profileId !== scope.profileId ||
          root.rootPublicKey === certificate.signingKey
      )
    )
      encryptionFail(
        409,
        'KEY_SCOPE_REUSE',
        'Use separate authorization keys for each profile.'
      );
    const [deviceReuse] = await tx
      .select({ id: chatE2eeDevices.id })
      .from(chatE2eeDevices)
      .where(
        or(
          eq(chatE2eeDevices.signingKey, certificate.signingKey),
          eq(chatE2eeDevices.signingKey, value.rootPublicKey)
        )
      );
    if (deviceReuse)
      encryptionFail(
        409,
        'KEY_SCOPE_REUSE',
        'Use fresh, profile-specific device keys.'
      );
    const [deviceCount] = await tx
      .select({ total: count() })
      .from(chatE2eeDevices)
      .where(
        and(
          eq(chatE2eeDevices.profileId, scope.profileId),
          isNull(chatE2eeDevices.revokedAt),
          gt(chatE2eeDevices.expiresAt, new Date())
        )
      );
    if (deviceCount.total >= E2EE_MAX_DEVICES)
      encryptionFail(
        429,
        'DEVICE_LIMIT',
        'Revoke an unused device before approving another one.'
      );
    if (!identity)
      await tx.insert(chatE2eeIdentities).values({
        profileId: scope.profileId,
        actorId: scope.actorId,
        rootPublicKey: value.rootPublicKey,
        rootVersion,
      });
    const [device] = await tx
      .insert(chatE2eeDevices)
      .values({
        id: certificate.deviceId,
        profileId: scope.profileId,
        userId: certificate.userId,
        signingKey: certificate.signingKey,
        credential: deviceCredential(certificate),
        certificate: value.certificate,
        rootVersion,
        expiresAt: new Date(expiresAt),
      })
      .returning();
    await tx
      .update(chatE2eeEnrollments)
      .set({ approvedAt: new Date() })
      .where(eq(chatE2eeEnrollments.id, enrollment.id));
    return publicDevice(device);
  });
}

export async function revokeEncryptionDevice(
  scope: EncryptionScope,
  input: unknown
) {
  requireEncryptionEnabled();
  const value = encryptionInput(revokeSchema, input);
  return db.transaction(async (tx) => {
    const access = await encryptionProfile(tx, scope, true);
    if (!access.owner)
      encryptionFail(
        403,
        'OWNER_APPROVAL_REQUIRED',
        'A profile owner must authorize device revocation.'
      );
    const [identity] = await tx
      .select()
      .from(chatE2eeIdentities)
      .where(eq(chatE2eeIdentities.profileId, scope.profileId));
    if (!identity)
      encryptionFail(
        404,
        'IDENTITY_UNAVAILABLE',
        'No encryption identity is available.'
      );
    const statement = await verifiedStatement(
      'device-revocation',
      value.statement,
      identity.rootPublicKey,
      deviceRevocationSchema
    );
    if (
      statement.profileId !== scope.profileId ||
      statement.actorId !== scope.actorId ||
      statement.rootVersion !== identity.rootVersion ||
      Math.abs(statement.issuedAt - Date.now()) > E2EE_REQUEST_MS
    )
      encryptionFail(
        400,
        'REVOCATION_MISMATCH',
        'Create a fresh revocation for this profile.'
      );
    const [device] = await tx
      .select()
      .from(chatE2eeDevices)
      .where(
        and(
          eq(chatE2eeDevices.id, statement.deviceId),
          eq(chatE2eeDevices.profileId, scope.profileId)
        )
      )
      .for('update');
    if (!device)
      encryptionFail(
        404,
        'DEVICE_UNAVAILABLE',
        'This encryption device is unavailable.'
      );
    if (!device.revokedAt) {
      await tx
        .update(chatE2eeDevices)
        .set({ revokedAt: new Date(), revocation: value.statement })
        .where(eq(chatE2eeDevices.id, device.id));
      await tx
        .delete(chatE2eeKeyPackages)
        .where(eq(chatE2eeKeyPackages.deviceId, device.id));
    }
    return { revoked: true, deviceId: device.id };
  });
}

export async function uploadEncryptionKeyPackages(
  scope: EncryptionScope,
  proof: SignedStatement,
  expected: ExpectedDeviceRequest,
  input: unknown
) {
  requireEncryptionEnabled();
  const value = encryptionInput(packagesSchema, input);
  const now = Date.now();
  for (const item of value.packages) {
    let bytes: Uint8Array;
    try {
      bytes = fromBase64(item.bytes, 64 * 1024);
    } catch {
      encryptionFail(
        400,
        'INVALID_KEY_PACKAGE',
        'Invalid public key-package encoding.'
      );
    }
    if (
      (await sha256(bytes)) !== item.sha256 ||
      Date.parse(item.expiresAt) <= now + 60_000 ||
      Date.parse(item.expiresAt) > now + E2EE_KEY_PACKAGE_MS
    )
      encryptionFail(
        400,
        'INVALID_KEY_PACKAGE',
        'Invalid public key-package digest or lifetime.'
      );
  }
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      scope,
      proof,
      expected,
      true
    );
    if (device.stateHash === null)
      encryptionFail(
        409,
        'DEVICE_CHECKPOINT_REQUIRED',
        'Persist and checkpoint this device state before publishing prekeys.'
      );
    const [available] = await tx
      .select({ total: count() })
      .from(chatE2eeKeyPackages)
      .where(
        and(
          eq(chatE2eeKeyPackages.deviceId, device.deviceId),
          isNull(chatE2eeKeyPackages.claimedAt),
          gt(chatE2eeKeyPackages.expiresAt, new Date())
        )
      );
    let added = 0;
    for (const item of value.packages) {
      const [existing] = await tx
        .select()
        .from(chatE2eeKeyPackages)
        .where(eq(chatE2eeKeyPackages.id, item.id));
      if (existing) {
        if (
          existing.deviceId !== device.deviceId ||
          existing.sha256 !== item.sha256 ||
          existing.bytes !== item.bytes
        )
          encryptionFail(
            409,
            'KEY_PACKAGE_ID_USED',
            'A key-package retry must contain the original bytes.'
          );
        continue;
      }

      if (available.total + added >= E2EE_MAX_KEY_PACKAGES)
        encryptionFail(
          429,
          'KEY_PACKAGE_LIMIT',
          'The device already has enough unclaimed public key packages.'
        );
      const [inserted] = await tx
        .insert(chatE2eeKeyPackages)
        .values({
          ...item,
          deviceId: device.deviceId,
          expiresAt: new Date(item.expiresAt),
        })
        .onConflictDoNothing()
        .returning({ id: chatE2eeKeyPackages.id });
      if (inserted) added++;
    }
    if (available.total + added > 0) {
      await tx
        .update(chatE2eeDevices)
        .set({ readyAt: new Date() })
        .where(
          and(
            eq(chatE2eeDevices.id, device.deviceId),
            isNull(chatE2eeDevices.readyAt)
          )
        );
    }
    return { added, available: available.total + added };
  });
}

const checkpointSchema = z
  .object({
    operationId: z.uuid(),
    previousHash: sha256Schema.nullable(),
    nextHash: sha256Schema,
  })
  .strict();

export async function checkpointEncryptionState(
  scope: EncryptionScope,
  proof: SignedStatement,
  expected: ExpectedDeviceRequest,
  input: unknown
) {
  requireEncryptionEnabled();
  const value = encryptionInput(checkpointSchema, input);
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      scope,
      proof,
      expected,
      true,
      true
    );
    if (device.requestStateHash !== value.previousHash)
      encryptionFail(
        400,
        'CHECKPOINT_PROOF_MISMATCH',
        'The signed device state does not match the checkpoint request.'
      );
    const [current] = await tx
      .select()
      .from(chatE2eeDevices)
      .where(eq(chatE2eeDevices.id, device.deviceId));
    if (
      current.stateHash === value.nextHash &&
      current.checkpointId === value.operationId
    )
      return {
        stateHash: current.stateHash,
        operationId: current.checkpointId,
      };
    if (current.stateHash !== value.previousHash)
      encryptionFail(
        409,
        'DEVICE_STATE_ROLLBACK',
        'Another state was already published for this device. Do not rewind its keys.'
      );
    await tx
      .update(chatE2eeDevices)
      .set({
        stateHash: value.nextHash,
        checkpointId: value.operationId,
      })
      .where(eq(chatE2eeDevices.id, device.deviceId));
    return { stateHash: value.nextHash, operationId: value.operationId };
  });
}
