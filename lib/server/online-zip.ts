import { unstable_cache } from 'next/cache';
import {
  isOnlineZipArea,
  normalizeUsZip,
  readOnlineZipArea,
  type OnlineZipArea,
} from '@/lib/online-zip';

export class ZipLookupUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ZipLookupUnavailableError';
  }
}

/** Only the public five-digit ZIP is sent, never a street address or identity. */
export async function lookupOnlineZipArea(
  postalCode: string
): Promise<OnlineZipArea | null> {
  const zip = normalizeUsZip(postalCode);
  if (!zip) return null;

  let response: Response;
  try {
    response = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (cause) {
    throw new ZipLookupUnavailableError('ZIP location lookup failed.', {
      cause,
    });
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new ZipLookupUnavailableError(
      `ZIP location lookup returned HTTP ${response.status}.`
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (cause) {
    throw new ZipLookupUnavailableError(
      'ZIP location lookup returned invalid JSON.',
      { cause }
    );
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ZipLookupUnavailableError(
      'ZIP location lookup returned an invalid response.'
    );
  }
  const result = data as Record<string, unknown>;
  const places = result.places;
  const first = Array.isArray(places) ? places[0] : null;
  if (
    result['country abbreviation'] !== 'US' ||
    normalizeUsZip(result['post code']) !== zip ||
    !first ||
    typeof first !== 'object' ||
    Array.isArray(first)
  ) {
    throw new ZipLookupUnavailableError(
      'ZIP location lookup returned an invalid place.'
    );
  }
  const place = first as Record<string, unknown>;
  const coordinate = (value: unknown) =>
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  const area = {
    postalCode: zip,
    country: 'US',
    city: place['place name'],
    region: place['state abbreviation'],
    lat: coordinate(place.latitude),
    lng: coordinate(place.longitude),
  };
  if (!isOnlineZipArea(area)) {
    throw new ZipLookupUnavailableError(
      'ZIP location lookup returned invalid coordinates.'
    );
  }
  return area;
}

const cachedLookup = unstable_cache(
  lookupOnlineZipArea,
  ['online-base-zip-v1'],
  { revalidate: 30 * 24 * 60 * 60 }
);

export function getOnlineZipArea(postalCode: string) {
  const zip = normalizeUsZip(postalCode);
  return zip ? cachedLookup(zip) : Promise.resolve(null);
}

interface ZipProfile {
  id: string;
  onlineOnly?: unknown;
  addressPostalCode?: unknown;
  addressCountry?: unknown;
  geo?: unknown;
}

/** Legacy ZIPs can be resolved without ever reusing private street coordinates. */
export async function getOnlineZipAreasForProfiles(
  rows: readonly ZipProfile[]
): Promise<Map<string, OnlineZipArea | null>> {
  const areas = new Map<string, OnlineZipArea | null>();
  const missing = new Map<string, string[]>();
  for (const row of rows) {
    if (row.onlineOnly !== true) continue;
    areas.set(row.id, null);
    const zip = normalizeUsZip(row.addressPostalCode);
    if (
      !zip ||
      (row.addressCountry != null &&
        String(row.addressCountry).toUpperCase() !== 'US')
    )
      continue;
    const stored = readOnlineZipArea(row.geo, zip);
    if (stored) {
      areas.set(row.id, stored);
      continue;
    }
    const ids = missing.get(zip) ?? [];
    ids.push(row.id);
    missing.set(zip, ids);
  }

  const entries = [...missing];
  for (let start = 0; start < entries.length; start += 4) {
    await Promise.all(
      entries.slice(start, start + 4).map(async ([zip, ids]) => {
        let area: OnlineZipArea | null;
        try {
          area = await getOnlineZipArea(zip);
        } catch (error) {
          if (!(error instanceof ZipLookupUnavailableError)) throw error;
          console.error('Directory ZIP map location unavailable:', zip, error);
          // Callers retain the listing and explicitly show map-location unavailable.
          return;
        }
        for (const id of ids) areas.set(id, area);
      })
    );
  }
  return areas;
}
