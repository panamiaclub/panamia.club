/* Fixture data for the DM chat view at /mock/dm-chat.
 *
 * The existing DM feature now has a dedicated workspace study: independent
 * desktop panes, mobile list/detail navigation, drafts, and send recovery.
 * These are sample conversations only. No fixture opens a socket, calls the
 * messaging APIs, or persists anything outside component state.
 *
 * THE CONSTRAINTS THIS SET EXISTS TO MAKE VISIBLE
 *
 * 1. DMs expire after thirty days. `status.ts` stamps every `visibility:
 *    'direct'` row with `expiresAt = now + DM_EXPIRY_DAYS`, unconditionally,
 *    and `notExpired()` in timeline.ts hides it afterwards. The row survives
 *    in Postgres - purge-expired.ts deliberately leaves DMs alone - but it is
 *    invisible to everyone. Mail made that survivable: a letter you cannot
 *    find after a month is annoying. Chat makes it a bug report, because the
 *    promise of a transcript is that it is a transcript.
 *
 *    The window was seven days until this view was drawn against it, which is
 *    the whole argument for drawing mocks against real constraints: nothing
 *    was wrong with the code, and nothing in the mail UI could have shown it.
 *
 *    And because `expiresAt` is stamped per row at write time, a conversation
 *    does not expire as a unit. It erodes from the oldest message forward, so
 *    an active thread is a sliding thirty-day window and the beginning of the
 *    exchange is always the first thing to go. THREAD_BEE carries this: it is
 *    a live conversation - last message yesterday - whose opening proposal is
 *    hours from being hidden. Thirty days moved that cliff; it did not remove
 *    it, and a view that stops rendering the countdown would hide it again.
 *
 * 2. The gate has three answers, not two. dm-gate.ts returns allow / hold /
 *    refuse, and every refusal returns one identical string so a blocked
 *    sender cannot tell a block from a closed inbox by comparing wording.
 *    That is a safety property, and safety properties get designed away when
 *    nobody draws them, so both non-allow states are rendered here.
 *
 * 3. Delivery is best-effort; Postgres is truth. The socket is an accelerator
 *    on top of a write that already happened, so the UI needs an honest state
 *    for "written but not yet confirmed" and an honest state for "the socket
 *    is gone but your messages are still sending".
 *
 * 4. It federates, and that is the reason to keep the substrate. MART is a
 *    real remote actor shape - a DM to a Mastodon account works today because
 *    this is how Mastodon DMs already work.
 *
 * WHAT IS DELIBERATELY ABSENT: presence dots and typing indicators. The chat
 * model at /mock/dms had both. CHAT-ROADMAP puts them out of scope, because
 * they are the expensive half of "realtime" - delivery is one socket, while
 * presence is a per-actor fanout that has to survive reconnects and lie
 * convincingly when it cannot. Drawing them here would quietly re-add the
 * cost the decision just removed.
 *
 * Every field is annotated with the column it stands in for, per the
 * convention in app/mock/README.md, so swapping to live data is mechanical.
 */

export interface MockChatPerson {
  /** socialActors.name */
  name: string;
  /** socialActors.username. Remote actors keep the full acct form. */
  handle: string;
  /** profiles.primaryImageCdn */
  avatar: string;
  /** Mutual follow. Under dm-gate this is who reaches the inbox directly. */
  isPana?: boolean;
  /** A directory listing rather than a person. */
  isBusiness?: boolean;
  /**
   * socialActors.isLocal === false. Present because the whole argument for
   * staying on the direct-status substrate is that this row can exist.
   */
  remoteHost?: string;
}

/**
 * Simulated HTTP send states. A disconnected delivery socket does not prevent
 * sending, so this preview deliberately does not invent an offline queue.
 */
export type MockDeliveryState =
  /** Awaiting the simulated server acknowledgement. */
  | 'sending'
  /** Acknowledged, not a read receipt. */
  | 'sent'
  /** Kept in the transcript so the exact message can be retried. */
  | 'failed';

export interface MockGif {
  id: string;
  label: string;
  word: string;
  tone: 'butter' | 'indigo' | 'flame';
}

/** Original CSS animations stand in for GIFs without calling a media service. */
export const MOCK_CHAT_GIFS: MockGif[] = [
  { id: 'yay', label: 'A little celebration', word: 'yay!', tone: 'butter' },
  { id: 'hola', label: 'A friendly hello', word: 'hola!', tone: 'flame' },
  { id: 'thanks', label: 'A big thank you', word: 'gracias', tone: 'indigo' },
];

export interface MockChatDraft {
  text: string;
  gif: MockGif | null;
}

export interface MockChatMessage {
  id: string;
  /** socialStatuses.actorId === viewer. */
  from: 'me' | 'them';
  /** socialStatuses.content. Plain text here; the real column holds HTML. */
  body?: string;
  /** A browser-only stand-in for a selected GIF attachment. */
  gif?: MockGif;
  /** socialAttachments with mediaType audio/*. Visual sample only. */
  voice?: {
    duration: string;
    /** Peak heights 0-1. Sixteen samples reads as a waveform at this width. */
    peaks: number[];
  };
  /** Clock time, pre-formatted. Rendered once per bubble group. */
  time: string;
  /** Day label, drives the day separators. */
  day: string;
  /** Viewer's own messages only. */
  delivery?: MockDeliveryState;
  /**
   * socialStatuses.expiresAt, as a human remainder. Stamped per row at write
   * time, which is why the oldest message in a thread is the first to go.
   */
  expiresIn?: string;
}

/**
 * The gate's answer for this thread, from evaluateDirectThreads() in
 * lib/federation/wrappers/dm-gate.ts.
 */
export type MockGateState =
  /** A Pana, or an accepted request. Lands in the inbox, notifies. */
  | 'allow'
  /** Not a Pana. Waits in Requests and MUST NOT produce a notification. */
  | 'hold'
  /** Blocked, or an inbox closed to strangers. One identical message either way. */
  | 'refuse';

export interface MockChatThread {
  id: string;
  person: MockChatPerson;
  messages: MockChatMessage[];
  /** Pre-formatted relative time for the conversation list. */
  lastActive: string;
  unreadCount: number;
  gate: MockGateState;
}

const WAVEFORM = [
  0.2, 0.5, 0.8, 0.4, 0.9, 0.6, 0.3, 0.7, 1, 0.5, 0.2, 0.6, 0.85, 0.4, 0.3,
  0.15,
];

/** The signed-in reader. Same person as the feed, profile and /mock/dms. */
export const MOCK_CHAT_VIEWER: MockChatPerson = {
  name: 'Claribel Avila',
  handle: 'claribel',
  avatar: '/img/about/claribel_avila.jpg',
};

const JDOWNS: MockChatPerson = {
  name: 'J. Downs',
  handle: 'jdowns',
  avatar: '/img/about/jdowns.jpg',
  isPana: true,
};

const BEE: MockChatPerson = {
  name: 'Bee Maria',
  handle: 'beemaria',
  avatar: '/img/about/bee_maria.jpg',
  isPana: true,
};

const GBARRIOS: MockChatPerson = {
  name: 'G. Barrios',
  handle: 'gbarrios',
  avatar: '/img/about/gbarrios.jpg',
  isPana: true,
};

const MART: MockChatPerson = {
  name: 'Mart Ruiz',
  handle: 'mart@indieweb.social',
  avatar: '/img/about/anette_mago.jpg',
  isPana: true,
  remoteHost: 'indieweb.social',
};

const TALLER: MockChatPerson = {
  name: 'Taller Tropical',
  handle: 'tallertropical',
  avatar: '/img/impact/hero-mixer.webp',
  isBusiness: true,
};

const ANETTE: MockChatPerson = {
  name: 'Anette Mago',
  handle: 'anettemago',
  avatar: '/img/about/anette_mago.jpg',
};

/* The live thread. Short bursts, today, still going - this is the one the
   socket is for, and the one the mock animates a delivery into. */
const THREAD_JDOWNS: MockChatThread = {
  id: 'jdowns',
  person: JDOWNS,
  lastActive: '2 min ago',
  unreadCount: 0,
  gate: 'allow',
  messages: [
    {
      id: 'jd-history-1',
      from: 'them',
      day: 'Yesterday',
      time: '5:02 PM',
      body: 'little update on saturday: we got the back room!',
    },
    {
      id: 'jd-history-2',
      from: 'me',
      day: 'Yesterday',
      time: '5:06 PM',
      body: 'The one with the big windows? That is perfect.',
      delivery: 'sent',
    },
    {
      id: 'jd-history-3',
      from: 'them',
      day: 'Yesterday',
      time: '5:08 PM',
      body: 'yes! tables on one side, prints on the other. keeping it simple.',
    },
    {
      id: 'jd-history-4',
      from: 'me',
      day: 'Yesterday',
      time: '5:09 PM',
      body: 'I can come early to help set up. Are we bringing our own coffee?',
      delivery: 'sent',
    },
    {
      id: 'jd-history-5',
      from: 'them',
      day: 'Yesterday',
      time: '5:11 PM',
      body: 'Bee is handling coffee. I think we are in very good hands.',
    },
    {
      id: 'jd-history-6',
      from: 'me',
      day: 'Yesterday',
      time: '5:12 PM',
      body: 'Then all the important things are covered.',
      delivery: 'sent',
    },
    {
      id: 'jd-history-7',
      from: 'them',
      day: 'Yesterday',
      time: '5:14 PM',
      body: 'one more thing - we can hang a few prints by the door if you want to bring yours',
    },
    {
      id: 'jd-history-8',
      from: 'me',
      day: 'Yesterday',
      time: '5:18 PM',
      body: 'Yes please. I have three left from the canal series. I will wrap them tonight.',
      delivery: 'sent',
    },
    {
      id: 'jd-history-9',
      from: 'them',
      day: 'Yesterday',
      time: '5:19 PM',
      body: 'love those. this is coming together.',
    },
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
      delivery: 'sent',
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
      delivery: 'sent',
    },
  ],
};

/* The expiry thread, and the reason the window moved from seven days to
   thirty. A conversation that has run for a month: the opening message - the
   one with the actual proposal in it - is hours from being hidden, while the
   nudge from yesterday has nearly a month left. The thread is live, which is
   the whole problem. Nothing in the product has told Claribel the top of it is
   about to go, which is the point of rendering it.

   Thirty days did not fix this, it moved it. Erosion is a property of stamping
   expiry per row, not of the number, so the countdown has to stay on screen at
   any window. */
const THREAD_BEE: MockChatThread = {
  id: 'bee',
  person: BEE,
  lastActive: 'Yesterday',
  unreadCount: 0,
  gate: 'allow',
  messages: [
    {
      id: 'bee-1',
      from: 'them',
      day: 'January 12',
      time: '9:14 AM',
      expiresIn: '4 hours',
      body: "I kept thinking about the canal recordings after you posted them. I've been collecting the same thing on the Broward side for about two years — mostly pump stations and the drainage under 595, which sound nothing like yours.\n\nWould you want to put them next to each other? One night somewhere with decent speakers, where people can hear the county line as a sound.",
    },
    {
      id: 'bee-2',
      from: 'me',
      day: 'January 12',
      time: '6:40 PM',
      expiresIn: '11 hours',
      delivery: 'sent',
      body: 'Yes. The county line as a sound is exactly the thing. Let me ask Taller Tropical — they have the back room and they have let people do odd stuff in it before.',
    },
    {
      id: 'bee-3',
      from: 'them',
      day: 'Yesterday',
      time: '11:02 AM',
      expiresIn: '29 days',
      body: 'Any word from them? Just want to know whether to keep the first weekend of March open.',
    },
  ],
};

/* Voice memo. The only DM Pana Social can actually send in production today,
   so a chat view that could not render one would be mocking a feature set we
   do not have. */
const THREAD_GBARRIOS: MockChatThread = {
  id: 'gbarrios',
  person: GBARRIOS,
  lastActive: 'Yesterday',
  unreadCount: 1,
  gate: 'allow',
  messages: [
    {
      id: 'gb-1',
      from: 'them',
      day: 'Yesterday',
      time: '4:48 PM',
      voice: { duration: '0:42', peaks: WAVEFORM },
    },
    {
      id: 'gb-2',
      from: 'me',
      day: 'Yesterday',
      time: '7:30 PM',
      delivery: 'sent',
      body: 'Listened twice. The part about the Allapattah landlords is the piece — that is the one to lead with.',
    },
  ],
};

/* The federated thread, and the entire reason not to retire this substrate.
   Mart is on indieweb.social. This conversation works because a direct status
   addressed through `recipientTo` is exactly how Mastodon DMs already work -
   a chat_messages table behind a Durable Object would not reach this person
   at all. It is also why presence is not merely out of scope but unavailable
   here: there is no socket to a stranger's Mastodon server. */
const THREAD_MART: MockChatThread = {
  id: 'mart',
  person: MART,
  lastActive: '2 days ago',
  unreadCount: 0,
  gate: 'allow',
  messages: [
    {
      id: 'mart-1',
      from: 'them',
      day: 'Saturday',
      time: '1:09 PM',
      body: 'Saw the canal thing go past on my timeline. Do you ever ship the raw files? Happy to trade — I have a stack from the Rotterdam harbour that nobody has asked for in years.',
    },
    {
      id: 'mart-2',
      from: 'me',
      day: 'Saturday',
      time: '3:20 PM',
      delivery: 'sent',
      body: 'Trade is on. Give me a week to get them off the recorder.',
    },
  ],
};

/* A business. The directory is half the product, and "is the back room free
   in March" is a message rather than a post. */
const THREAD_TALLER: MockChatThread = {
  id: 'taller',
  person: TALLER,
  lastActive: '3 days ago',
  unreadCount: 0,
  gate: 'allow',
  messages: [
    {
      id: 'tt-1',
      from: 'me',
      day: 'Friday',
      time: '10:20 AM',
      delivery: 'sent',
      body: 'Hi! Is the back room bookable on a weeknight in early March? Small listening thing, maybe 30 people, we bring our own speakers.',
    },
    {
      id: 'tt-2',
      from: 'them',
      day: 'Friday',
      time: '5:05 PM',
      body: 'Hola Claribel — Tuesdays and Wednesdays are open. We ask for a $75 cleaning deposit and that it wraps by 11. Send dates and we will hold one.',
    },
  ],
};

/* HELD. Anette is not a Pana, so evaluateDirectThreads() returns `hold`: this
   waits in Requests and produces NO notification. The unread count is
   deliberately 0 - a held message that bumps a badge has notified you, which
   is the exact thing holding it was supposed to prevent. */
const THREAD_ANETTE: MockChatThread = {
  id: 'anette',
  person: ANETTE,
  lastActive: '1 day ago',
  unreadCount: 0,
  gate: 'hold',
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

/* REFUSED. Claribel can open the thread she already has, but the gate will
   not accept a new message into it.
 *
   The refusal copy is the single string dm-gate.ts returns for every refusal,
   and it is vague on purpose: if a block said "blocked" and a closed inbox
   said "not accepting messages", a blocked sender could tell the two apart by
   sending one message and reading the wording. One string for both is the
   whole safety property, so the mock uses that string rather than inventing
   friendlier copy for each case. */
const THREAD_REFUSED: MockChatThread = {
  id: 'refused',
  person: {
    name: 'R. Nieves',
    handle: 'rnieves',
    avatar: '/img/about/gbarrios.jpg',
  },
  lastActive: '5 days ago',
  unreadCount: 0,
  gate: 'refuse',
  messages: [
    {
      id: 'rn-1',
      from: 'me',
      day: 'Sunday',
      time: '11:40 AM',
      delivery: 'sent',
      expiresIn: '25 days',
      body: 'Hey — following up on the flyers. Let me know either way and I will stop bugging you about it.',
    },
  ],
};

export const MOCK_CHAT_THREADS: MockChatThread[] = [
  THREAD_JDOWNS,
  THREAD_GBARRIOS,
  THREAD_MART,
  THREAD_BEE,
  THREAD_TALLER,
  THREAD_REFUSED,
];

export const MOCK_CHAT_REQUESTS: MockChatThread[] = [THREAD_ANETTE];

export interface MockChatContact {
  id: string;
  person: MockChatPerson;
}

export const MOCK_CHAT_CONTACTS: MockChatContact[] = [
  ...MOCK_CHAT_THREADS.map(({ id, person }) => ({ id, person })),
  {
    id: 'sofia',
    person: {
      name: 'Sofia Morales',
      handle: 'sofim',
      avatar: '',
      isPana: true,
    },
  },
  {
    id: 'mateo',
    person: {
      name: 'Mateo Rivera',
      handle: 'mateor',
      avatar: '',
      isPana: true,
    },
  },
];

export { DIRECT_THREAD_REFUSED as REFUSAL_COPY } from '@/lib/dm-refusal';

/**
 * Appended locally by the Receive message control, never by a real socket.
 */
export const INCOMING_LIVE_MESSAGE: MockChatMessage = {
  id: 'jd-live',
  from: 'them',
  day: 'Today',
  time: '2:18 PM',
  body: 'also bring the orange extension cord if you can find it',
};

/** Snippet for the conversation list. Voice memos have no text to show. */
export function threadSnippet(thread: MockChatThread): string {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return '';
  const prefix = last.from === 'me' ? 'You: ' : '';
  if (last.voice) return `${prefix}Voice memo (${last.voice.duration})`;
  if (last.gif) return `${prefix}GIF${last.body ? ` - ${last.body}` : ''}`;
  return prefix + (last.body ?? '');
}

/** Consecutive messages from one sender on one day, for bubble grouping. */
export function groupMessages(
  messages: MockChatMessage[]
): MockChatMessage[][] {
  const groups: MockChatMessage[][] = [];
  for (const message of messages) {
    const current = groups[groups.length - 1];
    if (
      current &&
      current[0].from === message.from &&
      current[0].day === message.day &&
      current[0].delivery === message.delivery &&
      message.delivery !== 'failed'
    ) {
      current.push(message);
    } else {
      groups.push([message]);
    }
  }
  return groups;
}

/**
 * Threads holding a message that expires in under a day.
 *
 * Computed, never typed, per the README convention: a mock must not be able
 * to advertise a count it does not render.
 */
export function expiringSoon(threads: MockChatThread[]): MockChatThread[] {
  return threads.filter((thread) =>
    thread.messages.some((message) => message.expiresIn?.includes('hour'))
  );
}
