import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  COUNTIES,
  LISTINGS,
  filterListings,
  getOnlineZipGroups,
  locationDescription,
  mapCoordinatesFor,
  serviceAreasFor,
} from '@/app/mock/directory-online/_data/listings';

describe('online directory mock', () => {
  test('keeps every location kind visible without inventing map pins', () => {
    assert.equal(filterListings().length, 7);
    assert.equal(filterListings({ kind: 'online' }).length, 3);
    assert.equal(LISTINGS.filter(mapCoordinatesFor).length, 2);
    for (const listing of LISTINGS) {
      if (listing.location.kind !== 'storefront') {
        assert.equal(mapCoordinatesFor(listing), null, listing.name);
      }
    }
  });

  test('keeps anywhere businesses in each county without shading a fake area', () => {
    const anywhere = LISTINGS.find((listing) => listing.id === 'sello-press')!;
    for (const county of COUNTIES) {
      assert.ok(
        filterListings({ area: county.id }).some(
          (listing) => listing.id === anywhere.id
        )
      );
    }
    assert.deepEqual(serviceAreasFor(anywhere), []);
    assert.equal(
      locationDescription(anywhere),
      'Base ZIP 33138 (Miami) / Serves anywhere'
    );
    assert.ok(getOnlineZipGroups([anywhere])[0].items.includes(anywhere));
  });

  test('filters a service area without treating it as a storefront', () => {
    assert.deepEqual(
      filterListings({ area: 'broward', kind: 'online' }).map(
        (listing) => listing.id
      ),
      ['luna-wellness', 'sello-press', 'casa-digital']
    );
    assert.deepEqual(
      filterListings({ area: 'palm_beach', kind: 'online' }).map(
        (listing) => listing.id
      ),
      ['sello-press']
    );
    const luna = LISTINGS.find((listing) => listing.id === 'luna-wellness')!;
    assert.deepEqual(serviceAreasFor(luna), ['broward']);
    assert.equal(
      locationDescription(luna),
      'Base ZIP 33301 (Fort Lauderdale) / Serves Broward'
    );
  });

  test('highlights all declared counties for online and mobile services only', () => {
    const casa = LISTINGS.find((listing) => listing.id === 'casa-digital')!;
    const mobile = LISTINGS.find((listing) => listing.id === 'marea-massage')!;
    const storefront = LISTINGS.find(
      (listing) => listing.id === 'rayo-coffee'
    )!;
    assert.deepEqual(serviceAreasFor(casa), ['miami_dade', 'broward']);
    assert.deepEqual(serviceAreasFor(mobile), ['broward', 'palm_beach']);
    assert.deepEqual(serviceAreasFor(storefront), []);
    assert.equal(mapCoordinatesFor(mobile), null);
  });

  test('does not silently classify an incomplete listing as online or local', () => {
    const missing = LISTINGS.find(
      (listing) => listing.id === 'little-sun-studio'
    )!;
    assert.equal(locationDescription(missing), 'Location not provided');
    assert.deepEqual(serviceAreasFor(missing), []);
    assert.equal(mapCoordinatesFor(missing), null);
    assert.equal(filterListings({ kind: 'online' }).includes(missing), false);
    assert.equal(filterListings({ area: 'broward' }).includes(missing), false);
  });

  test('searches across identity, service area, and connection type', () => {
    assert.deepEqual(
      filterListings({ query: '  LUNA   broward ' }).map(
        (listing) => listing.id
      ),
      ['luna-wellness']
    );
    assert.deepEqual(
      filterListings({ query: 'wellness', area: 'palm_beach' }).map(
        (listing) => listing.id
      ),
      ['marea-massage']
    );
    assert.deepEqual(filterListings({ query: 'no-matching-business' }), []);
    assert.equal(
      filterListings({ kind: 'online' }).filter(mapCoordinatesFor).length,
      0
    );
  });

  test('groups online businesses by base ZIP rather than service counties', () => {
    assert.deepEqual(
      getOnlineZipGroups(LISTINGS).map((group) => ({
        zip: group.area.postalCode,
        ids: group.items.map((listing) => listing.id),
      })),
      [
        { zip: '33301', ids: ['luna-wellness'] },
        { zip: '33138', ids: ['sello-press', 'casa-digital'] },
      ]
    );
    for (const group of getOnlineZipGroups(LISTINGS)) {
      assert.equal(
        new Set(group.items.map((listing) => listing.id)).size,
        group.items.length
      );
      for (const listing of group.items) {
        assert.equal(mapCoordinatesFor(listing), null);
        assert.equal(listing.location.kind, 'online');
      }
    }
  });

  test('maps anywhere businesses at their base ZIP, but never fabricates mobile or incomplete ZIPs', () => {
    for (const kind of ['mobile', 'storefront', 'unprovided'] as const) {
      assert.deepEqual(getOnlineZipGroups(filterListings({ kind })), []);
    }
    assert.equal(
      getOnlineZipGroups(filterListings({ query: 'Sello Press' }))[0].area
        .postalCode,
      '33138'
    );
    assert.equal(filterListings({ query: 'Sello Press' }).length, 1);
  });

  test('updates bubble counts and membership with search and county filters', () => {
    assert.deepEqual(
      getOnlineZipGroups(filterListings({ query: 'wellness' })).map((group) => [
        group.area.postalCode,
        group.items.length,
      ]),
      [['33301', 1]]
    );
    const broward = getOnlineZipGroups(filterListings({ area: 'broward' }));
    assert.deepEqual(
      broward.map((group) => [group.area.postalCode, group.items.length]),
      [
        ['33301', 1],
        ['33138', 2],
      ]
    );
    const miami = getOnlineZipGroups(filterListings({ area: 'miami_dade' }));
    assert.deepEqual(
      miami.map((group) => [group.area.postalCode, group.items.length]),
      [['33138', 2]]
    );
    assert.equal(
      getOnlineZipGroups(filterListings({ area: 'palm_beach' }))[0].items
        .length,
      1
    );
    assert.deepEqual(
      getOnlineZipGroups(filterListings({ query: 'no-matching-business' })),
      []
    );
  });
});
