import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { sendTemplateEmail } from '@/lib/email';
import { createClaimToken, maskEmail } from '@/lib/server/listing-claim';
import { isProfileClaimed } from '@/lib/server/profile-owners';

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
 * Returns only the name — which is already public in the directory — and
 * whether it can still be claimed, so the start page can address the owner by
 * their business without exposing the contact email to passers-by.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { profileId } = await params;

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { id: true, name: true },
  });

  if (!profile) {
    return NextResponse.json(
      { error: 'That listing no longer exists.' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    name: profile.name,
    claimable: !(await isProfileClaimed(profile.id)),
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
            'This listing already has an owner. If that should be you, contact us at hola@panamia.club.',
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
