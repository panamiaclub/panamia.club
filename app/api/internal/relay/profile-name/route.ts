import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { profiles, users } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { denyPublicRequest } from '@/lib/server/internal-auth';

// Canonical Nostr metadata fields for a managed pubkey. nosflare calls this
// when validating a kind 0 publish: panamia owns the user's display name
// (it doubles as the ActivityPub handle and the NIP-05 local part), so the
// relay rejects kind 0 events whose `name`/`nip05` drift from these values.
//
// Reached only via Cloudflare Service Binding from panamia-nosflare
// (env.PANAMIA.fetch), same trust model as /api/internal/relay/check.
//
// Responses:
//   200 { managed: true, name, nip05 } — pubkey is bound to a panamia
//        profile with a screenname; relay should enforce these values.
//   200 { managed: false } — pubkey is not associated with a panamia
//        profile (e.g. external participant); relay should not enforce.
//   400 — malformed pubkey.
const NIP05_DOMAIN = 'panamia.club';

export async function GET(request: NextRequest) {
  // Refuse anything arriving from the public edge — see
  // lib/server/internal-auth.ts. The relay's Service Binding is unaffected.
  const denied = denyPublicRequest(request);
  if (denied) return denied;

  const pubkey = request.nextUrl.searchParams.get('pubkey')?.toLowerCase();
  if (!pubkey || !/^[0-9a-f]{64}$/.test(pubkey)) {
    return NextResponse.json({ error: 'invalid pubkey' }, { status: 400 });
  }

  const [row] = await db
    .select({ screenname: users.screenname })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(eq(profiles.nostrPubkey, pubkey))
    .limit(1);

  if (!row?.screenname) {
    // Either the pubkey isn't in profiles at all, or the profile has no
    // screenname yet. In both cases there is no canonical name for the
    // relay to enforce, so report unmanaged and let the publish through.
    return NextResponse.json({ managed: false });
  }

  const name = row.screenname.toLowerCase();
  return NextResponse.json({
    managed: true,
    name,
    nip05: `${name}@${NIP05_DOMAIN}`,
  });
}
