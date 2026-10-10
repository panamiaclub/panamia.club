/**
 * Tenor, the GIF source.
 *
 * Server-only. The API key never reaches the browser -- not because a Tenor
 * key is especially sensitive, but because a key shipped to the client is a
 * key anyone can lift and spend, and the quota it spends is ours.
 *
 * Safe search is forced on at this layer rather than passed in by the caller.
 * A content filter a caller can choose is a content filter some caller
 * eventually forgets, and the first time that happens it happens inside a DM
 * between two members who did not ask for it. There is no argument to turn it
 * off, so there is no argument to turn it off with.
 *
 * The parsing half is exported separately and takes a payload rather than a
 * query, so it can be tested without a key and without the network.
 */

export interface GifResult {
  id: string;
  /** Tenor's own alt text. Used verbatim as the image alt. */
  description: string;
  /** Small, animated, for the picker grid. */
  previewUrl: string;
  /** What actually gets sent. */
  url: string;
  width: number;
  height: number;
}

const TENOR_ENDPOINT = 'https://tenor.googleapis.com/v2';

/**
 * Whether a URL is one we are willing to fetch on a member's say-so.
 *
 * This is the whole defence on the mirror route, and it is doing more than it
 * looks like. That route takes a URL from the client and fetches it from
 * inside the Worker, which without a check is a server-side request forgery
 * hole: a member could name any address -- a cloud metadata endpoint, an
 * internal service, a host that only our egress IP can reach -- and have us
 * retrieve it for them.
 *
 * So the rule is an allowlist, not a denylist, and it is written against the
 * parsed hostname rather than the raw string. Substring matching would admit
 * `tenor.com.evil.test` and `evil.test/?x=media.tenor.com`; the leading dot on
 * the suffix check is what keeps `nottenor.com` out. HTTPS is required because
 * a plaintext fetch is interceptable and there is no reason Tenor would need
 * one.
 */
export function isTenorMediaUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase();
  return host === 'tenor.com' || host.endsWith('.tenor.com');
}

/**
 * Whether GIFs are available at all.
 *
 * Everything downstream degrades to "no GIF button" rather than to an error.
 * An unconfigured key is a deployment that has not switched the feature on,
 * not a fault, and it should look like a product without GIFs rather than
 * like a product with broken ones.
 */
export const isGifSearchEnabled = (): boolean =>
  !!process.env.TENOR_API_KEY?.trim();

interface TenorFormat {
  url?: unknown;
  dims?: unknown;
}

interface TenorItem {
  id?: unknown;
  content_description?: unknown;
  media_formats?: unknown;
}

const asFormat = (value: unknown): TenorFormat | null =>
  value && typeof value === 'object' ? (value as TenorFormat) : null;

const asUrl = (format: TenorFormat | null): string | null => {
  const url = format?.url;
  // Checked against the same allowlist the mirror route uses. A result whose
  // media lives somewhere other than Tenor could never be mirrored anyway, so
  // offering it in the grid would only produce a tile that fails when tapped
  // -- and leaving the check to the route alone would mean the one place a
  // hostile URL could enter the system had a single point of failure.
  return typeof url === 'string' && isTenorMediaUrl(url) ? url : null;
};

const asDims = (format: TenorFormat | null): [number, number] => {
  const dims = format?.dims;
  if (
    Array.isArray(dims) &&
    typeof dims[0] === 'number' &&
    typeof dims[1] === 'number'
  ) {
    return [dims[0], dims[1]];
  }
  // Tenor has always sent dims, but a missing pair should cost a layout guess
  // rather than the whole result.
  return [320, 240];
};

/**
 * Turns a Tenor payload into something the picker can render.
 *
 * Defensive by design: a single malformed entry is dropped rather than
 * allowed to throw, because the alternative is one bad row from a third party
 * emptying the whole picker.
 *
 * `mediumgif` is preferred over `gif` for the sent copy. The full-size asset
 * runs to several megabytes, every byte of which we would mirror into R2 and
 * then push down a chat bubble barely 288px wide. `tinygif` is the preview,
 * which keeps the grid cheap to scroll.
 */
export function normalizeTenorResults(payload: unknown): GifResult[] {
  const results =
    payload && typeof payload === 'object' && 'results' in payload
      ? (payload as { results: unknown }).results
      : null;

  if (!Array.isArray(results)) return [];

  const out: GifResult[] = [];

  for (const raw of results) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as TenorItem;

    const formats =
      item.media_formats && typeof item.media_formats === 'object'
        ? (item.media_formats as Record<string, unknown>)
        : {};

    const send =
      asUrl(asFormat(formats.mediumgif)) ?? asUrl(asFormat(formats.gif));
    const preview =
      asUrl(asFormat(formats.tinygif)) ??
      asUrl(asFormat(formats.nanogif)) ??
      send;

    // No sendable asset means the row is decoration. Dropping it beats
    // showing a tile that does nothing when tapped.
    if (!send || !preview) continue;

    const id = typeof item.id === 'string' ? item.id : null;
    if (!id) continue;

    const [width, height] = asDims(
      asFormat(formats.mediumgif) ?? asFormat(formats.gif)
    );

    out.push({
      id,
      description:
        typeof item.content_description === 'string' &&
        item.content_description.trim()
          ? item.content_description.trim()
          : 'GIF',
      previewUrl: preview,
      url: send,
      width,
      height,
    });
  }

  return out;
}

const tenorUrl = (path: string, params: Record<string, string>): string => {
  const url = new URL(`${TENOR_ENDPOINT}/${path}`);
  url.searchParams.set('key', process.env.TENOR_API_KEY ?? '');
  // Tenor asks for a stable client identifier so quota is attributed per app.
  url.searchParams.set('client_key', 'pana_social');
  // "high" is Tenor's strictest filter. Not a caller's choice -- see above.
  url.searchParams.set('contentfilter', 'high');
  url.searchParams.set('media_filter', 'tinygif,mediumgif,gif');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
};

/**
 * Search, or the featured set when nothing is typed yet.
 *
 * An empty picker is a worse first impression than a mediocre one, so an
 * empty query falls through to Tenor's featured list rather than returning
 * nothing and making the panel look broken the moment it opens.
 */
export async function fetchGifs(
  query: string,
  limit = 24
): Promise<GifResult[]> {
  if (!isGifSearchEnabled()) return [];

  const trimmed = query.trim();
  const endpoint = trimmed
    ? tenorUrl('search', { q: trimmed, limit: String(limit) })
    : tenorUrl('featured', { limit: String(limit) });

  const res = await fetch(endpoint);

  if (!res.ok) {
    throw new Error(`Tenor responded ${res.status}`);
  }

  return normalizeTenorResults(await res.json());
}
