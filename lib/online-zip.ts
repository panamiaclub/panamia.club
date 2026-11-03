export interface OnlineZipArea {
  postalCode: string;
  country: 'US';
  city: string;
  region: string;
  lat: number;
  lng: number;
}

export function normalizeUsZip(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{5}(?:-\d{4})?$/.test(trimmed) ? trimmed.slice(0, 5) : null;
}

export function isOnlineZipArea(value: unknown): value is OnlineZipArea {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const area = value as Record<string, unknown>;
  return (
    typeof area.postalCode === 'string' &&
    /^\d{5}$/.test(area.postalCode) &&
    area.country === 'US' &&
    typeof area.city === 'string' &&
    area.city.trim().length > 0 &&
    typeof area.region === 'string' &&
    /^[A-Z]{2}$/.test(area.region) &&
    typeof area.lat === 'number' &&
    Number.isFinite(area.lat) &&
    Math.abs(area.lat) <= 90 &&
    typeof area.lng === 'number' &&
    Number.isFinite(area.lng) &&
    Math.abs(area.lng) <= 180
  );
}

export function readOnlineZipArea(
  geo: unknown,
  postalCode: unknown
): OnlineZipArea | null {
  const zip = normalizeUsZip(postalCode);
  if (!zip || !geo || typeof geo !== 'object' || Array.isArray(geo))
    return null;
  const area = (geo as Record<string, unknown>).zipArea;
  return isOnlineZipArea(area) && area.postalCode === zip ? area : null;
}

export function onlineBusinessLocation(postalCode: unknown): string {
  const zip = normalizeUsZip(postalCode);
  return zip
    ? `Online - based near ZIP ${zip}`
    : 'Online - base ZIP not provided';
}

export interface OnlineZipGroup<T> {
  id: string;
  area: OnlineZipArea;
  items: T[];
}

export function groupOnlineZipListings<T>(
  items: readonly T[],
  getArea: (item: T) => OnlineZipArea | null | undefined
): OnlineZipGroup<T>[] {
  const groups = new Map<string, OnlineZipGroup<T>>();
  for (const item of items) {
    const area = getArea(item);
    if (!isOnlineZipArea(area)) continue;
    const id = `online-zip:${area.country}:${area.postalCode}`;
    const group = groups.get(id);
    if (group) group.items.push(item);
    else groups.set(id, { id, area, items: [item] });
  }
  return [...groups.values()];
}
