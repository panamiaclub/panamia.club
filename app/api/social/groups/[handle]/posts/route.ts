/**
 * GET  /api/social/groups/[handle]/posts - Read a group's posts
 * POST /api/social/groups/[handle]/posts - Post into a group
 *
 * Reading and writing are different rights and are checked separately. A
 * public group is readable by a stranger but writable only by a member, so
 * `canRead` and `canPost` are never collapsed into one answer here.
 *
 * Neither handler re-implements the visibility rule. Reads go through
 * `getGroupTimeline`, whose predicate is the shared one, and writes go
 * through `createStatus`, which re-checks membership itself. The membership
 * check below is therefore the friendly error, not the security boundary --
 * the boundary is one layer down where it cannot be forgotten.
 *
 * @see lib/federation/wrappers/group-visibility.ts
 * @see docs/GROUPS-ROADMAP.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import {
  createStatus,
  getGroupByHandle,
  getGroupTimeline,
  getMembership,
} from '@/lib/federation';
import { parseCcLicense, parseStatusLocation } from '@/lib/social/status-input';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  const found = await getGroupByHandle(handle);
  if (!found) {
    return NextResponse.json(
      { success: false, error: 'Group not found' },
      { status: 404 }
    );
  }

  let viewerActorId: string | undefined;
  const session = await auth();
  if (session?.user?.id) {
    const profile = await getActiveProfileWithActor(session.user.id);
    viewerActorId = profile?.socialActor?.id;
  }

  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get('cursor') || undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  const result = await getGroupTimeline(
    found.group.id,
    viewerActorId,
    cursor,
    limit
  );

  return NextResponse.json({ success: true, data: result });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

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
      { success: false, error: 'You must enable social features first' },
      { status: 403 }
    );
  }

  const found = await getGroupByHandle(handle);
  if (!found) {
    return NextResponse.json(
      { success: false, error: 'Group not found' },
      { status: 404 }
    );
  }

  const membership = await getMembership(
    found.group.id,
    profile.socialActor.id
  );

  if (membership?.status !== 'active') {
    // 403 rather than 404 even for a private group: you had to know the
    // handle to get here, and a member-only failure is the whole point of a
    // join button. Nothing about the group's contents is revealed.
    return NextResponse.json(
      { success: false, error: 'Only members can post in this group' },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  const {
    content,
    contentWarning,
    inReplyTo,
    visibility,
    attachments,
    location,
    ccLicense,
  } = body;

  if (!content || typeof content !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Content is required' },
      { status: 400 }
    );
  }

  // 'direct' is rejected rather than coerced. A DM that is somehow also a
  // group post has no coherent audience, and silently rewriting what the
  // caller asked for is how a surprise disclosure happens.
  const validVisibilities = ['public', 'unlisted', 'private'] as const;
  const resolvedVisibility = validVisibilities.includes(visibility)
    ? visibility
    : 'unlisted';

  const result = await createStatus(
    profile.socialActor.id,
    content,
    contentWarning,
    inReplyTo,
    resolvedVisibility,
    Array.isArray(attachments) ? attachments : undefined,
    undefined,
    parseStatusLocation(location),
    parseCcLicense(ccLicense),
    { groupId: found.group.id }
  );

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error, gateResult: result.gateResult },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, data: result }, { status: 201 });
}
