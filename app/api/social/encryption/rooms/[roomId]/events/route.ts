import { NextRequest } from 'next/server';
import {
  encryptionBody,
  encryptionHttp,
  encryptionTransport,
} from '@/lib/server/encryption-request';
import {
  readEncryptedRoomEvents,
  submitEncryptedRoomEvent,
} from '@/lib/server/encryption-rooms';
import { invalidateEncryptedRoom } from '@/lib/server/encryption-notify';

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  return encryptionHttp(request, async (context) =>
    readEncryptedRoomEvents(
      encryptionTransport(context),
      (await params).roomId,
      Number(request.nextUrl.searchParams.get('after') ?? '0'),
      Number(request.nextUrl.searchParams.get('limit') ?? '100')
    )
  );
}

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  return encryptionHttp(
    request,
    async (context) => {
      const roomId = (await params).roomId;
      const receipt = await submitEncryptedRoomEvent(
        encryptionTransport(context),
        roomId,
        encryptionBody(context)
      );
      await invalidateEncryptedRoom(
        roomId,
        receipt.id,
        receipt.kind === 'commit' ? 'membership' : 'message'
      );
      return receipt;
    },
    3 * 1024 * 1024
  );
}
