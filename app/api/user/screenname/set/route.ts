import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { users, profiles, screennameHistory, socialActors } from '@/lib/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { validateScreennameFull } from '@/lib/screenname';
import {
  addProfileOwner,
  notBusinessListing,
} from '@/lib/server/profile-owners';
import { describeDbError, isUniqueViolation } from '@/lib/server/db-error';

// Rate limit: once per 90 days (~3 months)
const SCREENNAME_COOLDOWN_DAYS = 90;

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  const email = session.user?.email?.toLowerCase();
  if (!email) {
    return NextResponse.json(
      { success: false, error: 'No email in session' },
      { status: 401 }
    );
  }

  const body = await request.json();
  const { screenname, name } = body;

  // Required for a first claim, optional for later handle-only changes.
  // Preserve the existing cap for pasted display names.
  const displayName = typeof name === 'string' ? name.trim().slice(0, 80) : '';

  if (typeof screenname !== 'string' || !screenname.trim()) {
    return NextResponse.json(
      { success: false, error: 'Screenname is required' },
      { status: 400 }
    );
  }

  const newScreenname = screenname.trim();

  // Fetch current user state including rate limit check
  const currentUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { screenname: true, lastScreennameChange: true },
    with: {
      profile: {
        columns: { id: true },
        with: { socialActor: { columns: { id: true } } },
      },
    },
  });

  if (!currentUser?.screenname && !displayName) {
    return NextResponse.json(
      { success: false, error: 'Name is required' },
      { status: 400 }
    );
  }

  // Check if screenname is actually changing
  if (
    currentUser?.screenname &&
    currentUser.screenname.toLowerCase() === newScreenname.toLowerCase()
  ) {
    return NextResponse.json({
      success: true,
      data: { screenname: currentUser.screenname, timelineReset: false },
    });
  }

  // Rate limit check (only applies if user already has a screenname)
  if (currentUser?.screenname && currentUser?.lastScreennameChange) {
    const daysSinceChange = Math.floor(
      (Date.now() - currentUser.lastScreennameChange.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysSinceChange < SCREENNAME_COOLDOWN_DAYS) {
      const nextChangeDate = new Date(
        currentUser.lastScreennameChange.getTime() +
          SCREENNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
      );
      return NextResponse.json(
        {
          success: false,
          error: `You can change your screenname again on ${nextChangeDate.toLocaleDateString()}`,
        },
        { status: 429 }
      );
    }
  }

  // Validate format and availability (excluding current user)
  const validation = await validateScreennameFull(newScreenname, email);
  if (!validation.valid) {
    return NextResponse.json(
      { success: false, error: validation.error },
      { status: 400 }
    );
  }

  // Archive current screenname to history (if they have one and it's changing)
  if (currentUser?.screenname) {
    await db.insert(screennameHistory).values({
      screenname: currentUser.screenname,
      userId: session.user.id,
      redirectTo: newScreenname,
    });
  }

  // Posts deliberately survive a handle change.
  //
  // This previously deleted every status the actor had authored. That was
  // silent, unwarned data loss - the `timelineReset` flag below was never read
  // by any UI - and it is indefensible for a business rebrand, where the back
  // catalogue is most of the value.
  //
  // Nothing has to be rewritten to keep those posts reachable:
  //   - the permalink route /p/[user]/[postId] resolves on postId alone and
  //     ignores the handle segment, so existing links keep working;
  //   - social_statuses.uri is an ActivityPub object id, and object ids are
  //     permanent by spec. Rewriting them would orphan every remote reply and
  //     like that points at the old id, so they are left alone on purpose;
  //   - the actor's own URIs are re-pointed below, and the old handle is
  //     archived to screenname_history above, which drives the 410 tombstone.

  // Update user screenname and record change timestamp
  const [updatedUser] = await db
    .update(users)
    .set({
      screenname: newScreenname,
      lastScreennameChange: currentUser?.screenname ? new Date() : undefined,
      // Only when supplied, so a caller that omits it never blanks a name the
      // member already has.
      ...(displayName ? { name: displayName } : {}),
    })
    .where(eq(users.id, session.user.id))
    .returning({ screenname: users.screenname });

  // Every personal account gets a profile here. A profile is the platform's
  // social identity — social_actors references profiles, so without one a user
  // can browse but can never post, follow, or be followed.
  //
  // Screenname assignment is the earliest point this is possible:
  // profiles.name is NOT NULL while users.name is nullable (magic-link signups
  // often have no name). A first claim now requires a display name; the fallback
  // below remains for legacy accounts repairing a missing profile during a rename.
  //
  // This does NOT put anyone in the directory. Directory and sitemap listing is
  // filtered on users.accountType, which defaults to 'personal'; only
  // directory and hybrid are published.
  if (!currentUser?.profile) {
    // An unclaimed profile may already exist for this email — a listing created
    // before the account existed. auth.ts claims those at sign-in, but re-check
    // here so we can never trip the unique constraint on profiles.email.
    //
    // Business listings are excluded: absorbing one would make this human *be*
    // the business and burn their single identity slot. They are administered
    // through profileOwners instead. See lib/server/profile-owners.ts.
    const unclaimed = await db.query.profiles.findFirst({
      where: and(
        eq(profiles.email, email),
        isNull(profiles.userId),
        notBusinessListing
      ),
      columns: { id: true },
    });

    if (unclaimed) {
      await db
        .update(profiles)
        .set({ userId: session.user.id })
        .where(eq(profiles.id, unclaimed.id));
      await addProfileOwner(unclaimed.id, session.user.id);
    } else {
      // profiles.email is NOT NULL UNIQUE, and the lookup above cannot see the
      // row most likely to collide with this insert: a business listing this
      // member submitted through the public intake form using their own
      // personal address. notBusinessListing hides it on purpose — absorbing a
      // listing would make the human *be* the business and burn their single
      // identity slot, and profiles.email is attacker-writable through that
      // unauthenticated form. See lib/server/profile-owners.ts:17-28.
      //
      // So the comment above, which asserts this insert can never trip the
      // unique constraint, is false in exactly that case. The collision is
      // pinned in tests-db/screenname-profile-email-collision.test.ts.
      //
      // This catch is a floor, not the fix. The member still ends up without a
      // profile — they just learn why, and it is diagnosable, instead of an
      // unhandled rejection. Resolving it properly means answering a schema
      // question that is deliberately left open here: does profiles.email need
      // to be unique at all, when users.email is already unique and
      // authoritative? Every clean fix collides with that constraint while the
      // member's personal profile still needs some address, and when a listing
      // already holds the only address they have, no value satisfies both.
      try {
        await db.insert(profiles).values({
          userId: session.user.id,
          email,
          name: displayName || session.user.name?.trim() || newScreenname,
          // Self-created profiles are active immediately. Visibility is governed
          // by accountType, not this.
          active: true,
        });
      } catch (err: unknown) {
        // Log before classifying, so a violation on some other column — the
        // unique profiles.userId, a NOT NULL, a statement timeout — stays
        // diagnosable rather than collapsing into the same opaque 500 it is
        // today.
        const details = describeDbError(err);
        console.error('[screenname] profile creation failed', {
          userId: session.user.id,
          email,
          ...details,
        });

        if (isUniqueViolation(err)) {
          return NextResponse.json(
            {
              success: false,
              // Additive: the callers read `success` and `error`, and this
              // gives a UI something to branch on without parsing prose.
              code: 'profile_email_taken',
              error:
                'Your screenname is saved, but we could not create your profile: this email is already attached to another profile — usually a business listing submitted before this account existed. Claim that listing from its page in the directory, or contact support.',
            },
            { status: 409 }
          );
        }

        throw err;
      }
    }
  }

  // Mirror the handle and name onto the profile. Resolvers (webfinger,
  // nostr.json, the actor endpoint) read profiles.screenname, so leaving that
  // stale would make @name resolve to the old identity; the account menu and
  // listings read profiles.name, so leaving that stale would keep showing the
  // creation-time screenname fallback after a real name arrives. Covers both
  // branches above: userId is set by now whether the profile was just claimed,
  // just created, or already existed.
  //
  // The name is only written when supplied, because profiles.name is NOT NULL
  // and must never be blanked. notBusinessListing keeps a business that was
  // welded to profiles.userId from being renamed out from under its owner.
  await db
    .update(profiles)
    .set({
      screenname: newScreenname,
      ...(displayName?.trim() ? { name: displayName.trim() } : {}),
    })
    .where(and(eq(profiles.userId, session.user.id), notBusinessListing));

  // Sync screenname to SocialActor if one exists
  const socialActorId = currentUser?.profile?.socialActor?.id;
  if (socialActorId) {
    const {
      getActorUrl,
      getInboxUrl,
      getOutboxUrl,
      getFollowersUrl,
      getFollowingUrl,
    } = await import('@/lib/federation');

    await db
      .update(socialActors)
      .set({
        username: newScreenname,
        uri: getActorUrl(newScreenname),
        inboxUrl: getInboxUrl(newScreenname),
        outboxUrl: getOutboxUrl(newScreenname),
        followersUrl: getFollowersUrl(newScreenname),
        followingUrl: getFollowingUrl(newScreenname),
      })
      .where(eq(socialActors.id, socialActorId));
  }

  return NextResponse.json({
    success: true,
    data: {
      screenname: updatedUser.screenname,
      // Always false now - renaming no longer destroys the timeline. Retained
      // so existing callers keep a stable response shape.
      timelineReset: false,
    },
  });
}
