import { NextRequest } from 'next/server';
import {
  encryptionBody,
  encryptionHttp,
  encryptionTransport,
} from '@/lib/server/encryption-request';
import {
  listEncryptionBackups,
  uploadEncryptionBackup,
} from '@/lib/server/encryption-recovery';

export function GET(request: NextRequest) {
  return encryptionHttp(request, ({ scope }) =>
    listEncryptionBackups(
      scope,
      request.nextUrl.searchParams.get('cursor') ?? undefined
    )
  );
}
export function POST(request: NextRequest) {
  return encryptionHttp(
    request,
    (context) =>
      uploadEncryptionBackup(
        encryptionTransport(context),
        encryptionBody(context)
      ),
    24 * 1024 * 1024
  );
}
