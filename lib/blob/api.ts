/**
 * R2 Object Storage API
 *
 * In CF Workers (prod + vinext/wrangler dev): uses the native R2Bucket binding
 * primed by worker/index.ts — no credentials needed at runtime.
 *
 * In plain Node.js dev (yarn dev): falls back to the S3-compatible API using
 * R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY from .env.local.
 *
 * R2_PUBLIC_URL must always be set — it is the base URL for the public bucket
 * (e.g. https://pub-xxx.r2.dev or a custom domain).
 */

import { getStorage } from '@/lib/r2';
import { AwsClient } from 'aws4fetch';

const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');

function inferContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    weba: 'audio/webm',
    mp4: 'video/mp4',
    webm: 'video/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}

// S3-compatible client for the plain-Node dev fallback (no R2 binding present).
function getR2Client(): AwsClient {
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    region: 'auto',
    service: 's3',
  });
}

const R2_ENDPOINT = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// Encode each path segment but preserve the "/" separators in the object key.
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

function objectUrl(key: string): string {
  return `${R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${encodeKey(key)}`;
}

/**
 * Upload a file to R2 storage.
 * @param fileName - Object key (e.g. "profile/handle/primary123.jpg")
 * @param file - File data as Buffer
 * @returns The public URL of the uploaded file, or null on failure
 */
export const uploadFile = async (
  fileName: string,
  file: Buffer
): Promise<string | null> => {
  try {
    const contentType = inferContentType(fileName);
    const bucket = getStorage();

    if (bucket) {
      // CF Workers: native binding (no credentials needed)
      await bucket.put(fileName, file, { httpMetadata: { contentType } });
    } else {
      // Node.js fallback: S3-compatible API signed with aws4fetch.
      const res = await getR2Client().fetch(objectUrl(fileName), {
        method: 'PUT',
        body: new Uint8Array(file),
        headers: { 'Content-Type': contentType },
      });
      if (!res.ok) {
        throw new Error(`R2 PUT failed: ${res.status} ${await res.text()}`);
      }
    }

    const url = `${R2_PUBLIC_URL}/${fileName}`;
    console.log(`R2:PUT:${fileName} -> ${url}`);
    return url;
  } catch (error) {
    console.error('R2 upload error:', error);
    return null;
  }
};

/** R2's binding accepts at most 1000 keys in a single delete call. */
export const R2_DELETE_BATCH = 1000;

/**
 * Workers allow 6 simultaneous outgoing connections per invocation. The
 * binding path does not need this (one call carries 1000 keys), but the
 * Node dev fallback has no batch delete and must fan out by hand.
 */
const NODE_DELETE_CONCURRENCY = 6;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Map public URLs onto the bucket keys we are allowed to delete.
 *
 * A URL that is not ours is not an error and not ours to remove -- federated
 * media points at somebody else's server -- so it is dropped rather than
 * failing the batch.
 *
 * The separator is part of the prefix on purpose. Matching on the bare base
 * URL also matches a lookalike host such as `https://pub-xyz.r2.dev.evil.com/`,
 * and would then slice a key out of an address we do not control.
 *
 * Pure, and takes the base URL as an argument instead of reading the module
 * constant, so the prefix arithmetic is testable without environment setup.
 */
export function bucketKeysFor(urls: string[], publicUrl: string): string[] {
  if (!publicUrl) return [];
  const prefix = `${publicUrl}/`;
  return urls
    .filter((url) => url.startsWith(prefix))
    .map((url) => url.slice(prefix.length))
    .filter((key) => key.length > 0);
}

export interface BatchDeleteResult {
  /** False if any key in the group may still be present in the bucket. */
  ok: boolean;
  /** Objects removed. URLs we do not own are not counted -- nothing was reclaimed. */
  deleted: number;
}

/**
 * Delete several files from R2 in as few round trips as possible.
 *
 * The binding takes up to 1000 keys per call, so a whole batch of expired
 * story media collapses into one request. Calling deleteFile() in a loop cost
 * a round trip per object, which is the reason the expiry purge could only
 * afford to process a couple of hundred stories per run.
 *
 * All-or-nothing by design: R2's batch delete reports no per-key outcome, so
 * a caller that needs to know *which* object survived must call this with a
 * smaller group. lib/jobs/purge-expired.ts does exactly that -- one bulk
 * attempt, then a per-story retry to attribute the failure.
 */
export const deleteFiles = async (
  urls: string[]
): Promise<BatchDeleteResult> => {
  const keys = bucketKeysFor(urls, R2_PUBLIC_URL);
  if (keys.length === 0) {
    // Either nothing was passed, or none of it was ours. Both mean there is
    // nothing left to reclaim, so this is success rather than a no-op failure.
    return { ok: true, deleted: 0 };
  }

  try {
    const bucket = getStorage();

    if (bucket) {
      for (const batch of chunk(keys, R2_DELETE_BATCH)) {
        await bucket.delete(batch);
      }
    } else {
      // Node.js fallback: the S3-compatible API has no batch delete, so send
      // them in bounded waves rather than one at a time.
      const client = getR2Client();
      for (const wave of chunk(keys, NODE_DELETE_CONCURRENCY)) {
        const outcomes = await Promise.all(
          wave.map(async (key) => {
            const res = await client.fetch(objectUrl(key), {
              method: 'DELETE',
            });
            // R2 returns 204 on delete; 404 is fine (already gone).
            return res.ok || res.status === 404;
          })
        );
        if (outcomes.some((ok) => !ok)) {
          throw new Error('R2 DELETE failed for one or more keys');
        }
      }
    }

    console.log(`R2:DELETE:${keys.length} object(s)`);
    return { ok: true, deleted: keys.length };
  } catch (error) {
    console.error('R2 delete error:', error);
    return { ok: false, deleted: 0 };
  }
};

/**
 * Delete a file from R2 storage.
 * @param url - The full public URL of the file to delete
 * @returns true on success, false on failure
 */
export const deleteFile = async (url: string): Promise<boolean> => {
  const { ok } = await deleteFiles([url]);
  return ok;
};

/**
 * Check if R2 storage is configured.
 */
export const isConfigured = (): boolean => {
  return !!R2_PUBLIC_URL;
};
