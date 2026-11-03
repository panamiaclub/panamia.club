import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import {
  issueListingInvitation,
  revokeListingInvitation,
} from '@/lib/server/listing-invitations';
import {
  denyCrossOriginInvitationWrite,
  invitationHeaders,
} from '@/lib/server/listing-invitation-request';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Issuance only: the URL must be delivered privately to the returned recipient. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json(
      { error: 'Not authorized' },
      { status: 403, headers: invitationHeaders }
    );
  }
  const denied = denyCrossOriginInvitationWrite(request);
  if (denied) return denied;
  try {
    const { id: profileId } = await params;
    const origin = new URL(process.env.NEXT_PUBLIC_HOST_URL ?? '');
    if (
      origin.username ||
      origin.password ||
      (origin.protocol !== 'https:' &&
        !(
          origin.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
        ))
    ) {
      throw new Error('Listing invitation origin is not a supported Pana URL.');
    }
    const result = await issueListingInvitation(profileId, admin.id);
    if (!result.success) {
      return NextResponse.json(
        { code: result.code, error: result.error },
        { status: result.status, headers: invitationHeaders }
      );
    }
    return NextResponse.json(
      {
        success: true,
        profileId: result.profileId,
        recipient: result.recipient,
        invitationUrl: new URL(result.invitationPath, origin).toString(),
        expiresAt: result.expiresAt,
      },
      { status: 201, headers: invitationHeaders }
    );
  } catch (error) {
    console.error('[listings/invitations] issuance failed', error);
    return NextResponse.json(
      { error: 'Could not issue this invitation. Please try again.' },
      { status: 500, headers: invitationHeaders }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json(
      { error: 'Not authorized' },
      { status: 403, headers: invitationHeaders }
    );
  }
  const denied = denyCrossOriginInvitationWrite(request);
  if (denied) return denied;
  try {
    const { id: profileId } = await params;
    if (!(await revokeListingInvitation(profileId))) {
      return NextResponse.json(
        { error: 'That business listing could not be found.' },
        { status: 404, headers: invitationHeaders }
      );
    }
    return NextResponse.json({ success: true }, { headers: invitationHeaders });
  } catch (error) {
    console.error('[listings/invitations] revocation failed', error);
    return NextResponse.json(
      { error: 'Could not revoke this invitation. Please try again.' },
      { status: 500, headers: invitationHeaders }
    );
  }
}
