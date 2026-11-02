/**
 * The homepage's content, assembled from the `home` translation namespace.
 *
 * The welcome cards use the approved homepage copy. The founder card,
 * supporting notes and pillars retain the Community Connectors Program deck
 * (2026) content. About Us also uses the local-movement notes, independently
 * of the three questions shown on the homepage.
 *
 * The split between this file and the `home.json` locale files is copy
 * versus structure. Anything a translator would need to change lives in the JSON;
 * anything a translator would break by changing — ids, panel colours, which
 * side of the street a stop sits on, image paths, hrefs, whether a programme
 * has shipped — lives here. That is also why the programme lists are keyed
 * rather than indexed: a translator reordering an array should not silently
 * move a live link onto an unbuilt programme.
 */

'use client';

import { useTranslation } from 'react-i18next';

/* -------------------------------------------------------------------------
   Types
   ------------------------------------------------------------------------- */

/** A block on a card face or inside an opened stop. The tagged union keeps
    the renderer exhaustive. */
export type NoteBlock =
  | { kind: 'paragraph'; text: string; emphasis?: 'strong' }
  | { kind: 'heading'; text: string }
  | {
      kind: 'definition';
      term: string;
      pronunciation: string;
      items: string[];
    }
  | { kind: 'example'; text: string }
  | { kind: 'numbered'; label: string; items: string[] }
  | { kind: 'list'; label: string; items: string[] }
  | { kind: 'tags'; label: string; items: string[] };

/**
 * The artwork that answers each question.
 *
 * A tagged union rather than a shared `image` field, because a photograph and
 * the map are not the same kind of picture doing the same job. A photograph
 * of a room proves a word means people and needs nothing around it; the map
 * proves a place is a real place, and to do that it has to arrive on scroll
 * and carry its county labels. Giving them one shape would have meant one
 * renderer hedging across both.
 */
export type BeatScene =
  | {
      /** One photograph, filling the card.
       *
       *  These stops were a fanned collage, a row of portraits and a drawn
       *  banner. They are single frames now, on the ask of the panas: a
       *  composition of four prints is a design, and what they wanted on this
       *  band was pictures of people. */
      kind: 'photo';
      src: string;
      alt: string;
    }
  | {
      /** The branded state map, rising into frame on scroll. */
      kind: 'map';
      src: string;
      alt: string;
      counties: string[];
    };

export interface StoryBeat {
  id: string;
  /** Optional DOM id, for stops that inherit an anchor the old page owned.
      The sign-in page has been sending people to `/#faq-what-is-a-pana`
      since the FAQ existed, and that link is out in the world; the stop that
      answers the same question keeps the anchor alive rather than dropping
      those visitors at the top of the page. */
  anchor?: string;
  /** Which direction the artwork arrives from. */
  side: 'left' | 'right';
  /** Accent shared by the border, sign and disclosure. */
  accent: 'orange' | 'blue' | 'paper' | 'red';
  /** The sign over the door, phrased the way a first-time visitor would ask. */
  question: string;
  /** Pronunciation or aside printed under the question. */
  aside?: string;
  /** The answer on the face of the building, readable without opening it. */
  answer: string;
  /** Optional structured preview; `answer` remains available as plain text. */
  body?: NoteBlock[];
  /** Label on the disclosure, so each stop names its own payoff. */
  more: string;
  /** What is inside, revealed when the stop is opened. */
  detail: NoteBlock[];
  scene: BeatScene;
}

export interface PillarProgram {
  name: string;
  /** One line on what it is. Not in the deck: the deck lists names only, and
      a bare name means nothing to someone landing here for the first time. */
  note: string;
  /** Omitted when the programme has no destination on this site yet. */
  href?: string;
  /** `live` is reachable today; `building` is named but not yet shipped. */
  status: 'live' | 'building';
  /** Rendered next to the name. Translated, so it is passed in rather than
      decided in the panel. */
  statusLabel: string;
}

export interface Pillar {
  id: string;
  /** The deck's name for the pillar. */
  name: string;
  /** Fill colour for the panel. Each pillar is a solid block rather than a
      tint of the band behind it — a 7%-ink panel on cream was easy to scroll
      straight past. Three fills that stay apart from each other in a row, and
      each takes the text colour that clears AA on it. */
  accent: 'blue' | 'orange' | 'coral';
  /** The condition this pillar answers, in the deck's words. */
  problem: string;
  /** What Pana MIA does about it, in the deck's words. */
  answer: string;
  programs: PillarProgram[];
}

/* -------------------------------------------------------------------------
   Structure
   ------------------------------------------------------------------------- */

const PANA_PHOTO_SRC = '/img/impact/pana-social-dinner.webp';
const WHY_PHOTO_SRC = '/img/about/clari_and_anette.webp';

/* `floridamap_panamia.jpg` is the other candidate and it is the more heavily
   branded of the two, but its highlighted counties are hot pink — a colour
   that is not in this palette. This one is the ink silhouette with the three
   counties marked in red, orange and blue, which is the palette almost
   exactly. It carries its own county labels, so the tag row underneath is
   dropped rather than repeated. */
const COUNTY_MAP_SRC = '/img/impact/county-map.webp';

/** Which programmes are reachable today, and where they point. Kept out of
    the translation files so a live link cannot be translated into a dead one.
    `panaSocial` points at the feed mock rather than the real surface, which
    lives on the `social.` subdomain. */
const PROGRAM_LINKS: Record<
  string,
  { href?: string; status: 'live' | 'building' }
> = {
  directory: { href: '/directory/search', status: 'live' },
  panaSocial: { href: '/mock/feed', status: 'building' },
  connectors: { status: 'building' },
  events: { href: 'https://shotgun.live/venues/pana-mia-club', status: 'live' },
  press: { status: 'building' },
  newsletter: { status: 'building' },
  projects: { status: 'building' },
};

const PILLAR_SHAPE: {
  id: string;
  accent: Pillar['accent'];
  programs: string[];
}[] = [
  { id: 'tech', accent: 'blue', programs: ['directory', 'panaSocial'] },
  /* The light one in the middle, so the row alternates rather than putting
     the two strongest fills next to each other. */
  { id: 'community', accent: 'orange', programs: ['connectors', 'events'] },
  {
    id: 'culture',
    accent: 'coral',
    programs: ['press', 'newsletter', 'projects'],
  },
];

/* -------------------------------------------------------------------------
   Assembly
   ------------------------------------------------------------------------- */

/** i18next hands back the raw value for `returnObjects`, which TypeScript
    types as a string. Everything read this way is an array of strings in the
    JSON; the guard means a missing or mistyped key renders nothing rather
    than throwing inside a map. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

/**
 * The three stops on the street.
 *
 * Each one's `detail` is a fixed sequence of block kinds — the shape of the
 * answer is part of the argument, not a translation choice — filled from the
 * `beats.*` keys.
 */
export function useStoryBeats(): StoryBeat[] {
  const { t } = useTranslation('home');
  const list = (key: string) =>
    stringList(t(key, { returnObjects: true }) as unknown);
  const localMovement = useLocalMovementBeat();

  return [
    {
      id: 'pana',
      anchor: 'faq-what-is-a-pana',
      side: 'left',
      accent: 'orange',
      question: t('beats.pana.question'),
      aside: t('beats.pana.aside'),
      answer: t('beats.pana.answer'),
      body: [
        {
          kind: 'paragraph',
          text: t('beats.pana.answer'),
          emphasis: 'strong',
        },
      ],
      more: t('beats.pana.more'),
      scene: {
        kind: 'photo',
        src: PANA_PHOTO_SRC,
        alt: t('beats.pana.photoAlt'),
      },
      detail: [
        {
          kind: 'definition',
          term: t('beats.pana.definition.label'),
          pronunciation: t('beats.pana.aside'),
          items: list('beats.pana.definition.items'),
        },
        { kind: 'example', text: t('beats.pana.example') },
        {
          kind: 'list',
          label: t('beats.pana.practice.label'),
          items: list('beats.pana.practice.items'),
        },
      ],
    },
    {
      ...localMovement,
      id: 'future-local',
      question: t('beats.futureLocal.question'),
      answer: t('beats.futureLocal.answer'),
      body: [
        {
          kind: 'paragraph',
          text: t('beats.futureLocal.answer'),
          emphasis: 'strong',
        },
      ],
      more: t('beats.futureLocal.more'),
      detail: [
        {
          kind: 'paragraph',
          text: t('beats.futureLocal.answer'),
          emphasis: 'strong',
        },
        {
          kind: 'heading',
          text: t('beats.futureLocal.connectionQuestion'),
        },
        {
          kind: 'paragraph',
          text: t('beats.futureLocal.change'),
          emphasis: 'strong',
        },
        {
          kind: 'paragraph',
          text: t('beats.futureLocal.home'),
          emphasis: 'strong',
        },
        ...localMovement.detail,
      ],
    },
    {
      id: 'why',
      side: 'right',
      accent: 'blue',
      question: t('beats.why.question'),
      answer: t('beats.why.answer'),
      more: t('beats.why.more'),
      /* This stop used to carry the deck's benefits ring, rebuilt as vector,
         and then a row of five portraits. It is one photograph now — the two
         founders — which is the most direct answer this question has: it was
         started by these two. The ring's four benefits were the only copy it
         ever carried, so they stayed behind in the panel below. */
      scene: {
        kind: 'photo',
        src: WHY_PHOTO_SRC,
        alt: t('beats.why.photoAlt'),
      },
      detail: [
        { kind: 'paragraph', text: t('beats.why.invitation') },
        {
          kind: 'tags',
          label: t('beats.why.builds.label'),
          items: list('beats.why.builds.items'),
        },
        {
          kind: 'tags',
          label: t('beats.why.values.label'),
          items: list('beats.why.values.items'),
        },
      ],
    },
  ];
}

/** About Us keeps the local-movement section even when the homepage changes. */
export function useLocalMovementBeat(): StoryBeat {
  const { t } = useTranslation('home');

  return {
    id: 'local',
    anchor: 'why-local',
    side: 'left',
    accent: 'paper',
    question: t('beats.local.question'),
    answer: t('beats.local.answer'),
    more: t('beats.local.more'),
    scene: {
      kind: 'map',
      src: COUNTY_MAP_SRC,
      alt: t('beats.local.mapAlt'),
      counties: [],
    },
    detail: [
      {
        kind: 'list',
        label: t('beats.local.effects.label'),
        items: stringList(
          t('beats.local.effects.items', { returnObjects: true })
        ),
      },
    ],
  };
}

/** The three pillars from "The Future of Pana MIA". */
export function usePillars(): Pillar[] {
  const { t } = useTranslation('home');

  return PILLAR_SHAPE.map(({ id, accent, programs }) => ({
    id,
    accent,
    name: t(`pillars.${id}.name`),
    problem: t(`pillars.${id}.problem`),
    answer: t(`pillars.${id}.answer`),
    programs: programs.map((programId) => {
      const link = PROGRAM_LINKS[programId];
      return {
        name: t(`pillars.${id}.programs.${programId}.name`),
        note: t(`pillars.${id}.programs.${programId}.note`),
        href: link.href,
        status: link.status,
        statusLabel: t(`programStatus.${link.status}`),
      };
    }),
  }));
}
