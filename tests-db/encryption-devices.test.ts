import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { getPrivateChatStorage, getStorage, type R2Bucket } from '@/lib/r2';
import {
  encryptMedia,
  decryptMedia,
  E2EE_MAX_MEDIA_BYTES,
  sealRecord,
  importAesKey,
} from '@/lib/e2ee/crypto-format';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import type {
  EncryptionScope,
  ExpectedDeviceRequest,
} from '@/lib/server/encryption-context';
import * as schema from '@/lib/schema';
import {
  E2EE_DEVICE_MS,
  signStatement,
  statementMessage,
  sha256,
  type SignedStatement,
  type StatementPurpose,
} from '@/lib/e2ee/identity-contract';
import { fromBase64, toBase64 } from '@/lib/e2ee/sealed-object';
import {
  rosterDigest,
  membershipIntentSchema,
  roomRestartSchema,
  E2EE_MESSAGE_MS,
  E2EE_MAX_FRAME_BYTES,
  E2EE_MAX_DELIVERY_PAGE_BYTES,
  type SubmitRoomEvent,
} from '@/lib/e2ee/room-contract';
import { backupContext } from '@/lib/e2ee/recovery-contract';

const pg = new PGlite();
const db = drizzle(pg, { schema });
let sessionUser: string | null = 'owner';
const oldFlag = process.env.CHAT_E2EE_ENABLED;
mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    auth: async () => (sessionUser ? { user: { id: sessionUser } } : null),
  },
});
mock.module(import.meta.resolve('../lib/federation/domain.ts'), {
  namedExports: {
    getFederationDomain: () => 'chat.invalid',
    DEFAULT_FEDERATION_DOMAIN: 'chat.invalid',
  },
});
const devices = await import('@/lib/server/encryption-devices');
const contexts = await import('@/lib/server/encryption-context');
const rooms = await import('@/lib/server/encryption-rooms');
const mediaService = await import('@/lib/server/encryption-media');
const recovery = await import('@/lib/server/encryption-recovery');
const retention = await import('@/lib/jobs/purge-encrypted-chat');
const mediaPolicy = await import('@/lib/server/chat-media-policy');
const identityResetService =
  await import('@/lib/server/encryption-identity-reset');
const deviceRoute = await import('../app/api/social/encryption/devices/route');
const packageRoute =
  await import('../app/api/social/encryption/key-packages/route');
const privateMediaRoute =
  await import('../app/api/social/encryption/media/[mediaId]/route');
const { NextRequest } = await import('next/server');
type Scope = EncryptionScope;
const personal: Scope = {
  userId: 'owner',
  profileId: 'personal',
  actorId: 'alice',
};
const business: Scope = {
  userId: 'owner',
  profileId: 'business',
  actorId: 'cafe',
};
const manager: Scope = { ...business, userId: 'manager' };
const bob: Scope = {
  userId: 'manager',
  profileId: 'manager-personal',
  actorId: 'manager-actor',
};
const stranger: Scope = {
  userId: 'stranger',
  profileId: 'stranger-personal',
  actorId: 'stranger-actor',
};
const privateObjects = new Map<string, Uint8Array>();
let failPrivatePut = false;
let failPrivateDelete = false;
let beforePrivatePut: (() => Promise<void>) | null = null;
const privateBucket: R2Bucket = {
  async put(key, value) {
    if (failPrivatePut)
      throw new Error('Simulated private object-store failure');
    if (!(value instanceof Uint8Array))
      throw new Error('Expected encrypted binary data');
    const hook = beforePrivatePut;
    beforePrivatePut = null;
    if (hook) await hook();
    privateObjects.set(key, Uint8Array.from(value));
  },
  async delete(keys) {
    if (failPrivateDelete)
      throw new Error('Simulated private object deletion failure');
    for (const key of typeof keys === 'string' ? [keys] : keys)
      privateObjects.delete(key);
  },
  async get(key) {
    const value = privateObjects.get(key);
    return value
      ? { arrayBuffer: async () => Uint8Array.from(value).buffer }
      : null;
  },
};

async function key() {
  const generated = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  if (!('privateKey' in generated))
    throw new Error('Expected an Ed25519 key pair.');
  const publicKey = toBase64(
    new Uint8Array(await crypto.subtle.exportKey('raw', generated.publicKey))
  );
  return {
    publicKey,
    sign: (purpose: StatementPurpose, value: unknown) =>
      signStatement(
        purpose,
        value,
        async (purpose, payload) =>
          new Uint8Array(
            await crypto.subtle.sign(
              'Ed25519',
              generated.privateKey,
              Uint8Array.from(statementMessage(purpose, payload)).buffer
            )
          )
      ),
  };
}
type Key = Awaited<ReturnType<typeof key>>;

async function pending(scope: Scope) {
  const signing = await key();
  const challenge = await devices.beginEncryptionEnrollment(scope, {
    requestId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    signingKey: signing.publicKey,
  });
  const proof = await signing.sign('enrollment', challenge);
  await devices.proveEncryptionEnrollment(scope, {
    requestId: challenge.requestId,
    proof,
  });
  return { signing, challenge, proof };
}
async function approve(
  requested: Awaited<ReturnType<typeof pending>>,
  root: Key,
  ownerScope: Scope
) {
  const issuedAt = Date.now();
  const certificate = await root.sign('device-certificate', {
    ...requested.challenge,
    rootVersion: 1,
    issuedAt,
    expiresAt: issuedAt + E2EE_DEVICE_MS,
  });
  const device = await devices.approveEncryptionEnrollment(ownerScope, {
    requestId: requested.challenge.requestId,
    rootPublicKey: root.publicKey,
    certificate,
  });
  return { ...requested, root, certificate, device };
}
async function enrolled(scope = personal, root?: Key, ownerScope = scope) {
  const approved = await approve(
    await pending(scope),
    root ?? (await key()),
    ownerScope
  );
  const input = {
    operationId: crypto.randomUUID(),
    previousHash: null,
    nextHash: await sha256(crypto.getRandomValues(new Uint8Array(32))),
  };
  const expected = {
    method: 'POST',
    path: '/api/social/encryption/checkpoint',
    bodySha256: await sha256(new TextEncoder().encode(JSON.stringify(input))),
  };
  await devices.checkpointEncryptionState(
    scope,
    await requestProof(approved, scope, expected),
    expected,
    input
  );
  approved.device.stateHash = input.nextHash;
  approved.device.checkpointId = input.operationId;
  return approved;
}
type Enrolled = Awaited<ReturnType<typeof enrolled>>;
function fails(code: string) {
  return (error: unknown) =>
    error instanceof contexts.EncryptionError && error.code === code;
}
async function requestProof(
  device: { signing: Key; device: { id: string; stateHash: string | null } },
  scope: Scope,
  expected: ExpectedDeviceRequest,
  changes: Record<string, unknown> = {}
) {
  return device.signing.sign('device-request', {
    version: 1,
    profileId: scope.profileId,
    actorId: scope.actorId,
    deviceId: device.device.id,
    stateHash: device.device.stateHash,
    ...expected,
    nonce: crypto.randomUUID(),
    issuedAt: Date.now(),
    ...changes,
  });
}
async function packageInput() {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return {
    packages: [
      {
        id: crypto.randomUUID(),
        bytes: toBase64(bytes),
        sha256: await sha256(bytes),
        expiresAt: new Date(Date.now() + 6 * 86_400_000).toISOString(),
      },
    ],
  };
}
function http(
  method: string,
  value?: unknown,
  cookie?: string,
  proof?: SignedStatement
) {
  return new NextRequest('https://chat.invalid/api/social/encryption/devices', {
    method,
    headers: {
      Origin: 'https://chat.invalid',
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: `pana_active_profile=${cookie}` } : {}),
      ...(proof
        ? {
            'x-pana-device-proof': toBase64(
              new TextEncoder().encode(JSON.stringify(proof))
            ),
          }
        : {}),
    },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
}

before(async () => {
  for (const table of [
    schema.users,
    schema.profiles,
    schema.profileOwners,
    schema.socialActors,
    schema.socialGroups,
    schema.socialGroupMembers,
    schema.socialBlocks,
    schema.socialFollows,
    schema.socialDmRequests,
    schema.socialStatuses,
    schema.socialGroupChatMessages,
  ]) {
    const { name, columns } = getTableConfig(table);
    await pg.exec(
      `CREATE TABLE "${name}" (${columns
        .map(
          (column) =>
            `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`
        )
        .join(', ')})`
    );
  }
  await pg.exec(
    await readFile(
      new URL('../drizzle/0078_chat_e2ee_devices.sql', import.meta.url),
      'utf8'
    )
  );
  await pg.exec(`
    ALTER TABLE social_dm_requests ALTER COLUMN state SET DEFAULT 'pending';
    CREATE UNIQUE INDEX fixture_dm_pair ON social_dm_requests(recipient_actor_id, sender_actor_id);
  `);
  await pg.exec(
    await readFile(
      new URL('../drizzle/0079_chat_e2ee_rooms.sql', import.meta.url),
      'utf8'
    )
  );
  await pg.exec(
    await readFile(
      new URL(
        '../drizzle/0080_chat_e2ee_plaintext_guards.sql',
        import.meta.url
      ),
      'utf8'
    )
  );
  await pg.exec(
    await readFile(
      new URL('../drizzle/0081_chat_e2ee_media.sql', import.meta.url),
      'utf8'
    )
  );
  await pg.exec(
    await readFile(
      new URL('../drizzle/0082_chat_e2ee_recovery.sql', import.meta.url),
      'utf8'
    )
  );
  await pg.exec(
    await readFile(
      new URL('../drizzle/0083_chat_e2ee_lifecycle.sql', import.meta.url),
      'utf8'
    )
  );
});
beforeEach(async () => {
  sessionUser = 'owner';
  process.env.CHAT_E2EE_ENABLED = '1';
  failPrivatePut = false;
  failPrivateDelete = false;
  beforePrivatePut = null;
  privateObjects.clear();
  getPrivateChatStorage({ CHAT_E2EE_BUCKET: privateBucket });
  await pg.exec('TRUNCATE chat_e2ee_object_deletions');
  await pg.exec(`TRUNCATE users, profiles, profile_owners, social_actors,
    social_groups, social_group_members, social_blocks, social_follows,
    social_dm_requests, social_statuses, social_group_chat_messages, chat_e2ee_rooms CASCADE`);
  await db.insert(schema.users).values(
    ['owner', 'manager', 'stranger'].map((id) => ({
      id,
      email: `${id}@chat.invalid`,
      name: id,
      screenname: id,
    }))
  );
  await db.insert(schema.profiles).values([
    {
      id: 'personal',
      userId: 'owner',
      socialEligible: true,
      name: 'Owner',
      email: 'owner@chat.invalid',
    },
    {
      id: 'manager-personal',
      userId: 'manager',
      socialEligible: true,
      name: 'Manager',
      email: 'manager@chat.invalid',
    },
    {
      id: 'stranger-personal',
      userId: 'stranger',
      socialEligible: true,
      name: 'Stranger',
      email: 'stranger@chat.invalid',
    },
    {
      id: 'business',
      userId: null,
      socialEligible: true,
      name: 'Cafe',
      email: 'cafe@chat.invalid',
    },
  ]);
  await db.insert(schema.profileOwners).values([
    {
      id: 'business-owner',
      profileId: 'business',
      userId: 'owner',
      role: 'owner',
    },
    {
      id: 'business-manager',
      profileId: 'business',
      userId: 'manager',
      role: 'editor',
    },
  ]);
  await db.insert(schema.socialActors).values(
    [
      ['alice', 'personal'],
      ['manager-actor', 'manager-personal'],
      ['stranger-actor', 'stranger-personal'],
      ['cafe', 'business'],
    ].map(([id, profileId]) => ({
      id,
      profileId,
      username: id,
      name: id,
      domain: 'chat.invalid',
      type: 'Person',
      uri: `https://chat.invalid/p/${id}`,
      inboxUrl: `https://chat.invalid/p/${id}/inbox`,
      outboxUrl: `https://chat.invalid/p/${id}/outbox`,
      followersUrl: `https://chat.invalid/p/${id}/followers`,
      followingUrl: `https://chat.invalid/p/${id}/following`,
      publicKey: 'activitypub-fixture',
    }))
  );
  await db.insert(schema.socialActors).values({
    id: 'garden-actor',
    username: 'garden',
    name: 'Garden',
    domain: 'chat.invalid',
    type: 'Group',
    uri: 'https://chat.invalid/g/garden',
    inboxUrl: 'https://chat.invalid/g/garden/inbox',
    outboxUrl: 'https://chat.invalid/g/garden/outbox',
    followersUrl: 'https://chat.invalid/g/garden/followers',
    followingUrl: 'https://chat.invalid/g/garden/following',
    publicKey: 'activitypub-fixture',
  });
  await db.insert(schema.socialGroups).values({
    id: 'garden',
    actorId: 'garden-actor',
    visibility: 'private',
    memberCount: 2,
  });
  await db.insert(schema.socialGroupMembers).values([
    {
      id: 'alice-garden',
      groupId: 'garden',
      actorId: 'alice',
      role: 'admin',
      status: 'active',
    },
    {
      id: 'bob-garden',
      groupId: 'garden',
      actorId: 'manager-actor',
      role: 'member',
      status: 'active',
    },
  ]);
});
after(async () => {
  if (oldFlag === undefined) delete process.env.CHAT_E2EE_ENABLED;
  else process.env.CHAT_E2EE_ENABLED = oldFlag;
  await pg.close();
});

describe('account/profile-bound encrypted device enrollment', () => {
  it('creates only public identity metadata after device possession and separate owner-key approval', async () => {
    const result = await enrolled();
    const state = await devices.getEncryptionIdentity(personal);
    assert.equal(state.identity?.rootPublicKey, result.root.publicKey);
    assert.equal(state.identity?.encryptionRequired, false);
    assert.equal(state.devices.length, 1);
    assert.equal(state.devices[0].userId, 'owner');
    assert.equal(
      state.devices[0].credential,
      JSON.stringify({
        version: 1,
        profileId: 'personal',
        actorId: 'alice',
        deviceId: result.device.id,
      })
    );
    assert.notEqual(result.root.publicKey, result.device.signingKey);
    for (const table of [
      schema.chatE2eeIdentities,
      schema.chatE2eeDevices,
      schema.chatE2eeEnrollments,
      schema.chatE2eeKeyPackages,
      schema.chatE2eeRequestNonces,
    ]) {
      const { name } = getTableConfig(table);
      const rows = await pg.query<{ relrowsecurity: boolean }>(
        'SELECT relrowsecurity FROM pg_class WHERE relname = $1',
        [name]
      );
      assert.equal(rows.rows[0].relrowsecurity, true);
    }
  });

  it('will not approve a device without its challenge proof', async () => {
    const signing = await key();
    const root = await key();
    const challenge = await devices.beginEncryptionEnrollment(personal, {
      requestId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      signingKey: signing.publicKey,
    });
    const certificate = await root.sign('device-certificate', {
      ...challenge,
      rootVersion: 1,
      issuedAt: Date.now(),
      expiresAt: Date.now() + E2EE_DEVICE_MS,
    });
    await assert.rejects(
      devices.approveEncryptionEnrollment(personal, {
        requestId: challenge.requestId,
        rootPublicKey: root.publicKey,
        certificate,
      }),
      fails('DEVICE_PROOF_REQUIRED')
    );
  });

  it('rejects login-only replacement of an existing profile key', async () => {
    const existing = await enrolled();
    const newcomer = await pending(personal);
    const wrongRoot = await key();
    await assert.rejects(
      approve(newcomer, wrongRoot, personal),
      fails('IDENTITY_KEY_CHANGED')
    );
    const issuedAt = Date.now();
    const forged = await wrongRoot.sign('device-certificate', {
      ...newcomer.challenge,
      rootVersion: 1,
      issuedAt,
      expiresAt: issuedAt + E2EE_DEVICE_MS,
    });
    await assert.rejects(
      devices.approveEncryptionEnrollment(personal, {
        requestId: newcomer.challenge.requestId,
        rootPublicKey: existing.root.publicKey,
        certificate: forged,
      }),
      fails('INVALID_SIGNATURE')
    );
    assert.equal(
      (await devices.getEncryptionIdentity(personal)).devices.length,
      1
    );
  });

  it('requires an owner-held key to approve a business manager device', async () => {
    const owner = await enrolled(business);
    const request = await pending(manager);
    await assert.rejects(
      approve(request, owner.root, manager),
      fails('OWNER_APPROVAL_REQUIRED')
    );
    const approved = await approve(request, owner.root, business);
    assert.equal(approved.device.userId, 'manager');
    assert.equal(approved.device.profileId, 'business');
    assert.equal(
      (await devices.getEncryptionIdentity(manager)).canApprove,
      false
    );
  });

  it('refuses substituted profiles/actors and a requester whose management grant was removed', async () => {
    await assert.rejects(
      devices.getEncryptionIdentity({ ...personal, actorId: 'cafe' }),
      fails('PROFILE_UNAVAILABLE')
    );
    await assert.rejects(
      devices.getEncryptionIdentity({ ...business, userId: 'stranger' }),
      fails('PROFILE_UNAVAILABLE')
    );
    const owner = await enrolled(business);
    const request = await pending(manager);
    await db
      .delete(schema.profileOwners)
      .where(eq(schema.profileOwners.id, 'business-manager'));
    await assert.rejects(
      approve(request, owner.root, business),
      fails('REQUESTER_ACCESS_REVOKED')
    );
  });

  it('cannot reuse personal root or MLS signing keys for a second profile', async () => {
    const personalDevice = await enrolled();
    await assert.rejects(
      enrolled(business, personalDevice.root),
      fails('KEY_SCOPE_REUSE')
    );
    const request = await pending(business);
    await assert.rejects(
      approve(request, request.signing, business),
      fails('SEPARATE_KEYS_REQUIRED')
    );
  });

  it('binds owner certificates to the exact account, nonce and profile', async () => {
    const request = await pending(personal);
    const root = await key();
    const issuedAt = Date.now();
    const certificate = await root.sign('device-certificate', {
      ...request.challenge,
      userId: 'stranger',
      rootVersion: 1,
      issuedAt,
      expiresAt: issuedAt + E2EE_DEVICE_MS,
    });
    await assert.rejects(
      devices.approveEncryptionEnrollment(personal, {
        requestId: request.challenge.requestId,
        rootPublicKey: root.publicKey,
        certificate,
      }),
      fails('CERTIFICATE_MISMATCH')
    );
  });

  it('makes approval retries idempotent and never reactivates a revoked device', async () => {
    const result = await enrolled();
    const retry = await devices.approveEncryptionEnrollment(personal, {
      requestId: result.challenge.requestId,
      rootPublicKey: result.root.publicKey,
      certificate: result.certificate,
    });

    assert.equal(retry.id, result.device.id);
    const statement = await result.root.sign('device-revocation', {
      version: 1,
      profileId: personal.profileId,
      actorId: personal.actorId,
      deviceId: result.device.id,
      rootVersion: 1,
      issuedAt: Date.now(),
      nonce: crypto.randomUUID(),
    });
    await devices.revokeEncryptionDevice(personal, { statement });
    await assert.rejects(
      devices.approveEncryptionEnrollment(personal, {
        requestId: result.challenge.requestId,
        rootPublicKey: result.root.publicKey,
        certificate: result.certificate,
      }),
      fails('DEVICE_ID_USED')
    );
    await assert.rejects(
      devices.beginEncryptionEnrollment(personal, {
        requestId: crypto.randomUUID(),
        deviceId: result.device.id,
        signingKey: result.device.signingKey,
      }),
      fails('DEVICE_ID_USED')
    );
  });

  it('enforces the actual active-device and pending-enrollment bounds', async () => {
    const root = await key();
    for (let index = 0; index < 20; index++) await enrolled(personal, root);
    await assert.rejects(enrolled(personal, root), fails('DEVICE_LIMIT'));
    for (let index = 0; index < 4; index++) {
      await devices.beginEncryptionEnrollment(personal, {
        requestId: crypto.randomUUID(),
        deviceId: crypto.randomUUID(),
        signingKey: (await key()).publicKey,
      });
    }
    await assert.rejects(
      devices.beginEncryptionEnrollment(personal, {
        requestId: crypto.randomUUID(),
        deviceId: crypto.randomUUID(),
        signingKey: (await key()).publicKey,
      }),
      fails('ENROLLMENT_LIMIT')
    );
  });
});

describe('signed encrypted-device request boundary', () => {
  it('requires possession, binds route/body/profile and rejects replay', async () => {
    const device = await enrolled();
    const input = await packageInput();
    const expected = {
      method: 'POST',
      path: '/api/social/encryption/key-packages',
      bodySha256: await sha256(new TextEncoder().encode(JSON.stringify(input))),
    };
    const proof = await requestProof(device, personal, expected);
    const allowed = await devices.uploadEncryptionKeyPackages(
      personal,
      proof,
      expected,
      input
    );
    assert.equal(allowed.added, 1);
    await assert.rejects(
      devices.uploadEncryptionKeyPackages(personal, proof, expected, input),
      fails('DEVICE_PROOF_REPLAY')
    );
    const wrongBody = await requestProof(device, personal, expected);
    await assert.rejects(
      devices.uploadEncryptionKeyPackages(
        personal,
        wrongBody,
        { ...expected, bodySha256: 'a'.repeat(64) },
        input
      ),
      fails('DEVICE_PROOF_MISMATCH')
    );
    const stale = await requestProof(device, personal, expected, {
      issuedAt: Date.now() - 180_000,
    });
    await assert.rejects(
      devices.uploadEncryptionKeyPackages(personal, stale, expected, input),
      fails('DEVICE_PROOF_MISMATCH')
    );
  });

  it('stops a business device immediately when its account loses access', async () => {
    const owner = await enrolled(business);
    const device = await enrolled(manager, owner.root, business);
    const input = await packageInput();
    const expected = {
      method: 'POST',
      path: '/api/social/encryption/key-packages',
      bodySha256: await sha256(new TextEncoder().encode(JSON.stringify(input))),
    };
    const proof = await requestProof(device, manager, expected);
    await db
      .delete(schema.profileOwners)
      .where(eq(schema.profileOwners.id, 'business-manager'));
    await assert.rejects(
      devices.uploadEncryptionKeyPackages(manager, proof, expected, input),
      fails('PROFILE_UNAVAILABLE')
    );
  });

  it('uploads bounded, digest-bound public prekeys and purges them on revocation', async () => {
    const device = await enrolled();
    const input = await packageInput();
    const expected = {
      method: 'POST',
      path: '/api/social/encryption/key-packages',
      bodySha256: await sha256(new TextEncoder().encode(JSON.stringify(input))),
    };
    assert.equal(
      (
        await devices.uploadEncryptionKeyPackages(
          personal,
          await requestProof(device, personal, expected),
          expected,
          input
        )
      ).added,
      1
    );
    assert.equal(
      (
        await devices.uploadEncryptionKeyPackages(
          personal,
          await requestProof(device, personal, expected),
          expected,
          input
        )
      ).added,
      0
    );
    await devices.revokeEncryptionDevice(personal, {
      statement: await device.root.sign('device-revocation', {
        version: 1,
        profileId: personal.profileId,
        actorId: personal.actorId,
        deviceId: device.device.id,
        rootVersion: 1,
        issuedAt: Date.now(),
        nonce: crypto.randomUUID(),
      }),
    });
    assert.equal(
      (await db.select().from(schema.chatE2eeKeyPackages)).length,
      0
    );
    await assert.rejects(
      devices.uploadEncryptionKeyPackages(
        personal,
        await requestProof(device, personal, expected),
        expected,
        input
      ),
      fails('DEVICE_APPROVAL_REQUIRED')
    );
  });

  it('enforces the actual one-hundred-unclaimed-prekey limit', async () => {
    const device = await enrolled();
    const expected = {
      method: 'POST',
      path: '/api/social/encryption/key-packages',
      bodySha256: await sha256(new Uint8Array()),
    };
    for (let batch = 0; batch < 4; batch++) {
      const inputs = await Promise.all(
        Array.from({ length: 25 }, () => packageInput())
      );
      const input = { packages: inputs.flatMap((entry) => entry.packages) };
      await devices.uploadEncryptionKeyPackages(
        personal,
        await requestProof(device, personal, expected),
        expected,
        input
      );
    }
    const input = await packageInput();
    await assert.rejects(
      devices.uploadEncryptionKeyPackages(
        personal,
        await requestProof(device, personal, expected),
        expected,
        input
      ),
      fails('KEY_PACKAGE_LIMIT')
    );
  });
});

describe('encrypted enrollment HTTP isolation', () => {
  it('requires sign-in and keeps the feature disabled until explicitly enabled', async () => {
    sessionUser = null;
    const anonymous = await deviceRoute.GET(
      new NextRequest(
        'https://chat.invalid/api/social/encryption/devices?profileId=personal&actorId=alice'
      )
    );
    assert.equal(anonymous.status, 401);
    sessionUser = 'owner';
    process.env.CHAT_E2EE_ENABLED = '0';
    const paused = await deviceRoute.GET(
      new NextRequest(
        'https://chat.invalid/api/social/encryption/devices?profileId=personal&actorId=alice'
      )
    );
    assert.equal(paused.status, 503);
    assert.match(paused.headers.get('cache-control') ?? '', /no-store/);
  });

  it('rejects a stale active-profile cookie instead of falling back to the personal profile', async () => {
    const response = await deviceRoute.POST(
      http(
        'POST',
        {
          profileId: 'business',
          actorId: 'cafe',
          action: 'begin',
          input: {
            requestId: crypto.randomUUID(),
            deviceId: crypto.randomUUID(),
            signingKey: (await key()).publicKey,
          },
        },
        'personal'
      )
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'PROFILE_CHANGED');
    assert.equal(
      (await db.select().from(schema.chatE2eeEnrollments)).length,
      0
    );
  });

  it('refuses cross-origin writes, missing explicit identities and unsigned prekey uploads', async () => {
    const value = {
      profileId: 'personal',
      actorId: 'alice',
      action: 'begin',
      input: {},
    };
    const cross = http('POST', value);
    cross.headers.set('origin', 'https://other.invalid');
    assert.equal((await deviceRoute.POST(cross)).status, 403);
    assert.equal(
      (await deviceRoute.POST(http('POST', { action: 'begin', input: {} })))
        .status,
      400
    );
    const packages = new NextRequest(
      'https://chat.invalid/api/social/encryption/key-packages',
      {
        method: 'POST',
        headers: {
          Origin: 'https://chat.invalid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'personal',
          actorId: 'alice',
          input: await packageInput(),
        }),
      }
    );
    assert.equal((await packageRoute.POST(packages)).status, 403);
  });

  it('verifies real HTTP proof headers against the exact route and raw body', async () => {
    const device = await enrolled();
    const input = await packageInput();
    const body = JSON.stringify({
      profileId: 'personal',
      actorId: 'alice',
      input,
    });
    const expected = {
      method: 'POST',
      path: '/api/social/encryption/key-packages',
      bodySha256: await sha256(new TextEncoder().encode(body)),
    };
    const proof = await requestProof(device, personal, expected);
    const headers = {
      Origin: 'https://chat.invalid',
      'Content-Type': 'application/json',
      'x-pana-device-proof': toBase64(
        new TextEncoder().encode(JSON.stringify(proof))
      ),
    };
    const request = () =>
      new NextRequest(`https://chat.invalid${expected.path}`, {
        method: 'POST',
        headers,
        body,
      });
    const accepted = await packageRoute.POST(request());
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).data.added, 1);
    assert.equal((await packageRoute.POST(request())).status, 409);
    const changed = JSON.stringify({
      profileId: 'personal',
      actorId: 'alice',
      input: {
        packages: input.packages.map((packet) => ({
          ...packet,
          id: crypto.randomUUID(),
        })),
      },
    });
    const rejected = await packageRoute.POST(
      new NextRequest(`https://chat.invalid${expected.path}`, {
        method: 'POST',
        headers,
        body: changed,
      })
    );
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).code, 'DEVICE_PROOF_MISMATCH');
  });
});

type RoomSnapshot = Awaited<ReturnType<typeof rooms.readEncryptedRoom>>;
async function transport(
  device: Enrolled,
  scope: Scope,
  method = 'POST',
  suffix = '',
  input: unknown = {}
) {
  const expected = {
    method,
    path: `/api/social/encryption/rooms${suffix}`,
    bodySha256: await sha256(new TextEncoder().encode(JSON.stringify(input))),
  };
  return {
    scope,
    proof: await requestProof(device, scope, expected),
    expected,
  };
}
async function ready(scope = personal, root?: Key, ownerScope = scope) {
  const device = await enrolled(scope, root, ownerScope);
  const input = await packageInput();
  await devices.uploadEncryptionKeyPackages(
    scope,
    await requestProof(device, scope, {
      method: 'POST',
      path: '/api/social/encryption/key-packages',
      bodySha256: await sha256(new TextEncoder().encode(JSON.stringify(input))),
    }),
    {
      method: 'POST',
      path: '/api/social/encryption/key-packages',
      bodySha256: await sha256(new TextEncoder().encode(JSON.stringify(input))),
    },
    input
  );
  await db
    .update(schema.chatE2eeIdentities)
    .set({ encryptionRequired: true })
    .where(eq(schema.chatE2eeIdentities.profileId, scope.profileId));
  return device;
}
async function roomSnapshot(device: Enrolled, scope: Scope, roomId: string) {
  return rooms.readEncryptedRoom(
    await transport(device, scope, 'GET', `/${roomId}`),
    roomId
  );
}
async function commitInput(
  room: RoomSnapshot,
  author: Enrolled,
  scope: Scope,
  targetId: string,
  operation: 'add' | 'remove'
): Promise<SubmitRoomEvent> {
  const claimed =
    operation === 'add'
      ? await rooms.claimEncryptedKeyPackage(
          await transport(author, scope, 'POST', `/${room.id}/key-package`),
          room.id,
          { deviceId: targetId }
        )
      : null;
  const roster = claimed
    ? [...room.roster, claimed.target]
    : room.roster.filter((entry) => entry.deviceId !== targetId);
  const frame = toBase64(crypto.getRandomValues(new Uint8Array(64)));
  const welcome = claimed
    ? toBase64(crypto.getRandomValues(new Uint8Array(64)))
    : null;
  const id = crypto.randomUUID();
  const frameSha256 = await sha256(
    Uint8Array.from(atob(frame), (char) => char.charCodeAt(0))
  );
  const intent = await author.signing.sign('room-intent', {
    version: 1,
    roomId: room.id,
    cryptoGroupId: room.cryptoGroupId,
    attemptId: id,
    actorId: scope.actorId,
    deviceId: author.device.id,
    revision: room.revision,
    previousSequence: room.sequence,
    fromEpoch: room.epoch,
    toEpoch: (BigInt(room.epoch) + 1n).toString(),
    previousRosterDigest: room.rosterDigest,
    nextRosterDigest: await rosterDigest(roster),
    operation,
    targetDeviceId: targetId,
    keyPackageId: claimed?.id ?? null,
    frameSha256,
    welcomeSha256: welcome ? await sha256(fromBase64(welcome)) : null,
  });
  return {
    id,
    clientId: id,
    kind: 'commit',
    cryptoGroupId: room.cryptoGroupId,
    revision: room.revision,
    afterSequence: room.sequence,
    epoch: room.epoch,
    frame,
    frameSha256,
    expiresAt: null,
    intent,
    welcomes:
      claimed && welcome
        ? [
            {
              deviceId: targetId,
              keyPackageId: claimed.id,
              frame: welcome,
            },
          ]
        : [],
    mediaIds: [],
  };
}
async function publish(
  room: RoomSnapshot,
  author: Enrolled,
  scope: Scope,
  input: SubmitRoomEvent
) {
  return rooms.submitEncryptedRoomEvent(
    await transport(author, scope, 'POST', `/${room.id}/events`, input),
    room.id,
    input
  );
}
async function admit(
  room: RoomSnapshot,
  author: Enrolled,
  scope: Scope,
  targetId: string
) {
  await publish(
    room,
    author,
    scope,
    await commitInput(room, author, scope, targetId, 'add')
  );
  return roomSnapshot(author, scope, room.id);
}
async function messageInput(
  room: RoomSnapshot,
  clientId = crypto.randomUUID()
): Promise<SubmitRoomEvent> {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return {
    id: crypto.randomUUID(),
    clientId,
    kind: 'message',
    cryptoGroupId: room.cryptoGroupId,
    revision: room.revision,
    afterSequence: room.sequence,
    epoch: room.epoch,
    frame: toBase64(bytes),
    frameSha256: await sha256(bytes),
    expiresAt: new Date(Date.now() + E2EE_MESSAGE_MS - 1000).toISOString(),
    intent: null,
    welcomes: [],
    mediaIds: [],
  };
}
async function directPair() {
  const alice = await ready();
  const recipient = await ready(bob);
  const opened = await rooms.openEncryptedRoom(
    await transport(alice, personal),
    {
      kind: 'dm',
      peerActorId: bob.actorId,
    }
  );
  return {
    alice,
    recipient,
    room: await admit(opened, alice, personal, recipient.device.id),
  };
}
async function groupPair() {
  const alice = await ready();
  const recipient = await ready(bob);
  const opened = await rooms.openEncryptedRoom(
    await transport(alice, personal),
    {
      kind: 'group',
      groupId: 'garden',
    }
  );
  return {
    alice,
    recipient,
    room: await admit(opened, alice, personal, recipient.device.id),
  };
}

describe('ordered ciphertext delivery and authoritative membership', () => {
  it('refuses application frames before every ready device is admitted', async () => {
    const alice = await ready();
    await ready(bob);
    const room = await rooms.openEncryptedRoom(
      await transport(alice, personal),
      { kind: 'dm', peerActorId: bob.actorId }
    );
    assert.equal(room.state, 'initializing');
    await assert.rejects(
      publish(room, alice, personal, await messageInput(room)),
      fails('MEMBERSHIP_UPDATE_PENDING')
    );
    assert.equal((await db.select().from(schema.chatE2eeEvents)).length, 0);
  });

  it('persists only opaque frames and returns exact accepted receipts on retries', async () => {
    const { alice, recipient, room } = await directPair();
    assert.equal(room.state, 'active');
    const input = await messageInput(room);
    const receipt = await publish(room, alice, personal, input);
    assert.deepEqual(await publish(room, alice, personal, input), receipt);
    assert.deepEqual(
      await rooms.encryptedRoomReceipt(
        await transport(
          alice,
          personal,
          'GET',
          `/${room.id}/receipts/${input.id}`
        ),
        room.id,
        input.id
      ),
      receipt
    );
    await assert.rejects(
      publish(room, alice, personal, {
        ...input,
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      }),
      fails('ATTEMPT_ID_USED')
    );
    await assert.rejects(
      publish(room, alice, personal, { ...input, id: crypto.randomUUID() }),
      fails('MESSAGE_ALREADY_ACCEPTED')
    );
    const read = await rooms.readEncryptedRoomEvents(
      await transport(recipient, bob, 'GET', `/${room.id}/events`),
      room.id
    );
    assert.equal(read.events.length, 1);
    assert.equal(read.events[0].frame, input.frame);
    assert.equal(read.events[0].display, true);
    const [stored] = await db
      .select()
      .from(schema.chatE2eeEvents)
      .where(eq(schema.chatE2eeEvents.id, input.id));
    assert.equal('body' in stored, false);
    assert.equal('content' in stored, false);
  });

  it('keeps new group devices behind their own welcome and join sequence', async () => {
    const { alice, room } = await groupPair();
    const old = await publish(room, alice, personal, await messageInput(room));
    const carol = await ready(stranger);
    await db.insert(schema.socialGroupMembers).values({
      id: 'carol-garden',
      groupId: 'garden',
      actorId: stranger.actorId,
      role: 'member',
      status: 'active',
    });
    const pending = await roomSnapshot(alice, personal, room.id);
    assert.equal(pending.state, 'rekey_required');
    const notJoined = await rooms.readEncryptedRoomEvents(
      await transport(carol, stranger, 'GET', `/${room.id}/events`),
      room.id
    );
    assert.equal(notJoined.room.joined, false);
    assert.equal(notJoined.events.length, 0);
    const updated = await admit(pending, alice, personal, carol.device.id);
    const fresh = await publish(
      updated,
      alice,
      personal,
      await messageInput(updated)
    );
    const joined = await rooms.readEncryptedRoomEvents(
      await transport(carol, stranger, 'GET', `/${room.id}/events`),
      room.id
    );
    assert.equal(
      joined.events.some((event) => event.id === old.id),
      false
    );
    assert.equal(
      joined.events.some((event) => event.id === fresh.id),
      true
    );
    assert.ok(joined.room.welcome?.intent);
    assert.ok(joined.room.welcome?.roster);
  });

  it('freezes old-epoch sends atomically on group removal until an authorized client rekeys', async () => {
    const { alice, recipient, room } = await groupPair();
    await db
      .delete(schema.socialGroupMembers)
      .where(eq(schema.socialGroupMembers.id, 'bob-garden'));
    await assert.rejects(
      publish(room, alice, personal, await messageInput(room)),
      fails('STALE_ROOM_STATE')
    );
    await assert.rejects(
      roomSnapshot(recipient, bob, room.id),
      fails('ROOM_UNAVAILABLE')
    );
    let updated = await roomSnapshot(alice, personal, room.id);
    assert.equal(updated.state, 'rekey_required');
    await publish(
      updated,
      alice,
      personal,
      await commitInput(updated, alice, personal, recipient.device.id, 'remove')
    );
    updated = await roomSnapshot(alice, personal, room.id);
    assert.equal(updated.state, 'active');
    assert.equal(
      updated.roster.some((entry) => entry.deviceId === recipient.device.id),
      false
    );
    await publish(updated, alice, personal, await messageInput(updated));
  });

  it('freezes existing rooms when an approved device is revoked', async () => {
    const { alice, recipient, room } = await groupPair();
    await devices.revokeEncryptionDevice(bob, {
      statement: await recipient.root.sign('device-revocation', {
        version: 1,
        profileId: bob.profileId,
        actorId: bob.actorId,
        rootVersion: 1,
        deviceId: recipient.device.id,
        issuedAt: Date.now(),
        nonce: crypto.randomUUID(),
      }),
    });
    await assert.rejects(
      publish(room, alice, personal, await messageInput(room)),
      fails('STALE_ROOM_STATE')
    );
    const updated = await roomSnapshot(alice, personal, room.id);
    assert.equal(updated.state, 'rekey_required');
    assert.equal(
      updated.desired.some((entry) => entry.deviceId === recipient.device.id),
      false
    );
  });

  it('rejects unauthorized additions, removal of an entitled device and cross-room prekey reuse', async () => {
    const { alice, recipient, room } = await groupPair();
    await assert.rejects(
      publish(
        room,
        alice,
        personal,
        await commitInput(room, alice, personal, recipient.device.id, 'remove')
      ),
      fails('MEMBERSHIP_CHANGED')
    );
    const outsider = await ready(stranger);
    await assert.rejects(
      rooms.claimEncryptedKeyPackage(
        await transport(alice, personal, 'POST', `/${room.id}/key-package`),
        room.id,
        { deviceId: outsider.device.id }
      ),
      fails('MEMBERSHIP_CHANGED')
    );
    await assert.rejects(
      rooms.claimEncryptedKeyPackage(
        await transport(outsider, stranger, 'POST', `/${room.id}/key-package`),
        room.id,
        { deviceId: alice.device.id }
      ),
      fails('ROOM_UNAVAILABLE')
    );
  });

  it('serializes competing commits into a single accepted next epoch', async () => {
    const { alice, recipient, room } = await groupPair();
    const newAlice = await ready(personal, alice.root);
    const newBob = await ready(bob, recipient.root);
    const current = await roomSnapshot(alice, personal, room.id);
    const a = await commitInput(
      current,
      alice,
      personal,
      newAlice.device.id,
      'add'
    );
    const b = await commitInput(
      current,
      recipient,
      bob,
      newBob.device.id,
      'add'
    );
    const outcomes = await Promise.allSettled([
      publish(current, alice, personal, a),
      publish(current, recipient, bob, b),
    ]);
    assert.equal(
      outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
      1
    );
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    assert.ok(
      rejected?.status === 'rejected' &&
        fails('STALE_ROOM_STATE')(rejected.reason)
    );
    const updated = await roomSnapshot(alice, personal, room.id);
    assert.equal(BigInt(updated.epoch), BigInt(current.epoch) + 1n);
    assert.equal(updated.sequence, current.sequence + 1);
  });

  it('never sends expired/deleted application ciphertext but still serves blocked-author control frames', async () => {
    const { alice, recipient, room } = await groupPair();
    const application = await publish(
      room,
      alice,
      personal,
      await messageInput(room)
    );
    await db
      .update(schema.chatE2eeEvents)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(schema.chatE2eeEvents.id, application.id));
    await db.insert(schema.socialBlocks).values({
      id: 'blocked-alice',
      actorId: bob.actorId,
      targetActorId: personal.actorId,
      kind: 'block',
    });
    const newDevice = await ready(personal, alice.root);
    const current = await roomSnapshot(alice, personal, room.id);
    const commit = await publish(
      current,
      alice,
      personal,
      await commitInput(current, alice, personal, newDevice.device.id, 'add')
    );
    const result = await rooms.readEncryptedRoomEvents(
      await transport(recipient, bob, 'GET', `/${room.id}/events`),
      room.id
    );
    assert.equal(
      result.events.find((event) => event.id === application.id)?.frame,
      null
    );
    const control = result.events.find((event) => event.id === commit.id);
    assert.ok(control?.frame);
    assert.equal(control.display, false);
    assert.equal(result.nextSequence, commit.sequence);
  });

  it('preserves quiet DM requests and hides deleted requests without changing sender-visible room state', async () => {
    const { alice, recipient, room } = await directPair();
    await publish(room, alice, personal, await messageInput(room));
    const [request] = await db.select().from(schema.socialDmRequests);
    assert.equal(request.state, 'pending');
    const list = await rooms.listEncryptedRooms(
      await transport(recipient, bob, 'GET')
    );
    assert.equal(list[0].folder, 'requests');
    const before = await roomSnapshot(alice, personal, room.id);
    await db
      .delete(schema.socialDmRequests)
      .where(eq(schema.socialDmRequests.id, request.id));
    const after = await roomSnapshot(alice, personal, room.id);
    assert.equal(after.revision, before.revision);
    const hidden = await rooms.readEncryptedRoomEvents(
      await transport(recipient, bob, 'GET', `/${room.id}/events`),
      room.id
    );
    assert.equal(hidden.events.filter((event) => event.display).length, 0);
    assert.equal(
      hidden.events.every((event) => event.frame === null),
      true
    );
    assert.equal(
      (await rooms.listEncryptedRooms(await transport(recipient, bob, 'GET')))
        .length,
      0
    );
    await publish(after, alice, personal, await messageInput(after));
    const [newRequest] = await db.select().from(schema.socialDmRequests);
    assert.equal(newRequest.state, 'pending');
  });

  it('enforces symmetric blocks and current group-admin activation rights', async () => {
    const alice = await ready();
    const recipient = await ready(bob);
    await assert.rejects(
      rooms.openEncryptedRoom(await transport(recipient, bob), {
        kind: 'group',
        groupId: 'garden',
      }),
      fails('GROUP_ADMIN_REQUIRED')
    );
    await db.insert(schema.socialBlocks).values({
      id: 'blocked',
      actorId: bob.actorId,
      targetActorId: personal.actorId,
      kind: 'block',
    });
    await assert.rejects(
      rooms.openEncryptedRoom(await transport(alice, personal), {
        kind: 'dm',
        peerActorId: bob.actorId,
      }),
      fails('DIRECT_THREAD_REFUSED')
    );
  });
});

function policyRejection(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes('Encrypted chat') ||
      (error.cause instanceof Error &&
        error.cause.message.includes('Encrypted chat')))
  );
}
async function plainStatus(
  actorId: string,
  recipientTo: string[],
  overrides: Partial<typeof schema.socialStatuses.$inferInsert> = {}
) {
  const id = crypto.randomUUID();
  return db.insert(schema.socialStatuses).values({
    id,
    uri: `https://chat.invalid/status/${id}`,
    actorId,
    type: 'Note',
    content: 'legacy plaintext fixture',
    recipientTo,
    recipientCc: [],
    isDraft: false,
    ...overrides,
  });
}

describe('persistent no-plaintext-downgrade and cross-scope controls', () => {
  it('refuses incoming/outgoing direct plaintext but preserves public, followers, Panas and group posts', async () => {
    await plainStatus(personal.actorId, [
      'https://chat.invalid/p/manager-actor',
    ]);
    await ready();
    await assert.rejects(
      plainStatus(personal.actorId, ['https://chat.invalid/p/manager-actor']),
      policyRejection
    );
    await assert.rejects(
      plainStatus(bob.actorId, ['https://chat.invalid/p/alice']),
      policyRejection
    );
    await plainStatus(personal.actorId, [
      'https://www.w3.org/ns/activitystreams#Public',
    ]);
    await plainStatus(personal.actorId, [
      'https://chat.invalid/p/alice/followers',
    ]);
    await plainStatus(
      personal.actorId,
      ['https://chat.invalid/p/manager-actor'],
      { type: 'Panas' }
    );
    await plainStatus(personal.actorId, ['https://chat.invalid/g/garden'], {
      groupId: 'garden',
    });
  });

  it('keeps transport latches enforced when rollout is paused or identity readiness changes', async () => {
    await ready();
    process.env.CHAT_E2EE_ENABLED = '0';
    await assert.rejects(
      plainStatus(personal.actorId, ['https://chat.invalid/p/manager-actor']),
      policyRejection
    );
    await assert.rejects(
      db
        .update(schema.socialActors)
        .set({ encryptedChatRequired: false })
        .where(eq(schema.socialActors.id, personal.actorId)),
      policyRejection
    );
    await db
      .update(schema.chatE2eeIdentities)
      .set({ encryptionRequired: false })
      .where(eq(schema.chatE2eeIdentities.profileId, personal.profileId));
    const [actor] = await db
      .select({ required: schema.socialActors.encryptedChatRequired })
      .from(schema.socialActors)
      .where(eq(schema.socialActors.id, personal.actorId));
    assert.equal(actor.required, true);
    await assert.rejects(
      plainStatus(personal.actorId, ['https://chat.invalid/p/manager-actor']),
      policyRejection
    );
  });

  it('blocks legacy group-chat inserts and edits after activation without deleting legacy history', async () => {
    const id = crypto.randomUUID();
    const value = {
      id,
      groupId: 'garden',
      actorId: personal.actorId,
      clientId: crypto.randomUUID(),
      body: 'legacy group history',
      attachments: [],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + E2EE_MESSAGE_MS),
    };
    await db.insert(schema.socialGroupChatMessages).values(value);
    const alice = await ready();
    await rooms.openEncryptedRoom(await transport(alice, personal), {
      kind: 'group',
      groupId: 'garden',
    });
    const [legacy] = await db
      .select()
      .from(schema.socialGroupChatMessages)
      .where(eq(schema.socialGroupChatMessages.id, id));
    assert.equal(legacy.body, 'legacy group history');
    await assert.rejects(
      db.insert(schema.socialGroupChatMessages).values({
        ...value,
        id: crypto.randomUUID(),
        clientId: crypto.randomUUID(),
      }),
      policyRejection
    );
    await assert.rejects(
      db
        .update(schema.socialGroupChatMessages)
        .set({ body: 'new plaintext' })
        .where(eq(schema.socialGroupChatMessages.id, id)),
      policyRejection
    );
    await db
      .update(schema.socialGroupChatMessages)
      .set({ deletedAt: new Date() })
      .where(eq(schema.socialGroupChatMessages.id, id));
  });

  it('will not accept a welcome backed by a prekey claimed for another room', async () => {
    const { alice, room } = await groupPair();
    const extra = await ready(personal, alice.root);
    const current = await roomSnapshot(alice, personal, room.id);
    const staged = await commitInput(
      current,
      alice,
      personal,
      extra.device.id,
      'add'
    );
    assert.ok(staged.intent);
    const oldIntent = membershipIntentSchema.parse(
      JSON.parse(new TextDecoder().decode(fromBase64(staged.intent.payload)))
    );
    const direct = await rooms.openEncryptedRoom(
      await transport(alice, personal),
      {
        kind: 'dm',
        peerActorId: bob.actorId,
      }
    );
    const target = direct.desired.find(
      (entry) => entry.deviceId === extra.device.id
    );
    assert.ok(target);
    const id = crypto.randomUUID();
    const forged: SubmitRoomEvent = {
      ...staged,
      id,
      clientId: id,
      cryptoGroupId: direct.cryptoGroupId,
      revision: direct.revision,
      afterSequence: direct.sequence,
      epoch: direct.epoch,
      intent: await alice.signing.sign('room-intent', {
        ...oldIntent,
        roomId: direct.id,
        cryptoGroupId: direct.cryptoGroupId,
        attemptId: id,
        revision: direct.revision,
        previousSequence: direct.sequence,
        fromEpoch: direct.epoch,
        toEpoch: (BigInt(direct.epoch) + 1n).toString(),
        previousRosterDigest: direct.rosterDigest,
        nextRosterDigest: await rosterDigest([...direct.roster, target]),
      }),
    };
    await assert.rejects(
      publish(direct, alice, personal, forged),
      fails('PREKEY_UNAVAILABLE')
    );
  });

  it('revokes a removed business manager and freezes their existing room membership atomically', async () => {
    const owner = await ready(business);
    const managed = await ready(manager, owner.root, business);
    const recipient = await ready(bob);
    let room = await rooms.openEncryptedRoom(
      await transport(managed, manager),
      {
        kind: 'dm',
        peerActorId: bob.actorId,
      }
    );
    room = await admit(room, managed, manager, owner.device.id);
    room = await admit(room, managed, manager, recipient.device.id);
    assert.equal(room.state, 'active');
    await db
      .delete(schema.profileOwners)
      .where(eq(schema.profileOwners.id, 'business-manager'));
    const [revoked] = await db
      .select()
      .from(schema.chatE2eeDevices)
      .where(eq(schema.chatE2eeDevices.id, managed.device.id));
    assert.ok(revoked.revokedAt);
    await assert.rejects(
      roomSnapshot(managed, manager, room.id),
      fails('PROFILE_UNAVAILABLE')
    );
    await assert.rejects(
      publish(room, recipient, bob, await messageInput(room)),
      fails('STALE_ROOM_STATE')
    );
    room = await roomSnapshot(recipient, bob, room.id);
    await publish(
      room,
      recipient,
      bob,
      await commitInput(room, recipient, bob, managed.device.id, 'remove')
    );
    room = await roomSnapshot(recipient, bob, room.id);
    assert.equal(room.state, 'active');
  });
});

async function mediaTransport(
  device: Enrolled,
  scope: Scope,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  suffix: string,
  bytes: Uint8Array = new Uint8Array()
) {
  const expected = {
    method,
    path: `/api/social/encryption/media${suffix}`,
    bodySha256: await sha256(bytes),
  };
  return {
    scope,
    proof: await requestProof(device, scope, expected),
    expected,
  };
}
async function storedMedia(room: RoomSnapshot, device: Enrolled, scope: Scope) {
  const encrypted = await encryptMedia(
    room.id,
    new TextEncoder().encode(
      'Only conversation participants get these photo bytes'
    ),
    'sensitive-location.png',
    'image/png'
  );
  const input = {
    id: encrypted.manifest.id,
    roomId: room.id,
    byteLength: encrypted.ciphertext.length,
    sha256: encrypted.manifest.sha256,
  };
  await mediaService.reserveEncryptedMedia(
    await mediaTransport(
      device,
      scope,
      'POST',
      '',
      new TextEncoder().encode(JSON.stringify(input))
    ),
    input
  );
  await mediaService.uploadEncryptedMedia(
    await mediaTransport(
      device,
      scope,
      'PUT',
      `/${input.id}`,
      encrypted.ciphertext
    ),
    input.id,
    encrypted.ciphertext
  );
  return encrypted;
}

describe('private encrypted media ownership and delivery', () => {
  it('stores only ciphertext and requires message binding and current-room authorization', async () => {
    const { alice, recipient, room } = await groupPair();
    const encrypted = await storedMedia(room, alice, personal);
    await assert.rejects(
      mediaService.readEncryptedMedia(
        await mediaTransport(
          recipient,
          bob,
          'GET',
          `/${encrypted.manifest.id}`
        ),
        encrypted.manifest.id
      ),
      fails('MEDIA_UNAVAILABLE')
    );
    const input = await messageInput(room);
    input.mediaIds = [encrypted.manifest.id];
    await publish(room, alice, personal, input);
    const [metadata] = await db.select().from(schema.chatE2eeMedia);
    assert.equal(
      JSON.stringify(metadata).includes('sensitive-location.png'),
      false
    );
    assert.equal(
      JSON.stringify(metadata).includes(encrypted.manifest.key),
      false
    );
    assert.equal(
      JSON.stringify(metadata).includes(encrypted.manifest.iv),
      false
    );
    const response = await mediaService.readEncryptedMedia(
      await mediaTransport(recipient, bob, 'GET', `/${encrypted.manifest.id}`),
      encrypted.manifest.id
    );
    assert.equal(
      response.headers.get('content-type'),
      'application/octet-stream'
    );
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual(bytes, encrypted.ciphertext);
    assert.equal(
      new TextDecoder().decode(
        (await decryptMedia(room.id, encrypted.manifest, bytes)).bytes
      ),
      'Only conversation participants get these photo bytes'
    );
    await db
      .delete(schema.socialGroupMembers)
      .where(eq(schema.socialGroupMembers.id, 'bob-garden'));
    await assert.rejects(
      mediaService.readEncryptedMedia(
        await mediaTransport(
          recipient,
          bob,
          'GET',
          `/${encrypted.manifest.id}`
        ),
        encrypted.manifest.id
      ),
      fails('ROOM_UNAVAILABLE')
    );
  });

  it('cannot attach an object from another conversation or keep serving a deleted message', async () => {
    const { alice, recipient, room } = await groupPair();
    const encrypted = await storedMedia(room, alice, personal);
    const self = await rooms.openEncryptedRoom(
      await transport(alice, personal),
      {
        kind: 'dm',
        peerActorId: personal.actorId,
      }
    );
    const wrong = await messageInput(self);
    wrong.mediaIds = [encrypted.manifest.id];
    await assert.rejects(
      publish(self, alice, personal, wrong),
      fails('PRIVATE_MEDIA_REQUIRED')
    );
    const input = await messageInput(room);
    input.mediaIds = [encrypted.manifest.id];
    await publish(room, alice, personal, input);
    await rooms.deleteEncryptedMessage(
      await transport(
        alice,
        personal,
        'DELETE',
        `/${room.id}/events/${input.id}`
      ),
      room.id,
      input.id
    );
    await assert.rejects(
      mediaService.readEncryptedMedia(
        await mediaTransport(
          recipient,
          bob,
          'GET',
          `/${encrypted.manifest.id}`
        ),
        encrypted.manifest.id
      ),
      fails('MEDIA_UNAVAILABLE')
    );
  });

  it('leaves failed uploads tracked and never falls back to the public bucket', async () => {
    const { alice, room } = await groupPair();
    failPrivatePut = true;
    await assert.rejects(
      storedMedia(room, alice, personal),
      /Simulated private object-store failure/
    );
    const [pending] = await db.select().from(schema.chatE2eeMedia);
    assert.equal(pending.state, 'reserved');
    assert.equal(privateObjects.size, 0);
    getStorage({ R2_BUCKET: privateBucket });
    getPrivateChatStorage({});
    await assert.rejects(
      mediaService.reserveEncryptedMedia(
        await mediaTransport(alice, personal, 'POST', ''),
        {
          id: crypto.randomUUID(),
          roomId: room.id,
          byteLength: 32,
          sha256: 'a'.repeat(64),
        }
      ),
      fails('PRIVATE_STORAGE_UNAVAILABLE')
    );
    assert.equal(privateObjects.size, 0);
  });

  it('keeps object deletion work after a group/room cascade removes ownership rows', async () => {
    const { alice, room } = await groupPair();
    const encrypted = await storedMedia(room, alice, personal);
    const objectKey = `media/${room.id}/${encrypted.manifest.id}`;
    assert.ok(privateObjects.has(objectKey));
    await db
      .delete(schema.chatE2eeRooms)
      .where(eq(schema.chatE2eeRooms.id, room.id));
    assert.equal((await db.select().from(schema.chatE2eeMedia)).length, 0);
    assert.equal(
      (await db.select().from(schema.chatE2eeObjectDeletions))[0].objectKey,
      objectKey
    );
  });

  it('bounds actual pending media bytes and rejects the first byte over the attachment limit', async () => {
    const { alice, room } = await groupPair();
    for (let index = 0; index < 4; index++) {
      await mediaService.reserveEncryptedMedia(
        await mediaTransport(alice, personal, 'POST', ''),
        {
          id: crypto.randomUUID(),
          roomId: room.id,
          byteLength: E2EE_MAX_MEDIA_BYTES + 16,
          sha256: 'a'.repeat(64),
        }
      );
    }
    await assert.rejects(
      mediaService.reserveEncryptedMedia(
        await mediaTransport(alice, personal, 'POST', ''),
        {
          id: crypto.randomUUID(),
          roomId: room.id,
          byteLength: 17,
          sha256: 'b'.repeat(64),
        }
      ),
      fails('PENDING_MEDIA_LIMIT')
    );
    await assert.rejects(
      mediaService.reserveEncryptedMedia(
        await mediaTransport(alice, personal, 'POST', ''),
        {
          id: crypto.randomUUID(),
          roomId: room.id,
          byteLength: E2EE_MAX_MEDIA_BYTES + 17,
          sha256: 'c'.repeat(64),
        }
      ),
      fails('INVALID_INPUT')
    );
  });

  it('authenticates actual binary upload/download routes and refuses copied URLs without device proof', async () => {
    const { alice, recipient, room } = await groupPair();
    const encrypted = await encryptMedia(
      room.id,
      new TextEncoder().encode('private binary API fixture'),
      'not-a-public-name.png',
      'image/png'
    );
    const id = encrypted.manifest.id;
    await mediaService.reserveEncryptedMedia(
      await mediaTransport(alice, personal, 'POST', ''),
      {
        id,
        roomId: room.id,
        byteLength: encrypted.ciphertext.length,
        sha256: encrypted.manifest.sha256,
      }
    );
    const uploadPath = `/api/social/encryption/media/${id}?profileId=personal&actorId=alice`;
    const uploadProof = await requestProof(alice, personal, {
      method: 'PUT',
      path: uploadPath,
      bodySha256: await sha256(encrypted.ciphertext),
    });
    const uploaded = await privateMediaRoute.PUT(
      new NextRequest(`https://chat.invalid${uploadPath}`, {
        method: 'PUT',
        headers: {
          Origin: 'https://chat.invalid',
          'Content-Type': 'application/octet-stream',
          'x-pana-device-proof': toBase64(
            new TextEncoder().encode(JSON.stringify(uploadProof))
          ),
        },
        body: Uint8Array.from(encrypted.ciphertext).buffer,
      }),
      { params: Promise.resolve({ mediaId: id }) }
    );
    assert.equal(uploaded.status, 200);
    const input = await messageInput(room);
    input.mediaIds = [id];
    await publish(room, alice, personal, input);
    sessionUser = 'manager';
    const downloadPath = `/api/social/encryption/media/${id}?profileId=manager-personal&actorId=manager-actor`;
    const copied = await privateMediaRoute.GET(
      new NextRequest(`https://chat.invalid${downloadPath}`),
      { params: Promise.resolve({ mediaId: id }) }
    );
    assert.equal(copied.status, 403);
    const downloadProof = await requestProof(recipient, bob, {
      method: 'GET',
      path: downloadPath,
      bodySha256: await sha256(new Uint8Array()),
    });
    const downloaded = await privateMediaRoute.GET(
      new NextRequest(`https://chat.invalid${downloadPath}`, {
        headers: {
          'x-pana-device-proof': toBase64(
            new TextEncoder().encode(JSON.stringify(downloadProof))
          ),
        },
      }),
      { params: Promise.resolve({ mediaId: id }) }
    );
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(
      new Uint8Array(await downloaded.arrayBuffer()),
      encrypted.ciphertext
    );
  });
});

describe('device-state rollback and clone prevention', () => {
  it('accepts one exact state transition and refuses a competing clone before ciphertext publication', async () => {
    const device = await enrolled();
    const previousHash = device.device.stateHash;
    assert.ok(previousHash);
    const input = {
      operationId: crypto.randomUUID(),
      previousHash,
      nextHash: await sha256(crypto.getRandomValues(new Uint8Array(32))),
    };
    const expected = {
      method: 'POST',
      path: '/api/social/encryption/checkpoint',
      bodySha256: await sha256(new TextEncoder().encode(JSON.stringify(input))),
    };
    const accepted = await devices.checkpointEncryptionState(
      personal,
      await requestProof(device, personal, expected),
      expected,
      input
    );
    assert.equal(accepted.stateHash, input.nextHash);
    assert.deepEqual(
      await devices.checkpointEncryptionState(
        personal,
        await requestProof(device, personal, expected),
        expected,
        input
      ),
      accepted
    );
    const competing = {
      ...input,
      operationId: crypto.randomUUID(),
      nextHash: await sha256(crypto.getRandomValues(new Uint8Array(32))),
    };
    const competingExpected = {
      ...expected,
      bodySha256: await sha256(
        new TextEncoder().encode(JSON.stringify(competing))
      ),
    };
    await assert.rejects(
      devices.checkpointEncryptionState(
        personal,
        await requestProof(device, personal, competingExpected),
        competingExpected,
        competing
      ),
      fails('DEVICE_STATE_ROLLBACK')
    );
    const packages = await packageInput();
    const upload = {
      method: 'POST',
      path: '/api/social/encryption/key-packages',
      bodySha256: await sha256(
        new TextEncoder().encode(JSON.stringify(packages))
      ),
    };
    await assert.rejects(
      devices.uploadEncryptionKeyPackages(
        personal,
        await requestProof(device, personal, upload),
        upload,
        packages
      ),
      fails('DEVICE_STATE_ROLLBACK')
    );
    device.device.stateHash = input.nextHash;
    device.device.checkpointId = input.operationId;
    assert.equal(
      (
        await devices.uploadEncryptionKeyPackages(
          personal,
          await requestProof(device, personal, upload),
          upload,
          packages
        )
      ).added,
      1
    );
  });
});

async function backupInput(
  device: Enrolled,
  scope: Scope,
  roomId: string | null = null,
  mediaIds: string[] = []
) {
  const kind = roomId ? ('history' as const) : ('identity' as const);
  const record = await sealRecord(
    new TextEncoder().encode('Synthetic user-held recovery material'),
    await importAesKey(crypto.getRandomValues(new Uint8Array(32))),
    `${kind}-backup`,
    backupContext(scope, 1, kind, roomId)
  );
  const id = crypto.randomUUID();
  const digest = await sha256(new TextEncoder().encode(JSON.stringify(record)));
  return {
    id,
    kind,
    roomId,
    rootVersion: 1,
    record,
    mediaIds,
    rootAttestation:
      kind === 'identity'
        ? await device.root.sign('identity-backup', {
            version: 1,
            ...scope,
            rootVersion: 1,
            backupId: id,
            sha256: digest,
            issuedAt: Date.now(),
          })
        : null,
  };
}
async function uploadBackup(
  device: Enrolled,
  scope: Scope,
  input: Awaited<ReturnType<typeof backupInput>>
) {
  return recovery.uploadEncryptionBackup(
    await transport(device, scope, 'POST', '/backups', input),
    input
  );
}

describe('personal-key recovery and explicit activation', () => {
  it('deletes a removed room backup without mutating its authenticated context or leaving an orphaned private object', async () => {
    const { alice, room } = await groupPair();
    const input = await backupInput(alice, personal, room.id);
    await uploadBackup(alice, personal, input);
    assert.ok(privateObjects.has(`backups/${input.id}`));
    await db
      .delete(schema.chatE2eeRooms)
      .where(eq(schema.chatE2eeRooms.id, room.id));
    assert.equal(
      (await recovery.listEncryptionBackups(personal)).backups.length,
      0
    );
    assert.equal((await retention.purgeEncryptedChat()).objectsDeleted, 1);
    assert.equal(privateObjects.has(`backups/${input.id}`), false);
  });
  it('paginates every owned backup deterministically instead of silently truncating recovery', async () => {
    const device = await enrolled();
    const createdAt = new Date(Date.now() - 10_000);
    await db.insert(schema.chatE2eeBackups).values(
      Array.from({ length: 101 }, () => {
        const id = crypto.randomUUID();
        return {
          id,
          userId: personal.userId,
          profileId: personal.profileId,
          uploaderDeviceId: device.device.id,
          rootVersion: 1,
          kind: 'identity' as const,
          slot: `fixture:${id}`,
          objectKey: `backups/${id}`,
          byteLength: 100,
          sha256: 'a'.repeat(64),
          state: 'stored' as const,
          createdAt,
          expiresAt: null,
        };
      })
    );
    const first = await recovery.listEncryptionBackups(personal);
    assert.equal(first.backups.length, 100);
    assert.ok(first.nextCursor);
    const second = await recovery.listEncryptionBackups(
      personal,
      first.nextCursor
    );
    assert.equal(second.backups.length, 1);
    assert.equal(second.nextCursor, null);
    assert.equal(
      new Set([...first.backups, ...second.backups].map((row) => row.id)).size,
      101
    );
  });

  it('requeues an object when account deletion races a backup write after its first cleanup already ran', async () => {
    const device = await enrolled();
    const input = await backupInput(device, personal);
    beforePrivatePut = async () => {
      await db
        .delete(schema.profiles)
        .where(eq(schema.profiles.id, personal.profileId));
      await retention.purgeEncryptedChat();
    };
    await assert.rejects(
      uploadBackup(device, personal, input),
      fails('PROFILE_UNAVAILABLE')
    );
    assert.ok(privateObjects.has(`backups/${input.id}`));
    assert.equal(
      (await db.select().from(schema.chatE2eeObjectDeletions)).length,
      1
    );
    await retention.purgeEncryptedChat();
    assert.equal(privateObjects.size, 0);
  });
  it('stores opaque scoped backups and allows a signed-in replacement to retrieve only its own ciphertext', async () => {
    const device = await enrolled();
    const input = await backupInput(device, personal);
    const stored = await uploadBackup(device, personal, input);
    assert.equal(stored.kind, 'identity');
    assert.equal(stored.expiresAt, null);
    assert.equal(
      (await recovery.listEncryptionBackups(personal)).backups.length,
      1
    );
    const downloaded = await recovery.downloadEncryptionBackup(
      personal,
      input.id
    );
    assert.deepEqual(downloaded.record, input.record);
    assert.equal(
      JSON.stringify(
        [...privateObjects.values()].map((value) =>
          new TextDecoder().decode(value)
        )
      ).includes('Synthetic user-held recovery material'),
      false
    );
    assert.equal((await recovery.listEncryptionBackups(bob)).backups.length, 0);
    await assert.rejects(
      recovery.downloadEncryptionBackup(bob, input.id),
      fails('BACKUP_UNAVAILABLE')
    );
    await assert.rejects(
      recovery.downloadEncryptionBackup(
        { ...personal, userId: 'stranger' },
        input.id
      ),
      fails('PROFILE_UNAVAILABLE')
    );
  });

  it('requires an exact owner attestation and never stores substituted recovery material', async () => {
    const device = await enrolled();
    const input = await backupInput(device, personal);
    await assert.rejects(
      uploadBackup(device, personal, { ...input, rootAttestation: null }),
      fails('OWNER_APPROVAL_REQUIRED')
    );
    const changed = await backupInput(device, personal);
    await assert.rejects(
      uploadBackup(device, personal, {
        ...changed,
        rootAttestation: input.rootAttestation,
      }),
      fails('BACKUP_PROOF_MISMATCH')
    );
    await assert.rejects(
      uploadBackup(device, personal, {
        ...input,
        record: {
          ...input.record,
          context: backupContext(bob, 1, 'identity', null),
        },
      }),
      fails('BACKUP_SCOPE_MISMATCH')
    );
    assert.equal(privateObjects.size, 0);
  });

  it('keeps failed reservations tracked, retries exact bytes and queues replaced backups for private deletion', async () => {
    const device = await enrolled();
    const input = await backupInput(device, personal);
    failPrivatePut = true;
    await assert.rejects(
      uploadBackup(device, personal, input),
      /Simulated private object-store failure/
    );
    assert.equal(
      (await db.select().from(schema.chatE2eeBackups))[0].state,
      'reserved'
    );
    failPrivatePut = false;
    const first = await uploadBackup(device, personal, input);
    assert.deepEqual(await uploadBackup(device, personal, input), first);
    const second = await backupInput(device, personal);
    await uploadBackup(device, personal, second);
    assert.equal(
      (await recovery.listEncryptionBackups(personal)).backups.length,
      1
    );
    assert.equal(
      (await db.select().from(schema.chatE2eeObjectDeletions))[0].objectKey,
      `backups/${input.id}`
    );
    const result = await retention.purgeEncryptedChat();
    assert.equal(result.objectsDeleted, 1);
    assert.equal(privateObjects.has(`backups/${input.id}`), false);
    assert.equal(privateObjects.has(`backups/${second.id}`), true);
  });

  it('cannot activate without approved prekeys, an owned backup and the exact recovery acknowledgment', async () => {
    const device = await enrolled();
    const input = await backupInput(device, personal);
    const backup = await uploadBackup(device, personal, input);
    const statement = await device.root.sign('profile-activation', {
      version: 1,
      ...personal,
      rootVersion: 1,
      deviceId: device.device.id,
      backupId: backup.id,
      sha256: backup.sha256,
      recoveryKeySaved: true,
      issuedAt: Date.now(),
      nonce: crypto.randomUUID(),
    });
    await assert.rejects(
      recovery.activateProfileEncryption(
        await transport(device, personal, 'POST', '/activation'),
        { statement }
      ),
      fails('PREKEYS_REQUIRED')
    );
    const packages = await packageInput();
    const expected = {
      method: 'POST',
      path: '/api/social/encryption/key-packages',
      bodySha256: await sha256(
        new TextEncoder().encode(JSON.stringify(packages))
      ),
    };
    await devices.uploadEncryptionKeyPackages(
      personal,
      await requestProof(device, personal, expected),
      expected,
      packages
    );
    assert.equal(
      (
        await recovery.activateProfileEncryption(
          await transport(device, personal, 'POST', '/activation'),
          { statement }
        )
      ).encryptionRequired,
      true
    );
    assert.equal(
      (
        await db
          .select()
          .from(schema.socialActors)
          .where(eq(schema.socialActors.id, 'alice'))
      )[0].encryptedChatRequired,
      true
    );
  });

  it('restores pre-join media only through the same user/profile retained backup, not a new group member', async () => {
    const { alice, recipient, room } = await groupPair();
    const encrypted = await storedMedia(room, alice, personal);
    const event = await messageInput(room);
    event.mediaIds = [encrypted.manifest.id];
    await publish(room, alice, personal, event);
    const input = await backupInput(recipient, bob, room.id, event.mediaIds);
    const backup = await uploadBackup(recipient, bob, input);
    const replacement = await ready(bob, recipient.root);
    const current = await roomSnapshot(alice, personal, room.id);
    await admit(current, alice, personal, replacement.device.id);
    await assert.rejects(
      mediaService.readEncryptedMedia(
        await mediaTransport(
          replacement,
          bob,
          'GET',
          `/${encrypted.manifest.id}`
        ),
        encrypted.manifest.id
      ),
      fails('MEDIA_UNAVAILABLE')
    );
    const response = await mediaService.readEncryptedMedia(
      await mediaTransport(
        replacement,
        bob,
        'GET',
        `/${encrypted.manifest.id}`
      ),
      encrypted.manifest.id,
      backup.id
    );
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      encrypted.ciphertext
    );
    const newcomer = await ready(stranger);
    await db.insert(schema.socialGroupMembers).values({
      id: 'stranger-garden',
      actorId: stranger.actorId,
      groupId: 'garden',
      role: 'member',
      status: 'active',
    });
    await admit(
      await roomSnapshot(alice, personal, room.id),
      alice,
      personal,
      newcomer.device.id
    );
    await assert.rejects(
      mediaService.readEncryptedMedia(
        await mediaTransport(
          newcomer,
          stranger,
          'GET',
          `/${encrypted.manifest.id}`
        ),
        encrypted.manifest.id,
        backup.id
      ),
      fails('MEDIA_UNAVAILABLE')
    );
  });
});

describe('current private display policy and bounded retention', () => {
  it('removes permanently closed DM protocol data and private objects while preserving active rooms and their order', async () => {
    const { alice, room } = await directPair();
    const media = await storedMedia(room, alice, personal);
    const message = await messageInput(room);
    message.mediaIds = [media.manifest.id];
    await publish(room, alice, personal, message);
    const backup = await uploadBackup(
      alice,
      personal,
      await backupInput(alice, personal, room.id)
    );
    const active = await rooms.openEncryptedRoom(
      await transport(alice, personal),
      { kind: 'dm', peerActorId: 'alice' }
    );
    const activeMessage = await messageInput(active);
    await publish(active, alice, personal, activeMessage);
    await db
      .delete(schema.socialActors)
      .where(eq(schema.socialActors.id, bob.actorId));
    assert.equal(
      (
        await db
          .select()
          .from(schema.chatE2eeRooms)
          .where(eq(schema.chatE2eeRooms.id, room.id))
      )[0].state,
      'closed'
    );
    await assert.rejects(
      rooms.readEncryptedRoom(await transport(alice, personal, 'GET'), room.id),
      fails('ROOM_UNAVAILABLE')
    );
    process.env.CHAT_E2EE_ENABLED = '0';
    const report = await retention.purgeEncryptedChat();
    assert.equal(report.closedRoomsDeleted, 1);
    assert.equal(report.objectsDeleted, 2);
    assert.equal((await db.select().from(schema.chatE2eeRooms)).length, 1);
    assert.equal(
      (await db.select().from(schema.chatE2eeEvents))[0].id,
      activeMessage.id
    );
    assert.equal((await db.select().from(schema.chatE2eeWelcomes)).length, 0);
    assert.equal(
      (
        await db
          .select()
          .from(schema.chatE2eeBackups)
          .where(eq(schema.chatE2eeBackups.id, backup.id))
      ).length,
      0
    );
    assert.equal(privateObjects.size, 0);
    assert.equal((await retention.purgeEncryptedChat()).closedRoomsDeleted, 0);
  });
  it('rechecks already-cached message IDs after a mute or deletion without releasing plaintext', async () => {
    const { alice, recipient, room } = await groupPair();
    const event = await messageInput(room);
    await publish(room, recipient, bob, event);
    const first = await rooms.encryptedMessageVisibility(
      await transport(alice, personal, 'GET', `/${room.id}/visibility`),
      room.id,
      [event.id]
    );
    assert.deepEqual(first, [{ id: event.id, visible: true, purge: false }]);
    await db.insert(schema.socialBlocks).values({
      id: 'private-mute',
      actorId: personal.actorId,
      targetActorId: bob.actorId,
      kind: 'mute',
    });
    assert.deepEqual(
      await rooms.encryptedMessageVisibility(
        await transport(alice, personal, 'GET', `/${room.id}/visibility`),
        room.id,
        [event.id]
      ),
      [{ id: event.id, visible: false, purge: false }]
    );
  });

  it('purges expired application ciphertext and private objects but retains ordered tombstones and active MLS controls', async () => {
    const { alice, room } = await groupPair();
    const encrypted = await storedMedia(room, alice, personal);
    const event = await messageInput(room);
    event.mediaIds = [encrypted.manifest.id];
    await publish(room, alice, personal, event);
    const past = new Date(Date.now() - 1000);
    await db
      .update(schema.chatE2eeEvents)
      .set({ expiresAt: past })
      .where(eq(schema.chatE2eeEvents.id, event.id));
    await db.update(schema.chatE2eeMedia).set({ expiresAt: past });
    process.env.CHAT_E2EE_ENABLED = '0';
    const report = await retention.purgeEncryptedChat();
    assert.equal(report.applicationFramesPurged, 1);
    assert.equal(report.objectsDeleted, 1);
    const events = await db.select().from(schema.chatE2eeEvents);
    assert.equal(events.find((entry) => entry.id === event.id)?.frame, null);
    assert.ok(
      events.some((entry) => entry.kind === 'commit' && entry.frame !== null)
    );
    assert.equal(privateObjects.size, 0);
  });

  it('keeps failed private R2 deletions queued and succeeds on the next bounded run', async () => {
    const { alice, room } = await groupPair();
    await storedMedia(room, alice, personal);
    await db
      .delete(schema.chatE2eeRooms)
      .where(eq(schema.chatE2eeRooms.id, room.id));
    failPrivateDelete = true;
    const failed = await retention.purgeEncryptedChat();
    assert.equal(failed.objectsDeferred, 1);
    assert.equal(
      (await db.select().from(schema.chatE2eeObjectDeletions))[0].attempts,
      1
    );
    failPrivateDelete = false;
    assert.equal((await retention.purgeEncryptedChat()).objectsDeleted, 1);
    assert.equal(
      (await db.select().from(schema.chatE2eeObjectDeletions)).length,
      0
    );
  });

  it('rejects unmarked/legacy private uploads after activation while preserving explicit non-chat social posts', async () => {
    await ready();
    assert.equal(
      (await mediaPolicy.chatMediaRefusal('alice', undefined, null))?.status,
      409
    );
    assert.equal(
      (
        await mediaPolicy.chatMediaRefusal(bob.actorId, 'legacy-chat', {
          kind: 'dm',
          actorId: 'alice',
        })
      )?.status,
      409
    );
    assert.equal(
      await mediaPolicy.chatMediaRefusal('alice', 'social-post', null),
      null
    );
    assert.equal(
      await mediaPolicy.chatMediaRefusal('alice', 'legacy-chat', {
        kind: 'group',
        groupId: 'garden',
      }),
      null
    );
    process.env.CHAT_E2EE_ENABLED = '0';
    assert.equal(
      (await mediaPolicy.chatMediaRefusal(bob.actorId, undefined, null))
        ?.status,
      409
    );
    assert.equal(
      (await mediaPolicy.chatMediaRefusal(bob.actorId, 'legacy-chat', null))
        ?.status,
      400
    );
  });
});

async function resetInput(previous: Enrolled, scope: Scope) {
  const root = await key();
  const signing = await key();
  const requestId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const rootVersion = previous.device.rootVersion + 1;
  const issuedAt = Date.now();
  const certificate = await root.sign('device-certificate', {
    version: 1,
    profileId: scope.profileId,
    actorId: scope.actorId,
    userId: scope.userId,
    deviceId,
    signingKey: signing.publicKey,
    requestId,
    nonce: toBase64(crypto.getRandomValues(new Uint8Array(32))),
    rootVersion,
    issuedAt,
    expiresAt: issuedAt + E2EE_DEVICE_MS,
  });
  const record = await sealRecord(
    new TextEncoder().encode(
      'Only the new personal key opens this synthetic reset backup'
    ),
    await importAesKey(crypto.getRandomValues(new Uint8Array(32))),
    'identity-backup',
    backupContext(scope, rootVersion, 'identity', null)
  );
  const claims = {
    version: 1,
    ...scope,
    requestId,
    previousRootPublicKey: previous.root.publicKey,
    previousRootVersion: previous.device.rootVersion,
    rootPublicKey: root.publicKey,
    rootVersion,
    deviceId,
    stateHash: await sha256(crypto.getRandomValues(new Uint8Array(32))),
    certificateSha256: await sha256(
      new TextEncoder().encode(JSON.stringify(certificate))
    ),
    backupId: crypto.randomUUID(),
    backupSha256: await sha256(
      new TextEncoder().encode(JSON.stringify(record))
    ),
    recoveryKeySaved: true,
    discardLocalState: true,
    issuedAt,
  };
  const input = {
    confirmation: 'RESET ENCRYPTION',
    rootPublicKey: root.publicKey,
    statement: await root.sign('identity-reset', claims),
    certificate,
    record,
  };
  return { input, claims, root, signing };
}
async function restartInput(
  room: RoomSnapshot,
  device: Enrolled,
  scope: Scope
) {
  return {
    acknowledgeFreshSession: true,
    statement: await device.signing.sign(
      'room-intent',
      roomRestartSchema.parse({
        version: 1,
        operation: 'restart',
        requestId: crypto.randomUUID(),
        roomId: room.id,
        previousCryptoGroupId: room.cryptoGroupId,
        cryptoGroupId: crypto.randomUUID(),
        previousSequence: room.sequence,
        previousRevision: room.revision,
        previousRosterDigest: room.rosterDigest,
        profileId: scope.profileId,
        actorId: scope.actorId,
        deviceId: device.device.id,
        issuedAt: Date.now(),
      })
    ),
  };
}

describe('visible identity loss and owner-authority lifecycle', () => {
  it('requires an explicit owner reset with new-key possession, revokes old devices and persists only an opaque new backup', async () => {
    const previous = await ready();
    const reset = await resetInput(previous, personal);
    await assert.rejects(
      identityResetService.resetEncryptionIdentity(personal, {
        ...reset.input,
        confirmation: 'not-confirmed',
      }),
      fails('INVALID_INPUT')
    );
    const accepted = await identityResetService.resetEncryptionIdentity(
      personal,
      reset.input
    );
    assert.equal(accepted.rootVersion, 2);
    assert.deepEqual(
      await identityResetService.resetEncryptionIdentity(personal, reset.input),
      accepted
    );
    const status = await devices.getEncryptionIdentity(personal);
    assert.equal(status.identity?.rootPublicKey, reset.root.publicKey);
    assert.ok(
      status.devices.find((entry) => entry.id === previous.device.id)?.revokedAt
    );
    assert.equal(
      status.devices.find((entry) => entry.id === reset.claims.deviceId)
        ?.stateHash,
      reset.claims.stateHash
    );
    assert.equal(
      (await recovery.listEncryptionBackups(personal)).backups.length,
      1
    );
    assert.equal(
      JSON.stringify(
        [...privateObjects.values()].map((value) =>
          new TextDecoder().decode(value)
        )
      ).includes('Only the new personal key opens'),
      false
    );
  });

  it('does not allow editors, substituted certificates or missing new-key possession to reset encryption', async () => {
    const previous = await ready(business);
    const editor = await resetInput(previous, manager);
    await assert.rejects(
      identityResetService.resetEncryptionIdentity(manager, editor.input),
      fails('OWNER_APPROVAL_REQUIRED')
    );
    const input = await resetInput(previous, business);
    const other = await resetInput(previous, business);
    await assert.rejects(
      identityResetService.resetEncryptionIdentity(business, {
        ...input.input,
        certificate: other.input.certificate,
      }),
      fails('INVALID_SIGNATURE')
    );
    await assert.rejects(
      identityResetService.resetEncryptionIdentity(business, {
        ...input.input,
        statement: other.input.statement,
      }),
      fails('INVALID_SIGNATURE')
    );
    assert.equal(
      (await devices.getEncryptionIdentity(business)).identity?.rootVersion,
      1
    );
    assert.equal(privateObjects.size, 0);
  });

  it('freezes owner downgrades without exporting keys or letting old-role devices continue', async () => {
    const previous = await ready(business);
    await db
      .update(schema.profileOwners)
      .set({ role: 'editor' })
      .where(eq(schema.profileOwners.id, 'business-owner'));
    const status = await devices.getEncryptionIdentity(business);
    assert.equal(status.identity?.rotationRequired, true);
    assert.equal(status.canApprove, false);
    assert.ok(
      status.devices.find((entry) => entry.id === previous.device.id)?.revokedAt
    );
    await assert.rejects(
      rooms.listEncryptedRooms(await transport(previous, business, 'GET')),
      fails('IDENTITY_ROTATION_REQUIRED')
    );
  });

  it('removes a deleted author application ciphertext and media access without deleting ordered controls', async () => {
    const { alice, recipient, room } = await groupPair();
    const encrypted = await storedMedia(room, recipient, bob);
    const message = await messageInput(room);
    message.mediaIds = [encrypted.manifest.id];
    await publish(room, recipient, bob, message);
    await db
      .delete(schema.socialActors)
      .where(eq(schema.socialActors.id, bob.actorId));
    const [event] = await db
      .select()
      .from(schema.chatE2eeEvents)
      .where(eq(schema.chatE2eeEvents.id, message.id));
    assert.equal(event.frame, null);
    assert.ok(event.deletedAt);
    assert.ok(
      (await db.select().from(schema.chatE2eeEvents)).some(
        (entry) => entry.kind === 'commit' && entry.frame
      )
    );
    assert.equal((await retention.purgeEncryptedChat()).objectsDeleted, 1);
    assert.equal(privateObjects.size, 0);
    assert.ok(alice.device.id);
  });
});

describe('signed secure-session availability recovery', () => {
  it('cannot replace an existing approved cryptographic participant but can recover after every old device is revoked', async () => {
    const pair = await groupPair();
    let room = pair.room;
    await assert.rejects(
      rooms.restartEncryptedRoom(
        await transport(pair.alice, personal),
        room.id,
        await restartInput(room, pair.alice, personal)
      ),
      fails('EXISTING_MEMBER_REQUIRED')
    );
    await publish(room, pair.alice, personal, await messageInput(room));
    for (const [device, scope] of [
      [pair.alice, personal],
      [pair.recipient, bob],
    ] as const) {
      await devices.revokeEncryptionDevice(scope, {
        statement: await device.root.sign('device-revocation', {
          version: 1,
          profileId: scope.profileId,
          actorId: scope.actorId,
          deviceId: device.device.id,
          rootVersion: 1,
          issuedAt: Date.now(),
          nonce: crypto.randomUUID(),
        }),
      });
    }
    const replacement = await ready(personal, pair.alice.root);
    await ready(bob, pair.recipient.root);
    room = await roomSnapshot(replacement, personal, room.id);
    assert.equal(room.canRestart, true);
    const input = await restartInput(room, replacement, personal);
    const restarted = await rooms.restartEncryptedRoom(
      await transport(replacement, personal),
      room.id,
      input
    );
    assert.notEqual(restarted.cryptoGroupId, room.cryptoGroupId);
    assert.equal(restarted.sequence, room.sequence);
    assert.equal(restarted.epoch, '0');
    assert.equal(restarted.founderDeviceId, replacement.device.id);
    assert.equal(
      (
        await rooms.restartEncryptedRoom(
          await transport(replacement, personal),
          room.id,
          input
        )
      ).cryptoGroupId,
      restarted.cryptoGroupId
    );
    assert.equal((await db.select().from(schema.chatE2eeEvents)).length, 2);
  });

  describe('encrypted delivery response resource bounds', () => {
    it('pages oversized opaque frames by actual bytes without creating ordered-delivery gaps', async () => {
      const { alice, recipient, room } = await groupPair();
      for (let index = 0; index < 5; index++) {
        const bytes = new Uint8Array(E2EE_MAX_FRAME_BYTES).fill(index + 1);
        const message = await messageInput(room);
        message.frame = toBase64(bytes);
        message.frameSha256 = await sha256(bytes);
        await publish(room, alice, personal, message);
      }
      let cursor = 1;
      const seen: string[] = [];
      for (;;) {
        const page = await rooms.readEncryptedRoomEvents(
          await transport(recipient, bob, 'GET', `/${room.id}/events`),
          room.id,
          cursor,
          100
        );
        if (!page.events.length) break;
        assert.ok(
          page.events.reduce(
            (sum, entry) => sum + (entry.frame?.length ?? 0),
            0
          ) <= E2EE_MAX_DELIVERY_PAGE_BYTES
        );
        for (const entry of page.events) {
          assert.equal(entry.sequence, ++cursor);
          seen.push(entry.id);
        }
        assert.equal(page.nextSequence, cursor);
      }
      assert.equal(new Set(seen).size, 5);
    });
  });
});
