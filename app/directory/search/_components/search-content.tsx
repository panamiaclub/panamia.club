'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useSearch, type DirectorySort } from '@/lib/query/directory';
import { forceInt } from '@/lib/standardized';
import { searchPath } from '@/lib/directory-search-path';
import {
  DEFAULT_DIRECTORY_RADIUS,
  effectiveDirectoryRadius,
  isDirectoryRadius,
  parseDirectoryRadius,
  type DirectoryRadius,
} from '@/lib/directory-radius';
import { useViewerLocation } from '@/app/p/[user]/_lib/use-viewer-location';
import { DirectoryViewerProvider } from './directory-viewer';
import { SearchBand } from './search-band';
import { FilterBar, type FilterState, type ResultView } from './filter-bar';
import { ResultCard } from './result-card';
import { MapPanel } from './map-panel';
import { EmptyState } from './empty-state';
import { SearchPagination } from './search-pagination';

const SORTS: DirectorySort[] = ['relevance', 'nearest', 'recommended', 'name'];

function toSort(raw: string | null): DirectorySort | null {
  return SORTS.includes(raw as DirectorySort) ? (raw as DirectorySort) : null;
}

/** `a+b+c` is the directory's existing multi-value encoding. Kept as-is. */
function splitList(raw: string): string[] {
  return raw ? raw.split('+').filter(Boolean) : [];
}

function getSearchParams(searchParams: URLSearchParams, pathTerm?: string) {
  const pageNum = forceInt(searchParams.get('p') || '', 1);
  const pageLimit = forceInt(searchParams.get('l') || '', 20);
  // A term in the path wins over ?q=. Both forms stay readable so existing
  // links and bookmarks keep working; the path form is the canonical one.
  const searchTerm = pathTerm || searchParams.get('q') || '';
  const filterCategories = searchParams.get('fcat') || '';
  const mentorsOnly = searchParams.get('mentors') === 'true';
  const expertise = searchParams.get('expertise') || '';
  const languages = searchParams.get('lang') || '';
  const freeOnly = searchParams.get('free') === 'true';

  return {
    pageNum,
    pageLimit,
    searchTerm,
    filterCategories,
    mentorsOnly,
    expertise,
    languages,
    freeOnly,
    sort: toSort(searchParams.get('sort')),
    radius: parseDirectoryRadius(searchParams.get('radius')),
    certifiedOnly: searchParams.get('certified') === 'true',
    withEventsOnly: searchParams.get('events') === 'true',
    view: (searchParams.get('view') === 'map' ? 'map' : 'list') as ResultView,
  };
}

interface DirectorySearchContentProps {
  /** Search term taken from the /directory/search/<term> path segment. */
  initialTerm?: string;
}

export function DirectorySearchContent({
  initialTerm,
}: DirectorySearchContentProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = getSearchParams(
    searchParams || new URLSearchParams(),
    initialTerm
  );

  // Precise coordinates stay in the browser. Only a 2dp version reaches the
  // server for radius filtering and ordering — see searchParamsToString.
  const { coords, status: locationStatus, request } = useViewerLocation();
  const locationShared = coords !== null;

  // A radius without coordinates cannot narrow anything. Keep the configured
  // URL state private-coordinate-free, but make the effective public fallback
  // the complete South Florida directory until cached or click-granted
  // coordinates are available.
  const effectiveRadius: DirectoryRadius = effectiveDirectoryRadius(
    params.radius,
    locationShared
  );

  // A missing sort means "use the product default for this scope": nearest for
  // a finite local radius, relevance everywhere else. A valid URL sort remains
  // explicit and wins, except nearest when there is nothing to measure from.
  const defaultSort: DirectorySort =
    locationShared && effectiveRadius !== 'all' ? 'nearest' : 'relevance';
  const sort: DirectorySort =
    params.sort === 'nearest' && !locationShared
      ? 'relevance'
      : (params.sort ?? defaultSort);

  const { data: searchResult, isLoading } = useSearch({
    ...params,
    sort,
    geolat: coords?.lat ?? 0,
    geolng: coords?.lng ?? 0,
    radius: effectiveRadius,
  });

  const results = useMemo(() => searchResult?.data ?? [], [searchResult]);
  const totalResults = searchResult?.pagination?.total ?? 0;
  const totalPages = searchResult?.pagination?.totalPages ?? 1;

  const profileIds = useMemo(
    () => results.map((result) => result._id),
    [results]
  );

  /**
   * Filters and pagination stay in the query string — only the term lives in
   * the path — so every navigation rebuilds the term's path and carries the
   * rest across as params. `q` is dropped on the way: keeping it would leave
   * two copies of the term in one URL, free to disagree.
   *
   * Wrapped in a transition because the term is a path segment, which makes
   * every search a route change rather than a param change. Without this the
   * router blocks on the new route's payload before it will render anything,
   * so pressing Search did nothing at all — no spinner, not even a changed
   * URL — for as long as the round trip took. Marking it a transition keeps
   * this page mounted and interactive and hands us `navigating`, so the
   * answer to a click is immediate and the wait is visible where the results
   * will appear.
   */
  const [navigating, startNavigation] = useTransition();

  const pushSearch = useCallback(
    (term: string, nextParams: URLSearchParams) => {
      nextParams.delete('q');
      const qs = nextParams.toString();
      startNavigation(() => {
        router.push(`${searchPath(term)}${qs ? `?${qs}` : ''}`);
      });
    },
    [router]
  );

  const replaceSearch = useCallback(
    (term: string, nextParams: URLSearchParams) => {
      nextParams.delete('q');
      const qs = nextParams.toString();
      router.replace(`${searchPath(term)}${qs ? `?${qs}` : ''}`);
    },
    [router]
  );

  /** Change some keys, keeping every key this page does not own. */
  const patch = useCallback(
    (changes: Record<string, string | null>, term = params.searchTerm) => {
      const next = new URLSearchParams(searchParams?.toString() || '');
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      pushSearch(term, next);
    },
    [params.searchTerm, pushSearch, searchParams]
  );

  // County filtering was removed from the public directory. Old links remain
  // valid, but stale or invalid state is stripped with replace() so it cannot
  // hide results or linger in copied URLs.
  const rawSearchParams = searchParams?.toString() || '';
  useEffect(() => {
    const next = new URLSearchParams(rawSearchParams);
    let changed = false;
    if (next.has('floc')) {
      next.delete('floc');
      changed = true;
    }
    const rawRadius = next.get('radius');
    if (rawRadius !== null && !isDirectoryRadius(rawRadius)) {
      next.delete('radius');
      changed = true;
    }
    if (params.sort === 'nearest' && locationStatus === 'denied') {
      next.delete('sort');
      changed = true;
    }
    if (locationStatus === 'denied' && params.radius !== 'all') {
      next.set('radius', 'all');
      changed = true;
    }
    if (!changed) return;
    replaceSearch(params.searchTerm, next);
  }, [
    locationStatus,
    params.radius,
    params.searchTerm,
    params.sort,
    rawSearchParams,
    replaceSearch,
  ]);

  const filters: FilterState = {
    categories: splitList(params.filterCategories),
    radius: params.radius,
    certifiedOnly: params.certifiedOnly,
    withEventsOnly: params.withEventsOnly,
    sort,
  };

  const applyFilters = (next: FilterState) => {
    const changes: Record<string, string | null> = {
      fcat: next.categories.join('+') || null,
      certified: next.certifiedOnly ? 'true' : null,
      events: next.withEventsOnly ? 'true' : null,
      // Any change to what is being asked invalidates which page you were on.
      p: null,
    };
    // Only persist radius when the radius control changed. An unrelated
    // category or checkbox change must preserve the configured URL mode.
    if (next.radius !== params.radius) {
      changes.radius =
        next.radius === DEFAULT_DIRECTORY_RADIUS ? null : next.radius;
    }
    // Preserve implicit dynamic defaults across unrelated filter changes.
    // Only write a sort when the visitor actually changed the sort control.
    if (next.sort !== sort) changes.sort = next.sort;
    patch(changes);
  };

  const handleSearch = (term: string) => {
    // A new term resets pagination and filters; stale filters would silently
    // narrow a search the visitor thinks is fresh.
    pushSearch(term, new URLSearchParams());
  };

  // Two waits the visitor cannot tell apart and should not have to: the route
  // change that carries the new term, and the query that fetches its results.
  // They run back to back, so treating them as one "busy" keeps the skeletons
  // up for the whole wait instead of flashing the old list in between.
  const busy = isLoading || navigating;

  const showEmpty = !busy && results.length === 0;

  // Which card the cursor is over, so the matching pin can light up. Held here
  // rather than in either pane because it is the one piece of state the list
  // and the map both need, and the whole point of showing them together.
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Which result a pin click chose, kept apart from `hoveredId` because the
  // two answer different questions and have different lifetimes. Hover is "the
  // cursor is here, for as long as it is here"; a choice is "this is the one I
  // asked about", and it has to survive the very next thing the visitor does —
  // which is move the mouse onto the column to read the card. Sharing one piece
  // of state meant the highlight was stolen by whatever card the cursor crossed
  // and then dropped entirely when it left the list, so the answer to "which
  // card is this pin?" was gone before it could be read.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // A new result set means the old scroll position is about a different list,
  // and the old selection is about a business that may not even be in it.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
    setHoveredId(null);
    setSelectedId(null);
  }, [searchResult]);

  // The map drops its own selection the moment the viewer's location arrives,
  // because it re-frames to their neighbourhood and the chosen pin may not be
  // in the new frame at all. Clearing here too keeps the two panes telling the
  // same story: without it the column would go on showing a chosen card whose
  // pin is no longer marked, or on screen. Keyed on the numbers rather than the
  // object so this follows an actual move, not every parent render.
  const viewerLat = coords?.lat ?? null;
  const viewerLng = coords?.lng ?? null;
  useEffect(() => {
    setSelectedId(null);
  }, [viewerLat, viewerLng]);

  // Clicking a pin has to move the list, or the map is a lookup table you
  // cannot act on: you learn a logo is three blocks away and then have to find
  // it again by hand among twenty cards.
  //
  // `nearest` scrolls the least it can get away with, which keeps a card that
  // is already on screen from jumping — but on its own it parks the card hard
  // against whichever edge it came from. The breathing room is CSS's job:
  // `.dirsearch-grid > li` carries a `scroll-margin-block` that this honours.
  const handlePinSelect = useCallback((id: string) => {
    setSelectedId(id);
    const card = document.getElementById(`dirsearch-result-${id}`);
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  return (
    <DirectoryViewerProvider profileIds={profileIds}>
      {/* data-view is read by CSS below the split's breakpoint, where the two
          panes cannot both fit and the List/Map toggle decides which one the
          screen belongs to. Above it the attribute is inert: both panes show,
          and the toggle is hidden. */}
      <main className="dirsearch dirsearch-split" data-view={params.view}>
        {/* Above the panes, not inside the list column. The band is the page's
            header — it names the scope, carries the term and owns the h1 — and
            a header that sits in one of two side-by-side panes reads as a
            property of that pane. The scope pages put it full width; so does
            this now. `.dirsearch-split` is the flex column that lets the panes
            take whatever height is left over. */}
        <SearchBand
          term={params.searchTerm}
          resultCount={results.length}
          totalCount={totalResults}
          loading={busy}
          locationStatus={locationStatus}
          radius={effectiveRadius}
          nearestFirst={sort === 'nearest'}
          onSearch={handleSearch}
          onShareLocation={request}
        />

        <div className="dirsearch-panes">
          <section className="dirsearch-listpane" aria-label="Search results">
            {/* Outside the scroller on purpose. The controls that change the
                results are the ones you reach for after reading a few, and a
                header you have to scroll back up to find is a header that gets
                used once. */}
            <div className="dirsearch-listhead">
              <FilterBar
                filters={filters}
                onChange={applyFilters}
                view={params.view}
                onViewChange={(next) =>
                  patch({ view: next === 'map' ? 'map' : null })
                }
                locationShared={locationShared}
              />
            </div>

            <div className="dirsearch-listscroll" ref={listRef}>
              <div className="dirsearch-listbody">
                {busy ? (
                  <div className="dirsearch-results">
                    <ul className="dirsearch-grid" aria-busy="true">
                      {[0, 1, 2].map((index) => (
                        <li key={index} className="dirsearch-skeleton" />
                      ))}
                    </ul>
                  </div>
                ) : showEmpty ? (
                  <EmptyState
                    term={params.searchTerm}
                    filters={filters}
                    radiusActive={locationShared}
                    onChange={applyFilters}
                    onTermChange={handleSearch}
                  />
                ) : (
                  <div className="dirsearch-results">
                    <ul className="dirsearch-grid">
                      {results.map((result) => (
                        <li
                          key={result._id}
                          id={`dirsearch-result-${result._id}`}
                          data-on={result._id === hoveredId}
                          data-selected={result._id === selectedId}
                          onMouseEnter={() => setHoveredId(result._id)}
                          onMouseLeave={() => setHoveredId(null)}
                          onFocus={() => setHoveredId(result._id)}
                          onBlur={() => setHoveredId(null)}
                        >
                          <ResultCard result={result} viewerCoords={coords} />
                        </li>
                      ))}
                    </ul>

                    {totalPages > 1 && (
                      <SearchPagination
                        currentPage={params.pageNum}
                        totalPages={totalPages}
                        totalResults={totalResults}
                        onPageChange={(page) => patch({ p: page.toString() })}
                      />
                    )}
                  </div>
                )}

                {/* The two standing invitations the old page buried among four
                    stacked cards. Kept, but once each, and after the results
                    rather than competing with them. The page footer is gone at
                    this width, so this is also the last thing in the column —
                    which is the right place for an ask you only act on once
                    the search has failed to find you what you came for. */}
                <aside className="dirsearch-cta">
                  <div>
                    <h2>Not listed yet?</h2>
                    <p>
                      A listing is how South Florida finds you — free, and yours
                      to run.
                    </p>
                    <Link href="/form/get-listed" className="link-arrow">
                      List your business
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                  <div>
                    <h2>Missing someone?</h2>
                    <p>
                      Tell us about a local spot you love and we will reach out
                      to them.
                    </p>
                    <Link href="/form/contact-us" className="link-arrow">
                      Send a recommendation
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </aside>

                {/* Required by the Pexels API guidelines, which ask for a
                    prominent link back in exchange for the photo pool seeded
                    listings use. It sits here rather than in the site footer
                    because the footer is hidden at this width, and because
                    this is the column those photos actually appear in. Real
                    businesses upload their own photos, so this line retires
                    itself once the seeded listings are claimed. */}
                <p className="dirsearch-photocredit">
                  Listing photos from{' '}
                  <a
                    href="https://www.pexels.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Pexels
                  </a>
                  .
                </p>
              </div>
            </div>
          </section>

          {/* Always mounted. Below the breakpoint CSS collapses this pane to
              nothing unless the toggle asks for it, and a zero-size map loads
              no tiles — so keeping it in the tree costs nothing and spares the
              map a remount, and a re-frame, every time the toggle is used. */}
          <aside className="dirsearch-mappane" aria-label="Results on a map">
            <MapPanel
              results={results}
              viewerCoords={coords}
              radius={effectiveRadius}
              highlightId={hoveredId}
              onPinSelect={handlePinSelect}
            />
          </aside>
        </div>
      </main>
    </DirectoryViewerProvider>
  );
}
