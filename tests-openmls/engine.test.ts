import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { MlsDevice } from '../crypto/openmls/pkg/pana_openmls.js';
import {
  initializeOpenMLS,
  OpenMlsQualificationClient,
} from '../lib/e2ee/openmls-qualification';
import { createRecoveryKey } from '../lib/e2ee/prototype';
import {
  createApplicationMessage,
  createCommit,
  createGroup,
  decodeMlsMessage,
  defaultCapabilities,
  defaultLifetime,
  emptyPskIndex,
  encodeMlsMessage,
  generateKeyPackage,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  joinGroup,
  processPrivateMessage,
  zeroOutUint8Array,
} from 'ts-mls';
import { defaultClientConfig } from 'ts-mls/clientConfig.js';
import { decodeKeyPackage, encodeKeyPackage } from 'ts-mls/keyPackage.js';
import { toBase64 } from '../lib/e2ee/sealed-object';

const bytesSchema = z.array(z.number().int().min(0).max(255));
const membershipSchema = z.object({
  commit: bytesSchema,
  welcome: bytesSchema.nullable(),
});
const resultSchema = z.object({
  kind: z.string(),
  sender: z.string(),
  content: bytesSchema,
});
const utf8 = new TextEncoder();

before(async () => {
  const info = z
    .object({
      engine: z.string(),
      sourceRevision: z.string(),
      providerRevision: z.string(),
      wasmSha256: z.string(),
      cargoLockSha256: z.string(),
      bridgeSourceSha256: z.string(),
      manifestSha256: z.string(),
      bindingsSha256: z.string(),
    })
    .parse(
      JSON.parse(
        await readFile(
          new URL('../crypto/openmls/pkg/build-info.json', import.meta.url),
          'utf8'
        )
      )
    );
  const pins = z
    .object({
      engine: z.string(),
      sourceRevision: z.string(),
      providerRevision: z.string(),
    })
    .parse(
      JSON.parse(
        await readFile(
          new URL('../crypto/openmls/engine-lock.json', import.meta.url),
          'utf8'
        )
      )
    );
  for (const field of ['engine', 'sourceRevision', 'providerRevision'] as const)
    assert.equal(info[field], pins[field], 'Rebuild with yarn openmls:build.');
  const sources = [
    ['Cargo.lock', 'cargoLockSha256'],
    ['Cargo.toml', 'manifestSha256'],
    ['src/lib.rs', 'bridgeSourceSha256'],
    ['pkg/pana_openmls.js', 'bindingsSha256'],
  ] as const;
  await Promise.all(
    sources.map(async ([file, field]) => {
      const expected = info[field];
      const actual = createHash('sha256')
        .update(
          await readFile(new URL(`../crypto/openmls/${file}`, import.meta.url))
        )
        .digest('hex');
      assert.equal(actual, expected, 'Rebuild with yarn openmls:build.');
    })
  );
  const wasm = await readFile(
    new URL('../crypto/openmls/pkg/pana_openmls_bg.wasm', import.meta.url)
  );
  assert.equal(
    createHash('sha256').update(wasm).digest('hex'),
    info.wasmSha256,
    'Rebuild with yarn openmls:build.'
  );
  await initializeOpenMLS(wasm);
});

describe('OpenMLS browser bindings and independent implementation interoperability', () => {
  it('exchanges private MLS frames with a ts-mls peer using the mandatory standard suite', async () => {
    const rust = new MlsDevice('rust-peer');
    try {
      const suite = await getCiphersuiteImpl(
        getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519')
      );
      const ts = await generateKeyPackage(
        { credentialType: 'basic', identity: utf8.encode('ts-peer') },
        defaultCapabilities(),
        defaultLifetime,
        [],
        suite
      );
      rust.approveIdentity(
        'ts-peer',
        ts.publicPackage.leafNode.signaturePublicKey
      );
      rust.createRoom('interop-room');
      const frames = membershipSchema.parse(
        JSON.parse(
          rust.addMember('interop-room', encodeKeyPackage(ts.publicPackage))
        )
      );
      rust.acknowledgeCommit('interop-room');
      assert.ok(frames.welcome);
      const welcome = decodeMlsMessage(Uint8Array.from(frames.welcome), 0);
      assert.ok(welcome);
      assert.equal(welcome[1], frames.welcome.length);
      if (welcome[0].wireformat !== 'mls_welcome')
        assert.fail('Expected a standard MLS Welcome');
      const pinned = new Map([
        ['ts-peer', toBase64(ts.publicPackage.leafNode.signaturePublicKey)],
        ['rust-peer', toBase64(rust.publicKey())],
      ]);
      let state = await joinGroup(
        welcome[0].welcome,
        ts.publicPackage,
        ts.privatePackage,
        emptyPskIndex,
        suite,
        undefined,
        undefined,
        {
          ...defaultClientConfig,
          authService: {
            validateCredential: async (credential, publicKey) =>
              credential.credentialType === 'basic' &&
              pinned.get(new TextDecoder().decode(credential.identity)) ===
                toBase64(publicKey),
          },
        }
      );
      const encrypted = rust.encryptMessage(
        'interop-room',
        utf8.encode('Rust to independent peer')
      );
      const incoming = decodeMlsMessage(encrypted, 0);
      assert.ok(incoming);
      if (incoming[0].wireformat !== 'mls_private_message')
        assert.fail('Expected a private MLS frame');
      const processed = await processPrivateMessage(
        state,
        incoming[0].privateMessage,
        emptyPskIndex,
        suite
      );
      state = processed.newState;
      processed.consumed.forEach(zeroOutUint8Array);
      if (processed.kind !== 'applicationMessage')
        assert.fail('Expected an authenticated application message');
      assert.equal(
        new TextDecoder().decode(processed.message),
        'Rust to independent peer'
      );
      const reply = await createApplicationMessage(
        state,
        utf8.encode('Independent peer to Rust'),
        suite
      );
      state = reply.newState;
      reply.consumed.forEach(zeroOutUint8Array);
      const frame = encodeMlsMessage({
        version: 'mls10',
        wireformat: 'mls_private_message',
        privateMessage: reply.privateMessage,
      });
      const result = resultSchema.parse(
        JSON.parse(rust.processMessage('interop-room', frame))
      );
      assert.equal(result.sender, 'ts-peer');
      assert.equal(
        new TextDecoder().decode(Uint8Array.from(result.content)),
        'Independent peer to Rust'
      );
    } finally {
      rust.free();
    }
  });

  it('joins a group founded by an independent implementation', async () => {
    const rust = new MlsDevice('rust-joiner');
    try {
      const suite = await getCiphersuiteImpl(
        getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519')
      );
      const ts = await generateKeyPackage(
        { credentialType: 'basic', identity: utf8.encode('ts-founder') },
        defaultCapabilities(),
        defaultLifetime,
        [],
        suite
      );
      const decoded = decodeKeyPackage(rust.keyPackage(), 0);
      assert.ok(decoded);
      rust.approveIdentity(
        'ts-founder',
        ts.publicPackage.leafNode.signaturePublicKey
      );
      let state = await createGroup(
        utf8.encode('independent-room'),
        ts.publicPackage,
        ts.privatePackage,
        [],
        suite,
        {
          ...defaultClientConfig,
          authService: {
            validateCredential: async (credential, key) =>
              credential.credentialType === 'basic' &&
              ((new TextDecoder().decode(credential.identity) ===
                'rust-joiner' &&
                toBase64(key) === toBase64(rust.publicKey())) ||
                (new TextDecoder().decode(credential.identity) ===
                  'ts-founder' &&
                  toBase64(key) ===
                    toBase64(ts.publicPackage.leafNode.signaturePublicKey))),
          },
        }
      );
      const added = await createCommit(
        { state, cipherSuite: suite },
        {
          extraProposals: [
            { proposalType: 'add', add: { keyPackage: decoded[0] } },
          ],
          ratchetTreeExtension: true,
        }
      );
      state = added.newState;
      added.consumed.forEach(zeroOutUint8Array);
      assert.ok(added.welcome);
      rust.joinRoom(
        'independent-room',
        encodeMlsMessage({
          version: 'mls10',
          wireformat: 'mls_welcome',
          welcome: added.welcome,
        })
      );
      const message = await createApplicationMessage(
        state,
        utf8.encode('Independent invitation works'),
        suite
      );
      message.consumed.forEach(zeroOutUint8Array);
      const frame = encodeMlsMessage({
        version: 'mls10',
        wireformat: 'mls_private_message',
        privateMessage: message.privateMessage,
      });
      const result = resultSchema.parse(
        JSON.parse(rust.processMessage('independent-room', frame))
      );
      assert.equal(
        new TextDecoder().decode(Uint8Array.from(result.content)),
        'Independent invitation works'
      );
    } finally {
      rust.free();
    }
  });

  it('requires explicit delivery acknowledgement and persists exact retries and history recovery separately', async () => {
    const alice = await OpenMlsQualificationClient.create('alice');
    const bob = await OpenMlsQualificationClient.create('bob');
    let restored: OpenMlsQualificationClient | undefined;
    let replacement: OpenMlsQualificationClient | undefined;
    try {
      await alice.trust(bob.contact);
      await bob.trust(alice.contact);
      await alice.createRoom();
      const invitation = await alice.add(bob.contact);
      await assert.rejects(
        alice.send(crypto.randomUUID(), 'Not before acceptance'),
        /pending/
      );
      await alice.acknowledgeCommit();
      await bob.join(invitation.welcome);
      const id = crypto.randomUUID();
      const envelope = await alice.send(id, 'Durable delivery');
      restored = await OpenMlsQualificationClient.restore(
        alice.exportLocalSecrets()
      );
      assert.deepEqual(await restored.send(id, 'Durable delivery'), envelope);
      assert.equal((await bob.receive(envelope))?.content, 'Durable delivery');
      await assert.rejects(bob.receive(envelope));
      const key = createRecoveryKey();
      const backup = await bob.backupHistory(key);
      replacement = await OpenMlsQualificationClient.create('bob');
      await replacement.restoreHistory(backup, key);
      assert.equal(
        replacement.history.entries[0].message.content,
        'Durable delivery'
      );
      assert.equal(replacement.room, null);
      assert.notEqual(replacement.identity.device, bob.identity.device);
      await assert.rejects(
        replacement.send(crypto.randomUUID(), 'No old live keys'),
        /join/
      );
    } finally {
      alice.dispose();
      bob.dispose();
      restored?.dispose();
      replacement?.dispose();
    }
  });

  it('renews cached public prekeys without replacing the device, live ratchet or unconsumed invitation keys', async () => {
    const alice = await OpenMlsQualificationClient.create('alice');
    const bob = await OpenMlsQualificationClient.create('bob');
    let renewedAlice: OpenMlsQualificationClient | undefined;
    let renewedBob: OpenMlsQualificationClient | undefined;
    const oldContactState = (client: OpenMlsQualificationClient) =>
      JSON.stringify({
        ...JSON.parse(client.exportLocalSecrets()),
        contactIssuedAt: Date.now() - 86_400_001,
      });
    try {
      await alice.trust(bob.contact);
      await bob.trust(alice.contact);
      await alice.createRoom();
      const invitation = await alice.add(bob.contact);
      await alice.acknowledgeCommit();
      renewedBob = await OpenMlsQualificationClient.restore(
        oldContactState(bob)
      );
      assert.deepEqual(renewedBob.identity, bob.identity);
      assert.notDeepEqual(renewedBob.contact, bob.contact);
      await renewedBob.join(invitation.welcome);
      const firstId = crypto.randomUUID();
      const first = await alice.send(firstId, 'Before public prekey renewal');
      await renewedBob.receive(first);
      renewedAlice = await OpenMlsQualificationClient.restore(
        oldContactState(alice)
      );
      assert.deepEqual(renewedAlice.identity, alice.identity);
      assert.notDeepEqual(renewedAlice.contact, alice.contact);
      assert.deepEqual(
        await renewedAlice.send(firstId, 'Before public prekey renewal'),
        first
      );
      const next = await renewedAlice.send(
        crypto.randomUUID(),
        'After public prekey renewal'
      );
      assert.equal(
        (await renewedBob.receive(next))?.content,
        'After public prekey renewal'
      );
    } finally {
      alice.dispose();
      bob.dispose();
      renewedAlice?.dispose();
      renewedBob?.dispose();
    }
  });
});
