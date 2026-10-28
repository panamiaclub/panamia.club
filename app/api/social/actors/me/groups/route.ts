/**
 * GET /api/social/actors/me/groups - Groups the signed-in member belongs to
 *
 * The private counterpart to /api/social/actors/[username]/groups. That route
 * serves anyone looking at anyone, so it is filtered to public groups; this
 * one is only ever about the caller, so it includes private groups and each
 * membership's role.
 *
 * The distinction is enforced by construction rather than by a check: the
 * actor id passed to listMyGroups comes from the session, so there is no
 * username parameter that could be pointed at somebody else.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { listMyGroups, listMyGroupRequests } from '@/lib/federation';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const profile = await getActiveProfileWithActor(session.user.id);

  // An account without social enabled has no memberships rather than an
  // error -- the menu and the rail both render this as "no groups yet",
  // which is true, and a 403 would make them show an error state instead.
  if (!profile?.socialActor) {
    return NextResponse.json(
      {
        success: true,
        data: { groups: [], pending: [] },
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  const [groups, pending] = await Promise.all([
    listMyGroups(profile.socialActor.id),
    listMyGroupRequests(profile.socialActor.id),
  ]);

  return NextResponse.json(
    { success: true, data: { groups, pending } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
