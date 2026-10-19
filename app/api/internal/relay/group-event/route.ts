import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  relayGroupMembers,
  relayGroupLeavePending,
  relayGroupJoinPending,
} from '@/lib/schema';
import { and, eq, sql } from 'drizzle-orm';
import { LEAVE_DEBOUNCE_SECONDS } from '@/lib/relay/group-maturation';
import { matureAndSettle } from '@/lib/relay/group-lifecycle';
import { denyPublicRequest } from '@/lib/server/internal-auth';

// NIP-29 advisory endpoint. Receives kind 9021 (join request) and kind 9022
// (leave request) events forwarded from relay.panamia.club and applies the
// panamia roster policy.
//
// Reached only via Cloudflare Service Binding from panamia-nosflare
// (env.PANAMIA.fetch). Service Bindings bypass the public network, so no
// HTTP-level auth is enforced here. Caller is panamia-nosflare's
// forwardAdvisoryToPana() in external/nosflare/src/relay-worker.ts.
//
// =============================================================================
// Policy (decided in roadmap discussion 2026-05-26):
// =============================================================================
//
//   kind 9022 (leave):
//     - Cancel any pending join from the same (group_id, pubkey).
//     - If the user isn't currently a member → { accepted: false,
//       reason: 'not-a-member' }.
//     - Otherwise INSERT into relay_group_leave_pending. PK collision
//       (repeated leave within the window) is a no-op — the original
//       requested_at is preserved, so the timer does NOT reset.
//     - Respond { accepted: true, status: 'deferred' }. The relay treats
//       deferred leaves as "ack but do not republish" — other members
//       continue to see the user in the roster during the grace window.
//     - Maturation happens lazily: matureGroupLeaves(groupId) is called on
//       the next group-state fetch (relay's NIP-29 emission, admin UI).
//
//   kind 9021 (join):
//     - If a pending leave exists for the same (group_id, pubkey) AND it
//       is still within the debounce window → auto-grant: delete the
//       pending leave, leave relay_group_members untouched (the user was
//       never actually removed). Respond { accepted: true, status:
//       'honored' }. Admin UI shows this silently for moderation health
//       monitoring; no action required of admins.
//     - Else if the user is already in relay_group_members (no pending
//       leave) → idempotent: respond { accepted: true, status: 'honored' }.
//       Covers UI-glitch re-clicks.
//     - Else INSERT into relay_group_join_pending and respond
//       { accepted: true, status: 'pending' }. The admin UI surfaces the
//       queue; admin approval is a separate endpoint that promotes the
//       row into relay_group_members and pushes a fresh kind 9000 back to
//       the relay (out of scope here).
//
// =============================================================================
// Admin-UI requirements (TODO):
// =============================================================================
//
//   - Pending leaves: list rows from relay_group_leave_pending grouped by
//     group, with countdown until maturation. Open the page → call
//     matureGroupLeaves(groupId) first so admins never see ghost rows
//     that are technically matured but uncleaned.
//   - Pending joins: list rows from relay_group_join_pending with
//     Approve / Deny actions. Approve = insert into relay_group_members,
//     delete pending row, POST to relay's new-member push endpoint
//     (TBD — phase D). Deny = delete pending row only.
//   - Auto-grant rejoins: surface as a passive activity log (no action
//     required), filtered from relay_group_leave_pending DELETE events
//     where the matching join arrived within the debounce window. Useful
//     for spotting flap patterns (e.g., a user repeatedly leaving and
//     rejoining may indicate a moderation issue worth attention).
//
// =============================================================================

interface AdvisoryRequest {
  kind: 9021 | 9022;
  pubkey: string;
  group_id: string;
  event_id: string;
  created_at: number;
}

interface AdvisoryResponse {
  accepted: boolean;
  status?: 'honored' | 'pending' | 'deferred';
  reason?: string;
}

const isHex64 = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);
const isValidGroupId = (s: string): boolean =>
  s.length > 0 && s.length <= 128 && /^[a-zA-Z0-9_.\-:]+$/.test(s);

export async function POST(
  request: NextRequest
): Promise<NextResponse<AdvisoryResponse>> {
  // Refuse anything arriving from the public edge — see
  // lib/server/internal-auth.ts. The relay's Service Binding is unaffected.
  const denied = denyPublicRequest<AdvisoryResponse>(request);
  if (denied) return denied;

  let body: Partial<AdvisoryRequest>;
  try {
    body = (await request.json()) as Partial<AdvisoryRequest>;
  } catch {
    return NextResponse.json(
      { accepted: false, reason: 'invalid: malformed json' },
      { status: 400 }
    );
  }

  const { kind, pubkey, group_id, event_id } = body;

  if (kind !== 9021 && kind !== 9022) {
    return NextResponse.json(
      { accepted: false, reason: 'invalid: kind must be 9021 or 9022' },
      { status: 400 }
    );
  }
  if (!pubkey || !isHex64(pubkey)) {
    return NextResponse.json(
      { accepted: false, reason: 'invalid: pubkey' },
      { status: 400 }
    );
  }
  if (!group_id || !isValidGroupId(group_id)) {
    return NextResponse.json(
      { accepted: false, reason: 'invalid: group_id' },
      { status: 400 }
    );
  }
  if (!event_id || !isHex64(event_id)) {
    return NextResponse.json(
      { accepted: false, reason: 'invalid: event_id' },
      { status: 400 }
    );
  }

  // Mature any expired pending leaves for this group before evaluating the
  // advisory — ensures membership checks below see post-maturation state.
  //
  // Maturation can also delete the group: a member-created group whose last
  // member's leave just matured is gone. Both handlers below would then fail
  // on the group_id foreign key, so answer the advisory directly instead.
  const settled = await matureAndSettle(db, group_id);
  if (settled.deleted) {
    return NextResponse.json({ accepted: false, reason: 'group-not-found' });
  }

  if (kind === 9022) {
    return handleLeave(group_id, pubkey);
  }
  return handleJoin(group_id, pubkey);
}

async function handleLeave(
  groupId: string,
  pubkey: string
): Promise<NextResponse<AdvisoryResponse>> {
  // Policy: leave cancels any pending join for the same (group, pubkey).
  // Single transaction so a concurrent join can't slip in between the
  // cancel and the pending-leave insert.
  return db.transaction(async (tx) => {
    await tx
      .delete(relayGroupJoinPending)
      .where(
        and(
          eq(relayGroupJoinPending.groupId, groupId),
          eq(relayGroupJoinPending.pubkey, pubkey)
        )
      );

    const [member] = await tx
      .select({ exists: sql<number>`1` })
      .from(relayGroupMembers)
      .where(
        and(
          eq(relayGroupMembers.groupId, groupId),
          eq(relayGroupMembers.pubkey, pubkey)
        )
      )
      .limit(1);

    if (!member) {
      return NextResponse.json({ accepted: false, reason: 'not-a-member' });
    }

    // ON CONFLICT DO NOTHING: repeated leave within the window is a no-op.
    // The original requested_at is preserved, so the 24h timer does NOT
    // reset on subsequent clicks.
    await tx
      .insert(relayGroupLeavePending)
      .values({ groupId, pubkey })
      .onConflictDoNothing();

    return NextResponse.json({ accepted: true, status: 'deferred' });
  });
}

async function handleJoin(
  groupId: string,
  pubkey: string
): Promise<NextResponse<AdvisoryResponse>> {
  return db.transaction(async (tx) => {
    // Auto-grant rejoin: if a pending leave exists within the debounce
    // window, cancel it. The user was never actually removed from
    // relay_group_members, so no insert is needed.
    const cancelledLeave = await tx
      .delete(relayGroupLeavePending)
      .where(
        and(
          eq(relayGroupLeavePending.groupId, groupId),
          eq(relayGroupLeavePending.pubkey, pubkey),
          sql`${relayGroupLeavePending.requestedAt} >= now() - interval '${sql.raw(String(LEAVE_DEBOUNCE_SECONDS))} seconds'`
        )
      )
      .returning({ pubkey: relayGroupLeavePending.pubkey });

    if (cancelledLeave.length > 0) {
      return NextResponse.json({ accepted: true, status: 'honored' });
    }

    // Idempotent: already a member with no pending leave → ack as honored.
    const [member] = await tx
      .select({ exists: sql<number>`1` })
      .from(relayGroupMembers)
      .where(
        and(
          eq(relayGroupMembers.groupId, groupId),
          eq(relayGroupMembers.pubkey, pubkey)
        )
      )
      .limit(1);

    if (member) {
      return NextResponse.json({ accepted: true, status: 'honored' });
    }

    // Normal join queue: insert (or no-op if already queued).
    await tx
      .insert(relayGroupJoinPending)
      .values({ groupId, pubkey })
      .onConflictDoNothing();

    return NextResponse.json({ accepted: true, status: 'pending' });
  });
}
