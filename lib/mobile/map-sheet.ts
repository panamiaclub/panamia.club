export type NativeSheetStop = 'peek' | 'half' | 'expanded';

export function nativeSheetHeights(height: number, controlsInset: number) {
  const available = Math.max(0, height);
  const expanded =
    available < 250 ? available : Math.max(0, available - controlsInset - 8);
  const peek = Math.min(expanded, Math.max(52, Math.min(118, available * 0.3)));
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
