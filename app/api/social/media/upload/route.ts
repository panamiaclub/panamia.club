/**
 * POST /api/social/media/upload
 *
 * Issues a presigned R2 PUT URL so the browser can upload video directly
 * to R2 — bypassing the Worker request body size limit for large files.
 *
 * Images continue to use /api/social/media (small enough to flow through the Worker).
 *
 * Note: requires R2 CORS policy to allow PUT from the app's origin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AwsClient } from 'aws4fetch';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { chatMediaRefusal } from '@/lib/server/chat-media-policy';

// video/webm is still accepted so an upload already in flight when this
// deployed does not 400; new uploads are all video/mp4.
const ALLOWED_TYPES = ['video/mp4', 'video/webm'];
const MAX_SIZE = 200 * 1024 * 1024; // 200 MB
const PRESIGN_TTL = 300; // seconds

const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');

function getR2Client(): AwsClient {
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    // R2 requires region "auto"; the S3-compatible API is the "s3" service.
    region: 'auto',
    service: 's3',
  });
}

// Encode each path segment but preserve the "/" separators in the object key.
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    filename?: string;
    contentType?: string;
    size?: number;
    purpose?: unknown;
    chatTarget?: unknown;
  };

  const { filename, contentType, size } = body;

  if (!filename || !contentType || typeof size !== 'number') {
    return NextResponse.json(
      { error: 'filename, contentType, and size are required' },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: `Unsupported type: ${contentType}` },
      { status: 400 }
    );
  }

  if (size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'File too large (max 200 MB)' },
      { status: 400 }
    );
  }
  const profile = await getActiveProfileWithActor(session.user.id);
  if (!profile?.socialActor)
    return NextResponse.json(
      { error: 'Social features are unavailable for this profile' },
      { status: 403 }
    );
  const refusal = await chatMediaRefusal(
    profile.socialActor.id,
    body.purpose,
    body.chatTarget
  );
  if (refusal)
    return NextResponse.json(
      { error: refusal.error },
      { status: refusal.status }
    );

  try {
    const client = getR2Client();
    const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const url = new URL(
      `${endpoint}/${process.env.R2_BUCKET_NAME}/${encodeKey(filename)}`
    );
    // Presigned query-auth URL. Only the URL/host is signed — the browser sets
    // Content-Type on the PUT (unsigned headers are allowed on presigned URLs),
    // and Content-Length is intentionally left out of the signature so the
    // browser's fetch-set length can't cause a SignatureDoesNotMatch.
    url.searchParams.set('X-Amz-Expires', String(PRESIGN_TTL));

    const signed = await client.sign(url.toString(), {
      method: 'PUT',
      aws: { signQuery: true },
    });

    return NextResponse.json({
      presignedUrl: signed.url,
      publicUrl: `${R2_PUBLIC_URL}/${filename}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
