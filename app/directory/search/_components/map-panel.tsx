'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, Globe, MapPin } from 'lucide-react';
import type { SearchResultsInterface } from '@/lib/query/directory';
import { isUnoptimizableImageSrc } from '@/lib/image-src';
import { distanceInMiles, type Coords } from '@/app/p/[user]/_lib/profile-view';
import {
  directoryRadiusMiles,
  type DirectoryRadius,
} from '@/lib/directory-radius';
import { formatDistance, resultCoords, resultHref } from '../_lib/format';
import type { MapCanvasPin } from './map-canvas';
import {
  FALLBACK_MAP_PX,
  frameForPoints,
  onResultsArrived,
  viewerFrame,
} from '../_lib/map-frame';

/**
 * The map engine is client-only: maplibre-gl wants `window` and a WebGL
 * context the moment it is imported, which the server has neither of.
 */
const MapCanvas = dynamic(() => import('./map-canvas'), {
  ssr: false,
  loading: () => <div className="dirsearch-mapcanvas" aria-hidden="true" />,
});

const FALLBACK_LOGO = '/img/bg_coconut_blue.jpg';

interface MapPanelProps {
  results: SearchResultsInterface[];
  viewerCoords: Coords | null;
  radius: DirectoryRadius;
  /**
   * The result the cursor is over in the results column, if any. Highlights
   * the matching pin without moving the map.
   */
  highlightId?: string | null;
  /** Called when a pin is chosen, so the list can scroll to the same result. */
  onPinSelect?: (id: string) => void;
}

interface Pin {
  result: SearchResultsInterface;
  coords: Coords;
  distance: number | null;
  index: number;
}

/** The pins' coordinates, which are all the framing maths needs. */
const pointsOf = (pins: Pin[]) => pins.map((pin) => pin.coords);

/**
 * Results on a map.
 *
 * The map is a peer of the list, not a decoration: it is how you answer "what
 * is near me" when you do not yet know what you are looking for. It used to
 * carry its own compact list of the pinned results, because it was one half of
 * a List/Map toggle and needed to be legible alone. It is no longer alone —
 * the results column beside it is the list, permanently — so the copy is gone
 * and the map gets the whole pane. Hovering a card lights its pin; clicking a
 * pin scrolls the column to its card.
 *
 * Pins carry the business logo instead of a generic dot. On a map of thirty
 * results, identity is the whole point; thirty identical pins force a click to
 * learn anything.
 */
export function MapPanel({
  results,
  viewerCoords,
  radius,
  highlightId = null,
  onPinSelect,
}: MapPanelProps) {
  const pins = useMemo<Pin[]>(
    () =>
      results.flatMap((result, index) => {
        if (result.online_only) return [];
        const coords = resultCoords(result);
        if (!coords) return [];
        return [
          {
            result,
            coords,
            distance: viewerCoords
              ? distanceInMiles(viewerCoords, coords)
              : null,
            index: index + 1,
          },
        ];
      }),
    [results, viewerCoords]
  );

  const offMapCount = results.length - pins.length;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState(() => frameForPoints(pointsOf(pins)));

  // Read without subscribing: a re-frame should be triggered by the result set
  // or by a new location, not by every render in between — and `pins` changes
  // identity whenever either of those moves.
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const mapRef = useRef<HTMLDivElement>(null);

  /** The map's short side, so the radius holds vertically as well as across. */
  const mapSizePx = () => {
    const box = mapRef.current?.getBoundingClientRect();
    const side = box ? Math.min(box.width, box.height) : 0;
    return side > 0 ? side : FALLBACK_MAP_PX;
  };

  /**
   * Whether the viewer's frame still outranks the next result set.
   *
   * Held in a ref rather than state because it decides what an effect does
   * without itself being worth a render. See onResultsArrived.
   */
  const viewerFramePending = useRef(false);

  // Re-frame when the result set changes, not on every render: panning the map
  // must survive a re-render, but a new search should not leave the viewer
  // looking at the old neighbourhood.
  const pinKey = pins
    .map((pin) => pin.result._id)
    .sort()
    .join(',');
  useEffect(() => {
    const decision = onResultsArrived(
      viewerFramePending.current,
      pinsRef.current.length
    );
    viewerFramePending.current = decision.viewerFramePending;
    if (!decision.reframe) return;

    setView(frameForPoints(pointsOf(pinsRef.current)));
    setSelectedId(null);
  }, [pinKey]);

  // Drop to the viewer's own neighbourhood the moment their location is known.
  // Fitting every pin is the right default while the map is about the results,
  // but once it can be about *them* a region-wide frame is too far out to act
  // on: at that span the nearest coffee and one forty minutes away sit a few
  // pixels apart. Keyed on the numbers rather than the object so this runs
  // when the location actually changes, not whenever the parent re-renders.
  const viewerLat = viewerCoords?.lat ?? null;
  const viewerLng = viewerCoords?.lng ?? null;
  const radiusMiles = directoryRadiusMiles(radius);
  useEffect(() => {
    if (viewerLat === null || viewerLng === null || radiusMiles === null) {
      viewerFramePending.current = false;
      setView(frameForPoints(pointsOf(pinsRef.current)));
      setSelectedId(null);
      return;
    }
    viewerFramePending.current = true;
    setView(
      viewerFrame({ lat: viewerLat, lng: viewerLng }, mapSizePx(), radiusMiles)
    );
    setSelectedId(null);
  }, [viewerLat, viewerLng, radiusMiles]);

  const selected = pins.find((pin) => pin.result._id === selectedId) ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    onPinSelect?.(id);
    const pin = pins.find((item) => item.result._id === id);
    if (pin) {
      // Centre on the choice rather than only highlighting it — a selection
      // off the edge of the viewport reads as a click that did nothing.
      setView((current) => ({
        center: [pin.coords.lat, pin.coords.lng],
        zoom: Math.max(current.zoom, 12),
      }));
    }
  };

  // The pins' markup lives here, not in the canvas: the canvas should know how
  // to place a node on the map, and nothing about what a result looks like.
  const canvasPins = useMemo<MapCanvasPin[]>(
    () =>
      pins.map(({ result, coords, index }) => ({
        id: result._id,
        lat: coords.lat,
        lng: coords.lng,
        content: (
          <button
            type="button"
            className="dirsearch-pin"
            data-on={result._id === selectedId || result._id === highlightId}
            onClick={() => select(result._id)}
            aria-label={`${result.name}, ${result.primary_address?.city ?? 'South Florida'}`}
          >
            <span aria-hidden="true">{index}</span>
            <Image
              src={result.images?.primaryCDN || FALLBACK_LOGO}
              alt=""
              width={34}
              height={34}
              aria-hidden="true"
              unoptimized={isUnoptimizableImageSrc(result.images?.primaryCDN)}
            />
          </button>
        ),
      })),
    // Rebuilt when the pins or the two highlight ids change — not when
    // `select` is recreated, which is every render.
    [pins, selectedId, highlightId]
  );

  return (
    <div className="dirsearch-map" ref={mapRef}>
      <MapCanvas
        view={view}
        onViewChange={setView}
        pins={canvasPins}
        viewer={viewerCoords}
      />

      {/* Online-only businesses match the search but cannot be plotted.
          Dropping them silently would make the map quietly lossy, so the count
          sits on the map itself — the only place left to say it now that the
          map has no list of its own. */}
      {offMapCount > 0 && (
        <p className="dirsearch-mapoffmap">
          <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
          {offMapCount === 1
            ? '1 result has no address to plot.'
            : `${offMapCount} results have no address to plot.`}
        </p>
      )}

      {selected && (
        <div className="dirsearch-map-card">
          <Image
            src={selected.result.images?.primaryCDN || FALLBACK_LOGO}
            alt=""
            width={44}
            height={44}
            aria-hidden="true"
            unoptimized={isUnoptimizableImageSrc(
              selected.result.images?.primaryCDN
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="dirsearch-map-card-name">{selected.result.name}</p>
            <p className="dirsearch-map-card-meta">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {selected.result.primary_address?.city}
              {selected.distance !== null &&
                ` · ${formatDistance(selected.distance)}`}
            </p>
          </div>
          <Link
            href={resultHref(selected.result)}
            className="dirsearch-map-card-go"
          >
            View
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
