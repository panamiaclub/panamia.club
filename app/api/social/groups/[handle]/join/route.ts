/**
 * POST   /api/social/groups/[handle]/join - Join a group, or ask to
 * DELETE /api/social/groups/[handle]/join - Leave, or withdraw a request
 *
 * Mirrors the shape of /api/social/actors/[username]/follow: POST to start the
 * relationship, DELETE to end it. Whether a POST lands as a member or as a
 * pending request is the group's decision, not the caller's -- see joinGroup.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { getGroupByHandle, joinGroup, leaveGroup } from '@/lib/federation';

async function resolve(userId: string, handle: string) {
  const [found, profile] = await Promise.all([
    getGroupByHandle(handle),
    getActiveProfileWithActor(userId),
  ]);

  if (!found) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Group not found' },
        { status: 404 }
      ),
    };
  }

  if (!profile?.socialActor) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: 'Social features are unavailable for this profile',
        },
        { status: 403 }
      ),
    };
  }

  return { groupId: found.group.id, actorId: profile.socialActor.id };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { handle } = await params;
  const resolved = await resolve(session.user.id, handle);
  if ('error' in resolved) return resolved.error;

  const result = await joinGroup(resolved.groupId, resolved.actorId);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 403 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      membership: result.membership,
      // The toolbar reads this to decide between "Joined" and "Requested".
      pending: result.pending,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { handle } = await params;
  const resolved = await resolve(session.user.id, handle);
  if ('error' in resolved) return resolved.error;

  const result = await leaveGroup(resolved.groupId, resolved.actorId);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { left: true },
  });
}
