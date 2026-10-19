import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  acceptPendingInvitation,
  declinePendingInvitation,
} from '@/lib/server/pending-listing-owner';
import { createActorForProfile } from '@/lib/federation';

/**
 * Answer a pending listing invitation: "someone listed this and said it's
 * yours — is it?"
 *
 * The invitation itself is attacker-writable (pending_owner_email is set by
 * the public intake form), which is the entire reason this endpoint exists
 * rather than the sign-in hook simply granting ownership. See
 * lib/server/pending-listing-owner.ts for the threat model. Ownership moves
 * only through an authenticated, deliberate click by the person whose address
 * was named.
 *
 * Authorisation is the signed-in account's email matching the invitation, and
 * it is checked inside the helper against the row itself — not against
 * anything the client sends — so a guessed profileId gets 'not-found' rather
 * than a listing.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Sign in to answer this.' },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    profileId?: unknown;
    action?: unknown;
  } | null;

  const profileId =
    typeof body?.profileId === 'string' ? body.profileId.trim() : '';
  const action = body?.action;

  if (!profileId) {
    return NextResponse.json({ error: 'Which listing?' }, { status: 400 });
  }

  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  try {
    if (action === 'decline') {
      const outcome = await declinePendingInvitation(
        session.user.email,
        profileId
      );
      // 'not-found' is reported as success on purpose. Declining is how
      // someone gets rid of an invitation they did not ask for, and an error
      // on a double-click would leave them tapping at something that already
      // worked. Nothing was granted either way.
      return NextResponse.json({ success: true, outcome });
    }

    const outcome = await acceptPendingInvitation(
      session.user.id,
      session.user.email,
      profileId
    );

    if (outcome === 'not-found') {
      return NextResponse.json(
        {
          error:
            'That invitation is no longer open. If this listing is yours, you can claim it from its page.',
        },
        { status: 404 }
      );
    }

    if (outcome === 'already-claimed') {
      return NextResponse.json(
        {
          error:
            'Someone else claimed this listing first. Contact us at hola@panamia.club if that is wrong.',
        },
        { status: 409 }
      );
    }

    // Give the listing its social actor, the same way the explicit claim flow
    // does, so its Updates section works from the moment it is accepted.
    //
    // Deliberately isolated from the outer catch: ownership is already
    // committed and the invitation already closed by this point, so letting an
    // actor failure surface as a 500 would tell the owner the claim failed and
    // send them into a retry that can only 404.
    try {
      const actorResult = await createActorForProfile(profileId);
      if (!actorResult.success) {
        console.warn(
          '[listings/pending] no actor for profile %s: %s',
          profileId,
          actorResult.error
        );
      }
    } catch (actorError) {
      console.error(
        '[listings/pending] actor creation failed for profile %s',
        profileId,
        actorError
      );
    }

    return NextResponse.json({ success: true, outcome });
  } catch (error) {
    console.error('[listings/pending] failed', error);
    return NextResponse.json(
      { error: 'Could not save that. Please try again.' },
      { status: 500 }
    );
  }
}
