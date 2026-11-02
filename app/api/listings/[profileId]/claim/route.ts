import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { sendTemplateEmail } from '@/lib/email';
import { createClaimToken, maskEmail } from '@/lib/server/listing-claim';
import {
  canAdministerProfile,
  isProfileClaimed,
} from '@/lib/server/profile-owners';
import {
  getPublicListing,
  transformToLegacyFormat,
} from '@/lib/server/profile';
import { getEditableProfile } from '@/lib/server/active-profile';
import { listingPublicPath, listingReviewPath } from '@/lib/listing-url';
import type { ClaimListingContext } from '@/lib/listing-review';

/**
 * Request a claim link for an unclaimed listing.
 *
 * Sign-in is required first, because the end state is a profile_owners row and
 * that needs a user to point at. The account's own email is irrelevant to the
 * proof — what matters is that the requester can read the inbox on the
 * listing, so that is where the confirmation goes.
 */

interface RouteParams {
  params: Promise<{ profileId: string }>;
}

/**
 * Public claim status for a listing.
 *
 * Only the public preview and this viewer's management permission leave here.
 * Private contact and pending-owner fields never belong in the landing page.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { profileId } = await params;

  const session = await auth();
  let profile = await getPublicListing(profileId);
  if (!profile && session?.user?.id) {
    const managed = await getEditableProfile(session.user.id, profileId);
    if (managed) profile = transformToLegacyFormat(managed);
  }

  if (!profile) {
    return NextResponse.json(
      { error: 'That public business listing could not be found.' },
      { status: 404 }
    );
  }

  const address = profile.primary_address;
  const area = [address.city, address.state, address.zipcode]
    .filter(Boolean)
    .join(', ');
  const context: ClaimListingContext = {
    profileId: profile.id,
    name: profile.name,
    summary: profile.five_words || profile.details || '',
    imageUrl: profile.images.primaryCDN || null,
    publicPath: listingPublicPath({
      id: profile.id,
      screenname:
        typeof profile.screenname === 'string' ? profile.screenname : null,
    }),
    locationLabel: profile.onlineOnly
      ? address.zipcode
        ? `Online business - based near ZIP ${address.zipcode} (approximate)`
        : 'Online business - base ZIP not added'
      : area || 'Location not added yet',
    missingLocation: !address.zipcode,
    claimable: !(await isProfileClaimed(profile.id)),
    canManage: Boolean(
      session?.user?.id &&
      (await canAdministerProfile(session.user.id, profile.id))
    ),
    published: profile.active === true,
  };
  return NextResponse.json(context, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Sign in first so we know which account to attach this to.' },
      { status: 401 }
    );
  }

  try {
    const { profileId } = await params;

    const managed = await getEditableProfile(session.user.id, profileId);
    if (managed) {
      return NextResponse.json({
        success: true,
        alreadyOwned: true,
        profileId: managed.id,
        reviewPath: listingReviewPath(managed.id),
      });
    }

    if (!(await getPublicListing(profileId))) {
      return NextResponse.json(
        { error: 'That public business listing could not be found.' },
        { status: 404 }
      );
    }

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, profileId),
      columns: { id: true, name: true, email: true },
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'That listing no longer exists.' },
        { status: 404 }
      );
    }

    if (await isProfileClaimed(profile.id)) {
      return NextResponse.json(
        {
          error:
            'This listing already has an owner. If that should be you, contact us at hola@pana.social.',
        },
        { status: 409 }
      );
    }

    const token = await createClaimToken(profile.id, session.user.id);

    const claimUrl = new URL(
      '/listings/claim',
      process.env.NEXT_PUBLIC_HOST_URL
    );
    claimUrl.searchParams.set('token', token);
    claimUrl.searchParams.set('id', profile.id);

    await sendTemplateEmail(
      'listing.claim',
      {
        businessName: profile.name,
        claimUrl: claimUrl.toString(),
        requesterEmail: session.user.email,
      },
      profile.email
    );

    // The masked address tells the requester which inbox to open without
    // handing a business's contact email to anyone who can load this page.
    return NextResponse.json({
      success: true,
      sentTo: maskEmail(profile.email),
    });
  } catch (error) {
    console.error('[listings/claim] request failed', error);
    return NextResponse.json(
      { error: 'Could not send the claim email. Please try again.' },
      { status: 500 }
    );
  }
}
