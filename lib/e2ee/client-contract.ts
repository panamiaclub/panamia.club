import { z } from 'zod';
import {
  deviceIdentitySchema,
  enrollmentSchema,
  e2eeIdSchema,
  publicKeySchema,
  sha256Schema,
  signedStatementSchema,
} from './identity-contract';
import {
  directoryDeviceSchema,
  e2eeEpochSchema,
  encryptedMessageSchema,
  roomRosterSchema,
  submitRoomEventSchema,
  encryptedAttachmentSchema,
  roomRestartProofSchema,
} from './room-contract';

export const deviceStatusSchema = z
  .object({
    profileId: e2eeIdSchema,
    actorId: e2eeIdSchema,
    canApprove: z.boolean(),
    identity: z
      .object({
        rootPublicKey: publicKeySchema,
        rootVersion: z.number().int().positive(),
        encryptionRequired: z.boolean(),
        rotationRequired: z.boolean(),
      })
      .strict()
      .nullable(),
    devices: z.array(
      z
        .object({
          id: z.uuid(),
          profileId: e2eeIdSchema,
          userId: e2eeIdSchema,
          signingKey: publicKeySchema,
          credential: z.string().max(512),
          certificate: signedStatementSchema,
          rootVersion: z.number().int().positive(),
          stateHash: sha256Schema.nullable(),
          checkpointId: z.uuid().nullable(),
          prekeyCount: z.number().int().nonnegative(),
          createdAt: z.iso.datetime(),
          expiresAt: z.iso.datetime(),
          revokedAt: z.iso.datetime().nullable(),
          readyAt: z.iso.datetime().nullable(),
          revocation: signedStatementSchema.nullable(),
        })
        .strict()
    ),
    pending: z.array(
      z
        .object({
          id: z.uuid(),
          challenge: enrollmentSchema,
          proof: signedStatementSchema.nullable(),
          expiresAt: z.iso.datetime(),
        })
        .strict()
    ),
  })
  .strict();
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;
export const chatActorSchema = z
  .object({
    id: e2eeIdSchema,
    username: z.string(),
    domain: z.string(),
    name: z.string().nullable(),
    iconUrl: z.string().nullable(),
  })
  .strict();
export const roomListSchema = z
  .array(
    z
      .object({
        id: z.uuid(),
        kind: z.enum(['dm', 'group']),
        state: z.enum(['initializing', 'active', 'rekey_required', 'closed']),
        sequence: z.number().int().nonnegative(),
        epoch: e2eeEpochSchema,
        revision: z.number().int().nonnegative(),
        folder: z.enum(['inbox', 'requests']),
        peer: chatActorSchema
          .extend({ profileId: e2eeIdSchema })
          .strict()
          .nullable(),
        group: z
          .object({
            id: e2eeIdSchema,
            handle: z.string(),
            name: z.string().nullable(),
            iconUrl: z.string().nullable(),
          })
          .strict()
          .nullable(),
        updatedAt: z.iso.datetime(),
      })
      .strict()
  )
  .max(100);
export type EncryptedRoomList = z.infer<typeof roomListSchema>;
export const roomSnapshotSchema = z
  .object({
    id: z.uuid(),
    cryptoGroupId: z.uuid(),
    kind: z.enum(['dm', 'group']),
    groupId: e2eeIdSchema.nullable(),
    founderDeviceId: z.uuid(),
    state: z.enum(['initializing', 'active', 'rekey_required', 'closed']),
    epoch: e2eeEpochSchema,
    revision: z.number().int().nonnegative(),
    sequence: z.number().int().nonnegative(),
    roster: roomRosterSchema,
    rosterDigest: sha256Schema,
    desired: roomRosterSchema,
    role: z.enum(['admin', 'moderator', 'member']).nullable(),
    joined: z.boolean(),
    hiddenBeforeSequence: z.number().int().nonnegative(),
    actors: z.array(chatActorSchema).max(1024),
    canRestart: z.boolean(),
    restart: roomRestartProofSchema.nullable(),
    welcome: z
      .object({
        frame: z.string().max(1398104),
        sequence: z.number().int().positive(),
        eventId: z.uuid(),
        keyPackageId: z.uuid(),
        roster: roomRosterSchema,
        intent: signedStatementSchema,
        createdAt: z.iso.datetime(),
      })
      .strict()
      .nullable(),
    serverTime: z.iso.datetime(),
  })
  .strict();
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
export const receiptSchema = z
  .object({
    id: z.uuid(),
    clientId: z.uuid(),
    roomId: z.uuid(),
    cryptoGroupId: z.uuid(),
    sequence: z.number().int().positive(),
    kind: z.enum(['message', 'commit']),
    frameSha256: sha256Schema,
    envelopeSha256: sha256Schema,
    revision: z.number().int().nonnegative(),
    fromEpoch: e2eeEpochSchema,
    acceptedEpoch: e2eeEpochSchema,
    expiresAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type DeliveryReceipt = z.infer<typeof receiptSchema>;
export const roomEventSchema = receiptSchema
  .extend({
    frame: z.string().max(1398104).nullable(),
    senderDeviceId: z.uuid(),
    senderActorId: e2eeIdSchema,
    intent: signedStatementSchema.nullable(),
    nextRoster: roomRosterSchema.nullable(),
    mediaIds: z.array(z.uuid()).max(4),
    createdAt: z.iso.datetime(),
    display: z.boolean(),
  })
  .strict();
export const eventsPageSchema = z
  .object({
    room: roomSnapshotSchema,
    events: z.array(roomEventSchema).max(100),
    nextSequence: z.number().int().nonnegative(),
  })
  .strict();
export const claimedPackageSchema = z
  .object({
    id: z.uuid(),
    bytes: z.string().max(87384),
    sha256: sha256Schema,
    expiresAt: z.iso.datetime(),
    target: directoryDeviceSchema,
    revision: z.number().int().nonnegative(),
    epoch: e2eeEpochSchema,
  })
  .strict();
export const backupMetadataSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['identity', 'history']),
    rootVersion: z.number().int().positive(),
    roomId: z.uuid().nullable(),
    sha256: sha256Schema,
    byteLength: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable(),
  })
  .strict();
export const backupListSchema = z
  .object({
    backups: z.array(backupMetadataSchema).max(100),
    nextCursor: z.string().max(512).nullable(),
  })
  .strict();
export const trustedRootSchema = z
  .object({
    actorId: e2eeIdSchema,
    profileId: e2eeIdSchema,
    rootPublicKey: publicKeySchema,
    rootVersion: z.number().int().positive(),
  })
  .strict();
const localRoomSchema = z
  .object({
    roomId: z.uuid(),
    cryptoGroupId: z.uuid(),
    cursor: z.number().int().nonnegative(),
    roster: roomRosterSchema,
    epoch: e2eeEpochSchema,
    blocked: z.string().max(500).nullable(),
    ownReceipts: z.array(receiptSchema).max(1000),
  })
  .strict();
export const outboxSchema = z
  .object({
    roomId: z.uuid(),
    event: submitRoomEventSchema,
    message: encryptedMessageSchema.nullable(),
    nextRoster: roomRosterSchema.nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type OutboxEntry = z.infer<typeof outboxSchema>;
export const localDeviceSchema = z
  .object({
    version: z.literal(1),
    userId: e2eeIdSchema,
    identity: deviceIdentitySchema,
    native: z.string().max(60 * 1024 * 1024),
    rootSecret: z.string().length(88).nullable(),
    recoveryKey: publicKeySchema.nullable(),
    rootPublicKey: publicKeySchema.nullable(),
    rootVersion: z.number().int().nonnegative(),
    enrollmentRequestId: z.uuid().nullable(),
    certificate: signedStatementSchema.nullable(),
    trustedRoots: z.array(trustedRootSchema).max(10000),
    approvedKeys: z
      .array(
        z
          .object({
            credential: z.string().max(512),
            signingKey: publicKeySchema,
          })
          .strict()
      )
      .max(10000),
    roomApprovals: z
      .array(trustedRootSchema.extend({ roomId: z.uuid() }).strict())
      .max(20000),
    rooms: z.array(localRoomSchema).max(2000),
    outbox: z.array(outboxSchema).max(100),
    prekeys: z
      .array(
        z
          .object({
            id: z.uuid(),
            bytes: z.string().max(87384),
            sha256: sha256Schema,
            expiresAt: z.iso.datetime(),
          })
          .strict()
      )
      .max(100),
    recoveredMedia: z
      .array(z.object({ id: z.uuid(), backupId: z.uuid() }).strict())
      .max(10000),
    pendingMedia: z
      .array(
        z
          .object({
            roomId: z.uuid(),
            clientId: z.uuid(),
            manifest: encryptedAttachmentSchema,
          })
          .strict()
      )
      .max(400),
    pendingSends: z
      .array(
        z
          .object({
            roomId: z.uuid(),
            clientId: z.uuid(),
            content: z.string().max(5000),
            draftHash: sha256Schema,
            expiresAt: z.iso.datetime(),
            mediaIds: z.array(z.uuid()).max(4),
          })
          .strict()
      )
      .max(100),
    blockedWelcomes: z
      .array(
        z
          .object({
            roomId: z.uuid(),
            eventId: z.uuid(),
            reason: z.string().max(500),
          })
          .strict()
      )
      .max(2000),
  })
  .strict();
export type LocalDeviceState = z.infer<typeof localDeviceSchema>;
