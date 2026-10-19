export const DIRECTORY_RADIUS_OPTIONS = [
  { value: '5', label: '5 miles', miles: 5 },
  { value: '10', label: '10 miles', miles: 10 },
  { value: '25', label: '25 miles', miles: 25 },
  { value: '50', label: '50 miles', miles: 50 },
  { value: 'all', label: 'All South Florida', miles: null },
] as const;

export type DirectoryRadius =
  (typeof DIRECTORY_RADIUS_OPTIONS)[number]['value'];

export const DEFAULT_DIRECTORY_RADIUS: DirectoryRadius = '5';

const DIRECTORY_RADII = new Set<string>(
  DIRECTORY_RADIUS_OPTIONS.map((option) => option.value)
);

export function isDirectoryRadius(value: unknown): value is DirectoryRadius {
  return typeof value === 'string' && DIRECTORY_RADII.has(value);
}

export function parseDirectoryRadius(value: unknown): DirectoryRadius {
  return isDirectoryRadius(value) ? value : DEFAULT_DIRECTORY_RADIUS;
}

export function directoryRadiusMiles(radius: DirectoryRadius): number | null {
  return (
    DIRECTORY_RADIUS_OPTIONS.find((option) => option.value === radius)?.miles ??
    null
  );
}

export function effectiveDirectoryRadius(
  radius: DirectoryRadius,
  hasViewerLocation: boolean
): DirectoryRadius {
  return hasViewerLocation ? radius : 'all';
}

/**
 * Whether a listing survives the directory's radius filter.
 *
 * "All South Florida" is deliberately non-geographic: online-only listings
 * and listings without coordinates remain discoverable. A finite radius is
 * visitable-distance discovery, so both are excluded.
 */
export function matchesDirectoryRadius(
  distanceMiles: number | null,
  radius: DirectoryRadius,
  onlineOnly = false
): boolean {
  const limit = directoryRadiusMiles(radius);
  if (limit === null) return true;
  if (onlineOnly || distanceMiles === null || !Number.isFinite(distanceMiles)) {
    return false;
  }
  return distanceMiles <= limit;
}
