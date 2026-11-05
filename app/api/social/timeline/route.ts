/**
 * GET /api/social/timeline - Mixed community feed with a gentle mutual-Pana boost
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { getFeedTimeline, parseFeedCursor } from '@/lib/federation';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Get user's actor
  const profile = await getActiveProfileWithActor(session.user.id);

  if (!profile?.socialActor) {
    return NextResponse.json({
      success: true,
      data: { statuses: [], nextCursor: null },
    });
  }

  const { searchParams } = request.nextUrl;
  const token = searchParams.get('cursor');
  const cursor = token ? parseFeedCursor(token) : undefined;
  const limit = Number(searchParams.get('limit') ?? '20');
  if (
    (token && !cursor) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) {
    return NextResponse.json(
      { success: false, error: 'Invalid feed cursor or limit' },
      { status: 400 }
    );
  }

  const result = await getFeedTimeline(
    profile.socialActor.id,
    cursor ?? undefined,
    limit
  );

  return NextResponse.json({
    success: true,
    data: result,
  });
}
