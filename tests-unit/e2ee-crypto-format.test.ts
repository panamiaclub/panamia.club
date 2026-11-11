import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptMedia,
  encryptMedia,
  importAesKey,
  newRecoveryKey,
  sealRecord,
  unsealRecord,
  E2EE_MAX_MEDIA_BYTES,
} from '../lib/e2ee/crypto-format';
import { fromBase64, toBase64 } from '../lib/e2ee/encoding';
import { openWrappingKey } from '../lib/e2ee/protection';

describe('versioned production encrypted records and media', () => {
  it('accepts only a non-extractable secret AES-256 browser wrapping key', async () => {
    const strong = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    assert.equal(
      await openWrappingKey({ version: 1, kind: 'browser', key: strong }),
      strong
    );
    for (const [length, extractable] of [
      [128, false],
      [256, true],
    ] as const) {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length },
        extractable,
        ['encrypt', 'decrypt']
      );
      await assert.rejects(
        openWrappingKey({ version: 1, kind: 'browser', key })
      );
    }
  });
  it('authenticates record purpose/profile and requires the user-held recovery secret', async () => {
    const secret = newRecoveryKey();
    const key = await importAesKey(fromBase64(secret, 32));
    const plain = new TextEncoder().encode(
      'Retained private history, not a live ratchet'
    );
    const sealed = await sealRecord(
      plain,
      key,
      'history-backup',
      'account:profile'
    );
    assert.equal(
      JSON.stringify(sealed).includes('Retained private history'),
      false
    );
    assert.equal(JSON.stringify(sealed).includes(secret), false);
    assert.deepEqual(
      await unsealRecord(sealed, key, 'history-backup', 'account:profile'),
      plain
    );
    await assert.rejects(
      unsealRecord(sealed, key, 'device-state', 'account:profile')
    );
    await assert.rejects(
      unsealRecord(sealed, key, 'history-backup', 'other:profile')
    );
    const wrong = await importAesKey(fromBase64(newRecoveryKey(), 32));
    await assert.rejects(
      unsealRecord(sealed, wrong, 'history-backup', 'account:profile')
    );
    await assert.rejects(
      unsealRecord(
        { ...sealed, iv: 'AAAAAAAAAAAAAAAA' },
        key,
        'history-backup',
        'account:profile'
      )
    );
  });

  it('encrypts supported bytes with per-file keys and binds them to the conversation and object', async () => {
    const room = crypto.randomUUID();
    const clear = new TextEncoder().encode('Private photo bytes');
    const first = await encryptMedia(
      room,
      clear,
      'sensitive-name.png',
      'image/png'
    );
    const second = await encryptMedia(
      room,
      clear,
      'sensitive-name.png',
      'image/png'
    );
    assert.notEqual(first.manifest.key, second.manifest.key);
    assert.equal(
      toBase64(first.ciphertext).includes('sensitive-name.png'),
      false
    );
    assert.deepEqual(
      (await decryptMedia(room, first.manifest, first.ciphertext)).bytes,
      clear
    );
    await assert.rejects(
      decryptMedia(crypto.randomUUID(), first.manifest, first.ciphertext)
    );
    await assert.rejects(
      decryptMedia(
        room,
        { ...first.manifest, id: crypto.randomUUID() },
        first.ciphertext
      )
    );
    const tampered = Uint8Array.from(first.ciphertext);
    tampered[tampered.length - 1] ^= 1;
    await assert.rejects(decryptMedia(room, first.manifest, tampered));
    await assert.rejects(
      encryptMedia(room, clear, 'unsafe.svg', 'image/svg+xml')
    );
  });

  it('round-trips the exact 10 MB attachment boundary and rejects one byte more', async () => {
    const room = crypto.randomUUID();
    const clear = new Uint8Array(E2EE_MAX_MEDIA_BYTES);
    clear[0] = 71;
    clear[clear.length - 1] = 93;
    const encrypted = await encryptMedia(
      room,
      clear,
      'limit.webm',
      'video/webm'
    );
    assert.equal(encrypted.ciphertext.length, E2EE_MAX_MEDIA_BYTES + 16);
    const restored = await decryptMedia(
      room,
      encrypted.manifest,
      encrypted.ciphertext
    );
    assert.equal(restored.bytes.length, E2EE_MAX_MEDIA_BYTES);
    assert.equal(restored.bytes[0], 71);
    assert.equal(restored.bytes.at(-1), 93);
    await assert.rejects(
      encryptMedia(
        room,
        new Uint8Array(E2EE_MAX_MEDIA_BYTES + 1),
        'too-large.png',
        'image/png'
      )
    );
  });
});
