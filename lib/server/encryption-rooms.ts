import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  chatE2eeDevices,
  chatE2eeIdentities,
  chatE2eeKeyPackages,
  chatE2eeRooms,
  chatE2eeDmParticipants,
  chatE2eeEvents,
  chatE2eeWelcomes,
  chatE2eeMedia,
  profiles,
  profileOwners,
  socialActors,
  socialGroups,
  socialGroupMembers,
  socialDmRequests,
} from '@/lib/schema';
import { getFederationDomain } from '@/lib/federation/domain';
import {
  evaluateDirectThreads,
  recordDirectThreadRequests,
  DIRECT_THREAD_REFUSED,
} from '@/lib/federation/wrappers/dm-gate';
import {
  getHiddenActorIds,
  isBlockedEitherWay,
} from '@/lib/federation/wrappers/block-filter';
import {
  e2eeIdSchema,
  sha256,
  signedStatementSchema,
  E2EE_REQUEST_MS,
  type SignedStatement,
} from '@/lib/e2ee/identity-contract';
import {
  directoryDeviceSchema,
  membershipIntentSchema,
  rosterDigest,
  submitRoomEventSchema,
  E2EE_MAX_FRAME_BYTES,
  E2EE_MAX_ROOM_DEVICES,
  E2EE_MESSAGE_MS,
  type DirectoryDevice,
  type SubmitRoomEvent,
  roomRestartSchema,
  E2EE_VISIBILITY_BATCH,
  E2EE_MAX_DELIVERY_PAGE_BYTES,
} from '@/lib/e2ee/room-contract';
import { fromBase64 } from '@/lib/e2ee/encoding';
import {
  authorizeEncryptionDevice,
  encryptionFail,
  encryptionInput,
  verifiedStatement,
  type DeviceContext,
  type EncryptionScope,
  type EncryptionTx,
  type ExpectedDeviceRequest,
} from './encryption-context';

type Room = typeof chatE2eeRooms.$inferSelect;
type Event = typeof chatE2eeEvents.$inferSelect;
type Access = { room: Room; role: string | null; hiddenBeforeSequence: number };
type Transport = {
  scope: EncryptionScope;
  proof: SignedStatement;
  expected: ExpectedDeviceRequest;
};
const openSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dm'), peerActorId: e2eeIdSchema }).strict(),
  z.object({ kind: z.literal('group'), groupId: e2eeIdSchema }).strict(),
]);
function unavailable(): never {
  return encryptionFail(
    404,
    'ROOM_UNAVAILABLE',
    'This encrypted conversation is unavailable.'
  );
}

async function localActor(tx: EncryptionTx, actorId: string) {
  const [actor] = await tx
    .select({
      id: socialActors.id,
      profileId: socialActors.profileId,
      username: socialActors.username,
      name: socialActors.name,
      iconUrl: socialActors.iconUrl,
      domain: socialActors.domain,
    })
    .from(socialActors)
    .where(
      and(
        eq(socialActors.id, actorId),
        eq(socialActors.domain, getFederationDomain()),
        eq(socialActors.type, 'Person'),
        isNotNull(socialActors.profileId)
      )
    );
  if (!actor?.profileId) unavailable();
  return { ...actor, profileId: actor.profileId };
}

async function actorIdsForRoom(
  tx: EncryptionTx,
  room: Room
): Promise<string[]> {
  if (room.kind === 'dm') {
    const participants = await tx
      .select({ actorId: chatE2eeDmParticipants.actorId })
      .from(chatE2eeDmParticipants)
      .where(eq(chatE2eeDmParticipants.roomId, room.id));
    return participants.map((participant) => participant.actorId);
  }
  if (!room.groupId) unavailable();
  const members = await tx
    .select({ actorId: socialGroupMembers.actorId })
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, room.groupId),
        eq(socialGroupMembers.status, 'active')
      )
    );
  return members.map((member) => member.actorId);
}

async function directoryForActors(
  tx: EncryptionTx,
  actorIds: string[]
): Promise<DirectoryDevice[]> {
  if (!actorIds.length) return [];
  const rows = await tx
    .select({
      deviceId: chatE2eeDevices.id,
      profileId: chatE2eeDevices.profileId,
      actorId: chatE2eeIdentities.actorId,
      userId: chatE2eeDevices.userId,
      signingKey: chatE2eeDevices.signingKey,
      credential: chatE2eeDevices.credential,
      rootPublicKey: chatE2eeIdentities.rootPublicKey,
      rootVersion: chatE2eeIdentities.rootVersion,
      certificate: chatE2eeDevices.certificate,
    })
    .from(chatE2eeDevices)
    .innerJoin(
      chatE2eeIdentities,
      eq(chatE2eeIdentities.profileId, chatE2eeDevices.profileId)
    )
    .innerJoin(profiles, eq(profiles.id, chatE2eeDevices.profileId))
    .where(
      and(
        inArray(chatE2eeIdentities.actorId, actorIds),
        eq(chatE2eeIdentities.encryptionRequired, true),
        eq(chatE2eeIdentities.rotationRequired, false),
        eq(profiles.socialEligible, true),
        eq(chatE2eeDevices.rootVersion, chatE2eeIdentities.rootVersion),
        isNull(chatE2eeDevices.revokedAt),
        isNotNull(chatE2eeDevices.readyAt),
        gt(chatE2eeDevices.expiresAt, new Date()),
        or(
          eq(profiles.userId, chatE2eeDevices.userId),
          sql`EXISTS (
        SELECT 1 FROM ${profileOwners} g WHERE g.profile_id = ${chatE2eeDevices.profileId}
        AND g.user_id = ${chatE2eeDevices.userId})`
        )
      )
    )
    .limit(E2EE_MAX_ROOM_DEVICES + 1);
  if (rows.length > E2EE_MAX_ROOM_DEVICES)
    encryptionFail(
      409,
      'ROOM_DEVICE_LIMIT',
      'This encrypted conversation exceeds the supported device capacity.'
    );
  return rows.map((row) => directoryDeviceSchema.parse(row));
}

async function ownDirectory(tx: EncryptionTx, device: DeviceContext) {
  const rows = await directoryForActors(tx, [device.actorId]);
  const own = rows.find((row) => row.deviceId === device.deviceId);
  if (!own)
    encryptionFail(
      403,
      'ENCRYPTION_SETUP_REQUIRED',
      'Finish encryption recovery-key setup and publish device prekeys first.'
    );
  return own;
}

async function roomAccess(
  tx: EncryptionTx,
  device: DeviceContext,
  roomId: string
): Promise<Access> {
  encryptionInput(z.uuid(), roomId);
  const [hint] = await tx
    .select()
    .from(chatE2eeRooms)
    .where(eq(chatE2eeRooms.id, roomId));
  if (!hint || hint.state === 'closed') unavailable();
  let role: string | null = null;
  let hiddenBeforeSequence = 0;
  if (hint.kind === 'group') {
    if (!hint.groupId) unavailable();
    const [group] = await tx
      .select({ id: socialGroups.id })
      .from(socialGroups)
      .where(eq(socialGroups.id, hint.groupId))
      .for('key share');
    if (!group) unavailable();
    const [member] = await tx
      .select({ role: socialGroupMembers.role })
      .from(socialGroupMembers)
      .where(
        and(
          eq(socialGroupMembers.groupId, group.id),
          eq(socialGroupMembers.actorId, device.actorId),
          eq(socialGroupMembers.status, 'active')
        )
      )
      .for('share');
    if (!member) unavailable();
    role = member.role;
  } else {
    const participants = await tx
      .select()
      .from(chatE2eeDmParticipants)
      .where(eq(chatE2eeDmParticipants.roomId, hint.id));
    const own = participants.find(
      (participant) =>
        participant.actorId === device.actorId &&
        participant.profileId === device.profileId
    );
    if (!own) unavailable();
    hiddenBeforeSequence = own.hiddenBeforeSequence;
    for (const other of participants) {
      if (await isBlockedEitherWay(device.actorId, other.actorId, tx))
        unavailable();
    }
  }
  const [room] = await tx
    .select()
    .from(chatE2eeRooms)
    .where(eq(chatE2eeRooms.id, roomId))
    .for('update');
  if (!room || room.state === 'closed') unavailable();
  return { room, role, hiddenBeforeSequence };
}

async function reconcileRoom(tx: EncryptionTx, room: Room) {
  const desired = await directoryForActors(tx, await actorIdsForRoom(tx, room));
  const digest = await rosterDigest(desired);
  const same = digest === room.rosterDigest;
  const state = same
    ? 'active'
    : room.sequence === 0
      ? 'initializing'
      : 'rekey_required';
  if (room.state !== state) {
    const [updated] = await tx
      .update(chatE2eeRooms)
      .set({
        state,
        revision:
          !same && room.state === 'active' ? room.revision + 1 : room.revision,
        updatedAt: new Date(),
      })
      .where(eq(chatE2eeRooms.id, room.id))
      .returning();
    return { room: updated, desired };
  }
  return { room, desired };
}

function isRoomDevice(room: Room, device: DeviceContext) {
  return room.roster.some(
    (member) =>
      member.deviceId === device.deviceId &&
      member.signingKey === device.signingKey &&
      member.credential === device.credential
  );
}

async function snapshot(
  tx: EncryptionTx,
  device: DeviceContext,
  access: Access
) {
  const { room, desired } = await reconcileRoom(tx, access.room);
  const actorIds = [
    ...new Set([...room.roster, ...desired].map((entry) => entry.actorId)),
  ];
  const actors = actorIds.length
    ? await tx
        .select({
          id: socialActors.id,
          username: socialActors.username,
          domain: socialActors.domain,
          name: socialActors.name,
          iconUrl: socialActors.iconUrl,
        })
        .from(socialActors)
        .where(inArray(socialActors.id, actorIds))
    : [];
  const [welcome] = await tx
    .select()
    .from(chatE2eeWelcomes)
    .where(
      and(
        eq(chatE2eeWelcomes.roomId, room.id),
        eq(chatE2eeWelcomes.cryptoGroupId, room.cryptoGroupId),
        eq(chatE2eeWelcomes.deviceId, device.deviceId)
      )
    )
    .orderBy(desc(chatE2eeWelcomes.joinedSequence))
    .limit(1);
  const [invitationEvent] = welcome
    ? await tx
        .select()
        .from(chatE2eeEvents)
        .where(eq(chatE2eeEvents.id, welcome.eventId))
    : [];
  let invitation = null;
  if (welcome) {
    if (!invitationEvent?.nextRoster || !invitationEvent.intent)
      encryptionFail(
        409,
        'WELCOME_UNAVAILABLE',
        'A fresh authenticated invitation is required.'
      );
    invitation = {
      frame: welcome.frame,
      sequence: welcome.joinedSequence,
      eventId: welcome.eventId,
      keyPackageId: welcome.keyPackageId,
      roster: invitationEvent.nextRoster,
      intent: invitationEvent.intent,
      createdAt: invitationEvent.createdAt.toISOString(),
    };
  }
  return {
    id: room.id,
    cryptoGroupId: room.cryptoGroupId,
    kind: room.kind,
    groupId: room.groupId,
    founderDeviceId: room.founderDeviceId,
    state: room.state,
    epoch: room.epoch,
    revision: room.revision,
    sequence: room.sequence,
    roster: room.roster,
    rosterDigest: room.rosterDigest,
    desired,
    role: access.role,
    joined: isRoomDevice(room, device),
    hiddenBeforeSequence: access.hiddenBeforeSequence,
    actors,
    canRestart:
      (room.sequence === 0 &&
        room.bootstrapExpiresAt.getTime() <= Date.now()) ||
      !desired.some((device) =>
        room.roster.some(
          (current) =>
            current.deviceId === device.deviceId &&
            current.signingKey === device.signingKey &&
            current.credential === device.credential
        )
      ),
    restart: room.restart,
    welcome: invitation,
    serverTime: new Date().toISOString(),
  };
}

export async function openEncryptedRoom(transport: Transport, input: unknown) {
  const value = encryptionInput(openSchema, input);
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    const own = await ownDirectory(tx, device);
    let groupId: string | null = null;
    let pairKey: string | null = null;
    let participants: Awaited<ReturnType<typeof localActor>>[] = [];
    if (value.kind === 'dm') {
      const peer = await localActor(tx, value.peerActorId);
      const [gate] = await evaluateDirectThreads(device.actorId, [peer.id], tx);
      if (!gate || gate.decision === 'refuse')
        encryptionFail(403, 'DIRECT_THREAD_REFUSED', DIRECT_THREAD_REFUSED);
      const directory = await directoryForActors(tx, [peer.id]);
      if (!directory.length)
        encryptionFail(
          409,
          'PEER_ENCRYPTION_UNAVAILABLE',
          'Secure messaging is not yet available for this conversation.'
        );
      participants = [
        await localActor(tx, device.actorId),
        ...(peer.id === device.actorId ? [] : [peer]),
      ];
      pairKey = [device.actorId, peer.id].sort().join(':');
    } else {
      const [group] = await tx
        .select({ id: socialGroups.id })
        .from(socialGroups)
        .where(eq(socialGroups.id, value.groupId))
        .for('key share');
      if (!group) unavailable();
      const [member] = await tx
        .select({ role: socialGroupMembers.role })
        .from(socialGroupMembers)
        .where(
          and(
            eq(socialGroupMembers.groupId, group.id),
            eq(socialGroupMembers.actorId, device.actorId),
            eq(socialGroupMembers.status, 'active')
          )
        )
        .for('share');
      if (!member) unavailable();
      const [existing] = await tx
        .select({ id: chatE2eeRooms.id })
        .from(chatE2eeRooms)
        .where(eq(chatE2eeRooms.groupId, group.id));
      if (!existing && member.role !== 'admin')
        encryptionFail(
          403,
          'GROUP_ADMIN_REQUIRED',
          'A group admin must explicitly enable encrypted group chat.'
        );
      groupId = group.id;
    }
    const roster = [own];
    const [created] = await tx
      .insert(chatE2eeRooms)
      .values({
        id: crypto.randomUUID(),
        cryptoGroupId: crypto.randomUUID(),
        kind: value.kind,
        groupId,
        pairKey,
        founderDeviceId: device.deviceId,
        roster,
        rosterDigest: await rosterDigest(roster),
        bootstrapExpiresAt: new Date(Date.now() + 5 * 60_000),
      })
      .onConflictDoNothing()
      .returning();
    let room = created;
    if (!room) {
      if (!groupId && !pairKey) unavailable();
      const condition = groupId
        ? eq(chatE2eeRooms.groupId, groupId)
        : pairKey
          ? eq(chatE2eeRooms.pairKey, pairKey)
          : unavailable();
      const [existing] = await tx.select().from(chatE2eeRooms).where(condition);
      if (!existing) unavailable();
      room = existing;
    } else if (value.kind === 'dm') {
      await tx.insert(chatE2eeDmParticipants).values(
        participants.map((participant) => ({
          id: crypto.randomUUID(),
          roomId: room.id,
          actorId: participant.id,
          profileId: participant.profileId,
        }))
      );
    }
    return snapshot(tx, device, await roomAccess(tx, device, room.id));
  });
}

export async function readEncryptedRoom(transport: Transport, roomId: string) {
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    await ownDirectory(tx, device);
    return snapshot(tx, device, await roomAccess(tx, device, roomId));
  });
}

export async function restartEncryptedRoom(
  transport: Transport,
  roomId: string,
  value: unknown
) {
  const input = encryptionInput(
    z
      .object({
        statement: signedStatementSchema,
        acknowledgeFreshSession: z.literal(true),
      })
      .strict(),
    value
  );
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    const own = await ownDirectory(tx, device);
    const access = await roomAccess(tx, device, roomId);
    const intent = await verifiedStatement(
      'room-intent',
      input.statement,
      device.signingKey,
      roomRestartSchema
    );
    if (
      intent.roomId !== roomId ||
      intent.deviceId !== device.deviceId ||
      intent.profileId !== device.profileId ||
      intent.actorId !== device.actorId ||
      intent.cryptoGroupId === intent.previousCryptoGroupId
    )
      encryptionFail(
        400,
        'ROOM_RESTART_MISMATCH',
        'The secure-session restart does not bind this exact room and device.'
      );
    const current = access.room;
    if (
      current.restart?.intent.payload === input.statement.payload &&
      current.restart.intent.signature === input.statement.signature &&
      current.cryptoGroupId === intent.cryptoGroupId
    )
      return snapshot(tx, device, access);
    const state = await snapshot(tx, device, access);
    if (!state.canRestart)
      encryptionFail(
        409,
        'EXISTING_MEMBER_REQUIRED',
        'An approved existing participant can still update this secure room. Do not replace its live session.'
      );
    if (
      intent.previousCryptoGroupId !== state.cryptoGroupId ||
      intent.previousSequence !== state.sequence ||
      intent.previousRevision !== state.revision ||
      intent.previousRosterDigest !== state.rosterDigest ||
      Math.abs(intent.issuedAt - Date.now()) > E2EE_REQUEST_MS
    )
      encryptionFail(
        409,
        'STALE_ROOM_STATE',
        'The secure room changed before its explicit restart.'
      );
    const [updated] = await tx
      .update(chatE2eeRooms)
      .set({
        cryptoGroupId: intent.cryptoGroupId,
        founderDeviceId: device.deviceId,
        epoch: '0',
        roster: [own],
        rosterDigest: await rosterDigest([own]),
        state: 'initializing',
        revision: state.revision + 1,
        bootstrapExpiresAt: new Date(Date.now() + 5 * 60_000),
        restart: { intent: input.statement, author: own },
        updatedAt: new Date(),
      })
      .where(eq(chatE2eeRooms.id, roomId))
      .returning();
    return snapshot(tx, device, { ...access, room: updated });
  });
}

export async function claimEncryptedKeyPackage(
  transport: Transport,
  roomId: string,
  input: unknown
) {
  const value = encryptionInput(
    z.object({ deviceId: z.uuid() }).strict(),
    input
  );
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    await ownDirectory(tx, device);
    const access = await roomAccess(tx, device, roomId);
    const { room, desired } = await reconcileRoom(tx, access.room);
    if (!isRoomDevice(room, device))
      encryptionFail(
        409,
        'MEMBERSHIP_UPDATE_PENDING',
        'Wait for an authorized participant to add this device.'
      );
    const target = desired.find((entry) => entry.deviceId === value.deviceId);
    if (
      !target ||
      room.roster.some((entry) => entry.deviceId === target.deviceId)
    )
      encryptionFail(
        409,
        'MEMBERSHIP_CHANGED',
        'This device is not awaiting admission to this conversation.'
      );
    const [candidate] = await tx
      .select()
      .from(chatE2eeKeyPackages)
      .where(
        and(
          eq(chatE2eeKeyPackages.deviceId, target.deviceId),
          isNull(chatE2eeKeyPackages.claimedAt),
          gt(chatE2eeKeyPackages.expiresAt, new Date())
        )
      )
      .orderBy(asc(chatE2eeKeyPackages.createdAt))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!candidate)
      encryptionFail(
        409,
        'PREKEYS_UNAVAILABLE',
        'A participant device must publish fresh public prekeys.'
      );
    const [claimed] = await tx
      .update(chatE2eeKeyPackages)
      .set({
        claimedAt: new Date(),
        claimedRoomId: room.id,
        claimedByDeviceId: device.deviceId,
      })
      .where(
        and(
          eq(chatE2eeKeyPackages.id, candidate.id),
          isNull(chatE2eeKeyPackages.claimedAt)
        )
      )
      .returning();
    if (!claimed)
      encryptionFail(
        409,
        'PREKEY_ALREADY_USED',
        'Claim a fresh public prekey.'
      );
    return {
      id: claimed.id,
      bytes: claimed.bytes,
      sha256: claimed.sha256,
      expiresAt: claimed.expiresAt.toISOString(),
      target,
      revision: room.revision,
      epoch: room.epoch,
    };
  });
}

function receipt(event: Event) {
  return {
    id: event.id,
    clientId: event.clientId,
    roomId: event.roomId,
    cryptoGroupId: event.cryptoGroupId,
    sequence: event.sequence,
    kind: event.kind,
    frameSha256: event.frameSha256,
    envelopeSha256: event.envelopeSha256,
    revision: event.revision,
    fromEpoch: event.epoch,
    acceptedEpoch:
      event.kind === 'commit'
        ? (BigInt(event.epoch) + 1n).toString()
        : event.epoch,
    expiresAt: event.expiresAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
  };
}

async function nextMembership(
  tx: EncryptionTx,
  room: Room,
  device: DeviceContext,
  input: SubmitRoomEvent,
  desired: DirectoryDevice[]
) {
  if (
    !input.intent ||
    input.mediaIds.length ||
    input.expiresAt !== null ||
    input.clientId !== input.id
  )
    encryptionFail(
      400,
      'INVALID_COMMIT',
      'Invalid private membership-commit envelope.'
    );
  const intent = await verifiedStatement(
    'room-intent',
    input.intent,
    device.signingKey,
    membershipIntentSchema
  );
  if (
    intent.roomId !== room.id ||
    intent.cryptoGroupId !== room.cryptoGroupId ||
    intent.deviceId !== device.deviceId ||
    intent.actorId !== device.actorId ||
    intent.attemptId !== input.id ||
    intent.revision !== room.revision ||
    intent.previousSequence !== room.sequence ||
    intent.fromEpoch !== room.epoch ||
    intent.toEpoch !== (BigInt(room.epoch) + 1n).toString() ||
    intent.previousRosterDigest !== room.rosterDigest ||
    intent.frameSha256 !== input.frameSha256
  )
    encryptionFail(
      409,
      'MEMBERSHIP_CHANGED',
      'The signed membership intent does not match the current room.'
    );
  let roster: DirectoryDevice[];
  if (intent.operation === 'add') {
    const target = desired.find(
      (entry) => entry.deviceId === intent.targetDeviceId
    );
    const welcome = input.welcomes[0];
    if (
      !target ||
      room.roster.some((entry) => entry.deviceId === target.deviceId) ||
      input.welcomes.length !== 1 ||
      !welcome ||
      welcome.deviceId !== target.deviceId ||
      welcome.keyPackageId !== intent.keyPackageId
    )
      encryptionFail(
        409,
        'MEMBERSHIP_CHANGED',
        'The admission must match one currently authorized device and prekey.'
      );
    const [claimed] = await tx
      .select()
      .from(chatE2eeKeyPackages)
      .where(
        and(
          eq(chatE2eeKeyPackages.id, welcome.keyPackageId),
          eq(chatE2eeKeyPackages.deviceId, target.deviceId),
          eq(chatE2eeKeyPackages.claimedRoomId, room.id),
          eq(chatE2eeKeyPackages.claimedByDeviceId, device.deviceId),
          isNotNull(chatE2eeKeyPackages.claimedAt),
          gt(chatE2eeKeyPackages.expiresAt, new Date())
        )
      )
      .for('share');
    if (!claimed)
      encryptionFail(
        409,
        'PREKEY_UNAVAILABLE',
        'The claimed prekey is unavailable or belongs to another attempt.'
      );
    const [used] = await tx
      .select({ id: chatE2eeWelcomes.id })
      .from(chatE2eeWelcomes)
      .where(eq(chatE2eeWelcomes.keyPackageId, claimed.id));
    if (used)
      encryptionFail(
        409,
        'PREKEY_ALREADY_USED',
        'This public prekey has already been consumed.'
      );
    try {
      const bytes = fromBase64(welcome.frame, E2EE_MAX_FRAME_BYTES);
      if ((await sha256(bytes)) !== intent.welcomeSha256)
        encryptionFail(
          400,
          'WELCOME_DIGEST_MISMATCH',
          'The signed invitation digest does not match these bytes.'
        );
    } catch {
      encryptionFail(
        400,
        'INVALID_WELCOME',
        'Invalid private MLS invitation encoding.'
      );
    }
    roster = [...room.roster, target];
  } else {
    if (
      intent.keyPackageId !== null ||
      intent.welcomeSha256 !== null ||
      input.welcomes.length ||
      intent.targetDeviceId === device.deviceId ||
      !room.roster.some((entry) => entry.deviceId === intent.targetDeviceId) ||
      desired.some((entry) => entry.deviceId === intent.targetDeviceId)
    )
      encryptionFail(
        409,
        'MEMBERSHIP_CHANGED',
        'Only a no-longer-authorized device may be removed.'
      );
    roster = room.roster.filter(
      (entry) => entry.deviceId !== intent.targetDeviceId
    );
  }
  if (
    roster.length > E2EE_MAX_ROOM_DEVICES ||
    (await rosterDigest(roster)) !== intent.nextRosterDigest
  )
    encryptionFail(
      400,
      'ROSTER_MISMATCH',
      'The signed roster does not match the requested membership change.'
    );
  return { roster, epoch: intent.toEpoch, digest: intent.nextRosterDigest };
}

export async function submitEncryptedRoomEvent(
  transport: Transport,
  roomId: string,
  value: unknown
) {
  const input = encryptionInput(submitRoomEventSchema, value);
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(input.frame, E2EE_MAX_FRAME_BYTES);
  } catch {
    encryptionFail(400, 'INVALID_FRAME', 'Invalid private MLS frame encoding.');
  }
  if ((await sha256(bytes)) !== input.frameSha256)
    encryptionFail(
      400,
      'FRAME_DIGEST_MISMATCH',
      'The encrypted frame digest does not match its bytes.'
    );
  const envelopeSha256 = await sha256(
    new TextEncoder().encode(JSON.stringify(input))
  );
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    await ownDirectory(tx, device);
    const access = await roomAccess(tx, device, roomId);
    const [previous] = await tx
      .select()
      .from(chatE2eeEvents)
      .where(eq(chatE2eeEvents.id, input.id));
    if (previous) {
      if (
        previous.roomId !== roomId ||
        previous.senderDeviceId !== device.deviceId ||
        previous.envelopeSha256 !== envelopeSha256
      )
        encryptionFail(
          409,
          'ATTEMPT_ID_USED',
          'A delivery retry must reuse the exact accepted encrypted envelope.'
        );
      return receipt(previous);
    }
    const [logical] = await tx
      .select({ id: chatE2eeEvents.id })
      .from(chatE2eeEvents)
      .where(
        and(
          eq(chatE2eeEvents.roomId, roomId),
          eq(chatE2eeEvents.senderDeviceId, device.deviceId),
          eq(chatE2eeEvents.clientId, input.clientId)
        )
      );
    if (logical)
      encryptionFail(
        409,
        'MESSAGE_ALREADY_ACCEPTED',
        'The original message attempt was accepted. Retrieve its receipt instead of encrypting again.'
      );
    const { room, desired } = await reconcileRoom(tx, access.room);
    if (!isRoomDevice(room, device))
      encryptionFail(
        409,
        'MEMBERSHIP_UPDATE_PENDING',
        'This device has not joined the current secure room.'
      );
    if (
      input.cryptoGroupId !== room.cryptoGroupId ||
      input.revision !== room.revision ||
      input.epoch !== room.epoch
    )
      encryptionFail(
        409,
        'STALE_ROOM_STATE',
        'Synchronize the current secure room before creating a fresh attempt.'
      );
    let roster = room.roster;
    let epoch = room.epoch;
    let digest = room.rosterDigest;
    let expiresAt: Date | null = null;
    if (input.kind === 'commit') {
      if (input.afterSequence !== room.sequence)
        encryptionFail(
          409,
          'STALE_ROOM_STATE',
          'Read intervening messages before proposing a membership commit.'
        );
      const next = await nextMembership(tx, room, device, input, desired);
      roster = next.roster;
      epoch = next.epoch;
      digest = next.digest;
    } else {
      if (room.state !== 'active')
        encryptionFail(
          409,
          'MEMBERSHIP_UPDATE_PENDING',
          'A secure membership update is required before sending.'
        );
      if (input.intent || input.welcomes.length || !input.expiresAt)
        encryptionFail(
          400,
          'INVALID_MESSAGE',
          'Invalid encrypted application-message envelope.'
        );
      const expiry = Date.parse(input.expiresAt);
      if (
        expiry <= Date.now() ||
        expiry > Date.now() + E2EE_MESSAGE_MS + 120_000
      )
        encryptionFail(
          400,
          'INVALID_EXPIRY',
          'Encrypted messages must use the current 30-day retention window.'
        );
      expiresAt = new Date(Math.min(expiry, Date.now() + E2EE_MESSAGE_MS));
      if (new Set(input.mediaIds).size !== input.mediaIds.length)
        encryptionFail(
          400,
          'INVALID_MEDIA',
          'An encrypted attachment may be referenced only once.'
        );
      for (const id of input.mediaIds) {
        const [media] = await tx
          .select()
          .from(chatE2eeMedia)
          .where(
            and(
              eq(chatE2eeMedia.id, id),
              eq(chatE2eeMedia.roomId, room.id),
              eq(chatE2eeMedia.uploaderDeviceId, device.deviceId),
              eq(chatE2eeMedia.state, 'stored'),
              isNull(chatE2eeMedia.messageId),
              gt(chatE2eeMedia.expiresAt, new Date())
            )
          )
          .for('update');
        if (!media)
          encryptionFail(
            409,
            'PRIVATE_MEDIA_REQUIRED',
            'Every encrypted attachment must be uploaded by this device for this room.'
          );
      }
      if (room.kind === 'dm') {
        const peers = (await actorIdsForRoom(tx, room)).filter(
          (id) => id !== device.actorId
        );
        const decisions = await evaluateDirectThreads(
          device.actorId,
          peers,
          tx
        );
        if (decisions.some((decision) => decision.decision === 'refuse'))
          encryptionFail(403, 'DIRECT_THREAD_REFUSED', DIRECT_THREAD_REFUSED);
        await recordDirectThreadRequests(
          device.actorId,
          decisions
            .filter((decision) => decision.decision === 'hold')
            .map((decision) => decision.recipientActorId),
          tx
        );
      }
    }
    if (room.sequence >= 2_147_483_647)
      encryptionFail(
        409,
        'ROOM_SEQUENCE_LIMIT',
        'This encrypted conversation needs a new secure session.'
      );
    const sequence = room.sequence + 1;
    const [event] = await tx
      .insert(chatE2eeEvents)
      .values({
        id: input.id,
        clientId: input.clientId,
        roomId: room.id,
        cryptoGroupId: room.cryptoGroupId,
        sequence,
        epoch: room.epoch,
        revision: room.revision,
        kind: input.kind,
        senderDeviceId: device.deviceId,
        senderActorId: device.actorId,
        frame: input.frame,
        frameSha256: input.frameSha256,
        envelopeSha256,
        intent: input.intent,
        nextRoster: input.kind === 'commit' ? roster : null,
        mediaIds: input.mediaIds,
        expiresAt,
      })
      .returning();
    if (input.welcomes.length) {
      await tx.insert(chatE2eeWelcomes).values(
        input.welcomes.map((welcome) => ({
          id: crypto.randomUUID(),
          roomId: room.id,
          cryptoGroupId: room.cryptoGroupId,
          eventId: event.id,
          deviceId: welcome.deviceId,
          keyPackageId: welcome.keyPackageId,
          joinedSequence: sequence,
          frame: welcome.frame,
        }))
      );
    }
    if (input.kind === 'message' && input.mediaIds.length && expiresAt) {
      await tx
        .update(chatE2eeMedia)
        .set({ state: 'bound', messageId: event.id, expiresAt })
        .where(inArray(chatE2eeMedia.id, input.mediaIds));
    }
    const state =
      (await rosterDigest(desired)) === digest ? 'active' : 'rekey_required';
    await tx
      .update(chatE2eeRooms)
      .set({
        roster,
        rosterDigest: digest,
        epoch,
        sequence,
        state,
        updatedAt: new Date(),
      })
      .where(eq(chatE2eeRooms.id, room.id));
    return receipt(event);
  });
}

export async function encryptedRoomReceipt(
  transport: Transport,
  roomId: string,
  attemptId: string
) {
  encryptionInput(z.uuid(), attemptId);
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    await roomAccess(tx, device, roomId);
    const [event] = await tx
      .select()
      .from(chatE2eeEvents)
      .where(
        and(
          eq(chatE2eeEvents.id, attemptId),
          eq(chatE2eeEvents.roomId, roomId),
          eq(chatE2eeEvents.senderDeviceId, device.deviceId)
        )
      );
    if (!event)
      encryptionFail(
        404,
        'ATTEMPT_NOT_ACCEPTED',
        'No accepted receipt exists for this attempt.'
      );
    return receipt(event);
  });
}

export async function readEncryptedRoomEvents(
  transport: Transport,
  roomId: string,
  after = 0,
  limit = 100
) {
  if (
    !Number.isSafeInteger(after) ||
    after < 0 ||
    after > 2_147_483_647 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    encryptionFail(400, 'INVALID_CURSOR', 'Invalid encrypted room cursor.');
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    await ownDirectory(tx, device);
    const access = await roomAccess(tx, device, roomId);
    const state = await snapshot(tx, device, access);
    if (after > state.sequence)
      encryptionFail(
        409,
        'ROOM_CURSOR_AHEAD',
        'The saved delivery cursor is ahead of this secure room.'
      );
    if (!state.joined) return { room: state, events: [], nextSequence: after };
    const joined =
      state.welcome?.sequence ??
      (state.founderDeviceId === device.deviceId ? 0 : null);
    if (joined === null)
      encryptionFail(
        409,
        'WELCOME_REQUIRED',
        'This device needs a fresh authenticated welcome.'
      );
    const candidates = await tx
      .select({
        id: chatE2eeEvents.id,
        bytes: sql<number>`COALESCE(octet_length(${chatE2eeEvents.frame}), 0)
          + COALESCE(octet_length(${chatE2eeEvents.nextRoster}::text), 0)
          + COALESCE(octet_length(${chatE2eeEvents.intent}::text), 0) + 2048`,
      })
      .from(chatE2eeEvents)
      .where(
        and(
          eq(chatE2eeEvents.roomId, roomId),
          eq(chatE2eeEvents.cryptoGroupId, state.cryptoGroupId),
          gt(chatE2eeEvents.sequence, Math.max(after, joined))
        )
      )
      .orderBy(asc(chatE2eeEvents.sequence))
      .limit(limit);
    const ids: string[] = [];
    let deliveryBytes = 0;
    for (const candidate of candidates) {
      if (
        ids.length &&
        deliveryBytes + candidate.bytes > E2EE_MAX_DELIVERY_PAGE_BYTES
      )
        break;
      ids.push(candidate.id);
      deliveryBytes += candidate.bytes;
    }
    const rows = ids.length
      ? await tx
          .select()
          .from(chatE2eeEvents)
          .where(
            and(
              eq(chatE2eeEvents.roomId, roomId),
              inArray(chatE2eeEvents.id, ids)
            )
          )
          .orderBy(asc(chatE2eeEvents.sequence))
      : [];
    const hidden = new Set(await getHiddenActorIds(device.actorId, tx));
    return {
      room: state,
      events: rows.map((event) => ({
        ...receipt(event),
        frame:
          event.kind === 'commit' ||
          (!event.deletedAt &&
            event.sequence >= access.hiddenBeforeSequence &&
            !!event.expiresAt &&
            event.expiresAt.getTime() > Date.now())
            ? event.frame
            : null,
        senderDeviceId: event.senderDeviceId,
        senderActorId: event.senderActorId,
        intent: event.intent,
        nextRoster: event.nextRoster,
        mediaIds: event.mediaIds,
        createdAt: event.createdAt.toISOString(),
        display:
          event.kind === 'message' &&
          !event.deletedAt &&
          event.sequence >= access.hiddenBeforeSequence &&
          !hidden.has(event.senderActorId) &&
          !!event.expiresAt &&
          event.expiresAt.getTime() > Date.now(),
      })),
      nextSequence: rows.at(-1)?.sequence ?? Math.max(after, joined),
    };
  });
}

export async function listEncryptedRooms(transport: Transport) {
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    await ownDirectory(tx, device);
    const memberships = await tx
      .select({ groupId: socialGroupMembers.groupId })
      .from(socialGroupMembers)
      .where(
        and(
          eq(socialGroupMembers.actorId, device.actorId),
          eq(socialGroupMembers.status, 'active')
        )
      );
    const direct = await tx
      .select({ roomId: chatE2eeDmParticipants.roomId })
      .from(chatE2eeDmParticipants)
      .where(eq(chatE2eeDmParticipants.actorId, device.actorId));
    if (!direct.length && !memberships.length) return [];
    const candidates = await tx
      .select()
      .from(chatE2eeRooms)
      .where(
        or(
          direct.length
            ? inArray(
                chatE2eeRooms.id,
                direct.map((entry) => entry.roomId)
              )
            : undefined,
          memberships.length
            ? inArray(
                chatE2eeRooms.groupId,
                memberships.map((entry) => entry.groupId)
              )
            : undefined
        )
      )
      .orderBy(desc(chatE2eeRooms.updatedAt))
      .limit(100);
    const result = [];
    for (const room of candidates) {
      if (room.state === 'closed') continue;
      const actors = await actorIdsForRoom(tx, room);
      const peerId =
        actors.find((id) => id !== device.actorId) ?? device.actorId;
      if (
        room.kind === 'dm' &&
        (await isBlockedEitherWay(device.actorId, peerId, tx))
      )
        continue;
      let folder: 'inbox' | 'requests' = 'inbox';
      if (room.kind === 'dm') {
        const [own] = await tx
          .select({
            hiddenBeforeSequence: chatE2eeDmParticipants.hiddenBeforeSequence,
          })
          .from(chatE2eeDmParticipants)
          .where(
            and(
              eq(chatE2eeDmParticipants.roomId, room.id),
              eq(chatE2eeDmParticipants.actorId, device.actorId)
            )
          );
        if (!own) continue;
        const [visibleMessage] = await tx
          .select({ id: chatE2eeEvents.id })
          .from(chatE2eeEvents)
          .where(
            and(
              eq(chatE2eeEvents.roomId, room.id),
              eq(chatE2eeEvents.kind, 'message'),
              sql`${chatE2eeEvents.sequence} >= ${own.hiddenBeforeSequence}`,
              isNull(chatE2eeEvents.deletedAt),
              gt(chatE2eeEvents.expiresAt, new Date())
            )
          )
          .limit(1);
        const founder = room.roster.find(
          (entry) => entry.deviceId === room.founderDeviceId
        );
        if (
          !visibleMessage &&
          (own.hiddenBeforeSequence > 0 || founder?.actorId !== device.actorId)
        )
          continue;
        const [request] = await tx
          .select({ id: socialDmRequests.id })
          .from(socialDmRequests)
          .where(
            and(
              eq(socialDmRequests.recipientActorId, device.actorId),
              eq(socialDmRequests.senderActorId, peerId),
              eq(socialDmRequests.state, 'pending')
            )
          );
        if (request) folder = 'requests';
      }
      const peer = room.kind === 'dm' ? await localActor(tx, peerId) : null;
      let group: {
        id: string;
        handle: string;
        name: string | null;
        iconUrl: string | null;
      } | null = null;
      if (room.groupId) {
        const [entry] = await tx
          .select({
            id: socialGroups.id,
            handle: socialActors.username,
            name: socialActors.name,
            iconUrl: socialActors.iconUrl,
          })
          .from(socialGroups)
          .innerJoin(socialActors, eq(socialActors.id, socialGroups.actorId))
          .where(eq(socialGroups.id, room.groupId));
        group = entry ?? null;
      }
      result.push({
        id: room.id,
        kind: room.kind,
        state: room.state,
        sequence: room.sequence,
        epoch: room.epoch,
        revision: room.revision,
        folder,
        peer,
        group,
        updatedAt: room.updatedAt.toISOString(),
      });
    }
    return result;
  });
}

export async function encryptedMessageVisibility(
  transport: Transport,
  roomId: string,
  ids: string[]
) {
  const requested = encryptionInput(
    z.array(z.uuid()).min(1).max(E2EE_VISIBILITY_BATCH),
    ids
  );
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    await ownDirectory(tx, device);
    const access = await roomAccess(tx, device, roomId);
    const hidden = new Set(await getHiddenActorIds(device.actorId, tx));
    const events = await tx
      .select({
        id: chatE2eeEvents.id,
        actorId: chatE2eeEvents.senderActorId,
        sequence: chatE2eeEvents.sequence,
        deletedAt: chatE2eeEvents.deletedAt,
        expiresAt: chatE2eeEvents.expiresAt,
      })
      .from(chatE2eeEvents)
      .where(
        and(
          eq(chatE2eeEvents.roomId, roomId),
          eq(chatE2eeEvents.kind, 'message'),
          inArray(chatE2eeEvents.id, requested)
        )
      );
    const retained = new Map(
      events
        .filter(
          (event) =>
            !event.deletedAt &&
            !!event.expiresAt &&
            event.expiresAt.getTime() > Date.now() &&
            event.sequence >= access.hiddenBeforeSequence
        )
        .map((event) => [event.id, event])
    );
    // Display policy does not grant old ciphertext access. An owner's history-only
    // recovery may contain pre-join messages, unlike a fresh participant's MLS state.
    return requested.map((id) => {
      const event = retained.get(id);
      return {
        id,
        visible: !!event && !hidden.has(event.actorId),
        purge: !event,
      };
    });
  });
}

export async function deleteEncryptedMessage(
  transport: Transport,
  roomId: string,
  eventId: string
) {
  encryptionInput(z.uuid(), eventId);
  return db.transaction(async (tx) => {
    const device = await authorizeEncryptionDevice(
      tx,
      transport.scope,
      transport.proof,
      transport.expected
    );
    const access = await roomAccess(tx, device, roomId);
    const [event] = await tx
      .select()
      .from(chatE2eeEvents)
      .where(
        and(
          eq(chatE2eeEvents.id, eventId),
          eq(chatE2eeEvents.roomId, roomId),
          eq(chatE2eeEvents.kind, 'message')
        )
      );
    if (
      !event ||
      (event.senderActorId !== device.actorId &&
        access.role !== 'admin' &&
        access.role !== 'moderator')
    )
      unavailable();
    await tx
      .update(chatE2eeEvents)
      .set({ deletedAt: new Date(), frame: null })
      .where(eq(chatE2eeEvents.id, event.id));
    await tx
      .update(chatE2eeMedia)
      .set({ expiresAt: new Date() })
      .where(eq(chatE2eeMedia.messageId, event.id));
    return { deleted: true, id: event.id };
  });
}

export { roomAccess, ownDirectory, isRoomDevice };
