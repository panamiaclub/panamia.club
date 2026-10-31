import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  canAdministerProfile,
  listAdministeredProfiles,
} from '@/lib/server/profile-owners';
import { listPendingInvitations } from '@/lib/server/pending-listing-owner';
import {
  getActiveProfileId,
  selectActiveProfile,
} from '@/lib/server/active-profile';

/**
 * Profiles this account can act as, plus which one is currently selected.
 *
 * The active id is resolved server-side rather than read from the cookie by the
 * client: the cookie is httpOnly, and it is only authoritative after being
 * re-validated against profile_owners.
 *
 * Pending listing invitations ride along on this response rather than getting
 * an endpoint of their own. The shell already calls this once per load to fill
 * the account menu, and that menu is where an invitation has to appear, so a
 * second request would duplicate a round trip to tell the same component about
 * the same account. The added cost is one partial-indexed lookup that matches
 * nothing for almost everybody.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 }
    );
  }

  const [administered, activeProfileId, pendingInvitations] = await Promise.all(
    [
      listAdministeredProfiles(session.user.id),
      getActiveProfileId(session.user.id),
      /* Degrades to "no invitations" instead of taking the response with it.
         Invitations ride along here as a convenience, but the first two are
         what the account menu is actually for, and a passenger must not be
         able to crash the car.

         This is not hypothetical. The column this reads was added in one
         release and the migration did not reach production, so the query
         threw on every signed-in request — and because the whole handler
         rejected, members got a 500 and an account menu with no accounts in
         it. A missing invitation is invisible; a missing identity list looks
         like a deleted account. */
      listPendingInvitations(session.user.email).catch((error) => {
        console.error('Pending invitations lookup failed:', error);
        return [];
      }),
    ]
  );

  // Your own profile first, then businesses alphabetically — a stable order, so
  // the menu doesn't reshuffle between loads.
  const sorted = [...administered].sort((a, b) => {
    if (a.isPersonal !== b.isPersonal) return a.isPersonal ? -1 : 1;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  return NextResponse.json({
    success: true,
    data: sorted,
    activeProfileId,
    pendingInvitations,
  });
}

/**
 * Switch which profile this session is acting as.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 }
    );
  }

  let profileId: unknown;
  try {
    ({ profileId } = await request.json());
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }

  if (typeof profileId !== 'string' || !profileId) {
    return NextResponse.json(
      { success: false, error: 'profileId is required' },
      { status: 400 }
    );
  }

  // Authorize before writing the cookie. getActiveProfileId re-checks on every
  // read too, but failing loudly here gives the UI something to show.
  if (!(await canAdministerProfile(session.user.id, profileId))) {
    return NextResponse.json(
      { success: false, error: 'You do not have access to this profile' },
      { status: 403 }
    );
  }

  const response = NextResponse.json({ success: true, data: { profileId } });
  selectActiveProfile(response, profileId);

  return response;
}
