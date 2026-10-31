import { NextResponse, type NextRequest } from 'next/server';

import { checkAdminAuth } from '@/lib/server/admin-auth';
import { decideListing } from '@/lib/server/listing-decision';
import { revalidatePublicListing } from '@/lib/server/profile';

/**
 * Approve or decline a listing from the review queue.
 *
 * The write itself lives in `lib/server/listing-decision` and is shared with
 * `/api/admin/profile/action`, the capability-key endpoint behind the emailed
 * approve/decline links. That endpoint cannot be replaced — staff use it from
 * phones that are not signed in — so the only way to keep one definition of
 * "publish a business" is for both doors to call the same function.
 *
 * What this door adds is identity. A decision made here is attributed, which
 * the emailed link can never be, and it is refused outright if the listing has
 * already been decided: the queue only renders undecided rows, so a decision
 * arriving for a decided one means the page was stale. Letting it through
 * would silently overturn whoever got there first.
 */

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json(
      { success: false, error: 'Not authorized' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;

    let body: { decision?: string; reason?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Could not read that request.' },
        { status: 400 }
      );
    }

    if (body.decision !== 'approve' && body.decision !== 'decline') {
      return NextResponse.json(
        { success: false, error: 'Decision must be approve or decline.' },
        { status: 400 }
      );
    }

    const result = await decideListing({
      profileId: id,
      decision: body.decision,
      decidedBy: admin.email ?? undefined,
      reason:
        typeof body.reason === 'string'
          ? body.reason.trim().slice(0, 500)
          : undefined,
      expect: 'pending',
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            result.reason === 'not-found'
              ? 'That listing no longer exists.'
              : 'Someone already answered this one. Reload the queue.',
        },
        { status: result.reason === 'not-found' ? 404 : 409 }
      );
    }

    revalidatePublicListing(id, result.screenname);
    return NextResponse.json({
      success: true,
      name: result.name,
      mailed: result.mailed,
      mailFailed: result.mailFailed,
    });
  } catch (error) {
    console.error('Failed to decide a listing', error);
    return NextResponse.json(
      { success: false, error: 'Could not record that decision.' },
      { status: 500 }
    );
  }
}
