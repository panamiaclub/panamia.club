/**
 * GIPHY, the GIF source.
 *
 * This was Tenor until Google decommissioned that API on 30 June 2026 and
 * stopped issuing keys in January, which left the picker built on something
 * no deployment could ever switch on. GIPHY is the replacement.
 *
 * Server-only. The API key never reaches the browser -- not because a GIPHY
 * key is especially sensitive, but because a key shipped to the client is a
 * key anyone can lift and spend, and the quota it spends is ours. That quota
 * is small enough to matter: see the cache note below.
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
  /** GIPHY's own alt text. Used verbatim as the image alt. */
  description: string;
  /** Small, animated, for the picker grid. */
  previewUrl: string;
  /** What actually gets sent. */
  url: string;
  width: number;
  height: number;
  /**
   * Whoever uploaded the GIF to GIPHY, when it has one.
   *
   * Required by their terms rather than offered as a nicety: content may not
   * be displayed "without Giphy user and/or source attribution where
   * available". Plenty of GIFs are unattributed, hence optional.
   */
  creator?: string;
}

const GIPHY_ENDPOINT = 'https://api.giphy.com/v1/gifs';

/**
 * GIPHY's attribution requirement, in code so it cannot be quietly dropped.
 *
 * Their terms: "We require all apps that use the GIPHY API to conspicuously
 * display 'Powered By GIPHY' attribution marks where the API is utilized."
 * The wording and capitalisation are theirs. This is not decoration and
 * should not be removed to tidy the UI -- it is the term under which the
 * GIFs are free.
 *
 * We carry it in three places, because the contract asks for more than the
 * docs page does. GIPHY's API Terms of Service, clause 4, require an app to
 * be labelled with the words "Powered by Giphy" *and the Giphy logo* -- a
 * conjunction, not a choice -- so the picker shows their official mark
 * rather than styled text of our own. Clause 5 adds that content may not be
 * displayed "without Giphy user and/or source attribution where available",
 * which is why GifResult carries `creator` and why a sent GIF names its
 * uploader in the alt text, so the credit survives leaving the picker.
 *
 * https://support.giphy.com/hc/en-us/articles/360028134111-GIPHY-API-Terms-of-Service
 * https://developers.giphy.com/docs/api/
 */
export const GIPHY_ATTRIBUTION = 'Powered By GIPHY';

/**
 * GIPHY's own attribution mark, served from our origin.
 *
 * This is their approved artwork, unmodified, out of the logo pack at
 * media.giphy.com/giphy-attribution-marks.zip -- the 200x42 horizontal badge
 * from "Light Backgrounds", which is a black bar with white lettering and so
 * reads correctly on the picker's sand background. Their trademark licence
 * covers reproducing the mark, not redrawing it, so this is deliberately a
 * copy of their file rather than an approximation in CSS.
 */
export const GIPHY_ATTRIBUTION_MARK = '/giphy-attribution.png';
export const GIPHY_SEARCH_PLACEHOLDER = 'Search GIPHY';

/** Raised when GIPHY refuses us for going too fast. See the cache below. */
export class GifRateLimitError extends Error {
  constructor() {
    super('GIPHY rate limit reached');
    this.name = 'GifRateLimitError';
  }
}

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
 * `giphy.com.evil.test` and `evil.test/?x=media.giphy.com`; the leading dot on
 * the suffix check is what keeps `notgiphy.com` out. HTTPS is required because
 * a plaintext fetch is interceptable and there is no reason GIPHY would need
 * one.
 *
 * The suffix match is what lets this work at all: GIPHY serves media from a
 * rotating set of hosts -- media0 through media4, i.giphy.com -- so pinning
 * one hostname would reject most valid results.
 */
export function isGifMediaUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase();
  return host === 'giphy.com' || host.endsWith('.giphy.com');
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
  !!process.env.GIPHY_API_KEY?.trim();

interface GiphyRendition {
  url?: unknown;
  width?: unknown;
  height?: unknown;
}

interface GiphyItem {
  id?: unknown;
  title?: unknown;
  alt_text?: unknown;
  images?: unknown;
  username?: unknown;
  user?: unknown;
}

const asRendition = (value: unknown): GiphyRendition | null =>
  value && typeof value === 'object' ? (value as GiphyRendition) : null;

/**
 * The uploader's name, for GIPHY's per-content attribution requirement.
 *
 * GIPHY exposes this in two places and populates neither reliably: a
 * top-level `username`, and a `user` object with `display_name` and
 * `username`. The friendly name is preferred when present because it is what
 * GIPHY itself shows, falling back to the handle.
 *
 * Length-capped because this is third-party text that ends up in alt text and
 * in a stored attachment name. Returns null rather than an empty string so
 * the caller can omit the field entirely instead of carrying a blank credit.
 */
const asCreator = (item: GiphyItem): string | null => {
  const user =
    item.user && typeof item.user === 'object'
      ? (item.user as { display_name?: unknown; username?: unknown })
      : null;

  const candidate =
    (typeof user?.display_name === 'string' && user.display_name.trim()) ||
    (typeof user?.username === 'string' && user.username.trim()) ||
    (typeof item.username === 'string' && item.username.trim()) ||
    '';

  return candidate ? candidate.slice(0, 60) : null;
};

const asUrl = (rendition: GiphyRendition | null): string | null => {
  const url = rendition?.url;
  // Checked against the same allowlist the mirror route uses. A result whose
  // media lives somewhere other than GIPHY could never be mirrored anyway, so
  // offering it in the grid would only produce a tile that fails when tapped
  // -- and leaving the check to the route alone would mean the one place a
  // hostile URL could enter the system had a single point of failure.
  return typeof url === 'string' && isGifMediaUrl(url) ? url : null;
};

/**
 * GIPHY sends dimensions as strings ("480"), not numbers. Worth stating
 * plainly because the obvious typeof check silently drops every result.
 */
const asDims = (rendition: GiphyRendition | null): [number, number] => {
  const width = Number(rendition?.width);
  const height = Number(rendition?.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width && height) {
    return [width, height];
  }
  // A missing pair should cost a layout guess rather than the whole result.
  return [320, 240];
};

/**
 * Turns a GIPHY payload into something the picker can render.
 *
 * Defensive by design: a single malformed entry is dropped rather than
 * allowed to throw, because the alternative is one bad row from a third party
 * emptying the whole picker.
 *
 * Rendition choice follows GIPHY's own guidance -- a small fixed-width copy
 * for the grid so scrolling stays cheap, and a downsized copy to send rather
 * than `original`, which runs to several megabytes. Every byte of the sent
 * copy gets mirrored into R2 and then pushed down a chat bubble barely 288px
 * wide, so the largest rendition would cost storage and bandwidth to deliver
 * detail nobody can see.
 */
export function normalizeGifResults(payload: unknown): GifResult[] {
  const data =
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data: unknown }).data
      : null;

  if (!Array.isArray(data)) return [];

  const out: GifResult[] = [];

  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as GiphyItem;

    const images =
      item.images && typeof item.images === 'object'
        ? (item.images as Record<string, unknown>)
        : {};

    const sendRendition =
      asRendition(images.downsized_medium) ??
      asRendition(images.downsized) ??
      asRendition(images.original) ??
      asRendition(images.fixed_height);

    const send = asUrl(sendRendition);
    const preview =
      asUrl(asRendition(images.fixed_width_small)) ??
      asUrl(asRendition(images.fixed_height_small)) ??
      asUrl(asRendition(images.fixed_width)) ??
      asUrl(asRendition(images.fixed_height)) ??
      send;

    // No sendable asset means the row is decoration. Dropping it beats
    // showing a tile that does nothing when tapped.
    if (!send || !preview) continue;

    const id = typeof item.id === 'string' ? item.id : null;
    if (!id) continue;

    const [width, height] = asDims(sendRendition);

    const described =
      (typeof item.alt_text === 'string' && item.alt_text.trim()) ||
      (typeof item.title === 'string' && item.title.trim()) ||
      '';

    const creator = asCreator(item);

    out.push({
      id,
      description: described || 'GIF',
      previewUrl: preview,
      url: send,
      width,
      height,
      ...(creator ? { creator } : {}),
    });
  }

  return out;
}

const giphyUrl = (path: string, params: Record<string, string>): string => {
  const url = new URL(`${GIPHY_ENDPOINT}/${path}`);
  url.searchParams.set('api_key', process.env.GIPHY_API_KEY ?? '');
  // "g" is GIPHY's strictest rating. Not a caller's choice -- see above.
  url.searchParams.set('rating', 'g');
  // GIPHY asks for this when calls are proxied through a server rather than
  // made from the browser, since otherwise every request looks like it comes
  // from wherever Cloudflare happens to run it.
  url.searchParams.set('country_code', 'US');
  /* Deliberately NOT sending `bundle`. GIPHY's renditions-on-demand looks
     like free savings -- messaging_non_clips is named for exactly this use
     case -- but that bundle returns original, fixed_height{,_downsampled,
     _small} and fixed_width{,_downsampled,_small} and omits BOTH
     downsized_medium and downsized. Our send chain prefers downsized_medium
     (capped at 5MB by GIPHY) precisely so the mirror stays well under its
     8MB limit; with the bundle applied those two are absent and every send
     falls through to `original`, which is unbounded. The "optimization"
     would trade a smaller JSON response for materially larger GIFs through
     the mirror and more rejections at the size cap.
     Revisit only alongside the rendition chain in normalizeGifResults.
     https://developers.giphy.com/docs/optional-settings/ */
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
};

/**
 * One search against GIPHY. Uncached -- callers should prefer
 * `fetchGifsCached` below, which is the only thing keeping us inside quota.
 *
 * An empty term is not an empty search. It means the picker has just opened
 * and nobody has typed yet, so it falls through to trending, which is what
 * makes the grid populated rather than blank on first paint.
 */
export async function fetchGifs(
  query: string,
  limit = 24
): Promise<GifResult[]> {
  const term = query.trim();

  const endpoint = term
    ? giphyUrl('search', { q: term, limit: String(limit) })
    : giphyUrl('trending', { limit: String(limit) });

  const res = await fetch(endpoint);

  if (res.status === 429) {
    throw new GifRateLimitError();
  }

  if (!res.ok) {
    throw new Error(`GIPHY responded ${res.status}`);
  }

  return normalizeGifResults(await res.json());
}

/* ------------------------------------------------------------------------ *
 * Caching
 *
 * A GIPHY beta key allows ONE HUNDRED calls PER HOUR -- for the whole app,
 * not per member. That is the single tightest constraint in this feature by
 * a wide margin, and it means the cache is not an optimisation, it is what
 * makes GIF search survive contact with more than one pana.
 *
 * Without caching, one person typing a four-letter word with a debounce
 * spends a few calls; a dozen panas browsing at lunchtime would exhaust the
 * hour in minutes and leave the picker broken until the top of the next one.
 *
 * Two tiers, both best-effort:
 *
 *   memory -- module scope, per isolate. Free, instant, and catches the
 *             repeats that dominate real use ("lol", "gracias", "dale").
 *   edge   -- caches.default, shared by everyone served from the same
 *             Cloudflare colo, so one pana's search answers the next
 *             person's. Most of our members are in South Florida and so hit
 *             the same colo, which is what makes this tier do real work.
 *
 * The TTL is an hour, deliberately matched to the quota window rather than
 * chosen for freshness: at an hour, each distinct term costs at most one call
 * per hour, so the quota becomes "about a hundred distinct searches an hour"
 * instead of "about a hundred keystrokes an hour". Trending shifts daily, and
 * search ranking does not move meaningfully within an hour, so nothing is
 * lost by it.
 *
 * Neither tier can guarantee we stay under the cap -- that would need a
 * single coordination point. What they do is move rate-limiting from
 * "inevitable" to "rare", and the route handles the rare case explicitly
 * rather than pretending it cannot happen.
 * ------------------------------------------------------------------------ */

export const GIF_CACHE_TTL_MS = 60 * 60_000;
const GIF_CACHE_MAX_ENTRIES = 200;

export interface GifCacheEntry {
  results: GifResult[];
  expiresAt: number;
}

export const gifCacheKey = (query: string, limit: number): string =>
  `${query.trim().toLowerCase()}::${limit}`;

/**
 * Read, treating an expired entry as a miss and clearing it on the way past.
 *
 * Takes the store as an argument rather than closing over the module's own,
 * so the expiry and eviction rules can be tested without reaching into
 * private state or exporting a reset hook that only tests would ever call.
 */
export function readGifCache(
  store: Map<string, GifCacheEntry>,
  key: string,
  now: number
): GifResult[] | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return entry.results;
}

export function writeGifCache(
  store: Map<string, GifCacheEntry>,
  key: string,
  results: GifResult[],
  now: number,
  max: number = GIF_CACHE_MAX_ENTRIES
): void {
  // Re-inserting moves the key to the end of the Map's iteration order, which
  // is what makes the eviction below oldest-first rather than arbitrary.
  store.delete(key);
  store.set(key, { results, expiresAt: now + GIF_CACHE_TTL_MS });

  while (store.size > max) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

const memoryCache = new Map<string, GifCacheEntry>();

/** The Workers edge cache, or null anywhere that global is absent (plain Node). */
const getEdgeCache = (): {
  match: (key: string) => Promise<Response | undefined>;
  put: (key: string, response: Response) => Promise<void>;
} | null => {
  const store = (
    globalThis as {
      caches?: {
        default?: {
          match: (key: string) => Promise<Response | undefined>;
          put: (key: string, response: Response) => Promise<void>;
        };
      };
    }
  ).caches?.default;
  return store ?? null;
};

/* The Cache API keys on a URL, so the term becomes one. The host is never
   resolved -- nothing fetches this -- it only has to be a stable, valid URL
   that cannot collide with a real route. */
const edgeCacheUrl = (key: string): string =>
  `https://gif-cache.pana.internal/${encodeURIComponent(key)}`;

/**
 * Search, through both cache tiers.
 *
 * Every cache interaction is wrapped: a cache that misbehaves must degrade to
 * a slower search, never to a broken one.
 */
export async function fetchGifsCached(
  query: string,
  limit = 24
): Promise<GifResult[]> {
  if (!isGifSearchEnabled()) return [];

  const key = gifCacheKey(query, limit);
  const now = Date.now();

  const local = readGifCache(memoryCache, key, now);
  if (local) return local;

  const edge = getEdgeCache();
  if (edge) {
    try {
      const hit = await edge.match(edgeCacheUrl(key));
      if (hit) {
        const cached = normalizeGifResults(await hit.json());
        if (cached.length > 0) {
          writeGifCache(memoryCache, key, cached, now);
          return cached;
        }
      }
    } catch {
      // A cache read failing is not a reason to fail the search.
    }
  }

  const fresh = await fetchGifs(query, limit);
  writeGifCache(memoryCache, key, fresh, now);

  if (edge && fresh.length > 0) {
    try {
      // Stored in GIPHY's own payload shape so the read path above can run it
      // back through the same parser rather than trusting a second format.
      await edge.put(
        edgeCacheUrl(key),
        new Response(
          JSON.stringify({
            data: fresh.map((gif) => ({
              id: gif.id,
              alt_text: gif.description,
              images: {
                downsized_medium: {
                  url: gif.url,
                  width: String(gif.width),
                  height: String(gif.height),
                },
                fixed_width_small: {
                  url: gif.previewUrl,
                  width: String(gif.width),
                  height: String(gif.height),
                },
              },
            })),
          }),
          {
            headers: {
              'content-type': 'application/json',
              'cache-control': `max-age=${Math.floor(GIF_CACHE_TTL_MS / 1000)}`,
            },
          }
        )
      );
    } catch {
      // Likewise: failing to cache costs speed, not correctness.
    }
  }

  return fresh;
}
