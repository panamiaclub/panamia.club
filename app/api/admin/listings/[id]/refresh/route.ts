import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import {
  adminRefreshState,
  startListingRefresh,
  controlListingRefresh,
} from '@/lib/server/listing-refresh';
import {
  invitationHeaders,
  denyCrossOriginInvitationWrite,
} from '@/lib/server/listing-invitation-request';

interface Params {
  params: Promise<{ id: string }>;
}
const fail = (error: string, status: number) =>
  NextResponse.json(
    { success: false, error },
    { status, headers: invitationHeaders }
  );

export async function GET(_request: NextRequest, { params }: Params) {
  if (!(await checkAdminAuth())) return fail('Not authorized', 403);
  try {
    const { id } = await params;
    const state = await adminRefreshState(id);
    return state
      ? NextResponse.json(state, { headers: invitationHeaders })
      : fail('That business could not be found.', 404);
  } catch (error) {
    console.error('[listing-refresh] admin lookup failed', error);
    return fail('Could not load this review cycle.', 500);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const admin = await checkAdminAuth();
  if (!admin) return fail('Not authorized', 403);
  const denied = denyCrossOriginInvitationWrite(request);
  if (denied) return denied;
  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return fail('Confirm this operation before continuing.', 400);
  const data = body as Record<string, unknown>;
  if (
    data.profileId !== id ||
    data.expectedActorId !== admin.id ||
    data.confirmed !== true
  )
    return fail(
      'Reload and confirm the account and business for this operation.',
      409
    );
  try {
    const result =
      data.action === 'start'
        ? await startListingRefresh(id, admin.id)
        : data.action === 'hold' ||
            data.action === 'cancel' ||
            data.action === 'retry'
          ? await controlListingRefresh(
              id,
              data.action,
              data.reason === 'bounced' ? 'bounced' : 'operator_hold',
              data.acknowledgeResendRisk === true
            )
          : null;
    if (!result) return fail('Choose start, hold, cancel or retry.', 400);
    return result.success
      ? NextResponse.json(result, { headers: invitationHeaders })
      : fail(result.error, result.status);
  } catch (error) {
    console.error('[listing-refresh] admin action failed', error);
    return fail('Could not update this review cycle.', 500);
  }
}
