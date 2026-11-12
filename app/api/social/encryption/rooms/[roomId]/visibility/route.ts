import { NextRequest } from 'next/server';
import {
  encryptionHttp,
  encryptionTransport,
} from '@/lib/server/encryption-request';
import { encryptedMessageVisibility } from '@/lib/server/encryption-rooms';

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  return encryptionHttp(request, async (context) =>
    encryptedMessageVisibility(
      encryptionTransport(context),
      (await params).roomId,
      request.nextUrl.searchParams.get('ids')?.split(',') ?? []
    )
  );
}
