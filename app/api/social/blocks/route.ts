/**
 * GET /api/social/blocks?kind=block|mute - The viewer's own block or mute list
 *
 * Outgoing rows only. You can see who you blocked; you can never see who
 * blocked you. That asymmetry is the whole point — a list of people who have
 * blocked you is a notification, and notifying someone that they were blocked
 * is how a block turns into an escalation.
 *
 * This backs the settings screen, which is the only place a block becomes
 * visible again after it is made.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { listBlocks } from '@/lib/federation';
import type { SocialBlockKind } from '@/lib/schema';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const raw = request.nextUrl.searchParams.get('kind') ?? 'block';
  if (raw !== 'block' && raw !== 'mute') {
    return NextResponse.json(
      { success: false, error: 'kind must be "block" or "mute"' },
      { status: 400 }
    );
  }
  const kind: SocialBlockKind = raw;

  const profile = await getActiveProfileWithActor(session.user.id);
  if (!profile?.socialActor) {
    // An empty list, not a 403. A profile without a social identity has
    // blocked nobody, and that is a true answer rather than an error.
    return NextResponse.json({ success: true, data: { blocks: [], kind } });
  }

  const blocks = await listBlocks(profile.socialActor.id, kind);

  return NextResponse.json({ success: true, data: { blocks, kind } });
}
