/**
 * GET /api/social/actors/me - Prepare and get the current user's actor
 * POST /api/social/actors/me - Idempotent setup for older clients
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createActorForProfile, canCreateSocialActor } from '@/lib/federation';
import { toPublicActor } from '@/lib/schema';
import {
  getActiveProfile,
  getActiveProfileWithActor,
} from '@/lib/server/active-profile';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const profile = await getActiveProfileWithActor(session.user.id);

  if (!profile) {
    return NextResponse.json({
      success: true,
      data: {
        actor: null,
        eligible: false,
        reason: 'No profile found',
      },
    });
  }

  const gateResult = canCreateSocialActor(profile);

  return NextResponse.json({
    success: true,
    data: {
      actor: profile.socialActor ? toPublicActor(profile.socialActor) : null,
      eligible: gateResult.allowed,
      reason: gateResult.reason,
      // Profile-first: a business listing owns its handle and has no user.
      screenname: (profile.screenname ?? profile.user?.screenname)?.trim(),
      profileId: profile.id,
      profileName: profile.name,
    },
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Retain the same ownership boundary for clients using explicit setup.
  const profile = await getActiveProfile(session.user.id);

  if (!profile) {
    return NextResponse.json(
      { success: false, error: 'No profile found' },
      { status: 400 }
    );
  }

  const result = await createActorForProfile(profile.id);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error, gateResult: result.gateResult },
      { status: 403 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { actor: result.actor },
  });
}
