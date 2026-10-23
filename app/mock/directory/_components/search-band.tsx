'use client';

import { type FormEvent, useState } from 'react';
import { Crosshair, MapPin, Search } from 'lucide-react';

interface SearchBandProps {
  term: string;
  resultCount: number;
  totalCount: number;
  locationShared: boolean;
  /** True only when the active sort is distance-based. */
  nearestFirst: boolean;
  /** Human-readable stand-in for the viewer's position. */
  viewerPlace: string;
  onSearch: (term: string) => void;
  onShareLocation: () => void;
}

/**
 * The top of the results page.
 *
 * Three jobs, in order of how often they matter:
 *
 * 1. Say what was searched, and let it be changed without going back. The
 *    current page drops the term into a small input inside a white card and
 *    never repeats it, so a search that went wrong looks the same as one that
 *    found nothing.
 * 2. Say how many results there are, in words, before the list starts.
 * 3. Offer location. This is the one control that turns a list of businesses
 *    into a list of businesses you can actually get to, so it sits in the
 *    header rather than behind the filter dialog where it would never be
 *    found.
 */
export function SearchBand({
  term,
  resultCount,
  totalCount,
  locationShared,
  nearestFirst,
  viewerPlace,
  onSearch,
  onShareLocation,
}: SearchBandProps) {
  const [draft, setDraft] = useState(term);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(draft);
  };

  return (
    <section className="dirmock-band">
      <div className="dirmock-bandinner">
        <div className="dirmock-tools">
          <form onSubmit={handleSubmit} className="dirmock-search">
            <label htmlFor="dirsearch-input" className="sr-only">
              Search the Pana Mia directory
            </label>
            <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
            <input
              id="dirsearch-input"
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Try food, art, Hialeah, bike repair…"
              autoComplete="off"
            />
            <button type="submit">Search</button>
          </form>

          <div className="dirmock-toolrow">
            <p className="dirmock-resultcount" role="status" aria-live="polite">
              {resultCount === 0 ? (
                <>No matches yet</>
              ) : (
                <>
                  <strong>{resultCount}</strong>
                  {resultCount === totalCount
                    ? ' listings'
                    : ` of ${totalCount} listings`}
                  {locationShared && nearestFirst ? ', closest first' : ''}
                </>
              )}
            </p>

            <div className="dirmock-location">
              {locationShared ? (
                <>
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    From <strong>{viewerPlace}</strong>
                  </span>
                  <button type="button">Change</button>
                </>
              ) : (
                <>
                  <Crosshair className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>See what is closest to you</span>
                  <button type="button" onClick={onShareLocation}>
                    Use my location
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
