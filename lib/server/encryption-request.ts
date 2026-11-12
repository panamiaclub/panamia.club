import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { z } from 'zod';
import { ACTIVE_PROFILE_COOKIE } from './active-profile';
import { fromBase64 } from '@/lib/e2ee/encoding';
import {
  sha256,
  signedStatementSchema,
  type SignedStatement,
} from '@/lib/e2ee/identity-contract';
import {
  EncryptionError,
  encryptionFail,
  encryptionInput,
  encryptionScopeSchema,
  requireEncryptionEnabled,
  type EncryptionScope,
  type ExpectedDeviceRequest,
} from './encryption-context';

export type EncryptionHttpContext = {
  scope: EncryptionScope;
  body: unknown;
  expected: ExpectedDeviceRequest;
  proof: SignedStatement | null;
};

export function encryptionResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie, Authorization',
    },
  });
}

async function readBody(
  request: NextRequest,
  maximum: number,
  binary: boolean
) {
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
    (binary ? 'application/octet-stream' : 'application/json')
  )
    encryptionFail(
      400,
      'CONTENT_TYPE_REQUIRED',
      'Use the required encrypted messaging content type.'
    );
  const declared = request.headers.get('content-length');
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > maximum)
  )
    encryptionFail(
      413,
      'REQUEST_TOO_LARGE',
      'The encrypted messaging request is too large.'
    );
  const reader = request.body?.getReader();
  if (!reader)
    encryptionFail(400, 'JSON_REQUIRED', 'A JSON request body is required.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.length;
    if (length > maximum) {
      await reader.cancel();
      encryptionFail(
        413,
        'REQUEST_TOO_LARGE',
        'The encrypted messaging request is too large.'
      );
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (binary) return { bytes, value: bytes };
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    encryptionFail(400, 'INVALID_JSON', 'Invalid encrypted messaging JSON.');
  }
  return { bytes, value };
}

function requestProof(request: NextRequest): SignedStatement | null {
  const header = request.headers.get('x-pana-device-proof');
  if (!header) return null;
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(fromBase64(header, 4096))
    );
  } catch {
    encryptionFail(
      400,
      'INVALID_SIGNATURE',
      'Invalid encrypted device proof header.'
    );
  }
  return encryptionInput(signedStatementSchema, value);
}

export function requireDeviceProof(context: EncryptionHttpContext) {
  if (!context.proof)
    encryptionFail(
      403,
      'DEVICE_APPROVAL_REQUIRED',
      'An approved device signature is required.'
    );
  return context.proof;
}
const inputEnvelopeSchema = encryptionScopeSchema
  .extend({ input: z.unknown() })
  .strict();
export function encryptionBody(context: EncryptionHttpContext): unknown {
  return encryptionInput(inputEnvelopeSchema, context.body).input;
}
export function encryptionTransport(context: EncryptionHttpContext) {
  return {
    scope: context.scope,
    proof: requireDeviceProof(context),
    expected: context.expected,
  };
}

export async function encryptionHttp(
  request: NextRequest,
  operation: (context: EncryptionHttpContext) => Promise<unknown>,
  maximum = 64 * 1024,
  binary = false
) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      encryptionFail(
        401,
        'UNAUTHORIZED',
        'Sign in to use encrypted messaging.'
      );
    requireEncryptionEnabled();
    const read = request.method === 'GET';
    if (!read && request.headers.get('origin') !== request.nextUrl.origin)
      encryptionFail(
        403,
        'ORIGIN_MISMATCH',
        'The encrypted messaging request must come from this site.'
      );
    const input = read
      ? { bytes: new Uint8Array(), value: null }
      : await readBody(request, maximum, binary);
    const fields =
      read || binary
        ? Object.fromEntries(request.nextUrl.searchParams)
        : input.value;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields))
      encryptionFail(
        400,
        'PROFILE_REQUIRED',
        'Explicit profile and actor identities are required.'
      );
    const selected = encryptionInput(encryptionScopeSchema, {
      profileId: 'profileId' in fields ? fields.profileId : undefined,
      actorId: 'actorId' in fields ? fields.actorId : undefined,
    });
    const cookie = request.cookies.get(ACTIVE_PROFILE_COOKIE)?.value;
    if (cookie && cookie !== selected.profileId)
      encryptionFail(
        409,
        'PROFILE_CHANGED',
        'The active profile changed. Reopen this encrypted conversation.'
      );
    const data = await operation({
      scope: { ...selected, userId: session.user.id },
      body: input.value,
      expected: {
        method: request.method,
        path: request.nextUrl.pathname + request.nextUrl.search,
        bodySha256: await sha256(input.bytes),
      },
      proof: requestProof(request),
    });
    if (data instanceof Response) {
      data.headers.set('Cache-Control', 'private, no-store');
      data.headers.set('Vary', 'Cookie, Authorization');
      data.headers.set('X-Content-Type-Options', 'nosniff');
      return data;
    }
    return encryptionResponse({ success: true, data });
  } catch (error) {
    if (error instanceof EncryptionError)
      return encryptionResponse(
        { success: false, code: error.code, error: error.message },
        error.status
      );
    console.error('Encrypted messaging request failed', {
      method: request.method,
      name: error instanceof Error ? error.name : typeof error,
    });
    return encryptionResponse(
      {
        success: false,
        code: 'ENCRYPTION_REQUEST_FAILED',
        error:
          'Encrypted messaging is unavailable. No plaintext fallback was attempted.',
      },
      500
    );
  }
}
