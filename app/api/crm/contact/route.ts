/**
 * GET  /api/crm/contact — fetch the authenticated user's GHL contact record
 * DELETE /api/crm/contact — delete GHL contact + set ghlOptedOut=true on profile
 *
 * Both routes degrade gracefully when GHL is unavailable or unconfigured.
 * GHL is never a hard dependency for core app function.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles, smsSubscriptions } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { GhlClient } from '@/lib/ghl';
import { checkSameOrigin } from '@/lib/csrf';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.user.id),
    columns: { id: true, ghlContactId: true, ghlOptedOut: true },
  });

  if (!profile) {
    return NextResponse.json(
      { success: false, error: 'Profile not found' },
      { status: 404 }
    );
  }

  if (!profile.ghlContactId) {
    return NextResponse.json({ success: true, data: null });
  }

  const ghl = GhlClient.create();
  if (!ghl) {
    console.warn(
      '[crm.GET] GhlClient.create() returned null — GHL_API_KEY or GHL_LOCATION_ID not set in runtime'
    );
    return NextResponse.json(
      {
        success: false,
        error: 'Could not reach HighLevel, please try again later.',
      },
      { status: 503 }
    );
  }

  try {
    const contact = await ghl.getContactById(profile.ghlContactId);
    return NextResponse.json({ success: true, data: contact });
  } catch (err) {
    console.error(
      `[crm.GET] getContactById(${profile.ghlContactId}) failed:`,
      err
    );
    return NextResponse.json(
      {
        success: false,
        error: 'Could not reach HighLevel, please try again later.',
      },
      { status: 503 }
    );
  }
}

export async function DELETE(request: Request) {
  const origin = checkSameOrigin(request);
  if (!origin.ok) {
    console.warn(`[crm.DELETE] origin check failed: ${origin.reason}`);
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

  // Always set ghlOptedOut regardless of whether the GHL delete succeeds,
  // so the CRM worker never recreates this contact.
  await db.transaction(async (tx) => {
    await tx
      .delete(smsSubscriptions)
      .where(eq(smsSubscriptions.profileId, profile.id));
    await tx
      .update(profiles)
      .set({ ghlOptedOut: true, ghlContactId: null })
      .where(eq(profiles.id, profile.id));
  });

  if (!profile.ghlContactId) {
    return NextResponse.json({ success: true });
  }

  const ghl = GhlClient.create();
  if (!ghl) {
    // ghlOptedOut is already set; GHL deletion will be handled manually.
    return NextResponse.json({ success: true });
  }

  try {
    await ghl.deleteContact(profile.ghlContactId);
  } catch {
    // Best-effort. ghlOptedOut is already set so the worker won't recreate the contact.
  }

  return NextResponse.json({ success: true });
}
