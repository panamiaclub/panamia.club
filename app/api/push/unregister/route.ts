/**
 * UNREGISTER DEVICE FROM PUSH — POST
 *
 * Called on sign-out, before the session is torn down. Without this a device
 * keeps receiving notifications for an account nobody is signed into on it —
 * which on a shared or handed-down phone means the previous member's alerts,
 * including message previews, on somebody else's lock screen.
 *
 * Best-effort by nature: sign-out must succeed even if this call does not.
 * The protections for the case where it fails live elsewhere — registration
 * reassigns a token to its new owner (lib/push/tokens.ts), and dead tokens
 * are pruned on send (lib/push/index.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { unregisterDeviceToken } from '@/lib/push';

const unregistrationSchema = z.object({
  token: z.string().trim().min(1).max(4096),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const parsed = unregistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'A token (up to 4096 characters) is required' },
      { status: 400 }
    );
  }

  const { token } = parsed.data;
  try {
    await unregisterDeviceToken(session.user.id, token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[push] device unregistration failed', error);
    return NextResponse.json(
      { error: 'Could not unregister device' },
      { status: 500 }
    );
  }
}
