const BOUNDS = { minLat: 25.6, maxLat: 26.85, minLng: -80.5, maxLng: -80.0 };

// Inset the illustrative South Florida bounds to leave room for mock pins.
export function projectMockCoordinates({
  lat,
  lng,
}: {
  lat: number;
  lng: number;
}) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return { left: `${6 + x * 0.88}%`, top: `${6 + y * 0.88}%` };
}
