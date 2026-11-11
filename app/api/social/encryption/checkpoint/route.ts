import { NextRequest } from 'next/server';
import {
  encryptionBody,
  encryptionHttp,
  encryptionTransport,
} from '@/lib/server/encryption-request';
import { checkpointEncryptionState } from '@/lib/server/encryption-devices';

export function POST(request: NextRequest) {
  return encryptionHttp(request, (context) => {
    const { scope, proof, expected } = encryptionTransport(context);
    return checkpointEncryptionState(
      scope,
      proof,
      expected,
      encryptionBody(context)
    );
  });
}
