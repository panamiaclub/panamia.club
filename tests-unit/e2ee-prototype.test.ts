import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PrototypeClient, createRecoveryKey } from '@/lib/e2ee/prototype';
import {
  decryptAttachment,
  encryptAttachment,
  fromBase64,
  toBase64,
} from '@/lib/e2ee/sealed-object';

async function pair() {
  const alice = await PrototypeClient.create('alice');
  const bob = await PrototypeClient.create('bob');
  await alice.trust(bob.contact);
  await bob.trust(alice.contact);
  await alice.createRoom();
  const invitation = await alice.add(bob.contact);
  await bob.join(invitation.welcome);
  return { alice, bob };
}

describe('isolated MLS prototype (not production chat)', () => {
  it('exchanges encrypted messages in both directions without plaintext in relay objects', async () => {
    const { alice, bob } = await pair();
    const envelope = await alice.send(
      crypto.randomUUID(),
      'A private prototype message'
    );
    assert.ok(
      !JSON.stringify(envelope).includes('A private prototype message')
    );
    assert.ok(
      !new TextDecoder()
        .decode(fromBase64(envelope.frame))
        .includes('A private prototype message')
    );
    assert.equal(
      (await bob.receive(envelope))?.content,
      'A private prototype message'
    );
    const reply = await bob.send(crypto.randomUUID(), 'A private reply');
    assert.equal((await alice.receive(reply))?.content, 'A private reply');
  });

  it('requires explicit pinned-device trust instead of the SDK allow-all authentication default', async () => {
    const alice = await PrototypeClient.create('alice');
    const bob = await PrototypeClient.create('bob');
    await alice.createRoom();
    await assert.rejects(alice.add(bob.contact), /explicitly trust/);
    await alice.trust(bob.contact);
    const invite = await alice.add(bob.contact);
    await assert.rejects(bob.join(invite.welcome));
    await bob.trust(alice.contact);
    await bob.join(invite.welcome);
    assert.equal(bob.members.length, 2);
    await assert.rejects(bob.join(invite.welcome), /reuse/);
  });

  it('admits a third member for future messages but not earlier epochs', async () => {
    const { alice, bob } = await pair();
    const old = await alice.send(crypto.randomUUID(), 'Before joining');
    await bob.receive(old);
    const carol = await PrototypeClient.create('carol');
    for (const existing of [alice, bob]) {
      await existing.trust(carol.contact);
      await carol.trust(existing.contact);
    }
    const invite = await alice.add(carol.contact);
    await bob.receive(invite.commit);
    await carol.join(invite.welcome);
    await assert.rejects(carol.receive(old));
    const fresh = await alice.send(crypto.randomUUID(), 'After joining');
    assert.equal((await bob.receive(fresh))?.content, 'After joining');
    assert.equal((await carol.receive(fresh))?.content, 'After joining');
    assert.equal(carol.history.entries.length, 1);
  });

  it('removed members cannot receive future messages even if they ignore their removal', async () => {
    const { alice, bob } = await pair();
    const staleBob = await PrototypeClient.restoreLocalSecrets(
      bob.exportLocalSecrets()
    );
    const removed = await alice.remove(bob.identity.device);
    await bob.receive(removed);
    const fresh = await alice.send(
      crypto.randomUUID(),
      'Not for the removed member'
    );
    await assert.rejects(bob.receive(fresh));
    await assert.rejects(staleBob.receive(fresh));
    await assert.rejects(
      bob.send(crypto.randomUUID(), 'Cannot send after removal')
    );
    assert.equal(alice.members.length, 1);
  });

  it('refuses replays and altered authenticated ciphertext', async () => {
    const { alice, bob } = await pair();
    const envelope = await alice.send(crypto.randomUUID(), 'Authentic');
    const altered = structuredClone(envelope);
    const bytes = fromBase64(altered.frame);
    bytes[bytes.length - 1] ^= 1;
    altered.frame = toBase64(bytes);
    await assert.rejects(bob.receive(altered));
    assert.equal((await bob.receive(envelope))?.content, 'Authentic');
    await assert.rejects(bob.receive(envelope));
    await assert.rejects(
      bob.receive({ ...envelope, plaintext: 'must not be accepted' })
    );
  });

  it('persists ratchets and retries the same envelope without encrypting it again', async () => {
    const { alice, bob } = await pair();
    const id = crypto.randomUUID();
    const first = await alice.send(id, 'Retry exactly once');
    const snapshot = alice.exportLocalSecrets();
    const restored = await PrototypeClient.restoreLocalSecrets(snapshot);
    assert.deepEqual(await restored.send(id, 'Retry exactly once'), first);
    assert.equal(restored.exportLocalSecrets(), snapshot);
    await assert.rejects(
      restored.send(id, 'Changed content'),
      /original message/
    );
    assert.equal((await bob.receive(first))?.content, 'Retry exactly once');
    const next = await restored.send(crypto.randomUUID(), 'Ratchet continued');
    assert.equal((await bob.receive(next))?.content, 'Ratchet continued');
  });

  it('encrypts attachments and their metadata and puts the file key only inside MLS', async () => {
    const { alice, bob } = await pair();
    const file = await encryptAttachment(
      new TextEncoder().encode('private attachment bytes'),
      'private-name.txt',
      'text/plain'
    );
    const envelope = await alice.send(crypto.randomUUID(), '', [file]);
    const relay = JSON.stringify(envelope);
    for (const secret of [
      'private attachment bytes',
      'private-name.txt',
      file.secret,
    ]) {
      assert.ok(!relay.includes(secret));
    }
    const received = await bob.receive(envelope);
    assert.ok(received);
    const reference = received.attachments[0];
    const restored = await decryptAttachment(
      envelope.objects[0].object,
      reference.id,
      reference.secret
    );
    assert.equal(restored.name, 'private-name.txt');
    assert.equal(
      new TextDecoder().decode(restored.bytes),
      'private attachment bytes'
    );
    await assert.rejects(
      decryptAttachment(
        envelope.objects[0].object,
        reference.id,
        createRecoveryKey()
      )
    );
    await assert.rejects(
      decryptAttachment(
        envelope.objects[0].object,
        crypto.randomUUID(),
        reference.secret
      ),
      /different context/
    );
  });

  it('recovers retained history on a fresh device without cloning live keys or ratchets', async () => {
    const { alice, bob } = await pair();
    await bob.receive(
      await alice.send(crypto.randomUUID(), 'Recover this history')
    );
    const key = createRecoveryKey();
    const backup = await bob.backupHistory(key);
    assert.ok(!JSON.stringify(backup).includes('Recover this history'));
    const replacement = await PrototypeClient.create('bob');
    await replacement.restoreHistory(backup, key);
    assert.equal(
      replacement.history.entries[0].message.content,
      'Recover this history'
    );
    assert.notEqual(replacement.identity.device, bob.identity.device);
    assert.equal(replacement.room, null);
    await assert.rejects(
      replacement.send(crypto.randomUUID(), 'Requires a new invitation'),
      /join/
    );
    await assert.rejects(
      replacement.restoreHistory(backup, createRecoveryKey()),
      /Cannot decrypt/
    );
    const otherProfile = await PrototypeClient.create('alice');
    await assert.rejects(
      otherProfile.restoreHistory(backup, key),
      /different context/
    );
    await assert.rejects(
      replacement.restoreHistory({ ...backup, purpose: 'local-state' }, key),
      /different context/
    );
  });

  it('does not resurrect expired history from encrypted backups', async () => {
    const { alice } = await pair();
    await alice.send(crypto.randomUUID(), 'Will expire');
    const saved = JSON.parse(alice.exportLocalSecrets());
    saved.archive.entries[0].message.expiresAt = '2000-01-01T00:00:00.000Z';
    const expired = await PrototypeClient.restoreLocalSecrets(
      JSON.stringify(saved)
    );
    const key = createRecoveryKey();
    const replacement = await PrototypeClient.create('alice');
    await replacement.restoreHistory(await expired.backupHistory(key), key);
    assert.equal(replacement.history.entries.length, 0);
  });

  it('refuses concurrent use of one in-memory ratchet instead of reusing its message key', async () => {
    const { alice, bob } = await pair();
    const first = alice.send(crypto.randomUUID(), 'First operation');
    await assert.rejects(
      alice.send(crypto.randomUUID(), 'Concurrent operation'),
      /Concurrent device/
    );
    assert.equal((await bob.receive(await first))?.content, 'First operation');
    const next = await alice.send(crypto.randomUUID(), 'Sequential operation');
    assert.equal((await bob.receive(next))?.content, 'Sequential operation');
  });

  it('round-trips the actual 10 MB attachment limit and rejects one byte more', async () => {
    const bytes = new Uint8Array(10 * 1024 * 1024).fill(41);
    const encrypted = await encryptAttachment(
      bytes,
      'large-fixture.bin',
      'application/octet-stream'
    );
    const restored = await decryptAttachment(
      encrypted.object,
      encrypted.id,
      encrypted.secret
    );
    assert.equal(restored.bytes.length, bytes.length);
    assert.deepEqual(restored.bytes, bytes);
    await assert.rejects(
      encryptAttachment(
        new Uint8Array(bytes.length + 1),
        'too-large.bin',
        'application/octet-stream'
      ),
      /10 MB/
    );
  });

  it('rejects malformed or oversized binary encodings', () => {
    for (const value of ['not base64!', 'Zg=', 'Zg===', 'Zh==']) {
      assert.throws(() => fromBase64(value));
    }
    assert.throws(() => fromBase64(toBase64(new Uint8Array(33)), 32));
  });
});
