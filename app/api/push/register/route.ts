/**
 * REGISTER DEVICE FOR PUSH — POST
 *
 * Called by components/mobile/PushRegistration.tsx once the native shell has
 * a token from APNs or FCM. Associates that device with the signed-in member
 * so notifications can reach it.
 *
 * Called on every app launch, not only the first. Push tokens are rotated by
 * the operating system without warning — on restore from backup, on some OS
 * upgrades, after a long period uninstalled — and re-registering is the only
 * way to notice. Repeat calls for an unchanged token are cheap: they refresh
 * `lastSeenAt` and nothing else.
 *
 * The upsert this performs reassigns a device from one account to another
 * rather than adding a second row. See lib/push/tokens.ts for why that
 * matters when a handset is shared.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { registerDeviceToken } from '@/lib/push';

const registrationSchema = z.object({
  token: z.string().trim().min(1).max(4096),
  platform: z.enum(['ios', 'android']),
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

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          'A token (up to 4096 characters) and ios/android platform are required',
      },
      { status: 400 }
    );
  }

  const { token, platform } = parsed.data;
  try {
    await registerDeviceToken(session.user.id, token, platform);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[push] device registration failed', error);
    return NextResponse.json(
      { error: 'Could not register device' },
      { status: 500 }
    );
  }
}
