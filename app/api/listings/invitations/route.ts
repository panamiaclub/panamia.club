import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listingReviewPath } from '@/lib/listing-url';
import { getEditableProfile } from '@/lib/server/active-profile';
import { prepareClaimedListing } from '@/lib/server/claimed-listing';
import {
  acceptListingInvitation,
  inspectListingInvitation,
} from '@/lib/server/listing-invitations';
import {
  clearInvitationContext,
  denyCrossOriginInvitationWrite,
  invitationContext,
  invitationHeaders,
} from '@/lib/server/listing-invitation-request';

function failure(code: string, error: string, status: number) {
  return NextResponse.json(
    { code, error },
    { status, headers: invitationHeaders }
  );
}

export async function GET(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get('profileId');
  if (!profileId)
    return failure('missing_listing', 'No business selected.', 400);
  try {
    const session = await auth();
    const context = invitationContext(request);
    const result = await inspectListingInvitation(
      profileId,
      context?.profileId === profileId ? context.token : null,
      session?.user?.id
    );
    if ('success' in result)
      return failure(result.code, result.error, result.status);
    return NextResponse.json(result, { headers: invitationHeaders });
  } catch (error) {
    console.error('[listings/invitations] inspection failed', error);
    return failure(
      'lookup_failed',
      'Could not check this invitation. Please try again.',
      500
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = denyCrossOriginInvitationWrite(request);
  if (denied) return denied;
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return failure(
      'signin_required',
      'Sign in with your chosen Pana account before confirming.',
      401
    );
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return failure(
      'invalid_confirmation',
      'Please confirm this business from the invitation page.',
      400
    );
  }
  const body: unknown = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !('profileId' in body) ||
    typeof body.profileId !== 'string' ||
    !body.profileId ||
    !('action' in body) ||
    body.action !== 'accept'
  )
    return failure(
      'invalid_confirmation',
      'Please explicitly confirm the business you want to claim.',
      400
    );
  if (
    !('expectedOwnerId' in body) ||
    body.expectedOwnerId !== session.user.id ||
    !('expectedOwnerEmail' in body) ||
    typeof body.expectedOwnerEmail !== 'string' ||
    body.expectedOwnerEmail.trim().toLowerCase() !==
      session.user.email.trim().toLowerCase()
  ) {
    return failure(
      'account_changed',
      'Your sign-in changed. Reload and confirm the account you want to use.',
      409
    );
  }
  try {
    const owned = await getEditableProfile(session.user.id, body.profileId);
    if (owned) {
      return NextResponse.json(
        {
          success: true,
          profileId: owned.id,
          reviewPath: listingReviewPath(owned.id),
        },
        { headers: invitationHeaders }
      );
    }
    const context = invitationContext(request);
    if (!context || context.profileId !== body.profileId) {
      return failure(
        'invitation_context_changed',
        'This browser no longer has the invitation for this business. Reopen the original link in the browser where you signed in.',
        409
      );
    }
    const result = await acceptListingInvitation(
      body.profileId,
      context.token,
      session.user.id
    );
    if (!result.success)
      return failure(result.code, result.error, result.status);
    await prepareClaimedListing(result.profileId, result.screenname);
    const response = NextResponse.json(
      {
        success: true,
        profileId: result.profileId,
        reviewPath: listingReviewPath(result.profileId),
      },
      { headers: invitationHeaders }
    );
    clearInvitationContext(response);
    return response;
  } catch (error) {
    console.error('[listings/invitations] acceptance failed', error);
    return failure(
      'acceptance_failed',
      'Could not confirm ownership. Please try again.',
      500
    );
  }
}
