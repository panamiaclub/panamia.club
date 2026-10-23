'use client';

import { Crosshair, MapPin } from 'lucide-react';
import type { LocationStatus } from '@/app/p/[user]/_lib/use-viewer-location';
import {
  directoryRadiusMiles,
  type DirectoryRadius,
} from '@/lib/directory-radius';
import { DirectorySuggest } from '@/components/directory-suggest';
import { ScopeMenuLive } from '@/components/scope-menu-live';

const QUICK_SEARCHES = ['Food', 'Art', 'Wellness', 'Bike repair'];

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
 * The top of the directory view.
 *
 * The directory is now the only thing this band sits on top of. It used to be
 * shared with four scope pages — Everything, Panas, Groups, Events all
 * rendered it — and the shape it has is still owed to that: a tall indigo
 * band with the term as a headline, because a compact white toolbar and a
 * tall band on the same search made the site look like two products depending
 * on which URL you arrived through. The scope pages are gone, each kind now
 * having a page built for it, but the band stays because it is the better of
 * the two and the rest of the club now matches it.
 *
 * The cost is real and was accepted deliberately. This page does not scroll —
 * the map holds the right half and the list scrolls inside its own pane — so
 * every pixel spent here is a pixel taken from results rather than from empty
 * space. The counter-argument was that this makes a band the wrong shape for
 * a page you refine five times in a row. That argument lost to consistency: a
 * member who cannot tell whether they are still in the same product is a
 * worse outcome than a member who sees three results instead of four before
 * scrolling.
 *
 * Four things must keep surviving any future edit here:
 *
 * - The count is `role="status"`. It changes client-side, so it has to
 *   announce rather than silently rewrite itself.
 * - Submitting runs `onSearch` rather than navigating. The filters, sort and
 *   map view live in this page's query string and a route push would drop
 *   them.
 * - The location bar stays. It is the one control that turns a list of
 *   listings into a list you can get to, and it has no equivalent on the
 *   other three pages because only directory listings have addresses to
 *   measure from.
 * - The scope menu stays, in link mode. The directory holds one kind now, so
 *   the menu is no longer a filter over this page's results — it is the way
 *   out to the other three, carrying the term you already typed. Someone who
 *   searched "cumbia" and got listings should be one click from the events.
 *
 * "Listings" rather than "businesses" throughout, which is not a synonym
 * swap: a directory account can be claimed by a band, a co-op or a non-profit
 * as well as a shop, and calling all of them businesses told a good share of
 * the people in here that the page was not for them.
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
        <div className="dirsearch-heading">
          <span className="section-eyebrow">Directory</span>
          <h1 className="dirsearch-title">
            Connect to your local community 🏘️
          </h1>

          <p className="dirsearch-count" role="status" aria-live="polite">
            {loading ? (
              <>Searching…</>
            ) : resultCount === 0 ? (
              <>No matches yet — try a broader search</>
            ) : (
              <>
                <strong>{resultCount}</strong>
                {resultCount === totalCount
                  ? resultCount === 1
                    ? ' listing'
                    : ' listings'
                  : ` of ${totalCount}`}{' '}
                {shared && radiusMiles !== null
                  ? ` within ${radiusMiles} miles`
                  : ' in South Florida'}
                {shared &&
                  (nearestFirst ? ', closest first' : ', with distances')}
              </>
            )}
          </p>
        </div>

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
            <div className="dirsearch-locbar">
              {shared ? (
                <>
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {radiusMiles === null ? (
                      <>
                        Distances from <strong>your location</strong>
                      </>
                    ) : (
                      <>
                        Within <strong>{radiusMiles} miles</strong> of your
                        location
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

            <div className="dirsearch-quick" aria-label="Popular searches">
              <span>Popular:</span>
              {QUICK_SEARCHES.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onSearch(label.toLowerCase())}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
