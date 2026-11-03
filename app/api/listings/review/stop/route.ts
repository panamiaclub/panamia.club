import { NextRequest, NextResponse } from 'next/server';
import { stopListingReminders } from '@/lib/server/listing-refresh';
import {
  invitationHeaders,
  denyCrossOriginInvitationWrite,
} from '@/lib/server/listing-invitation-request';

export async function POST(request: NextRequest) {
  const denied = denyCrossOriginInvitationWrite(request);
  if (denied) return denied;
  const body: unknown = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== 'object' ||
    !('cycleId' in body) ||
    typeof body.cycleId !== 'string' ||
    !('token' in body) ||
    typeof body.token !== 'string' ||
    !('action' in body) ||
    body.action !== 'stop'
  ) {
    return NextResponse.json(
      { error: 'Open the original stop-reminders link.' },
      { status: 400, headers: invitationHeaders }
    );
  }
  try {
    const result = await stopListingReminders(body.cycleId, body.token);
    return NextResponse.json(result, {
      status: result.success ? 200 : result.status,
      headers: invitationHeaders,
    });
  } catch (error) {
    console.error('[listing-review] opt-out failed', error);
    return NextResponse.json(
      { error: 'Could not stop reminders. Please try again.' },
      { status: 500, headers: invitationHeaders }
    );
  }
}
