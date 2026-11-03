import { NextRequest, NextResponse } from 'next/server';
import {
  LISTING_INVITATION_DAYS,
  isListingInvitationToken,
} from '@/lib/listing-invitation';

export const LISTING_INVITATION_COOKIE = 'pana_listing_invitation';
const cookiePath = '/api/listings/invitations';
export const invitationHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
};
export interface InvitationContext {
  profileId: string;
  token: string;
}

export function readInvitationContext(
  value: unknown
): InvitationContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const context = value as Record<string, unknown>;
  if (
    typeof context.profileId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(context.profileId) ||
    !isListingInvitationToken(context.token)
  )
    return null;
  return { profileId: context.profileId, token: context.token };
}

export function invitationContext(
  request: NextRequest
): InvitationContext | null {
  const cookie = request.cookies.get(LISTING_INVITATION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    return readInvitationContext(JSON.parse(cookie));
  } catch {
    // A client-controlled cookie is untrusted input, not a stored-token failure.
    return null;
  }
}

export function setInvitationContext(
  response: NextResponse,
  context: InvitationContext
): void {
  response.cookies.set(LISTING_INVITATION_COOKIE, JSON.stringify(context), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: cookiePath,
    maxAge: LISTING_INVITATION_DAYS * 24 * 60 * 60,
  });
}

export function clearInvitationContext(response: NextResponse): void {
  response.cookies.set(LISTING_INVITATION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: cookiePath,
    maxAge: 0,
  });
}

export function denyCrossOriginInvitationWrite(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin !== request.nextUrl.origin) {
    return NextResponse.json(
      {
        code: 'invalid_origin',
        error: 'Open this invitation on the Pana site before confirming.',
      },
      { status: 403, headers: invitationHeaders }
    );
  }
  return null;
}
