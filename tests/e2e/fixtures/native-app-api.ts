import type { Page } from '@playwright/test';
import type { SearchResultsInterface } from '@/lib/query/directory';
import type { NativeEvent } from '@/lib/mobile/browse';
import type { CalendarEntry, GroupSearchSummary } from '@/lib/query/social';
import type { DiscoveryEvent } from '@/lib/events/lanes';

const image = '/logos/pana_logo_long_orange.png';
const future = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString();
const cafe = {
  name: 'Bay Cafe',
  city: 'Miami',
  state: 'FL',
  slug: 'bay-cafe',
  lat: '25.76',
  lng: '-80.19',
};
const north = {
  ...cafe,
  name: 'North Studio',
  city: 'Fort Lauderdale',
  lat: '26.12',
  lng: '-80.14',
};

export function createNativeApiFixtures() {
  const businesses: SearchResultsInterface[] = [
    {
      _id: 'cafe',
      id: 'cafe',
      name: 'Bay Cafe',
      screenname: 'bay-cafe',
      score: 1,
      score_details: {},
      details: 'Coffee, neighbors and conversation by the bay.',
      five_words: 'Coffee, neighbors and conversation.',
      geo: { coordinates: [-80.19, 25.76] },
      images: { primaryCDN: image },
      primary_address: { city: 'Miami' },
      categories: ['food'],
      socials: {},
    },
    {
      _id: 'studio',
      id: 'studio',
      name: 'North Studio',
      screenname: 'north-studio',
      score: 1,
      score_details: {},
      details: 'A creative place to gather.',
      five_words: 'Make something together.',
      geo: { coordinates: [-80.14, 26.12] },
      images: { primaryCDN: image },
      primary_address: { city: 'Fort Lauderdale' },
      categories: ['art'],
      socials: {},
    },
    {
      _id: 'online',
      id: 'online',
      name: 'Remote Design',
      screenname: 'remote-design',
      score: 1,
      score_details: {},
      details: 'Design help online.',
      five_words: 'Design help wherever you are.',
      geo: { coordinates: [-80.2, 25.8] },
      images: { primaryCDN: image },
      online_only: true,
      socials: {},
    },
  ];
  const events: NativeEvent[] = Array.from({ length: 28 }, (_, i) => ({
    id: `event-${i}`,
    slug: `event-${i}`,
    title:
      [
        'Coffee at Bay Cafe',
        'Coffee workshop',
        'Music under the palms',
        'Online conversation',
      ][i] ?? `Community gathering ${i}`,
    description: 'Meet neighbors and enjoy time with the community.',
    coverImage: image,
    coverImageAlt: null,
    startsAt: future(i + 1),
    endsAt: null,
    timezone: 'America/New_York',
    mode: i === 3 ? 'online' : 'offline',
    attendeeCount: i + 2,
    venue: i < 2 ? cafe : i < 4 ? north : null,
  }));
  const groups: GroupSearchSummary[] = Array.from({ length: 27 }, (_, i) => ({
    id: i === 0 ? 'joined' : i === 1 ? 'pending' : `group-${i}`,
    actorId: `group-actor-${i}`,
    handle:
      i === 0 ? 'joined-club' : i === 1 ? 'pending-club' : `new-club-${i}`,
    domain: 'example.invalid',
    name:
      i === 0
        ? 'Our private club'
        : i === 1
          ? 'Pending club'
          : `Neighborhood club ${i}`,
    summary: 'A group built around a shared interest.',
    iconUrl: image,
    headerUrl: image,
    topics: { arts: true },
    visibility: i < 2 ? 'private' : 'public',
    joinPolicy: i < 2 ? 'request' : 'open',
    memberCount: i + 10,
    faces: [],
    postsThisWeek: i < 2 ? 0 : i,
    nextEvent: null,
    upcomingEventCount: 0,
  }));
  const plan: CalendarEntry = {
    ...events[2],
    visibility: 'public',
    reason: 'rsvp',
    rsvp: 'maybe',
    hostKind: 'pana',
    hostName: 'Community host',
    hostHandle: 'host',
    venueName: north.name,
    venueCity: north.city,
    because: null,
  };
  const discoveries: DiscoveryEvent[] = events.slice(4, 10).map((event) => ({
    id: event.id,
    slug: event.slug,
    title: event.title,
    blurb: event.description ?? '',
    cover: event.coverImage,
    coverAlt: null,
    mode: event.mode,
    startsAt: event.startsAt,
    when: 'Sat, 7:00 PM',
    day: 'Sat',
    bucket: 'month',
    timezone: event.timezone,
    where: 'Miami',
    going: event.attendeeCount,
    cap: 40,
    tags: ['arts'],
    host: { id: 'host', name: 'Community host', isGroup: false },
    reasons: [{ kind: 'follow-host', host: 'Community host' }],
  }));
  const state = {
    signedIn: true,
    activeId: 'personal',
    fail: new Set<string>(),
    saved: new Map([
      ['personal', new Set(['event-0'])],
      ['business', new Set(['event-1'])],
    ]),
    joined: true,
    requests: [] as { pathname: string; query: string; method: string }[],
    unhandled: [] as string[],
  };
  const envelope = (data: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data }),
  });
  const identities = [
    {
      id: 'personal',
      name: 'Native Viewer',
      screenname: 'native-viewer',
      isPersonal: true,
      role: 'owner',
      active: true,
      primaryImageCdn: image,
    },
    {
      id: 'business',
      name: 'Viewer Business',
      screenname: 'viewer-business',
      isPersonal: false,
      role: 'owner',
      active: true,
      primaryImageCdn: image,
    },
  ];
  function respond(url: URL, method = 'GET', body?: string | null) {
    const path = url.pathname;
    state.requests.push({ pathname: path, query: url.search, method });
    if (path.startsWith('/api/map/tiles/'))
      return { status: 200, contentType: 'application/x-protobuf', body: '' };
    if (state.fail.has(path))
      return {
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Test service unavailable',
        }),
      };
    if (path === '/api/auth/get-session') {
      return {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          state.signedIn
            ? {
                user: {
                  id: 'native-test-user',
                  name: 'Native Viewer',
                  email: 'native@example.invalid',
                  emailVerified: true,
                  createdAt: future(-1),
                  updatedAt: future(-1),
                },
                session: {
                  id: 'native-test-session',
                  userId: 'native-test-user',
                  token: 'test-only',
                  createdAt: future(-1),
                  updatedAt: future(-1),
                  expiresAt: future(1),
                },
              }
            : null
        ),
      };
    }
    if (path === '/api/config/turnstile') {
      return {
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Turnstile is not configured' }),
      };
    }
    if (path === '/api/profile/switch') {
      if (method === 'POST')
        state.activeId = JSON.parse(body ?? '{}').profileId;
      return {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: identities,
          activeProfileId: state.activeId,
          pendingInvitations: [],
        }),
      };
    }
    if (path === '/api/getDirectorySearch') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const data = businesses.filter((item) =>
        `${item.name} ${item.details}`.toLowerCase().includes(q)
      );
      return {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data,
          pagination: { page: 1, limit: 20, total: data.length, totalPages: 1 },
        }),
      };
    }
    if (path === '/api/events') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const matches = events.filter((item) =>
        item.title.toLowerCase().includes(q)
      );
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 20);
      return envelope({
        events: matches.slice(offset, offset + limit),
        hasMore: matches.length > offset + limit,
      });
    }
    if (path === '/api/social/groups') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const matches = groups.filter((item) =>
        item.name?.toLowerCase().includes(q)
      );
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 24);
      return envelope({
        groups: matches.slice(offset, offset + limit),
        query: q,
      });
    }
    if (path === '/api/social/actors/me/groups')
      return envelope({
        groups:
          state.joined && state.activeId === 'personal'
            ? [
                {
                  ...groups[0],
                  name: 'Our private club',
                  role: 'member',
                  postsThisWeek: 3,
                },
              ]
            : [],
        pending:
          state.activeId === 'personal'
            ? [
                {
                  id: 'pending',
                  name: 'Pending club',
                  handle: 'pending-club',
                  iconUrl: image,
                },
              ]
            : [],
      });
    if (path === '/api/social/actors/me/calendar')
      return envelope({
        committed: state.activeId === 'personal' ? [plan] : [],
        suggested: [],
      });
    if (path === '/api/social/actors/me/saved-events')
      return envelope({
        events: events.filter((event) =>
          state.saved.get(state.activeId)?.has(event.slug)
        ),
      });
    const save = /^\/api\/events\/([^/]+)\/save$/.exec(path);
    if (save && (method === 'POST' || method === 'DELETE')) {
      const saves = state.saved.get(state.activeId)!;
      if (method === 'POST') saves.add(save[1]);
      else saves.delete(save[1]);
      return envelope({ saved: method === 'POST' });
    }
    if (path === '/api/discover/events')
      return envelope({
        events: discoveries,
        dismissedIds: [],
        signedIn: state.signedIn,
      });
    if (path === '/api/social/actors/me')
      return envelope({
        eligible: true,
        screenname:
          state.activeId === 'personal' ? 'native-viewer' : 'viewer-business',
        actor: {
          id: `actor-${state.activeId}`,
          username:
            state.activeId === 'personal' ? 'native-viewer' : 'viewer-business',
          name:
            state.activeId === 'personal' ? 'Native Viewer' : 'Viewer Business',
          profileId: state.activeId,
          domain: 'example.invalid',
          iconUrl: image,
          summary: '',
          statusCount: 0,
          followersCount: 0,
          followingCount: 0,
          uri: 'https://example.invalid/p/native-viewer',
          local: true,
        },
      });
    if (path === '/api/social/timeline' || path === '/api/social/statuses')
      return envelope({ statuses: [], nextCursor: null });
    if (path === '/api/social/follows')
      return envelope({ actors: [], nextCursor: null });
    if (path === '/api/social/stories/summary')
      return envelope(
        Object.fromEntries(
          (url.searchParams.get('usernames') ?? '')
            .split(',')
            .map((username) => [
              username,
              { hasStories: false, hasUnseen: false, isOwner: true, count: 0 },
            ])
        )
      );
    if (path === '/api/notifications/unread-count')
      return envelope({ count: 0 });
    if (path === '/api/notifications')
      return envelope({ notifications: [], total: 0 });
    if (path === '/api/social/messages/conversations')
      return envelope({ conversations: [], unreadCount: 0 });
    if (path === '/api/user/me')
      return envelope({ name: 'Native Viewer', screenname: 'native-viewer' });
    state.unhandled.push(`${method} ${path}`);
    return {
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: `Unhandled test API: ${path}`,
      }),
    };
  }
  return { state, respond };
}

export async function installNativeApiFixtures(page: Page) {
  const fixtures = createNativeApiFixtures();
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    await route.fulfill(
      fixtures.respond(
        new URL(request.url()),
        request.method(),
        request.postData()
      )
    );
  });
  return fixtures;
}
