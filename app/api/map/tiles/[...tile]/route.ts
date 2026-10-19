/**
 * Vector tiles for the directory map.
 *
 * The basemap is one ~270MB PMTiles archive in R2 rather than millions of
 * loose tile objects: PMTiles is a single file with its own index, so a tile
 * is a byte range inside it. That trades a directory lookup for not having to
 * store, list, or invalidate a few million objects.
 *
 * Served from our own origin on purpose. The bucket has a public r2.dev URL,
 * but MapLibre fetches tiles with `fetch()`, which is a cross-origin request
 * that needs a CORS policy on the bucket — configuration that lives in the
 * Cloudflare dashboard rather than in this repo, and that silently breaks the
 * map if it is ever reset. Same-origin needs no such policy, and it lets the
 * cache headers below sit next to the thing they describe.
 */
import { NextRequest, NextResponse } from 'next/server';
import { PMTiles, type RangeResponse, type Source } from 'pmtiles';
import { getStorage, type R2Bucket } from '@/lib/r2';

/**
 * Versioned so the archive can be replaced without fighting a cache. Tiles are
 * served immutable; a new extract becomes `-v2` rather than overwriting this.
 */
const ARCHIVE_KEY = 'map/sofl-v1.pmtiles';

/** The archive's own maximum. Past this MapLibre scales z15 geometry instead. */
const MAX_ZOOM = 15;

/** Reads byte ranges out of the archive without pulling the whole object. */
class R2Source implements Source {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly key: string
  ) {}

  getKey() {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const object = await this.bucket.get(this.key, {
      range: { offset, length },
    });
    if (!object) {
      throw new Error(`PMTiles archive not found in R2: ${this.key}`);
    }
    return { data: await object.arrayBuffer() };
  }
}

/**
 * Held across requests so the archive's directories stay cached in the isolate.
 *
 * Without this every tile would re-read the root directory before it could
 * find its own offset, roughly doubling the R2 reads for the whole map.
 */
let archive: PMTiles | null = null;

function getArchive(bucket: R2Bucket): PMTiles {
  archive ??= new PMTiles(new R2Source(bucket, ARCHIVE_KEY));
  return archive;
}

interface RouteParams {
  params: Promise<{ tile: string[] }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { tile } = await params;
  if (!tile || tile.length !== 3) {
    return new NextResponse('Not found', { status: 404 });
  }

  const z = Number(tile[0]);
  const x = Number(tile[1]);
  const y = Number(tile[2].replace(/\.(mvt|pbf)$/, ''));

  // Bounds-check before touching R2. Web Mercator has 2^z tiles per axis, so
  // anything outside that is a malformed URL rather than a missing tile — and
  // an unchecked coordinate would become an unbounded offset into the archive.
  const limit = 2 ** z;
  const valid =
    Number.isInteger(z) &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    z >= 0 &&
    z <= MAX_ZOOM &&
    x >= 0 &&
    x < limit &&
    y >= 0 &&
    y < limit;
  if (!valid) {
    return new NextResponse('Not found', { status: 404 });
  }

  const bucket = getStorage();
  if (!bucket) {
    return new NextResponse('Map storage unavailable', { status: 503 });
  }

  try {
    const result = await getArchive(bucket).getZxy(z, x, y);

    // A sparse archive has no tile for most of the world, and none over open
    // water even inside the region. That is an empty tile, not an error:
    // MapLibre draws the background and moves on, and 204 keeps it quiet.
    if (!result) {
      return new NextResponse(null, {
        status: 204,
        headers: { 'Cache-Control': 'public, max-age=604800' },
      });
    }

    return new NextResponse(result.data, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.mapbox-vector-tile',
        // Immutable because the key is versioned: the bytes behind this URL
        // never change, so a viewer panning back over the same ground pays
        // nothing for it.
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    });
  } catch (error) {
    // Drop the cached archive so the next request rebuilds it.
    //
    // PMTiles memoises its directory lookups as promises, and a rejected
    // promise stays in that cache. Without this reset a single transient R2
    // failure would not fail one tile — it would wedge every tile this isolate
    // ever serves, and the map would stay blank until the isolate recycled.
    archive = null;
    console.error('[map/tiles] failed to read tile', { z, x, y, error });
    return new NextResponse('Tile unavailable', { status: 500 });
  }
}
