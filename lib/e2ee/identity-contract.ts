import { z } from 'zod';
import { fromBase64, toBase64 } from './encoding';

export const E2EE_PROTOCOL = 'pana-chat-mls-v1';
export const E2EE_ENROLLMENT_MS = 10 * 60_000;
export const E2EE_DEVICE_MS = 180 * 86_400_000;
export const E2EE_REQUEST_MS = 2 * 60_000;
export const E2EE_KEY_PACKAGE_MS = 7 * 86_400_000;
export const E2EE_MAX_DEVICES = 20;
export const E2EE_MAX_KEY_PACKAGES = 100;
export const e2eeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const publicKeySchema = z
  .string()
  .length(44)
  .regex(/^[A-Za-z0-9+/]{43}=$/)
  .refine((value) => {
    try {
      return fromBase64(value, 32).length === 32;
    } catch {
      return false;
    }
  }, 'A canonical 32-byte public key is required.');
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const statementPurposeSchema = z.enum([
  'enrollment',
  'device-certificate',
  'device-revocation',
  'device-request',
  'room-intent',
  'identity-reset',
  'identity-backup',
  'profile-activation',
]);
export type StatementPurpose = z.infer<typeof statementPurposeSchema>;
export type StatementVerifier = (
  purpose: StatementPurpose,
  payload: Uint8Array,
  publicKey: Uint8Array,
  signature: Uint8Array
) => boolean | Promise<boolean>;
export const signedStatementSchema = z
  .object({
    version: z.literal(1),
    payload: z.string().max(24 * 1024),
    signature: z.string().length(88),
  })
  .strict();
export type SignedStatement = z.infer<typeof signedStatementSchema>;
export class StatementError extends Error {}

export const deviceIdentitySchema = z
  .object({
    version: z.literal(1),
    profileId: e2eeIdSchema,
    actorId: e2eeIdSchema,
    deviceId: z.uuid(),
  })
  .strict();
export type DeviceIdentity = z.infer<typeof deviceIdentitySchema>;
export const enrollmentSchema = deviceIdentitySchema
  .extend({
    userId: e2eeIdSchema,
    signingKey: publicKeySchema,
    requestId: z.uuid(),
    nonce: publicKeySchema,
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type Enrollment = z.infer<typeof enrollmentSchema>;
export const deviceCertificateSchema = enrollmentSchema
  .omit({ expiresAt: true })
  .extend({
    rootVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type DeviceCertificate = z.infer<typeof deviceCertificateSchema>;
export const deviceRevocationSchema = z
  .object({
    version: z.literal(1),
    profileId: e2eeIdSchema,
    actorId: e2eeIdSchema,
    deviceId: z.uuid(),
    rootVersion: z.number().int().min(1),
    issuedAt: z.number().int().nonnegative(),
    nonce: z.uuid(),
  })
  .strict();
export const deviceRequestSchema = deviceIdentitySchema
  .extend({
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
    path: z.string().min(1).max(2048).startsWith('/api/social/encryption/'),
    bodySha256: sha256Schema,
    stateHash: sha256Schema.nullable(),
    nonce: z.uuid(),
    issuedAt: z.number().int().nonnegative(),
  })
  .strict();
export type DeviceRequest = z.infer<typeof deviceRequestSchema>;

export function deviceCredential(value: DeviceIdentity): string {
  const { version, profileId, actorId, deviceId } = value;
  return JSON.stringify(
    deviceIdentitySchema.parse({ version, profileId, actorId, deviceId })
  );
}

export function statementMessage(
  purpose: StatementPurpose,
  payload: Uint8Array
): Uint8Array {
  statementPurposeSchema.parse(purpose);
  if (!payload.length || payload.length > 16 * 1024)
    throw new Error('Invalid signed statement size.');
  const prefix = new TextEncoder().encode(`PANA-CHAT/1/${purpose}\0`);
  const message = new Uint8Array(prefix.length + payload.length);
  message.set(prefix);
  message.set(payload, prefix.length);
  return message;
}

export async function signStatement(
  purpose: StatementPurpose,
  value: unknown,
  signer: (
    purpose: StatementPurpose,
    payload: Uint8Array
  ) => Uint8Array | Promise<Uint8Array>
): Promise<SignedStatement> {
  const payload = new TextEncoder().encode(JSON.stringify(value));
  statementMessage(purpose, payload);
  const signature = await signer(purpose, payload);
  if (signature.length !== 64)
    throw new Error('Invalid Ed25519 statement signature.');
  return {
    version: 1,
    payload: toBase64(payload),
    signature: toBase64(signature),
  };
}

export async function verifyStatement<T>(
  purpose: StatementPurpose,
  value: unknown,
  publicKey: string,
  schema: z.ZodType<T>,
  verifier?: StatementVerifier
): Promise<T> {
  const parsed = signedStatementSchema.safeParse(value);
  if (!parsed.success || !publicKeySchema.safeParse(publicKey).success)
    throw new StatementError('Invalid signed statement fields.');
  const statement = parsed.data;
  const decode = (value: string, maximum: number) => {
    try {
      return fromBase64(value, maximum);
    } catch (error) {
      throw new StatementError('Invalid signed statement encoding.', {
        cause: error,
      });
    }
  };
  const keyBytes = decode(publicKey, 32);
  const signature = decode(statement.signature, 64);
  const payload = decode(statement.payload, 16 * 1024);
  if (keyBytes.length !== 32 || signature.length !== 64)
    throw new StatementError('Invalid signed statement key or signature.');
  const message = statementMessage(purpose, payload);
  let valid: boolean;
  if (verifier) valid = await verifier(purpose, payload, keyBytes, signature);
  else {
    const key = await crypto.subtle.importKey(
      'raw',
      Uint8Array.from(keyBytes).buffer,
      'Ed25519',
      false,
      ['verify']
    );
    valid = await crypto.subtle.verify(
      'Ed25519',
      key,
      Uint8Array.from(signature).buffer,
      Uint8Array.from(message).buffer
    );
  }
  if (!valid)
    throw new StatementError('The signed statement could not be verified.');
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(payload)
    );
  } catch (error) {
    throw new StatementError('Invalid signed statement payload.', {
      cause: error,
    });
  }
  const result = schema.safeParse(decoded);
  if (!result.success)
    throw new StatementError('Invalid signed statement claims.');
  return result.data;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
