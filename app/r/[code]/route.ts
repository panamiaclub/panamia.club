import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  normalizeReferralCode,
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
} from '@/lib/referrals';
import { getActiveCookieAttribution } from '@/lib/server/referrals';
import { referralAttributions, referralCodes } from '@/lib/schema';

interface RouteParams {
  params: Promise<{ code: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const existing = await getActiveCookieAttribution(request);
  if (existing) {
    return NextResponse.redirect(new URL('/referral', request.url));
  }

  const { code: rawCode } = await params;
  const code = normalizeReferralCode(rawCode);
  if (!code) {
    return NextResponse.redirect(new URL('/referral?invalid=1', request.url));
  }

  const referralCode = await db.query.referralCodes.findFirst({
    where: eq(referralCodes.code, code),
    columns: { code: true, userId: true },
  });
  if (!referralCode) {
    return NextResponse.redirect(new URL('/referral?invalid=1', request.url));
  }

  const now = new Date();
  const attributionId = nanoid(24);
  await db.insert(referralAttributions).values({
    id: attributionId,
    referralCode: referralCode.code,
    referrerUserId: referralCode.userId,
    firstSeenAt: now,
    expiresAt: new Date(now.getTime() + REFERRAL_COOKIE_MAX_AGE * 1000),
  });

  const response = NextResponse.redirect(new URL('/referral', request.url));
  response.cookies.set(REFERRAL_COOKIE, attributionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: REFERRAL_COOKIE_MAX_AGE,
  });
  return response;
}
