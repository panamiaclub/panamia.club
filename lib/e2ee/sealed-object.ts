import { z } from 'zod';
import { fromBase64, toBase64 } from './encoding';
export { fromBase64, toBase64 } from './encoding';

const MAX_BYTES = 64 * 1024 * 1024;
const encodedBytes = z.string().max(Math.ceil(MAX_BYTES / 3) * 4);
export const sealedObjectSchema = z
  .object({
    version: z.literal(1),
    purpose: z.enum(['local-state', 'history-backup', 'attachment']),
    context: z.string().min(1).max(512),
    iv: z.string().length(16),
    ciphertext: encodedBytes,
  })
  .strict();
export type SealedObject = z.infer<typeof sealedObjectSchema>;
type Purpose = SealedObject['purpose'];

function buffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function additionalData(purpose: Purpose, context: string): ArrayBuffer {
  return buffer(
    new TextEncoder().encode(
      JSON.stringify(['pana-e2ee-prototype', 1, purpose, context])
    )
  );
}

export async function importSecret(secret: Uint8Array): Promise<CryptoKey> {
  if (secret.length !== 32) throw new Error('A 256-bit secret is required.');
  return crypto.subtle.importKey('raw', buffer(secret), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function seal(
  bytes: Uint8Array,
  key: CryptoKey,
  purpose: Purpose,
  context: string
): Promise<SealedObject> {
  if (bytes.length > MAX_BYTES - 16) {
    throw new Error('Encrypted object is too large.');
  }
  if (!context || context.length > 512) {
    throw new Error('Invalid encryption context.');
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: buffer(iv),
      additionalData: additionalData(purpose, context),
      tagLength: 128,
    },
    key,
    buffer(bytes)
  );
  return {
    version: 1,
    purpose,
    context,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function unseal(
  value: unknown,
  key: CryptoKey,
  purpose: Purpose,
  context: string
): Promise<Uint8Array> {
  const object = sealedObjectSchema.parse(value);
  if (object.purpose !== purpose || object.context !== context) {
    throw new Error('Encrypted object belongs to a different context.');
  }
  const iv = fromBase64(object.iv, 12);
  const ciphertext = fromBase64(object.ciphertext);
  if (iv.length !== 12 || ciphertext.length < 16) {
    throw new Error('Invalid encrypted object.');
  }
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: buffer(iv),
          additionalData: additionalData(purpose, context),
          tagLength: 128,
        },
        key,
        buffer(ciphertext)
      )
    );
  } catch (error) {
    throw new Error('Cannot decrypt: the key or encrypted data is invalid.', {
      cause: error,
    });
  }
}

const attachmentSchema = z
  .object({
    name: z.string().max(500),
    mediaType: z.string().max(128),
    bytes: encodedBytes,
  })
  .strict();

export async function encryptAttachment(
  bytes: Uint8Array,
  name: string,
  mediaType: string
) {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) {
    throw new Error('Choose a non-empty attachment of 10 MB or less.');
  }
  const content = attachmentSchema.parse({
    name,
    mediaType,
    bytes: toBase64(bytes),
  });
  const id = crypto.randomUUID();
  const secret = crypto.getRandomValues(new Uint8Array(32));
  try {
    const object = await seal(
      new TextEncoder().encode(JSON.stringify(content)),
      await importSecret(secret),
      'attachment',
      id
    );
    return { id, object, secret: toBase64(secret) };
  } finally {
    secret.fill(0);
  }
}

export async function decryptAttachment(
  object: unknown,
  id: string,
  secret: string
) {
  const bytes = fromBase64(secret, 32);
  try {
    const decrypted = await unseal(
      object,
      await importSecret(bytes),
      'attachment',
      id
    );
    try {
      const content = attachmentSchema.parse(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decrypted))
      );
      return {
        name: content.name,
        mediaType: content.mediaType,
        bytes: fromBase64(content.bytes, 10 * 1024 * 1024),
      };
    } finally {
      decrypted.fill(0);
    }
  } finally {
    bytes.fill(0);
  }
}
