import { MOCK_POSTS, MOCK_VIEWER } from '../../feed/_data/mock-feed';
import { LISTINGS } from '../../explore/_data';
import { MOCK_EVENTS, PANAS } from '../../events/_data';
import { buildLanes, type Reason } from '../../events/_reasons';
import { MOCK_GROUPS } from '../../groups/_data/mock-groups';
import { SCOPE_LABEL } from '@/lib/directory-scopes';

export { MOCK_VIEWER, LISTINGS, MOCK_EVENTS, MOCK_GROUPS };

export const APP_TABS = [
  {
    id: 'directory',
    label: 'Directory',
    description: 'Good things, made local.',
  },
  {
    id: 'social',
    label: 'Social',
    description: 'Little moments. Familiar faces.',
  },
  {
    id: 'community',
    label: 'Community',
    description: 'Your groups, your plans, and new discoveries.',
  },
  { id: 'profile', label: 'Profile', description: 'Your own little corner.' },
] as const;

// Only this outgoing link uses a real profile. Discovery stays fixture-based.
export const APP_PROFILE = {
  handle: 'nochillnerd',
  href: 'https://panamia.club/p/nochillnerd',
  avatar:
    'https://pub-32ea3903ddd74e92a629c30bcda3b3c5.r2.dev/profile/nochillnerd/primary093.jpg',
};

export const COMMUNITY_VIEWS = [
  { id: 'yours', label: 'Yours' },
  { id: 'discover', label: 'Discover' },
] as const;

export const APP_SEARCH_SCOPES = [
  {
    id: 'directory',
    siteScope: 'directory',
    label: SCOPE_LABEL.directory,
    searchLabel: 'Search the directory',
    placeholder: 'Shops, makers, services...',
  },
  {
    id: 'events',
    siteScope: 'event',
    label: SCOPE_LABEL.event,
    searchLabel: 'Search events',
    placeholder: 'Event, topic, or place...',
  },
  {
    id: 'groups',
    siteScope: 'group',
    label: SCOPE_LABEL.group,
    searchLabel: 'Search groups',
    placeholder: 'Group name or topic...',
  },
] as const;

export type AppSearchScope = (typeof APP_SEARCH_SCOPES)[number]['id'];

export interface AppSearchResult {
  id: string;
  title: string;
  description: string;
  meta: string;
  image: string | null;
  thumbnail: string | null;
}

export const APP_DIRECTORY_PROFILE_HASH = '#directory/';

export interface AppMapPin {
  id: string;
  label: string;
  coords: { lat: number; lng: number };
}

export interface AppMapResult extends AppSearchResult {
  number: number;
  category: string;
  location: string;
  when?: string;
  pin: AppMapPin | null;
  href?: string;
}

// Area-level sample locations, not coordinates for the fixture venues.
const EVENT_MAP_AREAS: Record<
  Exclude<(typeof MOCK_EVENTS)[number]['county'], 'online'>,
  AppMapPin
> = {
  miami_dade: {
    id: 'events-miami-dade',
    label: 'Miami-Dade',
    coords: { lat: 25.8, lng: -80.2 },
  },
  broward: {
    id: 'events-broward',
    label: 'Broward',
    coords: { lat: 26.2, lng: -80.3 },
  },
  palm_beach: {
    id: 'events-palm-beach',
    label: 'Palm Beach County',
    coords: { lat: 26.65, lng: -80.1 },
  },
};

export function matchesAppSearch(query: string, fields: readonly string[]) {
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const text = normalize(fields.join(' '));
  return normalize(query)
    .trim()
    .split(/\s+/)
    .every((term) => text.includes(term));
}

export function searchAppDirectoryContent(
  scope: Exclude<AppSearchScope, 'directory'>,
  query: string
): AppSearchResult[] {
  if (scope === 'events') {
    return getAppEventMapResults(query);
  }
  return MOCK_GROUPS.filter((group) =>
    matchesAppSearch(query, [
      group.name,
      `@${group.handle}`,
      group.summary,
      ...group.topics,
    ])
  ).map((group) => ({
    id: group.id,
    title: group.name,
    description: group.summary,
    meta: `${group.visibility === 'private' ? 'Private group' : 'Public group'} / ${group.topics.join(', ')}`,
    image: group.cover ?? null,
    thumbnail: group.avatar,
  }));
}

export function getAppDirectoryMapResults(
  query: string,
  category: string
): AppMapResult[] {
  return LISTINGS.filter(
    (listing) =>
      (category === 'All' || listing.categories.includes(category)) &&
      matchesAppSearch(query, [
        listing.name,
        listing.tagline,
        listing.where,
        listing.blurb,
        ...listing.categories,
      ])
  ).map((listing) => ({
    id: listing.id,
    title: listing.name,
    description: listing.tagline,
    meta: listing.where,
    image: listing.cover,
    thumbnail: listing.cover,
    number: LISTINGS.indexOf(listing) + 1,
    category: listing.categories[0],
    location: listing.where,
    pin: listing.coords
      ? { id: listing.id, label: listing.where, coords: listing.coords }
      : null,
    href: `${APP_DIRECTORY_PROFILE_HASH}${listing.id}`,
  }));
}

export function getAppEventMapResults(query: string): AppMapResult[] {
  return MOCK_EVENTS.filter((event) =>
    matchesAppSearch(query, [
      event.title,
      event.blurb,
      event.when,
      event.where,
      event.type,
      ...event.tags,
    ])
  ).map((event) => {
    if (event.mode !== 'online' && event.county === 'online') {
      throw new Error(`The in-person event ${event.id} needs a sample area`);
    }
    return {
      id: event.id,
      title: event.title,
      description: event.blurb,
      meta: `${event.when} / ${event.where}`,
      image: event.cover,
      thumbnail: event.cover,
      number: MOCK_EVENTS.indexOf(event) + 1,
      category: event.tags[0],
      location: event.where,
      when: event.when,
      pin:
        event.mode === 'online' || event.county === 'online'
          ? null
          : EVENT_MAP_AREAS[event.county],
    };
  });
}

export function getAppMapPins(results: readonly AppMapResult[]) {
  const pins = new Map<string, AppMapPin & { results: AppMapResult[] }>();
  for (const result of results) {
    if (!result.pin) continue;
    const existing = pins.get(result.pin.id);
    if (existing) existing.results.push(result);
    else pins.set(result.pin.id, { ...result.pin, results: [result] });
  }
  return [...pins.values()];
}

export type AppRsvp = 'going' | 'interested';

export const APP_INITIAL_RSVPS: { eventId: string; status: AppRsvp }[] = [
  { eventId: 'e1', status: 'going' },
  { eventId: 'e6', status: 'interested' },
];

export function getAppEventGoingCount(
  event: (typeof MOCK_EVENTS)[number],
  rsvp: AppRsvp | undefined
) {
  const initialRsvp = APP_INITIAL_RSVPS.find(
    (entry) => entry.eventId === event.id
  )?.status;
  return (
    event.going + Number(rsvp === 'going') - Number(initialRsvp === 'going')
  );
}

export const SAMPLE_INTERESTS = {
  topics: ['art', 'film', 'tech', 'organising'],
  categories: ['Art', 'Venues'],
};

function describeEventReason(reason: Reason): string {
  switch (reason.kind) {
    case 'follow-host':
      return `You follow ${reason.host}`;
    case 'panas-going':
      return `${reason.panas.length} of your Panas are going`;
    case 'tag-match':
      return `${reason.tags.join(' & ')}, like ${reason.from}`;
    case 'new-host':
      return `${reason.host}'s ${reason.pastEvents === 0 ? 'first' : 'second'} event`;
    case 'popular':
      return `${reason.going} people are going`;
  }
}

export const APP_EVENT_PICKS = buildLanes(MOCK_EVENTS, { signedIn: true })
  .lanes.flatMap((lane) => lane.events)
  .map(({ event, reason }) => ({
    event,
    reason,
    why: describeEventReason(reason),
  }));

export const APP_GROUP_PICKS = MOCK_GROUPS.filter(
  (group) => group.visibility === 'public' && group.joinPolicy !== 'invite'
)
  .map((group) => ({
    group,
    matches: group.topics.filter((topic) =>
      SAMPLE_INTERESTS.topics.includes(topic)
    ),
  }))
  .filter(({ matches }) => matches.length > 0)
  .sort(
    (a, b) =>
      Number(Boolean(a.group.joined)) - Number(Boolean(b.group.joined)) ||
      b.matches.length - a.matches.length
  )
  .map(({ group, matches }) => ({
    group,
    why: `Matches your interest in ${matches.join(' & ')}`,
  }));

export const APP_PLACE_PICKS = LISTINGS.map((listing) => ({
  listing,
  matches: listing.categories.filter((category) =>
    SAMPLE_INTERESTS.categories.includes(category)
  ),
}))
  .filter(({ matches }) => matches.length > 0)
  .map(({ listing, matches }) => ({
    listing,
    why: `Matches your interest in ${matches.join(' & ').toLowerCase()}`,
  }));

// Keep private voice memos and content-warning posts out of this public-feed
// sketch rather than dropping the access controls those fixtures depend on.
export const APP_POSTS = MOCK_POSTS.filter(
  (post) => !post.voice && !post.contentWarning && !post.group
);

const STORY_MEDIA = [
  '/img/impact/culture-zines-left.webp',
  '/img/impact/heatwave-visions.webp',
  '/img/impact/filmfest-collab-left.webp',
  '/img/impact/hero-mixer.webp',
];

export const APP_STORIES = PANAS.filter((pana) => pana.id !== 'claribel')
  .slice(0, STORY_MEDIA.length)
  .map((pana, index) => ({
    ...pana,
    image: STORY_MEDIA[index],
    caption: 'A little moment from around the community. Sample story.',
  }));

export const DIRECTORY_CATEGORIES = [
  'All',
  ...new Set(LISTINGS.flatMap((listing) => listing.categories)),
];
