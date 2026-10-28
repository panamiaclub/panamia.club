'use client';

import Image from 'next/image';
import { ArrowRight, Globe, MapPin, Store } from 'lucide-react';
import { projectMockCoordinates } from '../../_data/map';
import { LISTINGS } from '../_data';

/**
 * The map half of the directory.
 *
 * Why this is not a toggle
 * ------------------------
 * The live directory stopped treating the map as an alternative view some
 * time ago, and the reasoning is written into app/globals.css next to the
 * split layout: a map you have to switch to is "a map you consult once and
 * then forget — you left the results to find out where anything was, and left
 * the map to read anything about it". Above 72rem both panes are on screen
 * and the CSS deletes the List/Map toggle outright. This mock had regressed
 * that: it showed the toggle at every width over a single column with no map
 * behind it at all, which misrepresents the page it exists to review.
 *
 * Why the map is drawn rather than loaded
 * ---------------------------------------
 * The live pane renders pigeon-maps against real tiles. A mock should not
 * reach for a tile server to prove a layout, so this projects the fixtures
 * into a plain box the same way /mock/directory already does — the precedent
 * is `app/mock/directory/_components/map-panel.tsx`. What is under review
 * here is the arrangement: a readable results column that keeps its map, pins
 * carrying enough identity to be worth clicking, and an honest account of the
 * results that have no address to pin.
 */

export function MapPane({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const pinned = LISTINGS.filter((b) => b.coords !== null);
  const offMap = LISTINGS.filter((b) => b.coords === null);

  const selected = pinned.find((b) => b.id === selectedId) ?? pinned[0] ?? null;

  return (
    <div className="dirsearch-map">
      <div className="dirsearch-map-grid" aria-hidden="true" />

      {pinned.map((listing) => (
        <button
          key={listing.id}
          type="button"
          className="dirsearch-map-pin"
          data-on={listing.id === selected?.id}
          style={projectMockCoordinates(listing.coords!)}
          onClick={() => onSelect(listing.id)}
          aria-label={`${listing.name}, ${listing.where}`}
        >
          {listing.badge ? (
            <Image
              src={listing.badge}
              alt=""
              width={34}
              height={34}
              aria-hidden="true"
            />
          ) : (
            /* Half these fixtures have no logo on purpose, and a pin is the
               one place a missing image cannot just collapse — an empty pin
               is indistinguishable from a broken one. */
            <Store className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      ))}

      {offMap.length > 0 && (
        <p className="dirsearch-mapoffmap">
          <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
          {offMap.length === 1
            ? '1 result has no address to plot.'
            : `${offMap.length} results have no address to plot.`}
        </p>
      )}

      {selected && (
        <div className="dirsearch-map-card">
          {selected.badge ? (
            <Image
              src={selected.badge}
              alt=""
              width={44}
              height={44}
              aria-hidden="true"
            />
          ) : (
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: 'rgb(48 62 140 / 0.1)' }}
              aria-hidden="true"
            >
              <Store className="h-5 w-5 opacity-70" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="dirsearch-map-card-name">{selected.name}</p>
            <p className="dirsearch-map-card-meta">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {selected.where}
              {selected.distance && ` · ${selected.distance}`}
            </p>
          </div>

          <span className="dirsearch-map-card-go">
            View
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      )}

      {/* Top-right belongs to the off-map pill, which is positioned there by
          globals.css and is real information. This note is scaffolding, so it
          takes the free corner rather than fighting for that one. */}
      <p
        className="dirsearch-map-note"
        style={{ right: 'auto', left: '0.8rem' }}
      >
        Illustrative map — the built page plots these on real tiles.
      </p>
    </div>
  );
}
