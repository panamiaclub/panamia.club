'use client';

/**
 * The WebGL half of the directory map.
 *
 * Split out from MapPanel for one reason: maplibre-gl reaches for `window` and
 * a WebGL context at import time, so it cannot be part of a module the server
 * renders. MapPanel imports this through `next/dynamic` with `ssr: false`,
 * which means everything that touches the map engine has to live on this side
 * of that boundary — including the pins, which the map positions.
 *
 * Everything that is *not* the engine — which results have coordinates, where
 * to frame, which card is open — stays in MapPanel, where it can be read and
 * tested without a GPU.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
/* MapLibre's stylesheet is imported from app/globals.css, not here — see the
   note there. Importing it from this lazily-loaded module breaks the map. */
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { panaMapStyle } from '@/lib/map/pana-basemap';
import type { MapFrame } from '../_lib/map-frame';

/* maplibre-gl parses tiles in a web worker, and resolves that worker against
   its own bundled chunk path. Our build does not emit it there, so the default
   URL 404s and every map silently fails to load. Asking the bundler for the
   worker's real emitted URL keeps it pinned to the installed version instead
   of a hand-copied duplicate that can drift. */
setWorkerUrl(maplibreWorkerUrl);

export interface MapCanvasPin {
  id: string;
  lat: number;
  lng: number;
  /** The pin's markup, owned by MapPanel so this file holds no product copy. */
  content: ReactNode;
}

interface MapCanvasProps {
  view: MapFrame;
  onViewChange: (frame: MapFrame) => void;
  pins: MapCanvasPin[];
  viewer: { lat: number; lng: number } | null;
}

/** Below this the two frames are the same view, and moving would be a jitter. */
const SAME_VIEW_DEGREES = 1e-6;
const SAME_VIEW_ZOOM = 0.01;

export default function MapCanvas({
  view,
  onViewChange,
  pins,
  viewer,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const viewRef = useRef(view);
  viewRef.current = view;

  // Latest callback without re-subscribing: the map is created once, but
  // `onViewChange` is a new function on every render of the parent.
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  // Create the map once. The style is built here rather than imported as JSON
  // so the palette stays in TypeScript next to the rest of the design.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    setFailed(false);
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: containerRef.current,
        style: panaMapStyle(),
        center: [view.center[1], view.center[0]],
        zoom: view.zoom,
        minZoom: 3,
        // Past the archive's z15 MapLibre scales the geometry it already has,
        // which stays sharp — so the viewer is not stopped at the data's limit.
        maxZoom: 18,
        attributionControl: { compact: true },
        // The directory map answers "what is near here". Tilting and spinning it
        // only makes that harder to read, and makes the pins' maths harder too.
        pitchWithRotate: false,
        dragRotate: false,
        touchZoomRotate: false,
      });
    } catch (error) {
      console.error('Could not create the directory map:', error);
      containerRef.current.replaceChildren();
      setFailed(true);
      return;
    }

    let reportedFailure = false;
    instance.on('error', (event) => {
      if (!reportedFailure) {
        console.error('Could not load the directory map:', event.error);
        reportedFailure = true;
      }
      setFailed(true);
    });

    instance.addControl(
      new NavigationControl({ showCompass: false }),
      'top-left'
    );

    instance.on('moveend', (event) => {
      if (!event.originalEvent) return;
      const centre = instance.getCenter();
      onViewChangeRef.current({
        center: [centre.lat, centre.lng],
        zoom: instance.getZoom(),
      });
    });

    mapRef.current = instance;
    setMap(instance);

    return () => {
      instance.remove();
      mapRef.current = null;
      setMap(null);
    };
    // Recreate only on an explicit retry; later views use the effect below.
  }, [attempt]);

  // Follow the parent's frame when it changes for a reason other than the user
  // having just moved the map themselves.
  useEffect(() => {
    const instance = mapRef.current;
    if (!instance) return;

    const centre = instance.getCenter();
    const settled =
      Math.abs(centre.lat - view.center[0]) < SAME_VIEW_DEGREES &&
      Math.abs(centre.lng - view.center[1]) < SAME_VIEW_DEGREES &&
      Math.abs(instance.getZoom() - view.zoom) < SAME_VIEW_ZOOM;
    if (settled) return;

    instance.easeTo({
      center: [view.center[1], view.center[0]],
      zoom: view.zoom,
      duration: 420,
    });
  }, [view, map]);

  /**
   * Keep the canvas the size of its box.
   *
   * The map pane is `display: none` behind the List/Map toggle on small
   * screens, so it is routinely laid out *after* the map is created. Without
   * this it would render once at zero width and stay there.
   */
  useEffect(() => {
    const element = containerRef.current;
    const instance = mapRef.current;
    if (!element || !instance) return;

    const observer = new ResizeObserver(() => {
      if (!element.clientWidth || !element.clientHeight) return;
      instance.resize();
      const frame = viewRef.current;
      // Resizing can interrupt easeTo; restore the requested frame, not its
      // intermediate camera position.
      instance.jumpTo({
        center: [frame.center[1], frame.center[0]],
        zoom: frame.zoom,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [map]);

  return (
    <div className="dirsearch-mapcanvas">
      <div ref={containerRef} className="h-full w-full" />
      {failed && (
        <div
          className="bg-pana-cream text-pana-ink absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 p-5 text-center text-sm"
          role="alert"
        >
          <strong>Map unavailable</strong>
          <p>You can still browse the results list.</p>
          <button
            type="button"
            className="rounded-full border border-current px-4 py-2 font-bold"
            onClick={() => setAttempt((current) => current + 1)}
          >
            Retry map
          </button>
        </div>
      )}
      {map && viewer && (
        <MapMarker map={map} lat={viewer.lat} lng={viewer.lng}>
          <span className="dirsearch-viewerdot" aria-hidden="true" />
        </MapMarker>
      )}

      {map &&
        pins.map((pin) => (
          <MapMarker key={pin.id} map={map} lat={pin.lat} lng={pin.lng}>
            {pin.content}
          </MapMarker>
        ))}
    </div>
  );
}

interface MapMarkerProps {
  map: MapLibreMap;
  lat: number;
  lng: number;
  children: ReactNode;
}

/**
 * One marker, kept in React's hands.
 *
 * MapLibre wants a DOM node it can position; React wants to own what is inside
 * it. A portal gives both: the library moves an empty div around, and React
 * renders into it as if it were part of the tree — so the pins stay ordinary
 * JSX with next/image, event handlers and all.
 */
function MapMarker({ map, lat, lng, children }: MapMarkerProps) {
  const [element] = useState(() => document.createElement('div'));

  useEffect(() => {
    // MapLibre takes [lng, lat]; everything else in this feature is [lat, lng].
    const marker = new Marker({ element }).setLngLat([lng, lat]);
    marker.addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, element, lat, lng]);

  return createPortal(children, element);
}
