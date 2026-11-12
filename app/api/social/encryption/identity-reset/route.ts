import { NextRequest } from 'next/server';
import {
  encryptionBody,
  encryptionHttp,
} from '@/lib/server/encryption-request';
import { resetEncryptionIdentity } from '@/lib/server/encryption-identity-reset';

export function POST(request: NextRequest) {
  return encryptionHttp(
    request,
    (context) =>
      resetEncryptionIdentity(context.scope, encryptionBody(context)),
    128 * 1024
  );
}
