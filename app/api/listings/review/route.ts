import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  listingReviewState,
  confirmListingReview,
  stopOwnedListingReminders,
  allowListingReminders,
  type RefreshFailure,
} from '@/lib/server/listing-refresh';
import {
  invitationHeaders,
  denyCrossOriginInvitationWrite,
} from '@/lib/server/listing-invitation-request';

const failure = (
  error: string,
  status: number,
  requirement?: Pick<RefreshFailure, 'field' | 'step'>
) =>
  NextResponse.json(
    { success: false, error, ...requirement },
    { status, headers: invitationHeaders }
  );

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return failure('Sign in to review this business.', 401);
  const profileId = request.nextUrl.searchParams.get('profileId');
  if (!profileId) return failure('No business selected.', 400);
  try {
    const state = await listingReviewState(session.user.id, profileId);
    return 'success' in state
      ? failure(state.error, state.status)
      : NextResponse.json(state, { headers: invitationHeaders });
  } catch (error) {
    console.error('[listing-review] state lookup failed', error);
    return failure('Could not load your review status.', 500);
  }
}

export async function POST(request: NextRequest) {
  const denied = denyCrossOriginInvitationWrite(request);
  if (denied) return denied;
  const session = await auth();
  if (!session?.user?.id || !session.user.email)
    return failure('Sign in to confirm this business.', 401);
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return failure('Please provide a review confirmation.', 400);
  const data = body as Record<string, unknown>;
  if (
    typeof data.profileId !== 'string' ||
    !data.profileId ||
    (data.cycleId !== null && typeof data.cycleId !== 'string')
  )
    return failure('Select the business and current review cycle.', 400);
  if (
    data.expectedOwnerId !== session.user.id ||
    typeof data.expectedOwnerEmail !== 'string' ||
    data.expectedOwnerEmail.trim().toLowerCase() !==
      session.user.email.trim().toLowerCase()
  ) {
    return failure(
      'Your sign-in changed. Reload and confirm your account again.',
      409
    );
  }
  try {
    const result =
      data.action === 'confirm' && data.confirmed === true
        ? await confirmListingReview(
            session.user.id,
            data.profileId,
            data.cycleId
          )
        : data.action === 'stop_reminders'
          ? await stopOwnedListingReminders(
              session.user.id,
              data.profileId,
              data.cycleId
            )
          : data.action === 'allow_reminders'
            ? await allowListingReminders(session.user.id, data.profileId)
            : null;
    if (!result)
      return failure(
        'Explicitly confirm the listing or choose a reminder preference.',
        400
      );
    return result.success
      ? NextResponse.json(result, { headers: invitationHeaders })
      : failure(result.error, result.status, {
          field: result.field,
          step: result.step,
        });
  } catch (error) {
    console.error('[listing-review] confirmation failed', error);
    return failure(
      'Could not save the review. Please reload and try again.',
      500
    );
  }
}
