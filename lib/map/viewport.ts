export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface MapPoint {
  lat: number;
  lng: number;
}

export function readMapPoint(
  latitude: unknown,
  longitude: unknown
): MapPoint | null {
  const numberOf = (value: unknown) =>
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  const lat = numberOf(latitude);
  const lng = numberOf(longitude);
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

/** A hidden or unavailable map has no measured viewport yet. */
export function mapContainsPoint(
  bounds: MapBounds | null,
  point: MapPoint | null
): boolean {
  if (!point) return false;
  if (!bounds) return true;
  if (point.lat < bounds.south || point.lat > bounds.north) return false;
  if (Math.abs(bounds.east - bounds.west) >= 360) return true;

  // MapLibre can report unwrapped longitudes after panning across the dateline.
  const wrap = (degrees: number) => ((degrees % 360) + 360) % 360;
  return wrap(point.lng - bounds.west) <= wrap(bounds.east - bounds.west);
}
