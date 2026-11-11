import { NextRequest } from 'next/server';
import {
  encryptionScopeSchema,
  encryptionInput,
} from '@/lib/server/encryption-context';
import {
  encryptionHttp,
  encryptionTransport,
} from '@/lib/server/encryption-request';
import { deleteEncryptedMessage } from '@/lib/server/encryption-rooms';
import { invalidateEncryptedRoom } from '@/lib/server/encryption-notify';

export function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string; eventId: string }> }
) {
  return encryptionHttp(request, async (context) => {
    encryptionInput(encryptionScopeSchema, context.body);
    const { roomId, eventId } = await params;
    const result = await deleteEncryptedMessage(
      encryptionTransport(context),
      roomId,
      eventId
    );
    await invalidateEncryptedRoom(roomId, eventId, 'delete');
    return result;
  });
}
