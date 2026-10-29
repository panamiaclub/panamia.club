import { forceInt } from '@/lib/standardized';
import type { DirectorySort } from '@/lib/query/directory';
import { parseDirectoryRadius } from '@/lib/directory-radius';

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
    radius: parseDirectoryRadius(searchParams.get('radius')),
    certifiedOnly: searchParams.get('certified') === 'true',
    withEventsOnly: searchParams.get('events') === 'true',
    view: (searchParams.get('view') === 'map' ? 'map' : 'list') as
      'map' | 'list',
  };
}
