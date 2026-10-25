/**
 * The Community Connectors programme, as data.
 *
 * Four houses, three tiers, three pods. All of it comes from the programme
 * deck rather than from anybody's guess, so the names here are the names a
 * connector has already seen on a slide.
 *
 * ## Why four houses and not five
 *
 * The Connector Dashboard sheet grew a fifth house, "World Building", at some
 * point after the deck was written. It is not in the deck, nobody is assigned
 * to it in the programme materials, and the panas confirmed it was a mistake
 * in the sheet rather than a house anyone agreed to add. So it is absent here
 * on purpose: this file is the source of truth, and the sheet is the thing
 * that has to come back into line.
 *
 * If a fifth house is ever genuinely agreed, it is one entry in `HOUSES` plus
 * a colour — nothing else in the app enumerates them.
 *
 * Dependency-free like `lib/panaverse/*`, so a server route and a client
 * component can both read it without dragging React anywhere.
 */

export type HouseId =
  | 'education'
  | 'relationshipBuilding'
  | 'narrativeShifters'
  | 'culturalWorkers';

export interface HouseFocus {
  majorHouse: HouseId;
  minorHouse: HouseId;
}

export type TierId = 1 | 2 | 3;

export type PodId = 'miami' | 'broward' | 'palmBeach';

/** How far along a commitment is. Mirrors the sheet's own three states. */
export type CommitmentProgress = 'notSet' | 'inProgress' | 'done';

export interface House {
  id: HouseId;
  name: string;
  /**
   * The deck's one-line casting call — "for the extroverts, the organizers,
   * the yappers". Kept close to verbatim because it is the line that actually
   * makes people pick, far more than any description of the work does.
   */
  calling: string;
  /** What this house is for, in the programme's own terms. */
  blurb: string;
  /**
   * Tailwind colour token (without the `--color-` prefix) and the text colour
   * that is legible on it.
   *
   * The pairing is not free choice: `app/globals.css` sets a contrast rule for
   * this palette — warm surfaces (orange, burnt, red, butter, cream) carry ink
   * text, and only indigo and ink carry cream. Brand orange is deliberately
   * not a house colour; it belongs to Connectors itself, so a house can never
   * be confused with the programme.
   *
   * Measured, because these render as small bold text in a pill and so answer
   * to the 4.5:1 bar rather than the 3:1 one:
   *   indigo/cream 9.01   burnt/ink 5.29   blue/ink 8.21   pink/ink 5.13
   * Burnt and pink were cream here first and measured 3.44 and 3.54 — both
   * warm, both caught by the rule above, neither obviously wrong by eye, which
   * is exactly why the rule is written down.
   */
  color: string;
  onColor: string;
  /** Example actions at each tier, from the deck's per-house slides. */
  actions: Record<TierId, readonly string[]>;
}

export const HOUSES: readonly House[] = [
  {
    id: 'relationshipBuilding',
    name: 'Relationship Building',
    calling:
      'For the extroverts, the community organizers and leaders, the people persons, the coalition builders, the bridge makers, the event coordinators, and the yappers.',
    blurb:
      'Turning a list of names into a network that actually calls each other. Tabling, free markets, and getting local businesses to act like community centers.',
    color: 'pana-indigo',
    onColor: 'pana-cream',
    actions: {
      1: [
        'Drop off postcards and zines to local businesses, venues and third spaces',
        'Encourage directory signups in your community',
        'Help Pana MIA table at events and shows',
      ],
      2: [
        'Organize free markets, organizer fairs, shows, workshops and gatherings',
        'Build relationships with aligned local businesses and organizations',
        'Train local businesses on how to become community centers',
      ],
      3: [
        'Start your own hyper-local pod',
        'Build out a local loyalty program',
        'Pitch local businesses to become sponsors, in-kind or financial',
        'Report action metrics back to existing collaborators',
      ],
    },
  },
  {
    id: 'education',
    name: 'Education',
    calling:
      'For the life-long learners, the campaigners, the educators, the researchers and investigators, the self-described experts, the journalists and the archivists.',
    blurb:
      'Making what we know portable. Zines, workshops, translation, research and the newsletter — everything that lets the next person skip the part we already solved.',
    color: 'pana-burnt',
    onColor: 'pana-ink',
    actions: {
      1: [
        'Engage people at events about Pana MIA, the directory and the programme',
        'Distribute zines explaining the mission and values',
        'Provide translation support for digital and physical materials',
      ],
      2: [
        'Lead a collaborative project, such as a journalistic writing workshop',
        'Create physical literature — zines, pamphlets',
        'Contribute regularly to the newsletter',
        'Research local topics: water usage, what small businesses need',
      ],
      3: [
        'Find sponsors for specific stories and content',
        'Fundraise for print publication costs',
        'Build relationships with larger publications',
        'Direct and support Pana Ink Press initiatives',
      ],
    },
  },
  {
    id: 'narrativeShifters',
    name: 'Narrative Shifters',
    calling:
      'For the storytellers, the chronically-online, the content creators, the filmmakers, the journalists, the writers, the directors and the producers.',
    blurb:
      'Taking raw research and making it a story the public can hold. Countering the status quo about South Florida, and telling the truth about what is being built here.',
    color: 'pana-blue',
    onColor: 'pana-ink',
    actions: {
      1: [
        'Share content and invite collabs with @thepanaverse',
        'Provide video editing or content ideas support',
        'Create content about living a locally-minded lifestyle',
      ],
      2: [
        'Tell and write stories countering the status quo',
        'Contextualize data and raw research into narratives the public understands',
        'Make content telling the story of Pana MIA and the impact being created',
      ],
      3: [
        'Create a platform for new narratives — a Substack, a broadcast channel',
        'Organize local creatives, journalists and writers groups',
        'Guide other storytellers to shift narratives around South Florida',
      ],
    },
  },
  {
    id: 'culturalWorkers',
    name: 'Cultural Workers',
    calling:
      'For the artists, performers, musicians, curators, designers, artivists, cultural organizers, publishers, poets, dreamers and muralists.',
    blurb:
      'Cultural change is lasting change. Art builds, murals, playlists, posters, and the work that imagines a liberated South Florida out loud.',
    color: 'pana-pink',
    onColor: 'pana-ink',
    actions: {
      1: [
        'Guerilla marketing — posters, wheatpaste, stickering',
        'Design and graphic support',
        'Participate in art builds, making merch and signs',
        'Make local music playlists',
      ],
      2: [
        'Create events that center art, local history and creativity',
        'Coordinate new spaces and artists for the Mural Project',
        'Create art, music and poetry that imagines a liberated future',
      ],
      3: [
        'Find resources and funding partners for events',
        'Find new places to distribute work by affiliated local creators',
        'Support the coordination of events centering local artists',
      ],
    },
  },
];

export function getHouse(id: HouseId): House {
  const house = HOUSES.find((h) => h.id === id);
  if (!house) throw new Error(`Unknown connector house: ${id}`);
  return house;
}

export function isHouseId(value: unknown): value is HouseId {
  return (
    typeof value === 'string' && HOUSES.some((house) => house.id === value)
  );
}

export const HOUSE_FOCUS_ERROR =
  'Choose a major house and a different minor house.';

export function parseHouseFocus(value: unknown): HouseFocus | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('majorHouse' in value) ||
    !('minorHouse' in value) ||
    !isHouseId(value.majorHouse) ||
    !isHouseId(value.minorHouse) ||
    value.majorHouse === value.minorHouse
  ) {
    return null;
  }

  return { majorHouse: value.majorHouse, minorHouse: value.minorHouse };
}

export interface Tier {
  id: TierId;
  name: string;
  blurb: string;
}

/**
 * The three tiers.
 *
 * The deck is emphatic about what these are *not*: the tiers do not correspond
 * to how developed someone is or how far along they are in their community
 * building journey, and everyone starts in Tier 1. That sentence is why
 * `blurb` below talks about load rather than skill, and why nothing in the UI
 * ranks or sorts connectors by tier.
 */
export const TIERS: readonly Tier[] = [
  {
    id: 1,
    name: 'Assists the Builders',
    blurb:
      'Showing up and lending weight to work already in motion. Everyone starts here, however much organizing they have done before.',
  },
  {
    id: 2,
    name: 'Active Builders',
    blurb:
      'Running something of your own — a project, an event, a piece of work the pod is counting on.',
  },
  {
    id: 3,
    name: 'Assisting the Larger Ecosystem',
    blurb:
      'Supporting other builders, finding resources, and bringing what your pod learned back to the rest of the network.',
  },
];

export function getTier(id: TierId): Tier {
  const tier = TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown connector tier: ${id}`);
  return tier;
}

export interface Pod {
  id: PodId;
  name: string;
  /** The county the pod covers, for the landing page's plain-English list. */
  region: string;
}

export const PODS: readonly Pod[] = [
  { id: 'miami', name: 'Miami', region: 'Miami-Dade County' },
  { id: 'broward', name: 'Broward', region: 'Broward County' },
  { id: 'palmBeach', name: 'Palm Beach', region: 'Palm Beach County' },
];

export function getPod(id: PodId): Pod {
  const pod = PODS.find((p) => p.id === id);
  if (!pod) throw new Error(`Unknown connector pod: ${id}`);
  return pod;
}

/* `Connector`, `EventCadence`, `ConnectorEvent`, `Commitment` and `Ask` were
 * here. They described the fixture roster this surface was mocked against and
 * every one of them has been replaced by something with a table behind it:
 * membership by `profiles.connector` (drizzle/0055), commitments by
 * `connector_commitments` (0056), events by `connector_events` (0057).
 *
 * `Ask` has no successor. Nothing records open requests from the wider
 * network, so the panel that rendered them is gone rather than empty.
 *
 * The fields that did not survive are worth naming, because they are the ones
 * somebody will be tempted to add back: `Connector.birthday` (no date of birth
 * exists anywhere on a profile), and `ConnectorEvent.volunteersFilled`,
 * `tasks`, `contactName`, `contactPhone` and `href` (no sign-up table, and no
 * reason to keep third parties' phone numbers in a programme calendar). */
