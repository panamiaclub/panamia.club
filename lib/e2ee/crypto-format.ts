import { z } from 'zod';
import { arrayBuffer, fromBase64, toBase64 } from './encoding';
import { E2EE_PROTOCOL, sha256 } from './identity-contract';
import {
  encryptedAttachmentSchema,
  type EncryptedAttachment,
} from './room-contract';

export const E2EE_MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const E2EE_MAX_RECORD_BYTES = 64 * 1024 * 1024;
export const recordPurposeSchema = z.enum([
  'device-state',
  'identity-backup',
  'history-backup',
  'message-record',
  'outbox',
]);
export type RecordPurpose = z.infer<typeof recordPurposeSchema>;
export const encryptedRecordSchema = z
  .object({
    version: z.literal(1),
    protocol: z.literal(E2EE_PROTOCOL),
    purpose: recordPurposeSchema,
    context: z.string().min(1).max(512),
    iv: z.string().length(16),
    ciphertext: z.string().max(Math.ceil(E2EE_MAX_RECORD_BYTES / 3) * 4),
  })
  .strict();
export type EncryptedRecord = z.infer<typeof encryptedRecordSchema>;

function aad(purpose: string, context: string) {
  if (!context || context.length > 512)
    throw new Error('Invalid encryption scope.');
  return arrayBuffer(
    new TextEncoder().encode(
      JSON.stringify([E2EE_PROTOCOL, 1, purpose, context])
    )
  );
}

export async function importAesKey(bytes: Uint8Array) {
  if (bytes.length !== 32)
    throw new Error('A 256-bit encryption key is required.');
  return crypto.subtle.importKey('raw', arrayBuffer(bytes), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export function newRecoveryKey(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sealRecord(
  bytes: Uint8Array,
  key: CryptoKey,
  purpose: RecordPurpose,
  context: string
): Promise<EncryptedRecord> {
  recordPurposeSchema.parse(purpose);
  if (bytes.length > E2EE_MAX_RECORD_BYTES - 16)
    throw new Error('The encrypted record exceeds its storage limit.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: arrayBuffer(iv),
      additionalData: aad(purpose, context),
      tagLength: 128,
    },
    key,
    arrayBuffer(bytes)
  );
  return {
    version: 1,
    protocol: E2EE_PROTOCOL,
    purpose,
    context,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(sealed)),
  };
}

export async function unsealRecord(
  value: unknown,
  key: CryptoKey,
  purpose: RecordPurpose,
  context: string
): Promise<Uint8Array> {
  const record = encryptedRecordSchema.parse(value);
  if (record.purpose !== purpose || record.context !== context)
    throw new Error(
      'This encrypted record belongs to a different profile or purpose.'
    );
  const iv = fromBase64(record.iv, 12);
  const ciphertext = fromBase64(record.ciphertext, E2EE_MAX_RECORD_BYTES);
  if (iv.length !== 12 || ciphertext.length < 16)
    throw new Error('Invalid encrypted record encoding.');
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: arrayBuffer(iv),
          additionalData: aad(purpose, context),
          tagLength: 128,
        },
        key,
        arrayBuffer(ciphertext)
      )
    );
  } catch (error) {
    throw new Error('The recovery key or encrypted record is invalid.', {
      cause: error,
    });
  }
}

export async function encryptMedia(
  roomId: string,
  bytes: Uint8Array,
  name: string,
  mediaType: string
): Promise<{ manifest: EncryptedAttachment; ciphertext: Uint8Array }> {
  z.uuid().parse(roomId);
  if (!bytes.length || bytes.length > E2EE_MAX_MEDIA_BYTES)
    throw new Error('Choose a supported attachment of 10 MB or less.');
  const id = crypto.randomUUID();
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const key = await importAesKey(secret);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: arrayBuffer(iv),
          additionalData: aad('media', `${roomId}:${id}`),
          tagLength: 128,
        },
        key,
        arrayBuffer(bytes)
      )
    );
    const manifest = encryptedAttachmentSchema.parse({
      id,
      key: toBase64(secret),
      iv: toBase64(iv),
      sha256: await sha256(ciphertext),
      name,
      mediaType,
      size: bytes.length,
    });
    return { manifest, ciphertext };
  } finally {
    secret.fill(0);
  }
}

export async function decryptMedia(
  roomId: string,
  value: unknown,
  bytes: Uint8Array
) {
  z.uuid().parse(roomId);
  const manifest = encryptedAttachmentSchema.parse(value);
  if (
    bytes.length !== manifest.size + 16 ||
    (await sha256(bytes)) !== manifest.sha256
  )
    throw new Error('The encrypted attachment is incomplete or was changed.');
  const secret = fromBase64(manifest.key, 32);
  const iv = fromBase64(manifest.iv, 12);
  if (iv.length !== 12) throw new Error('Invalid encrypted attachment nonce.');
  try {
    const clear = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: arrayBuffer(iv),
          additionalData: aad('media', `${roomId}:${manifest.id}`),
          tagLength: 128,
        },
        await importAesKey(secret),
        arrayBuffer(bytes)
      )
    );
    return { bytes: clear, name: manifest.name, mediaType: manifest.mediaType };
  } catch (error) {
    throw new Error('Cannot decrypt this attachment for this conversation.', {
      cause: error,
    });
  } finally {
    secret.fill(0);
  }
}
