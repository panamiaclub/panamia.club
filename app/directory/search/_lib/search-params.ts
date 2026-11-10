import { forceInt } from '@/lib/standardized';
import type { DirectorySort } from '@/lib/query/directory';

const SORTS: DirectorySort[] = ['relevance', 'nearest', 'recommended', 'name'];

export function getDirectorySearchParams(
  searchParams: URLSearchParams,
  pathTerm?: string
) {
  const rawSort = searchParams.get('sort');
  return {
    pageNum: forceInt(searchParams.get('p') || '', 1),
    pageLimit: forceInt(searchParams.get('l') || '', 20),
    searchTerm: pathTerm || searchParams.get('q') || '',
    filterCategories: searchParams.get('fcat') || '',
    mentorsOnly: searchParams.get('mentors') === 'true',
    expertise: searchParams.get('expertise') || '',
    languages: searchParams.get('lang') || '',
    freeOnly: searchParams.get('free') === 'true',
    sort: SORTS.includes(rawSort as DirectorySort)
      ? (rawSort as DirectorySort)
      : null,
    // The viewport, not a distance cutoff, defines the directory's area.
    // Explicitly override the API's radius default, including for old links.
    radius: 'all' as const,
    certifiedOnly: searchParams.get('certified') === 'true',
    withEventsOnly: searchParams.get('events') === 'true',
    view: (searchParams.get('view') === 'map' ? 'map' : 'list') as
      'map' | 'list',
  };
}
