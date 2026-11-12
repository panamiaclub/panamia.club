import { z } from 'zod';
import { encryptedRecordSchema } from './crypto-format';
import {
  e2eeIdSchema,
  E2EE_PROTOCOL,
  publicKeySchema,
  sha256Schema,
  signedStatementSchema,
} from './identity-contract';
import { encryptedMessageSchema } from './room-contract';

export const E2EE_MAX_BACKUP_BYTES = 16 * 1024 * 1024;
const scope = {
  userId: e2eeIdSchema,
  profileId: e2eeIdSchema,
  actorId: e2eeIdSchema,
};
export const identityRecoverySchema = z
  .object({
    version: z.literal(1),
    protocol: z.literal(E2EE_PROTOCOL),
    kind: z.literal('identity'),
    ...scope,
    rootVersion: z.number().int().positive(),
    rootPublicKey: publicKeySchema,
    rootSecret: z.string().length(88),
  })
  .strict();
export const historyRecoverySchema = z
  .object({
    version: z.literal(1),
    protocol: z.literal(E2EE_PROTOCOL),
    kind: z.literal('history'),
    ...scope,
    roomId: z.uuid(),
    entries: z
      .array(
        z
          .object({
            id: z.uuid(),
            sequence: z.number().int().positive(),
            expiresAt: z.iso.datetime(),
            createdAt: z.iso.datetime(),
            message: encryptedMessageSchema,
          })
          .strict()
      )
      .max(10000),
  })
  .strict();
export const backupAttestationSchema = z
  .object({
    version: z.literal(1),
    ...scope,
    rootVersion: z.number().int().positive(),
    backupId: z.uuid(),
    sha256: sha256Schema,
    issuedAt: z.number().int().positive(),
  })
  .strict();
export const activationSchema = z
  .object({
    version: z.literal(1),
    ...scope,
    rootVersion: z.number().int().positive(),
    deviceId: z.uuid(),
    backupId: z.uuid(),
    sha256: sha256Schema,
    recoveryKeySaved: z.literal(true),
    issuedAt: z.number().int().positive(),
    nonce: z.uuid(),
  })
  .strict();
export const uploadBackupSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['identity', 'history']),
    rootVersion: z.number().int().positive(),
    roomId: z.uuid().nullable(),
    record: encryptedRecordSchema,
    rootAttestation: signedStatementSchema.nullable(),
    mediaIds: z.array(z.uuid()).max(2000),
  })
  .strict();
export type UploadBackup = z.infer<typeof uploadBackupSchema>;
export const identityResetClaimsSchema = z
  .object({
    version: z.literal(1),
    ...scope,
    requestId: z.uuid(),
    previousRootPublicKey: publicKeySchema,
    previousRootVersion: z.number().int().positive(),
    rootPublicKey: publicKeySchema,
    rootVersion: z.number().int().positive().max(2147483647),
    deviceId: z.uuid(),
    stateHash: sha256Schema,
    certificateSha256: sha256Schema,
    backupId: z.uuid(),
    backupSha256: sha256Schema,
    recoveryKeySaved: z.literal(true),
    discardLocalState: z.literal(true),
    issuedAt: z.number().int().positive(),
  })
  .strict();
export const identityResetInputSchema = z
  .object({
    confirmation: z.literal('RESET ENCRYPTION'),
    rootPublicKey: publicKeySchema,
    statement: signedStatementSchema,
    certificate: signedStatementSchema,
    record: encryptedRecordSchema,
  })
  .strict();
export const identityResetResultSchema = z
  .object({
    requestId: z.uuid(),
    rootPublicKey: publicKeySchema,
    rootVersion: z.number().int().positive(),
    deviceId: z.uuid(),
    stateHash: sha256Schema,
  })
  .strict();
export const identityResetDraftSchema = identityResetClaimsSchema
  .omit({ recoveryKeySaved: true, discardLocalState: true, issuedAt: true })
  .extend({ certificate: signedStatementSchema, record: encryptedRecordSchema })
  .strict();

export function backupContext(
  value: { userId: string; profileId: string; actorId: string },
  rootVersion: number,
  kind: 'identity' | 'history',
  roomId: string | null
) {
  return JSON.stringify([
    E2EE_PROTOCOL,
    'backup',
    value.userId,
    value.profileId,
    value.actorId,
    rootVersion,
    kind,
    roomId,
  ]);
}
