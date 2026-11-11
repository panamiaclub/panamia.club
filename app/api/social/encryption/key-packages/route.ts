import { NextRequest } from 'next/server';
import { z } from 'zod';
import { e2eeIdSchema } from '@/lib/e2ee/identity-contract';
import { encryptionInput } from '@/lib/server/encryption-context';
import {
  encryptionHttp,
  requireDeviceProof,
} from '@/lib/server/encryption-request';
import { uploadEncryptionKeyPackages } from '@/lib/server/encryption-devices';

const inputSchema = z
  .object({
    profileId: e2eeIdSchema,
    actorId: e2eeIdSchema,
    input: z.unknown(),
  })
  .strict();

export function POST(request: NextRequest) {
  return encryptionHttp(
    request,
    (context) => {
      const value = encryptionInput(inputSchema, context.body);
      return uploadEncryptionKeyPackages(
        context.scope,
        requireDeviceProof(context),
        context.expected,
        value.input
      );
    },
    3 * 1024 * 1024
  );
}
