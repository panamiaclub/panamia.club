/**
 * NIP-05 endpoint: maps a panamia screenname to its Nostr hex pubkey.
 *
 * Other Nostr clients fetch /.well-known/nostr.json?name=<local> from
 * arbitrary origins to verify that "alice@panamia.club" really controls a
 * given pubkey, so CORS must be permissive (NIP-05 §"DNS-based internet
 * identifiers").
 *
 * Lookup is case-insensitive on screenname (we lowercase both sides) and
 * only resolves users who have completed Resilience enrollment — i.e.
 * profiles.nostr_pubkey is populated. The optional `relays` block tells
 * clients where the user's events live so they don't need a separate
 * discovery step.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/05.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { profiles, users } from '@/lib/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { corsHeaders } from '@/lib/federation/cors';

const RELAY_URL = 'wss://relay.panamia.club';

// Conservative local-part shape: ASCII alphanumerics, dot, dash, underscore.
// NIP-05 explicitly forbids characters outside [a-z0-9-_.]; rejecting other
// inputs early avoids a DB round-trip for clearly invalid lookups.
const LOCAL_PART_RE = /^[a-z0-9._-]+$/;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders('GET', 'OPTIONS'),
  });
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name')?.toLowerCase();
  if (!name || !LOCAL_PART_RE.test(name)) {
    return NextResponse.json(
      { names: {} },
      { status: 200, headers: corsHeaders('GET') }
    );
  }

  const [row] = await db
    .select({
      screenname: users.screenname,
      pubkey: profiles.nostrPubkey,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        sql`lower(${users.screenname}) = ${name}`,
        isNotNull(profiles.nostrPubkey)
      )
    )
    .limit(1);

  if (!row?.screenname || !row.pubkey) {
    return NextResponse.json(
      { names: {} },
      { status: 200, headers: corsHeaders('GET') }
    );
  }

  // Spec quirk: the response key MUST match the requested local part exactly
  // (some verifiers compare strings, not lowercase). We always serve the
  // lowercased form, which is the only form we publish in kind 0 anyway.
  const localPart = row.screenname.toLowerCase();
  return NextResponse.json(
    {
      names: { [localPart]: row.pubkey },
      relays: { [row.pubkey]: [RELAY_URL] },
    },
    {
      headers: {
        ...corsHeaders('GET'),
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    }
  );
}
