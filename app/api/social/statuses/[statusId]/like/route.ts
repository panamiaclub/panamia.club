/**
 * POST /api/social/statuses/[statusId]/like - Like a status
 * DELETE /api/social/statuses/[statusId]/like - Unlike a status
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { likeStatus, unlikeStatus } from '@/lib/federation';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ statusId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { statusId } = await params;

  // Get user's actor
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

  const result = await likeStatus(profile.socialActor.id, statusId);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { liked: result.liked, likesCount: result.likesCount },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ statusId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { statusId } = await params;

  // Get user's actor
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

  const result = await unlikeStatus(profile.socialActor.id, statusId);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { liked: result.liked, likesCount: result.likesCount },
  });
}
