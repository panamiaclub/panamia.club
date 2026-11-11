import { NextRequest } from 'next/server';
import {
  encryptionHttp,
  encryptionTransport,
} from '@/lib/server/encryption-request';
import { readEncryptedRoom } from '@/lib/server/encryption-rooms';

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  return encryptionHttp(request, async (context) =>
    readEncryptedRoom(encryptionTransport(context), (await params).roomId)
  );
}
