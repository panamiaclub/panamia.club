import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { consumeClaimToken } from '@/lib/server/listing-claim';
import { claimUnownedProfile } from '@/lib/server/profile-owners';
import { createActorForProfile } from '@/lib/federation';
import { revalidatePublicListing } from '@/lib/server/profile';

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
      { error: 'Sign in to finish claiming this listing.' },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      token?: string;
    } | null;

    const token = body?.token?.trim();
    if (!token) {
      return NextResponse.json(
        { error: 'That link is missing its token.' },
        { status: 400 }
      );
    }

    const target = await consumeClaimToken(token);
    if (!target) {
      return NextResponse.json(
        {
          error:
            'This link has expired or already been used. Request a new one from the listing.',
        },
        { status: 400 }
      );
    }

    // The token is bound to the account that requested it. Opening the email
    // while signed in as someone else must not hand them the business.
    if (target.userId !== session.user.id) {
      return NextResponse.json(
        {
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
      return NextResponse.json(
        {
          error:
            'Someone else claimed this listing first. Contact us at hola@pana.social if that is wrong.',
        },
        { status: 409 }
      );
    }

    const profile = { id: target.profileId, name: result.name };
    revalidatePublicListing(profile.id, result.screenname);

    // Prepare the listing's social identity at claim time, without waiting for
    // the owner to visit /s as the business. Claiming is the consent signal, and
    // the row federates nothing until the owner actually posts.
    //
    // Deliberately isolated from the outer catch: ownership is already
    // committed by this point, so letting an actor failure surface as a 500
    // would tell the owner the claim failed and send them back into a retry
    // that can only 409. A listing with no handle simply gets no actor.
    try {
      const actorResult = await createActorForProfile(profile.id);
      if (!actorResult.success) {
        console.warn(
          '[listings/claim/verify] no actor for profile %s: %s',
          profile.id,
          actorResult.error
        );
      }
    } catch (actorError) {
      console.error(
        '[listings/claim/verify] actor creation failed for profile %s',
        profile.id,
        actorError
      );
    }

    return NextResponse.json({
      success: true,
      profileId: profile.id,
      businessName: profile.name,
    });
  } catch (error) {
    console.error('[listings/claim/verify] failed', error);
    return NextResponse.json(
      { error: 'Could not complete the claim. Please try again.' },
      { status: 500 }
    );
  }
}
