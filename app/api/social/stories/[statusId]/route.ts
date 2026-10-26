/**
 * DELETE /api/social/stories/[statusId] - Take a story down early (author only)
 * GET    /api/social/stories/[statusId] - Who watched it (author only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { deleteStory, getStoryViewers } from '@/lib/federation';

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

  const { statusId } = await params;
  const result = await deleteStory(statusId, profile.socialActor.id);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      {
        status:
          result.error === 'Not authorized to delete this story' ? 403 : 404,
      }
    );
  }

  return NextResponse.json({ success: true, data: { deleted: true } });
}

/** Who watched it. Author only -- enforced in getStoryViewers. */
export async function GET(
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

  const { statusId } = await params;
  const result = await getStoryViewers(statusId, profile.socialActor.id);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error === 'Not authorized' ? 403 : 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { viewers: result.viewers },
  });
}
