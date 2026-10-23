'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Globe, MapPin } from 'lucide-react';
import { formatDistance, type ScoredResult } from '../_data';

interface MapPanelProps {
  entries: ScoredResult[];
  locationShared: boolean;
  viewerPlace: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/**
 * Bounding box for the three counties the directory covers.
 *
 * Hard-coded because the mock has no tile provider — the real page would hand
 * these markers to a map library and delete all of this. What is being
 * reviewed here is the *layout*: a list that stays readable beside a map, and
 * markers that carry enough identity to be worth clicking.
 */
const BOUNDS = { minLat: 25.6, maxLat: 26.85, minLng: -80.5, maxLng: -80.0 };

function project({ lat, lng }: { lat: number; lng: number }) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  // Inset so a marker on the edge of the range is not clipped by the frame.
  return {
    left: `${6 + x * 0.88}%`,
    top: `${6 + y * 0.88}%`,
  };
}

export function MapPanel({
  entries,
  locationShared,
  viewerPlace,
  selectedId,
  onSelect,
  onHover,
}: MapPanelProps) {
  const mappable = entries.filter((entry) => entry.result.coords !== null);
  const onlineOnly = entries.filter((entry) => entry.result.coords === null);
  const selected =
    mappable.find((entry) => entry.result.id === selectedId) ?? mappable[0];

  return (
    <div className="dirmock-map">
      <div className="dirmock-mapgrid" aria-hidden="true" />

      {onlineOnly.length > 0 && (
        <p className="dirmock-offmap">
          <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
          {onlineOnly.length} online-only result
          {onlineOnly.length === 1 ? '' : 's'} not shown
        </p>
      )}

      {locationShared && (
        <span
          className="dirmock-you"
          style={project({ lat: 25.801, lng: -80.199 })}
          title={`You — ${viewerPlace}`}
        >
          <span />
          You
        </span>
      )}

      {mappable.map((entry, index) => {
        const { result } = entry;
        const on = result.id === selected?.result.id;
        return (
          <button
            key={result.id}
            type="button"
            className="dirmock-pin"
            data-on={on}
            style={project(result.coords!)}
            onClick={() => onSelect(result.id)}
            onMouseEnter={() => onHover(result.id)}
            onMouseLeave={() => onHover(null)}
            aria-label={`${index + 1}. ${result.name}, ${result.city}`}
          >
            <span>{index + 1}</span>
            <Image
              src={result.logo}
              alt=""
              width={34}
              height={34}
              aria-hidden="true"
            />
          </button>
        );
      })}

      {selected && (
        <div className="dirmock-mapcard">
          <Image
            src={selected.result.logo}
            alt=""
            width={48}
            height={48}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p>{selected.result.name}</p>
            <span>
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {selected.result.city}
              {selected.distance !== null &&
                ` · ${formatDistance(selected.distance)}`}
            </span>
          </div>
          <Link href={`/p/${selected.result.slug}`}>
            View
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
