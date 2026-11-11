import { z } from 'zod';
import {
  deviceCertificateSchema,
  deviceCredential,
  e2eeIdSchema,
  publicKeySchema,
  sha256,
  sha256Schema,
  signedStatementSchema,
  verifyStatement,
  type StatementVerifier,
} from './identity-contract';

export const E2EE_MESSAGE_MS = 30 * 86_400_000;
export const E2EE_MAX_ROOM_DEVICES = 512;
export const E2EE_MAX_FRAME_BYTES = 1024 * 1024;
export const E2EE_VISIBILITY_BATCH = 40;
export const E2EE_MAX_DELIVERY_PAGE_BYTES = 4 * 1024 * 1024;
export const e2eeEpochSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,19})$/)
  .refine((value) => BigInt(value) <= 18_446_744_073_709_551_615n);
export const directoryDeviceSchema = z
  .object({
    deviceId: z.uuid(),
    profileId: e2eeIdSchema,
    actorId: e2eeIdSchema,
    userId: e2eeIdSchema,
    signingKey: publicKeySchema,
    credential: z.string().min(1).max(512),
    rootPublicKey: publicKeySchema,
    rootVersion: z.number().int().positive(),
    certificate: signedStatementSchema,
  })
  .strict();
export type DirectoryDevice = z.infer<typeof directoryDeviceSchema>;
export const roomRosterSchema = z
  .array(directoryDeviceSchema)
  .max(E2EE_MAX_ROOM_DEVICES);
export const membershipIntentSchema = z
  .object({
    version: z.literal(1),
    roomId: z.uuid(),
    cryptoGroupId: z.uuid(),
    attemptId: z.uuid(),
    actorId: e2eeIdSchema,
    deviceId: z.uuid(),
    revision: z.number().int().nonnegative(),
    previousSequence: z.number().int().nonnegative(),
    fromEpoch: e2eeEpochSchema,
    toEpoch: e2eeEpochSchema,
    previousRosterDigest: sha256Schema,
    nextRosterDigest: sha256Schema,
    operation: z.enum(['add', 'remove']),
    targetDeviceId: z.uuid(),
    keyPackageId: z.uuid().nullable(),
    frameSha256: sha256Schema,
    welcomeSha256: sha256Schema.nullable(),
  })
  .strict();
export type MembershipIntent = z.infer<typeof membershipIntentSchema>;
export const roomRestartSchema = z
  .object({
    version: z.literal(1),
    operation: z.literal('restart'),
    requestId: z.uuid(),
    roomId: z.uuid(),
    previousCryptoGroupId: z.uuid(),
    cryptoGroupId: z.uuid(),
    previousSequence: z.number().int().nonnegative(),
    previousRevision: z.number().int().nonnegative(),
    previousRosterDigest: sha256Schema,
    profileId: e2eeIdSchema,
    actorId: e2eeIdSchema,
    deviceId: z.uuid(),
    issuedAt: z.number().int().positive(),
  })
  .strict();
export const roomRestartProofSchema = z
  .object({
    intent: signedStatementSchema,
    author: directoryDeviceSchema,
  })
  .strict();
export type RoomRestartProof = z.infer<typeof roomRestartProofSchema>;

const frameSchema = z
  .string()
  .min(4)
  .max(Math.ceil(E2EE_MAX_FRAME_BYTES / 3) * 4);
export const submitRoomEventSchema = z
  .object({
    id: z.uuid(),
    clientId: z.uuid(),
    kind: z.enum(['message', 'commit']),
    cryptoGroupId: z.uuid(),
    revision: z.number().int().nonnegative(),
    afterSequence: z.number().int().nonnegative(),
    epoch: e2eeEpochSchema,
    frame: frameSchema,
    frameSha256: sha256Schema,
    expiresAt: z.iso.datetime().nullable(),
    intent: signedStatementSchema.nullable(),
    welcomes: z
      .array(
        z
          .object({
            deviceId: z.uuid(),
            keyPackageId: z.uuid(),
            frame: frameSchema,
          })
          .strict()
      )
      .max(1),
    mediaIds: z.array(z.uuid()).max(4),
  })
  .strict();
export type SubmitRoomEvent = z.infer<typeof submitRoomEventSchema>;
export type EncryptedRoomState =
  'initializing' | 'active' | 'rekey_required' | 'closed';
export const ENCRYPTED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'video/mp4',
  'video/webm',
] as const;
export const encryptedAttachmentSchema = z
  .object({
    id: z.uuid(),
    key: publicKeySchema,
    iv: z.string().length(16),
    sha256: sha256Schema,
    name: z.string().max(500),
    mediaType: z.enum(ENCRYPTED_MEDIA_TYPES),
    size: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
  })
  .strict();
export type EncryptedAttachment = z.infer<typeof encryptedAttachmentSchema>;
export const encryptedMessageSchema = z
  .object({
    version: z.literal(1),
    roomId: z.uuid(),
    cryptoGroupId: z.uuid(),
    clientId: z.uuid(),
    attemptId: z.uuid(),
    profileId: e2eeIdSchema,
    actorId: e2eeIdSchema,
    deviceId: z.uuid(),
    expiresAt: z.iso.datetime(),
    content: z.string().max(5000),
    attachments: z.array(encryptedAttachmentSchema).max(4),
  })
  .strict();
export type EncryptedMessage = z.infer<typeof encryptedMessageSchema>;

export async function rosterDigest(value: DirectoryDevice[]): Promise<string> {
  const roster = roomRosterSchema.parse(value);
  if (
    new Set(roster.map((device) => device.deviceId)).size !== roster.length ||
    new Set(roster.map((device) => device.signingKey)).size !== roster.length
  )
    throw new Error('Duplicate encrypted-room devices or signing keys.');
  const canonical = roster
    .sort((a, b) =>
      a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0
    )
    .map((device) => directoryDeviceSchema.parse(device));
  return sha256(new TextEncoder().encode(JSON.stringify(canonical)));
}

/** Root trust is a separate, persistent caller decision; a fetched directory is not approval. */
export async function verifyDirectoryDevice(
  value: unknown,
  trustedRoot: string,
  atTime = Date.now(),
  verifier?: StatementVerifier
): Promise<DirectoryDevice> {
  const device = directoryDeviceSchema.parse(value);
  if (device.rootPublicKey !== trustedRoot)
    throw new Error(
      'The profile encryption identity changed and must be verified.'
    );
  const certificate = await verifyStatement(
    'device-certificate',
    device.certificate,
    trustedRoot,
    deviceCertificateSchema,
    verifier
  );
  if (
    certificate.deviceId !== device.deviceId ||
    certificate.actorId !== device.actorId ||
    certificate.profileId !== device.profileId ||
    certificate.userId !== device.userId ||
    certificate.rootVersion !== device.rootVersion ||
    certificate.signingKey !== device.signingKey ||
    certificate.issuedAt > atTime + 120_000 ||
    certificate.expiresAt <= atTime ||
    device.signingKey === trustedRoot ||
    deviceCredential(certificate) !== device.credential
  )
    throw new Error('Invalid profile-bound encryption device certificate.');
  return device;
}
