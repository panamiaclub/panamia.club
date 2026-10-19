/**
 * Demo events, hosted by the real listings and groups already in the database.
 *
 * ---------------------------------------------------------------------------
 * Read this before running it against panamia.club
 * ---------------------------------------------------------------------------
 *
 * `scripts/seed-demo.ts` deliberately creates no events. Its argument is worth
 * repeating because this script is the exception to it:
 *
 *   > Nothing this script does can put an event in front of the community that
 *   > a member did not create.
 *
 * This one does exactly that. It writes events attributed to **real
 * businesses and real groups** — people who did not ask for an event and, on
 * the day, are not holding one. That is a heavier thing than inventing fake
 * panas, because it puts words in a real person's mouth on their own listing.
 *
 * It exists anyway because the discover page cannot be evaluated empty. Every
 * lane is a join against events, so with none in the table the page renders
 * its "nothing on yet" state no matter how good the ranking is, and there is
 * no way to see whether the thing works before launch.
 *
 * So the safeguards are the whole design, not a flourish on it:
 *
 * 1. **Every row is prefixed `demo_ev_`.** Nothing a human creates starts with
 *    that, so `--undo` is a prefix delete that cannot reach a real row. Same
 *    convention as seed-demo.ts's `demo_fol_` / `demo_att_`.
 * 2. **`--undo` is shipped with it, not promised later.** The durable risk is
 *    not the demo, it is these rows still being there at launch. Note that
 *    `yarn db:unseed` does *not* cover them: it matches the `seed_` prefix,
 *    and these are `demo_` for the same reason seed-demo.ts's rows are —
 *    they attach to real data rather than to a fake world, so the blunt
 *    teardown must not be able to reach them. `--undo` is the teardown.
 * 3. **Remote writes need SEED_ALLOW_REMOTE=1**, consistent with every other
 *    seeder here.
 * 4. **A pre-flight count names how many real businesses** are about to have
 *    an event attributed to them, and waits. Mentioning it in a docblock
 *    nobody reads at 1am is not consent.
 * 5. **The description says it is a sample, in plain words.** Titles stay
 *    clean because a rail full of "[TEST]" tells you nothing about whether
 *    the design works, which is the only reason to seed at all. Anyone who
 *    opens the event sees what it is immediately.
 *
 * Tags are derived from each host's own directory categories via the same
 * `categoryKeys` the directory search uses, so the subject rails on /e are
 * filled by what these businesses actually say they do, rather than by a
 * vocabulary invented here. A coffee roaster gets Food. A gallery gets Art.
 *
 * Usage:
 *   npx tsx scripts/seed-real-events.ts
 *   npx tsx scripts/seed-real-events.ts --undo
 *   SEED_ALLOW_REMOTE=1 npx tsx scripts/seed-real-events.ts --yes
 *
 * Options:
 *   --undo              remove every demo_ev_ row and its RSVPs
 *   --yes               skip the confirmation pause
 *   SEED_EVENTS_HOSTS   how many hosts to use (default 16)
 */

import { config } from 'dotenv';

config({ path: '.env.local' });

/** Ids and slugs start with these so --undo is exact. */
const EVENT_PREFIX = 'demo_ev_';
const SLUG_PREFIX = 'demo-ev-';

/** Two events per host, which is also the lane floor in lib/events/lanes.ts.
 *  One each would leave a subject rail with a single card, and a rail under
 *  two silently does not render — the failure that looks like a design
 *  problem rather than a data one. */
const PER_HOST = 2;

/** Default host count. CANDIDATE_LIMIT in discovery.ts is 60, so 16 hosts at
 *  two events apiece fills the page without burying whatever real events
 *  exist underneath a wall of samples. */
const DEFAULT_HOSTS = 16;

/** Said in the description of every event this writes. Deliberately plain:
 *  somebody who clicks through should not have to infer it. */
const SAMPLE_NOTICE =
  'Sample event added for the Pana Mía preview. This is not a real event — ' +
  'nothing is scheduled and no RSVP is needed.';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MINUTE = 60 * 1000;

/**
 * When the samples land, in order.
 *
 * Spread across the windows the "I'm free" filter offers, because a seed that
 * put everything three weeks out would leave Tonight and This weekend empty
 * and make a working filter look broken. Fixed rather than random so a second
 * run upserts the same rows instead of scattering duplicates.
 *
 * `hour` is a time of day, not a duration from now. The first version of this
 * added plain offsets to Date.now(), so every sample inherited the minute the
 * script happened to run and the whole page read "11:49 PM" — which is both
 * implausible for a print studio and a tell that the data is generated. Real
 * events start on the hour or the half hour.
 *
 * The two `soon` entries stay relative because they are the ones keeping
 * Tonight populated, and a fixed evening hour is already in the past if the
 * seeder runs after it. They round up to the next half hour so they read like
 * a time somebody chose.
 */
type Slot = { soon: number } | { days: number; hour: number };

const SLOTS: Slot[] = [
  { soon: 3 * HOUR },
  { soon: 5 * HOUR },
  { days: 1, hour: 19 },
  { days: 2, hour: 18.5 },
  { days: 3, hour: 11 },
  { days: 4, hour: 20 },
  { days: 6, hour: 10.5 },
  { days: 8, hour: 19 },
  { days: 11, hour: 18 },
  { days: 14, hour: 12 },
  { days: 17, hour: 19.5 },
  { days: 21, hour: 15 },
];

/** Resolves a slot against the run clock, never returning a past time. */
function startFor(slot: Slot, now: Date): Date {
  if ('soon' in slot) {
    const t = now.getTime() + slot.soon;
    return new Date(Math.ceil(t / (30 * MINUTE)) * (30 * MINUTE));
  }

  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  const start = new Date(midnight.getTime() + slot.days * DAY);
  start.setHours(Math.floor(slot.hour), (slot.hour % 1) * 60, 0, 0);

  /* A whole week rather than a day: the slots are spread to land on different
     weekdays, and nudging one forward by a day would collapse two of them onto
     the same evening. */
  return start.getTime() <= now.getTime() + HOUR
    ? new Date(start.getTime() + 7 * DAY)
    : start;
}

/**
 * What each directory category plausibly puts on, and how it tags it.
 *
 * `tags` are chosen to match EVENT_CATEGORIES in lib/events/lanes.ts, which is
 * what lands these in the subject rails. Keeping the mapping here rather than
 * in lanes.ts keeps that file import-free and keeps this file the only place
 * that knows the directory's vocabulary.
 */
const BY_CATEGORY: Record<
  string,
  { titles: string[]; tags: string[]; blurb: string }
> = {
  food: {
    titles: [
      'Supper Club',
      'Tasting Night',
      'Cafecito Hour',
      'Kitchen Takeover',
      'Sunday Brunch Session',
    ],
    tags: ['food', 'dinner', 'tasting'],
    blurb: 'An evening built around a long table and whatever is good today.',
  },
  music: {
    titles: [
      'Live Set',
      'Open Mic Night',
      'Vinyl Session',
      'Backyard Sound System',
      'Late Set',
    ],
    tags: ['music', 'livemusic', 'dj'],
    blurb: 'A short bill, a loud room, and nobody on after midnight.',
  },
  art: {
    titles: [
      'Zine Workshop',
      'Open Studio',
      'Gallery Night',
      'Print Session',
      'Drawing Night',
    ],
    tags: ['art', 'zines', 'workshop'],
    blurb: 'Bring hands. Materials are on the table and so is everyone else.',
  },
  artisanal: {
    titles: [
      'Makers Market',
      'Craft Table',
      'Weekend Pop-Up',
      'Studio Sale',
      'Small Batch Market',
    ],
    tags: ['market', 'makers', 'craft'],
    blurb: 'Everything on the table was made by whoever is standing behind it.',
  },
  products: {
    titles: [
      'Weekend Pop-Up',
      'Launch Night',
      'Market Stall',
      'Sample Sale',
      'Restock Party',
    ],
    tags: ['market', 'popup', 'shop'],
    blurb: 'A short pop-up, and the people who made the thing are there.',
  },
  apparel: {
    titles: [
      'Pop-Up Shop',
      'Swap Meet',
      'Mending Night',
      'Studio Sale',
      'Fitting Session',
    ],
    tags: ['market', 'swap', 'popup'],
    blurb: 'Rails out, prices fair, and somebody on hand who can take a hem.',
  },
  services: {
    titles: [
      'Office Hours',
      'Beginners Workshop',
      'Skillshare Session',
      'Q&A Night',
      'Clinic',
    ],
    tags: ['workshop', 'skillshare', 'learn'],
    blurb:
      'An hour of being asked anything, by whoever does this for a living.',
  },
  tech: {
    titles: [
      'Repair Café',
      'Build Night',
      'Code Jam',
      'Fix-It Session',
      'Demo Night',
    ],
    tags: ['tech', 'repair', 'maker'],
    blurb: 'Bring the broken thing. Somebody here has opened one before.',
  },
  wellness: {
    titles: [
      'Morning Movement',
      'Sound Bath',
      'Slow Flow',
      'Breathwork Session',
      'Evening Reset',
    ],
    tags: ['wellness', 'movement', 'yoga'],
    blurb: 'Come as you are. No experience assumed and nobody watching.',
  },
  non_profit: {
    titles: [
      'Volunteer Morning',
      'Community Hang',
      'Mutual Aid Drop-Off',
      'Fundraiser',
      'Organising Meeting',
    ],
    tags: ['community', 'volunteer', 'mutualaid'],
    blurb: 'Hands needed more than money, though both are welcome.',
  },
  Venue: {
    titles: [
      'Open House',
      'Community Hang',
      'Friday Session',
      'Doors Open',
      'House Night',
    ],
    tags: ['community', 'social', 'music'],
    blurb: 'The room is open and something is on. Come and see what.',
  },
};

/** Hosts whose categories we cannot read fall back to this, rather than being
 *  dropped. A listing with a blank category column is still a real business
 *  and still belongs in the demo. */
const FALLBACK = 'Venue';

function line(label: string, value: string | number): void {
  console.log(`  ${label.padEnd(34)} ${value}`);
}

function slugify(value: string | null | undefined): string {
  return (
    (value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'pana'
  );
}

const USAGE = `
Seed sample events attributed to real directory listings and groups.

  --undo      remove every row a previous run added, and nothing else
  --dry-run   print the hosts and counts, write nothing
  --yes       skip the pre-flight pause
  --help      print this

Writing to anything but localhost also needs SEED_ALLOW_REMOTE=1.
`.trim();

async function main(): Promise<void> {
  // An unrecognised flag is rejected rather than ignored. The reversal here is
  // a flag, so silence would mean a mistyped --undo quietly writes instead of
  // removing -- the one outcome this script is built to never have.
  const flags = process.argv.slice(2);
  const known = new Set(['--undo', '--yes', '--dry-run', '--help']);
  const unknown = flags.filter((flag) => !known.has(flag));
  if (unknown.length > 0) {
    console.error(`Unrecognised: ${unknown.join(', ')}\n\n${USAGE}`);
    process.exit(1);
  }
  if (flags.includes('--help')) {
    console.log(USAGE);
    return;
  }

  const undo = flags.includes('--undo');
  const skipPause = flags.includes('--yes');
  const dryRun = flags.includes('--dry-run');

  /* --undo deletes, and it runs long before the dry-run stop below, so the
     pair would read as "preview an undo" while actually performing one --
     and --dry-run relaxes the remote gate, so it would perform it against
     production unarmed. Rejected rather than resolved: there is no reading
     of these two together that a caller would be right to expect. */
  if (undo && dryRun) {
    console.error('--undo and --dry-run do opposite things. Pick one.');
    process.exit(1);
  }

  const connectionString =
    process.env.POSTGRES_URL ?? process.env.POSTGRES_DIRECT_URL;
  if (!connectionString) {
    console.error('Error: POSTGRES_URL is required (check .env.local)');
    process.exit(1);
  }
  process.env.POSTGRES_URL = connectionString;

  const target = connectionString.replace(/\/\/[^@]*@/, '//***@').split('?')[0];
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  /* A dry run reads and reports; it never writes, so the gate would only add
     friction to the one mode you want people using *before* they arm the
     write. Requiring the flag to preview teaches you to set it early and
     leave it set, which is the opposite of what it is for. */
  if (!isLocal && !dryRun && process.env.SEED_ALLOW_REMOTE !== '1') {
    console.error('Refusing to run against a remote database by default.');
    console.error('Database:', target);
    console.error(
      '\nThis script writes events attributed to REAL listings and groups.\n' +
        'Preview it first with --dry-run, which needs no flag and writes\n' +
        'nothing. Then set SEED_ALLOW_REMOTE=1 if this is the database you\n' +
        'mean, and run with --undo afterwards to remove every row it added.'
    );
    process.exit(1);
  }

  /* Supabase exposes two ports on the pooler host, and 6543 is the
     transaction pooler, which rewrites session state between statements and
     so rejects the extended protocol's prepared statements. The Node path in
     lib/db.ts calls postgres() without `prepare: false`, so a 6543 URL fails
     on the first read with a protocol error that reads like a driver bug
     rather than a wrong port. scripts/check-pending-migrations.ts guards the
     same mistake for the same reason; this is that guard, here. */
  const port = (() => {
    try {
      return new URL(connectionString).port;
    } catch {
      return '';
    }
  })();
  if (port === '6543') {
    console.error('That is Supabase\u2019s transaction pooler (port 6543).');
    console.error('Database:', target);
    console.error(
      '\nIt rejects prepared statements, which this script uses. Use the\n' +
        'session pooler on port 5432 instead — same host, different port.'
    );
    process.exit(1);
  }

  // Deferred for the same reason scripts/seed-demo.ts defers: modules under
  // lib/federation read NEXT_PUBLIC_HOST_URL at import time.
  const [{ db }, schema, { categoryKeys }] = await Promise.all([
    import('../lib/db'),
    import('../lib/schema'),
    import('../lib/server/directory'),
  ]);
  const { eq, and, inArray, asc, sql } = await import('drizzle-orm');

  /* starts_with rather than LIKE 'demo_ev_%'. In LIKE, `_` is a
     single-character wildcard, so that pattern would also match an id like
     "demoXevY..." — the same trap scripts/unseed.ts documents. Nothing looks
     like that today, which is precisely why it would be a quiet one. */
  const isDemoEvent = sql`starts_with(${schema.events.id}, ${EVENT_PREFIX})`;

  console.log(undo ? 'DEMO:real-events:undo' : 'DEMO:real-events:start');
  console.log('Database:', target, '\n');

  /** Removes every demo event and the rows that depend on it. */
  const clearDemo = async (): Promise<number> => {
    const doomed = await db.query.events.findMany({
      where: isDemoEvent,
      columns: { id: true },
    });
    const ids = doomed.map((row) => row.id);
    if (ids.length === 0) return 0;

    // RSVPs and dismissals first. Somebody may well have pressed Going on a
    // sample during the demo, and the FK would otherwise block the delete
    // with an error that reads like corruption.
    const rsvps = await db
      .delete(schema.eventAttendees)
      .where(inArray(schema.eventAttendees.eventId, ids))
      .returning({ id: schema.eventAttendees.id });
    line('RSVPs removed', rsvps.length);

    const dismissals = await db
      .delete(schema.eventDismissals)
      .where(inArray(schema.eventDismissals.eventId, ids))
      .returning({ id: schema.eventDismissals.id });
    line('dismissals removed', dismissals.length);

    const removed = await db
      .delete(schema.events)
      .where(isDemoEvent)
      .returning({ id: schema.events.id });
    line('events removed', removed.length);
    return removed.length;
  };

  // ------------------------------------------------------------------ undo --
  if (undo) {
    const found = await db.query.events.findMany({
      where: isDemoEvent,
      columns: { id: true },
    });
    line('demo events found', found.length);

    if (found.length === 0) {
      console.log('\nNothing to remove.');
      process.exit(0);
    }

    await clearDemo();

    console.log('\nDone. Nothing with a demo_ev_ prefix remains.');
    process.exit(0);
  }

  // ----------------------------------------------------------------- hosts --
  const wanted = Number(process.env.SEED_EVENTS_HOSTS ?? DEFAULT_HOSTS);
  if (!Number.isFinite(wanted) || wanted < 1) {
    console.error('Error: SEED_EVENTS_HOSTS must be a positive number.');
    process.exit(1);
  }

  /* Sequential rather than Promise.all. The local PGlite shim shares one
     connection and loses the unnamed prepared statement when two queries are
     in flight at once, failing with "unnamed prepared statement does not
     exist". Two reads are not worth a seeder that only runs on real Postgres. */
  const listings = await db.query.profiles.findMany({
    where: eq(schema.profiles.active, true),
    columns: { id: true, name: true, categories: true },
    orderBy: [asc(schema.profiles.id)],
  });
  /* A group's name is not on social_groups — the row is only the group half of
     an actor, and the display name lives on social_actors. `topics` is on the
     group itself, and is the nearest thing a group has to a directory
     category. */
  const groups = await db
    .select({
      id: schema.socialGroups.id,
      name: schema.socialActors.name,
      /* Always present and unique, where name is nullable. A group showing as
         its handle is ordinary; a group showing as "A group" is a bug the
         demo would put on screen. */
      username: schema.socialActors.username,
      topics: schema.socialGroups.topics,
    })
    .from(schema.socialGroups)
    .innerJoin(
      schema.socialActors,
      eq(schema.socialActors.id, schema.socialGroups.actorId)
    )
    .orderBy(asc(schema.socialGroups.id));

  console.log('Source');
  line('active listings', listings.length);
  line('groups', groups.length);

  if (listings.length + groups.length === 0) {
    console.error(
      '\nNo active listings or groups to host anything. Seed the directory first.'
    );
    process.exit(1);
  }

  type Host = {
    key: string;
    name: string;
    profileId: string | null;
    groupId: string | null;
    category: string;
  };

  /* Real listings and groups are not evenly spread across categories — a
     directory heavy on food would otherwise produce one enormous Food rail
     and nothing else, which demos the data rather than the design. Bucketing
     by category and then taking one from each in turn spreads the samples so
     every rail that can exist does. */
  const byCategory = new Map<string, Host[]>();
  function push(host: Host): void {
    const bucket = byCategory.get(host.category);
    if (bucket) bucket.push(host);
    else byCategory.set(host.category, [host]);
  }

  for (const listing of listings) {
    if (listing.id.startsWith('seed_p_')) continue;
    const keys = categoryKeys(listing.categories).filter(
      (key) => key in BY_CATEGORY
    );
    push({
      // The id tail keeps the key unique: two real businesses can share a
      // name, and without it the second would upsert over the first and
      // quietly halve the demo. Stable across runs, so re-running updates
      // rather than duplicates.
      key: `${slugify(listing.name)}-${listing.id.slice(-6)}`,
      name: listing.name?.trim() || 'A pana',
      profileId: listing.id,
      groupId: null,
      category: keys[0] ?? FALLBACK,
    });
  }

  for (const group of groups) {
    /* A group is a club rather than a trade, so community is the right
       default. Topics are checked first because a group that says what it is
       about should land in that subject's rail rather than all of them being
       filed together. */
    const topic = Object.entries(group.topics ?? {})
      .filter(([, on]) => on)
      .map(([key]) => key.toLowerCase().trim())
      .find((key) => key in BY_CATEGORY);

    const label = group.name?.trim() || group.username;

    push({
      key: `${slugify(label)}-${group.id.slice(-6)}`,
      name: label,
      profileId: null,
      groupId: group.id,
      category: topic ?? 'non_profit',
    });
  }

  const queues = [...byCategory.entries()].map(([category, hosts]) => ({
    category,
    hosts,
  }));
  const chosen: Host[] = [];
  for (let round = 0; chosen.length < wanted; round += 1) {
    const before = chosen.length;
    for (const queue of queues) {
      if (chosen.length >= wanted) break;
      const host = queue.hosts[round];
      if (host) chosen.push(host);
    }
    if (chosen.length === before) break;
  }

  line('hosts selected', chosen.length);
  line('events to write', chosen.length * PER_HOST);
  console.log('\n  Categories covered');
  for (const queue of queues) {
    const used = chosen.filter((h) => h.category === queue.category).length;
    if (used) line(`    ${queue.category}`, `${used} host(s)`);
  }

  // ------------------------------------------------------------- pre-flight --
  const realBusinesses = chosen.filter((h) => h.profileId).length;
  const realGroups = chosen.filter((h) => h.groupId).length;

  console.log('\n' + '-'.repeat(68));
  console.log('  This will attribute events to REAL members of the directory.');
  console.log(
    `  ${realBusinesses} business listing(s) and ${realGroups} group(s)`
  );
  console.log('  will each appear to be hosting 2 events they did not create.');
  console.log('');
  console.log('  Every description says it is a sample. Every id starts with');
  console.log('  demo_ev_, so `--undo` removes all of it exactly.');
  console.log('-'.repeat(68));

  if (dryRun) {
    /* The roster is the thing worth reviewing, and it is the one thing the
       counts above do not tell you: two businesses is fine, *which* two is
       the question. Printed here rather than on every run because this is
       the mode whose whole purpose is reading before writing. */
    console.log('\n  Hosts that would be used');
    for (const host of chosen) {
      const kind = host.profileId ? 'listing' : 'group';
      line(`    ${host.name}`, `${kind} · ${host.category}`);
    }
    console.log('\nDry run. Nothing was written, nothing was removed.');
    process.exit(0);
  }

  if (!skipPause) {
    console.log('\n  Starting in 5 seconds. Ctrl-C to stop.');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // ---------------------------------------------------------------- events --
  console.log('\nEvents');

  /* Clear before writing rather than relying on upsert alone. Ids are derived
     from host names, so any change to how a key is built orphans the previous
     run's rows instead of replacing them — they are still demo_ev_ and still
     on the page, just no longer written by anything. Deleting first makes a
     run land on exactly the set it reports. */
  await clearDemo();

  const now = Date.now();
  type EventRow = typeof schema.events.$inferInsert;

  let written = 0;
  let index = 0;
  /* The id tail keeps ids unique, but it is noise in a URL somebody sees.
     Slugs get the clean name and only fall back to the tail if another host
     already took it, so the common case reads properly and the rare collision
     still inserts. */
  const usedSlugs = new Set<string>();

  for (const host of chosen) {
    const template = BY_CATEGORY[host.category] ?? BY_CATEGORY[FALLBACK];
    const pretty = slugify(host.name);

    for (let n = 0; n < PER_HOST; n += 1) {
      const id = `${EVENT_PREFIX}${host.key}_${n}`.slice(0, 60);
      const title = template.titles[(index + n) % template.titles.length];
      const startsAt = startFor(SLOTS[index % SLOTS.length], new Date(now));

      let slug = `${SLUG_PREFIX}${pretty}-${n}`;
      if (usedSlugs.has(slug)) slug = `${SLUG_PREFIX}${host.key}-${n}`;
      usedSlugs.add(slug);

      const row: EventRow = {
        id,
        slug: slug.slice(0, 60),
        title,
        description: `${template.blurb}\n\n${SAMPLE_NOTICE}`,
        hostProfileId: host.profileId,
        hostGroupId: host.groupId,
        // No venue, on purpose. Attaching a real room to an event its owner
        // never agreed to hold would be a second person misrepresented for
        // the sake of a tidier card. The page says "Location to be announced"
        // for a venueless offline event, which is true here.
        venueId: null,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * HOUR),
        timezone: 'America/New_York',
        status: 'published',
        visibility: 'public',
        mode: 'offline',
        attendeeCap: null,
        attendeeCount: 0,
        icalUid: `${id}@events.panamia.club`,
        tags: template.tags,
      };

      await db
        .insert(schema.events)
        .values(row)
        .onConflictDoUpdate({ target: schema.events.id, set: row });
      written += 1;
      index += 1;
    }
  }

  line('written', written);

  // ---------------------------------------------------------------- verify --
  /* A subject rail needs two events or it silently does not render, so the
     counts below are the preconditions for the page, read back from the rows
     actually written rather than from what we meant to write. */
  const live = await db.query.events.findMany({
    where: and(
      eq(schema.events.status, 'published'),
      eq(schema.events.visibility, 'public')
    ),
    columns: { id: true, tags: true, startsAt: true },
  });
  const upcoming = live.filter((e) => e.startsAt.getTime() >= now);

  const { categoriesFor, EVENT_CATEGORIES, RAIL_FLOOR } =
    await import('../lib/events/lanes');

  const perCategory = new Map<string, number>();
  for (const event of upcoming) {
    for (const category of categoriesFor(event)) {
      perCategory.set(category.id, (perCategory.get(category.id) ?? 0) + 1);
    }
  }

  // Floor imported rather than restated, so this cannot quietly disagree with
  // the page about what counts as a rail.
  const willRender = EVENT_CATEGORIES.filter(
    (category) => (perCategory.get(category.id) ?? 0) >= RAIL_FLOOR
  );

  console.log('\nVerify');
  line('published & upcoming', upcoming.length);
  line('subjects over the floor', willRender.length);
  for (const category of willRender) {
    line(`  ${category.title}`, perCategory.get(category.id) ?? 0);
  }

  if (willRender.length === 0) {
    console.error(
      `\nNo subject reached ${RAIL_FLOOR} events. The page will render, but flat.`
    );
  }

  console.log('\nDone. Undo with:');
  console.log('  npx tsx scripts/seed-real-events.ts --undo');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
