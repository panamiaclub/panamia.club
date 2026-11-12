import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  profiles,
  profileOwners,
  socialActors,
  chatE2eeIdentities,
  chatE2eeDevices,
  chatE2eeRequestNonces,
} from '@/lib/schema';
import { getFederationDomain } from '@/lib/federation/domain';
import {
  deviceRequestSchema,
  e2eeIdSchema,
  E2EE_REQUEST_MS,
  StatementError,
  signedStatementSchema,
  verifyStatement,
  type SignedStatement,
  type StatementPurpose,
} from '@/lib/e2ee/identity-contract';

export type EncryptionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const encryptionScopeSchema = z
  .object({ profileId: e2eeIdSchema, actorId: e2eeIdSchema })
  .strict();
export type EncryptionScope = z.infer<typeof encryptionScopeSchema> & {
  userId: string;
};
export type DeviceContext = EncryptionScope & {
  deviceId: string;
  signingKey: string;
  credential: string;
  rootVersion: number;
  stateHash: string | null;
  requestStateHash: string | null;
};
export class EncryptionError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}
export function encryptionFail(
  status: EncryptionError['status'],
  code: string,
  message: string
): never {
  throw new EncryptionError(status, code, message);
}
export function requireEncryptionEnabled() {
  if (process.env.CHAT_E2EE_ENABLED !== '1')
    encryptionFail(
      503,
      'ENCRYPTION_PAUSED',
      'Encrypted messaging is not enabled. No plaintext fallback is permitted.'
    );
}
export function encryptionInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    encryptionFail(
      400,
      'INVALID_INPUT',
      'Invalid encrypted messaging request.'
    );
  return parsed.data;
}

export async function encryptionProfile(
  tx: EncryptionTx,
  scope: EncryptionScope,
  write = false
) {
  encryptionInput(encryptionScopeSchema, {
    profileId: scope.profileId,
    actorId: scope.actorId,
  });
  const [profile] = await tx
    .select({
      id: profiles.id,
      userId: profiles.userId,
      socialEligible: profiles.socialEligible,
    })
    .from(profiles)
    .where(eq(profiles.id, scope.profileId))
    .for(write ? 'update' : 'share');
  if (!profile || !profile.socialEligible)
    encryptionFail(
      403,
      'PROFILE_UNAVAILABLE',
      'Encrypted messaging is unavailable for this profile.'
    );
  let owner = profile.userId === scope.userId;
  if (!owner) {
    const [grant] = await tx
      .select({ role: profileOwners.role })
      .from(profileOwners)
      .where(
        and(
          eq(profileOwners.profileId, scope.profileId),
          eq(profileOwners.userId, scope.userId)
        )
      )
      .for('share');
    if (!grant)
      encryptionFail(
        403,
        'PROFILE_UNAVAILABLE',
        'Encrypted messaging is unavailable for this profile.'
      );
    owner = grant.role === 'owner';
  }
  const [actor] = await tx
    .select({ id: socialActors.id })
    .from(socialActors)
    .where(
      and(
        eq(socialActors.id, scope.actorId),
        eq(socialActors.profileId, scope.profileId),
        eq(socialActors.domain, getFederationDomain()),
        eq(socialActors.type, 'Person')
      )
    )
    .for('share');
  if (!actor)
    encryptionFail(
      403,
      'PROFILE_UNAVAILABLE',
      'The explicit profile and messaging identity do not match.'
    );
  return { owner };
}

export async function verifiedStatement<T>(
  purpose: StatementPurpose,
  statement: unknown,
  publicKey: string,
  schema: z.ZodType<T>
): Promise<T> {
  try {
    return await verifyStatement(purpose, statement, publicKey, schema);
  } catch (error) {
    if (
      error instanceof StatementError ||
      (error instanceof DOMException &&
        ['DataError', 'OperationError'].includes(error.name))
    ) {
      encryptionFail(
        400,
        'INVALID_SIGNATURE',
        'The encrypted messaging signature or claims are invalid.'
      );
    }
    throw error;
  }
}

export type ExpectedDeviceRequest = {
  method: string;
  path: string;
  bodySha256: string;
};
export type EncryptionTransport = {
  scope: EncryptionScope;
  proof: SignedStatement;
  expected: ExpectedDeviceRequest;
};

/** Rechecks current session ownership and device revocation inside the caller's transaction. */
export async function authorizeEncryptionDevice(
  tx: EncryptionTx,
  scope: EncryptionScope,
  statement: SignedStatement,
  expected: ExpectedDeviceRequest,
  writeDevice = false,
  checkpoint = false
): Promise<DeviceContext> {
  requireEncryptionEnabled();
  encryptionInput(signedStatementSchema, statement);
  await encryptionProfile(tx, scope);
  const [identity] = await tx
    .select()
    .from(chatE2eeIdentities)
    .where(
      and(
        eq(chatE2eeIdentities.profileId, scope.profileId),
        eq(chatE2eeIdentities.actorId, scope.actorId)
      )
    );
  if (!identity)
    encryptionFail(
      403,
      'DEVICE_APPROVAL_REQUIRED',
      'Set up or recover an approved encryption device first.'
    );
  if (identity.rotationRequired && !checkpoint)
    encryptionFail(
      409,
      'IDENTITY_ROTATION_REQUIRED',
      'Profile ownership changed. A current owner must explicitly reset and reverify the encryption identity before messaging resumes.'
    );
  const claims = encryptionInput(
    deviceRequestSchema,
    (() => {
      try {
        const binary = atob(statement.payload);
        return JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            Uint8Array.from(binary, (char) => char.charCodeAt(0))
          )
        );
      } catch {
        encryptionFail(
          400,
          'INVALID_SIGNATURE',
          'Invalid encrypted device proof.'
        );
      }
    })()
  );
  const [device] = await tx
    .select()
    .from(chatE2eeDevices)
    .where(
      and(
        eq(chatE2eeDevices.id, claims.deviceId),
        eq(chatE2eeDevices.profileId, scope.profileId),
        eq(chatE2eeDevices.userId, scope.userId),
        eq(chatE2eeDevices.rootVersion, identity.rootVersion),
        isNull(chatE2eeDevices.revokedAt),
        gt(chatE2eeDevices.expiresAt, new Date())
      )
    )
    .for(writeDevice ? 'update' : 'share');
  if (!device)
    encryptionFail(
      403,
      'DEVICE_APPROVAL_REQUIRED',
      'This encryption device is missing, expired or revoked.'
    );
  const verified = await verifiedStatement(
    'device-request',
    statement,
    device.signingKey,
    deviceRequestSchema
  );
  const now = Date.now();
  if (!checkpoint && verified.stateHash !== device.stateHash)
    encryptionFail(
      409,
      'DEVICE_STATE_ROLLBACK',
      'This device state is stale or was copied. Recover onto a fresh approved device.'
    );
  if (
    verified.profileId !== scope.profileId ||
    verified.actorId !== scope.actorId ||
    verified.deviceId !== device.id ||
    verified.method !== expected.method ||
    verified.path !== expected.path ||
    verified.bodySha256 !== expected.bodySha256 ||
    now - verified.issuedAt > E2EE_REQUEST_MS ||
    verified.issuedAt - now > 30_000
  )
    encryptionFail(
      403,
      'DEVICE_PROOF_MISMATCH',
      'The device proof does not authorize this request.'
    );
  if (expected.method !== 'GET') {
    const [nonce] = await tx
      .insert(chatE2eeRequestNonces)
      .values({
        id: `${device.id}:${verified.nonce}`,
        deviceId: device.id,
        expiresAt: new Date(verified.issuedAt + E2EE_REQUEST_MS),
      })
      .onConflictDoNothing()
      .returning({ id: chatE2eeRequestNonces.id });
    if (!nonce)
      encryptionFail(
        409,
        'DEVICE_PROOF_REPLAY',
        'This signed request has already been used.'
      );
  }
  return {
    ...scope,
    deviceId: device.id,
    signingKey: device.signingKey,
    credential: device.credential,
    rootVersion: device.rootVersion,
    stateHash: device.stateHash,
    requestStateHash: verified.stateHash,
  };
}
