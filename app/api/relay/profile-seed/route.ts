import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getProfileReadiness } from '@/lib/relay/profile-readiness';

// Returns the canonical Nostr metadata seed for the signed-in user, used by
// /r right after enrollment to publish a kind 0 from the browser. Screenname
// is the immutable handle (gated on the ActivityPub side too) so we mirror
// it as both `name` and the NIP-05 local part. Lowercased for consistency
// with /.well-known/nostr.json lookups.
//
// This endpoint enforces the same readiness gate as /api/relay/enroll, so
// the kind 0 we hand out is always coherent (screenname + completed
// become-a-pana profile). In normal flow the gate has already passed by
// the time this is called; the 412 path is defensive.
const NIP05_DOMAIN = 'panamia.club';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'sign-in required' }, { status: 401 });
  }

  const snapshot = await getProfileReadiness(session.user.id);
  if (!snapshot.ready || !snapshot.screenname || !snapshot.profile) {
    return NextResponse.json(
      { error: 'profile_incomplete', missing: snapshot.missing },
      { status: 412 }
    );
  }

  const name = snapshot.screenname;
  const descriptions = snapshot.profile.descriptions as
    { details?: string; background?: string } | null | undefined;
  const about = descriptions?.details ?? descriptions?.background ?? null;

  return NextResponse.json({
    name,
    nip05: `${name}@${NIP05_DOMAIN}`,
    about,
    picture: snapshot.profile.primaryImageCdn,
  });
}
