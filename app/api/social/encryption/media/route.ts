import { NextRequest } from 'next/server';
import {
  encryptionBody,
  encryptionHttp,
  encryptionTransport,
} from '@/lib/server/encryption-request';
import { reserveEncryptedMedia } from '@/lib/server/encryption-media';

export function POST(request: NextRequest) {
  return encryptionHttp(request, (context) =>
    reserveEncryptedMedia(encryptionTransport(context), encryptionBody(context))
  );
}
