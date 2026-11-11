import { Capacitor, registerPlugin } from '@capacitor/core';
import { z } from 'zod';
import { arrayBuffer, fromBase64, toBase64 } from './encoding';
import { importAesKey } from './crypto-format';
import { sha256 } from './identity-contract';

const boxSchema = z
  .object({
    version: z.literal(1),
    iv: z.string().length(16),
    ciphertext: z.string().length(64),
  })
  .strict();
const capabilitiesSchema = z
  .object({
    version: z.literal(1),
    provider: z.enum(['android-keystore', 'ios-keychain-this-device-only']),
    deviceBound: z.literal(true),
    hardwareBacked: z.boolean().nullable(),
  })
  .strict();
export type StorageCapabilities = z.infer<typeof capabilitiesSchema>;
type NativeBox = z.infer<typeof boxSchema>;
interface ProtectedStoragePlugin {
  capabilities(input: { scope: string }): Promise<StorageCapabilities>;
  protect(input: { scope: string; data: string }): Promise<NativeBox>;
  unprotect(input: NativeBox & { scope: string }): Promise<{ data: string }>;
  remove(input: { scope: string }): Promise<{ removed: boolean }>;
}
const nativeStorage = registerPlugin<ProtectedStoragePlugin>(
  'PanaProtectedStorage'
);
const nativeWrappingSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('native'),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    box: boxSchema,
    capabilities: capabilitiesSchema,
  })
  .strict();
export type WrappingKey =
  | { version: 1; kind: 'browser'; key: CryptoKey }
  | z.infer<typeof nativeWrappingSchema>;

function requireNativeStorage() {
  if (!Capacitor.isPluginAvailable('PanaProtectedStorage'))
    throw new Error(
      'Update the Pana app to use protected encryption storage. No browser-key fallback is allowed in the native app.'
    );
}

export async function createWrappingKey(): Promise<{
  descriptor: WrappingKey;
  key: CryptoKey;
}> {
  if (!globalThis.isSecureContext || !crypto.subtle)
    throw new Error('Encrypted messaging requires a secure device context.');
  if (!Capacitor.isNativePlatform()) {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return { descriptor: { version: 1, kind: 'browser', key }, key };
  }
  requireNativeStorage();
  const scope = await sha256(crypto.getRandomValues(new Uint8Array(32)));
  const capabilities = capabilitiesSchema.parse(
    await nativeStorage.capabilities({ scope })
  );
  const secret = crypto.getRandomValues(new Uint8Array(32));
  try {
    const key = await importAesKey(secret);
    const box = boxSchema.parse(
      await nativeStorage.protect({ scope, data: toBase64(secret) })
    );
    return {
      descriptor: { version: 1, kind: 'native', scope, box, capabilities },
      key,
    };
  } finally {
    secret.fill(0);
  }
}

export async function openWrappingKey(value: unknown): Promise<CryptoKey> {
  if (Capacitor.isNativePlatform()) {
    requireNativeStorage();
    const descriptor = nativeWrappingSchema.safeParse(value);
    if (!descriptor.success)
      throw new Error(
        'This native device cannot use a copied browser vault. Recover history onto fresh device keys.'
      );
    const response = z
      .object({ data: z.string().length(44) })
      .strict()
      .parse(
        await nativeStorage.unprotect({
          scope: descriptor.data.scope,
          ...descriptor.data.box,
        })
      );
    const secret = fromBase64(response.data, 32);
    try {
      return await importAesKey(secret);
    } finally {
      secret.fill(0);
    }
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('kind' in value) ||
    value.kind !== 'browser' ||
    !('key' in value) ||
    !(value.key instanceof CryptoKey) ||
    value.key.type !== 'secret' ||
    value.key.extractable ||
    value.key.algorithm.name !== 'AES-GCM' ||
    !('length' in value.key.algorithm) ||
    value.key.algorithm.length !== 256 ||
    value.key.usages.length !== 2 ||
    !value.key.usages.includes('encrypt') ||
    !value.key.usages.includes('decrypt')
  )
    throw new Error(
      'The local wrapping key is missing or belongs to another device. Use recovery instead.'
    );
  return value.key;
}

export async function removeWrappingKey(value: WrappingKey) {
  if (value.kind === 'native') {
    requireNativeStorage();
    const result = await nativeStorage.remove({ scope: value.scope });
    if (!result.removed)
      throw new Error('The protected device key could not be removed.');
  }
}

export async function verifyWrappingKey(key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fixture = crypto.getRandomValues(new Uint8Array(32));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: arrayBuffer(iv) },
    key,
    arrayBuffer(fixture)
  );
  const opened = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: arrayBuffer(iv) },
      key,
      sealed
    )
  );
  if (
    opened.length !== fixture.length ||
    opened.some((byte, index) => byte !== fixture[index])
  )
    throw new Error('Protected device storage failed its round trip.');
  fixture.fill(0);
  opened.fill(0);
}
