import { NextResponse } from 'next/server';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles, socialActors, users } from '@/lib/schema';
import { createActorForProfile } from '@/lib/federation/wrappers/actor';
import { checkAdminAuth } from '@/lib/server/admin-auth';

const BATCH_SIZE = 10;

export async function POST() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json(
      { success: false, error: 'Not Authorized:admin' },
      { status: 401 }
    );
  }

  // A linked account distinguishes members from unclaimed directory listings.
  // Do not change existing identities, eligibility, or follow relationships.
  const missingIdentity = and(
    eq(profiles.socialEligible, true),
    isNull(socialActors.id),
    sql`btrim(coalesce(${profiles.screenname}, ${users.screenname})) <> ''`
  );
  const candidates = await db
    .select({ id: profiles.id })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .leftJoin(socialActors, eq(socialActors.profileId, profiles.id))
    .where(missingIdentity)
    .orderBy(profiles.id)
    .limit(BATCH_SIZE);

  for (const profile of candidates) {
    const result = await createActorForProfile(profile.id);
    if (!result.success && !result.gateResult) {
      console.error('[admin/social/actors/backfill] provisioning failed', {
        profileId: profile.id,
        error: result.error,
      });
      return NextResponse.json(
        { success: false, error: result.error, profileId: profile.id },
        { status: 409 }
      );
    }
  }

  const [pending] = await db
    .select({ remaining: count() })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .leftJoin(socialActors, eq(socialActors.profileId, profiles.id))
    .where(missingIdentity);

  return NextResponse.json({
    success: true,
    data: { processed: candidates.length, remaining: pending.remaining },
  });
}
