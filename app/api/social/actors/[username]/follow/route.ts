/**
 * POST /api/social/actors/[username]/follow - Follow an actor
 * DELETE /api/social/actors/[username]/follow - Unfollow an actor
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import {
  getActorByScreenname,
  createFollow,
  deleteFollow,
} from '@/lib/federation';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { username } = await params;

  // Get target actor
  const targetActor = await getActorByScreenname(username);
  if (!targetActor) {
    return NextResponse.json(
      { success: false, error: 'Actor not found' },
      { status: 404 }
    );
  }

  // Get current user's actor
  const profile = await getActiveProfileWithActor(session.user.id);

  if (!profile?.socialActor) {
    return NextResponse.json(
      {
        success: false,
        error: 'Social features are unavailable for this profile',
      },
      { status: 403 }
    );
  }

  const result = await createFollow(profile.socialActor.id, targetActor.id);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error, gateResult: result.gateResult },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { follow: result.follow },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { username } = await params;

  // Get target actor
  const targetActor = await getActorByScreenname(username);
  if (!targetActor) {
    return NextResponse.json(
      { success: false, error: 'Actor not found' },
      { status: 404 }
    );
  }

  // Get current user's actor
  const profile = await getActiveProfileWithActor(session.user.id);

  if (!profile?.socialActor) {
    return NextResponse.json(
      {
        success: false,
        error: 'Social features are unavailable for this profile',
      },
      { status: 403 }
    );
  }

  const result = await deleteFollow(profile.socialActor.id, targetActor.id);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { unfollowed: true },
  });
}
