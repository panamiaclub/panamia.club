import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { consumeClaimToken } from '@/lib/server/listing-claim';
import { claimUnownedProfile } from '@/lib/server/profile-owners';
import { prepareClaimedListing } from '@/lib/server/claimed-listing';
import { getEditableProfile } from '@/lib/server/active-profile';
import { listingReviewPath } from '@/lib/listing-url';

/**
 * Redeem a claim token.
 *
 * Grants ownership through profile_owners and deliberately does NOT touch
 * profiles.userId: claiming a business must not overwrite the claimant's own
 * identity profile, and leaving userId null is what allows the same human to
 * claim a second listing later.
 *
 * Also provisions the listing's social actor so its Updates section works from
 * the moment it is claimed.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        code: 'signin_required',
        error: 'Sign in to finish claiming this listing.',
      },
      { status: 401 }
    );
  }

  try {
    const body: unknown = await request.json().catch(() => null);

    const token =
      body &&
      typeof body === 'object' &&
      'token' in body &&
      typeof body.token === 'string'
        ? body.token.trim()
        : '';
    if (!token) {
      return NextResponse.json(
        { code: 'missing_token', error: 'That link is missing its token.' },
        { status: 400 }
      );
    }

    const target = await consumeClaimToken(token, session.user.id);
    if (target.outcome === 'invalid') {
      return NextResponse.json(
        {
          code: 'invalid_token',
          error:
            'This link has expired or already been used. Request a new one from the listing.',
        },
        { status: 400 }
      );
    }

    // The token is bound to the account that requested it. Opening the email
    // while signed in as someone else must not hand them the business.
    if (target.outcome === 'wrong-account') {
      return NextResponse.json(
        {
          code: 'wrong_account',
          error:
            'This link was issued to a different account. Sign in with the account that requested it.',
        },
        { status: 403 }
      );
    }

    const result = await claimUnownedProfile(target.profileId, session.user.id);

    if (result.outcome === 'not-found') {
      return NextResponse.json(
        { error: 'That listing no longer exists.' },
        { status: 404 }
      );
    }

    // Re-checked after redemption rather than before, because two people can
    // hold valid tokens for the same listing at once; whoever confirms first
    // wins and the loser gets told, instead of silently becoming a co-owner.
    if (result.outcome === 'already-claimed') {
      const owned = await getEditableProfile(session.user.id, target.profileId);
      if (owned) {
        return NextResponse.json({
          success: true,
          profileId: owned.id,
          businessName: owned.name,
          reviewPath: listingReviewPath(owned.id),
        });
      }
      return NextResponse.json(
        {
          code: 'already_claimed',
          error:
            'Someone else claimed this listing first. Contact us at hola@pana.social if that is wrong.',
        },
        { status: 409 }
      );
    }

    const profile = { id: target.profileId, name: result.name };
    await prepareClaimedListing(profile.id, result.screenname);

    return NextResponse.json({
      success: true,
      profileId: profile.id,
      businessName: profile.name,
      reviewPath: listingReviewPath(profile.id),
    });
  } catch (error) {
    console.error('[listings/claim/verify] failed', error);
    return NextResponse.json(
      { error: 'Could not complete the claim. Please try again.' },
      { status: 500 }
    );
  }
}
