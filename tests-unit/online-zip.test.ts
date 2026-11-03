import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  groupOnlineZipListings,
  isOnlineZipArea,
  normalizeUsZip,
  onlineBusinessLocation,
  readOnlineZipArea,
  type OnlineZipArea,
} from '@/lib/online-zip';

const miami: OnlineZipArea = {
  postalCode: '33138',
  country: 'US',
  city: 'Miami',
  region: 'FL',
  lat: 25.8521,
  lng: -80.1821,
};
const broward: OnlineZipArea = {
  postalCode: '33301',
  country: 'US',
  city: 'Fort Lauderdale',
  region: 'FL',
  lat: 26.1216,
  lng: -80.1288,
};

describe('online base ZIP locations', () => {
  test('keeps leading zeroes and strips ZIP+4 before public use', () => {
    assert.equal(normalizeUsZip(' 02108-1234 '), '02108');
    assert.equal(normalizeUsZip('33138'), '33138');
    for (const invalid of [
      null,
      undefined,
      33138,
      '',
      '3313',
      '331380',
      '33138abc',
      '33138 1234',
      'M5V 1A1',
    ]) {
      assert.equal(normalizeUsZip(invalid), null);
    }
  });

  test('accepts only usable US ZIP-area metadata', () => {
    assert.equal(isOnlineZipArea(miami), true);
    for (const invalid of [
      null,
      { ...miami, lat: NaN },
      { ...miami, lng: Infinity },
      { ...miami, lat: 91 },
      { ...miami, country: 'CA' },
      { ...miami, city: '' },
      { ...miami, postalCode: '33138-1234' },
      { ...miami, lat: '25.85' },
    ])
      assert.equal(isOnlineZipArea(invalid), false);
  });

  test('never promotes an old street point or stale ZIP into an online location', () => {
    assert.equal(
      readOnlineZipArea(
        { type: 'Point', coordinates: [-122.4, 37.8] },
        '33138'
      ),
      null
    );
    assert.equal(readOnlineZipArea({ zipArea: miami }, '33301'), null);
    assert.equal(readOnlineZipArea({ zipArea: miami }, '33138-1234'), miami);
  });

  test('creates one nonempty bubble per base ZIP, regardless of service area', () => {
    const items = [
      { id: 'miami-one', area: miami },
      { id: 'ships-anywhere', area: { ...miami } },
      { id: 'broward', area: broward },
      { id: 'missing', area: null },
    ];
    const groups = groupOnlineZipListings(items, (item) => item.area);
    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups[0].items.map((item) => item.id),
      ['miami-one', 'ships-anywhere']
    );
    assert.equal(groups[0].area.postalCode, '33138');
    assert.deepEqual(
      groups[1].items.map((item) => item.id),
      ['broward']
    );
    assert.deepEqual(
      groupOnlineZipListings([], () => null),
      []
    );
    assert.deepEqual(
      groupOnlineZipListings([items[3]], (item) => item.area),
      []
    );
  });

  test('describes a base ZIP without promising pickup, delivery, or directions', () => {
    assert.equal(
      onlineBusinessLocation('33138-1234'),
      'Online - based near ZIP 33138'
    );
    assert.equal(
      onlineBusinessLocation(null),
      'Online - base ZIP not provided'
    );
  });
});
