import type { Coords } from '@/app/p/[user]/_lib/profile-view';
import {
  DEFAULT_DIRECTORY_RADIUS,
  directoryRadiusMiles,
} from '@/lib/directory-radius';

/**
 * What the directory map should be looking at.
 *
 * Kept out of the component because the arithmetic is the part that can be
 * quietly wrong: a map framed to the wrong span still renders perfectly, so a
 * bad constant here has no symptom to notice. Pure functions, no React, so the
 * spans can be asserted in miles.
 */

/** A pigeon-maps viewport: where to look, and how far in. */
export interface MapFrame {
  center: [number, number];
  zoom: number;
}

/** Centre of the South Florida directory area, for an empty map. */
export const DEFAULT_CENTER: [number, number] = [26.1, -80.2];

/**
 * How far around themselves a viewer should see once they share a location.
 *
 * A radius, not a width: five miles is visible in every direction, so the
 * frame answers "what is near me" rather than "what is near me, to the east".
 * Five rather than the region-wide default because the question a shared
 * location asks is which of these could I get to now.
 */
export const VIEWER_RADIUS_MILES =
  directoryRadiusMiles(DEFAULT_DIRECTORY_RADIUS) ?? 5;

/**
 * Stand-in for the map's size when it cannot be measured.
 *
 * Below the split's breakpoint the map pane is `display: none` until the
 * List/Map toggle asks for it, so a frame computed while the list is showing
 * has no laid-out box to measure. That is the only time this is needed — above
 * the breakpoint the toggle goes away and the pane is always laid out — so it
 * is sized to a phone's map pane (measured at 343px on a 390px viewport)
 * rather than a desktop one. A desktop-sized guess would overshoot the zoom
 * and leave a phone showing about three miles instead of five.
 */
export const FALLBACK_MAP_PX = 345;

/** Equatorial circumference, for turning miles into a Web Mercator zoom. */
const EARTH_CIRCUMFERENCE_MILES = 24901;

/** Tile size every Web Mercator zoom level is derived from. */
const TILE_PX = 256;

// Past 15 the tiles outrun the data — street level on a geocoded address is
// false precision. Below 8 South Florida no longer fills the pane.
const MIN_ZOOM = 8;
const MAX_ZOOM = 15;

const clampZoom = (zoom: number) =>
  Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

/**
 * The zoom at which `radiusMiles` is visible in every direction on a map
 * `sizePx` across.
 *
 * Web Mercator: at zoom 0 the whole world is one 256px tile, and each step in
 * doubles the pixels, so the miles a pixel covers halves. Longitude also
 * compresses towards the poles — without the cosine a five-mile frame in South
 * Florida would come out about a tenth too wide.
 *
 * Takes the measured pane rather than assuming one, because the map is half a
 * desktop split in one place and a phone-width panel in another; a single
 * hardcoded zoom would mean two different real-world radii.
 */
export function zoomForRadius(
  lat: number,
  radiusMiles: number,
  sizePx: number
): number {
  const milesPerPixelAtZoom0 =
    (EARTH_CIRCUMFERENCE_MILES * Math.cos((lat * Math.PI) / 180)) / TILE_PX;
  const milesPerPixelWanted = (radiusMiles * 2) / sizePx;
  return clampZoom(Math.log2(milesPerPixelAtZoom0 / milesPerPixelWanted));
}

/** Centred on the viewer, with the selected radius visible around them. */
export function viewerFrame(
  coords: Coords,
  sizePx: number,
  radiusMiles = VIEWER_RADIUS_MILES
): MapFrame {
  return {
    center: [coords.lat, coords.lng],
    zoom: zoomForRadius(coords.lat, radiusMiles, sizePx),
  };
}

/** What an arriving result set should do to the map. */
export interface ResultFrameDecision {
  /** Re-frame to hold the pins, or leave the map where it is. */
  reframe: boolean;
  /** Whether the viewer's frame still outranks the next result set. */
  viewerFramePending: boolean;
}

/**
 * Whether results arriving should take the map back from the viewer.
 *
 * Fitting every pin is the right default, but it must not undo the frame the
 * viewer just got by sharing their location — and the two land together.
 * Sharing a location changes the search's cache key, so the results blank out
 * and refill: the map sees an empty set and then the real one, back to back.
 * Spending the viewer's precedence on that empty beat would hand the map
 * straight back to the region-wide frame it was meant to outrank, so it is
 * only spent once there is a real result set to outrank.
 *
 * The precedence lasts one result set, not forever: by the time a *later* one
 * arrives the viewer has searched for it, and a search should frame what it
 * found.
 */
export function onResultsArrived(
  viewerFramePending: boolean,
  pinCount: number
): ResultFrameDecision {
  if (!viewerFramePending) {
    return { reframe: true, viewerFramePending: false };
  }
  return { reframe: false, viewerFramePending: pinCount === 0 };
}

/**
 * Pick a centre and zoom that hold every point.
 *
 * pigeon-maps has no fit-to-bounds, so the span is turned into a zoom level
 * directly: each zoom step halves the visible degrees, and the constants are
 * chosen so a single point lands at neighbourhood zoom rather than street
 * level, where a lone marker on an empty tile tells you nothing about where it
 * is.
 */
export function frameForPoints(points: Coords[]): MapFrame {
  if (points.length === 0) return { center: DEFAULT_CENTER, zoom: 9 };

  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const center: [number, number] = [
    (minLat + maxLat) / 2,
    (minLng + maxLng) / 2,
  ];

  const span = Math.max(maxLat - minLat, (maxLng - minLng) * 0.85);
  if (span < 0.005) return { center, zoom: 13 };

  return { center, zoom: clampZoom(Math.log2(360 / span) - 1.2) };
}
