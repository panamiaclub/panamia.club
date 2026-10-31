import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NATIVE_TABS,
  nativeDeepLinkTarget,
  nativeRootForPath,
  usesNativeAppLayout,
} from '@/lib/mobile/app-navigation';
import {
  nativeBusiness,
  nativeCalendarEvent,
  nativeCoords,
  nativeEvent,
  nativeGroup,
  nativeJoinedGroup,
  nativeMapPins,
  type NativeEvent,
} from '@/lib/mobile/browse';
import {
  nativePreviewHeight,
  nativeSheetHeights,
} from '@/lib/mobile/map-sheet';
import { getDirectorySearchParams } from '@/app/directory/search/_lib/search-params';
import {
  searchParamsToString,
  type SearchResultsInterface,
} from '@/lib/query/directory';
import type {
  CalendarEntry,
  GroupSearchSummary,
  MyGroupSummary,
} from '@/lib/query/social';

const business: SearchResultsInterface = {
  _id: 'listing',
  id: 'listing',
  score: 1,
  score_details: {},
  name: 'Local café',
  screenname: 'local-cafe',
  details: 'Coffee and conversation',
  five_words: 'Coffee and conversation',
  geo: { coordinates: [-80.19, 25.76] },
  images: { primaryCDN: '/test-cafe.jpg' },
  primary_address: { city: 'Miami' },
  categories: ['food_drink'],
  socials: {},
};
const event: NativeEvent = {
  id: 'event',
  slug: 'coffee-meetup',
  title: 'Coffee meetup',
  description: 'Meet the community',
  coverImage: null,
  coverImageAlt: null,
  startsAt: '2026-10-28T23:00:00Z',
  endsAt: null,
  timezone: 'America/New_York',
  mode: 'offline',
  attendeeCount: 7,
  venue: {
    name: 'Local café',
    slug: 'local-cafe',
    city: 'Miami',
    state: 'FL',
    lat: '25.7600000',
    lng: '-80.1900000',
  },
};
const calendar: CalendarEntry = {
  ...event,
  visibility: 'public',
  reason: 'rsvp',
  rsvp: 'maybe',
  hostKind: 'pana',
  hostName: 'Local host',
  hostHandle: 'local-host',
  venueName: 'Local café',
  venueCity: 'Miami',
  because: null,
};
const group: GroupSearchSummary = {
  id: 'group',
  actorId: 'group-actor',
  handle: 'coffee-panas',
  domain: 'example.invalid',
  name: 'Coffee Panas',
  summary: 'A shared love of coffee',
  iconUrl: null,
  headerUrl: null,
  topics: { coffee: true },
  visibility: 'private',
  joinPolicy: 'request',
  memberCount: 12,
  faces: [],
  postsThisWeek: 0,
  nextEvent: null,
  upcomingEventCount: 0,
};

describe('native navigation', () => {
  it('opens the main app in Directory with the approved tab order', () => {
    assert.deepEqual(
      NATIVE_TABS.map(({ id }) => id),
      ['directory', 'social', 'community', 'profile']
    );
    assert.deepEqual(nativeRootForPath('/'), { tab: 'directory' });
    assert.deepEqual(nativeRootForPath('/d'), { tab: 'directory' });
    assert.equal(NATIVE_TABS[3].href, '/account');
  });

  it('honors explicit host, search, calendar and discovery destinations', () => {
    assert.deepEqual(nativeRootForPath('/', 'social'), { tab: 'social' });
    assert.deepEqual(nativeRootForPath('/s'), { tab: 'social' });
    assert.deepEqual(nativeRootForPath('/directory/search/coffee'), {
      tab: 'directory',
    });
    assert.deepEqual(nativeRootForPath('/s/calendar'), {
      tab: 'community',
      view: 'yours',
      section: 'events',
    });
    assert.deepEqual(nativeRootForPath('/groups/discover'), {
      tab: 'community',
      view: 'discover',
      section: 'groups',
    });
    assert.deepEqual(nativeRootForPath('/e'), {
      tab: 'community',
      view: 'discover',
      section: 'events',
    });
  });

  it('leaves existing detail pages and standalone auth/admin screens intact', () => {
    for (const path of [
      '/p/someone',
      '/e/coffee',
      '/e/new',
      '/g/coffee',
      '/groups/new',
      '/account',
    ]) {
      assert.equal(nativeRootForPath(path), null, path);
      assert.equal(usesNativeAppLayout(path), true, path);
    }
    for (const path of [
      '/signin',
      '/signin/check-email',
      '/info/about',
      '/admin',
      '/api/events',
      '/auth/verify',
      '/mock/app',
    ]) {
      assert.equal(usesNativeAppLayout(path), false, path);
    }
    assert.equal(usesNativeAppLayout('/information'), true);
  });

  it('keeps same-origin links relative, including query and fragment', () => {
    assert.equal(
      nativeDeepLinkTarget(
        'https://pana.test/p/someone?from=event#about',
        'https://pana.test',
        'pana.test'
      ),
      '/p/someone?from=event#about'
    );
    assert.equal(
      nativeDeepLinkTarget(
        'https://social.pana.test/s',
        'https://pana.test',
        'pana.test'
      ),
      'https://social.pana.test/s'
    );
  });

  it('rejects credentials, insecure links and hostname lookalikes', () => {
    for (const url of [
      'garbage',
      '/p/someone',
      'http://pana.test/s',
      'javascript:alert(1)',
      'https://pana.test.evil/s',
      'https://evilpana.test/s',
      'https://user:pass@pana.test/s',
      'https://evil.test/s',
    ]) {
      assert.equal(
        nativeDeepLinkTarget(url, 'https://pana.test', 'pana.test'),
        null,
        url
      );
    }
  });
});

describe('native data models', () => {
  it('validates actual coordinates without making up fallback positions', () => {
    assert.deepEqual(nativeCoords('25.76', '-80.19'), {
      lat: 25.76,
      lng: -80.19,
    });
    assert.deepEqual(nativeCoords(0, 0), { lat: 0, lng: 0 });
    for (const [lat, lng] of [
      [null, null],
      ['', ''],
      [' ', -80],
      [true, false],
      [undefined, -80],
      [NaN, 0],
      [Infinity, 0],
      [91, 0],
      [0, -181],
    ]) {
      assert.equal(nativeCoords(lat, lng), null);
    }
  });

  it('opens a public profile even before a business chooses a handle', () => {
    const item = nativeBusiness(business);
    assert.equal(item.href, '/p/local-cafe');
    assert.deepEqual(item.coords, { lat: 25.76, lng: -80.19 });
    assert.equal(item.location, 'Miami');
    assert.equal(
      nativeBusiness({ ...business, screenname: null }).href,
      '/listings/listing'
    );
  });

  it('keeps online and unlocated businesses in the list without pins', () => {
    const online = nativeBusiness({ ...business, online_only: true });
    assert.equal(online.location, 'Online - base ZIP not provided');
    assert.equal(online.coords, null);
    assert.equal(nativeBusiness({ ...business, geo: {} }).coords, null);
    assert.equal(nativeMapPins([online]).length, 0);
  });

  it('uses ZIP bubbles for online businesses without reusing private street points', () => {
    const area = {
      postalCode: '33138',
      country: 'US' as const,
      city: 'Miami',
      region: 'FL',
      lat: 25.8521,
      lng: -80.1821,
    };
    const first = nativeBusiness({
      ...business,
      _id: 'online-one',
      id: 'online-one',
      online_only: true,
      primary_address: { zipcode: '33138' },
      online_zip: area,
      geo: { coordinates: [-122.4, 37.8] },
    });
    const second = { ...first, id: 'online-two' };
    assert.equal(first.coords, null);
    assert.equal(first.location, 'Online - based near ZIP 33138');
    const pins = nativeMapPins([first, second, nativeBusiness(business)]);
    const zip = pins.find((pin) => pin.zipArea);
    assert.ok(zip);
    assert.equal(pins.length, 2);
    assert.deepEqual(zip.coords, { lat: area.lat, lng: area.lng });
    assert.deepEqual(
      zip.items.map((item) => item.id),
      ['online-one', 'online-two']
    );
    const defensive = nativeMapPins([
      { ...first, coords: { lat: 37.8, lng: -122.4 } },
    ]);
    assert.equal(defensive.length, 1);
    assert.deepEqual(defensive[0].coords, zip.coords);
  });

  it('uses the real event venue, event timezone, attendance and detail page', () => {
    const item = nativeEvent(event);
    assert.deepEqual(item.coords, { lat: 25.76, lng: -80.19 });
    assert.equal(item.location, 'Local café / Miami');
    assert.equal(item.href, '/e/coffee-meetup');
    assert.equal(item.meta, '7 going');
    assert.match(item.when ?? '', /7:00\s?PM/i);
    assert.equal(nativeEvent({ ...event, mode: 'online' }).coords, null);
    assert.equal(nativeEvent({ ...event, venue: null }).coords, null);
  });

  it('groups only identical real coordinates, not nearby places or counties', () => {
    const first = nativeEvent(event);
    const second = nativeEvent({ ...event, id: 'second' });
    const nearby = nativeEvent({
      ...event,
      id: 'nearby',
      venue: { ...event.venue!, lat: '25.76001' },
    });
    const online = nativeEvent({ ...event, id: 'online', mode: 'online' });
    const pins = nativeMapPins([first, second, nearby, online]);
    assert.equal(pins.length, 2);
    assert.deepEqual(
      pins[0].items.map(({ id }) => id),
      ['event', 'second']
    );
    assert.deepEqual(
      pins[1].items.map(({ id }) => id),
      ['nearby']
    );
  });

  it('keeps Hosting, Going and Interested distinct from bookmarks', () => {
    assert.equal(nativeCalendarEvent(calendar).annotation, 'Interested');
    assert.equal(
      nativeCalendarEvent({ ...calendar, rsvp: 'going' }).annotation,
      'Going'
    );
    assert.equal(
      nativeCalendarEvent({ ...calendar, reason: 'hosting', rsvp: null })
        .annotation,
      'Hosting'
    );
    assert.equal(nativeEvent(event).annotation, undefined);
  });

  it('never describes a public browse card as private-group activity', () => {
    const item = nativeGroup({ ...group, postsThisWeek: 100 });
    assert.equal(item.annotation, undefined);
    assert.equal(item.location, 'Private group');
    assert.equal(item.href, '/g/coffee-panas');
    assert.equal(
      nativeGroup({ ...group, visibility: 'public', postsThisWeek: 3 })
        .annotation,
      '3 posts this week'
    );
    const joined: MyGroupSummary = {
      ...group,
      name: 'Coffee Panas',
      role: 'member',
      postsThisWeek: 3,
    };
    assert.equal(nativeJoinedGroup(joined).annotation, '3 posts this week');
  });
});

describe('shared URL parsing and measured map sheet', () => {
  it('preserves canonical and legacy website filters and path-term precedence', () => {
    const params = getDirectorySearchParams(
      new URLSearchParams(
        'q=other&p=2&l=30&fcat=food%2Bhealth&mentors=true&expertise=design&lang=es&free=true&sort=name&radius=25&certified=true&events=true&view=map'
      ),
      'coffee'
    );
    assert.equal(params.searchTerm, 'coffee');
    assert.equal(params.pageNum, 2);
    assert.equal(params.pageLimit, 30);
    assert.equal(params.filterCategories, 'food+health');
    assert.equal(params.mentorsOnly, true);
    assert.equal(params.expertise, 'design');
    assert.equal(params.languages, 'es');
    assert.equal(params.freeOnly, true);
    assert.equal(params.sort, 'name');
    assert.equal(params.certifiedOnly, true);
    assert.equal(params.withEventsOnly, true);
    assert.equal(params.view, 'map');
    assert.equal(
      getDirectorySearchParams(new URLSearchParams('sort=invalid')).sort,
      null
    );
  });

  it('keeps exact viewer location off directory request URLs', () => {
    const params = getDirectorySearchParams(new URLSearchParams());
    const query = new URLSearchParams(
      searchParamsToString({
        ...params,
        sort: 'nearest',
        radius: 'all',
        geolat: 25.761689,
        geolng: -80.191788,
      })
    );
    assert.equal(query.get('geolat'), '25.76');
    assert.equal(query.get('geolng'), '-80.19');
  });

  it('fits a selected card with exactly twelve pixels above and below', () => {
    assert.equal(nativePreviewHeight(600, 48, 160), 232);
    assert.equal(nativePreviewHeight(142, 30, 78), 132);
    assert.equal(nativePreviewHeight(80, 30, 78), 80);
    assert.equal(nativePreviewHeight(0, 48, 160), 0);
  });

  it('orders sheet stops and stays within available height, including landscape', () => {
    for (const height of [0, 90, 142, 220, 320, 600, 900]) {
      const { peek, half, expanded } = nativeSheetHeights(height, 106);
      assert.ok(peek >= 0);
      assert.ok(peek <= half && half <= expanded);
      assert.ok(expanded <= height);
    }
    assert.equal(nativeSheetHeights(142, 106).expanded, 142);
    assert.equal(nativeSheetHeights(600, 106).expanded, 486);
  });
});
