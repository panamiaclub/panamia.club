/**
 * Tests for batched R2 deletion.
 *
 * These pin two things the nightly purge depends on and that nothing else
 * would catch:
 *
 *  - the 1000-key ceiling on R2's `delete()`. Exceeding it fails the call,
 *    and the caller that would trip it is a cleanup job whose failure mode is
 *    silent: media stays in the bucket and keeps being billed.
 *  - which URLs count as ours. Getting this wrong in the permissive direction
 *    means slicing a key out of a host we do not control; in the strict
 *    direction it means never reclaiming our own storage.
 *
 * No network: the R2 binding is a local fake. `R2_PUBLIC_URL` is read when
 * lib/blob/api.ts is first evaluated, so the import is deferred until after
 * the environment is set.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const PUBLIC_URL = 'https://pub-test.r2.dev';
process.env.R2_PUBLIC_URL = PUBLIC_URL;

const { deleteFiles, bucketKeysFor, R2_DELETE_BATCH } =
  await import('@/lib/blob/api');
const { getStorage } = await import('@/lib/r2');

type FakeBucket = {
  calls: string[][];
  prime: (shouldThrow?: boolean) => void;
};

const fake: FakeBucket = {
  calls: [],
  prime(shouldThrow = false) {
    fake.calls = [];
    getStorage({
      R2_BUCKET: {
        put: async () => undefined,
        delete: async (keys: string | string[]) => {
          fake.calls.push(Array.isArray(keys) ? keys : [keys]);
          if (shouldThrow) throw new Error('R2 unavailable');
        },
        // Unused here — this suite is about deletion — but the bucket type
        // requires it, because the map's tile route reads byte ranges.
        get: async () => null,
      },
    });
  },
};

/** deleteFiles logs to console on the failure path; keep the output readable. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const { log, error } = console;
  console.log = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
    console.error = error;
  }
}

describe('bucketKeysFor', () => {
  test('strips the public base and keeps the nested key', () => {
    const keys = bucketKeysFor(
      [`${PUBLIC_URL}/profile/handle/primary123.jpg`],
      PUBLIC_URL
    );
    assert.deepEqual(keys, ['profile/handle/primary123.jpg']);
  });

  test('ignores media hosted somewhere else', () => {
    // Federated attachments point at the origin server's copy.
    const keys = bucketKeysFor(
      ['https://mastodon.social/media/abc.png'],
      PUBLIC_URL
    );
    assert.deepEqual(keys, []);
  });

  test('ignores a host that merely starts with our base URL', () => {
    // Matching the bare base would treat this as ours and slice a key out of
    // an address we do not control.
    const keys = bucketKeysFor(
      [`${PUBLIC_URL}.evil.example/private/secret.jpg`],
      PUBLIC_URL
    );
    assert.deepEqual(keys, []);
  });

  test('ignores the base URL with no object after it', () => {
    assert.deepEqual(
      bucketKeysFor([PUBLIC_URL, `${PUBLIC_URL}/`], PUBLIC_URL),
      []
    );
  });

  test('returns nothing when R2 is not configured', () => {
    assert.deepEqual(bucketKeysFor([`${PUBLIC_URL}/a.jpg`], ''), []);
  });
});

describe('deleteFiles', () => {
  beforeEach(() => fake.prime());

  test('removes a group in a single call', async () => {
    const result = await quietly(() =>
      deleteFiles([`${PUBLIC_URL}/a.jpg`, `${PUBLIC_URL}/b.jpg`])
    );

    assert.equal(result.ok, true);
    assert.equal(result.deleted, 2);
    assert.equal(fake.calls.length, 1);
    assert.deepEqual(fake.calls[0], ['a.jpg', 'b.jpg']);
  });

  test("splits past R2's 1000-key ceiling", async () => {
    const urls = Array.from(
      { length: R2_DELETE_BATCH * 2 + 500 },
      (_, i) => `${PUBLIC_URL}/story/${i}.jpg`
    );

    const result = await quietly(() => deleteFiles(urls));

    assert.equal(result.ok, true);
    assert.equal(result.deleted, urls.length);
    assert.deepEqual(
      fake.calls.map((c) => c.length),
      [R2_DELETE_BATCH, R2_DELETE_BATCH, 500]
    );
    // No key may be dropped on a chunk boundary.
    assert.equal(new Set(fake.calls.flat()).size, urls.length);
  });

  test('succeeds without calling R2 when nothing is ours', async () => {
    const result = await quietly(() =>
      deleteFiles(['https://mastodon.social/media/abc.png'])
    );

    // Nothing to reclaim is not a failure, and must not defer the story.
    assert.equal(result.ok, true);
    assert.equal(result.deleted, 0);
    assert.equal(fake.calls.length, 0);
  });

  test('succeeds on an empty list', async () => {
    const result = await quietly(() => deleteFiles([]));
    assert.equal(result.ok, true);
    assert.equal(result.deleted, 0);
    assert.equal(fake.calls.length, 0);
  });

  test('reports failure rather than throwing when R2 rejects', async () => {
    fake.prime(true);

    const result = await quietly(() => deleteFiles([`${PUBLIC_URL}/a.jpg`]));

    // The purge job relies on this to defer the story instead of deleting a
    // row whose media is still in the bucket.
    assert.equal(result.ok, false);
    assert.equal(result.deleted, 0);
  });
});
