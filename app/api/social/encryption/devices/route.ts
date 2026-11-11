import { NextRequest } from 'next/server';
import { z } from 'zod';
import { e2eeIdSchema } from '@/lib/e2ee/identity-contract';
import { encryptionInput } from '@/lib/server/encryption-context';
import { encryptionHttp } from '@/lib/server/encryption-request';
import {
  approveEncryptionEnrollment,
  beginEncryptionEnrollment,
  getEncryptionIdentity,
  proveEncryptionEnrollment,
  revokeEncryptionDevice,
} from '@/lib/server/encryption-devices';

const actionSchema = z
  .object({
    profileId: e2eeIdSchema,
    actorId: e2eeIdSchema,
    action: z.enum(['begin', 'prove', 'approve', 'revoke']),
    input: z.unknown(),
  })
  .strict();

export function GET(request: NextRequest) {
  return encryptionHttp(request, ({ scope }) => getEncryptionIdentity(scope));
}

export function POST(request: NextRequest) {
  return encryptionHttp(request, async ({ scope, body }) => {
    const value = encryptionInput(actionSchema, body);
    switch (value.action) {
      case 'begin':
        return beginEncryptionEnrollment(scope, value.input);
      case 'prove':
        return proveEncryptionEnrollment(scope, value.input);
      case 'approve':
        return approveEncryptionEnrollment(scope, value.input);
      case 'revoke':
        return revokeEncryptionDevice(scope, value.input);
    }
  });
}
