#!/usr/bin/env node
/**
 * Demo seeding for the events discovery page, against a database that already
 * has real events in it.
 *
 * This is the opposite of scripts/seed-events.ts. That one invents a whole
 * world -- venues, hosts, events, RSVPs -- because a fresh local database has
 * nothing to discover. Here the events already exist and are real, and the
 * only thing missing is the evidence that makes /e able to say *why* it is
 * showing you one. So this script creates no events, no venues and no groups.
 * It writes relationships onto the events that are already there.
 *
 * That distinction is the whole safety story. Nothing this script does can
 * put an event in front of the community that a member did not create, which
 * is the one mistake in a pre-launch demo that would be visible to everybody
 * and embarrassing to explain.
 *
 * Which lanes need what, from lib/events/discovery.ts:
 *
 *   follow-host   viewer's own follows                    the demoer's account
 *   tag-match     viewer's own past 'going' RSVPs         the demoer's account
 *   new-host      nothing -- derived from existing events no writes at all
 *   panas-going   >= 3 followed profiles RSVP'd 'going'   OTHER PEOPLE
 *
 * Three of the four are just the demo account's own activity: following hosts
 * and having turned up to things. Those are honest rows -- they are exactly
 * what would exist if the demoer had clicked the buttons by hand, and nobody
 * else's name appears on them.
 *
 * panas-going is the exception and is therefore opt-in behind SEED_DEMO_PANAS.
 * It is the only reason on the page that cannot be produced without writing an
 * RSVP under somebody else's name. Enabling it means a real pana's face shows
 * up on an event they never said they were going to. For a demo you narrate
 * that is usually fine; leaving it in the database at launch is not, which is
 * what --undo is for.
 *
 * Usage:
 *   SEED_DEMO_VIEWER=you@example.com npx tsx scripts/seed-demo.ts
 *   SEED_ALLOW_REMOTE=1 SEED_DEMO_VIEWER=... npx tsx scripts/seed-demo.ts
 *   SEED_DEMO_VIEWER=... npx tsx scripts/seed-demo.ts --undo
 *
 * Every row it writes is prefixed demo_fol_ / demo_att_, so --undo removes
 * exactly what it added and can never touch a real follow or a real RSVP.
 */

import { config } from 'dotenv';

config({ path: '.env.local' });

/** Events we want each lane to hold. The lane floor in lib/events/lanes.ts is
 *  two -- below that a lane silently does not render -- and the cap is three,
 *  so three is a full lane. */
const PER_LANE = 3;

/** Prefixes that make --undo exact. Nothing else in the database starts with
 *  these, so a prefix delete cannot reach a row a human created. */
const FOLLOW_PREFIX = 'demo_fol_';
const ATTEND_PREFIX = 'demo_att_';

/** resolveViewerSignals reads the 20 most recent attendances. Past RSVPs we
 *  add for tag-match have to land inside that window to be seen, so we always
 *  attach to the most recent matching past events. */
const ATTENDANCE_WINDOW = 20;

function line(label: string, value: string | number): void {
  console.log(`  ${label.padEnd(34)} ${value}`);
}

async function main(): Promise<void> {
  const undo = process.argv.includes('--undo');

  const connectionString =
    process.env.POSTGRES_URL ?? process.env.POSTGRES_DIRECT_URL;
  if (!connectionString) {
    console.error('Error: POSTGRES_URL is required (check .env.local)');
    process.exit(1);
  }
  process.env.POSTGRES_URL = connectionString;

  const target = connectionString.replace(/\/\/[^@]*@/, '//***@').split('?')[0];
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  if (!isLocal && process.env.SEED_ALLOW_REMOTE !== '1') {
    console.error('Refusing to run against a remote database by default.');
    console.error('Database:', target);
    console.error(
      '\nSet SEED_ALLOW_REMOTE=1 if this is the database you mean. This script\n' +
        'does not create events, but it does write follows as the demo account,\n' +
        'and with SEED_DEMO_PANAS=1 it writes RSVPs under other people names.\n' +
        'Run with --undo afterwards to remove everything it added.'
    );
    process.exit(1);
  }

  const viewerKey = process.env.SEED_DEMO_VIEWER;
  if (!viewerKey) {
    console.error('Error: SEED_DEMO_VIEWER is required.');
    console.error(
      '\nThe page is a set of reasons aimed at one person, so the demo has to\n' +
        'be built for the account you will be signed in as. Pass a profile id,\n' +
        'screenname or email:\n\n' +
        '  SEED_DEMO_VIEWER=you@example.com npx tsx scripts/seed-demo.ts'
    );
    process.exit(1);
  }

  // Deferred for the same reason scripts/seed-dev-data.ts defers: modules under
  // lib/federation read NEXT_PUBLIC_HOST_URL at import time, so importing
  // before config() resolves them against the wrong environment.
  const [{ db }, schema, federation] = await Promise.all([
    import('../lib/db'),
    import('../lib/schema'),
    import('../lib/federation'),
  ]);
  const { eq, and, or, ne, lt, gte, inArray, isNotNull, like, desc, asc, sql } =
    await import('drizzle-orm');

  console.log(undo ? 'DEMO:events:undo' : 'DEMO:events:start');
  console.log('Database:', target, '\n');

  const now = new Date();

  // --------------------------------------------------------------- viewer --
  const viewer = await db.query.profiles.findFirst({
    where: or(
      eq(schema.profiles.id, viewerKey),
      eq(schema.profiles.screenname, viewerKey),
      inArray(
        schema.profiles.userId,
        db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(sql`lower(${schema.users.email}) = lower(${viewerKey})`)
      )
    ),
    columns: { id: true, name: true, screenname: true, email: true },
  });
  if (!viewer) {
    console.error(`Error: no profile matches ${JSON.stringify(viewerKey)}.`);
    console.error('Tried id, screenname and email.');
    process.exit(1);
  }

  const viewerActor = await db.query.socialActors.findFirst({
    where: eq(schema.socialActors.profileId, viewer.id),
    columns: { id: true, username: true },
  });

  console.log('Viewer');
  line('profile', `${viewer.name} (${viewer.id})`);
  line('actor', viewerActor ? viewerActor.username : 'none');

  // ----------------------------------------------------------------- undo --
  if (undo) {
    console.log('\nRemoving demo rows');

    const follows = viewerActor
      ? await db.query.socialFollows.findMany({
          where: and(
            eq(schema.socialFollows.actorId, viewerActor.id),
            like(schema.socialFollows.id, `${FOLLOW_PREFIX}%`)
          ),
          columns: { id: true, actorId: true, targetActorId: true },
        })
      : [];

    for (const follow of follows) {
      await db
        .delete(schema.socialFollows)
        .where(eq(schema.socialFollows.id, follow.id));
      // Counters moved when the follow was written, so they have to move back
      // or the profile is left claiming followers it no longer has.
      await db
        .update(schema.socialActors)
        .set({
          followingCount: sql`GREATEST(${schema.socialActors.followingCount} - 1, 0)`,
        })
        .where(eq(schema.socialActors.id, follow.actorId));
      await db
        .update(schema.socialActors)
        .set({
          followersCount: sql`GREATEST(${schema.socialActors.followersCount} - 1, 0)`,
        })
        .where(eq(schema.socialActors.id, follow.targetActorId));
    }
    line('follows removed', follows.length);

    const attendees = await db
      .delete(schema.eventAttendees)
      .where(like(schema.eventAttendees.id, `${ATTEND_PREFIX}%`))
      .returning({ id: schema.eventAttendees.id });
    line('RSVPs removed', attendees.length);

    console.log('\n[ok] Demo rows removed. Real follows and RSVPs untouched.');
    console.log('DEMO:events:done');
    process.exit(0);
  }

  // ------------------------------------------------------------ candidates --
  // The same predicate getDiscoveryFeed uses, so what we plan against is
  // exactly what the page will consider.
  const candidates = await db.query.events.findMany({
    where: and(
      eq(schema.events.status, 'published'),
      eq(schema.events.visibility, 'public'),
      gte(schema.events.startsAt, now)
    ),
    columns: {
      id: true,
      title: true,
      tags: true,
      hostProfileId: true,
      hostGroupId: true,
      attendeeCount: true,
      startsAt: true,
    },
    orderBy: [asc(schema.events.startsAt)],
    limit: 60,
  });

  console.log('\nReal events already in this database');
  line('upcoming candidates', candidates.length);

  if (candidates.length < 2) {
    console.error(
      '\nThere are fewer than two upcoming published public events here, so\n' +
        'there is nothing for the page to recommend. Publish some events first,\n' +
        'or run scripts/seed-events.ts against a local database instead.'
    );
    process.exit(1);
  }

  /* Who hosts each candidate. Exactly one of the two is set (migration 0047),
     and a follow points at an actor, so both kinds have to be resolved back to
     an actor id or a group's events can never earn the strongest reason. */
  const hostActorOf = new Map<string, string>();
  const hostKeyOf = new Map<string, string>();

  const hostProfileIds = [
    ...new Set(candidates.map((e) => e.hostProfileId).filter(Boolean)),
  ] as string[];
  const hostGroupIds = [
    ...new Set(candidates.map((e) => e.hostGroupId).filter(Boolean)),
  ] as string[];

  const hostActors = hostProfileIds.length
    ? await db.query.socialActors.findMany({
        where: inArray(schema.socialActors.profileId, hostProfileIds),
        columns: { id: true, profileId: true },
      })
    : [];
  const hostGroups = hostGroupIds.length
    ? await db.query.socialGroups.findMany({
        where: inArray(schema.socialGroups.id, hostGroupIds),
        columns: { id: true, actorId: true },
      })
    : [];

  const actorByProfile = new Map(
    hostActors.filter((a) => a.profileId).map((a) => [a.profileId!, a.id])
  );
  const actorByGroup = new Map(hostGroups.map((g) => [g.id, g.actorId]));

  for (const event of candidates) {
    const key = event.hostProfileId ?? event.hostGroupId;
    if (!key) continue;
    hostKeyOf.set(event.id, key);
    const actorId = event.hostProfileId
      ? actorByProfile.get(event.hostProfileId)
      : actorByGroup.get(event.hostGroupId!);
    if (actorId) hostActorOf.set(event.id, actorId);
  }

  line('distinct hosts', new Set([...hostKeyOf.values()]).size);
  line('hosts reachable by follow', new Set([...hostActorOf.values()]).size);

  /* Worked out before any lane is planned, because new-host is the one lane
     that cannot be manufactured: it is derived purely from events that already
     exist, and it is the only lane a signed-out visitor ever sees. Every other
     lane therefore gets planned around it, taking events it does not need
     first, so a small real pool still fills four lanes instead of three. */
  const pastByHost = new Map<string, number>();
  for (const key of [...new Set([...hostKeyOf.values()])]) {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.events)
      .where(
        and(
          eq(schema.events.status, 'published'),
          lt(schema.events.startsAt, now),
          or(
            eq(schema.events.hostProfileId, key),
            eq(schema.events.hostGroupId, key)
          )
        )
      );
    pastByHost.set(key, rows[0]?.n ?? 0);
  }

  const isNewHost = (eventId: string): boolean => {
    const event = candidates.find((e) => e.id === eventId);
    const key = event ? hostKeyOf.get(event.id) : undefined;
    if (!event || !key) return false;
    return (pastByHost.get(key) ?? 0) <= 1 && (event.attendeeCount ?? 0) < 50;
  };

  const newHostEvents = candidates.filter((e) => isNewHost(e.id));
  line('of those, new-host material', newHostEvents.length);

  // ---------------------------------------------------------- follow-host --
  console.log('\nLane: from hosts you follow');

  if (!viewerActor) {
    console.warn(
      '  skipped — this profile has no social actor, so it cannot follow anyone.'
    );
  }

  const existingFollows = viewerActor
    ? await db.query.socialFollows.findMany({
        where: eq(schema.socialFollows.actorId, viewerActor.id),
        columns: { targetActorId: true, status: true },
      })
    : [];
  const followedActorIds = new Set(
    existingFollows
      .filter((f) => f.status === 'accepted')
      .map((f) => f.targetActorId)
  );
  /* social_follows is unique on (actor, target), so a follow in any state --
     pending on a private account, or previously rejected -- blocks an insert.
     Those are answers someone already gave; skip the host rather than
     overwrite the row to make a lane fill up. */
  const anyFollowActorIds = new Set(
    existingFollows.map((f) => f.targetActorId)
  );

  /* Claimed as we go: a lane only gets an event if no higher lane took it, so
     planning each lane against the events already spoken for is the only way
     to end up with four lanes instead of one full one and three empty. */
  const claimed = new Set<string>();

  let followCovered = candidates.filter(
    (e) => hostActorOf.has(e.id) && followedActorIds.has(hostActorOf.get(e.id)!)
  );
  for (const e of followCovered) claimed.add(e.id);

  let followsCreated = 0;
  if (viewerActor) {
    /* Non-new-host events first, so following a host does not quietly empty
       the one lane signed-out visitors depend on. */
    const followOrder = [
      ...candidates.filter((e) => !isNewHost(e.id)),
      ...candidates.filter((e) => isNewHost(e.id)),
    ];
    for (const event of followOrder) {
      if (followCovered.length >= PER_LANE) break;
      const actorId = hostActorOf.get(event.id);
      if (!actorId) continue;
      if (actorId === viewerActor.id) continue;
      if (anyFollowActorIds.has(actorId)) continue;

      const followId = `${FOLLOW_PREFIX}${actorId}`.slice(0, 60);
      await db.insert(schema.socialFollows).values({
        id: followId,
        actorId: viewerActor.id,
        targetActorId: actorId,
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
        .where(eq(schema.socialActors.id, actorId));

      followedActorIds.add(actorId);
      anyFollowActorIds.add(actorId);
      followsCreated += 1;

      // Following a host claims every candidate they host, not just this one.
      followCovered = candidates.filter(
        (e) =>
          hostActorOf.has(e.id) && followedActorIds.has(hostActorOf.get(e.id)!)
      );
      for (const e of followCovered) claimed.add(e.id);
    }
  }

  line('follows created', followsCreated);
  line('events this lane will hold', Math.min(followCovered.length, PER_LANE));

  /**
   * Add an RSVP only when the person has no row for that event already.
   *
   * event_attendees carries a unique constraint on (event_id, profile_id), so
   * an upsert keyed on id is not enough -- a real RSVP with a different id
   * collides. Upserting on the natural key instead would be worse than the
   * crash it fixes: it would rewrite a real RSVP's id to demo_att_*, and
   * --undo would then delete a row a member actually created.
   *
   * So existing rows are left exactly as they are. A pana who already said
   * they are going needs nothing written, and one who said they are not is
   * not going to be quietly flipped to make a lane look fuller.
   */
  async function ensureAttendee(
    eventId: string,
    profileId: string,
    name: string
  ): Promise<'created' | 'already-going' | 'left-alone'> {
    const existing = await db.query.eventAttendees.findFirst({
      where: and(
        eq(schema.eventAttendees.eventId, eventId),
        eq(schema.eventAttendees.profileId, profileId)
      ),
      columns: { status: true },
    });
    if (existing) {
      return existing.status === 'going' ? 'already-going' : 'left-alone';
    }
    await db
      .insert(schema.eventAttendees)
      .values({
        id: `${ATTEND_PREFIX}${eventId}_${profileId}`.slice(0, 60),
        eventId,
        profileId,
        name,
        status: 'going' as const,
        emailVerifiedAt: now,
        respondedAt: now,
      })
      .onConflictDoNothing();
    return 'created';
  }

  // ---------------------------------------------------------- panas-going --
  console.log('\nLane: your panas are going');

  const wantPanas = process.env.SEED_DEMO_PANAS === '1';
  let panasRsvps = 0;
  let panasEvents = 0;

  if (!wantPanas) {
    line('skipped', 'set SEED_DEMO_PANAS=1 to enable');
    console.log(
      '  This is the only lane that writes RSVPs under other people names.'
    );
  } else {
    /* The panas have to be people the viewer follows, because that is what the
       lane counts. Resolve the follow targets back to profiles. */
    const followedProfiles = followedActorIds.size
      ? await db.query.socialActors.findMany({
          where: inArray(schema.socialActors.id, [...followedActorIds]),
          columns: { profileId: true },
        })
      : [];
    const panaIds = followedProfiles
      .map((a) => a.profileId)
      .filter((id): id is string => Boolean(id));

    /* Panas do not have to be hosts -- the lane just counts people the viewer
       follows. If following hosts did not happen to yield three with profiles
       behind them, follow a few more real people, which is what an account
       with any history would look like anyway. */
    if (panaIds.length < 3 && viewerActor) {
      const extras = await db.query.socialActors.findMany({
        where: and(
          isNotNull(schema.socialActors.profileId),
          ne(schema.socialActors.id, viewerActor.id)
        ),
        columns: { id: true, profileId: true },
        limit: 60,
      });

      let extrasFollowed = 0;
      for (const extra of extras) {
        if (panaIds.length >= 3) break;
        if (!extra.profileId) continue;
        if (anyFollowActorIds.has(extra.id)) continue;

        const followId = `${FOLLOW_PREFIX}${extra.id}`.slice(0, 60);
        await db.insert(schema.socialFollows).values({
          id: followId,
          actorId: viewerActor.id,
          targetActorId: extra.id,
          status: 'accepted',
          acceptedAt: now,
          uri: `https://${federation.socialConfig.domain}/p/${viewerActor.username}/follows/${followId}`,
        });
        await db
          .update(schema.socialActors)
          .set({
            followingCount: sql`${schema.socialActors.followingCount} + 1`,
          })
          .where(eq(schema.socialActors.id, viewerActor.id));
        await db
          .update(schema.socialActors)
          .set({
            followersCount: sql`${schema.socialActors.followersCount} + 1`,
          })
          .where(eq(schema.socialActors.id, extra.id));

        anyFollowActorIds.add(extra.id);
        followedActorIds.add(extra.id);
        panaIds.push(extra.profileId);
        followsCreated += 1;
        extrasFollowed += 1;
      }

      if (extrasFollowed > 0) {
        line('extra panas followed', extrasFollowed);
      }
    }

    if (panaIds.length < 3) {
      line('skipped', `only ${panaIds.length} followed panas, needs 3`);
    } else {
      const panaProfiles = await db.query.profiles.findMany({
        where: inArray(schema.profiles.id, panaIds),
        columns: { id: true, name: true },
      });

      const panaOrder = [
        ...candidates.filter((e) => !isNewHost(e.id)),
        ...candidates.filter((e) => isNewHost(e.id)),
      ];
      for (const event of panaOrder) {
        if (panasEvents >= PER_LANE) break;
        if (claimed.has(event.id)) continue;

        /* The lane needs three panas going on the same event. Anyone who
           already has an RSVP is counted rather than rewritten, so an event
           only qualifies if three of them end up going without us overriding
           a single existing answer. */
        let going = 0;
        let written = 0;
        for (const pana of panaProfiles) {
          if (going >= 3) break;
          const outcome = await ensureAttendee(event.id, pana.id, pana.name);
          if (outcome === 'left-alone') continue;
          if (outcome === 'created') written += 1;
          going += 1;
        }

        if (going < 3) continue;
        panasRsvps += written;
        claimed.add(event.id);
        panasEvents += 1;
      }
      line('RSVPs written as other people', panasRsvps);
      line('events this lane will hold', panasEvents);
    }
  }

  // ------------------------------------------------------------ tag-match --
  console.log('\nLane: like things you have turned up to');

  const attendedAlready = await db
    .select({
      eventId: schema.eventAttendees.eventId,
      title: schema.events.title,
      tags: schema.events.tags,
      startsAt: schema.events.startsAt,
    })
    .from(schema.eventAttendees)
    .innerJoin(
      schema.events,
      eq(schema.events.id, schema.eventAttendees.eventId)
    )
    .where(
      and(
        eq(schema.eventAttendees.profileId, viewer.id),
        eq(schema.eventAttendees.status, 'going'),
        lt(schema.events.startsAt, now)
      )
    )
    .orderBy(desc(schema.events.startsAt))
    .limit(ATTENDANCE_WINDOW);

  const attendedTags = new Set(attendedAlready.flatMap((a) => a.tags ?? []));
  const attendedIds = new Set(attendedAlready.map((a) => a.eventId));

  const taggedAndFree = (e: (typeof candidates)[number]): boolean =>
    !claimed.has(e.id) && (e.tags ?? []).length > 0;
  // New-host material last again, for the same reason as the lanes above.
  const unclaimedTagged = [
    ...candidates.filter((e) => taggedAndFree(e) && !isNewHost(e.id)),
    ...candidates.filter((e) => taggedAndFree(e) && isNewHost(e.id)),
  ];
  let tagCovered = unclaimedTagged.filter((e) =>
    (e.tags ?? []).some((t) => attendedTags.has(t))
  );
  for (const e of tagCovered) claimed.add(e.id);

  let attendanceAdded = 0;
  if (tagCovered.length < PER_LANE) {
    /* Newest first: resolveViewerSignals only reads the 20 most recent
       attendances, so an RSVP on something from three years ago would be
       written and then never looked at. */
    const pastEvents = await db.query.events.findMany({
      where: and(
        eq(schema.events.status, 'published'),
        lt(schema.events.startsAt, now)
      ),
      columns: { id: true, title: true, tags: true },
      orderBy: [desc(schema.events.startsAt)],
      limit: 200,
    });

    for (const past of pastEvents) {
      if (tagCovered.length >= PER_LANE) break;
      if (attendedIds.has(past.id)) continue;
      const tags = past.tags ?? [];
      if (tags.length === 0) continue;

      // Only worth attending if it unlocks a candidate nothing else has.
      const unlocks = unclaimedTagged.filter(
        (e) =>
          !claimed.has(e.id) && (e.tags ?? []).some((t) => tags.includes(t))
      );
      if (unlocks.length === 0) continue;

      const outcome = await ensureAttendee(past.id, viewer.id, viewer.name);
      // Left alone means the viewer already answered this one and said no.
      // Their own history is not ours to rewrite either.
      if (outcome === 'left-alone') continue;
      if (outcome === 'created') attendanceAdded += 1;

      for (const e of unlocks) {
        if (tagCovered.length >= PER_LANE) break;
        tagCovered.push(e);
        claimed.add(e.id);
      }
    }
  }

  if (attendedAlready.length >= ATTENDANCE_WINDOW) {
    console.warn(
      `  note: this account already has ${attendedAlready.length} recent attendances,\n` +
        '  so added history may fall outside the 20 the page reads.'
    );
  }
  line('past RSVPs added for the viewer', attendanceAdded);
  line('events this lane will hold', Math.min(tagCovered.length, PER_LANE));

  // --------------------------------------------------------------- new-host --
  console.log('\nLane: new hosts, small rooms');

  const newHostUnclaimed = newHostEvents.filter((e) => !claimed.has(e.id));

  line('qualifying events', newHostEvents.length);
  line(
    'events this lane will hold',
    Math.min(newHostUnclaimed.length, PER_LANE)
  );

  // --------------------------------------------------------------- verify --
  console.log('\nWhat the page will show');

  const signedIn = [
    ['from hosts you follow', Math.min(followCovered.length, PER_LANE)],
    ['your panas are going', panasEvents],
    ['like things you turned up to', Math.min(tagCovered.length, PER_LANE)],
    ['new hosts, small rooms', Math.min(newHostUnclaimed.length, PER_LANE)],
  ] as const;

  let rendered = 0;
  for (const [label, count] of signedIn) {
    const willRender = count >= 2;
    if (willRender) rendered += 1;
    line(label, willRender ? `${count} events` : `${count} — will not render`);
  }

  const signedOutLane = Math.min(newHostEvents.length, PER_LANE);
  line(
    'signed out sees',
    signedOutLane >= 2
      ? `new hosts (${signedOutLane} events)`
      : 'no lanes — falls back to the plain list'
  );

  console.log('');
  if (rendered === 0) {
    console.warn(
      '[warn] No lane will render. The page falls back to the honest plain\n' +
        '       list. With this little in the database that is the correct\n' +
        '       output, not a bug.'
    );
  } else {
    console.log(
      `[ok] ${rendered} of 4 lanes will render, built on real events.`
    );
  }
  console.log(
    '\nRemove everything this added with:\n' +
      `  SEED_DEMO_VIEWER=${viewerKey} npx tsx scripts/seed-demo.ts --undo`
  );
  console.log('DEMO:events:done');
  // The postgres connection keeps the event loop alive, so the process has to
  // be ended explicitly -- same reason scripts/seed-dev-data.ts does it.
  process.exit(0);
}

main().catch((error) => {
  console.error('\nFailed:', error);
  process.exit(1);
});
