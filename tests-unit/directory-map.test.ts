import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapContainsPoint, readMapPoint } from '@/lib/map/viewport';
import {
  resultCoords,
  resultMapCoords,
  resultZipArea,
} from '@/app/directory/search/_lib/format';
import type { SearchResultsInterface } from '@/lib/query/directory';
import type { OnlineZipArea } from '@/lib/online-zip';
import {
  DIRECTORY_SIGNAL_BATCH_SIZE,
  fetchDirectorySignalStates,
} from '@/lib/directory-signals';

const area: OnlineZipArea = {
  postalCode: '33138',
  country: 'US',
  city: 'Miami',
  region: 'FL',
  lat: 25.8521,
  lng: -80.1821,
};
const business: SearchResultsInterface = {
  _id: 'business',
  id: 'business',
  name: 'Business',
  screenname: null,
  score: 1,
  score_details: {},
  details: '',
  five_words: '',
  images: { primaryCDN: '' },
  socials: {},
  geo: null,
  primary_address: { zipcode: '33138-1234' },
};

describe('visible map bounds', () => {
  const bounds = { west: -80.3, south: 25.7, east: -80.1, north: 25.9 };

  it('uses the actual rectangular viewport, including its edges', () => {
    for (const point of [
      { lat: 25.8, lng: -80.2 },
      { lat: 25.7, lng: -80.3 },
      { lat: 25.9, lng: -80.1 },
    ]) {
      assert.equal(mapContainsPoint(bounds, point), true);
    }
    for (const point of [
      { lat: 25.699, lng: -80.2 },
      { lat: 25.901, lng: -80.2 },
      { lat: 25.8, lng: -80.301 },
      { lat: 25.8, lng: -80.099 },
    ]) {
      assert.equal(mapContainsPoint(bounds, point), false);
    }
  });

  it('retains mappable results before measurement or when WebGL is unavailable', () => {
    assert.equal(mapContainsPoint(null, area), true);
    assert.equal(mapContainsPoint(null, null), false);
    assert.equal(mapContainsPoint(bounds, null), false);
  });

  it('handles wrapped, unwrapped, and whole-world longitudes', () => {
    for (const wrapped of [
      { west: 170, east: -170, south: -10, north: 10 },
      { west: 170, east: 190, south: -10, north: 10 },
      { west: -190, east: -170, south: -10, north: 10 },
    ]) {
      assert.equal(mapContainsPoint(wrapped, { lat: 0, lng: 179 }), true);
      assert.equal(mapContainsPoint(wrapped, { lat: 0, lng: -179 }), true);
      assert.equal(mapContainsPoint(wrapped, { lat: 0, lng: 0 }), false);
    }
    assert.equal(
      mapContainsPoint(
        { west: -240, east: 240, south: -10, north: 10 },
        { lat: 0, lng: -179 }
      ),
      true
    );
  });
});

describe('public directory map precision', () => {
  it('does not turn blank, incomplete, or out-of-range points into locations', () => {
    for (const [lat, lng] of [
      [null, -80],
      ['', -80],
      [true, -80],
      [25, undefined],
      [91, -80],
      [25, -181],
      [NaN, 0],
    ]) {
      assert.equal(readMapPoint(lat, lng), null);
    }
    assert.deepEqual(readMapPoint('25.8', '-80.2'), { lat: 25.8, lng: -80.2 });
  });

  it('uses an exact public point before a ZIP fallback', () => {
    const result = {
      ...business,
      geo: { coordinates: [-80.2, 25.8] },
      zip_area: area,
    };
    assert.deepEqual(resultCoords(result), { lat: 25.8, lng: -80.2 });
    assert.deepEqual(resultMapCoords(result), resultCoords(result));
    assert.equal(resultZipArea(result), null);
  });

  it('keeps a ZIP-only point explicitly approximate, without inventing exact coordinates', () => {
    const result = { ...business, zip_area: area, online_only: false };
    assert.equal(resultCoords(result), null);
    assert.equal(resultZipArea(result), area);
    assert.deepEqual(resultMapCoords(result), { lat: area.lat, lng: area.lng });
    assert.equal(result.online_only, false);
  });

  it('rejects mismatched and malformed ZIP fallbacks', () => {
    assert.equal(
      resultMapCoords({
        ...business,
        zip_area: { ...area, postalCode: '33301' },
      }),
      null
    );
    assert.equal(
      resultMapCoords({ ...business, zip_area: { ...area, lat: NaN } }),
      null
    );
  });

  it('never discloses an online-only street point or substitutes a public fallback for it', () => {
    const online = {
      ...business,
      online_only: true,
      geo: { coordinates: [-122.4, 37.8] },
      zip_area: area,
    };
    assert.equal(resultCoords(online), null);
    assert.equal(resultMapCoords(online), null);
    assert.deepEqual(resultMapCoords({ ...online, online_zip: area }), {
      lat: area.lat,
      lng: area.lng,
    });
  });

  describe('complete-directory viewer signals', () => {
    it('keeps every saved/owner state while respecting the API batch limit', async (t) => {
      const ids = Array.from(
        { length: 137 },
        (_, index) => `business-${index}`
      );
      const requests: string[][] = [];
      t.mock.method(
        globalThis,
        'fetch',
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const batch = new URL(
            String(input),
            'https://test.invalid'
          ).searchParams
            .get('ids')!
            .split(',')
            .filter(Boolean);
          requests.push(batch);
          assert.ok(batch.length <= DIRECTORY_SIGNAL_BATCH_SIZE);
          assert.equal(init?.cache, 'no-store');
          return Response.json({
            success: true,
            data: {
              maySignal: true,
              listings: Object.fromEntries(
                batch.map((id) => [
                  id,
                  {
                    saved: id === 'business-136',
                    recommended: false,
                    isOwner: id === 'business-135',
                  },
                ])
              ),
            },
          });
        }
      );
      const state = await fetchDirectorySignalStates([...ids, ids[0]]);
      assert.deepEqual(
        requests.map((batch) => batch.length),
        [60, 60, 17]
      );
      assert.deepEqual(requests.flat(), ids);
      assert.equal(state.maySignal, true);
      assert.equal(Object.keys(state.listings).length, ids.length);
      assert.equal(state.listings['business-136'].saved, true);
      assert.equal(state.listings['business-135'].isOwner, true);
    });

    it('still resolves viewer-global permissions for an empty collection', async (t) => {
      const requests: string[] = [];
      t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
        requests.push(String(input));
        return Response.json({
          success: true,
          data: { maySignal: false, listings: {} },
        });
      });
      assert.deepEqual(await fetchDirectorySignalStates([]), {
        maySignal: false,
        listings: {},
      });
      assert.deepEqual(requests, ['/api/listings/signals?ids=']);
    });

    it('surfaces failed or malformed batches rather than returning partial saved state', async (t) => {
      for (const response of [
        new Response('', { status: 503 }),
        Response.json({ success: false }),
        Response.json({
          success: true,
          data: { maySignal: true, listings: null },
        }),
      ]) {
        let batch = 0;
        const mocked = t.mock.method(globalThis, 'fetch', async () =>
          batch++ === 0
            ? Response.json({
                success: true,
                data: {
                  maySignal: true,
                  listings: {
                    business: {
                      saved: true,
                      isOwner: false,
                      recommended: false,
                    },
                  },
                },
              })
            : response
        );
        await assert.rejects(
          fetchDirectorySignalStates(
            Array.from({ length: 61 }, (_, index) => String(index))
          )
        );
        mocked.mock.restore();
      }
    });

    it('refuses to merge batches if viewer permissions change during loading', async (t) => {
      let batch = 0;
      t.mock.method(globalThis, 'fetch', async () =>
        Response.json({
          success: true,
          data: { maySignal: batch++ === 0, listings: {} },
        })
      );
      await assert.rejects(
        fetchDirectorySignalStates(
          Array.from({ length: 61 }, (_, index) => String(index))
        ),
        /viewer changed/
      );
    });
  });
});
