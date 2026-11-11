import { z } from 'zod';
import { arrayBuffer, toBase64 } from './encoding';
import {
  deviceIdentitySchema,
  sha256,
  signStatement,
  type StatementPurpose,
} from './identity-contract';
import type { VaultScope } from './device-vault';
import type { NativeDevice } from './engine';

export class EncryptedApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}
const responseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  code: z.string().optional(),
  error: z.string().optional(),
});
export class EncryptedApi {
  constructor(
    readonly scope: VaultScope,
    private readonly transport: typeof fetch = fetch
  ) {}
  private url(path: string, query: Record<string, string> = {}) {
    const url = new URL(
      path,
      typeof location === 'undefined' ? 'https://pana.invalid' : location.origin
    );
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, value);
    return url.pathname + url.search;
  }
  private async proof(
    device: NativeDevice,
    stateHash: string | null,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: Uint8Array
  ) {
    const identity = deviceIdentitySchema.parse(
      JSON.parse(device.deviceIdentity())
    );
    if (
      identity.profileId !== this.scope.profileId ||
      identity.actorId !== this.scope.actorId
    )
      throw new Error(
        'The active encryption profile changed. Do not send this queued message.'
      );
    const statement = await signStatement(
      'device-request',
      {
        version: 1,
        profileId: this.scope.profileId,
        actorId: this.scope.actorId,
        deviceId: identity.deviceId,
        method,
        path,
        bodySha256: await sha256(body),
        stateHash,
        nonce: crypto.randomUUID(),
        issuedAt: Date.now(),
      },
      (purpose: StatementPurpose, payload) =>
        device.signStatement(purpose, payload)
    );
    return toBase64(new TextEncoder().encode(JSON.stringify(statement)));
  }
  private async failure(response: Response): Promise<never> {
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new EncryptedApiError(
        response.status,
        'INVALID_RESPONSE',
        'Encrypted messaging returned an invalid response.'
      );
    }
    const parsed = responseSchema.safeParse(value);
    if (!parsed.success)
      throw new EncryptedApiError(
        response.status,
        'INVALID_RESPONSE',
        'Encrypted messaging returned an invalid response.'
      );
    throw new EncryptedApiError(
      response.status,
      parsed.data.code ?? 'REQUEST_FAILED',
      parsed.data.error ??
        'Encrypted messaging is unavailable. No plaintext fallback is permitted.'
    );
  }
  async json<T>(
    schema: z.ZodType<T>,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    input: unknown = undefined,
    signer?: { device: NativeDevice; stateHash: string | null },
    extra: Record<string, string> = {}
  ): Promise<T> {
    const read = method === 'GET';
    const url = this.url(
      path,
      read
        ? {
            profileId: this.scope.profileId,
            actorId: this.scope.actorId,
            ...extra,
          }
        : extra
    );
    const text = read
      ? ''
      : JSON.stringify({
          profileId: this.scope.profileId,
          actorId: this.scope.actorId,
          input,
        });
    const bytes = new TextEncoder().encode(text);
    const headers: Record<string, string> = read
      ? {}
      : { 'Content-Type': 'application/json' };
    if (signer)
      headers['x-pana-device-proof'] = await this.proof(
        signer.device,
        signer.stateHash,
        method,
        url,
        bytes
      );
    const response = await this.transport(url, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
      ...(read ? {} : { body: text }),
    });
    if (!response.ok) return this.failure(response);
    const result = responseSchema.parse(await response.json());
    if (!result.success)
      throw new EncryptedApiError(
        response.status,
        result.code ?? 'REQUEST_FAILED',
        result.error ?? 'Encrypted request failed.'
      );
    return schema.parse(result.data);
  }
  async deviceAction<T>(
    schema: z.ZodType<T>,
    action: string,
    input: unknown
  ): Promise<T> {
    const response = await this.transport('/api/social/encryption/devices', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: this.scope.profileId,
        actorId: this.scope.actorId,
        action,
        input,
      }),
    });
    if (!response.ok) return this.failure(response);
    const result = responseSchema.parse(await response.json());
    if (!result.success)
      throw new EncryptedApiError(
        response.status,
        result.code ?? 'REQUEST_FAILED',
        result.error ?? 'Device setup failed.'
      );
    return schema.parse(result.data);
  }
  async media(
    method: 'GET' | 'PUT',
    id: string,
    signer: { device: NativeDevice; stateHash: string | null },
    bytes: Uint8Array = new Uint8Array(),
    backupId?: string
  ) {
    const url = this.url(`/api/social/encryption/media/${id}`, {
      profileId: this.scope.profileId,
      actorId: this.scope.actorId,
      ...(backupId ? { backupId } : {}),
    });
    const headers: Record<string, string> = {
      'x-pana-device-proof': await this.proof(
        signer.device,
        signer.stateHash,
        method,
        url,
        bytes
      ),
      ...(method === 'PUT'
        ? { 'Content-Type': 'application/octet-stream' }
        : {}),
    };
    const response = await this.transport(url, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
      ...(method === 'PUT' ? { body: arrayBuffer(bytes) } : {}),
    });
    if (!response.ok) return this.failure(response);
    return method === 'GET'
      ? new Uint8Array(await response.arrayBuffer())
      : null;
  }
}
