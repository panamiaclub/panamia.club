'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PanaGateProvider } from '../business-profile/_components/pana-gate';
import {
  MockControls,
  type DirectoryMockState,
} from './_components/mock-controls';
import { SearchBand } from './_components/search-band';
import { FilterBar, type ResultView } from './_components/filter-bar';
import { ResultCard } from './_components/result-card';
import { MapPanel } from './_components/map-panel';
import { EmptyState } from './_components/empty-state';
import {
  directoryResults,
  MOCK_VIEWER_COORDS,
  runQuery,
  type QueryState,
} from './_data';

/**
 * Design mock for the directory search results page.
 *
 * Route: /mock/directory
 *
 * This is the screen a pana lands on after typing into the homepage hero, and
 * it is where the directory either works or doesn't. Today it renders a
 * vertical stack of near-identical white cards — the same problem the profile
 * page had — with every filter hidden behind a dialog, no sense of distance
 * until you open a listing, and no signal about which businesses other panas
 * actually vouch for. Scanning it, you cannot tell one result from another.
 *
 * The redesign is built around one question, because it is the question
 * someone searching a *local* directory is really asking: which of these is
 * worth my afternoon, and can I get to it? So every card leads with identity
 * (logo, cover, name), then proximity, then the two things only this community
 * can tell you — how many panas recommend it, and whether it is Pana Certified
 * — and finally what is happening there soon.
 *
 * Reviewing notes:
 * - Search, filters, sort, and the list/map toggle are all live against the
 *   fixture in `_data.ts`. Use it like a visitor would.
 * - The mock bar switches viewer kind. Save is gated for signed-out visitors
 *   and hidden entirely for business accounts, matching the profile page.
 * - Recommend is deliberately absent from the card; see `result-card.tsx`.
 *
 * Nothing here touches the database. When the design is signed off, these
 * components move to `app/directory/search/_components/` against a widened
 * `SearchResultsInterface`, and `app/mock/` is deleted.
 */
export default function DirectoryMockPage() {
  const [mock, setMock] = useState<DirectoryMockState>({
    locationShared: true,
    viewer: 'anon',
  });

  const [query, setQuery] = useState<QueryState>({
    term: 'art',
    categories: [],
    counties: [],
    certifiedOnly: false,
    openToEvents: false,
    sort: 'relevance',
  });

  const [view, setView] = useState<ResultView>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const viewerCoords = mock.locationShared ? MOCK_VIEWER_COORDS : null;
  const entries = useMemo(
    () => runQuery(query, viewerCoords),
    [query, viewerCoords]
  );

  const activeFilterCount =
    query.categories.length +
    query.counties.length +
    (query.certifiedOnly ? 1 : 0) +
    (query.openToEvents ? 1 : 0);

  const handleMockChange = (next: DirectoryMockState) => {
    setMock(next);
    // Nearest becomes meaningless the moment there is nothing to measure
    // from, and silently leaving it selected would show an order the viewer
    // cannot account for.
    if (!next.locationShared && query.sort === 'nearest') {
      setQuery((prev) => ({ ...prev, sort: 'relevance' }));
    }
  };

  return (
    <PanaGateProvider
      viewer={mock.viewer}
      businessName="this business"
      businessLogo="/img/impact/partner-bohemian-kitchen.webp"
    >
      <MockControls state={mock} onChange={handleMockChange} />

      <main className="dirmock">
        <section className="dirmock-workspace" data-view={view}>
          <div className="dirmock-listpane">
            <SearchBand
              term={query.term}
              resultCount={entries.length}
              totalCount={directoryResults.length}
              locationShared={mock.locationShared}
              nearestFirst={query.sort === 'nearest'}
              viewerPlace="Wynwood"
              onSearch={(term) => setQuery((prev) => ({ ...prev, term }))}
              onShareLocation={() =>
                setMock((prev) => ({ ...prev, locationShared: true }))
              }
            />

            <FilterBar
              query={query}
              onChange={setQuery}
              view={view}
              onViewChange={setView}
              locationShared={mock.locationShared}
            />

            <div className="dirmock-listscroll">
              {entries.length === 0 ? (
                <div className="dirmock-empty">
                  <EmptyState
                    query={query}
                    activeFilterCount={activeFilterCount}
                    onChange={setQuery}
                  />
                </div>
              ) : (
                <ul className="dirmock-list">
                  {entries.map((entry, index) => {
                    const activeId = hoveredId ?? selectedId;
                    return (
                      <li
                        key={entry.result.id}
                        data-on={activeId === entry.result.id}
                        data-selected={selectedId === entry.result.id}
                        onMouseEnter={() => setHoveredId(entry.result.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => setSelectedId(entry.result.id)}
                      >
                        <ResultCard
                          entry={entry}
                          index={index + 1}
                          locationShared={mock.locationShared}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="dirmock-tail">
                <div>
                  <strong>Know a place we missed?</strong>
                  <span>Help the directory grow.</span>
                </div>
                <Link href="/join">
                  Add a business
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>

          <div className="dirmock-mappane">
            <MapPanel
              entries={entries}
              locationShared={mock.locationShared}
              viewerPlace="Wynwood"
              selectedId={hoveredId ?? selectedId}
              onSelect={setSelectedId}
              onHover={setHoveredId}
            />
          </div>
        </section>
      </main>
    </PanaGateProvider>
  );
}
