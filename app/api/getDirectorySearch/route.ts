import { NextRequest, NextResponse } from 'next/server';
import { forceInt, forceString } from '@/lib/standardized';
import { getSearch, isDirectorySort } from '@/lib/server/directory';
import { parseDirectoryRadius } from '@/lib/directory-radius';

/**
 * The Workers edge cache, when there is one.
 *
 * This route has always carried `s-maxage`, but a header alone caches
 * nothing: Cloudflare does not run responses returned from a Worker's fetch
 * handler through its cache, so the only thing honouring it was the visitor's
 * own browser. Every first search from every visitor went to Postgres, which
 * is exactly the traffic the TTL was written to absorb.
 *
 * Typed structurally rather than pulled from @cloudflare/workers-types, which
 * this project does not install: the DOM lib's CacheStorage has no `default`,
 * so the global needs narrowing either way. Returns null off-Workers — the
 * plain Node dev server has no such global — so the caller degrades to
 * querying every time rather than throwing.
 */
interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

function edgeCache(): EdgeCache | null {
  const store = (globalThis as { caches?: { default?: unknown } }).caches;
  const candidate = store?.default as EdgeCache | undefined;
  return candidate && typeof candidate.match === 'function' ? candidate : null;
}

/**
 * Coarsen a coordinate before it is used.
 *
 * Two decimal places is about a kilometre, which is more than enough to say
 * "3 mi away" and not enough to say where somebody lives. It also bounds the
 * edge-cache key: full precision would make every visitor's URL unique, so the
 * cache would never hit and every raw location would end up in a CDN log.
 */
function coarsen(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || value.trim() === '') return '';
  return parsed.toFixed(2);
}

export async function GET(request: NextRequest) {
  const searchParams =
    request.nextUrl?.searchParams ?? new URL(request.url).searchParams;
  const pageNum = forceInt(
    forceString(searchParams.get('page') || undefined, '1'),
    1
  );
  const pageLimit = forceInt(
    forceString(searchParams.get('limit') || undefined, '20'),
    20
  );
  const searchTerm = forceString(searchParams.get('q') || undefined, '');
  const filterCategories = forceString(
    searchParams.get('fcat') || undefined,
    ''
  );
  const geolat = coarsen(
    forceString(searchParams.get('geolat') || undefined, '')
  );
  const geolng = coarsen(
    forceString(searchParams.get('geolng') || undefined, '')
  );
  const resultsView = forceString(searchParams.get('v') || undefined, '');
  const sortParam = searchParams.get('sort');
  // An unrecognised sort falls back to relevance rather than erroring: it
  // arrives from a URL somebody may have edited or a link from an older build.
  const sort = isDirectorySort(sortParam) ? sortParam : 'relevance';
  const radius = parseDirectoryRadius(searchParams.get('radius'));
  const certifiedOnly = searchParams.get('certified') === 'true';
  const withEventsOnly = searchParams.get('events') === 'true';
  const mentorsOnly = searchParams.get('mentors') === 'true';
  const expertise = forceString(searchParams.get('expertise') || undefined, '');
  const languages = forceString(searchParams.get('lang') || undefined, '');
  const freeOnly = searchParams.get('free') === 'true';

  // Public, anonymous directory data — cacheable at the edge. Keyed by full
  // URL, so each distinct search caches separately.
  //
  // Empty searches are ordinary paginated directory results now, so browse
  // responses are as cacheable as term searches.
  const cache = edgeCache();
  const cacheKey = cache ? new Request(request.url, { method: 'GET' }) : null;
  if (cache && cacheKey) {
    // Never let a cache fault take the endpoint down with it — a miss is a
    // slow answer, an exception here is no answer.
    const hit = await cache.match(cacheKey).catch(() => undefined);
    if (hit) return hit;
  }

  const params = {
    pageNum,
    pageLimit,
    searchTerm,
    filterCategories,
    geolat,
    geolng,
    radius,
    resultsView,
    sort,
    certifiedOnly,
    withEventsOnly,
    mentorsOnly,
    expertise,
    languages,
    freeOnly,
  };

  // Read by the browser and by the edge cache above.
  const cacheHeaders = {
    'Cache-Control':
      'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
  };

  const apiResponse = await getSearch(params);
  const response = NextResponse.json(
    apiResponse ?? {
      success: true,
      data: [],
      pagination: { page: pageNum, limit: pageLimit, total: 0, totalPages: 0 },
    },
    { headers: cacheHeaders }
  );

  if (cache && cacheKey) {
    // clone() because put() consumes the body it is handed, and the original
    // still has to be returned to the caller. Awaited rather than fired and
    // forgotten: a route handler has no executionCtx.waitUntil, so an
    // unawaited put races the response and is cancelled more often than not.
    await cache.put(cacheKey, response.clone()).catch(() => {});
  }

  return response;
}
