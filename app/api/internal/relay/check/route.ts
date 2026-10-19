import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { relayGroupMembers } from '@/lib/schema';
import { and, eq, sql } from 'drizzle-orm';
import { maturedLeaveExists } from '@/lib/relay/group-maturation';
import { denyPublicRequest } from '@/lib/server/internal-auth';

// Membership gate for relay.panamia.club. A pubkey is allowed to publish iff
// it appears in relay_group_members for at least one group. This collapses
// "is the user a panamia member" and "do they belong to any group" into one
// check — there is no profile-level pubkey provisioning yet, so group
// membership IS the source of truth for relay access.
//
// Filter-on-read: a row in relay_group_leave_pending older than the debounce
// window is treated as "already left" even though the relay_group_members
// row hasn't been cleaned up yet. Keeps this hot path read-only; the actual
// cleanup happens on the next matureGroupLeaves call from a state-fetch path.
//
// Reached only via Cloudflare Service Binding from panamia-nosflare
// (env.PANAMIA.fetch). Service Bindings bypass the public network, so no
// HTTP-level auth is enforced here. Caller is panamia-nosflare's
// hasPaidForRelay() in external/nosflare/src/relay-worker.ts.
export async function GET(request: NextRequest) {
  // Refuse anything arriving from the public edge — see
  // lib/server/internal-auth.ts. The relay's Service Binding is unaffected.
  const denied = denyPublicRequest(request);
  if (denied) return denied;

  const pubkey = request.nextUrl.searchParams.get('pubkey');

  if (!pubkey || !/^[0-9a-f]{64}$/.test(pubkey)) {
    return NextResponse.json(
      { allowed: false, error: 'invalid pubkey' },
      { status: 400 }
    );
  }

  const [row] = await db
    .select({ exists: sql<number>`1` })
    .from(relayGroupMembers)
    .where(
      and(
        eq(relayGroupMembers.pubkey, pubkey),
        sql`NOT EXISTS (${maturedLeaveExists})`
      )
    )
    .limit(1);

  return NextResponse.json({ allowed: row !== undefined });
}
