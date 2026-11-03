import { NextRequest, NextResponse } from 'next/server';
import { inspectListingInvitation } from '@/lib/server/listing-invitations';
import {
  denyCrossOriginInvitationWrite,
  invitationHeaders,
  readInvitationContext,
  setInvitationContext,
} from '@/lib/server/listing-invitation-request';

/** Preserve inbox proof through sign-in; do not consume it or create an account. */
export async function POST(request: NextRequest) {
  const denied = denyCrossOriginInvitationWrite(request);
  if (denied) return denied;
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json(
      { error: 'Please open the original invitation link.' },
      { status: 400, headers: invitationHeaders }
    );
  }
  const context = readInvitationContext(await request.json().catch(() => null));
  if (!context) {
    return NextResponse.json(
      {
        code: 'invalid_invitation',
        error:
          'This invitation link is missing its business or proof. Open the original link from the business inbox.',
      },
      { status: 400, headers: invitationHeaders }
    );
  }
  try {
    const result = await inspectListingInvitation(
      context.profileId,
      context.token
    );
    if ('success' in result) {
      return NextResponse.json(
        { code: result.code, error: result.error },
        { status: result.status, headers: invitationHeaders }
      );
    }
    const response = NextResponse.json(result, { headers: invitationHeaders });
    setInvitationContext(response, context);
    return response;
  } catch (error) {
    console.error('[listings/invitations] context lookup failed', error);
    return NextResponse.json(
      { error: 'Could not check this invitation. Please try again.' },
      { status: 500, headers: invitationHeaders }
    );
  }
}
