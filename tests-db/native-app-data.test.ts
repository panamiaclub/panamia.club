import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';

const pg = new PGlite({ extensions: { unaccent } });
const db = drizzle(pg, { schema });
let viewer: string | null = 'one';
let discoveryViewer: string | null | undefined;
let failDiscovery = false;
const profiles: Record<string, string> = { one: 'p-one', two: 'p-two' };
mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    auth: async () => (viewer ? { user: { id: viewer } } : null),
  },
});
mock.module(import.meta.resolve('../lib/server/active-profile.ts'), {
  namedExports: {
    getActiveProfileId: async (id: string) => profiles[id] ?? null,
    getActiveProfileWithActor: async (id: string) =>
      profiles[id]
        ? { id: profiles[id], socialActor: { id: `actor-${profiles[id]}` } }
        : null,
  },
});
mock.module(import.meta.resolve('../lib/events/discovery.ts'), {
  namedExports: {
    getDiscoveryFeed: async (profileId: string | null) => {
      discoveryViewer = profileId;
      if (failDiscovery) throw new Error('Isolated recommendation failure');
      return { events: [], dismissedIds: [] };
    },
  },
});

let bookmarks: typeof import('../lib/events/bookmarks');
let saveRoute: typeof import('../app/api/events/[slug]/save/route');
let savedRoute: typeof import('../app/api/social/actors/me/saved-events/route');
let eventRoute: typeof import('../app/api/events/route');
let groupRoute: typeof import('../app/api/social/actors/me/groups/route');
let discoveryRoute: typeof import('../app/api/discover/events/route');
let NextRequest: typeof import('next/server').NextRequest;

before(async () => {
  for (const table of [
    schema.profiles,
    schema.venues,
    schema.events,
    schema.eventAttendees,
    schema.socialActors,
    schema.socialGroups,
    schema.socialGroupMembers,
    schema.socialStatuses,
  ]) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map(
      (column) =>
        `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`
    );
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(', ')})`);
  }
  await pg.exec('CREATE EXTENSION IF NOT EXISTS unaccent');
  const searchMigration = await readFile(
    new URL('../drizzle/0040_profile_search_vector.sql', import.meta.url),
    'utf8'
  );
  const unaccentFunction = searchMigration
    .split('--> statement-breakpoint')
    .find((statement) =>
      statement.includes('CREATE OR REPLACE FUNCTION pana_unaccent')
    );
  assert.ok(unaccentFunction);
  await pg.exec(unaccentFunction);
  await pg.exec(`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('simple', pana_unaccent(coalesce(title, '') || ' ' || coalesce(description, '')))) STORED;
  `);
  await pg.exec(
    await readFile(
      new URL('../drizzle/0073_event_bookmarks.sql', import.meta.url),
      'utf8'
    )
  );
  bookmarks = await import('../lib/events/bookmarks');
  saveRoute = await import('../app/api/events/[slug]/save/route');
  savedRoute = await import('../app/api/social/actors/me/saved-events/route');
  eventRoute = await import('../app/api/events/route');
  groupRoute = await import('../app/api/social/actors/me/groups/route');
  discoveryRoute = await import('../app/api/discover/events/route');
  ({ NextRequest } = await import('next/server'));
});

beforeEach(async () => {
  await pg.exec(
    'TRUNCATE event_bookmarks, event_attendees, events, venues, profiles, social_group_members, social_groups, social_actors, social_statuses CASCADE'
  );
  viewer = 'one';
  failDiscovery = false;
  discoveryViewer = undefined;
  await pg.exec(`
    INSERT INTO profiles (id, user_id, name) VALUES
      ('p-one', 'one', 'One'), ('p-two', 'two', 'Two'), ('host', 'host', 'Host');
    INSERT INTO venues (id, name, city, state, slug, lat, lng, operator_profile_id)
      VALUES ('venue', 'Community cafe', 'Miami', 'FL', 'community-cafe', 25.76, -80.19, 'host');
  `);
});

after(async () => {
  await pg.close();
  mock.restoreAll();
});

async function addEvent(
  id: string,
  options: {
    status?: string;
    visibility?: string;
    days?: number;
    title?: string;
  } = {}
) {
  await pg.query(
    `INSERT INTO events
      (id, slug, title, description, starts_at, timezone, mode, status, visibility, attendee_count, venue_id, host_profile_id, tags)
      VALUES ($1, $1, $2, 'Meet the community', $3, 'America/New_York', 'offline', $4, $5, 7, 'venue', 'host', '{}')`,
    [
      id,
      options.title ?? `Coffee ${id}`,
      new Date(Date.now() + (options.days ?? 1) * 86400000).toISOString(),
      options.status ?? 'published',
      options.visibility ?? 'public',
    ]
  );
}

function context(slug: string) {
  return { params: Promise.resolve({ slug }) };
}
function request(path: string, method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
}
async function savedIds() {
  const response = await savedRoute.GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  return body.data.events.map((event: { id: string }) => event.id) as string[];
}

describe('real event bookmark migration, queries and routes', () => {
  it('persists idempotently without creating RSVP rows or changing attendance', async () => {
    await addEvent('coffee');
    for (let retry = 0; retry < 2; retry++) {
      const response = await saveRoute.POST(
        request('/api/events/coffee/save', 'POST'),
        context('coffee')
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        success: true,
        data: { saved: true },
      });
    }
    assert.equal((await db.select().from(schema.eventBookmarks)).length, 1);
    assert.deepEqual(await savedIds(), ['coffee']);
    assert.equal((await db.select().from(schema.eventAttendees)).length, 0);
    assert.equal((await db.query.events.findFirst())?.attendeeCount, 7);
    const response = await saveRoute.DELETE(
      request('/api/events/coffee/save', 'DELETE'),
      context('coffee')
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await savedIds(), []);
    assert.equal((await db.query.events.findFirst())?.attendeeCount, 7);
  });

  it('resolves ownership server-side and ignores forged profile IDs', async () => {
    await addEvent('coffee');
    await saveRoute.POST(
      request('/api/events/coffee/save?profileId=p-two', 'POST', {
        profileId: 'p-two',
      }),
      context('coffee')
    );
    assert.equal(
      (await db.select().from(schema.eventBookmarks))[0].profileId,
      'p-one'
    );
    viewer = 'two';
    assert.deepEqual(await savedIds(), []);
    await saveRoute.DELETE(
      request('/api/events/coffee/save?profileId=p-one', 'DELETE'),
      context('coffee')
    );
    viewer = 'one';
    assert.deepEqual(await savedIds(), ['coffee']);
  });

  it('separates bookmarks by active profile, including independent saves of the same event', async () => {
    await addEvent('coffee');
    await addEvent('music');
    await bookmarks.saveEvent('p-one', 'coffee');
    await bookmarks.saveEvent('p-two', 'coffee');
    await bookmarks.saveEvent('p-two', 'music');
    assert.equal((await db.select().from(schema.eventBookmarks)).length, 3);
    assert.deepEqual(await savedIds(), ['coffee']);
    viewer = 'two';
    assert.deepEqual((await savedIds()).sort(), ['coffee', 'music']);
    await bookmarks.unsaveEvent('p-two', 'coffee');
    viewer = 'one';
    assert.deepEqual(await savedIds(), ['coffee']);
  });

  it('requires authentication, and requires a profile for writes', async () => {
    await addEvent('coffee');
    viewer = null;
    assert.equal(
      (
        await saveRoute.POST(
          request('/api/events/coffee/save', 'POST'),
          context('coffee')
        )
      ).status,
      401
    );
    assert.equal(
      (
        await saveRoute.DELETE(
          request('/api/events/coffee/save', 'DELETE'),
          context('coffee')
        )
      ).status,
      401
    );
    assert.equal((await savedRoute.GET()).status, 401);
    viewer = 'no-profile';
    assert.equal(
      (
        await saveRoute.POST(
          request('/api/events/coffee/save', 'POST'),
          context('coffee')
        )
      ).status,
      403
    );
    assert.deepEqual(await savedIds(), []);
    assert.equal((await db.select().from(schema.eventBookmarks)).length, 0);
  });

  it('keeps known unlisted links and published past events private', async () => {
    await addEvent('unlisted', { visibility: 'unlisted' });
    await addEvent('past', { days: -2 });
    assert.equal(await bookmarks.saveEvent('p-one', 'unlisted'), true);
    assert.equal(await bookmarks.saveEvent('p-one', 'past'), true);
    assert.deepEqual((await savedIds()).sort(), ['past', 'unlisted']);
    const response = await savedRoute.GET();
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const listing = await eventRoute.GET(request('/api/events'));
    assert.deepEqual((await listing.json()).data.events, []);
    viewer = 'two';
    assert.deepEqual(await savedIds(), []);
  });

  it('rejects missing/draft/cancelled saves and hides events cancelled after saving', async () => {
    await addEvent('draft', { status: 'draft' });
    await addEvent('cancelled', { status: 'cancelled' });
    for (const slug of ['missing', 'draft', 'cancelled']) {
      assert.equal(
        (
          await saveRoute.POST(
            request(`/api/events/${slug}/save`, 'POST'),
            context(slug)
          )
        ).status,
        404
      );
    }
    await addEvent('published');
    await bookmarks.saveEvent('p-one', 'published');
    await db
      .update(schema.events)
      .set({ status: 'cancelled' })
      .where(eq(schema.events.id, 'published'));
    assert.deepEqual(await savedIds(), []);
    assert.equal(await bookmarks.unsaveEvent('p-one', 'published'), true);
  });

  it('enforces real foreign-key cascades for removed events and profiles', async () => {
    await addEvent('one');
    await addEvent('two');
    await bookmarks.saveEvent('p-one', 'one');
    await bookmarks.saveEvent('p-one', 'two');
    await bookmarks.saveEvent('p-two', 'two');
    await db.delete(schema.events).where(eq(schema.events.id, 'one'));
    assert.equal((await db.select().from(schema.eventBookmarks)).length, 2);
    await db.delete(schema.profiles).where(eq(schema.profiles.id, 'p-one'));
    const remaining = await db.select().from(schema.eventBookmarks);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].profileId, 'p-two');
  });

  it('returns only the explicitly public venue projection', async () => {
    await addEvent('coffee');
    await bookmarks.saveEvent('p-one', 'coffee');
    const [saved] = await bookmarks.getSavedEvents('p-one');
    assert.ok(saved.venue);
    assert.deepEqual(Object.keys(saved.venue).sort(), [
      'city',
      'lat',
      'lng',
      'name',
      'slug',
      'state',
    ]);
    assert.equal(Number(saved.venue.lat), 25.76);
    assert.equal(Number(saved.venue.lng), -80.19);
    assert.equal('operatorProfileId' in saved.venue, false);
  });
});

describe('live event browsing and community ownership', () => {
  it('searches and paginates future public published events on the server', async () => {
    await addEvent('first', { title: 'Coffee morning', days: 1 });
    await addEvent('second', { title: 'Coffee evening', days: 2 });
    await addEvent('music', { title: 'Music evening', days: 3 });
    await addEvent('private', {
      title: 'Coffee private',
      visibility: 'unlisted',
    });
    await addEvent('draft', { title: 'Coffee draft', status: 'draft' });
    await addEvent('past', { title: 'Coffee past', days: -1 });
    const first = await eventRoute.GET(request('/api/events?q=coffee&limit=1'));
    assert.equal(first.status, 200);
    const a = (await first.json()).data;
    assert.deepEqual(
      a.events.map((row: { id: string }) => row.id),
      ['first']
    );
    assert.equal(a.hasMore, true);
    assert.deepEqual(Object.keys(a.events[0].venue).sort(), [
      'city',
      'lat',
      'lng',
      'name',
      'slug',
      'state',
    ]);
    const second = await eventRoute.GET(
      request('/api/events?q=coffee&limit=1&offset=1')
    );
    const b = (await second.json()).data;
    assert.deepEqual(
      b.events.map((row: { id: string }) => row.id),
      ['second']
    );
    assert.equal(b.hasMore, false);
    const all = await eventRoute.GET(request('/api/events?limit=10'));
    assert.deepEqual(
      (await all.json()).data.events.map((row: { id: string }) => row.id),
      ['first', 'second', 'music']
    );
  });

  it('rejects invalid limits, offsets and overlong terms explicitly', async () => {
    for (const query of [
      'limit=0',
      'limit=101',
      'limit=1.5',
      'limit=NaN',
      'offset=-1',
      'offset=1.5',
      `q=${'x'.repeat(201)}`,
    ]) {
      const response = await eventRoute.GET(request(`/api/events?${query}`));
      assert.equal(response.status, 400, query);
      assert.equal((await response.json()).success, false);
    }
  });

  it('orders tied dates deterministically and folds accents in search terms', async () => {
    await addEvent('b', { title: 'Café gathering' });
    await addEvent('a', { title: 'Café gathering' });
    await pg.exec("UPDATE events SET starts_at = '2100-01-01T12:00:00Z'");
    const first = (
      await (await eventRoute.GET(request('/api/events?q=cafe&limit=1'))).json()
    ).data;
    const second = (
      await (
        await eventRoute.GET(
          request('/api/events?q=caf%C3%A9&limit=1&offset=1')
        )
      ).json()
    ).data;
    assert.equal(first.events[0].id, 'a');
    assert.equal(first.hasMore, true);
    assert.equal(second.events[0].id, 'b');
    assert.equal(second.hasMore, false);
  });

  it('does not turn pending requests into memberships or disclose another member', async () => {
    await pg.exec(`
      INSERT INTO social_actors (id, username, name) VALUES
        ('joined-actor', 'joined', 'Joined'), ('pending-actor', 'pending', 'Pending'), ('other-actor', 'other', 'Other');
      INSERT INTO social_groups (id, actor_id, visibility, join_policy, member_count) VALUES
        ('joined', 'joined-actor', 'private', 'request', 2),
        ('pending', 'pending-actor', 'private', 'request', 3),
        ('other', 'other-actor', 'private', 'request', 4);
      INSERT INTO social_group_members (id, group_id, actor_id, role, status) VALUES
        ('membership', 'joined', 'actor-p-one', 'member', 'active'),
        ('request', 'pending', 'actor-p-one', 'member', 'pending'),
        ('other-request', 'other', 'actor-p-two', 'member', 'pending');
    `);
    const response = await groupRoute.GET();
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const { data } = await response.json();
    assert.deepEqual(
      data.groups.map((row: { id: string }) => row.id),
      ['joined']
    );
    assert.deepEqual(data.pending, [
      { id: 'pending', handle: 'pending', name: 'Pending', iconUrl: null },
    ]);
    assert.equal('postsThisWeek' in data.pending[0], false);
    viewer = 'two';
    const other = (await (await groupRoute.GET()).json()).data;
    assert.deepEqual(other.groups, []);
    assert.deepEqual(
      other.pending.map((row: { id: string }) => row.id),
      ['other']
    );
    viewer = null;
    assert.equal((await groupRoute.GET()).status, 401);
  });

  it('runs discovery for the trusted active profile, with an explicit public mode', async () => {
    const mine = await discoveryRoute.GET();
    assert.equal(discoveryViewer, 'p-one');
    assert.equal(mine.headers.get('Cache-Control'), 'private, no-store');
    assert.equal((await mine.json()).data.signedIn, true);
    viewer = null;
    const guest = await discoveryRoute.GET();
    assert.equal(discoveryViewer, null);
    assert.equal((await guest.json()).data.signedIn, false);
  });

  it('reports discovery failure rather than pretending there are no events', async () => {
    failDiscovery = true;
    const log = mock.method(console, 'error', () => {});
    try {
      const response = await discoveryRoute.GET();
      assert.equal(response.status, 500);
      assert.equal((await response.json()).success, false);
      assert.equal(log.mock.calls.length, 1);
    } finally {
      log.mock.restore();
    }
  });
});
