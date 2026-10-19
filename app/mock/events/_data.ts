/**
 * Fixtures for /mock/events — the events discover page.
 *
 * The argument of this mock is in the difference between two questions. The
 * live `/e` page answers "list every upcoming event" and `/directory/events`
 * answers "which events match this word". Neither answers the question an
 * actual person arrives with, which is "what is on, near me, soon, that I
 * would like" — a question nobody can type into a search box because it has
 * four clauses and three of them are not words.
 *
 * The first draft of this mock answered it with five filter menus, which was
 * the same mistake in a new costume: a search page still demands that the
 * viewer already know the answer and merely narrow to it. A discover page has
 * to propose, and to say why it proposed. So these fixtures are shaped to
 * support *reasons* rather than facets — the records below carry who hosts an
 * event, which panas have RSVPed, what it is tagged, and how much the host has
 * run before, because those are the four things that can justify showing it to
 * someone. The justification itself is computed in `_reasons.ts`, never typed
 * here; a fixture that carried its own reason would prove nothing.
 *
 * Fields are annotated with the column they stand in for, per
 * app/mock/README.md, so wiring this to real data is mechanical. Nothing here
 * reads the database and nothing here is localized.
 *
 * Dates are written as labels rather than as `Date` objects on purpose. A mock
 * that computes "this weekend" from `Date.now()` renders differently depending
 * on the day the reviewer opens it, and a design review that disagrees with
 * itself on a Monday is not a review.
 */

/** Which of the When chips an event falls under. Derived in production from
 *  `events.startsAt` against the viewer's timezone; fixed here so the mock
 *  reads the same on any day of the week. */
export type WhenBucket = 'today' | 'weekend' | 'month';

/** The Type facet. Production derives this from `events.tags`; the directory
 *  has no `events.category` column and this mock does not propose adding one —
 *  the tag vocabulary is already the thing hosts actually fill in. */
export type EventType = 'market' | 'workshop' | 'show' | 'mixer' | 'talk';

/** The Where facet, keyed the way `lib/lists` writes counties so the mock's
 *  values are the production values. `online` is not a county and that is the
 *  point: an online event belongs to no county, so without a term for it the
 *  Where menu would silently drop it from every answer. */
export type EventCounty = 'miami_dade' | 'broward' | 'palm_beach' | 'online';

/** The Sort facet. `closest` needs a location to measure from and is offered
 *  disabled, the same way the live filter bar offers "Nearest". */
export type EventSort = 'soonest' | 'going' | 'closest';

export interface MockEvent {
  /** events.id */
  id: string;
  /** events.slug — the card links to /e/<slug>, which is already live. */
  slug: string;
  /** events.title */
  title: string;
  /** events.coverImage. Null renders the tinted fallback panel. */
  cover: string | null;
  /** events.description, clamped to two lines by .dirsearch-card-blurb. */
  blurb: string;
  /** events.mode */
  mode: 'offline' | 'online' | 'hybrid';
  /** events.startsAt, already formatted in events.timezone. */
  when: string;
  /** Which When chip this answers to. */
  bucket: WhenBucket;
  /** Short label for the date strip, e.g. "Fri 20". One per calendar day. */
  day: string;
  /** venues.name · venues.city, or "Online" when mode is online. */
  where: string;
  /** venues.county, for the Where facet. `online` when there is no venue. */
  county: EventCounty;
  /** eventRsvps rows with status 'going'. */
  going: number;
  /** events.attendeeCap. Null means uncapped. */
  cap: number | null;
  /** events.tags */
  tags: string[];
  type: EventType;
  /** HOSTS.id — stands in for events.hostProfileId, or hostGroupId when the
   *  host record is a group. Migration 0047 enforces exactly one of the two. */
  host: string;
  /**
   * PANAS.id for every pana the viewer follows who has a 'going' RSVP, as
   * `event_attendees` ∩ `social_follows` would return them.
   *
   * A list rather than the count it replaced, because a count can only produce
   * "3 panas are going" while the list produces "Bee, Claribel and Gabriel
   * are going" — and a reason the viewer can check by name is the difference
   * between a recommendation and an assertion. The count is derived from
   * `.length` wherever it is needed.
   *
   * This is the only viewer-dependent field on the record. Signed out it is
   * not merely empty, it is unknowable, and `_reasons.ts` treats those two
   * cases differently on purpose.
   */
  panasGoing: string[];
}

/* No `price` field, and that absence is a finding rather than an omission.
   An earlier draft of this mock put a "Free" / "$15" chip on every card, which
   looked right and was fiction: `events` has no price or ticket column at all.
   `rentalModel` and `venues.isFree` are venue-side, describing what a host pays
   for a room rather than what a guest pays at the door. Keeping the chip would
   have meant designing a page around a column nobody has agreed to add, so the
   chip is gone and the gap is written down here instead. If door price should
   be on the card, that is a schema decision to take first. */

/**
 * People the viewer follows, for the "your panas are going" reason.
 *
 * Named and faced rather than anonymous avatars: the whole value of a social
 * signal is that you recognise the people in it.
 */
export interface MockPana {
  /** profiles.id */
  id: string;
  /** profiles.name */
  name: string;
  /** profiles.primaryImageCdn */
  avatar: string;
}

export const PANAS: MockPana[] = [
  { id: 'anette', name: 'Anette', avatar: '/img/about/anette_mago.jpg' },
  { id: 'bee', name: 'Bee', avatar: '/img/about/bee_maria.jpg' },
  { id: 'claribel', name: 'Claribel', avatar: '/img/about/claribel_avila.jpg' },
  { id: 'gabriel', name: 'Gabriel', avatar: '/img/about/gbarrios.jpg' },
  { id: 'jess', name: 'Jess', avatar: '/img/about/jdowns.jpg' },
];

/**
 * Whoever is putting the event on.
 *
 * `pastEvents` is the field that makes the anti-popularity lane possible. It is
 * a count of this host's previous published events — `count(*) from events
 * where host_profile_id = ?` — and it is the only way to distinguish a quiet
 * event by someone established from a first event by someone who has never had
 * an audience. Those two look identical under any attendance-based ranking,
 * and only one of them is a discovery.
 */
export interface MockHost {
  /** profiles.id or socialGroups.id */
  id: string;
  /** profiles.name / socialGroups.name */
  name: string;
  /** True when the host is a socialGroup rather than a profile. */
  isGroup: boolean;
  /** Published events by this host before this one. */
  pastEvents: number;
  /** socialFollows row from the viewer to this host. */
  youFollow: boolean;
}

export const HOSTS: MockHost[] = [
  {
    id: 'panamia',
    name: 'Pana Mia Club',
    isGroup: true,
    pastEvents: 48,
    youFollow: false,
  },
  {
    id: 'barrio',
    name: 'Barrio Arts Lab',
    isGroup: true,
    pastEvents: 23,
    youFollow: true,
  },
  {
    id: 'subtropic',
    name: 'Subtropic Collective',
    isGroup: true,
    pastEvents: 9,
    youFollow: true,
  },
  {
    id: 'lucia',
    name: 'Lucía Serrano',
    isGroup: false,
    pastEvents: 1,
    youFollow: false,
  },
  {
    id: 'taller',
    name: 'Taller Lucía',
    isGroup: false,
    pastEvents: 14,
    youFollow: false,
  },
  {
    id: 'census',
    name: 'Miami Artist Census',
    isGroup: true,
    pastEvents: 6,
    youFollow: false,
  },
  {
    id: 'ourflorida',
    name: 'Our Florida',
    isGroup: true,
    pastEvents: 31,
    youFollow: false,
  },
  {
    id: 'maria',
    name: 'Maria Restrepo',
    isGroup: false,
    pastEvents: 0,
    youFollow: false,
  },
  {
    id: 'mwc',
    name: 'Miami Workers Center',
    isGroup: true,
    pastEvents: 19,
    youFollow: false,
  },
  {
    id: 'subfilm',
    name: 'Subtropic Film Festival',
    isGroup: true,
    pastEvents: 4,
    youFollow: false,
  },
  {
    id: 'resilience',
    name: 'Resilience Network',
    isGroup: true,
    pastEvents: 7,
    youFollow: false,
  },
];

/**
 * The signed-in viewer.
 *
 * `attended` is deliberately a history of events *turned up to* rather than a
 * list of chosen interests. Both could drive the tag lane, but they produce
 * different sentences: a stored interest yields "because you like print",
 * which the viewer cannot verify and may not even remember setting, while an
 * attendance row yields "like the MIA Zine Fair you went to", which is checkable
 * in one glance. It also needs no new column — `event_attendees` joined back to
 * `events.tags` already has it — where an interests list would mean asking
 * every new account to fill in a form before the page works at all.
 */
export const VIEWER = {
  name: 'you',
  /** event_attendees where attendee = viewer, joined to events.tags. */
  attended: [
    { title: 'MIA Zine Fair', tags: ['Print', 'Zines', 'Workshop'] },
    { title: 'Climate Futures Teach-In', tags: ['Talk', 'Rights'] },
  ],
};

/* Kept in strict chronological order, because both the date strip and the day
   groups derive their order from this array rather than sorting it. That is
   deliberate: the real query ends in `ORDER BY starts_at`, so the mock should
   fail the same way the product would if a row ever came back out of order,
   rather than paper over it with a client-side sort the server already owes. */
export const MOCK_EVENTS: MockEvent[] = [
  {
    id: 'e1',
    slug: 'little-haiti-night-market',
    title: 'Little Haiti Night Market',
    cover: '/img/directory/market-01.jpg',
    blurb:
      'Forty makers, two food trucks and a sound system under the banyans. Rain or shine, we move under the pavilion.',
    mode: 'offline',
    when: 'Tonight, 6:00 PM',
    bucket: 'today',
    day: 'Thu 19',
    where: 'Little Haiti Cultural Complex · Miami',
    county: 'miami_dade',
    going: 212,
    cap: null,
    tags: ['Market', 'Free', 'Family'],
    type: 'market',
    host: 'panamia',
    panasGoing: ['anette', 'bee', 'claribel'],
  },
  {
    id: 'e2',
    slug: 'risograph-open-studio',
    title: 'Risograph Open Studio',
    cover: '/img/impact/culture-zines-right.webp',
    blurb:
      'Bring a file, leave with a print run. Two drums loaded, paper provided, first twelve people only.',
    mode: 'offline',
    when: 'Tonight, 7:30 PM',
    bucket: 'today',
    day: 'Thu 19',
    where: 'Barrio Arts Lab · Delray Beach',
    county: 'palm_beach',
    going: 11,
    cap: 12,
    tags: ['Print', 'Workshop', 'Zines'],
    type: 'workshop',
    host: 'barrio',
    panasGoing: ['claribel', 'gabriel'],
  },
  {
    id: 'e3',
    slug: 'heatwave-visions-opening',
    title: 'Heatwave Visions: Opening Night',
    cover: '/img/impact/heatwave-visions.webp',
    blurb:
      'Twelve South Florida artists on heat, water and the year the summer did not end. Free, cash bar.',
    mode: 'offline',
    when: 'Fri 20 Feb, 7:00 PM',
    bucket: 'weekend',
    day: 'Fri 20',
    where: 'Bakehouse Art Complex · Wynwood',
    county: 'miami_dade',
    going: 148,
    cap: 300,
    tags: ['Art', 'Free', 'Opening'],
    type: 'show',
    host: 'subtropic',
    panasGoing: ['anette', 'bee', 'claribel', 'gabriel'],
  },
  {
    id: 'e4',
    slug: 'pana-mixer-broward',
    title: 'Pana Mixer: Broward',
    cover: '/img/impact/hero-mixer.webp',
    blurb:
      'The monthly one. No pitches, no panel, no name tags — just panas in a room with arepas.',
    mode: 'offline',
    when: 'Fri 20 Feb, 6:30 PM',
    bucket: 'weekend',
    day: 'Fri 20',
    where: 'The Annex · Fort Lauderdale',
    county: 'broward',
    going: 64,
    cap: 80,
    tags: ['Mixer', 'Members'],
    type: 'mixer',
    host: 'panamia',
    panasGoing: ['anette', 'bee', 'claribel', 'gabriel', 'jess'],
  },
  {
    id: 'e5',
    slug: 'supper-club-six-courses',
    title: 'Supper Club: Six Courses, One Table',
    cover: '/img/directory/supper-club-02.jpg',
    blurb:
      'One long table, eighteen seats, a menu nobody sees until it lands. Dietary notes taken at booking.',
    mode: 'offline',
    when: 'Sat 21 Feb, 7:00 PM',
    bucket: 'weekend',
    day: 'Sat 21',
    where: 'Casa Mariposa · Coral Gables',
    county: 'miami_dade',
    going: 18,
    cap: 18,
    tags: ['Food', 'Ticketed'],
    type: 'mixer',
    host: 'lucia',
    panasGoing: ['anette'],
  },
  {
    id: 'e6',
    slug: 'screenprint-your-own-tote',
    title: 'Screenprint Your Own Tote',
    cover: '/img/directory/apparel-02.jpg',
    blurb:
      'Two hours, one screen, as many pulls as the ink allows. Totes included; bring a shirt if you want.',
    mode: 'offline',
    when: 'Sat 21 Feb, 11:00 AM',
    bucket: 'weekend',
    day: 'Sat 21',
    where: 'Taller Lucía · Little Havana',
    county: 'miami_dade',
    going: 22,
    cap: 24,
    tags: ['Print', 'Workshop', 'Beginner'],
    type: 'workshop',
    host: 'taller',
    panasGoing: ['claribel', 'gabriel', 'jess'],
  },
  {
    id: 'e7',
    slug: 'grant-writing-for-artists',
    title: 'Grant Writing for Artists, Plainly',
    cover: null,
    blurb:
      'What a panel actually reads, what it skips, and the four sentences that decide it. Bring a draft.',
    mode: 'online',
    when: 'Sun 22 Feb, 4:00 PM',
    bucket: 'weekend',
    day: 'Sun 22',
    where: 'Online',
    county: 'online',
    going: 93,
    cap: null,
    tags: ['Talk', 'Funding', 'Free'],
    type: 'talk',
    host: 'census',
    panasGoing: ['gabriel', 'jess'],
  },
  {
    id: 'e8',
    slug: 'sunday-growers-market',
    title: "Sunday Growers' Market",
    cover: '/img/directory/market-03.jpg',
    blurb:
      'Twenty-odd growers from Homestead up. Cash is kindest; most stalls take cards anyway.',
    mode: 'offline',
    when: 'Sun 22 Feb, 9:00 AM',
    bucket: 'weekend',
    day: 'Sun 22',
    where: 'Pinecrest Gardens · Pinecrest',
    county: 'miami_dade',
    going: 310,
    cap: null,
    tags: ['Market', 'Free', 'Family'],
    type: 'market',
    host: 'ourflorida',
    panasGoing: ['anette', 'bee'],
  },
  {
    id: 'e11',
    slug: 'ceramics-wheel-intro',
    title: 'Wheel Throwing, From Nothing',
    cover: '/img/directory/artisanal-01.jpg',
    blurb:
      'Four hands, one wheel, three hours. You leave with two pieces and they fire them for you.',
    mode: 'offline',
    when: 'Tue 24 Feb, 6:00 PM',
    bucket: 'month',
    day: 'Tue 24',
    where: 'Maria Restrepo Studio · Little Haiti',
    county: 'miami_dade',
    going: 8,
    cap: 8,
    tags: ['Ceramics', 'Workshop'],
    type: 'workshop',
    host: 'maria',
    panasGoing: ['bee'],
  },
  {
    id: 'e12',
    slug: 'what-the-county-owes-you',
    title: 'What the County Owes You',
    cover: '/img/impact/partner-miami-workers-center.webp',
    blurb:
      'Tenant rights, wage theft and the three forms that actually move. Interpreters in the room.',
    mode: 'offline',
    when: 'Wed 25 Feb, 6:30 PM',
    bucket: 'month',
    day: 'Wed 25',
    where: 'Miami Workers Center · Liberty City',
    county: 'miami_dade',
    going: 56,
    cap: null,
    tags: ['Talk', 'Free', 'Rights'],
    type: 'talk',
    host: 'mwc',
    panasGoing: ['claribel', 'jess'],
  },
  {
    id: 'e9',
    slug: 'subtropic-shorts-night',
    title: 'Subtropic Shorts Night',
    cover: '/img/impact/filmmaker-participant.webp',
    blurb:
      'Nine shorts under twelve minutes, all shot in the tri-county. Directors stay for questions.',
    mode: 'hybrid',
    when: 'Thu 26 Feb, 8:00 PM',
    bucket: 'month',
    day: 'Thu 26',
    where: 'O Cinema · South Beach',
    county: 'miami_dade',
    going: 77,
    cap: 120,
    tags: ['Film', 'Ticketed'],
    type: 'show',
    host: 'subfilm',
    panasGoing: ['bee', 'claribel', 'gabriel'],
  },
  {
    id: 'e10',
    slug: 'mutual-aid-build-night',
    title: 'Mutual Aid Build Night',
    cover: '/img/impact/community-group.webp',
    blurb:
      'Packing hurricane kits for the Resilience Network. Two hours, no experience needed, pizza after.',
    mode: 'offline',
    when: 'Sat 28 Feb, 2:00 PM',
    bucket: 'month',
    day: 'Sat 28',
    where: 'Miami Workers Center · Liberty City',
    county: 'miami_dade',
    going: 41,
    cap: 60,
    tags: ['Mutual aid', 'Free', 'Volunteer'],
    type: 'mixer',
    host: 'resilience',
    panasGoing: ['anette', 'bee', 'claribel', 'gabriel'],
  },
];

/** The When chips, in the order the rail shows them. `all` is last rather than
 *  first because a discover page opens on the narrow answer — what is on now —
 *  and widening the window is the deliberate act. */
export const WHEN_CHIPS: { key: WhenBucket | 'all'; label: string }[] = [
  { key: 'today', label: 'Tonight' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'month', label: 'Later this month' },
  { key: 'all', label: 'Any time' },
];

/** The Type chips. Labels are plural because they name a set, not an item. */
export const TYPE_CHIPS: { key: EventType; label: string }[] = [
  { key: 'market', label: 'Markets' },
  { key: 'workshop', label: 'Workshops' },
  { key: 'show', label: 'Shows' },
  { key: 'mixer', label: 'Gatherings' },
  { key: 'talk', label: 'Talks' },
];

/** Counties as `lib/lists` writes them, plus Online. "Near me" leads because
 *  it is the answer most people want, and is offered disabled for the same
 *  reason the live filter bar disables "Nearest": there is nothing to measure
 *  from until the viewer shares a location, and an option that silently
 *  returns an order you cannot account for is worse than one you cannot pick. */
export const WHERE_OPTIONS: {
  key: EventCounty | 'near';
  label: string;
  needsLocation?: boolean;
}[] = [
  { key: 'near', label: 'Near me', needsLocation: true },
  { key: 'miami_dade', label: 'Miami-Dade' },
  { key: 'broward', label: 'Broward' },
  { key: 'palm_beach', label: 'Palm Beach' },
  { key: 'online', label: 'Online' },
];

export const SORT_OPTIONS: {
  key: EventSort;
  label: string;
  needsLocation?: boolean;
}[] = [
  { key: 'soonest', label: 'Soonest' },
  { key: 'going', label: 'Most going' },
  { key: 'closest', label: 'Closest', needsLocation: true },
];

/**
 * The host whose chrome this page is being designed for.
 *
 * Stated once, here, because three separate pieces of the mock render it — the
 * toolbar address, the masthead, and the Events tile in the account menu — and
 * the whole point of the mock is that those three agree.
 *
 * This said `directory.panamia.club/events` while the mock was an argument.
 * The argument was settled the other way: events became the fifth surface in
 * its own right rather than a room inside a promoted directory, because what
 * this page turned into is not a filtered list of the directory's fourth kind
 * — it is a page that states a reason for every row, and reasons about events
 * are not reasons about makers. `events` is registered in
 * `lib/panaverse/surfaces.ts` and the shipped page is `/e`.
 *
 * It then said `events.panamia.club` for a while, which is now also wrong. The
 * surface carries `subdomain: null`: it is a surface with its own mark and
 * masthead that lives on the root domain at `/e` rather than a hostname of its
 * own. The address bar here draws what the shipped page actually answers to.
 */
export const MOCK_HOST = 'panamia.club';
export const MOCK_PATH = '/e';
