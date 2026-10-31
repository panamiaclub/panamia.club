import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { listingPublicPath } from '@/lib/listing-url';
import { selectActiveProfile } from '@/lib/server/active-profile';
import {
  BUSINESS_INTAKE_SOURCE,
  canAdministerProfile,
  isProfileClaimed,
} from '@/lib/server/profile-owners';
import { acceptPendingInvitation } from '@/lib/server/pending-listing-owner';
import { revalidatePublicListing } from '@/lib/server/profile';
import { createActorForProfile } from '@/lib/federation';

const privateHeaders = { 'Cache-Control': 'private, no-store' };

function failure(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: privateHeaders });
}

async function setupListing(userId: string, email: string, profileId: string) {
  const owned = await canAdministerProfile(userId, profileId);
  const profile = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      isNull(profiles.userId),
      sql`${profiles.status}->>'source' = ${BUSINESS_INTAKE_SOURCE}`,
      owned
        ? undefined
        : eq(profiles.pendingOwnerEmail, email.trim().toLowerCase())
    ),
    columns: {
      id: true,
      name: true,
      screenname: true,
      active: true,
      status: true,
    },
  });
  if (!profile) return null;
  return { profile, owned };
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return failure('Sign in to finish your business setup.', 401);
  }
  const profileId = new URL(request.url).searchParams.get('profileId');
  if (!profileId) return failure('No business selected.', 400);
  try {
    const target = await setupListing(
      session.user.id,
      session.user.email,
      profileId
    );
    if (!target) {
      return failure(
        'This business setup invitation is not for this account.',
        403
      );
    }
    if (!target.owned && (await isProfileClaimed(profileId))) {
      return failure(
        'This business is already managed by another account.',
        409
      );
    }
    const review = target.profile.status as {
      approved?: string;
      declined?: string;
      published?: string;
    } | null;
    return NextResponse.json(
      {
        name: target.profile.name,
        profileId,
        state: target.owned ? 'owned' : 'confirm',
        active: target.profile.active,
        reviewState: target.profile.active
          ? 'approved'
          : review?.declined
            ? 'declined'
            : review?.approved || review?.published
              ? 'inactive'
              : 'pending',
        publicPath: target.profile.active
          ? listingPublicPath(target.profile)
          : null,
      },
      { headers: privateHeaders }
    );
  } catch (error) {
    console.error('[listings/setup] lookup failed', error);
    return failure(
      'Could not load your business setup. Please try again.',
      500
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return failure('Sign in to finish your business setup.', 401);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure('Could not read that confirmation.', 400);
  }
  const profileId =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).profileId
      : null;
  if (typeof profileId !== 'string' || !profileId) {
    return failure('No business selected.', 400);
  }
  const expectedOwnerId = (body as Record<string, unknown>).expectedOwnerId;
  if (expectedOwnerId !== session.user.id) {
    return failure(
      'Your sign-in changed. Reload and confirm your account again.',
      409
    );
  }
  try {
    const target = await setupListing(
      session.user.id,
      session.user.email,
      profileId
    );
    if (!target) {
      return failure(
        'This business setup invitation is not for this account.',
        403
      );
    }
    if (!target.owned) {
      const outcome = await acceptPendingInvitation(
        session.user.id,
        session.user.email,
        profileId
      );
      if (outcome !== 'accepted') {
        return failure(
          outcome === 'already-claimed'
            ? 'This business is already managed by another account.'
            : 'This setup invitation is no longer available.',
          outcome === 'already-claimed' ? 409 : 403
        );
      }
    }
    revalidatePublicListing(profileId, target.profile.screenname);
    if (target.profile.screenname) {
      try {
        const actor = await createActorForProfile(profileId);
        if (!actor.success)
          console.warn('[listings/setup] actor unavailable', {
            profileId,
            error: actor.error,
          });
      } catch (error) {
        console.error(
          '[listings/setup] ownership confirmed but actor setup failed',
          error
        );
      }
    }
    const response = NextResponse.json(
      {
        success: true,
        profileId,
        next: '/account/profile/edit',
      },
      { headers: privateHeaders }
    );
    selectActiveProfile(response, profileId);
    return response;
  } catch (error) {
    console.error('[listings/setup] confirmation failed', error);
    return failure(
      'Could not open your business dashboard. Please reload and try again.',
      500
    );
  }
}
