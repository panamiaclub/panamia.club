/**
 * Cloudflare R2 Storage
 *
 * getStorage(env) must be called from worker/index.ts at the start of every request.
 * API routes and server components access the bucket via the `storage` proxy without
 * needing to pass env explicitly — same pattern as lib/db.ts / getDb().
 *
 * - Production (CF Workers): env.R2_BUCKET — native binding, no credentials needed
 * - Local dev (vinext dev / wrangler dev): miniflare simulates R2_BUCKET from wrangler.jsonc
 * - Local dev (plain Node.js): getStorage() returns null → lib/blob/api.ts falls back to S3 API
 */

/** A single stored object, or the slice of one that a range read asked for. */
export interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
}

// Minimal R2Bucket interface — mirrors @cloudflare/workers-types
export interface R2Bucket {
  put(
    key: string,
    value:
      ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
  /**
   * Read an object, optionally a byte range of one.
   *
   * The range form is what makes the map's PMTiles archive practical: it is a
   * few hundred megabytes, and a single tile is a few kilobytes somewhere
   * inside it. R2 serves the slice, so no request reads more than the tile it
   * was asked for. Returns null when the key does not exist.
   */
  get(
    key: string,
    options?: { range?: { offset: number; length?: number } }
  ): Promise<R2ObjectBody | null>;
}

export interface CloudflareEnv {
  R2_BUCKET?: R2Bucket;
}

let cachedBucket: R2Bucket | null = null;

export function getStorage(env?: CloudflareEnv): R2Bucket | null {
  if (env?.R2_BUCKET) {
    cachedBucket = env.R2_BUCKET;
  }
  return cachedBucket;
}

export const storage: R2Bucket = new Proxy({} as R2Bucket, {
  get(_, prop: string | symbol) {
    const bucket = getStorage();
    if (!bucket) {
      throw new Error(
        'R2: bucket not initialized. Call getStorage(env) from the Worker entry point first.'
      );
    }
    return (bucket as unknown as Record<string | symbol, unknown>)[prop];
  },
});
