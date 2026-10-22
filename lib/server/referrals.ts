import { and, eq, gt, isNull } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { db } from '@/lib/db';
import {
  normalizeReferralAttributionId,
  REFERRAL_COOKIE,
  type ReferralEventType,
} from '@/lib/referrals';
import { referralAttributions, referralEvents, users } from '@/lib/schema';

export async function getActiveCookieAttribution(request: NextRequest) {
  const id = normalizeReferralAttributionId(
    request.cookies.get(REFERRAL_COOKIE)?.value
  );
  if (!id) return null;

  return db.query.referralAttributions.findFirst({
    where: and(
      eq(referralAttributions.id, id),
      gt(referralAttributions.expiresAt, new Date())
    ),
  });
}

async function insertEvent(
  attributionId: string,
  eventType: ReferralEventType,
  referredUserId?: string | null,
  profileId?: string | null
) {
  await db
    .insert(referralEvents)
    .values({
      attributionId,
      eventType,
      referredUserId: referredUserId ?? null,
      profileId: profileId ?? null,
    })
    .onConflictDoNothing({
      target: [referralEvents.attributionId, referralEvents.eventType],
    });
}

export async function attachReferralToUser(
  attributionId: string,
  userId: string
) {
  return db.transaction(async (tx) => {
    const [attribution] = await tx
      .select()
      .from(referralAttributions)
      .where(eq(referralAttributions.id, attributionId))
      .limit(1);
    if (!attribution || attribution.referrerUserId === userId) return null;

    const [existing] = await tx
      .select()
      .from(referralAttributions)
      .where(eq(referralAttributions.referredUserId, userId))
      .limit(1);
    if (existing) return existing;

    if (attribution.referredUserId && attribution.referredUserId !== userId) {
      return null;
    }
    if (!attribution.referredUserId && attribution.expiresAt <= new Date()) {
      return null;
    }

    const [user] = await tx
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return null;

    const now = new Date();
    const [attached] = await tx
      .update(referralAttributions)
      .set({ referredUserId: userId, attachedAt: now })
      .where(
        and(
          eq(referralAttributions.id, attribution.id),
          isNull(referralAttributions.referredUserId)
        )
      )
      .returning();
    if (!attached) return null;

    await tx
      .update(referralEvents)
      .set({ referredUserId: userId })
      .where(
        and(
          eq(referralEvents.attributionId, attribution.id),
          isNull(referralEvents.referredUserId)
        )
      );

    if (user.createdAt >= attribution.firstSeenAt) {
      await tx
        .insert(referralEvents)
        .values({
          attributionId: attribution.id,
          eventType: 'account_created',
          referredUserId: userId,
        })
        .onConflictDoNothing({
          target: [referralEvents.attributionId, referralEvents.eventType],
        });
    }

    return attached;
  });
}

export async function recordReferralEventForUser(
  userId: string,
  eventType: ReferralEventType,
  profileId?: string | null
) {
  const attribution = await db.query.referralAttributions.findFirst({
    where: eq(referralAttributions.referredUserId, userId),
    columns: { id: true },
  });
  if (!attribution) return false;

  await insertEvent(attribution.id, eventType, userId, profileId);
  return true;
}

export async function resolveReferralAttribution(
  request: NextRequest,
  userId?: string | null
) {
  if (userId) {
    const attached = await db.query.referralAttributions.findFirst({
      where: eq(referralAttributions.referredUserId, userId),
    });
    if (attached) return attached;
  }

  const cookieAttribution = await getActiveCookieAttribution(request);
  if (cookieAttribution?.referrerUserId === userId) return null;
  return cookieAttribution;
}

export async function recordReferralEventFromRequest(
  request: NextRequest,
  eventType: ReferralEventType,
  profileId?: string | null,
  userId?: string | null
) {
  if (userId) {
    const recorded = await recordReferralEventForUser(
      userId,
      eventType,
      profileId
    );
    if (recorded) return true;
  }

  const attribution = await resolveReferralAttribution(request, userId);
  if (!attribution) return false;
  await insertEvent(
    attribution.id,
    eventType,
    attribution.referredUserId,
    profileId
  );
  return true;
}
