import { createId } from '@paralleldrive/cuid2';
import { NextRequest, NextResponse } from 'next/server';

import { storage } from '@/lib/r2';
import { checkAdminAuth } from '@/lib/server/admin-auth';

const MAX_SIZE = 8 * 1024 * 1024;
const TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);

export async function POST(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Image file is required' },
      { status: 400 }
    );
  }
  const extension = TYPES.get(file.type);
  if (!extension) {
    return NextResponse.json(
      { error: 'Use a JPEG, PNG, WebP, or AVIF image' },
      { status: 415 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'Images must be 8 MB or smaller' },
      { status: 413 }
    );
  }

  const key = `shop/products/${createId()}.${extension}`;
  await storage.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  const baseUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    return NextResponse.json(
      { error: 'R2_PUBLIC_URL is not configured' },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true, url: `${baseUrl}/${key}` });
}
