/**
 * POST /api/crm/contact/subscribe
 *
 * Clears DND on all GHL channels for the authenticated user's contact record —
 * re-subscribing them to marketing communications after a previous opt-out.
 *
 * Counterpart to /api/crm/contact/unsubscribe. Degrades gracefully if GHL is
 * unavailable.
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
    console.warn(`[crm.subscribe] origin check failed: ${origin.reason}`);
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

  if (!profile.ghlContactId) {
    return NextResponse.json(
      { success: false, error: 'No GHL contact linked to this profile' },
      { status: 404 }
    );
  }

  const ghl = GhlClient.create();
  if (!ghl) {
    return NextResponse.json(
      {
        success: false,
        error: 'Could not reach HighLevel, please try again later.',
      },
      { status: 503 }
    );
  }

  // Re-subscribing implies the user wants future contact, so clear ghlOptedOut
  // alongside the GHL DND change. Without this, the CRM worker would refuse
  // to push future updates to this contact.
  await db
    .update(profiles)
    .set({ ghlOptedOut: false })
    .where(eq(profiles.id, profile.id));

  try {
    const [contact, smsSubscription] = await Promise.all([
      ghl.getContactById(profile.ghlContactId),
      db.query.smsSubscriptions.findFirst({
        where: eq(smsSubscriptions.profileId, profile.id),
      }),
    ]);
    await ghl.setDndChannels(profile.ghlContactId, {
      Email: false,
      SMS:
        smsSubscription?.status === 'active'
          ? false
          : contact.dndSettings?.SMS?.status === 'active' ||
            (contact.dnd === true &&
              contact.dndSettings?.SMS?.status === undefined),
      WhatsApp: false,
      Call: false,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(
      `[crm.subscribe] clearDndAll(${profile.ghlContactId}) failed:`,
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
