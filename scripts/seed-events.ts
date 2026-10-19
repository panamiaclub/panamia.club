#!/usr/bin/env npx tsx
/**
 * Seed Events
 *
 * The events layer: hosts, venues, RSVPs and the follow graph that
 * events.panamia.club reasons over. Runs after scripts/seed-dev-data.ts, which
 * owns the users and profiles this file hangs everything off.
 *
 * WHY THIS FILE EXISTS
 *
 * /e does not rank events, it explains them. Every card carries a reason —
 * "Marisol you follow is hosting", "3 panas you follow are going", "like the
 * MIA Zine Fair you went to", "first event by this host" — and those reasons
 * are computed in lib/events/discovery.ts from rows that have to actually
 * exist. That makes the page unusually hostile to casual fixtures:
 *
 *   - A reason is never invented. `reasonsFor` returns nothing unless the
 *     supporting rows are there, so an events table full of plausible events
 *     with no follows, no RSVPs and no attendance history renders a page with
 *     no reasons on it. The feature looks broken when the data is simply flat.
 *   - `buildLanes` drops any lane holding fewer than two events (lanes.ts),
 *     so seeding one event per reason silently produces a page with no lanes
 *     at all — the hardest possible failure to read, because nothing errors.
 *   - `panas-going` needs THREE followed panas on one event, not one. Two is
 *     deliberately a coincidence rather than a recommendation.
 *   - `new-host` counts a host's PAST published events, so "new host" cannot
 *     be seeded with future events alone. Some events must be behind us.
 *   - `tag-match` reads what the viewer turned up to, not what they browsed,
 *     so it needs past events the viewer has a 'going' RSVP against.
 *
 * So this file's job is not "make some events". It is to lay down the
 * evidence each reason is made of, with enough events per reason that the
 * lane survives the two-event floor. The viewer it is all aimed at is pana1
 * (seed_p_1), the account scripts/seed-test-account.ts logs you in as.
 *
 * Row shapes mirror the writers that produce them in production, and cite
 * them: follows mirror createFollow in lib/federation/wrappers/follow.ts, the
 * group host mirrors createGroup in lib/federation/wrappers/group.ts. When
 * those writers change, this must change with them.
 *
 * Usage:
 *   npx tsx scripts/seed-events.ts        (or: yarn db:seed)
 *
 * Safe to re-run: every row is upserted by a stable `seed_`-prefixed id, so a
 * second run repairs drift rather than duplicating. Dates are relative to the
 * run, so re-running also re-floats events that have since gone stale.
 *
 * Deliberately sequential. Seeding is not hot, ordering makes failures
 * readable, and later rows reference ids earlier ones settled.
 *
 * Local databases only — it writes rows as other people's accounts.
 */

import { config } from 'dotenv';

config({ path: '.env.local' });

/** The account the discovery page is seeded to make sense for. */
const VIEWER_PROFILE_ID = 'seed_p_1';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Hosts pana1 follows. Their events earn the `follow-host` reason. */
const FOLLOWED_PROFILE_IDS = ['seed_p_2', 'seed_p_3', 'seed_p_4', 'seed_p_5'];

const GROUP_HANDLE = 'little-haiti-print-club';
const GROUP_ACTOR_ID = 'seed_a_printclub';
const GROUP_ID = 'seed_g_printclub';

/**
 * Past events, newest last. Two jobs:
 *
 *  - the two with `viewerAttended` are the entire basis of `tag-match`; their
 *    tags are what upcoming events are matched against.
 *  - the rest exist to push their host's past-event count above 1, which is
 *    what stops `new-host` firing for established organisers. Without them
 *    every host on the page reads as brand new and the lane means nothing.
 */
const PAST_EVENTS = [
  {
    k: 'zinefair',
    t: 'MIA Zine Fair',
    h: 'seed_p_10',
    d: -120,
    g: ['zines', 'print', 'diy'],
    viewerAttended: true,
  },
  {
    k: 'garden',
    t: 'Overtown Garden Day',
    h: 'seed_p_11',
    d: -75,
    g: ['garden', 'mutual-aid', 'food'],
    viewerAttended: true,
  },
  { k: 'riso101', t: 'Risograph 101', h: 'seed_p_10', d: -40, g: ['print'] },
  { k: 'compost', t: 'Compost Clinic', h: 'seed_p_11', d: -30, g: ['garden'] },
  {
    k: 'maria1',
    t: 'Paper Marbling Afternoon',
    h: 'seed_p_2',
    d: -90,
    g: ['print'],
  },
  { k: 'maria2', t: 'Bookbinding Basics', h: 'seed_p_2', d: -45, g: ['print'] },
  { k: 'clari1', t: 'Cafecito & Critique', h: 'seed_p_3', d: -80, g: ['art'] },
  { k: 'clari2', t: 'Winter Supper Club', h: 'seed_p_3', d: -35, g: ['food'] },
  {
    k: 'ivan1',
    t: 'Domino Tournament',
    h: 'seed_p_9',
    d: -60,
    g: ['dominoes'],
  },
  { k: 'ivan2', t: 'Cafecito Hour', h: 'seed_p_9', d: -20, g: ['dominoes'] },
  {
    k: 'lucia1',
    t: 'Taller: Visible Mending',
    h: 'seed_p_15',
    d: -55,
    g: ['textiles'],
  },
  {
    k: 'lucia2',
    t: 'Taller: Natural Dyes',
    h: 'seed_p_15',
    d: -15,
    g: ['textiles'],
  },
  {
    k: 'tasha1',
    t: 'Second Saturday Block Party',
    h: 'seed_p_8',
    d: -50,
    g: ['music'],
  },
  { k: 'tasha2', t: 'Porch Sessions', h: 'seed_p_8', d: -18, g: ['music'] },
] as const;

const PAST_GROUP_EVENTS = [
  { k: 'group1', t: 'Print Club: Screen Printing', d: -70, g: ['print'] },
  { k: 'group2', t: 'Print Club: Zine Swap', d: -25, g: ['zines'] },
] as const;

/**
 * Upcoming events, grouped by the reason each one is here to produce. Spread
 * across `startsAt` so all four of discovery's WhenBuckets (today / weekend /
 * month / later) have something in them, and across hosted/group/online/
 * venueless so the card's "where" line is exercised in every shape it takes.
 *
 * At least two per reason, because `buildLanes` discards a shorter lane.
 */
type UpcomingSeed = {
  k: string;
  t: string;
  /** Exactly one of host / group, mirroring the events_single_host CHECK. */
  host?: string;
  group?: boolean;
  inDays?: number;
  inHours?: number;
  venue?: string | null;
  online?: boolean;
  tags: string[];
  going: number;
  cap: number | null;
  blurb: string;
  /** Followed panas with a 'going' RSVP. Three is what panas-going needs. */
  rsvps?: string[];
};

const UPCOMING: UpcomingSeed[] = [
  // --- follow-host: hosted by someone (or a group) pana1 follows ----------
  {
    k: 'riso',
    t: 'Risograph Night',
    host: 'seed_p_2',
    inDays: 2,
    venue: 'bakehouse',
    tags: ['riso', 'print'],
    going: 14,
    cap: 20,
    blurb: 'Two colours, one pass, bring something to print. Paper provided.',
  },
  {
    k: 'sobremesa',
    t: 'Sobremesa: Long Table Dinner',
    host: 'seed_p_3',
    inDays: 5,
    venue: 'libreria',
    tags: ['sobremesa', 'food'],
    going: 22,
    cap: 30,
    blurb: 'One long table, one pot, and nowhere to be afterwards.',
  },
  {
    k: 'printclub',
    t: 'Print Club Open Studio',
    group: true,
    inDays: 9,
    venue: 'bakehouse',
    tags: ['print', 'zines'],
    going: 18,
    cap: null,
    blurb: 'Presses are on. Bring a project or use ours.',
  },

  // --- panas-going: three or more followed panas have RSVPd --------------
  {
    k: 'dominoes',
    t: 'Dominoes & Cafecito',
    host: 'seed_p_9',
    inDays: 3,
    venue: 'tap',
    tags: ['dominoes', 'games'],
    going: 31,
    cap: null,
    blurb: 'Tables from six. Beginners welcome, trash talk optional.',
    rsvps: ['seed_p_2', 'seed_p_3', 'seed_p_4', 'seed_p_5'],
  },
  {
    k: 'mending',
    t: 'Taller: Mending Circle',
    host: 'seed_p_15',
    inDays: 16,
    venue: 'libreria',
    tags: ['mending', 'textiles'],
    going: 12,
    cap: 16,
    blurb:
      'Bring the thing with the hole in it. Needles and patience supplied.',
    rsvps: ['seed_p_3', 'seed_p_4', 'seed_p_5'],
  },

  // --- tag-match: shares tags with what pana1 actually turned up to -------
  {
    k: 'zinefair2',
    t: 'MIA Zine Fair: Winter Edition',
    host: 'seed_p_10',
    inDays: 21,
    venue: 'bakehouse',
    tags: ['zines', 'print', 'diy'],
    going: 95,
    cap: null,
    blurb: 'Forty tables of zines, risograph and small press.',
  },
  {
    k: 'seedswap',
    t: 'Seed Swap & Garden Clinic',
    host: 'seed_p_11',
    inDays: 40,
    venue: null,
    tags: ['garden', 'mutual-aid'],
    going: 26,
    cap: null,
    blurb:
      'Bring seeds, take seeds. Clinic for whatever is dying on your balcony.',
  },

  // --- new-host: first or second event, small room ------------------------
  {
    k: 'salsa',
    t: 'Salsa Social for Beginners',
    host: 'seed_p_6',
    inHours: 6,
    venue: 'tap',
    tags: ['salsa', 'dance'],
    going: 12,
    cap: 40,
    blurb: 'No partner, no experience, no heels required.',
  },
  {
    k: 'birding',
    t: 'Sunrise Birding at Virginia Key',
    host: 'seed_p_7',
    inDays: 4,
    venue: null,
    tags: ['birding', 'outdoors'],
    going: 7,
    cap: 15,
    blurb: 'Meet by the boat ramp. Binoculars to share.',
    rsvps: ['seed_p_4'],
  },
  {
    k: 'openmic',
    t: 'Open Mic: First Timers Only',
    host: 'seed_p_13',
    inDays: 12,
    venue: 'libreria',
    tags: ['poetry', 'openmic'],
    going: 18,
    cap: 25,
    blurb: 'Five minutes each. Everyone here is also nervous.',
  },

  // --- no reason: the leftovers rail, and the big room the page is not ----
  {
    k: 'blockparty',
    t: 'Little Haiti Block Party',
    host: 'seed_p_8',
    inDays: 26,
    venue: 'bakehouse',
    tags: ['music', 'block-party'],
    going: 240,
    cap: null,
    blurb: 'Three stages, ten kitchens, one street.',
  },
  {
    k: 'grants',
    t: 'Grant Writing for Artists',
    host: 'seed_p_8',
    inDays: 52,
    venue: null,
    online: true,
    tags: ['grants', 'workshop'],
    going: 63,
    cap: null,
    blurb: 'Budgets, narratives, and what panels actually read first.',
  },
];

const VENUES = {
  bakehouse: {
    name: 'Bakehouse Art Complex',
    city: 'Miami',
    address: '561 NW 32nd St',
    cap: 300,
  },
  libreria: {
    name: 'Librería Cafecito',
    city: 'Miami',
    address: '1234 SW 8th St',
    cap: 60,
  },
  tap: {
    name: 'The Tap Room',
    city: 'Fort Lauderdale',
    address: '88 E Las Olas Blvd',
    cap: 120,
  },
} as const;

function line(label: string, value: string | number): void {
  console.log(`  ${label.padEnd(30)} ${value}`);
}

async function main(): Promise<void> {
  const connectionString =
    process.env.POSTGRES_URL ?? process.env.POSTGRES_DIRECT_URL;
  if (!connectionString) {
    console.error('Error: POSTGRES_URL is required (check .env.local)');
    process.exit(1);
  }
  process.env.POSTGRES_URL = connectionString;

  const target = connectionString.replace(/\/\/[^@]*@/, '//***@').split('?')[0];
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const allowRemote = process.env.SEED_ALLOW_REMOTE === '1';
  if (!isLocal && !allowRemote) {
    console.error('Refusing to run: this only targets a local database.');
    console.error('Database:', target);
    console.error(
      'Set SEED_ALLOW_REMOTE=1 to override, but only for a disposable database\n' +
        'you own. This script writes fixtures as other people, including RSVPs\n' +
        'and follows; against real data that is destructive.'
    );
    process.exit(1);
  }
  if (!isLocal) {
    console.warn('SEED_ALLOW_REMOTE=1 set — seeding a REMOTE database.');
    console.warn('Database:', target);
  }

  // Deferred for the same reason scripts/seed-dev-data.ts defers: modules
  // under lib/federation read NEXT_PUBLIC_HOST_URL and FEDERATION_DOMAIN at
  // import time, so importing before config() above resolves them against a
  // different environment than the one the dev server will use.
  const [{ db }, schema, federation, { generateActorKeyPair }] =
    await Promise.all([
      import('../lib/db'),
      import('../lib/schema'),
      import('../lib/federation'),
      import('../lib/federation/crypto/keys'),
    ]);
  const { eq, and, inArray, sql } = await import('drizzle-orm');

  console.log('SEED:events:start');
  console.log('Database:', target, '\n');

  const now = new Date();
  const at = (ms: number) => new Date(now.getTime() + ms);

  // ---------------------------------------------------------------- venues --
  console.log('Venues');

  for (const [key, v] of Object.entries(VENUES)) {
    const row = {
      id: `seed_venue_${key}`,
      slug: `seed-${key}`,
      name: v.name,
      address: v.address,
      city: v.city,
      state: 'FL',
      // The directory account owns them: a venue needs an operator, and
      // attributing fixtures to a person's profile would put rows a member
      // did not create under their name.
      operatorProfileId: 'seed_p_15',
      fireCapacity: v.cap,
      // Active, not the 'pending_review' default: a venue awaiting review is
      // not a venue anyone can hold an event at.
      status: 'active' as const,
    };
    await db
      .insert(schema.venues)
      .values(row)
      .onConflictDoUpdate({ target: schema.venues.id, set: row });
  }
  line('upserted', Object.keys(VENUES).length);

  // ------------------------------------------------------------ group host --
  console.log('\nGroup host');

  // Mirrors createGroup in lib/federation/wrappers/group.ts: an actor with
  // type='Group' and its own keypair, the group row, and the founder as an
  // active admin. Written directly rather than through the wrapper so the
  // ids stay stable and a re-run repairs instead of failing on the handle.
  const existingGroupActor = await db.query.socialActors.findFirst({
    where: eq(schema.socialActors.id, GROUP_ACTOR_ID),
    columns: { id: true },
  });

  if (!existingGroupActor) {
    const { publicKey, privateKey } = generateActorKeyPair();
    await db.insert(schema.socialActors).values({
      id: GROUP_ACTOR_ID,
      username: GROUP_HANDLE,
      domain: federation.socialConfig.domain,
      type: 'Group',
      // Deliberately null — a group is not a directory listing. See the note
      // in createGroup on why social_actors.profile_id stays unset here.
      profileId: null,
      uri: federation.getActorUrl(GROUP_HANDLE),
      inboxUrl: federation.getInboxUrl(GROUP_HANDLE),
      outboxUrl: federation.getOutboxUrl(GROUP_HANDLE),
      followersUrl: federation.getFollowersUrl(GROUP_HANDLE),
      followingUrl: federation.getFollowingUrl(GROUP_HANDLE),
      publicKey,
      privateKey,
      name: 'Little Haiti Print Club',
      summary: 'Open studio, shared presses, bring your own paper.',
    });
    await db.insert(schema.socialGroups).values({
      id: GROUP_ID,
      actorId: GROUP_ACTOR_ID,
      createdByProfileId: 'seed_p_2',
      topics: { art: true },
      rules: [],
      visibility: 'public',
      joinPolicy: 'open',
      memberCount: 1,
    });
    const founderActor = await db.query.socialActors.findFirst({
      where: eq(schema.socialActors.profileId, 'seed_p_2'),
      columns: { id: true },
    });
    if (founderActor) {
      await db.insert(schema.socialGroupMembers).values({
        groupId: GROUP_ID,
        actorId: founderActor.id,
        role: 'admin',
        status: 'active',
        joinedAt: now,
      });
    }
    line('created', GROUP_HANDLE);
  } else {
    line('already present', GROUP_HANDLE);
  }

  // --------------------------------------------------------------- follows --
  console.log('\nFollows (pana1 -> hosts and panas)');

  const viewerActor = await db.query.socialActors.findFirst({
    where: eq(schema.socialActors.profileId, VIEWER_PROFILE_ID),
    columns: { id: true, username: true },
  });
  if (!viewerActor) {
    console.error(
      `Error: ${VIEWER_PROFILE_ID} has no social actor. Run scripts/seed-dev-data.ts first.`
    );
    process.exit(1);
  }

  const followTargets = await db.query.socialActors.findMany({
    where: inArray(schema.socialActors.profileId, [...FOLLOWED_PROFILE_IDS]),
    columns: { id: true, profileId: true },
  });
  const targetActorIds = [
    ...followTargets.map((a) => a.id),
    // The group too: a follow points at an actor, and discovery resolves
    // group hosts through social_groups.actor_id. Following only people
    // would leave the group-hosted event with no reason on it.
    GROUP_ACTOR_ID,
  ];

  let follows = 0;
  for (const targetActorId of targetActorIds) {
    if (targetActorId === viewerActor.id) continue;
    const existing = await db.query.socialFollows.findFirst({
      where: and(
        eq(schema.socialFollows.actorId, viewerActor.id),
        eq(schema.socialFollows.targetActorId, targetActorId)
      ),
      columns: { id: true },
    });
    if (existing) continue;

    // Mirrors createFollow: local targets are accepted immediately, the uri
    // is derived from the row's own id, and both counters move with it.
    const followId = `seed_fol_${targetActorId}`.slice(0, 40);
    await db.insert(schema.socialFollows).values({
      id: followId,
      actorId: viewerActor.id,
      targetActorId,
      status: 'accepted',
      acceptedAt: now,
      uri: `https://${federation.socialConfig.domain}/p/${viewerActor.username}/follows/${followId}`,
    });
    await db
      .update(schema.socialActors)
      .set({ followingCount: sql`${schema.socialActors.followingCount} + 1` })
      .where(eq(schema.socialActors.id, viewerActor.id));
    await db
      .update(schema.socialActors)
      .set({ followersCount: sql`${schema.socialActors.followersCount} + 1` })
      .where(eq(schema.socialActors.id, targetActorId));
    follows += 1;
  }
  line('created', follows);
  line('already present', targetActorIds.length - follows);

  // ----------------------------------------------------------------- events --
  console.log('\nEvents');

  type EventRow = typeof schema.events.$inferInsert;

  async function upsertEvent(row: EventRow): Promise<void> {
    await db
      .insert(schema.events)
      .values(row)
      .onConflictDoUpdate({ target: schema.events.id, set: row });
  }

  async function upsertAttendee(
    eventId: string,
    profileId: string,
    name: string
  ): Promise<void> {
    const row = {
      id: `seed_att_${eventId}_${profileId}`.slice(0, 60),
      eventId,
      profileId,
      name,
      status: 'going' as const,
      // Only verified 'going' RSVPs count towards attendee_count, so an
      // unverified fixture would be invisible to every count on the page.
      emailVerifiedAt: now,
      respondedAt: now,
    };
    await db
      .insert(schema.eventAttendees)
      .values(row)
      .onConflictDoUpdate({ target: schema.eventAttendees.id, set: row });
  }

  const names = new Map(
    (
      await db
        .select({ id: schema.profiles.id, name: schema.profiles.name })
        .from(schema.profiles)
    ).map((p) => [p.id, p.name])
  );

  let pastCount = 0;
  for (const p of PAST_EVENTS) {
    const id = `seed_ev_past_${p.k}`;
    await upsertEvent({
      id,
      slug: `seed-past-${p.k}`,
      title: p.t,
      description: null,
      hostProfileId: p.h,
      startsAt: at(p.d * DAY),
      endsAt: at(p.d * DAY + 3 * HOUR),
      // Published rather than completed on purpose: countPastEventsByHost in
      // lib/events/discovery.ts counts published past events, and an archived
      // 'completed' row would make an established host read as brand new.
      status: 'published',
      visibility: 'public',
      mode: 'offline',
      attendeeCount: 20,
      icalUid: `${id}@events.panamia.club`,
      tags: [...p.g],
    });
    if ('viewerAttended' in p && p.viewerAttended) {
      await upsertAttendee(
        id,
        VIEWER_PROFILE_ID,
        names.get(VIEWER_PROFILE_ID) ?? 'Pana'
      );
    }
    pastCount += 1;
  }

  for (const p of PAST_GROUP_EVENTS) {
    const id = `seed_ev_past_${p.k}`;
    await upsertEvent({
      id,
      slug: `seed-past-${p.k}`,
      title: p.t,
      description: null,
      hostGroupId: GROUP_ID,
      startsAt: at(p.d * DAY),
      endsAt: at(p.d * DAY + 3 * HOUR),
      status: 'published',
      visibility: 'public',
      mode: 'offline',
      attendeeCount: 20,
      icalUid: `${id}@events.panamia.club`,
      tags: [...p.g],
    });
    pastCount += 1;
  }
  line('past (host history)', pastCount);

  let rsvpCount = 0;
  for (const e of UPCOMING) {
    const id = `seed_ev_${e.k}`;
    const offset = e.inHours ? e.inHours * HOUR : (e.inDays ?? 1) * DAY;

    await upsertEvent({
      id,
      slug: `seed-${e.k}`,
      title: e.t,
      description: e.blurb,
      hostProfileId: e.group ? null : (e.host ?? null),
      hostGroupId: e.group ? GROUP_ID : null,
      venueId: e.venue ? `seed_venue_${e.venue}` : null,
      startsAt: at(offset),
      endsAt: at(offset + 3 * HOUR),
      status: 'published',
      visibility: 'public',
      mode: e.online ? 'online' : 'offline',
      attendeeCap: e.cap ?? null,
      attendeeCount: e.going,
      icalUid: `${id}@events.panamia.club`,
      tags: e.tags,
    });

    for (const profileId of e.rsvps ?? []) {
      await upsertAttendee(id, profileId, names.get(profileId) ?? 'Pana');
      rsvpCount += 1;
    }
  }
  line('upcoming', UPCOMING.length);
  line('named RSVPs', rsvpCount);

  // ------------------------------------------------------------- verify --
  // A page whose entire output is reasons is worth nothing if the reasons do
  // not fire, and that failure is silent: `buildLanes` drops a lane with
  // fewer than two events, so under-seeding renders a quiet, plausible page
  // rather than an error. Nothing below is cosmetic — each count is the
  // precondition for one lane, read back from the rows just written.
  //
  // Deliberately counted here rather than by calling getDiscoveryFeed: this
  // asserts the DATA is right, which is this script's responsibility, and
  // stays runnable against any Postgres. Whether the feed then reasons over
  // it correctly is lib/events/discovery.ts's job and its tests'.
  console.log('\nVerify');

  const acceptedFollows = await db
    .select({ targetActorId: schema.socialFollows.targetActorId })
    .from(schema.socialFollows)
    .where(
      and(
        eq(schema.socialFollows.actorId, viewerActor.id),
        eq(schema.socialFollows.status, 'accepted')
      )
    );
  const followedActorIds = acceptedFollows.map((f) => f.targetActorId);

  const followedActors = await db
    .select({
      id: schema.socialActors.id,
      profileId: schema.socialActors.profileId,
    })
    .from(schema.socialActors)
    .where(inArray(schema.socialActors.id, followedActorIds));
  const followedProfileIds = followedActors
    .map((a) => a.profileId)
    .filter((id): id is string => id !== null);

  const followedGroups = await db
    .select({ id: schema.socialGroups.id })
    .from(schema.socialGroups)
    .where(inArray(schema.socialGroups.actorId, followedActorIds));
  const followedGroupIds = followedGroups.map((g) => g.id);

  const candidates = await db
    .select({
      id: schema.events.id,
      hostProfileId: schema.events.hostProfileId,
      hostGroupId: schema.events.hostGroupId,
      going: schema.events.attendeeCount,
      tags: schema.events.tags,
    })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.status, 'published'),
        eq(schema.events.visibility, 'public'),
        sql`${schema.events.startsAt} >= now()`
      )
    );

  const followHost = candidates.filter(
    (e) =>
      (e.hostProfileId && followedProfileIds.includes(e.hostProfileId)) ||
      (e.hostGroupId && followedGroupIds.includes(e.hostGroupId))
  ).length;

  // Three followed panas on one event, not one: see reasonsFor.
  const rsvpRows = followedProfileIds.length
    ? await db
        .select({
          eventId: schema.eventAttendees.eventId,
          n: sql<number>`count(*)::int`,
        })
        .from(schema.eventAttendees)
        .where(
          and(
            inArray(
              schema.eventAttendees.eventId,
              candidates.map((e) => e.id)
            ),
            inArray(schema.eventAttendees.profileId, followedProfileIds),
            eq(schema.eventAttendees.status, 'going')
          )
        )
        .groupBy(schema.eventAttendees.eventId)
    : [];
  const panasGoing = rsvpRows.filter((r) => Number(r.n) >= 3).length;

  // What the viewer turned up to, which is what tag-match matches against.
  const attendedTags = await db
    .select({ tags: schema.events.tags })
    .from(schema.eventAttendees)
    .innerJoin(
      schema.events,
      eq(schema.events.id, schema.eventAttendees.eventId)
    )
    .where(
      and(
        eq(schema.eventAttendees.profileId, VIEWER_PROFILE_ID),
        eq(schema.eventAttendees.status, 'going'),
        sql`${schema.events.startsAt} < now()`
      )
    );
  const pastTags = new Set(attendedTags.flatMap((r) => r.tags));
  const tagMatch = candidates.filter((e) =>
    e.tags.some((t) => pastTags.has(t))
  ).length;

  // Past PUBLISHED events per host — the field new-host turns on.
  const pastByProfile = await db
    .select({
      hostId: schema.events.hostProfileId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.status, 'published'),
        sql`${schema.events.startsAt} < now()`,
        sql`${schema.events.hostProfileId} is not null`
      )
    )
    .groupBy(schema.events.hostProfileId);
  const pastCounts = new Map(
    pastByProfile.map((r) => [r.hostId ?? '', Number(r.n)])
  );
  const newHost = candidates.filter(
    (e) =>
      e.hostProfileId !== null &&
      (pastCounts.get(e.hostProfileId) ?? 0) <= 1 &&
      e.going < 50
  ).length;

  line('upcoming candidates', candidates.length);
  line('accepted follows', followedActorIds.length);
  line('reason: follow-host', followHost);
  line('reason: panas-going', panasGoing);
  line('reason: tag-match', tagMatch);
  line('reason: new-host', newHost);

  // Two is the floor in buildLanes; a lane under it is silently dropped.
  const short = Object.entries({
    'follow-host': followHost,
    'panas-going': panasGoing,
    'tag-match': tagMatch,
    'new-host': newHost,
  }).filter(([, n]) => n < 2);

  if (short.length) {
    console.error(
      `\n[fail] under two events for: ${short.map(([k, n]) => `${k} (${n})`).join(', ')}`
    );
    console.error('buildLanes drops a lane with fewer than two events.');
    process.exit(1);
  }

  console.log(
    '\n[ok] Every lane has the events it needs, signed in and signed out.'
  );
  console.log('SEED:events:done');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
