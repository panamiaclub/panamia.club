import { NextRequest } from 'next/server';
import {
  encryptionHttp,
  encryptionTransport,
} from '@/lib/server/encryption-request';
import {
  discardEncryptedMedia,
  readEncryptedMedia,
  uploadEncryptedMedia,
} from '@/lib/server/encryption-media';
import {
  encryptionFail,
  encryptionInput,
  encryptionScopeSchema,
} from '@/lib/server/encryption-context';
import { E2EE_MAX_MEDIA_BYTES } from '@/lib/e2ee/crypto-format';

type Params = { params: Promise<{ mediaId: string }> };
export function GET(request: NextRequest, { params }: Params) {
  return encryptionHttp(request, async (context) =>
    readEncryptedMedia(
      encryptionTransport(context),
      (await params).mediaId,
      request.nextUrl.searchParams.get('backupId') ?? undefined
    )
  );
}
export function PUT(request: NextRequest, { params }: Params) {
  return encryptionHttp(
    request,
    async (context) => {
      if (!(context.body instanceof Uint8Array))
        encryptionFail(
          400,
          'BINARY_REQUIRED',
          'Send only encrypted attachment bytes.'
        );
      return uploadEncryptedMedia(
        encryptionTransport(context),
        (await params).mediaId,
        context.body
      );
    },
    E2EE_MAX_MEDIA_BYTES + 16,
    true
  );
}
export function DELETE(request: NextRequest, { params }: Params) {
  return encryptionHttp(request, async (context) => {
    encryptionInput(encryptionScopeSchema, context.body);
    return discardEncryptedMedia(
      encryptionTransport(context),
      (await params).mediaId
    );
  });
}
