import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  wearsGuestChrome,
  wearsOwnChrome,
  wearsSurfaceChrome,
} from '@/lib/panaverse/chrome';
import { SURFACES } from '@/lib/panaverse/surfaces';
import { projectMockCoordinates } from '@/app/mock/_data/map';
import {
  APP_EVENT_PICKS,
  APP_DIRECTORY_PROFILE_HASH,
  APP_GROUP_PICKS,
  APP_INITIAL_RSVPS,
  APP_PLACE_PICKS,
  APP_PROFILE,
  APP_SEARCH_SCOPES,
  APP_TABS,
  COMMUNITY_VIEWS,
  LISTINGS,
  MOCK_EVENTS,
  MOCK_GROUPS,
  SAMPLE_INTERESTS,
  getAppEventGoingCount,
  getAppDirectoryMapResults,
  getAppEventMapResults,
  getAppMapPins,
  matchesAppSearch,
  searchAppDirectoryContent,
} from '@/app/mock/app/_data/mock-app';
import { SCOPE_LABEL } from '@/lib/directory-scopes';
import { reasonsFor } from '@/app/mock/events/_reasons';

describe('app navigation mock chrome', () => {
  test('keeps the app preview standalone on every surface', () => {
    for (const surface of SURFACES) {
      for (const path of ['/mock/app', '/mock/app/', '/mock/app?preview=1']) {
        assert.equal(
          wearsOwnChrome(path, surface),
          true,
          `${surface.id}: ${path}`
        );
        assert.equal(wearsGuestChrome(surface, path), false);
        assert.equal(wearsSurfaceChrome(surface, path), false);
      }
    }
  });

  test('does not change chrome for actual app destinations or similar names', () => {
    for (const path of ['/s', '/d', '/e', '/groups', '/mock/app-other']) {
      assert.equal(wearsOwnChrome(path), false, path);
    }
    assert.equal(wearsOwnChrome('/'), false);
  });
});

describe('shared directory mock projection', () => {
  test('insets the four South Florida bounds to leave room for pins', () => {
    for (const [coords, expected] of [
      [
        { lat: 26.85, lng: -80.5 },
        { left: '6%', top: '6%' },
      ],
      [
        { lat: 26.85, lng: -80.0 },
        { left: '94%', top: '6%' },
      ],
      [
        { lat: 25.6, lng: -80.5 },
        { left: '6%', top: '94%' },
      ],
      [
        { lat: 25.6, lng: -80.0 },
        { left: '94%', top: '94%' },
      ],
    ] as const) {
      assert.deepEqual(projectMockCoordinates(coords), expected);
    }
  });

  test('keeps fixture storefronts within the map without inventing online pins', () => {
    const pinned = LISTINGS.filter((listing) => listing.coords !== null);
    assert.equal(pinned.length, 3);
    assert.deepEqual(
      LISTINGS.filter((listing) => listing.coords === null).map(
        (listing) => listing.name
      ),
      ['Sello Press']
    );
    for (const listing of pinned) {
      assert.ok(listing.coords);
      const { left, top } = projectMockCoordinates(listing.coords);
      for (const value of [left, top]) {
        assert.ok(value.endsWith('%'));
        const percentage = Number.parseFloat(value);
        assert.ok(percentage >= 6 && percentage <= 94, value);
      }
    }
  });

  test('preserves north/south and east/west ordering without mutating coordinates', () => {
    const north = Object.freeze({ lat: 26.456, lng: -80.073 });
    const south = Object.freeze({ lat: 25.824, lng: -80.193 });
    const northernPoint = projectMockCoordinates(north);
    const southernPoint = projectMockCoordinates(south);
    assert.ok(
      Number.parseFloat(northernPoint.top) <
        Number.parseFloat(southernPoint.top)
    );
    assert.ok(
      Number.parseFloat(northernPoint.left) >
        Number.parseFloat(southernPoint.left)
    );
    assert.deepEqual(north, { lat: 26.456, lng: -80.073 });
  });
});

describe('app Directory search', () => {
  test('offers the three approved search categories', () => {
    assert.deepEqual(
      APP_SEARCH_SCOPES.map((scope) => [scope.id, scope.label]),
      [
        ['directory', 'Directory'],
        ['events', 'Events'],
        ['groups', 'Groups'],
      ]
    );
    assert.equal(APP_SEARCH_SCOPES[0].searchLabel, 'Search the directory');
    assert.deepEqual(
      APP_SEARCH_SCOPES.map((scope) => scope.siteScope),
      ['directory', 'event', 'group']
    );
    for (const scope of APP_SEARCH_SCOPES) {
      assert.equal(scope.label, SCOPE_LABEL[scope.siteScope]);
    }
  });

  test('matches all query words across fields without casing or accent differences', () => {
    const fields = ['Taller Lucía', 'Little Haiti', 'Art'];
    assert.ok(matchesAppSearch('  LUCIA \t little  ', fields));
    assert.ok(matchesAppSearch('luCi\u0301a art', fields));
    assert.ok(matchesAppSearch(' \n ', fields));
    assert.equal(matchesAppSearch('lucia delray', fields), false);
    assert.equal(matchesAppSearch('unmatched-query', fields), false);
    assert.equal(matchesAppSearch('art+', fields), false);
  });

  test('searches the full event and group catalogs, including existing plans and memberships', () => {
    assert.deepEqual(
      searchAppDirectoryContent('events', '').map((result) => result.id),
      MOCK_EVENTS.map((event) => event.id)
    );
    assert.deepEqual(
      searchAppDirectoryContent('groups', '').map((result) => result.id),
      MOCK_GROUPS.map((group) => group.id)
    );
  });

  test('searches event venues and tags as well as titles', () => {
    const event = MOCK_EVENTS[0];
    for (const query of [event.title, event.where, ...event.tags]) {
      assert.ok(
        searchAppDirectoryContent('events', query).some(
          (result) => result.id === event.id
        ),
        query
      );
    }
    assert.deepEqual(searchAppDirectoryContent('events', 'no-such-event'), []);
  });

  test('searches group handles and topics without exposing private activity or stale counters', () => {
    const group = MOCK_GROUPS.find((entry) => entry.visibility === 'private');
    assert.ok(group);
    for (const query of [`@${group.handle}`, group.handle, ...group.topics]) {
      assert.ok(
        searchAppDirectoryContent('groups', query).some(
          (result) => result.id === group.id
        ),
        query
      );
    }
    const [result] = searchAppDirectoryContent('groups', `@${group.handle}`);
    assert.ok(result);
    assert.ok(result.meta.startsWith('Private group / '));
    assert.equal('postsThisWeek' in result, false);
    assert.equal('memberFaces' in result, false);
    assert.equal('memberCount' in result, false);
    assert.deepEqual(searchAppDirectoryContent('groups', 'no-such-group'), []);
  });
});

describe('shared app map results', () => {
  test('preserves directory ordering, profile links, and online-only listings', () => {
    const results = getAppDirectoryMapResults('', 'All');
    assert.deepEqual(
      results.map((result) => result.id),
      LISTINGS.map((listing) => listing.id)
    );
    for (const result of results) {
      const listing = LISTINGS.find((entry) => entry.id === result.id);
      assert.ok(listing);
      assert.equal(result.href, `${APP_DIRECTORY_PROFILE_HASH}${listing.id}`);
      assert.equal(result.number, LISTINGS.indexOf(listing) + 1);
      assert.equal(result.description, listing.tagline);
      assert.deepEqual(result.pin?.coords ?? null, listing.coords);
    }
    assert.deepEqual(
      getAppDirectoryMapResults('barrio', 'Venues').map((result) => result.id),
      ['b2']
    );
    assert.deepEqual(getAppDirectoryMapResults('barrio', 'Food'), []);
  });

  test('maps in-person and hybrid events to sample areas, never online events', () => {
    const results = getAppEventMapResults('');
    assert.deepEqual(
      results.map((result) => result.id),
      MOCK_EVENTS.map((event) => event.id)
    );
    for (const result of results) {
      const event = MOCK_EVENTS.find((entry) => entry.id === result.id);
      assert.ok(event);
      assert.equal(result.href, undefined);
      assert.equal(result.when, event.when);
      assert.equal(result.location, event.where);
      assert.equal(result.meta, `${event.when} / ${event.where}`);
      assert.equal(result.pin === null, event.mode === 'online');
    }
    const online = getAppEventMapResults('online');
    assert.equal(online.length, 1);
    assert.equal(online[0].pin, null);
    assert.deepEqual(getAppMapPins(online), []);
  });

  test('groups area pins without dropping or duplicating events or changing their source order', () => {
    const results = getAppEventMapResults('');
    const originalIds = results.map((result) => result.id);
    const pins = getAppMapPins(Object.freeze(results));
    assert.equal(pins.length, 3);
    assert.ok(pins.some((pin) => pin.results.length > 1));
    const mappedIds = pins.flatMap((pin) =>
      pin.results.map((result) => result.id)
    );
    assert.equal(new Set(mappedIds).size, mappedIds.length);
    assert.deepEqual(
      new Set(mappedIds),
      new Set(
        MOCK_EVENTS.filter((event) => event.mode !== 'online').map(
          (event) => event.id
        )
      )
    );
    assert.deepEqual(
      results.map((result) => result.id),
      originalIds
    );
    for (const pin of pins) {
      const point = projectMockCoordinates(pin.coords);
      for (const coordinate of [point.left, point.top]) {
        assert.ok(Number.parseFloat(coordinate) >= 6);
        assert.ok(Number.parseFloat(coordinate) <= 94);
      }
    }
    const filteredPins = getAppMapPins(getAppEventMapResults('risograph'));
    assert.equal(filteredPins.length, 1);
    assert.deepEqual(
      filteredPins[0].results.map((result) => result.id),
      ['e2']
    );
  });
});

describe('app Community fixtures', () => {
  test('keeps the approved navigation and existing personal profile destination', () => {
    assert.deepEqual(
      APP_TABS.map((tab) => tab.id),
      ['directory', 'social', 'community', 'profile']
    );
    assert.deepEqual(
      COMMUNITY_VIEWS.map((view) => view.id),
      ['yours', 'discover']
    );
    assert.equal(APP_PROFILE.href, 'https://panamia.club/p/nochillnerd');
  });

  test('uses distinct, valid Going and Interested fixtures instead of saved bookmarks', () => {
    assert.deepEqual(
      APP_INITIAL_RSVPS.map((entry) => entry.status),
      ['going', 'interested']
    );
    assert.equal(
      new Set(APP_INITIAL_RSVPS.map((entry) => entry.eventId)).size,
      APP_INITIAL_RSVPS.length
    );
    for (const entry of APP_INITIAL_RSVPS) {
      const event = MOCK_EVENTS.find((event) => event.id === entry.eventId);
      assert.ok(event, entry.eventId);
      if (entry.status === 'going') {
        assert.ok(event.going > 0);
        assert.ok(event.cap === null || event.going <= event.cap);
      }
    }
  });

  test('deduplicates event picks and computes their reasons from existing signals', () => {
    assert.ok(APP_EVENT_PICKS.length >= 2);
    assert.equal(
      new Set(APP_EVENT_PICKS.map(({ event }) => event.id)).size,
      APP_EVENT_PICKS.length
    );
    for (const { event, reason, why } of APP_EVENT_PICKS) {
      assert.ok(reasonsFor(event).some((entry) => entry.kind === reason.kind));
      assert.ok(why.length > 0);
    }
  });

  test('keeps discovery and browse attendance consistent when initial RSVPs change', () => {
    const going = MOCK_EVENTS.find((event) => event.id === 'e1');
    const interested = MOCK_EVENTS.find((event) => event.id === 'e6');
    const unselected = MOCK_EVENTS.find((event) => event.id === 'e2');
    assert.ok(going);
    assert.ok(interested);
    assert.ok(unselected);
    assert.equal(getAppEventGoingCount(going, 'going'), going.going);
    assert.equal(getAppEventGoingCount(going, undefined), going.going - 1);
    assert.equal(getAppEventGoingCount(going, 'interested'), going.going - 1);
    assert.equal(
      getAppEventGoingCount(interested, 'interested'),
      interested.going
    );
    assert.equal(
      getAppEventGoingCount(interested, 'going'),
      interested.going + 1
    );
    assert.equal(
      getAppEventGoingCount(interested, undefined),
      interested.going
    );
    assert.equal(
      getAppEventGoingCount(unselected, undefined),
      unselected.going
    );
    assert.equal(
      getAppEventGoingCount(unselected, 'going'),
      unselected.going + 1
    );
    assert.equal(
      getAppEventGoingCount(unselected, 'interested'),
      unselected.going
    );
  });

  test('recommends public, joinable groups with matching sample interests', () => {
    assert.ok(APP_GROUP_PICKS.length >= 2);
    for (const { group, why } of APP_GROUP_PICKS) {
      assert.equal(group.visibility, 'public');
      assert.notEqual(group.joinPolicy, 'invite');
      const matches = group.topics.filter((topic) =>
        SAMPLE_INTERESTS.topics.includes(topic)
      );
      assert.ok(matches.length > 0);
      for (const match of matches) assert.ok(why.includes(match));
    }
    assert.equal(Boolean(APP_GROUP_PICKS[0].group.joined), false);
  });

  test('matches directory categories without dropping online-only picks', () => {
    assert.ok(APP_PLACE_PICKS.length >= 2);
    for (const { listing, why } of APP_PLACE_PICKS) {
      const matches = listing.categories.filter((category) =>
        SAMPLE_INTERESTS.categories.includes(category)
      );
      assert.ok(matches.length > 0);
      for (const match of matches) {
        assert.ok(why.includes(match.toLowerCase()));
      }
    }
    assert.ok(APP_PLACE_PICKS.some(({ listing }) => listing.coords === null));
  });
});
