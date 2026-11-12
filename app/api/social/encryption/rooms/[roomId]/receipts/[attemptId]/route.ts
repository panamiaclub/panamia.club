import { NextRequest } from 'next/server';
import {
  encryptionHttp,
  encryptionTransport,
} from '@/lib/server/encryption-request';
import { encryptedRoomReceipt } from '@/lib/server/encryption-rooms';

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string; attemptId: string }> }
) {
  return encryptionHttp(request, async (context) => {
    const { roomId, attemptId } = await params;
    return encryptedRoomReceipt(
      encryptionTransport(context),
      roomId,
      attemptId
    );
  });
}
