import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getViewerSignalStates } from '@/lib/server/profile-signals';
import { DIRECTORY_SIGNAL_BATCH_SIZE } from '@/lib/directory-signals';

/**
 * This viewer's save/recommend state across a batch of search results.
 *
 * The directory search payload is edge-cached for everyone (see
 * app/api/getDirectorySearch/route.ts), so it can carry the public counts but
 * never "have I saved this?". That answer lives here, and this response must
 * never be cached — one visitor's saves served to the next would be a data
 * leak, not just a stale number.
 *
 * Batching avoids a per-listing round trip that repeats the same viewer-global
 * permission lookup for every card.
 */

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const searchParams =
    request.nextUrl?.searchParams ?? new URL(request.url).searchParams;

  const ids = (searchParams.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length > DIRECTORY_SIGNAL_BATCH_SIZE) {
    return NextResponse.json(
      {
        success: false,
        error: `At most ${DIRECTORY_SIGNAL_BATCH_SIZE} ids per request`,
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const session = await auth();

  // Anonymous visitors get a well-formed empty answer rather than a 401. They
  // are allowed to browse the directory; the caller uses maySignal to decide
  // whether to show a Save button or the sign-up prompt, and an error here
  // would leave it unable to tell "signed out" from "request failed".
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: true, data: { maySignal: false, listings: {} } },
      { headers: NO_STORE }
    );
  }

  const data = await getViewerSignalStates(session.user.id, ids);
  return NextResponse.json({ success: true, data }, { headers: NO_STORE });
}
