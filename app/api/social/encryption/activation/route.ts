import { NextRequest } from 'next/server';
import {
  encryptionBody,
  encryptionHttp,
  encryptionTransport,
} from '@/lib/server/encryption-request';
import { activateProfileEncryption } from '@/lib/server/encryption-recovery';

export function POST(request: NextRequest) {
  return encryptionHttp(request, (context) =>
    activateProfileEncryption(
      encryptionTransport(context),
      encryptionBody(context)
    )
  );
}
