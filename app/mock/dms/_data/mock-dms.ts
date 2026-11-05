/* Fixture data for the Pana Social direct-message mocks at /mock/dms.
 *
 * One fixture set, rendered twice: once as mail, once as chat. That is the
 * whole point of the route - if each model had its own conversations, the
 * comparison would be between the writing, not between the designs.
 *
 * The honest-comparison problem: long paragraphs flatter mail and short bursts
 * flatter chat, so a fixture set of only one kind rigs the result. Both are
 * here. BEE is a two-paragraph collaboration pitch that would feel absurd as
 * chat bubbles; JDOWNS is six words at a time that would feel absurd as
 * stacked letters. Whichever model wins has to carry both, because real panas
 * write both.
 *
 * What this stands in for in the real schema: there is no messages table. A DM
 * today is a `socialStatuses` row with `visibility: 'direct'` and the
 * recipient's actor URI in `recipientTo`. Threads are not stored - they would
 * be walked through `inReplyToId`, which is indexed. Every field below is
 * annotated with the column it would read from, so the swap is mechanical.
 */

export interface MockDmPerson {
  /** socialActors.name */
  name: string;
  /** users.screenname, also socialActors.username */
  handle: string;
  /** profiles.primaryImageCdn */
  avatar: string;
  /** profiles.counties, shown only when profiles.verification is set. */
  county?: string;
  /**
   * Mutual follow - a Pana. Under the `panas` DM gate proposed in
   * SOCIAL-GRAPH.md C1, this is who may open a thread without it being held
   * as a request.
   */
  isPana?: boolean;
  /** A directory listing rather than a person. */
  isBusiness?: boolean;
}

export interface MockDmMessage {
  id: string;
  /** Whether the viewer wrote it. socialStatuses.actorId === viewer. */
  from: 'me' | 'them';
  /** socialStatuses.content. Plain text here; the real column holds HTML. */
  body?: string;
  /** Clock time. The chat model puts this under each bubble group. */
  time: string;
  /** Day label. Drives chat's day separators and mail's letter headers. */
  day: string;
}

export interface MockDmThread {
  id: string;
  person: MockDmPerson;
  messages: MockDmMessage[];
  /** Pre-formatted relative time for the conversation list. */
  lastActive: string;
  unreadCount: number;
  /**
   * Not a Pana, so under `panas` gating this never reaches the inbox - it
   * waits in Requests. This is the single most important state on the page:
   * it is what C1 of the safety doc is asking to decide.
   */
  isRequest?: boolean;
}

/** The signed-in reader. Same person as the feed and profile mocks. */
export const MOCK_DM_VIEWER: MockDmPerson = {
  name: 'Claribel Avila',
  handle: 'claribel',
  avatar: '/img/about/claribel_avila.jpg',
  county: 'Miami-Dade',
};

const BEE: MockDmPerson = {
  name: 'Bee Maria',
  handle: 'beemaria',
  avatar: '/img/about/bee_maria.jpg',
  county: 'Broward',
  isPana: true,
};

const JDOWNS: MockDmPerson = {
  name: 'J. Downs',
  handle: 'jdowns',
  avatar: '/img/about/jdowns.jpg',
  county: 'Miami-Dade',
  isPana: true,
};

const GBARRIOS: MockDmPerson = {
  name: 'G. Barrios',
  handle: 'gbarrios',
  avatar: '/img/about/gbarrios.jpg',
  isPana: true,
};

const TALLER: MockDmPerson = {
  name: 'Taller Tropical',
  handle: 'tallertropical',
  avatar: '/img/impact/hero-mixer.webp',
  county: 'Miami-Dade',
  isBusiness: true,
};

const ANETTE: MockDmPerson = {
  name: 'Anette Mago',
  handle: 'anettemago',
  avatar: '/img/about/anette_mago.jpg',
  county: 'Miami-Dade',
};

/* Long-form. Two paragraphs with a question at the end, the kind of message
   you compose once and do not expect an answer to for a day. Rendered as chat
   bubbles this becomes a wall; rendered as a letter it reads correctly. */
const THREAD_BEE: MockDmThread = {
  id: 'bee',
  person: BEE,
  lastActive: '2 days ago',
  unreadCount: 1,
  messages: [
    {
      id: 'bee-1',
      from: 'them',
      day: 'Tuesday',
      time: '9:14 AM',
      body: "I kept thinking about the canal recordings after you posted them. I've been collecting the same thing on the Broward side for about two years now - mostly pump stations and the drainage under 595, which sound nothing like yours.\n\nWould you want to put them next to each other? Not a release necessarily, more like one night somewhere with decent speakers where people can hear the county line as a sound. I have no budget and no venue, which I realise is most of a plan missing.",
    },
    {
      id: 'bee-2',
      from: 'me',
      day: 'Tuesday',
      time: '6:40 PM',
      body: 'Yes. The county line as a sound is exactly the thing. Let me ask Taller Tropical - they have the back room and they have let people do odd stuff in it before.',
    },
    {
      id: 'bee-3',
      from: 'them',
      day: 'Thursday',
      time: '11:02 AM',
      body: 'Any word from them? No rush, just want to know whether to keep the first weekend of March open.',
    },
  ],
};

/* Rapid-fire. Six words at a time, resolved in four minutes. Rendered as
   stacked letters with sender headers this is comically heavy; rendered as
   bubbles it disappears into the background the way it should. */
const THREAD_JDOWNS: MockDmThread = {
  id: 'jdowns',
  person: JDOWNS,
  lastActive: '14 min ago',
  unreadCount: 2,
  messages: [
    {
      id: 'jd-1',
      from: 'them',
      day: 'Today',
      time: '2:11 PM',
      body: 'you coming saturday?',
    },
    {
      id: 'jd-2',
      from: 'me',
      day: 'Today',
      time: '2:12 PM',
      body: 'yeah should be there by 10',
    },
    {
      id: 'jd-3',
      from: 'them',
      day: 'Today',
      time: '2:12 PM',
      body: 'can you bring the drill',
    },
    {
      id: 'jd-4',
      from: 'them',
      day: 'Today',
      time: '2:13 PM',
      body: 'the small one not the hammer one',
    },
    {
      id: 'jd-5',
      from: 'me',
      day: 'Today',
      time: '2:15 PM',
      body: 'got it',
    },
  ],
};

const THREAD_GBARRIOS: MockDmThread = {
  id: 'gbarrios',
  person: GBARRIOS,
  lastActive: 'Yesterday',
  unreadCount: 0,
  messages: [
    {
      id: 'gb-2',
      from: 'me',
      day: 'Yesterday',
      time: '7:30 PM',
      body: 'The part about the Allapattah landlords is the piece - that is the one to lead with.',
    },
  ],
};

/* A business replying to an inquiry. Included because DMs are not only
   person-to-person: the directory is half the product, and "is the back room
   free in March" is a message, not a post. */
const THREAD_TALLER: MockDmThread = {
  id: 'taller',
  person: TALLER,
  lastActive: '3 days ago',
  unreadCount: 0,
  messages: [
    {
      id: 'tt-1',
      from: 'me',
      day: 'Monday',
      time: '10:20 AM',
      body: 'Hi! Is the back room bookable on a weeknight in early March? Small listening thing, maybe 30 people, we bring our own speakers.',
    },
    {
      id: 'tt-2',
      from: 'them',
      day: 'Monday',
      time: '5:05 PM',
      body: 'Hola Claribel - yes, Tuesdays and Wednesdays are open. We ask for a $75 cleaning deposit and that it wraps by 11. Send dates and we will hold one.',
    },
  ],
};

/* Held, not delivered. Anette is not a Pana, so under the `panas` default this
   waits in Requests and produces no notification. The whole argument of C1 is
   visible in this one row. */
const THREAD_ANETTE: MockDmThread = {
  id: 'anette',
  person: ANETTE,
  lastActive: '1 day ago',
  unreadCount: 1,
  isRequest: true,
  messages: [
    {
      id: 'an-1',
      from: 'them',
      day: 'Yesterday',
      time: '8:31 PM',
      body: 'hey saw you at the zine thing last month! do you still have any of the risograph prints left',
    },
  ],
};

export const MOCK_DM_THREADS: MockDmThread[] = [
  THREAD_JDOWNS,
  THREAD_BEE,
  THREAD_GBARRIOS,
  THREAD_TALLER,
];

export const MOCK_DM_REQUESTS: MockDmThread[] = [THREAD_ANETTE];

/** Snippet for the conversation list. */
export function threadSnippet(thread: MockDmThread): string {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return '';
  const prefix = last.from === 'me' ? 'You: ' : '';
  return prefix + (last.body ?? '');
}

/** Consecutive messages from one sender on one day, for bubble grouping. */
export function groupMessages(messages: MockDmMessage[]): MockDmMessage[][] {
  const groups: MockDmMessage[][] = [];
  for (const message of messages) {
    const current = groups[groups.length - 1];
    if (
      current &&
      current[0].from === message.from &&
      current[0].day === message.day
    ) {
      current.push(message);
    } else {
      groups.push([message]);
    }
  }
  return groups;
}
