import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles, relayGroupMembers } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { verifyByoProof } from '@/lib/nostr/byo-proof';
import type { NostrEvent } from '@/lib/nostr/sign';

// Rotate the caller's profile to a NEW Nostr pubkey ("partial migration").
//
// The new key may be either freshly GENERATED in our /r UI (source 'issued') or
// a BYO key the user already controls (source 'byo'). A BYO target must carry a
// server-verified proof of control — the same proof model as /api/relay/enroll
// (see lib/nostr/byo-proof.ts); the nsec is never transmitted.
//
// This is the one continuity lever we control: the @panamia.club NIP-05 handle
// (served dynamically from profiles.nostr_pubkey) and the user's relay group
// access move to the new key. What CANNOT move — by protocol, not policy —
// stays with the old key: existing followers, authorship of past events, and
// any encrypted DMs (the old nsec is still required to read those). The client
// republishes kind 0 / relay-lists / group-list under the new key after this
// call; see lib/nostr/relay-identity-events.ts.
//
// Behavior:
//   - 401 if not signed in.
//   - 400 on malformed new pubkey.
//   - 400 if a BYO rotation omits the proof; 403 if the proof is invalid.
//   - 409 'not_enrolled' if the profile has no current nostr_pubkey (nothing to
//     rotate — they should enroll on /r first).
//   - 200 no-op if the new pubkey equals the current one (idempotent).
//   - 409 if some other profile already claims the new pubkey.
//   - 200 on success — within one transaction the profile's nostr_pubkey is
//     repointed and every relay_group_members row is migrated from the old key
//     to the new one (old key is retired from the roster; its authored history
//     is untouched).
//
// Group set mirrors AUTO_ENROLL_GROUPS in /api/relay/enroll: we also ensure the
// new key is in the default groups in case the old key had drifted out of them.
const DEFAULT_GROUPS = ['panamia-test', 'panamia-public'] as const;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'sign-in required' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: { pubkey?: string; source?: string; proof?: NostrEvent };
  try {
    body = (await request.json()) as {
      pubkey?: string;
      source?: string;
      proof?: NostrEvent;
    };
  } catch {
    return NextResponse.json(
      { error: 'invalid: malformed json' },
      { status: 400 }
    );
  }

  const newPubkey = body.pubkey?.toLowerCase();
  if (!newPubkey || !/^[0-9a-f]{64}$/.test(newPubkey)) {
    return NextResponse.json(
      { error: 'pubkey must be 64-char hex' },
      { status: 400 }
    );
  }

  // Rotating to a BYO key requires proof of control of that key (the nsec is
  // never sent — the browser signs a proof). Generated ('issued') keys are
  // freshly random, so no proof is required for them.
  const isByo = body.source === 'byo' || body.proof !== undefined;
  const source: 'issued' | 'byo' = isByo ? 'byo' : 'issued';
  if (isByo) {
    if (!body.proof) {
      return NextResponse.json(
        { error: 'byo rotation requires a signed proof of key control' },
        { status: 400 }
      );
    }
    const reason = verifyByoProof(body.proof, newPubkey, userId);
    if (reason) {
      return NextResponse.json(
        { error: 'invalid_proof', reason },
        { status: 403 }
      );
    }
  }

  const [profile] = await db
    .select({ id: profiles.id, nostrPubkey: profiles.nostrPubkey })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!profile) {
    return NextResponse.json(
      { error: 'profile_incomplete', missing: ['profile'] },
      { status: 412 }
    );
  }

  const oldPubkey = profile.nostrPubkey;
  if (!oldPubkey) {
    return NextResponse.json({ error: 'not_enrolled' }, { status: 409 });
  }

  // Idempotent: rotating to the same key is a no-op success.
  if (oldPubkey === newPubkey) {
    return NextResponse.json({
      ok: true,
      groups: DEFAULT_GROUPS,
      rotated: false,
    });
  }

  try {
    await db.transaction(async (tx) => {
      // Repoint the profile's identity to the new key.
      await tx
        .update(profiles)
        .set({ nostrPubkey: newPubkey, nostrPubkeySource: source })
        .where(eq(profiles.id, profile.id));

      // Migrate the old key's group memberships to the new key. The new key is
      // not yet in any group, so the (group_id, pubkey) unique index can't
      // conflict; this both adds the new key and retires the old one.
      await tx
        .update(relayGroupMembers)
        .set({ pubkey: newPubkey })
        .where(eq(relayGroupMembers.pubkey, oldPubkey));

      // Belt-and-suspenders: ensure the new key is in the default groups even
      // if the old key had somehow drifted out of one.
      for (const groupId of DEFAULT_GROUPS) {
        await tx
          .insert(relayGroupMembers)
          .values({ groupId, pubkey: newPubkey })
          .onConflictDoNothing();
      }
    });
  } catch (err: unknown) {
    // Unique-constraint on profiles.nostr_pubkey: another profile owns the key.
    const message = err instanceof Error ? err.message : String(err);
    if (/profiles_nostr_pubkey_unique|duplicate key/i.test(message)) {
      return NextResponse.json(
        { error: 'this pubkey is already claimed by another profile' },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true, groups: DEFAULT_GROUPS, rotated: true });
}
