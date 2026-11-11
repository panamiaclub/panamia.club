import { NextRequest } from 'next/server';
import {
  encryptionBody,
  encryptionHttp,
  encryptionTransport,
} from '@/lib/server/encryption-request';
import { restartEncryptedRoom } from '@/lib/server/encryption-rooms';

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  return encryptionHttp(request, async (context) =>
    restartEncryptedRoom(
      encryptionTransport(context),
      (await params).roomId,
      encryptionBody(context)
    )
  );
}
