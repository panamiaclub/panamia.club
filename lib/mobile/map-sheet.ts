export type NativeSheetStop = 'peek' | 'half' | 'expanded';

export const NATIVE_SHEET_STOPS: readonly NativeSheetStop[] = [
  'peek',
  'half',
  'expanded',
];

export function nativeSheetHeights(height: number, controlsInset: number) {
  const available = Math.max(0, height);
  const expanded =
    available < 250 ? available : Math.max(0, available - controlsInset - 8);
  const peek = Math.min(expanded, 54);
  return {
    peek,
    half: Math.min(expanded, Math.max(peek, available * 0.52)),
    expanded,
  };
}

export function nativePreviewHeight(
  available: number,
  heading: number,
  card: number
) {
  return Math.min(Math.max(0, available), heading + card + 24);
}

export function nativePreviewRange(
  count: number,
  selectedIndex: number,
  limit = 2
) {
  const start = Math.max(0, Math.min(selectedIndex, count - limit));
  return { start, end: Math.min(count, start + limit) };
}

export function nativeSheetStopForDrag(
  heights: ReturnType<typeof nativeSheetHeights>,
  start: number,
  current: number
): NativeSheetStop {
  const nearest = (height: number) =>
    NATIVE_SHEET_STOPS.reduce((best, candidate) =>
      Math.abs(heights[candidate] - height) < Math.abs(heights[best] - height)
        ? candidate
        : best
    );
  const from = nearest(start);
  const to = nearest(current);
  const delta = current - start;
  if (from !== to || Math.abs(delta) < 24) return to;

  // A deliberate short swipe should advance a stop, not snap back.
  return NATIVE_SHEET_STOPS[
    Math.max(
      0,
      Math.min(
        NATIVE_SHEET_STOPS.length - 1,
        NATIVE_SHEET_STOPS.indexOf(from) + Math.sign(delta)
      )
    )
  ];
}
