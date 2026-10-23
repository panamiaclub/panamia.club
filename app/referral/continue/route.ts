import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import {
  normalizeReferralAttributionId,
  REFERRAL_COOKIE,
} from '@/lib/referrals';
import { attachReferralToUser } from '@/lib/server/referrals';

const ALLOWED_DESTINATIONS = new Set([
  '/welcome',
  '/account',
  '/form/get-listed',
  '/connectors/join',
  '/account/user/edit#referrals',
  '/welcome?next=%2Faccount%2Fuser%2Fedit%23referrals',
]);

export async function GET(request: NextRequest) {
  const nextParam = request.nextUrl.searchParams.get('next') || '/welcome';
  const destination = ALLOWED_DESTINATIONS.has(nextParam)
    ? nextParam
    : '/welcome';
  const attributionId =
    normalizeReferralAttributionId(
      request.nextUrl.searchParams.get('attribution')
    ) ??
    normalizeReferralAttributionId(request.cookies.get(REFERRAL_COOKIE)?.value);
  const session = await auth();

  if (!session?.user?.id) {
    const callbackParams = new URLSearchParams({ next: destination });
    if (attributionId) callbackParams.set('attribution', attributionId);
    const signIn = new URL('/signin', request.url);
    signIn.searchParams.set(
      'callbackUrl',
      `/referral/continue?${callbackParams.toString()}`
    );
    return NextResponse.redirect(signIn);
  }

  if (attributionId) {
    await attachReferralToUser(attributionId, session.user.id);
  }

  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(REFERRAL_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
