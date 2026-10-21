/**
 * POST /api/crm/contact/unsubscribe
 *
 * Sets DND (Do Not Disturb) on all GHL channels for the authenticated user's
 * contact record — effectively unsubscribing them from all marketing communications.
 *
 * The contact record is NOT deleted. Use DELETE /api/crm/contact to delete it.
 * Degrades gracefully if GHL is unavailable.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles, smsSubscriptions } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { GhlClient } from '@/lib/ghl';
import { checkSameOrigin } from '@/lib/csrf';

export async function POST(request: Request) {
  const origin = checkSameOrigin(request);
  if (!origin.ok) {
    console.warn(`[crm.unsubscribe] origin check failed: ${origin.reason}`);
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.user.id),
    columns: { id: true, ghlContactId: true },
  });

  if (!profile) {
    return NextResponse.json(
      { success: false, error: 'Profile not found' },
      { status: 404 }
    );
  }

  const now = new Date();
  await db
    .update(smsSubscriptions)
    .set({
      status: 'opted_out',
      optedOutAt: now,
      syncedAt: null,
      syncError: null,
      updatedAt: now,
    })
    .where(eq(smsSubscriptions.profileId, profile.id));

  if (!profile.ghlContactId) {
    return NextResponse.json({ success: true });
  }

  const ghl = GhlClient.create();
  if (!ghl) {
    await db
      .update(smsSubscriptions)
      .set({
        syncError: 'HighLevel is not configured.',
        updatedAt: new Date(),
      })
      .where(eq(smsSubscriptions.profileId, profile.id));
    return NextResponse.json(
      {
        success: false,
        error: 'Could not reach HighLevel, please try again later.',
      },
      { status: 503 }
    );
  }

  try {
    await ghl.setDndAll(profile.ghlContactId);
    await db
      .update(smsSubscriptions)
      .set({
        syncedAt: new Date(),
        syncError: null,
        updatedAt: new Date(),
      })
      .where(eq(smsSubscriptions.profileId, profile.id));
    return NextResponse.json({ success: true });
  } catch (error) {
    await db
      .update(smsSubscriptions)
      .set({
        syncError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'HighLevel opt-out failed',
        updatedAt: new Date(),
      })
      .where(eq(smsSubscriptions.profileId, profile.id));
    return NextResponse.json(
      {
        success: false,
        error: 'Could not reach HighLevel, please try again later.',
      },
      { status: 503 }
    );
  }
}
