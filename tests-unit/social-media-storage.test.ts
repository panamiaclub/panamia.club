import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseConfigFileTextToJson } from 'typescript';
import {
  planMediaUrlRepairs,
  r2PublicPrefix,
} from '../scripts/repair-social-media-urls';

const SOURCE = 'https://pub-32ea3903ddd74e92a629c30bcda3b3c5.r2.dev';
const TARGET = 'https://pub-7a44043d91eb404599205d0d892b0ae3.r2.dev';
const KEY = 'social/fixture/photo.jpg';
const attachment = {
  id: 'attachment',
  url: `${SOURCE}/${KEY}`,
  mediaType: 'image/jpeg',
};

test('production media URLs point at the verified public URL of the bound bucket', () => {
  const parsed = parseConfigFileTextToJson(
    'wrangler.jsonc',
    readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  );
  assert.equal(parsed.error, undefined);
  const config: {
    vars: Record<string, string>;
    r2_buckets: { binding: string; bucket_name: string }[];
  } = parsed.config;
  assert.equal(config.vars.R2_PUBLIC_URL, TARGET);
  assert.equal(
    config.vars.R2_BUCKET_NAME,
    config.r2_buckets.find((bucket) => bucket.binding === 'R2_BUCKET')
      ?.bucket_name
  );
});

test('repairs preserve the uploaded object key and require a successful HEAD', async () => {
  const requests: { url: string; method?: string; redirect?: string }[] = [];
  const result = await planMediaUrlRepairs(
    [attachment],
    SOURCE,
    TARGET,
    async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method,
        redirect: init?.redirect,
      });
      return new Response(null, {
        headers: { 'Content-Type': 'image/jpeg' },
      });
    }
  );
  assert.deepEqual(requests, [
    { url: `${TARGET}/${KEY}`, method: 'HEAD', redirect: 'error' },
  ]);
  assert.deepEqual(result, {
    repairs: [
      {
        id: attachment.id,
        originalUrl: attachment.url,
        url: `${TARGET}/${KEY}`,
      },
    ],
    unavailable: 0,
  });
});

test('trailing bucket slashes do not create a different object key', async () => {
  const result = await planMediaUrlRepairs(
    [attachment],
    `${SOURCE}/`,
    `${TARGET}/`,
    async () =>
      new Response(null, { headers: { 'Content-Type': 'image/jpeg' } })
  );
  assert.equal(result.repairs[0].url, `${TARGET}/${KEY}`);
});

test('remote, already-correct, empty, and lookalike-host links are untouched', async () => {
  let requests = 0;
  const result = await planMediaUrlRepairs(
    [
      { ...attachment, url: 'https://other.example/photo.jpg' },
      { ...attachment, url: `${SOURCE}.evil.example/${KEY}` },
      { ...attachment, url: `${TARGET}/${KEY}` },
      { ...attachment, url: `${SOURCE}/` },
    ],
    SOURCE,
    TARGET,
    async () => {
      requests++;
      return new Response(null);
    }
  );
  assert.equal(requests, 0);
  assert.deepEqual(result, { repairs: [], unavailable: 0 });
});

test('objects missing from the target keep their original URLs', async () => {
  const result = await planMediaUrlRepairs(
    [attachment],
    SOURCE,
    TARGET,
    async () => new Response(null, { status: 404 })
  );
  assert.deepEqual(result, { repairs: [], unavailable: 1 });
});

test('HTTP failures abort planning instead of producing a partial repair', async () => {
  for (const status of [403, 429, 500, 503]) {
    let requests = 0;
    await assert.rejects(
      planMediaUrlRepairs(
        [attachment, { ...attachment, id: 'second', url: `${SOURCE}/b.jpg` }],
        SOURCE,
        TARGET,
        async () => {
          requests++;
          return requests === 1
            ? new Response(null, { headers: { 'Content-Type': 'image/jpeg' } })
            : new Response(null, { status });
        }
      ),
      new RegExp(`HTTP ${status}`)
    );
  }
});

test('network failures abort planning', async () => {
  await assert.rejects(
    planMediaUrlRepairs([attachment], SOURCE, TARGET, async () => {
      throw new Error('R2 unavailable');
    }),
    /R2 unavailable/
  );
});

test('a successful response with the wrong media type is not a valid repair', async () => {
  await assert.rejects(
    planMediaUrlRepairs(
      [attachment],
      SOURCE,
      TARGET,
      async () =>
        new Response(null, { headers: { 'Content-Type': 'text/html' } })
    ),
    /different media type/
  );
});

test('content-type parameters are accepted and duplicate keys are checked once', async () => {
  let requests = 0;
  const result = await planMediaUrlRepairs(
    [attachment, { ...attachment, id: 'second' }],
    SOURCE,
    TARGET,
    async () => {
      requests++;
      return new Response(null, {
        headers: { 'Content-Type': 'image/jpeg; charset=binary' },
      });
    }
  );
  assert.equal(requests, 1);
  assert.equal(result.repairs.length, 2);
});

test('repair destinations must be public R2 HTTPS origins', () => {
  for (const value of [
    SOURCE.replace('https:', 'http:'),
    'https://127.0.0.1',
    'https://other.example',
    SOURCE.replace('https://', 'https://user:password@'),
    `${SOURCE}:8443`,
    `${SOURCE}/folder`,
    `${SOURCE}?query=1`,
    `${SOURCE}#fragment`,
  ]) {
    assert.throws(() => r2PublicPrefix(value), /HTTPS R2 public bucket/);
  }
  assert.equal(r2PublicPrefix(SOURCE), `${SOURCE}/`);
});

test('repairing to the same bucket is rejected without making requests', async () => {
  await assert.rejects(
    planMediaUrlRepairs([attachment], SOURCE, `${SOURCE}/`, async () => {
      assert.fail('No request should be made');
    }),
    /must be different/
  );
});
