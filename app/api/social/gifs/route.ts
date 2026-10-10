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
import {
  fetchGifsCached,
  isGifSearchEnabled,
  TenorRateLimitError,
} from '@/lib/gifs/tenor';

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
    const results = await fetchGifsCached(query);
    return NextResponse.json({ enabled: true, results });
  } catch (error) {
    // Tenor allows one request per second across the whole key, so this is a
    // condition the product has to have an answer for rather than an
    // exception. The cache makes it rare; this makes it legible when it
    // happens, because "too many people are searching right now" is a
    // different and more honest thing to say than "something went wrong".
    if (error instanceof TenorRateLimitError) {
      return NextResponse.json(
        {
          enabled: true,
          results: [],
          error: 'Lots of GIF searches right now. Try again in a second.',
        },
        { status: 429 }
      );
    }

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
