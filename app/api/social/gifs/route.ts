/**
 * GET /api/social/gifs?q=<term>
 *
 * Proxies Tenor so the API key stays on the server. Signed-in only: this
 * spends our quota, and an open endpoint is a free GIF search API for anyone
 * who finds it.
 *
 * Answers 200 with `enabled: false` when no key is configured rather than
 * 404 or 500. The client uses that to decide whether to draw the GIF button
 * at all, so a deployment without a key looks like a product that does not do
 * GIFs rather than one whose GIF button is broken.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchGifs, isGifSearchEnabled } from '@/lib/gifs/tenor';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isGifSearchEnabled()) {
    return NextResponse.json({ enabled: false, results: [] });
  }

  const query = request.nextUrl.searchParams.get('q') ?? '';

  try {
    const results = await fetchGifs(query);
    return NextResponse.json({ enabled: true, results });
  } catch (error) {
    // Tenor being down is not our member's problem to read a stack trace
    // about, but it is also not an empty result -- an empty grid would read
    // as "nothing matches", which is a different and wrong statement.
    console.error('Tenor search failed:', error);
    return NextResponse.json(
      { enabled: true, results: [], error: 'GIF search is unavailable' },
      { status: 502 }
    );
  }
}
