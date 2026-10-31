import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  lookupOnlineZipArea,
  ZipLookupUnavailableError,
} from '@/lib/server/online-zip';

const payload = {
  'post code': '33138',
  'country abbreviation': 'US',
  places: [
    {
      'place name': 'Miami',
      'state abbreviation': 'FL',
      latitude: '25.8521',
      longitude: '-80.1821',
    },
  ],
};

test('ZIP lookup sends only the normalized public ZIP and validates its coordinates', async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return Response.json(payload);
  });
  assert.deepEqual(await lookupOnlineZipArea('33138-1234'), {
    postalCode: '33138',
    country: 'US',
    city: 'Miami',
    region: 'FL',
    lat: 25.8521,
    lng: -80.1821,
  });
  assert.deepEqual(requests, ['https://api.zippopotam.us/us/33138']);
  assert.equal(await lookupOnlineZipArea('331380'), null);
  assert.equal(requests.length, 1);
});

test('an unknown ZIP is distinct from a provider outage', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('', { status: 404 })
  );
  assert.equal(await lookupOnlineZipArea('00000'), null);
});

test('provider failures surface rather than inventing a map location', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('', { status: 503 })
  );
  await assert.rejects(lookupOnlineZipArea('33138'), ZipLookupUnavailableError);
});

test('malformed, mismatched, blank, or out-of-range provider responses are rejected', async (t) => {
  for (const invalid of [
    {},
    { ...payload, 'post code': '33301' },
    { ...payload, places: [{ ...payload.places[0], latitude: '' }] },
    { ...payload, places: [{ ...payload.places[0], longitude: '181' }] },
  ]) {
    const mocked = t.mock.method(globalThis, 'fetch', async () =>
      Response.json(invalid)
    );
    await assert.rejects(
      lookupOnlineZipArea('33138'),
      ZipLookupUnavailableError
    );
    mocked.mock.restore();
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('not-json'));
  await assert.rejects(lookupOnlineZipArea('33138'), ZipLookupUnavailableError);
});

test('transport failures retain an explicit error cause', async (t) => {
  const cause = new Error('Network unavailable');
  t.mock.method(globalThis, 'fetch', async () => {
    throw cause;
  });
  await assert.rejects(
    lookupOnlineZipArea('33138'),
    (error: unknown) =>
      error instanceof ZipLookupUnavailableError && error.cause === cause
  );
});
