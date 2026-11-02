/**
 * GET /api/social/actors/[username] - Get actor by username
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import {
  getActorByScreenname,
  getActorPostCount,
  getFollowRelationship,
  getViewerBlockState,
} from '@/lib/federation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  const actor = await getActorByScreenname(username);

  if (!actor) {
    return NextResponse.json(
      { success: false, error: 'Actor not found' },
      { status: 404 }
    );
  }

  // Get viewer's actor if authenticated
  let viewerActorId: string | null = null;
  const session = await auth();

  if (session?.user?.id) {
    const profile = await getActiveProfileWithActor(session.user.id);
    viewerActorId = profile?.socialActor?.id || null;
  }

  // Get follow relationship
  const relationship = await getFollowRelationship(viewerActorId, actor.id);

  // Only the viewer's own outgoing block/mute rows, so the menu can offer
  // "Unblock" instead of "Block". Whether this actor blocked the viewer is
  // deliberately not reported — see getViewerBlockState.
  const blockState = await getViewerBlockState(viewerActorId, actor.id);

  // The stored statusCount includes DMs; the profile count must match its wall.
  const statusCount = await getActorPostCount(
    actor.id,
    viewerActorId ?? undefined
  );

  return NextResponse.json({
    success: true,
    data: {
      actor: {
        id: actor.id,
        username: actor.username,
        domain: actor.domain,
        uri: actor.uri,
        name: actor.name,
        summary: actor.summary,
        iconUrl: actor.iconUrl,
        followingCount: actor.followingCount,
        followersCount: actor.followersCount,
        statusCount,
        createdAt: actor.createdAt,
      },
      isFollowing: relationship.isFollowing,
      isFollowedBy: relationship.isFollowedBy,
      isSelf: viewerActorId === actor.id,
      isBlocked: blockState.isBlocked,
      isMuted: blockState.isMuted,
    },
  });
}
