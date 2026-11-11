import { z } from 'zod';
import { EncryptedApi, EncryptedApiError } from './api';
import {
  backupMetadataSchema,
  backupListSchema,
  claimedPackageSchema,
  deviceStatusSchema,
  eventsPageSchema,
  localDeviceSchema,
  receiptSchema,
  roomSnapshotSchema,
  roomListSchema,
  type DeliveryReceipt,
  type DeviceStatus,
  type LocalDeviceState,
  type OutboxEntry,
  type RoomSnapshot,
} from './client-contract';
import {
  activationSchema,
  backupAttestationSchema,
  backupContext,
  historyRecoverySchema,
  identityRecoverySchema,
  E2EE_MAX_BACKUP_BYTES,
  identityResetClaimsSchema,
  identityResetDraftSchema,
  identityResetResultSchema,
} from './recovery-contract';
import {
  E2EE_DEVICE_MS,
  E2EE_KEY_PACKAGE_MS,
  E2EE_PROTOCOL,
  deviceCertificateSchema,
  deviceCredential,
  deviceIdentitySchema,
  enrollmentSchema,
  sha256,
  signStatement,
  verifyStatement,
} from './identity-contract';
import {
  encryptedAttachmentSchema,
  encryptedMessageSchema,
  membershipIntentSchema,
  rosterDigest,
  verifyDirectoryDevice,
  E2EE_MESSAGE_MS,
  submitRoomEventSchema,
  type DirectoryDevice,
  type EncryptedMessage,
  roomRestartSchema,
  E2EE_VISIBILITY_BATCH,
} from './room-contract';
import {
  DeviceVault,
  type HistoryEntry,
  type VaultChanges,
  type VaultScope,
  type VaultSession,
} from './device-vault';
import {
  engineCall,
  loadChatEngine,
  type ChatEngine,
  type NativeDevice,
  type NativeProfileKey,
} from './engine';
import { fromBase64, toBase64 } from './encoding';
import {
  decryptMedia,
  encryptMedia,
  encryptedRecordSchema,
  importAesKey,
  newRecoveryKey,
  sealRecord,
  unsealRecord,
} from './crypto-format';

const memberSchema = z
  .object({
    identity: z.string().max(512),
    public_key: z.array(z.number().int().min(0).max(255)).length(32),
    index: z.number().int().nonnegative(),
  })
  .strict();
const nativeRoomSchema = z
  .object({
    room: z.string(),
    epoch: z.string(),
    active: z.boolean(),
    pending_commit: z.boolean(),
    members: z.array(memberSchema),
  })
  .strict();
const nativeResultSchema = z
  .object({
    kind: z.enum(['message', 'commit']),
    sender: z.string().max(512),
    content: z.array(z.number().int().min(0).max(255)).max(512 * 1024),
  })
  .strict();
const membershipFramesSchema = z
  .object({
    commit: z.array(z.number().int().min(0).max(255)),
    welcome: z.array(z.number().int().min(0).max(255)).nullable(),
  })
  .strict();
type OwnedDevice = DeviceStatus['devices'][number];
type Runtime = {
  engine: ChatEngine;
  session: VaultSession;
  state: LocalDeviceState;
  native: NativeDevice;
  root: NativeProfileKey | null;
  status: DeviceStatus;
  own: OwnedDevice | null;
  committedHash: string | null;
  dirty: boolean;
  changes: VaultChanges;
};
export type RootApproval = { actorId: string; rootPublicKey: string };
export class ParticipantVerificationRequired extends Error {
  constructor(
    readonly participants: Array<{
      actorId: string;
      profileId: string;
      rootPublicKey: string;
      rootVersion: number;
      changed: boolean;
    }>
  ) {
    super('Verify the participant encryption identities before continuing.');
  }
}
export type ConversationView = {
  room: RoomSnapshot;
  history: HistoryEntry[];
  nextHistoryBefore: number | null;
  pending: Array<{ clientId: string; content: string; createdAt: string }>;
};

/** Product client: real account/profile scopes, not the lab's manual device trust. */
export class EncryptedChatClient {
  readonly api: EncryptedApi;
  private constructor(
    readonly scope: VaultScope,
    readonly vault: DeviceVault,
    private readonly engine: () => Promise<ChatEngine>,
    transport?: typeof fetch
  ) {
    this.api = new EncryptedApi(scope, transport);
  }

  static async open(
    scope: VaultScope,
    options: { engine?: () => Promise<ChatEngine>; fetch?: typeof fetch } = {}
  ) {
    return new EncryptedChatClient(
      scope,
      await DeviceVault.open(scope),
      options.engine ?? loadChatEngine,
      options.fetch
    );
  }
  status() {
    return this.api.json(
      deviceStatusSchema,
      'GET',
      '/api/social/encryption/devices'
    );
  }
  private async retainedBackups() {
    const result: Array<z.infer<typeof backupMetadataSchema>> = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let index = 0; index < 1000; index++) {
      const page: z.infer<typeof backupListSchema> = await this.api.json(
        backupListSchema,
        'GET',
        '/api/social/encryption/backups',
        undefined,
        undefined,
        cursor ? { cursor } : {}
      );
      result.push(...page.backups);
      if (page.nextCursor === null) return result;
      if (seen.has(page.nextCursor))
        throw new Error('The encrypted backup index cursor did not advance.');
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    throw new Error(
      'The encrypted recovery index exceeds this client limit. No partial recovery was reported as complete.'
    );
  }
  rooms() {
    return this.run(false, async (runtime) => {
      this.approved(runtime);
      return this.api.json(
        roomListSchema,
        'GET',
        '/api/social/encryption/rooms',
        undefined,
        this.signer(runtime)
      );
    });
  }
  private signer(runtime: Runtime, hash = runtime.committedHash) {
    return { device: runtime.native, stateHash: hash };
  }
  private root(runtime: Runtime) {
    if (!runtime.root)
      throw new Error(
        'Use an owner-held authorization key or personal recovery key for this action.'
      );
    return runtime.root;
  }
  private nativeInfo(runtime: Runtime, cryptoGroupId: string) {
    return nativeRoomSchema.parse(
      JSON.parse(engineCall(() => runtime.native.roomInfo(cryptoGroupId)))
    );
  }
  private localRoom(runtime: Runtime, id: string) {
    const room = runtime.state.rooms.find((room) => room.roomId === id);
    if (!room)
      throw new Error(
        'Join this secure conversation before using its live keys.'
      );
    return room;
  }

  private async initialState(
    engine: ChatEngine,
    status: DeviceStatus
  ): Promise<LocalDeviceState> {
    const identity = deviceIdentitySchema.parse({
      version: 1,
      profileId: this.scope.profileId,
      actorId: this.scope.actorId,
      deviceId: crypto.randomUUID(),
    });
    const native = engineCall(
      () => new engine.MlsDevice(deviceCredential(identity))
    );
    let root: NativeProfileKey | null = null;
    try {
      if (!status.identity && status.canApprove)
        root = engineCall(() => new engine.ProfileSigningKey());
      const generatedRoot = root;
      const secret = generatedRoot
        ? engineCall(() => generatedRoot.exportSecret())
        : null;
      const snapshot = engineCall(() => native.snapshotLocal());
      try {
        return localDeviceSchema.parse({
          version: 1,
          userId: this.scope.userId,
          identity,
          native: toBase64(snapshot),
          rootSecret: secret ? toBase64(secret) : null,
          recoveryKey: root ? newRecoveryKey() : null,
          rootPublicKey: root
            ? toBase64(root.publicKey())
            : (status.identity?.rootPublicKey ?? null),
          rootVersion: status.identity?.rootVersion ?? (root ? 1 : 0),
          enrollmentRequestId: null,
          certificate: null,
          trustedRoots: [],
          approvedKeys: [],
          roomApprovals: [],
          rooms: [],
          outbox: [],
          prekeys: [],
          recoveredMedia: [],
          pendingMedia: [],
          pendingSends: [],
          blockedWelcomes: [],
        });
      } finally {
        snapshot.fill(0);
        secret?.fill(0);
      }
    } finally {
      native.free();
      root?.free();
    }
  }

  private async settleCheckpoint(runtime: Runtime) {
    const pending = runtime.session.checkpoint;
    if (!pending) return;
    if (!runtime.own)
      throw new Error(
        'This pending device state needs its original approval before it can continue.'
      );
    const result = await this.api.json(
      z
        .object({
          stateHash: z.string(),
          operationId: z.uuid(),
        })
        .strict(),
      'POST',
      '/api/social/encryption/checkpoint',
      pending,
      this.signer(runtime, pending.previousHash)
    );
    if (
      result.stateHash !== pending.nextHash ||
      result.operationId !== pending.operationId
    )
      throw new Error(
        'The server did not acknowledge this exact device state.'
      );
    await runtime.session.acknowledgeCheckpoint();
    runtime.committedHash = result.stateHash;
    runtime.own.stateHash = result.stateHash;
    runtime.own.checkpointId = result.operationId;
  }

  private async flush(runtime: Runtime) {
    if (
      !runtime.dirty &&
      !runtime.changes.history?.length &&
      !runtime.changes.media?.length &&
      !runtime.changes.removeHistory?.length &&
      !runtime.changes.removeMedia?.length
    )
      return;
    if (runtime.session.checkpoint)
      throw new Error(
        'Resolve the saved checkpoint before changing live device state.'
      );
    const snapshot = engineCall(() => runtime.native.snapshotLocal());
    try {
      runtime.state.native = toBase64(snapshot);
    } finally {
      snapshot.fill(0);
    }
    const state = JSON.stringify(localDeviceSchema.parse(runtime.state));
    const nextHash = await sha256(new TextEncoder().encode(state));
    const checkpoint = runtime.own
      ? {
          operationId: crypto.randomUUID(),
          previousHash: runtime.committedHash,
          nextHash,
        }
      : null;
    await runtime.session.save(state, checkpoint, runtime.changes);
    runtime.dirty = false;
    runtime.changes = {};
    if (checkpoint) await this.settleCheckpoint(runtime);
  }

  private async run<T>(
    create: boolean,
    operation: (runtime: Runtime) => Promise<T>
  ): Promise<T> {
    return this.vault.withLock(async () => {
      const status = await this.status();
      if (
        status.profileId !== this.scope.profileId ||
        status.actorId !== this.scope.actorId
      )
        throw new Error('The active encryption profile changed.');
      const engine = await this.engine();
      const replacement = await this.vault.replacement();
      if (replacement) {
        const draft = identityResetDraftSchema.parse(
          JSON.parse(replacement.request)
        );
        if (
          status.identity?.rootPublicKey === draft.rootPublicKey &&
          status.identity.rootVersion === draft.rootVersion
        ) {
          const own = status.devices.find(
            (entry) => entry.id === draft.deviceId
          );
          if (
            !own ||
            own.stateHash !== replacement.stateHash ||
            own.checkpointId !== draft.requestId
          )
            throw new Error(
              'The accepted replacement device has already advanced elsewhere. Do not copy its old live keys.'
            );
          await this.vault.promoteReplacement(replacement);
        }
      }
      let session = await this.vault.load();
      let initial = false;
      if (!session) {
        if (!create)
          throw new Error(
            'Set up or recover an approved encryption device first.'
          );
        session = await this.vault.initialize();
        await session.save(
          JSON.stringify(await this.initialState(engine, status)),
          null
        );
        initial = true;
      }
      if (!session.state)
        throw new Error('Encrypted device state is unavailable.');
      const state = localDeviceSchema.parse(JSON.parse(session.state));
      if (
        state.userId !== this.scope.userId ||
        state.identity.profileId !== this.scope.profileId ||
        state.identity.actorId !== this.scope.actorId
      )
        throw new Error(
          'This encrypted device belongs to another account or profile.'
        );
      const bytes = fromBase64(state.native);
      let native: NativeDevice;
      try {
        native = engineCall(() => engine.MlsDevice.restoreLocal(bytes));
      } finally {
        bytes.fill(0);
      }
      let root: NativeProfileKey | null = null;
      try {
        if (native.deviceIdentity() !== deviceCredential(state.identity))
          throw new Error(
            'The stored MLS identity does not match this profile.'
          );
        if (state.rootSecret) {
          const secret = fromBase64(state.rootSecret, 64);
          try {
            root = engineCall(() =>
              engine.ProfileSigningKey.restoreSecret(secret)
            );
          } finally {
            secret.fill(0);
          }
          if (toBase64(root.publicKey()) !== state.rootPublicKey)
            throw new Error(
              'The stored profile authorization key does not match this identity.'
            );
        }
        const own =
          status.devices.find(
            (device) => device.id === state.identity.deviceId
          ) ?? null;
        if (
          own &&
          (own.revokedAt ||
            Date.parse(own.expiresAt) <= Date.now() ||
            own.signingKey !== toBase64(native.publicKey()))
        )
          throw new Error(
            'This device is revoked, expired or has different keys. Recover onto a fresh approved device.'
          );
        if (
          status.identity &&
          state.rootPublicKey &&
          status.identity.rootPublicKey !== state.rootPublicKey
        )
          throw new Error(
            'The profile encryption identity changed. Verify the change before recovery or sending.'
          );
        const runtime: Runtime = {
          engine,
          session,
          state,
          native,
          root,
          status,
          own,
          committedHash: own?.stateHash ?? null,
          dirty: initial,
          changes: {},
        };
        await this.settleCheckpoint(runtime);
        if (own?.stateHash && session.stateHash !== own.stateHash)
          throw new Error(
            'This device state was rolled back or copied. Do not reuse its live keys; recover a fresh device.'
          );
        if (own) {
          if (!status.identity)
            throw new Error('The approved device profile identity is missing.');
          await verifyStatement(
            'device-certificate',
            own.certificate,
            status.identity.rootPublicKey,
            deviceCertificateSchema
          );
          if (!state.certificate) {
            state.certificate = own.certificate;
            runtime.dirty = true;
          }
        }
        try {
          return await operation(runtime);
        } finally {
          await this.flush(runtime);
        }
      } finally {
        native.free();
        root?.free();
      }
    });
  }

  private async approveChallenge(
    runtime: Runtime,
    challenge: z.infer<typeof enrollmentSchema>
  ) {
    const root = this.root(runtime);
    if (!runtime.status.canApprove)
      throw new Error(
        'Only a current profile owner can approve encryption devices.'
      );
    if (
      challenge.profileId !== this.scope.profileId ||
      challenge.actorId !== this.scope.actorId
    )
      throw new Error('The requesting device belongs to another profile.');
    const issuedAt = Date.now();
    const certificate = deviceCertificateSchema.parse({
      ...challenge,
      rootVersion: runtime.status.identity?.rootVersion ?? 1,
      issuedAt,
      expiresAt: issuedAt + E2EE_DEVICE_MS,
    });
    const signed = await signStatement(
      'device-certificate',
      certificate,
      (purpose, payload) =>
        engineCall(() => root.signStatement(purpose, payload))
    );
    return this.api.deviceAction(
      deviceStatusSchema.shape.devices.element,
      'approve',
      {
        requestId: challenge.requestId,
        rootPublicKey: toBase64(root.publicKey()),
        certificate: signed,
      }
    );
  }

  private async publishPrekeys(runtime: Runtime) {
    if (!runtime.own)
      throw new Error('Wait for device approval before publishing prekeys.');
    if (!runtime.state.prekeys.length && runtime.own.prekeyCount < 10) {
      for (let index = 0; index < 25; index++) {
        runtime.dirty = true;
        const bytes = engineCall(() => runtime.native.keyPackage());
        runtime.state.prekeys.push({
          id: crypto.randomUUID(),
          bytes: toBase64(bytes),
          sha256: await sha256(bytes),
          expiresAt: new Date(
            Date.now() + E2EE_KEY_PACKAGE_MS - 60_000
          ).toISOString(),
        });
      }
    }
    if (!runtime.state.prekeys.length) return;
    await this.flush(runtime);
    const published = await this.api.json(
      z.object({ added: z.number(), available: z.number() }).strict(),
      'POST',
      '/api/social/encryption/key-packages',
      { packages: runtime.state.prekeys },
      this.signer(runtime)
    );
    runtime.state.prekeys = [];
    runtime.own.readyAt = new Date().toISOString();
    runtime.own.prekeyCount = published.available;
    runtime.dirty = true;
    await this.flush(runtime);
  }

  async setup() {
    return this.run(true, async (runtime) => {
      if (!runtime.own) {
        const prior = runtime.status.pending.find(
          (entry) =>
            entry.challenge.deviceId === runtime.state.identity.deviceId &&
            entry.challenge.signingKey ===
              toBase64(runtime.native.publicKey()) &&
            Date.parse(entry.expiresAt) > Date.now()
        );
        const requestId = prior?.id ?? crypto.randomUUID();
        if (runtime.state.enrollmentRequestId !== requestId) {
          runtime.state.enrollmentRequestId = requestId;
          runtime.dirty = true;
        }
        await this.flush(runtime);
        const challenge = await this.api.deviceAction(
          enrollmentSchema,
          'begin',
          {
            requestId,
            deviceId: runtime.state.identity.deviceId,
            signingKey: toBase64(runtime.native.publicKey()),
          }
        );
        const proof = await signStatement(
          'enrollment',
          challenge,
          (purpose, payload) =>
            engineCall(() => runtime.native.signStatement(purpose, payload))
        );
        await this.api.deviceAction(
          z
            .object({ pendingApproval: z.literal(true), requestId: z.uuid() })
            .strict(),
          'prove',
          { requestId, proof }
        );
        if (runtime.root && runtime.status.canApprove) {
          runtime.own = await this.approveChallenge(runtime, challenge);
          runtime.state.certificate = runtime.own.certificate;
          runtime.state.rootPublicKey = toBase64(runtime.root.publicKey());
          runtime.state.rootVersion = runtime.own.rootVersion;
          runtime.dirty = true;
          await this.flush(runtime);
        }
      }
      if (runtime.own) {
        await this.publishPrekeys(runtime);
        if (
          !runtime.state.recoveryKey &&
          !(await this.retainedBackups()).length
        ) {
          runtime.state.recoveryKey = newRecoveryKey();
          runtime.dirty = true;
        }
      }
      return {
        deviceId: runtime.state.identity.deviceId,
        approved: !!runtime.own,
        pendingApproval: !runtime.own,
        recoveryKey: runtime.state.recoveryKey,
        rootPublicKey: runtime.state.rootPublicKey,
        devicePublicKey: toBase64(runtime.native.publicKey()),
      };
    });
  }

  async approveDevice(requestId: string) {
    return this.run(false, async (runtime) => {
      const pending = runtime.status.pending.find(
        (entry) => entry.id === requestId
      );
      if (!pending?.proof)
        throw new Error(
          'This device request is unavailable or has not proved its key.'
        );
      const challenge = await verifyStatement(
        'enrollment',
        pending.proof,
        pending.challenge.signingKey,
        enrollmentSchema
      );
      if (
        JSON.stringify(challenge) !==
        JSON.stringify(enrollmentSchema.parse(pending.challenge))
      )
        throw new Error('The device approval challenge changed.');
      return this.approveChallenge(runtime, challenge);
    });
  }

  async revokeDevice(deviceId: string) {
    return this.run(false, async (runtime) => {
      const root = this.root(runtime);
      const statement = await signStatement(
        'device-revocation',
        {
          version: 1,
          profileId: this.scope.profileId,
          actorId: this.scope.actorId,
          deviceId,
          rootVersion: runtime.state.rootVersion,
          issuedAt: Date.now(),
          nonce: crypto.randomUUID(),
        },
        (purpose, payload) =>
          engineCall(() => root.signStatement(purpose, payload))
      );
      return this.api.deviceAction(
        z.object({ revoked: z.literal(true), deviceId: z.uuid() }).strict(),
        'revoke',
        { statement }
      );
    });
  }

  async activate(recoveryKeySaved: boolean) {
    if (!recoveryKeySaved)
      throw new Error(
        'Save the personal recovery key before activating encrypted messages.'
      );
    return this.run(false, async (runtime) => {
      if (!runtime.own || !runtime.state.recoveryKey)
        throw new Error(
          'Finish this approved device recovery-key setup first.'
        );
      const root = this.root(runtime);
      const secret = engineCall(() => root.exportSecret());
      let record;
      try {
        const payload = identityRecoverySchema.parse({
          version: 1,
          protocol: E2EE_PROTOCOL,
          kind: 'identity',
          ...this.scope,
          rootVersion: runtime.state.rootVersion,
          rootPublicKey: toBase64(root.publicKey()),
          rootSecret: toBase64(secret),
        });
        const clear = new TextEncoder().encode(JSON.stringify(payload));
        const keyBytes = fromBase64(runtime.state.recoveryKey, 32);
        try {
          record = await sealRecord(
            clear,
            await importAesKey(keyBytes),
            'identity-backup',
            backupContext(
              this.scope,
              runtime.state.rootVersion,
              'identity',
              null
            )
          );
        } finally {
          clear.fill(0);
          keyBytes.fill(0);
        }
      } finally {
        secret.fill(0);
      }
      const id = crypto.randomUUID();
      const digest = await sha256(
        new TextEncoder().encode(
          JSON.stringify(encryptedRecordSchema.parse(record))
        )
      );
      const rootAttestation = await signStatement(
        'identity-backup',
        backupAttestationSchema.parse({
          version: 1,
          ...this.scope,
          rootVersion: runtime.state.rootVersion,
          backupId: id,
          sha256: digest,
          issuedAt: Date.now(),
        }),
        (purpose, payload) =>
          engineCall(() => root.signStatement(purpose, payload))
      );
      const backup = await this.api.json(
        backupMetadataSchema,
        'POST',
        '/api/social/encryption/backups',
        {
          id,
          kind: 'identity',
          rootVersion: runtime.state.rootVersion,
          roomId: null,
          record,
          rootAttestation,
          mediaIds: [],
        },
        this.signer(runtime)
      );
      const statement = await signStatement(
        'profile-activation',
        activationSchema.parse({
          version: 1,
          ...this.scope,
          rootVersion: runtime.state.rootVersion,
          deviceId: runtime.state.identity.deviceId,
          backupId: backup.id,
          sha256: backup.sha256,
          recoveryKeySaved: true,
          issuedAt: Date.now(),
          nonce: crypto.randomUUID(),
        }),
        (purpose, payload) =>
          engineCall(() => root.signStatement(purpose, payload))
      );
      return this.api.json(
        z
          .object({
            encryptionRequired: z.literal(true),
            rootVersion: z.number(),
          })
          .strict(),
        'POST',
        '/api/social/encryption/activation',
        { statement },
        this.signer(runtime)
      );
    });
  }

  private approved(runtime: Runtime) {
    if (runtime.status.identity?.rotationRequired)
      throw new Error(
        'Profile ownership changed. A current owner must reset and reverify the encryption identity before sending.'
      );
    if (!runtime.own)
      throw new Error('Wait for a profile owner to approve this device.');
    if (!runtime.status.identity?.encryptionRequired)
      throw new Error(
        'Save the recovery key and activate encrypted messaging for this profile first.'
      );
  }

  private assertRoster(
    runtime: Runtime,
    cryptoGroupId: string,
    roster: DirectoryDevice[]
  ) {
    const info = this.nativeInfo(runtime, cryptoGroupId);
    const actual = info.members
      .map(
        (member) =>
          `${member.identity}:${toBase64(Uint8Array.from(member.public_key))}`
      )
      .sort();
    const expected = roster
      .map((member) => `${member.credential}:${member.signingKey}`)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(
        'The authenticated MLS roster differs from its signed membership intent.'
      );
    return info;
  }

  private async trustRoster(
    runtime: Runtime,
    roomId: string,
    roster: DirectoryDevice[],
    approvals: RootApproval[],
    atTime = Date.now(),
    historical = false
  ) {
    const missing: ParticipantVerificationRequired['participants'] = [];
    const additions: LocalDeviceState['trustedRoots'] = [];
    const roomAdditions: LocalDeviceState['roomApprovals'] = [];
    for (const device of roster) {
      await verifyDirectoryDevice(device, device.rootPublicKey, atTime);
      const known = runtime.state.trustedRoots.filter(
        (entry) => entry.actorId === device.actorId
      );
      const highest = Math.max(0, ...known.map((entry) => entry.rootVersion));
      const exact = known.some(
        (entry) =>
          entry.rootVersion === device.rootVersion &&
          entry.rootPublicKey === device.rootPublicKey
      );
      if (!historical && highest > device.rootVersion)
        throw new Error(
          'The participant identity directory moved backwards. Do not send until it is verified.'
        );
      const self =
        device.actorId === this.scope.actorId &&
        device.profileId === this.scope.profileId &&
        device.rootPublicKey === runtime.state.rootPublicKey &&
        device.rootVersion === runtime.state.rootVersion;
      const approved = approvals.some(
        (entry) =>
          entry.actorId === device.actorId &&
          entry.rootPublicKey === device.rootPublicKey
      );
      const roomApproved = runtime.state.roomApprovals.some(
        (entry) =>
          entry.roomId === roomId &&
          entry.actorId === device.actorId &&
          entry.rootPublicKey === device.rootPublicKey &&
          entry.rootVersion === device.rootVersion
      );
      if ((!exact || !roomApproved) && !self && !approved) {
        if (
          !missing.some(
            (entry) =>
              entry.actorId === device.actorId &&
              entry.rootPublicKey === device.rootPublicKey
          )
        )
          missing.push({
            actorId: device.actorId,
            profileId: device.profileId,
            rootPublicKey: device.rootPublicKey,
            rootVersion: device.rootVersion,
            changed: known.length > 0,
          });
      } else {
        const entry = {
          actorId: device.actorId,
          profileId: device.profileId,
          rootPublicKey: device.rootPublicKey,
          rootVersion: device.rootVersion,
        };
        if (!exact) additions.push(entry);
        if (!roomApproved) roomAdditions.push({ ...entry, roomId });
      }
    }
    if (missing.length) throw new ParticipantVerificationRequired(missing);
    for (const entry of additions) {
      if (
        !runtime.state.trustedRoots.some(
          (known) =>
            known.actorId === entry.actorId &&
            known.rootVersion === entry.rootVersion &&
            known.rootPublicKey === entry.rootPublicKey
        )
      ) {
        runtime.state.trustedRoots.push(entry);
        runtime.dirty = true;
      }
    }
    for (const entry of roomAdditions) {
      if (
        !runtime.state.roomApprovals.some(
          (known) =>
            known.roomId === roomId &&
            known.actorId === entry.actorId &&
            known.rootVersion === entry.rootVersion &&
            known.rootPublicKey === entry.rootPublicKey
        )
      ) {
        runtime.state.roomApprovals.push(entry);
        runtime.dirty = true;
      }
    }
    for (const device of roster) {
      const known = runtime.state.approvedKeys.find(
        (entry) => entry.credential === device.credential
      );
      if (known && known.signingKey !== device.signingKey)
        throw new Error(
          'An approved device signing key changed without a fresh identity.'
        );
      if (!known) {
        runtime.dirty = true;
        engineCall(() =>
          runtime.native.approveIdentity(
            device.credential,
            fromBase64(device.signingKey, 32)
          )
        );
        runtime.state.approvedKeys.push({
          credential: device.credential,
          signingKey: device.signingKey,
        });
      }
    }
  }

  private async verifyRestart(
    runtime: Runtime,
    metadata: RoomSnapshot,
    approvals: RootApproval[]
  ) {
    const proof = metadata.restart;
    if (!proof)
      throw new Error(
        'The secure session changed without an authenticated restart.'
      );
    const intent = await verifyStatement(
      'room-intent',
      proof.intent,
      proof.author.signingKey,
      roomRestartSchema
    );
    if (
      intent.roomId !== metadata.id ||
      intent.cryptoGroupId !== metadata.cryptoGroupId ||
      intent.deviceId !== proof.author.deviceId ||
      intent.profileId !== proof.author.profileId ||
      intent.actorId !== proof.author.actorId ||
      intent.cryptoGroupId === intent.previousCryptoGroupId ||
      metadata.sequence < intent.previousSequence ||
      metadata.revision <= intent.previousRevision
    )
      throw new Error(
        'The secure-session restart does not authenticate this exact room transition.'
      );
    await this.trustRoster(
      runtime,
      metadata.id,
      [proof.author],
      approvals,
      intent.issuedAt,
      true
    );
    return intent;
  }

  private async joinRoom(
    runtime: Runtime,
    metadata: RoomSnapshot,
    approvals: RootApproval[]
  ) {
    let local = runtime.state.rooms.find(
      (entry) => entry.roomId === metadata.id
    );
    if (local && local.cryptoGroupId !== metadata.cryptoGroupId) {
      const restart = await this.verifyRestart(runtime, metadata, approvals);
      if (
        restart.previousCryptoGroupId !== local.cryptoGroupId ||
        local.cursor > restart.previousSequence ||
        runtime.state.outbox.some((entry) => entry.roomId === metadata.id)
      )
        throw new Error(
          'This device missed an authenticated session transition or has unresolved delivery. Recover onto fresh device keys.'
        );
      const previous = this.nativeInfo(runtime, local.cryptoGroupId);
      runtime.dirty = true;
      engineCall(() =>
        runtime.native.discardRoom(local!.cryptoGroupId, previous.epoch)
      );
      runtime.state.rooms = runtime.state.rooms.filter(
        (entry) => entry.roomId !== metadata.id
      );
      local = undefined;
    }
    if (local?.blocked) throw new Error(local.blocked);
    const invitation = metadata.welcome;
    const newerInvitation =
      invitation && (!local || invitation.sequence > local.cursor);
    if (newerInvitation) {
      const quarantined = runtime.state.blockedWelcomes.find(
        (entry) =>
          entry.roomId === metadata.id && entry.eventId === invitation.eventId
      );
      if (quarantined) throw new Error(quarantined.reason);
      await this.trustRoster(
        runtime,
        metadata.id,
        invitation.roster,
        approvals,
        Date.parse(invitation.createdAt),
        true
      );
      const unverified = membershipIntentSchema.parse(
        JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            fromBase64(invitation.intent.payload, 16 * 1024)
          )
        )
      );
      const author = invitation.roster.find(
        (entry) => entry.deviceId === unverified.deviceId
      );
      if (!author)
        throw new Error(
          'The invitation author is missing from its authorized roster.'
        );
      const intent = await verifyStatement(
        'room-intent',
        invitation.intent,
        author.signingKey,
        membershipIntentSchema
      );
      if (
        intent.roomId !== metadata.id ||
        intent.cryptoGroupId !== metadata.cryptoGroupId ||
        intent.operation !== 'add' ||
        intent.targetDeviceId !== runtime.state.identity.deviceId ||
        intent.keyPackageId !== invitation.keyPackageId ||
        intent.previousSequence + 1 !== invitation.sequence ||
        intent.nextRosterDigest !== (await rosterDigest(invitation.roster)) ||
        intent.welcomeSha256 !==
          (await sha256(fromBase64(invitation.frame, 1024 * 1024)))
      )
        throw new Error(
          'This welcome is not bound to the exact authorized membership change.'
        );
      if (local) {
        const previousGroupId = local.cryptoGroupId;
        const info = this.nativeInfo(runtime, previousGroupId);
        if (BigInt(intent.toEpoch) <= BigInt(info.epoch))
          throw new Error('A secure invitation cannot rewind the room epoch.');
        runtime.dirty = true;
        engineCall(() =>
          runtime.native.discardRoom(previousGroupId, info.epoch)
        );
      }
      runtime.dirty = true;
      let info: z.infer<typeof nativeRoomSchema>;
      try {
        engineCall(() =>
          runtime.native.joinRoom(
            metadata.cryptoGroupId,
            fromBase64(invitation.frame, 1024 * 1024)
          )
        );
        info = this.assertRoster(
          runtime,
          metadata.cryptoGroupId,
          invitation.roster
        );
        if (info.epoch !== intent.toEpoch)
          throw new Error(
            'The welcome epoch does not match its signed intent.'
          );
      } catch (failure) {
        const reason =
          'This device could not authenticate its secure invitation. Do not retry consumed invitation keys; recover a fresh approved device.';
        runtime.state.blockedWelcomes = runtime.state.blockedWelcomes.filter(
          (entry) => entry.roomId !== metadata.id
        );
        runtime.state.blockedWelcomes.push({
          roomId: metadata.id,
          eventId: invitation.eventId,
          reason,
        });
        if (local) local.blocked = reason;
        throw new Error(reason, { cause: failure });
      }
      runtime.state.blockedWelcomes = runtime.state.blockedWelcomes.filter(
        (entry) => entry.roomId !== metadata.id
      );
      if (local) {
        local.cursor = invitation.sequence;
        local.roster = invitation.roster;
        local.epoch = info.epoch;
        local.ownReceipts = [];
      } else {
        local = {
          roomId: metadata.id,
          cryptoGroupId: metadata.cryptoGroupId,
          cursor: invitation.sequence,
          roster: invitation.roster,
          epoch: info.epoch,
          blocked: null,
          ownReceipts: [],
        };
        runtime.state.rooms.push(local);
      }
      await this.flush(runtime);
      return local;
    }
    if (
      !local &&
      metadata.founderDeviceId === runtime.state.identity.deviceId
    ) {
      const restarted = metadata.restart
        ? await this.verifyRestart(runtime, metadata, approvals)
        : null;
      if (restarted && restarted.deviceId !== runtime.state.identity.deviceId)
        throw new Error(
          'The secure-session restart did not authorize this founding device.'
        );
      const start = restarted?.previousSequence ?? 0;
      if (metadata.sequence !== start || metadata.epoch !== '0')
        throw new Error(
          'The original secure room state is missing. Recover a fresh device instead of recreating old live keys.'
        );
      await this.trustRoster(runtime, metadata.id, metadata.roster, approvals);
      runtime.dirty = true;
      engineCall(() => runtime.native.createRoom(metadata.cryptoGroupId));
      const info = this.assertRoster(
        runtime,
        metadata.cryptoGroupId,
        metadata.roster
      );
      local = {
        roomId: metadata.id,
        cryptoGroupId: metadata.cryptoGroupId,
        cursor: start,
        roster: metadata.roster,
        epoch: info.epoch,
        blocked: null,
        ownReceipts: [],
      };
      runtime.state.rooms.push(local);
      await this.flush(runtime);
    }
    if (!local && metadata.joined)
      throw new Error(
        'A fresh authenticated welcome is required for this device.'
      );
    return local ?? null;
  }

  private async acceptReceipt(
    runtime: Runtime,
    entry: OutboxEntry,
    receipt: DeliveryReceipt
  ) {
    if (
      receipt.id !== entry.event.id ||
      receipt.clientId !== entry.event.clientId ||
      receipt.roomId !== entry.roomId ||
      receipt.cryptoGroupId !== entry.event.cryptoGroupId ||
      receipt.kind !== entry.event.kind ||
      receipt.frameSha256 !== entry.event.frameSha256 ||
      receipt.revision !== entry.event.revision ||
      receipt.fromEpoch !== entry.event.epoch ||
      receipt.envelopeSha256 !==
        (await sha256(
          new TextEncoder().encode(
            JSON.stringify(submitRoomEventSchema.parse(entry.event))
          )
        ))
    )
      throw new Error(
        'The delivery receipt does not acknowledge the exact saved ciphertext attempt.'
      );
    const local = this.localRoom(runtime, entry.roomId);
    if (entry.event.kind === 'commit') {
      if (
        !entry.nextRoster ||
        receipt.sequence !== entry.event.afterSequence + 1 ||
        receipt.acceptedEpoch !== (BigInt(entry.event.epoch) + 1n).toString()
      )
        throw new Error(
          'The membership receipt does not match the saved staged transition.'
        );
      runtime.dirty = true;
      engineCall(() =>
        runtime.native.acknowledgeCommit(entry.event.cryptoGroupId)
      );
      const info = this.assertRoster(
        runtime,
        entry.event.cryptoGroupId,
        entry.nextRoster
      );
      if (info.epoch !== receipt.acceptedEpoch)
        throw new Error('The accepted MLS epoch is inconsistent.');
      local.roster = entry.nextRoster;
      local.epoch = info.epoch;
      local.cursor = receipt.sequence;
    } else {
      if (
        !entry.message ||
        !receipt.expiresAt ||
        receipt.acceptedEpoch !== entry.event.epoch ||
        Date.parse(receipt.expiresAt) > Date.parse(entry.message.expiresAt)
      )
        throw new Error(
          'The message receipt is missing or contradicts retained-history metadata.'
        );
      const expiresAt = new Date(
        Math.min(
          Date.parse(entry.message.expiresAt),
          Date.parse(receipt.expiresAt)
        )
      ).toISOString();
      runtime.changes.history = [
        ...(runtime.changes.history ?? []),
        {
          roomId: entry.roomId,
          id: entry.event.id,
          sequence: receipt.sequence,
          expiresAt,
          createdAt: receipt.createdAt,
          message: entry.message,
        },
      ];
      local.ownReceipts.push(receipt);
      runtime.state.pendingSends = runtime.state.pendingSends.filter(
        (pending) => pending.clientId !== entry.event.clientId
      );
      runtime.state.pendingMedia = runtime.state.pendingMedia.filter(
        (pending) => pending.clientId !== entry.event.clientId
      );
    }
    runtime.state.outbox = runtime.state.outbox.filter(
      (pending) => pending.event.id !== entry.event.id
    );
    runtime.dirty = true;
    await this.flush(runtime);
    return receipt;
  }

  private async deliver(
    runtime: Runtime,
    entry: OutboxEntry
  ): Promise<
    | { accepted: true; receipt: DeliveryReceipt }
    | { accepted: false; code: string; error: string }
  > {
    await this.flush(runtime);
    try {
      const receipt = await this.api.json(
        receiptSchema,
        'POST',
        `/api/social/encryption/rooms/${entry.roomId}/events`,
        entry.event,
        this.signer(runtime)
      );
      return {
        accepted: true,
        receipt: await this.acceptReceipt(runtime, entry, receipt),
      };
    } catch (error) {
      if (
        error instanceof EncryptedApiError &&
        error.status === 409 &&
        error.code === 'MESSAGE_ALREADY_ACCEPTED' &&
        entry.event.kind === 'message'
      ) {
        runtime.state.outbox = runtime.state.outbox.filter(
          (pending) => pending.event.id !== entry.event.id
        );
        runtime.state.pendingSends = runtime.state.pendingSends.filter(
          (pending) => pending.clientId !== entry.event.clientId
        );
        const media = runtime.state.pendingMedia.filter(
          (pending) => pending.clientId === entry.event.clientId
        );
        runtime.changes.removeMedia = [
          ...(runtime.changes.removeMedia ?? []),
          ...media.map((pending) => pending.manifest.id),
        ];
        runtime.state.pendingMedia = runtime.state.pendingMedia.filter(
          (pending) => pending.clientId !== entry.event.clientId
        );
        runtime.dirty = true;
        await this.flush(runtime);
        throw new Error(
          'This logical message ID was already delivered. No second message was sent; use a fresh ID for a different message.',
          { cause: error }
        );
      }
      if (
        error instanceof EncryptedApiError &&
        error.status === 409 &&
        [
          'STALE_ROOM_STATE',
          'MEMBERSHIP_CHANGED',
          'PREKEY_UNAVAILABLE',
          'PREKEY_ALREADY_USED',
        ].includes(error.code)
      ) {
        if (entry.event.kind === 'commit') {
          runtime.dirty = true;
          engineCall(() =>
            runtime.native.discardRejectedCommit(entry.event.cryptoGroupId)
          );
        }
        runtime.state.outbox = runtime.state.outbox.filter(
          (pending) => pending.event.id !== entry.event.id
        );
        runtime.dirty = true;
        await this.flush(runtime);
        return { accepted: false, code: error.code, error: error.message };
      }
      throw error;
    }
  }

  private async synchronize(
    runtime: Runtime,
    metadata: RoomSnapshot,
    approvals: RootApproval[]
  ) {
    for (const entry of [...runtime.state.outbox].filter(
      (entry) => entry.roomId === metadata.id
    )) {
      await this.deliver(runtime, entry);
    }
    metadata = await this.api.json(
      roomSnapshotSchema,
      'GET',
      `/api/social/encryption/rooms/${metadata.id}`,
      undefined,
      this.signer(runtime)
    );
    const local = await this.joinRoom(runtime, metadata, approvals);
    if (!local) return metadata;
    for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
      const page = await this.api.json(
        eventsPageSchema,
        'GET',
        `/api/social/encryption/rooms/${metadata.id}/events`,
        undefined,
        this.signer(runtime),
        { after: String(local.cursor), limit: '100' }
      );
      for (const event of page.events) {
        try {
          if (
            event.sequence !== local.cursor + 1 ||
            event.cryptoGroupId !== local.cryptoGroupId
          )
            throw new Error(
              'The ordered encrypted delivery log has a gap or changed sessions.'
            );
          if (
            event.frame !== null &&
            (await sha256(fromBase64(event.frame, 1024 * 1024))) !==
              event.frameSha256
          )
            throw new Error(
              'The encrypted delivery frame does not match its exact digest.'
            );
          if (event.frame === null) {
            if (event.kind !== 'message')
              throw new Error(
                'An ordered membership control frame is missing.'
              );
            runtime.changes.removeHistory = [
              ...(runtime.changes.removeHistory ?? []),
              { roomId: metadata.id, id: event.id },
            ];
            local.ownReceipts = local.ownReceipts.filter(
              (entry) => entry.id !== event.id
            );
          } else if (event.senderDeviceId === runtime.state.identity.deviceId) {
            const own = local.ownReceipts.find(
              (receipt) => receipt.id === event.id
            );
            if (
              !own ||
              own.frameSha256 !== event.frameSha256 ||
              own.sequence !== event.sequence ||
              own.clientId !== event.clientId ||
              own.roomId !== metadata.id ||
              own.cryptoGroupId !== event.cryptoGroupId ||
              own.fromEpoch !== event.fromEpoch ||
              own.kind !== event.kind ||
              own.envelopeSha256 !== event.envelopeSha256 ||
              own.acceptedEpoch !== event.acceptedEpoch ||
              own.revision !== event.revision ||
              own.expiresAt !== event.expiresAt ||
              own.createdAt !== event.createdAt ||
              event.senderActorId !== this.scope.actorId
            )
              throw new Error(
                'An unauthenticated own-message echo cannot acknowledge delivery.'
              );
            local.ownReceipts = local.ownReceipts.filter(
              (entry) => entry.id !== event.id
            );
          } else if (event.kind === 'commit') {
            if (!event.intent || !event.nextRoster)
              throw new Error(
                'The membership control frame is missing its signed intent.'
              );
            const sender = local.roster.find(
              (entry) => entry.deviceId === event.senderDeviceId
            );
            if (!sender || sender.actorId !== event.senderActorId)
              throw new Error(
                'The membership author is not in the authenticated prior roster.'
              );
            const intent = await verifyStatement(
              'room-intent',
              event.intent,
              sender.signingKey,
              membershipIntentSchema
            );
            if (
              intent.roomId !== metadata.id ||
              intent.cryptoGroupId !== local.cryptoGroupId ||
              intent.attemptId !== event.id ||
              intent.deviceId !== sender.deviceId ||
              intent.actorId !== sender.actorId ||
              intent.fromEpoch !== local.epoch ||
              intent.previousSequence !== local.cursor ||
              intent.revision !== event.revision ||
              intent.frameSha256 !== event.frameSha256 ||
              intent.previousRosterDigest !==
                (await rosterDigest(local.roster)) ||
              intent.nextRosterDigest !== (await rosterDigest(event.nextRoster))
            )
              throw new Error(
                'The private control frame is not bound to this exact ordered membership transition.'
              );
            const target = event.nextRoster.find(
              (entry) => entry.deviceId === intent.targetDeviceId
            );
            const expectedRoster =
              intent.operation === 'add' && target
                ? [...local.roster, target]
                : local.roster.filter(
                    (entry) => entry.deviceId !== intent.targetDeviceId
                  );
            if (
              (intent.operation === 'add' &&
                (!target ||
                  local.roster.some(
                    (entry) => entry.deviceId === target.deviceId
                  ))) ||
              (intent.operation === 'remove' &&
                !local.roster.some(
                  (entry) => entry.deviceId === intent.targetDeviceId
                )) ||
              (await rosterDigest(expectedRoster)) !== intent.nextRosterDigest
            )
              throw new Error(
                'The declared membership operation does not match its exact roster delta.'
              );
            await this.trustRoster(
              runtime,
              metadata.id,
              event.nextRoster,
              approvals,
              Date.parse(event.createdAt),
              true
            );
            runtime.dirty = true;
            const bytes = fromBase64(event.frame, 1024 * 1024);
            const result = nativeResultSchema.parse(
              JSON.parse(
                engineCall(() =>
                  runtime.native.processMessage(local.cryptoGroupId, bytes)
                )
              )
            );
            if (result.kind !== 'commit' || result.sender !== sender.credential)
              throw new Error(
                'The authenticated MLS control author does not match its membership intent.'
              );
            const info = this.assertRoster(
              runtime,
              local.cryptoGroupId,
              event.nextRoster
            );
            if (info.epoch !== intent.toEpoch)
              throw new Error(
                'The received MLS epoch differs from its authorized transition.'
              );
            local.roster = event.nextRoster;
            local.epoch = info.epoch;
          } else {
            const sender = local.roster.find(
              (entry) => entry.deviceId === event.senderDeviceId
            );
            if (!sender)
              throw new Error(
                'The message sender is absent from the authenticated room.'
              );
            runtime.dirty = true;
            const bytes = fromBase64(event.frame, 1024 * 1024);
            const result = nativeResultSchema.parse(
              JSON.parse(
                engineCall(() =>
                  runtime.native.processMessage(local.cryptoGroupId, bytes)
                )
              )
            );
            if (
              result.kind !== 'message' ||
              result.sender !== sender.credential
            )
              throw new Error(
                'The authenticated sender differs from the encrypted message routing identity.'
              );
            const clear = Uint8Array.from(result.content);
            let message: EncryptedMessage;
            try {
              message = encryptedMessageSchema.parse(
                JSON.parse(
                  new TextDecoder('utf-8', { fatal: true }).decode(clear)
                )
              );
            } finally {
              clear.fill(0);
            }
            if (
              message.roomId !== metadata.id ||
              message.cryptoGroupId !== local.cryptoGroupId ||
              message.attemptId !== event.id ||
              message.clientId !== event.clientId ||
              message.actorId !== sender.actorId ||
              message.profileId !== sender.profileId ||
              message.deviceId !== sender.deviceId ||
              !event.expiresAt ||
              JSON.stringify(
                message.attachments.map((entry) => entry.id).sort()
              ) !== JSON.stringify([...event.mediaIds].sort())
            )
              throw new Error(
                'The authenticated message does not bind its exact room, sender, retry or attachments.'
              );
            const expiresAt = new Date(
              Math.min(
                Date.parse(message.expiresAt),
                Date.parse(event.expiresAt)
              )
            ).toISOString();
            if (Date.parse(expiresAt) > Date.now()) {
              runtime.changes.history = [
                ...(runtime.changes.history ?? []),
                {
                  roomId: metadata.id,
                  id: event.id,
                  sequence: event.sequence,
                  expiresAt,
                  createdAt: event.createdAt,
                  message,
                },
              ];
            } else {
              runtime.changes.removeHistory = [
                ...(runtime.changes.removeHistory ?? []),
                { roomId: metadata.id, id: event.id },
              ];
            }
          }
          local.cursor = event.sequence;
          runtime.dirty = true;
        } catch (failure) {
          if (failure instanceof ParticipantVerificationRequired) throw failure;
          local.blocked =
            'This secure conversation could not authenticate its ordered update. Stop using these live keys and recover onto a fresh device with your personal key.';
          runtime.dirty = true;
          throw new Error(local.blocked, { cause: failure });
        }
      }
      metadata = page.room;
      await this.flush(runtime);
      if (local.cursor >= metadata.sequence || !page.events.length)
        return metadata;
    }
    throw new Error(
      'The secure conversation is still synchronizing. Continue its ordered update before sending.'
    );
  }

  private async visibleHistory(
    runtime: Runtime,
    roomId: string,
    before = Number.MAX_SAFE_INTEGER,
    limit = 100
  ) {
    const history = await this.vault.history(
      runtime.session,
      roomId,
      before,
      limit
    );
    if (!history.length) return { history, nextHistoryBefore: null };
    const policy: Array<{ id: string; visible: boolean; purge: boolean }> = [];
    for (
      let offset = 0;
      offset < history.length;
      offset += E2EE_VISIBILITY_BATCH
    ) {
      policy.push(
        ...(await this.api.json(
          z
            .array(
              z
                .object({
                  id: z.uuid(),
                  visible: z.boolean(),
                  purge: z.boolean(),
                })
                .strict()
            )
            .max(E2EE_VISIBILITY_BATCH),
          'GET',
          `/api/social/encryption/rooms/${roomId}/visibility`,
          undefined,
          this.signer(runtime),
          {
            ids: history
              .slice(offset, offset + E2EE_VISIBILITY_BATCH)
              .map((entry) => entry.id)
              .join(','),
          }
        ))
      );
    }
    const expected = new Set(history.map((entry) => entry.id));
    if (
      policy.length !== history.length ||
      new Set(policy.map((entry) => entry.id)).size !== expected.size ||
      policy.some((entry) => !expected.has(entry.id))
    )
      throw new Error(
        'The current encrypted-message visibility response is incomplete.'
      );
    const hidden = new Set(
      policy.filter((entry) => !entry.visible).map((entry) => entry.id)
    );
    const purged = new Set(
      policy.filter((entry) => entry.purge).map((entry) => entry.id)
    );
    if (purged.size) {
      runtime.changes.removeHistory = [
        ...(runtime.changes.removeHistory ?? []),
        ...[...purged].map((id) => ({ roomId, id })),
      ];
      runtime.changes.removeMedia = [
        ...(runtime.changes.removeMedia ?? []),
        ...history
          .filter((entry) => purged.has(entry.id))
          .flatMap((entry) => entry.message.attachments.map((file) => file.id)),
      ];
      await this.flush(runtime);
    }
    return {
      history: history.filter((entry) => !hidden.has(entry.id)),
      nextHistoryBefore: history.length === limit ? history[0].sequence : null,
    };
  }

  private async updateMembership(
    runtime: Runtime,
    metadata: RoomSnapshot,
    approvals: RootApproval[]
  ) {
    for (let actions = 0; actions < 64; actions++) {
      metadata = await this.synchronize(runtime, metadata, approvals);
      const local = runtime.state.rooms.find(
        (entry) => entry.roomId === metadata.id
      );
      if (!local || !metadata.joined) return metadata;
      await this.trustRoster(runtime, metadata.id, metadata.desired, approvals);
      const remove = local.roster.find(
        (entry) =>
          !metadata.desired.some(
            (wanted) =>
              wanted.deviceId === entry.deviceId &&
              wanted.signingKey === entry.signingKey
          )
      );
      const add = metadata.desired.find(
        (entry) =>
          !local.roster.some(
            (current) =>
              current.deviceId === entry.deviceId &&
              current.signingKey === entry.signingKey
          )
      );
      if (!remove && !add) {
        this.assertRoster(runtime, local.cryptoGroupId, metadata.roster);
        return metadata;
      }
      if (remove?.deviceId === runtime.state.identity.deviceId)
        throw new Error(
          'This device is no longer authorized in the current secure membership.'
        );
      const operation = remove ? 'remove' : 'add';
      let claimed: z.infer<typeof claimedPackageSchema> | null = null;
      const target = remove ?? add;
      if (!target) throw new Error('The secure membership target is missing.');
      let frames: z.infer<typeof membershipFramesSchema>;
      if (operation === 'add') {
        claimed = await this.api.json(
          claimedPackageSchema,
          'POST',
          `/api/social/encryption/rooms/${metadata.id}/key-package`,
          { deviceId: target.deviceId },
          this.signer(runtime)
        );
        const packageBytes = fromBase64(claimed.bytes, 64 * 1024);
        const descriptor = memberSchema.parse(
          JSON.parse(
            engineCall(() =>
              runtime.engine.MlsDevice.describeKeyPackage(packageBytes)
            )
          )
        );
        if (
          claimed.target.deviceId !== target.deviceId ||
          claimed.target.credential !== target.credential ||
          claimed.target.signingKey !== target.signingKey ||
          claimed.revision !== metadata.revision ||
          claimed.epoch !== local.epoch ||
          (await sha256(packageBytes)) !== claimed.sha256 ||
          descriptor.identity !== target.credential ||
          toBase64(Uint8Array.from(descriptor.public_key)) !== target.signingKey
        )
          throw new Error(
            'The one-time key package does not match the authorized participant device.'
          );
        runtime.dirty = true;
        frames = membershipFramesSchema.parse(
          JSON.parse(
            engineCall(() =>
              runtime.native.addMember(local.cryptoGroupId, packageBytes)
            )
          )
        );
      } else {
        runtime.dirty = true;
        frames = membershipFramesSchema.parse(
          JSON.parse(
            engineCall(() =>
              runtime.native.removeMember(
                local.cryptoGroupId,
                target.credential
              )
            )
          )
        );
      }
      const id = crypto.randomUUID();
      const frame = toBase64(Uint8Array.from(frames.commit));
      const welcome = frames.welcome
        ? toBase64(Uint8Array.from(frames.welcome))
        : null;
      const nextRoster =
        operation === 'add'
          ? [...local.roster, target]
          : local.roster.filter((entry) => entry.deviceId !== target.deviceId);
      const frameSha256 = await sha256(Uint8Array.from(frames.commit));
      const intent = await signStatement(
        'room-intent',
        membershipIntentSchema.parse({
          version: 1,
          roomId: metadata.id,
          cryptoGroupId: local.cryptoGroupId,
          attemptId: id,
          actorId: this.scope.actorId,
          deviceId: runtime.state.identity.deviceId,
          revision: metadata.revision,
          previousSequence: local.cursor,
          fromEpoch: local.epoch,
          toEpoch: (BigInt(local.epoch) + 1n).toString(),
          previousRosterDigest: await rosterDigest(local.roster),
          nextRosterDigest: await rosterDigest(nextRoster),
          operation,
          targetDeviceId: target.deviceId,
          keyPackageId: claimed?.id ?? null,
          frameSha256,
          welcomeSha256: welcome ? await sha256(fromBase64(welcome)) : null,
        }),
        (purpose, payload) =>
          engineCall(() => runtime.native.signStatement(purpose, payload))
      );
      if (operation === 'add' && (!claimed || !welcome))
        throw new Error(
          'No private invitation was generated for this admission.'
        );
      const entry: OutboxEntry = {
        roomId: metadata.id,
        createdAt: new Date().toISOString(),
        message: null,
        nextRoster,
        event: {
          id,
          clientId: id,
          kind: 'commit',
          cryptoGroupId: local.cryptoGroupId,
          revision: metadata.revision,
          afterSequence: local.cursor,
          epoch: local.epoch,
          frame,
          frameSha256,
          expiresAt: null,
          intent,
          welcomes:
            claimed && welcome
              ? [
                  {
                    deviceId: target.deviceId,
                    keyPackageId: claimed.id,
                    frame: welcome,
                  },
                ]
              : [],
          mediaIds: [],
        },
      };
      runtime.state.outbox.push(entry);
      await this.deliver(runtime, entry);
      metadata = await this.api.json(
        roomSnapshotSchema,
        'GET',
        `/api/social/encryption/rooms/${metadata.id}`,
        undefined,
        this.signer(runtime)
      );
    }
    throw new Error(
      'Secure membership is still updating. Continue synchronization before sending.'
    );
  }

  async openConversation(
    input:
      { kind: 'dm'; peerActorId: string } | { kind: 'group'; groupId: string },
    approvals: RootApproval[] = []
  ) {
    return this.run(false, async (runtime) => {
      this.approved(runtime);
      await this.publishPrekeys(runtime);
      let room = await this.api.json(
        roomSnapshotSchema,
        'POST',
        '/api/social/encryption/rooms',
        input,
        this.signer(runtime)
      );
      room = await this.updateMembership(runtime, room, approvals);
      await this.flush(runtime);
      return {
        room,
        ...(await this.visibleHistory(runtime, room.id)),
        pending: runtime.state.pendingSends
          .filter((entry) => entry.roomId === room.id)
          .map((entry) => ({
            clientId: entry.clientId,
            content: entry.content,
            createdAt: new Date(
              Date.parse(entry.expiresAt) - E2EE_MESSAGE_MS
            ).toISOString(),
          })),
      };
    });
  }

  async conversation(
    roomId: string,
    approvals: RootApproval[] = []
  ): Promise<ConversationView> {
    return this.run(false, async (runtime) => {
      this.approved(runtime);
      await this.publishPrekeys(runtime);
      let room = await this.api.json(
        roomSnapshotSchema,
        'GET',
        `/api/social/encryption/rooms/${roomId}`,
        undefined,
        this.signer(runtime)
      );
      room = await this.updateMembership(runtime, room, approvals);
      await this.flush(runtime);
      return {
        room,
        ...(await this.visibleHistory(runtime, room.id)),
        pending: runtime.state.pendingSends
          .filter((entry) => entry.roomId === room.id)
          .map((entry) => ({
            clientId: entry.clientId,
            content: entry.content,
            createdAt: new Date(
              Date.parse(entry.expiresAt) - E2EE_MESSAGE_MS
            ).toISOString(),
          })),
      };
    });
  }

  async restartConversation(
    roomId: string,
    acknowledgeFreshSession: boolean,
    approvals: RootApproval[] = []
  ) {
    if (!acknowledgeFreshSession)
      throw new Error('Explicitly acknowledge a fresh secure session first.');
    return this.run(false, async (runtime) => {
      this.approved(runtime);
      const metadata = await this.api.json(
        roomSnapshotSchema,
        'GET',
        `/api/social/encryption/rooms/${roomId}`,
        undefined,
        this.signer(runtime)
      );
      if (
        !metadata.canRestart ||
        runtime.state.outbox.some((entry) => entry.roomId === roomId)
      )
        throw new Error(
          'An existing approved participant must update this room, or its pending delivery must be resolved first.'
        );
      const statement = await signStatement(
        'room-intent',
        roomRestartSchema.parse({
          version: 1,
          operation: 'restart',
          requestId: crypto.randomUUID(),
          roomId,
          previousCryptoGroupId: metadata.cryptoGroupId,
          cryptoGroupId: crypto.randomUUID(),
          previousSequence: metadata.sequence,
          previousRevision: metadata.revision,
          previousRosterDigest: metadata.rosterDigest,
          profileId: this.scope.profileId,
          actorId: this.scope.actorId,
          deviceId: runtime.state.identity.deviceId,
          issuedAt: Date.now(),
        }),
        (purpose, payload) =>
          engineCall(() => runtime.native.signStatement(purpose, payload))
      );
      const restarted = await this.api.json(
        roomSnapshotSchema,
        'POST',
        `/api/social/encryption/rooms/${roomId}/restart`,
        { statement, acknowledgeFreshSession: true },
        this.signer(runtime)
      );
      await this.updateMembership(runtime, restarted, approvals);
      await this.flush(runtime);
      return restarted;
    });
  }

  private async sendPending(
    runtime: Runtime,
    clientId: string,
    approvals: RootApproval[]
  ) {
    const saved = runtime.state.outbox.find(
      (entry) =>
        entry.event.clientId === clientId && entry.event.kind === 'message'
    );
    if (saved) {
      const delivered = await this.deliver(runtime, saved);
      if (delivered.accepted) return delivered.receipt;
    }
    const pending = runtime.state.pendingSends.find(
      (entry) => entry.clientId === clientId
    );
    if (!pending)
      throw new Error(
        'This message is already acknowledged or is not in this device outbox.'
      );
    if (Date.parse(pending.expiresAt) <= Date.now())
      throw new Error('An expired message cannot be retried.');
    for (const id of pending.mediaIds) {
      const attachment = runtime.state.pendingMedia.find(
        (entry) => entry.manifest.id === id && entry.clientId === clientId
      );
      const bytes = await this.vault.media(id);
      if (!attachment || !bytes)
        throw new Error(
          'A pending encrypted attachment is missing. Reattach it as a new message.'
        );
      await this.api.json(
        z
          .object({
            id: z.uuid(),
            state: z.enum(['reserved', 'stored', 'bound']),
          })
          .strict(),
        'POST',
        '/api/social/encryption/media',
        {
          id,
          roomId: pending.roomId,
          byteLength: bytes.length,
          sha256: attachment.manifest.sha256,
        },
        this.signer(runtime)
      );
      await this.api.media('PUT', id, this.signer(runtime), bytes);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      let metadata = await this.api.json(
        roomSnapshotSchema,
        'GET',
        `/api/social/encryption/rooms/${pending.roomId}`,
        undefined,
        this.signer(runtime)
      );
      metadata = await this.updateMembership(runtime, metadata, approvals);
      const local = this.localRoom(runtime, pending.roomId);
      if (
        metadata.state !== 'active' ||
        !metadata.joined ||
        local.cursor !== metadata.sequence
      )
        throw new Error(
          'Wait for the secure membership update before sending. No plaintext fallback is available.'
        );
      const id = crypto.randomUUID();
      const attachments = pending.mediaIds.map((id) => {
        const attachment = runtime.state.pendingMedia.find(
          (entry) => entry.manifest.id === id && entry.clientId === clientId
        );
        if (!attachment)
          throw new Error('The saved attachment key is missing.');
        return attachment.manifest;
      });
      const message = encryptedMessageSchema.parse({
        version: 1,
        roomId: pending.roomId,
        cryptoGroupId: local.cryptoGroupId,
        clientId,
        attemptId: id,
        profileId: this.scope.profileId,
        actorId: this.scope.actorId,
        deviceId: runtime.state.identity.deviceId,
        expiresAt: pending.expiresAt,
        content: pending.content,
        attachments,
      });
      const clear = new TextEncoder().encode(JSON.stringify(message));
      let frame: Uint8Array;
      try {
        runtime.dirty = true;
        frame = engineCall(() =>
          runtime.native.encryptMessage(local.cryptoGroupId, clear)
        );
      } finally {
        clear.fill(0);
      }
      const entry: OutboxEntry = {
        roomId: pending.roomId,
        createdAt: new Date().toISOString(),
        message,
        nextRoster: null,
        event: {
          id,
          clientId,
          kind: 'message',
          cryptoGroupId: local.cryptoGroupId,
          revision: metadata.revision,
          afterSequence: local.cursor,
          epoch: local.epoch,
          frame: toBase64(frame),
          frameSha256: await sha256(frame),
          expiresAt: pending.expiresAt,
          intent: null,
          welcomes: [],
          mediaIds: pending.mediaIds,
        },
      };
      runtime.state.outbox.push(entry);
      const result = await this.deliver(runtime, entry);
      if (result.accepted) return result.receipt;
      if (attempt === 1)
        throw new EncryptedApiError(409, result.code, result.error);
    }
    throw new Error('The encrypted delivery attempt did not finish.');
  }

  async send(
    roomId: string,
    clientId: string,
    content: string,
    files: File[] = [],
    approvals: RootApproval[] = []
  ): Promise<DeliveryReceipt> {
    z.uuid().parse(clientId);
    z.uuid().parse(roomId);
    if (
      content.length > 5000 ||
      (!content.trim() && !files.length) ||
      files.length > 4
    )
      throw new Error(
        'Write a message of 5,000 characters or fewer and attach no more than four supported files.'
      );
    const prepared: Array<{
      name: string;
      mediaType: string;
      bytes: Uint8Array;
    }> = [];
    for (const file of files) {
      if (!file.size || file.size > 10 * 1024 * 1024)
        throw new Error('Choose a non-empty attachment of 10 MB or less.');
      prepared.push({
        name: file.name,
        mediaType: file.type.split(';')[0].toLowerCase(),
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
    }
    const digest = await sha256(
      new TextEncoder().encode(
        JSON.stringify({
          content,
          files: await Promise.all(
            prepared.map(async (file) => ({
              name: file.name,
              mediaType: file.mediaType,
              size: file.bytes.length,
              sha256: await sha256(file.bytes),
            }))
          ),
        })
      )
    );
    try {
      return await this.run(false, async (runtime) => {
        this.approved(runtime);
        const previous = runtime.state.pendingSends.find(
          (entry) => entry.clientId === clientId
        );
        if (
          previous &&
          (previous.roomId !== roomId || previous.draftHash !== digest)
        )
          throw new Error(
            'A message retry must contain its original text and attachments.'
          );
        if (!previous) {
          let metadata = await this.api.json(
            roomSnapshotSchema,
            'GET',
            `/api/social/encryption/rooms/${roomId}`,
            undefined,
            this.signer(runtime)
          );
          metadata = await this.updateMembership(runtime, metadata, approvals);
          if (metadata.state !== 'active' || !metadata.joined)
            throw new Error(
              'This secure conversation is still waiting for its membership update.'
            );
          const expiresAt = new Date(
            Date.now() + E2EE_MESSAGE_MS - 1000
          ).toISOString();
          const mediaIds: string[] = [];
          for (const file of prepared) {
            const encrypted = await encryptMedia(
              roomId,
              file.bytes,
              file.name,
              file.mediaType
            );
            mediaIds.push(encrypted.manifest.id);
            runtime.state.pendingMedia.push({
              roomId,
              clientId,
              manifest: encrypted.manifest,
            });
            runtime.changes.media = [
              ...(runtime.changes.media ?? []),
              {
                id: encrypted.manifest.id,
                bytes: encrypted.ciphertext,
                expiresAt,
              },
            ];
          }
          runtime.state.pendingSends.push({
            roomId,
            clientId,
            content,
            expiresAt,
            mediaIds,
            draftHash: digest,
          });
          runtime.dirty = true;
          await this.flush(runtime);
        }
        return this.sendPending(runtime, clientId, approvals);
      });
    } finally {
      for (const file of prepared) file.bytes.fill(0);
    }
  }

  async retry(clientId: string, approvals: RootApproval[] = []) {
    return this.run(false, async (runtime) => {
      this.approved(runtime);
      return this.sendPending(runtime, clientId, approvals);
    });
  }

  async olderHistory(roomId: string, before: number) {
    z.number().int().positive().parse(before);
    return this.run(false, async (runtime) => {
      this.approved(runtime);
      await this.api.json(
        roomSnapshotSchema,
        'GET',
        `/api/social/encryption/rooms/${roomId}`,
        undefined,
        this.signer(runtime)
      );
      return this.visibleHistory(runtime, roomId, before);
    });
  }

  async attachment(roomId: string, value: unknown, expiresAt: string) {
    const manifest = encryptedAttachmentSchema.parse(value);
    if (Date.parse(expiresAt) <= Date.now())
      throw new Error('This attachment has expired.');
    return this.run(false, async (runtime) => {
      this.approved(runtime);
      let bytes = await this.vault.media(manifest.id);
      if (!bytes) {
        const recovery = runtime.state.recoveredMedia.find(
          (entry) => entry.id === manifest.id
        );
        bytes = await this.api.media(
          'GET',
          manifest.id,
          this.signer(runtime),
          undefined,
          recovery?.backupId
        );
        if (!bytes)
          throw new Error('The encrypted attachment response is missing.');
        runtime.changes.media = [
          ...(runtime.changes.media ?? []),
          { id: manifest.id, bytes, expiresAt },
        ];
      }
      const decrypted = await decryptMedia(roomId, manifest, bytes);
      await this.flush(runtime);
      return decrypted;
    });
  }

  async removeMessage(roomId: string, id: string) {
    return this.run(false, async (runtime) => {
      this.approved(runtime);
      await this.api.json(
        z.object({ deleted: z.literal(true), id: z.uuid() }).strict(),
        'DELETE',
        `/api/social/encryption/rooms/${roomId}/events/${id}`,
        undefined,
        this.signer(runtime)
      );
      runtime.changes.removeHistory = [{ roomId, id }];
      runtime.dirty = true;
    });
  }

  async backupConversation(roomId: string) {
    return this.run(false, async (runtime) => {
      this.approved(runtime);
      if (!runtime.state.recoveryKey)
        throw new Error(
          'Enter the personal recovery key to enable encrypted backups on this device.'
        );
      const metadata = await this.api.json(
        roomSnapshotSchema,
        'GET',
        `/api/social/encryption/rooms/${roomId}`,
        undefined,
        this.signer(runtime)
      );
      await this.synchronize(runtime, metadata, []);
      const entries: HistoryEntry[] = [];
      let before = Number.MAX_SAFE_INTEGER;
      for (;;) {
        const page = await this.visibleHistory(runtime, roomId, before, 100);
        entries.unshift(...page.history);
        if (entries.length > 10000)
          throw new Error(
            'This retained history exceeds the supported backup size; no partial backup was saved.'
          );
        if (page.nextHistoryBefore === null) break;
        before = page.nextHistoryBefore;
      }
      const payload = historyRecoverySchema.parse({
        version: 1,
        protocol: E2EE_PROTOCOL,
        kind: 'history',
        ...this.scope,
        roomId,
        entries: entries.map(
          ({ id, sequence, expiresAt, createdAt, message }) => ({
            id,
            sequence,
            expiresAt,
            createdAt,
            message,
          })
        ),
      });
      const clear = new TextEncoder().encode(JSON.stringify(payload));
      if (clear.length > E2EE_MAX_BACKUP_BYTES - 16) {
        clear.fill(0);
        throw new Error(
          'This retained history exceeds the supported backup size; no partial backup was saved.'
        );
      }
      const secret = fromBase64(runtime.state.recoveryKey, 32);
      let record;
      try {
        record = await sealRecord(
          clear,
          await importAesKey(secret),
          'history-backup',
          backupContext(
            this.scope,
            runtime.state.rootVersion,
            'history',
            roomId
          )
        );
      } finally {
        secret.fill(0);
        clear.fill(0);
      }
      const mediaIds = [
        ...new Set(
          entries.flatMap((entry) =>
            entry.message.attachments.map((file) => file.id)
          )
        ),
      ];
      return this.api.json(
        backupMetadataSchema,
        'POST',
        '/api/social/encryption/backups',
        {
          id: crypto.randomUUID(),
          kind: 'history',
          rootVersion: runtime.state.rootVersion,
          roomId,
          record,
          rootAttestation: null,
          mediaIds,
        },
        this.signer(runtime)
      );
    });
  }

  async recover(recoveryKey: string) {
    const secret = fromBase64(recoveryKey.trim(), 32);
    if (secret.length !== 32)
      throw new Error('Enter the full 256-bit personal recovery key.');
    secret.fill(0);
    const restored = await this.run(true, async (runtime) => {
      const backups = await this.retainedBackups();
      if (!backups.length)
        throw new Error(
          'No retained encrypted backups are available for this account and profile.'
        );
      let identityRestored = false;
      let messagesRestored = 0;
      let openedBackups = 0;
      let unavailableBackups = 0;
      for (const metadata of backups) {
        if (
          metadata.kind === 'identity' &&
          metadata.rootVersion !== runtime.status.identity?.rootVersion
        )
          continue;
        const backup = await this.api.json(
          backupMetadataSchema
            .extend({ record: encryptedRecordSchema })
            .strict(),
          'GET',
          `/api/social/encryption/backups/${metadata.id}`
        );
        const bytes = fromBase64(recoveryKey.trim(), 32);
        let clear: Uint8Array;
        try {
          try {
            clear = await unsealRecord(
              backup.record,
              await importAesKey(bytes),
              metadata.kind === 'identity'
                ? 'identity-backup'
                : 'history-backup',
              backupContext(
                this.scope,
                metadata.rootVersion,
                metadata.kind,
                metadata.roomId
              )
            );
          } catch (failure) {
            if (
              failure instanceof Error &&
              failure.cause instanceof DOMException &&
              failure.cause.name === 'OperationError'
            ) {
              unavailableBackups++;
              continue;
            }
            throw failure;
          }
        } finally {
          bytes.fill(0);
        }
        openedBackups++;
        try {
          const value: unknown = JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(clear)
          );
          if (metadata.kind === 'identity') {
            const payload = identityRecoverySchema.parse(value);
            if (
              payload.userId !== this.scope.userId ||
              payload.profileId !== this.scope.profileId ||
              payload.actorId !== this.scope.actorId ||
              payload.rootPublicKey !==
                runtime.status.identity?.rootPublicKey ||
              payload.rootVersion !== runtime.status.identity.rootVersion
            )
              throw new Error(
                'The recovered authorization key belongs to a different profile identity.'
              );
            const material = fromBase64(payload.rootSecret, 64);
            let key: NativeProfileKey;
            try {
              key = engineCall(() =>
                runtime.engine.ProfileSigningKey.restoreSecret(material)
              );
            } finally {
              material.fill(0);
            }
            try {
              if (toBase64(key.publicKey()) !== payload.rootPublicKey)
                throw new Error(
                  'The recovered profile key does not match its public identity.'
                );
            } finally {
              key.free();
            }
            runtime.state.rootSecret = payload.rootSecret;
            runtime.state.rootPublicKey = payload.rootPublicKey;
            runtime.state.rootVersion = payload.rootVersion;
            identityRestored = true;
          } else {
            const payload = historyRecoverySchema.parse(value);
            if (
              payload.userId !== this.scope.userId ||
              payload.profileId !== this.scope.profileId ||
              payload.actorId !== this.scope.actorId ||
              payload.roomId !== metadata.roomId
            )
              throw new Error(
                'This recovered history belongs to another account or conversation.'
              );
            for (const entry of payload.entries) {
              if (
                entry.message.roomId !== payload.roomId ||
                entry.message.attemptId !== entry.id
              )
                throw new Error(
                  'The recovered message is not bound to its exact conversation and identity.'
                );
              if (
                Date.parse(entry.expiresAt) <= Date.now() ||
                Date.parse(entry.message.expiresAt) <= Date.now()
              )
                continue;
              runtime.changes.history = [
                ...(runtime.changes.history ?? []),
                { roomId: payload.roomId, ...entry },
              ];
              for (const media of entry.message.attachments) {
                runtime.state.recoveredMedia =
                  runtime.state.recoveredMedia.filter(
                    (known) => known.id !== media.id
                  );
                runtime.state.recoveredMedia.push({
                  id: media.id,
                  backupId: metadata.id,
                });
              }
              messagesRestored++;
            }
          }
        } finally {
          clear.fill(0);
        }
      }
      if (!openedBackups)
        throw new Error(
          'No retained backup could be authenticated with this personal recovery key.'
        );
      if (identityRestored || !runtime.state.recoveryKey)
        runtime.state.recoveryKey = recoveryKey.trim();
      runtime.dirty = true;
      await this.flush(runtime);
      return { identityRestored, messagesRestored, unavailableBackups };
    });
    const device = await this.setup();
    return { ...restored, ...device };
  }

  async recoverToFreshDevice(recoveryKey: string) {
    const status = await this.status();
    const backups = await this.retainedBackups();
    const candidate =
      backups.find(
        (backup) =>
          backup.kind === 'identity' &&
          backup.rootVersion === status.identity?.rootVersion
      ) ?? backups.find((backup) => backup.kind === 'history');
    if (!candidate)
      throw new Error(
        'No matching retained backup is available. The existing local keys were not removed.'
      );
    const backup = await this.api.json(
      backupMetadataSchema.extend({ record: encryptedRecordSchema }).strict(),
      'GET',
      `/api/social/encryption/backups/${candidate.id}`
    );
    const keyBytes = fromBase64(recoveryKey.trim(), 32);
    let clear: Uint8Array;
    try {
      clear = await unsealRecord(
        backup.record,
        await importAesKey(keyBytes),
        candidate.kind === 'identity' ? 'identity-backup' : 'history-backup',
        backupContext(
          this.scope,
          candidate.rootVersion,
          candidate.kind,
          candidate.roomId
        )
      );
    } finally {
      keyBytes.fill(0);
    }
    try {
      const value: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(clear)
      );
      const payload =
        candidate.kind === 'identity'
          ? identityRecoverySchema.parse(value)
          : historyRecoverySchema.parse(value);
      if (
        payload.userId !== this.scope.userId ||
        payload.profileId !== this.scope.profileId ||
        payload.actorId !== this.scope.actorId
      )
        throw new Error(
          'The recovery key opened a different profile backup. Existing keys were not removed.'
        );
      if (payload.kind === 'identity') {
        const material = fromBase64(payload.rootSecret, 64);
        const engine = await this.engine();
        let root: NativeProfileKey;
        try {
          root = engineCall(() =>
            engine.ProfileSigningKey.restoreSecret(material)
          );
        } finally {
          material.fill(0);
        }
        try {
          if (toBase64(root.publicKey()) !== status.identity?.rootPublicKey)
            throw new Error(
              'The recovered authorization key is not the current identity. Existing keys were not removed.'
            );
        } finally {
          root.free();
        }
      }
    } finally {
      clear.fill(0);
    }
    await this.vault.withLock(() => this.vault.discardLocal());
    return this.recover(recoveryKey);
  }

  async prepareIdentityReset(discardLocalState: boolean) {
    if (!discardLocalState)
      throw new Error(
        'Explicitly acknowledge local key/history loss before preparing a new encryption identity.'
      );
    return this.vault.withLock(async () => {
      const status = await this.status();
      if (!status.canApprove || !status.identity)
        throw new Error(
          'Only a current profile owner can explicitly reset an existing encryption identity.'
        );
      const pending = await this.vault.replacement();
      if (pending) {
        const draft = identityResetDraftSchema.parse(
          JSON.parse(pending.request)
        );
        const state = localDeviceSchema.parse(JSON.parse(pending.state));
        return {
          requestId: draft.requestId,
          recoveryKey: state.recoveryKey!,
          rootPublicKey: draft.rootPublicKey,
          accepted:
            status.identity.rootPublicKey === draft.rootPublicKey &&
            status.identity.rootVersion === draft.rootVersion,
        };
      }
      const engine = await this.engine();
      const state = await this.initialState(engine, {
        ...status,
        identity: null,
      });
      if (!state.rootSecret || !state.recoveryKey || !state.rootPublicKey)
        throw new Error(
          'The new owner-held encryption identity was not generated.'
        );
      const recoveryKey = state.recoveryKey;
      const rootPublicKey = state.rootPublicKey;
      state.rootVersion = status.identity.rootVersion + 1;
      const secret = fromBase64(state.rootSecret, 64);
      let root: NativeProfileKey;
      try {
        root = engineCall(() => engine.ProfileSigningKey.restoreSecret(secret));
      } finally {
        secret.fill(0);
      }
      try {
        const snapshot = fromBase64(state.native);
        let native: NativeDevice;
        try {
          native = engineCall(() => engine.MlsDevice.restoreLocal(snapshot));
        } finally {
          snapshot.fill(0);
        }
        try {
          const requestId = crypto.randomUUID();
          const issuedAt = Date.now();
          const certificate = await signStatement(
            'device-certificate',
            deviceCertificateSchema.parse({
              ...state.identity,
              userId: this.scope.userId,
              signingKey: toBase64(native.publicKey()),
              requestId,
              nonce: newRecoveryKey(),
              rootVersion: state.rootVersion,
              issuedAt,
              expiresAt: issuedAt + E2EE_DEVICE_MS,
            }),
            (purpose, payload) =>
              engineCall(() => root.signStatement(purpose, payload))
          );
          state.certificate = certificate;
          state.enrollmentRequestId = requestId;
          const serialized = JSON.stringify(localDeviceSchema.parse(state));
          const clear = new TextEncoder().encode(
            JSON.stringify(
              identityRecoverySchema.parse({
                version: 1,
                protocol: E2EE_PROTOCOL,
                kind: 'identity',
                ...this.scope,
                rootVersion: state.rootVersion,
                rootPublicKey: state.rootPublicKey,
                rootSecret: state.rootSecret,
              })
            )
          );
          const key = fromBase64(recoveryKey, 32);
          let record;
          try {
            record = await sealRecord(
              clear,
              await importAesKey(key),
              'identity-backup',
              backupContext(this.scope, state.rootVersion, 'identity', null)
            );
          } finally {
            clear.fill(0);
            key.fill(0);
          }
          const draft = identityResetDraftSchema.parse({
            version: 1,
            ...this.scope,
            requestId,
            previousRootPublicKey: status.identity.rootPublicKey,
            previousRootVersion: status.identity.rootVersion,
            rootPublicKey: state.rootPublicKey,
            rootVersion: state.rootVersion,
            deviceId: state.identity.deviceId,
            stateHash: await sha256(new TextEncoder().encode(serialized)),
            certificateSha256: await sha256(
              new TextEncoder().encode(JSON.stringify(certificate))
            ),
            backupId: crypto.randomUUID(),
            backupSha256: await sha256(
              new TextEncoder().encode(JSON.stringify(record))
            ),
            certificate,
            record,
          });
          await this.vault.stageReplacement(serialized, JSON.stringify(draft));
          return { requestId, recoveryKey, rootPublicKey, accepted: false };
        } finally {
          native.free();
        }
      } finally {
        root.free();
      }
    });
  }

  async commitIdentityReset(requestId: string, recoveryKeySaved: boolean) {
    if (!recoveryKeySaved)
      throw new Error(
        'Save the new personal recovery key before explicitly resetting encryption.'
      );
    await this.vault.withLock(async () => {
      const replacement = await this.vault.replacement();
      if (!replacement)
        throw new Error(
          'Prepare the new identity and save its recovery key first.'
        );
      const draft = identityResetDraftSchema.parse(
        JSON.parse(replacement.request)
      );
      if (
        draft.requestId !== requestId ||
        draft.stateHash !== replacement.stateHash
      )
        throw new Error('The prepared identity reset changed.');
      const state = localDeviceSchema.parse(JSON.parse(replacement.state));
      const status = await this.status();
      if (
        status.identity?.rootPublicKey !== draft.rootPublicKey ||
        status.identity.rootVersion !== draft.rootVersion
      ) {
        const { certificate, record, ...fields } = draft;
        const secret = fromBase64(state.rootSecret!, 64);
        const engine = await this.engine();
        let root: NativeProfileKey;
        try {
          root = engineCall(() =>
            engine.ProfileSigningKey.restoreSecret(secret)
          );
        } finally {
          secret.fill(0);
        }
        try {
          const statement = await signStatement(
            'identity-reset',
            identityResetClaimsSchema.parse({
              ...fields,
              recoveryKeySaved: true,
              discardLocalState: true,
              issuedAt: Date.now(),
            }),
            (purpose, payload) =>
              engineCall(() => root.signStatement(purpose, payload))
          );
          const result = await this.api.json(
            identityResetResultSchema,
            'POST',
            '/api/social/encryption/identity-reset',
            {
              confirmation: 'RESET ENCRYPTION',
              rootPublicKey: draft.rootPublicKey,
              statement,
              certificate,
              record,
            }
          );
          if (
            result.requestId !== draft.requestId ||
            result.stateHash !== replacement.stateHash ||
            result.rootPublicKey !== draft.rootPublicKey ||
            result.rootVersion !== draft.rootVersion ||
            result.deviceId !== draft.deviceId
          )
            throw new Error(
              'The server did not acknowledge the exact prepared encryption identity reset.'
            );
        } finally {
          root.free();
        }
      } else {
        const own = status.devices.find((entry) => entry.id === draft.deviceId);
        if (
          !own ||
          own.stateHash !== replacement.stateHash ||
          own.checkpointId !== draft.requestId
        )
          throw new Error(
            'The replacement state has already advanced elsewhere. Do not reuse the prepared snapshot.'
          );
      }
      await this.vault.promoteReplacement(replacement);
    });
    return this.setup();
  }

  async cancelIdentityReset() {
    return this.vault.withLock(async () => {
      const pending = await this.vault.replacement();
      if (!pending)
        throw new Error('There is no staged identity reset to cancel.');
      const draft = identityResetDraftSchema.parse(JSON.parse(pending.request));
      const status = await this.status();
      if (status.identity?.rootPublicKey === draft.rootPublicKey)
        throw new Error(
          'This reset was accepted. Finish its saved replacement instead of deleting the only fresh keys.'
        );
      await this.vault.discardReplacement();
    });
  }

  close() {
    this.vault.close();
  }
}
