import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { forceInt, forceString } from '@/lib/standardized';
import { getSearch, isDirectorySort } from '@/lib/server/directory';
import { parseDirectoryRadius } from '@/lib/directory-radius';

// Cache query variants in the shared data cache, not caches.default or the
// browser: visibility changes must be able to invalidate every variant.
const cachedSearch = unstable_cache(getSearch, ['directory-search'], {
  revalidate: 300,
  tags: ['directory'],
});

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

  return NextResponse.json(await cachedSearch(params), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
