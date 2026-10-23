'use client';

import { Crosshair, MapPin } from 'lucide-react';
import type { LocationStatus } from '@/app/p/[user]/_lib/use-viewer-location';
import {
  directoryRadiusMiles,
  type DirectoryRadius,
} from '@/lib/directory-radius';
import { DirectorySuggest } from '@/components/directory-suggest';
import { ScopeMenuLive } from '@/components/scope-menu-live';

interface SearchBandProps {
  term: string;
  resultCount: number;
  totalCount: number;
  loading: boolean;
  locationStatus: LocationStatus;
  radius: DirectoryRadius;
  /** True only when the active sort is distance-based. */
  nearestFirst: boolean;
  onSearch: (term: string) => void;
  onShareLocation: () => void;
}

/**
 * Search controls at the top of the results pane.
 *
 * The map begins at the top of the workspace, so this belongs inside the list
 * pane rather than spanning both panes. It stays outside the list scroller:
 * searching and changing location remain available while cards move beneath
 * them.
 *
 * - The count is `role="status"`. It changes client-side, so it has to
 *   announce rather than silently rewrite itself.
 * - Submitting runs `onSearch` rather than navigating. The filters, sort and
 *   map view live in this page's query string and a route push would drop
 *   them.
 * - The location control stays beside the count. It is what turns listings
 *   into places the viewer can reach.
 * - The scope menu stays, in link mode. The directory holds one kind now, so
 *   the menu is no longer a filter over this page's results — it is the way
 *   out to the other three, carrying the term you already typed. Someone who
 *   searched "cumbia" and got listings should be one click from the events.
 *
 * The h1 remains for document structure but is visually hidden; the search
 * field already says what the workspace is for, and repeating that as a large
 * marketing headline spent card space without adding information.
 */
export function SearchBand({
  term,
  resultCount,
  totalCount,
  loading,
  locationStatus,
  radius,
  nearestFirst,
  onSearch,
  onShareLocation,
}: SearchBandProps) {
  const shared = locationStatus === 'granted';
  const radiusMiles = directoryRadiusMiles(radius);

  return (
    <section className="dirsearch-band">
      <div className="dirsearch-bandinner">
        <h1 className="sr-only">Directory search</h1>

        <div className="dirsearch-tools">
          <div className="dirsearch-searchrow">
            <DirectorySuggest
              key={term}
              layout="pill"
              scope="directory"
              initialTerm={term}
              label="Search the Pana Mia directory"
              ariaLabel="Search the Pana Mia directory"
              placeholder="Try food, art, Hialeah, bike repair…"
              buttonLabel="Search"
              onSearch={onSearch}
              leading={<ScopeMenuLive scope="directory" term={term} />}
            />
          </div>

          <div className="dirsearch-toolrow">
            <p
              className="dirsearch-resultcount"
              role="status"
              aria-live="polite"
            >
              {loading ? (
                <>Searching…</>
              ) : resultCount === 0 ? (
                <>No matches yet</>
              ) : (
                <>
                  <strong>{resultCount}</strong>
                  {resultCount === totalCount
                    ? resultCount === 1
                      ? ' listing'
                      : ' listings'
                    : ` of ${totalCount} listings`}
                  {shared && nearestFirst ? ', closest first' : ''}
                </>
              )}
            </p>

            <div className="dirsearch-locbar">
              {shared ? (
                <>
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {radiusMiles === null ? (
                      <>
                        From <strong>your location</strong>
                      </>
                    ) : (
                      <>
                        Within <strong>{radiusMiles} miles</strong>
                      </>
                    )}
                  </span>
                </>
              ) : locationStatus === 'denied' ? (
                <>
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Location unavailable. Showing South Florida.</span>
                </>
              ) : (
                <>
                  <Crosshair className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>See what is closest to you</span>
                  <button
                    type="button"
                    className="dirsearch-locshare"
                    disabled={locationStatus === 'asking'}
                    onClick={onShareLocation}
                  >
                    {locationStatus === 'asking'
                      ? 'Locating…'
                      : 'Use my location'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
