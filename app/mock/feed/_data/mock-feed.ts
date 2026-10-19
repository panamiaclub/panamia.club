/* Fixture data for the Pana Social feed mock at /mock/feed.
 *
 * The feed is the timeline surface: many authors, one reader. That is the one
 * structural difference from /mock/profile, where every post belongs to the
 * profile owner — so posts here carry their own `author` rather than borrowing
 * one from the page.
 *
 * Deliberately hardcoded and deliberately not localized: this route exists to
 * agree on the *shape* of the timeline before it is wired to `socialStatuses`,
 * `socialActors`, `socialAttachments`, `socialFollows`, or `relayGroups`.
 * Every field is annotated with the column it stands in for, so the swap to
 * real data is mechanical.
 *
 * Feature coverage is not decorative. Content warnings, attachments, location,
 * CC licenses, boosts, replies, and voice memos all already exist in
 * components/social — the redesign has to have an answer for each of them, so
 * each one appears at least once below.
 */

/** The filter rail above the timeline. */
export type FeedFilter = 'panas' | 'everyone' | 'groups' | 'voice';

/** Which fixture set the mock renders. `empty` is the state in production
 *  today — a new account with nothing to read — and is the state the redesign
 *  most needs to fix, so it is a first-class variant rather than a footnote. */
export type FeedState = 'populated' | 'empty';

export interface MockAuthor {
  /** socialActors.name */
  name: string;
  /** users.screenname, which is also socialActors.username */
  handle: string;
  /** profiles.primaryImageCdn */
  avatar: string;
  /** profiles.counties, shown only when profiles.verification is set. */
  county?: string;
}

export interface MockAttachment {
  /** socialAttachments.url */
  src: string;
  /** socialAttachments.name — the alt text a poster typed. */
  alt: string;
}

/** socialAttachments with mediaType audio/*, rendered by WaveformPlayer. */
export interface MockVoiceMemo {
  /** Formatted mm:ss rather than a duration in seconds, since nothing here
   *  does arithmetic on it. */
  duration: string;
  /** Peak heights 0–1. Sixteen samples is enough to read as a waveform at
   *  card width without turning into noise. */
  peaks: number[];
  /** Voice memos between Panas are private by design, so the card has to say
   *  so — this is the copy that appears beside the player. */
  note: string;
}

/** An outbound link unfurled into a card. */
export interface MockLinkPreview {
  /** Bare host, because a full URL wraps and reads as noise in a card. */
  domain: string;
  title: string;
  description: string;
}

export interface MockPost {
  id: string;
  author: MockAuthor;
  /** socialStatuses.content, plain text here — the real column holds HTML. */
  body: string;
  /** Pre-formatted relative time; socialStatuses.published in the real thing. */
  published: string;
  repliesCount: number;
  likesCount: number;
  announcesCount: number;
  /** Whether the reader has already liked it, so the card has a lit state. */
  liked?: boolean;
  /** True when the author is a mutual follow. Drives the Panas filter. */
  fromPana?: boolean;
  /** relayGroups.name — set when addressed to a group rather than the timeline. */
  group?: string;
  /** socialStatuses.contentWarning. Collapses the body behind a disclosure. */
  contentWarning?: string;
  /** socialStatuses.location, at the precision the poster chose. */
  location?: string;
  /** socialStatuses.ccLicense */
  ccLicense?: string;
  /** Who boosted this into the reader's timeline, if anyone. An Announce in
   *  ActivityPub terms; renders as the attribution line above the card. */
  boostedBy?: string;
  attachments?: MockAttachment[];
  voice?: MockVoiceMemo;
  link?: MockLinkPreview;
  /** The top reply, previewed under the post so a conversation is visible
   *  without a tap. Feeds that hide replies read as broadcast, not community. */
  topReply?: {
    author: MockAuthor;
    body: string;
    published: string;
  };
}

const CLARIBEL: MockAuthor = {
  name: 'Claribel Ávila',
  handle: 'claribel',
  avatar: '/img/about/claribel_avila.jpg',
  county: 'Miami-Dade',
};

const BEE: MockAuthor = {
  name: 'Bee María',
  handle: 'beemaria',
  avatar: '/img/about/bee_maria.jpg',
  county: 'Broward',
};

const ANETTE: MockAuthor = {
  name: 'Anette Mago',
  handle: 'anettemago',
  avatar: '/img/about/anette_mago.jpg',
  county: 'Miami-Dade',
};

const GBARRIOS: MockAuthor = {
  name: 'G. Barrios',
  handle: 'gbarrios',
  avatar: '/img/about/gbarrios.jpg',
};

const JDOWNS: MockAuthor = {
  name: 'J. Downs',
  handle: 'jdowns',
  avatar: '/img/about/jdowns.jpg',
  county: 'Miami-Dade',
};

/** A verified directory listing posting to the county timeline. The reader
 *  does not follow it — it is here to show the one thing this feed has that a
 *  generic social app cannot: the businesses in the directory are accounts. */
const TALLER: MockAuthor = {
  name: 'Taller Tropical',
  handle: 'tallertropical',
  avatar: '/img/impact/hero-mixer.webp',
  county: 'Miami-Dade',
};

/** The signed-in reader. The composer and the rail are written from here. */
export const MOCK_VIEWER = {
  ...CLARIBEL,
  /** Mutual follows. The figure the Panas filter is counting. */
  panas: 1284,
  /** relayGroupMembers rows for this actor. */
  groups: 6,
  /** Unread since the last visit — what the "new posts" pill is offering. */
  unread: 12,
};

/** A group the viewer belongs to.
 *
 * Mirrors what `useMyGroups()` returns, which deliberately includes private
 * groups: that hook answers "where do I belong", asked by the member about
 * themselves. The public variant used on a stranger's profile hides private
 * memberships, and using it here is what made the feed rail undercount anyone
 * in a private group. */
export interface MockGroup {
  /** socialGroups.id */
  id: string;
  /** socialGroups.handle — resolves to /g/[handle] */
  handle: string;
  /** socialGroups.name */
  name: string;
  /** socialGroups.visibility.
   *
   * Load-bearing in the composer, not a badge. `visibleGroupStatuses` reads
   * the *group's* visibility to decide who may see a post addressed to it, so
   * picking a group settles the audience question outright — there is no
   * second choice left to offer. */
  visibility: 'public' | 'private';
  /** socialGroupMembers rows at status='active'. */
  memberCount: number;
}

/** The six in `MOCK_VIEWER.groups`, named so the count and the list agree.
 *
 * Mixed visibility on purpose: a picker that only ever shows public groups
 * hides the case where the choice actually changes who can read the post. */
export const MOCK_MY_GROUPS: MockGroup[] = [
  {
    id: 'group-1',
    handle: 'littlehaitimakers',
    name: 'Little Haiti Makers',
    visibility: 'public',
    memberCount: 212,
  },
  {
    id: 'group-2',
    handle: 'heatwavevisions',
    name: 'Heatwave Visions',
    visibility: 'private',
    memberCount: 34,
  },
  {
    id: 'group-3',
    handle: 'bikesofbroward',
    name: 'Bikes of Broward',
    visibility: 'public',
    memberCount: 478,
  },
  {
    id: 'group-4',
    handle: 'surplusandswap',
    name: 'Surplus & Swap',
    visibility: 'public',
    memberCount: 903,
  },
  {
    id: 'group-5',
    handle: 'vendorsunion',
    name: 'Vendors Union 305',
    visibility: 'private',
    memberCount: 61,
  },
  {
    id: 'group-6',
    handle: 'nightmarketcrew',
    name: 'Night Market Crew',
    visibility: 'private',
    memberCount: 18,
  },
];

/* The timeline audiences used to be duplicated here as `MOCK_AUDIENCES`.
 *
 * They now live in `components/social/destination-picker` as
 * `VISIBILITY_OPTIONS`, and this mock renders that same component, so the
 * wording approved here is literally the wording the product ships. Keeping a
 * second copy was how the mock and the product could drift apart while both
 * looked right in isolation. */

export const MOCK_POSTS: MockPost[] = [
  {
    id: 'post-1',
    author: BEE,
    fromPana: true,
    body: 'Recorded the canal at Davie Road at 6am before traffic picked up. Thirty seconds of water, birds, and one extremely opinionated frog. Headphones recommended.',
    published: '18m',
    repliesCount: 9,
    likesCount: 64,
    announcesCount: 7,
    liked: true,
    location: 'Davie, Broward County',
    voice: {
      duration: '0:31',
      peaks: [
        0.2, 0.45, 0.7, 0.35, 0.85, 0.55, 0.95, 0.4, 0.65, 0.8, 0.3, 0.6, 0.9,
        0.25, 0.5, 0.35,
      ],
      note: 'Voice memo · only Panas can hear this',
    },
    topReply: {
      author: JDOWNS,
      body: 'The frog is the star. Put it on a 7 inch.',
      published: '9m',
    },
  },
  {
    id: 'post-2',
    author: CLARIBEL,
    fromPana: true,
    body: 'Pulled 120 copies of the new zine tonight and the registration held on every single one. Little Haiti print gods are being generous. Trade you one for a cafecito.',
    published: '2h',
    repliesCount: 14,
    likesCount: 96,
    announcesCount: 11,
    ccLicense: 'CC BY-SA',
    attachments: [
      {
        src: '/img/impact/zine-series.webp',
        alt: 'A stack of freshly printed risograph zines in orange and blue ink',
      },
    ],
  },
  {
    id: 'post-3',
    author: ANETTE,
    fromPana: true,
    group: 'Little Haiti Makers',
    body: 'Kiln is fired and there are four open shelves this weekend. First four Panas to reply get a slot — bring greenware only, no glaze surprises this time please.',
    published: '4h',
    repliesCount: 22,
    likesCount: 58,
    announcesCount: 4,
    attachments: [
      {
        src: '/img/impact/community-group.webp',
        alt: 'Makers working together around a shared studio table',
      },
      {
        src: '/img/impact/culture-zines-left.webp',
        alt: 'Shelves of finished ceramic and print work',
      },
    ],
    topReply: {
      author: BEE,
      body: 'Slot one, claiming it before I finish reading the sentence.',
      published: '3h',
    },
  },
  {
    id: 'post-4',
    author: GBARRIOS,
    boostedBy: 'Anette Mago',
    body: 'Finished the rent series. Eleven households, eighteen months, every one of them still here — which is the part nobody writes about. Full set goes up Friday.',
    published: '7h',
    repliesCount: 31,
    likesCount: 204,
    announcesCount: 48,
    contentWarning: 'Housing displacement, eviction',
    ccLicense: 'CC BY-NC',
    attachments: [
      {
        src: '/img/impact/filmfest-collab-left.webp',
        alt: 'Documentary photograph from a Miami housing series',
      },
    ],
  },
  {
    // Neither fromPana nor boosted: this post exists so the Everyone tab has
    // something the Panas tab does not, and so the county timeline has a face.
    id: 'post-8',
    author: TALLER,
    body: 'Press night Thursday, 6 to 9. Two Risographs, one very opinionated paper cutter, and whoever shows up. First run is free if it is your first time.',
    published: '9h',
    repliesCount: 8,
    likesCount: 52,
    announcesCount: 14,
    location: 'Little Haiti, Miami-Dade',
  },
  {
    id: 'post-5',
    author: JDOWNS,
    fromPana: true,
    body: 'Repair café Saturday, 10 to 2, same spot. Bring the lamp you have been meaning to fix since 2019. We have a new soldering station and zero judgment.',
    published: '11h',
    repliesCount: 6,
    likesCount: 87,
    announcesCount: 19,
    location: 'Buena Vista, Miami-Dade',
    link: {
      domain: 'panamia.club',
      title: 'Saturday Repair Café — 33137',
      description:
        'Free repairs, shared tools, and coffee. Drop in any time between 10am and 2pm.',
    },
  },
  {
    id: 'post-6',
    author: ANETTE,
    fromPana: true,
    body: 'Genuine question for the Panas: where is everyone buying paper by the ream that is not a chain? I would rather give the money to somebody on this app.',
    published: '1d',
    repliesCount: 47,
    likesCount: 39,
    announcesCount: 3,
    topReply: {
      author: CLARIBEL,
      body: 'Two in the directory, both family-run. Sending you both.',
      published: '23h',
    },
  },
  {
    id: 'post-7',
    author: BEE,
    fromPana: true,
    group: 'Heatwave Visions',
    body: 'First Tuesday is locked. Theme is heat and memory — bring one piece, finished or not, and be ready to say why it is not done.',
    published: '1d',
    repliesCount: 12,
    likesCount: 71,
    announcesCount: 9,
    attachments: [
      {
        src: '/img/impact/heatwave-visions.webp',
        alt: 'Artwork from the Heatwave Visions collective',
      },
    ],
  },
];

/* --------------------------------------------------------------------------
   Modules injected between posts.

   A timeline of nothing but posts is exactly the feed in the screenshot: fine
   when it is full, dead when it is not. These give the surface something to
   say on a slow day and are the reason a new account is never looking at an
   empty column.
   -------------------------------------------------------------------------- */

export interface MockSuggestion {
  author: MockAuthor;
  /** socialActors.summary, clamped to two lines. */
  blurb: string;
  /** Why this person is being suggested. Never show a suggestion that cannot
   *  explain itself — unexplained suggestions are how a feed loses trust. */
  reason: string;
}

export const MOCK_SUGGESTIONS: MockSuggestion[] = [
  {
    author: {
      name: 'Bee María',
      handle: 'beemaria',
      avatar: '/img/about/bee_maria.jpg',
    },
    blurb: 'Sound artist. Field recordings from every canal in Broward.',
    reason: '9 Panas in common',
  },
  {
    author: {
      name: 'G. Barrios',
      handle: 'gbarrios',
      avatar: '/img/about/gbarrios.jpg',
    },
    blurb: 'Documentary photographer covering Miami housing.',
    reason: 'Also in Zine Club MIA',
  },
  {
    author: {
      name: 'J. Downs',
      handle: 'jdowns',
      avatar: '/img/about/jdowns.jpg',
    },
    blurb: 'Runs the Saturday repair café. Fixes anything with a cord.',
    reason: 'Near Buena Vista',
  },
];

export interface MockEvent {
  id: string;
  title: string;
  /** Pre-formatted from events.starts_at. Distinct from MOCK_CALENDAR below:
   *  this strip is discovery — what is on near you, whether or not you have
   *  any connection to it — while the calendar is what you personally have
   *  coming. Both read the same table; only the filter differs. */
  when: string;
  where: string;
  host: string;
  image: string;
  imageAlt: string;
  goingCount: number;
}

export const MOCK_EVENTS: MockEvent[] = [
  {
    id: 'event-1',
    title: 'Bilingual print workshop',
    when: 'Sat · 2:00 PM',
    where: 'Little Haiti',
    host: 'Little Haiti Makers',
    image: '/img/impact/culture-zines-right.webp',
    imageAlt: 'Printed posters drying on a rack',
    goingCount: 38,
  },
  {
    id: 'event-2',
    title: 'Pana Social dinner · long table',
    when: 'Sun · 6:30 PM',
    where: 'Allapattah',
    host: 'Pana Social Dinners',
    image: '/img/impact/pana-social-dinner.webp',
    imageAlt: 'A long communal dinner table filled with Pana Mia members',
    goingCount: 64,
  },
  {
    id: 'event-3',
    title: 'Subtropic shorts night',
    when: 'Thu · 8:00 PM',
    where: 'Downtown',
    host: 'Subtropic Film Festival',
    image: '/img/impact/filmmaker-participant.webp',
    imageAlt: 'A filmmaker introducing a short film to an audience',
    goingCount: 27,
  },
];

export interface MockDirectorySpotlight {
  name: string;
  /** profiles.descriptions.fiveWords */
  fiveWords: string;
  neighborhood: string;
  image: string;
  imageAlt: string;
  tags: string[];
}

/* The directory is the other half of Pana Mia, so the feed points at it on
   purpose — a social surface that never mentions the businesses is a missed
   connection between the two things the site does. */
export const MOCK_DIRECTORY_SPOTLIGHT: MockDirectorySpotlight = {
  name: 'Taller Tropical',
  fiveWords: 'Risograph studio, open press nights',
  neighborhood: 'Little Haiti · Miami-Dade',
  image: '/img/impact/hero-mixer.webp',
  imageAlt: 'People gathered at a Pana Mia community mixer',
  tags: ['printmaking', 'workshops', 'open studio'],
};

/** Tag ticker in the rail. Counts stand in for a trending query that will run
 *  over socialStatuses tags once there is enough volume to be meaningful. */
export const MOCK_TRENDING: { tag: string; posts: number }[] = [
  { tag: 'rentseries', posts: 214 },
  { tag: 'repaircafe', posts: 168 },
  { tag: 'zineclub', posts: 142 },
  { tag: 'openstudio', posts: 97 },
  { tag: 'canalrecordings', posts: 61 },
];

/* --------------------------------------------------------------------------
   Empty state.

   The production feed answers a brand new account with a grey box and "No
   posts yet." That is technically accurate and completely useless: it tells
   someone the product is broken rather than telling them what to do. These are
   the three things a new Pana can actually do, in the order that fills a feed
   fastest.
   -------------------------------------------------------------------------- */

export interface MockEmptyStep {
  title: string;
  description: string;
  cta: string;
  /** Pre-computed so the step can promise a concrete result, not a vague one. */
  payoff: string;
}

export const MOCK_EMPTY_STEPS: MockEmptyStep[] = [
  {
    title: 'Follow a few Panas',
    description:
      'Your feed is built from the people you follow. Three or four is enough for it to stop being quiet.',
    cta: 'Browse Panas',
    payoff: '1,284 Panas near Little Haiti',
  },
  {
    title: 'Join a group',
    description:
      'Groups post whether or not you follow anyone, so joining one fills your feed the same day.',
    cta: 'Find groups',
    payoff: '22 open groups in Miami-Dade',
  },
  {
    title: 'Say something first',
    description:
      'Introduce yourself, ask for a recommendation, or post what you are working on. Posts from new Panas get shown around.',
    cta: 'Write a post',
    payoff: 'Seen by everyone in your county',
  },
];

/* --------------------------------------------------------------------------
   Filters
   -------------------------------------------------------------------------- */

export const FEED_FILTERS: { id: FeedFilter; label: string; hint: string }[] = [
  {
    id: 'panas',
    label: 'Panas',
    hint: 'Posts from the people you follow who follow you back.',
  },
  {
    id: 'everyone',
    label: 'Everyone',
    hint: 'Every public post from Pana Mia members, newest first.',
  },
  {
    id: 'groups',
    label: 'Groups',
    hint: 'Posts addressed to the groups you belong to.',
  },
  {
    id: 'voice',
    label: 'Voice notes',
    hint: 'Audio posts from your Panas. Headphones encouraged.',
  },
];

/** Single source of truth for which posts a filter shows. The counts in the
 *  rail and the posts in the column both run through here, so a tab can never
 *  advertise a number it does not then render. */
export function postsForFilter(filter: FeedFilter): MockPost[] {
  switch (filter) {
    // A boost is how a Pana hands you someone you do not follow yet, so a
    // boosted post belongs in this column even when its author is a stranger.
    case 'panas':
      return MOCK_POSTS.filter((post) => post.fromPana || post.boostedBy);
    case 'groups':
      return MOCK_POSTS.filter((post) => post.group);
    case 'voice':
      return MOCK_POSTS.filter((post) => post.voice);
    case 'everyone':
      return MOCK_POSTS;
  }
}

/** Modules the feed is designed to hold but that have no backing feature yet,
 *  shown in the rail so the column width is agreed on now rather than after
 *  the fact.
 *
 *  "Events & RSVPs" used to lead this list. It has been promoted out of it:
 *  the `events` and `event_attendees` tables both shipped, so the rail can
 *  render a real calendar instead of a placeholder describing one. */
export const RESERVED_MODULES: { title: string; description: string }[] = [
  {
    title: 'Saved posts',
    description: 'Bookmarks that survive a scroll, grouped into named lists.',
  },
  {
    title: 'Jams',
    description: 'Live rooms a Pana can drop into straight from the timeline.',
  },
];

/* ------------------------------------------------------------------------ *
 * Your calendar
 * ------------------------------------------------------------------------ */

/**
 * Where an event came from.
 *
 * Not three tables. `events` has exactly one host, enforced by the
 * `events_single_host` CHECK added in 0047: either `host_group_id` or
 * `host_profile_id`, never both and never neither. A directory listing and a
 * pana are both profiles, so the split below is a presentation distinction
 * drawn from `profiles.accountType`, not a structural one.
 *
 * It is worth drawing anyway. "Clay & Kiln is running a class" and "Jules is
 * hosting a repair café" are different invitations, and flattening both to
 * "hosted by" loses which one you are reading.
 */
export type CalendarHostKind = 'group' | 'pana' | 'directory';

/**
 * Why this event is on your calendar.
 *
 * The load-bearing field. A calendar that mixes "I said I would be there"
 * with "this might interest you" is useless for planning, because the whole
 * reason to open it is to find out what you have already committed to. So
 * `rsvp` events are a different section from the rest, never interleaved.
 *
 * 'going' and 'maybe' are `event_attendees.status`; the enum's third value is
 * 'not_going', which by definition never reaches a calendar.
 */
export type CalendarReason = 'rsvp' | 'group' | 'following';

export interface MockCalendarEvent {
  /** events.id */
  id: string;
  /** events.slug — the row links to /e/[slug]. */
  slug: string;
  /** events.title */
  title: string;
  /** Pre-formatted from events.starts_at in events.timezone, same as the
   *  groups mock. Fixture order is chronological; nothing here sorts. */
  dayLabel: string;
  /** Month and day, for the line beside dayLabel. Separate because "Saturday"
   *  and "Sat the 11" side by side says the weekday twice. */
  dateLabel: string;
  /** Short weekday for the date block, e.g. THU. */
  weekday: string;
  /** Day of month for the date block. */
  dateNum: string;
  time: string;
  /** venues.name · venues.neighborhood. Null when events.mode is 'online',
   *  which is why the venue is nullable in the schema too. */
  where: string | null;
  /** events.mode — 'online' events have no venue to show. */
  online?: boolean;
  host: {
    kind: CalendarHostKind;
    name: string;
    /** socialActors.icon_url for a group, profiles.primaryImageCdn
     *  otherwise. */
    avatar: string;
  };
  /** events.visibility. There is no 'private': NIP-52 calendar events have no
   *  concept of one, so the enum is public | unlisted and an unlisted event is
   *  reachable by link but absent from /e. A group's events inherit the
   *  group's reach in practice, which is why the unlisted one below belongs to
   *  the invite-only supper club. */
  visibility: 'public' | 'unlisted';
  /** events.attendee_count — verified 'going' RSVPs only. */
  attendeeCount: number;
  /** event_attendees.status for the viewer, null when they have not replied. */
  rsvp: 'going' | 'maybe' | null;
  reason: CalendarReason;
  /** Rendered when reason is not 'rsvp': the calendar has to say why it is
   *  showing you something you never asked for, or it reads as spam. */
  because?: string;
}

/**
 * The viewer's next two weeks.
 *
 * Written against the awkward cases on purpose, same as every other fixture
 * here: a clash (two events on Oct 11), an unlisted one, an online one with no
 * venue, a 'maybe', and a stretch of nothing between Oct 12 and Oct 16 so the
 * day grouping has a gap to get wrong.
 *
 * The three host kinds are all present because the whole argument for this
 * page is that they belong on one surface. A member of a printmaking group who
 * follows a ceramicist and RSVP'd to a dinner currently has to visit three
 * places to answer "what am I doing this weekend".
 */
export const MOCK_CALENDAR: MockCalendarEvent[] = [
  {
    id: 'cal-1',
    slug: 'rough-cut-night-october',
    title: 'Rough Cut Night',
    dayLabel: 'Today',
    dateLabel: 'Oct 9',
    weekday: 'THU',
    dateNum: '9',
    time: '7:30 PM',
    where: 'O Cinema · South Beach',
    host: {
      kind: 'group',
      name: 'Subtropic Film Collective',
      avatar: '/img/impact/filmmaker-participant.webp',
    },
    visibility: 'public',
    attendeeCount: 61,
    rsvp: 'going',
    reason: 'rsvp',
  },
  {
    id: 'cal-2',
    slug: 'bilingual-print-workshop',
    title: 'Bilingual print workshop',
    dayLabel: 'Saturday',
    dateLabel: 'Oct 11',
    weekday: 'SAT',
    dateNum: '11',
    time: '11:00 AM',
    where: 'Bakehouse Art Complex · Wynwood',
    host: {
      kind: 'group',
      name: 'Little Haiti Makers',
      avatar: '/img/impact/culture-zines-right.webp',
    },
    visibility: 'public',
    attendeeCount: 38,
    rsvp: 'going',
    reason: 'rsvp',
  },
  {
    /* Deliberately the same day as cal-2 and deliberately later. A calendar
       whose fixtures never collide has not been tested as a calendar. */
    id: 'cal-3',
    slug: 'supper-at-bees',
    title: "Supper at Bee's",
    dayLabel: 'Saturday',
    dateLabel: 'Oct 11',
    weekday: 'SAT',
    dateNum: '11',
    time: '7:00 PM',
    where: 'Buena Vista',
    host: {
      kind: 'group',
      name: 'Thursday Supper Club',
      avatar: '/img/impact/pana-social-dinner.webp',
    },
    visibility: 'unlisted',
    attendeeCount: 11,
    rsvp: 'going',
    reason: 'rsvp',
  },
  {
    id: 'cal-4',
    slug: 'long-table-dinner-allapattah',
    title: 'Long table dinner',
    dayLabel: 'Sunday',
    dateLabel: 'Oct 12',
    weekday: 'SUN',
    dateNum: '12',
    time: '6:30 PM',
    where: 'Allapattah',
    host: {
      kind: 'directory',
      name: 'Pana Social Dinners',
      avatar: '/img/impact/hero-mixer.webp',
    },
    visibility: 'public',
    attendeeCount: 64,
    rsvp: 'maybe',
    reason: 'rsvp',
  },
  {
    /* No venue, because events.mode is 'online' and venue_id is null. The row
       has to not render an empty bullet where the neighbourhood goes. */
    id: 'cal-5',
    slug: 'portfolio-review-online',
    title: 'Portfolio review, open call',
    dayLabel: 'Thursday',
    dateLabel: 'Oct 16',
    weekday: 'THU',
    dateNum: '16',
    time: '8:00 PM',
    where: null,
    online: true,
    host: {
      kind: 'pana',
      name: 'G. Barrios',
      avatar: '/img/about/gbarrios.jpg',
    },
    visibility: 'public',
    attendeeCount: 19,
    rsvp: null,
    reason: 'following',
    because: 'You follow G. Barrios',
  },
  {
    id: 'cal-6',
    slug: 'zine-swap-coffee',
    title: 'Zine swap + coffee',
    dayLabel: 'Saturday',
    dateLabel: 'Oct 18',
    weekday: 'SAT',
    dateNum: '18',
    time: '10:00 AM',
    where: 'Coconut Grove',
    host: {
      kind: 'group',
      name: 'Zine Club MIA',
      avatar: '/img/impact/culture-zines-left.webp',
    },
    visibility: 'public',
    attendeeCount: 23,
    rsvp: null,
    reason: 'group',
    because: "You're in Zine Club MIA",
  },
  {
    id: 'cal-7',
    slug: 'repair-cafe-october',
    title: 'Repair café',
    dayLabel: 'Saturday',
    dateLabel: 'Oct 18',
    weekday: 'SAT',
    dateNum: '18',
    time: '1:00 PM',
    where: 'Little River',
    host: {
      kind: 'pana',
      name: 'J. Downs',
      avatar: '/img/about/jdowns.jpg',
    },
    visibility: 'public',
    attendeeCount: 31,
    rsvp: null,
    reason: 'following',
    because: 'You follow J. Downs',
  },
];

/** What you have actually committed to. The calendar proper. */
export function calendarCommitted(): MockCalendarEvent[] {
  return MOCK_CALENDAR.filter((event) => event.reason === 'rsvp');
}

/** Relevant but unanswered. Kept apart from the above on purpose — see the
 *  docblock on CalendarReason. */
export function calendarSuggested(): MockCalendarEvent[] {
  return MOCK_CALENDAR.filter((event) => event.reason !== 'rsvp');
}

/** Committed events grouped into days, preserving fixture order so a day with
 *  two events keeps them in time order. */
export function calendarByDay(): {
  dayLabel: string;
  dateLabel: string;
  weekday: string;
  dateNum: string;
  events: MockCalendarEvent[];
}[] {
  const days: ReturnType<typeof calendarByDay> = [];

  for (const event of calendarCommitted()) {
    const last = days[days.length - 1];
    if (last && last.dateNum === event.dateNum) {
      last.events.push(event);
      continue;
    }
    days.push({
      dayLabel: event.dayLabel,
      dateLabel: event.dateLabel,
      weekday: event.weekday,
      dateNum: event.dateNum,
      events: [event],
    });
  }

  return days;
}

/** The rail shows commitments only, and only the next few. Suggestions in a
 *  280px column would push the thing you are actually doing tonight out of
 *  sight. */
export function calendarNext(limit = 3): MockCalendarEvent[] {
  return calendarCommitted().slice(0, limit);
}
