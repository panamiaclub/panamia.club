import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';
import { opportunityInputSchema } from '@/lib/connectors/opportunities-model';
import type { OpportunityInput } from '@/lib/connectors/opportunities-model';

// All migrations, queries, and route handlers run against this isolated DB.
const pg = new PGlite();
const queries: string[] = [];
const db = drizzle(pg, {
  schema,
  logger: { logQuery: (query) => queries.push(query) },
});
let viewer: string | null = null;
let admin = false;
let host: string | null = 'official-host';
mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    auth: async () =>
      viewer ? { user: { id: viewer, isAdmin: admin } } : null,
  },
});
mock.module(import.meta.resolve('../lib/server/official-host.ts'), {
  namedExports: { officialHostGroupId: async () => host },
});

let opportunities: typeof import('../lib/connectors/opportunities');
let commitments: typeof import('../lib/connectors/commitments');
let memberRoute: typeof import('../app/api/connectors/opportunities/route');
let adminRoute: typeof import('../app/api/admin/connectors/opportunities/route');
let ownRoute: typeof import('../app/api/connectors/commitments/route');
let tasksRoute: typeof import('../app/api/admin/connectors/tasks/route');
let NextRequest: typeof import('next/server').NextRequest;
const details = opportunityInputSchema.parse({
  title: 'Help at the welcome table',
  details: 'Greet people and help them find their pod.',
  house: 'education',
  pod: 'miami',
  when: 'Before the next huddle',
  estimatedMinutes: 90,
  spots: 2,
});

before(async () => {
  await pg.exec(`
    CREATE TABLE users (id text PRIMARY KEY);
    CREATE TABLE profiles (id text PRIMARY KEY, user_id text UNIQUE, name text NOT NULL, screenname text, email text NOT NULL, connector jsonb, primary_image_cdn text);
    CREATE TABLE venues (id text PRIMARY KEY, name text);
    CREATE TABLE events (id text PRIMARY KEY, title text, starts_at timestamptz, status text, host_group_id text, venue_id text);
  `);
  for (const name of [
    '0056_connector_commitments',
    '0057_connector_events',
    '0060_commitment_hours',
    '0061_commitment_event',
    '0071_connector_opportunities',
  ]) {
    await pg.exec(
      await readFile(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8')
    );
  }
  opportunities = await import('../lib/connectors/opportunities');
  commitments = await import('../lib/connectors/commitments');
  memberRoute = await import('../app/api/connectors/opportunities/route');
  adminRoute = await import('../app/api/admin/connectors/opportunities/route');
  ownRoute = await import('../app/api/connectors/commitments/route');
  tasksRoute = await import('../app/api/admin/connectors/tasks/route');
  ({ NextRequest } = await import('next/server'));
});

beforeEach(async () => {
  await pg.exec(
    'TRUNCATE connector_commitments, connector_opportunities, connector_events, events, profiles, users CASCADE'
  );
  viewer = 'member';
  admin = false;
  host = 'official-host';
  queries.length = 0;
  for (const [id, status] of [
    ['member', 'active'],
    ['other', 'active'],
    ['third', 'active'],
    ['pending', 'pending'],
    ['declined', 'declined'],
    ['inactive', 'inactive'],
    ['staff', null],
    ['none', null],
  ]) {
    await pg.query('INSERT INTO users (id) VALUES ($1)', [id]);
    const connector = status
      ? {
          status,
          houses: ['education'],
          pod: 'miami',
          tier: 1,
          bring: '',
          appliedAt: '2026-01-01',
          offboardReason: 'INTERNAL STAFF NOTE',
        }
      : null;
    await pg.query(
      'INSERT INTO profiles (id, user_id, name, screenname, email, connector) VALUES ($1, $2, $3, $2, $4, $5)',
      [
        `p-${id}`,
        id,
        `Name ${id}`,
        `${id}@example.invalid`,
        connector === null ? null : JSON.stringify(connector),
      ]
    );
  }
});

after(async () => {
  await pg.close();
  mock.restoreAll();
});

function request(path: string, method: string, body?: unknown) {
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
async function publish(patch: Partial<OpportunityInput> = {}) {
  const result = await opportunities.saveOpportunity(
    { ...details, ...patch },
    'staff'
  );
  assert.ok(result.ok);
  return result.data.id;
}
async function join(id: string, user = 'member') {
  const result = await opportunities.joinOpportunity(user, id);
  assert.ok(result.ok, JSON.stringify(result));
  return result.data.commitmentId;
}
async function programme(id = 'huddle') {
  await pg.query(
    'INSERT INTO connector_events (id, title, starts_at, volunteers_needed) VALUES ($1, $2, $3, 2)',
    [id, `Gathering ${id}`, new Date(Date.now() + 86400000).toISOString()]
  );
  return `programme:${id}`;
}
async function publicEvent(
  id = 'official',
  hostId = 'official-host',
  status = 'published'
) {
  await pg.query(
    'INSERT INTO events (id, title, starts_at, status, host_group_id) VALUES ($1, $2, $3, $4, $5)',
    [
      id,
      `Event ${id}`,
      new Date(Date.now() + 86400000).toISOString(),
      status,
      hostId,
    ]
  );
  return `public:${id}`;
}

describe('opportunity migration and shared work', () => {
  it('publishes real data with no fixture import and no creator or crew identity in HQ results', async () => {
    assert.deepEqual(await opportunities.listOpportunities(), []);
    const id = await publish();
    await join(id);
    const [row] = await opportunities.listOpportunities();
    assert.equal(row.id, id);
    assert.equal(row.signups, 1);
    assert.equal(row.eventAvailable, true);
    assert.equal(row.title, details.title);
    assert.equal(row.estimatedMinutes, 90);
    assert.equal('createdBy' in row, false);
    assert.equal('profileId' in row, false);
    assert.equal(JSON.stringify(row).includes('INTERNAL STAFF NOTE'), false);
    assert.deepEqual(await opportunities.listOpportunityCrew(), [
      {
        opportunityId: id,
        profileId: 'p-member',
        displayName: 'Name member',
        progress: 'notSet',
      },
    ]);
  });

  it('creates one ordinary commitment and shares its estimate and source with both views', async () => {
    const id = await publish();
    const commitmentId = await join(id);
    const [personal] = await commitments.listCommitments('p-member');
    const [staff] = await commitments.listOpenCommitments(null, true);
    assert.equal(personal.id, commitmentId);
    assert.equal(personal.opportunityId, id);
    assert.equal(personal.what, details.title);
    assert.equal(personal.when, details.when);
    assert.equal(personal.assignedBy, null);
    assert.equal(personal.estimatedMinutes, 90);
    assert.equal(staff.id, personal.id);
    assert.equal(staff.ownerName, 'Name member');
    assert.deepEqual((await commitments.connectorLoads()).get('p-member'), {
      open: 1,
      estimatedMinutes: 90,
      unestimated: 0,
    });
  });

  it('makes duplicate retries idempotent, even after a crew fills or the request closes', async () => {
    const id = await publish({ spots: 1 });
    const commitmentId = await join(id);
    await opportunities.setOpportunityClosed(id, true);
    const again = await opportunities.joinOpportunity('member', id);
    assert.deepEqual(again, {
      ok: true,
      data: { commitmentId, created: false },
    });
    assert.equal((await commitments.listCommitments('p-member')).length, 1);
    assert.equal((await opportunities.listOpportunities())[0].signups, 1);
  });

  it('offers the final spot once and reads counts after acquiring the opportunity lock', async () => {
    const id = await publish({ spots: 1 });
    queries.length = 0;
    const first = await opportunities.joinOpportunity('member', id);
    const next = await opportunities.joinOpportunity('other', id);
    assert.ok(first.ok);
    assert.equal(next.ok, false);
    if (!next.ok) assert.equal(next.status, 409);
    assert.equal((await opportunities.listOpportunities())[0].signups, 1);
    const lock = queries.findIndex((query) =>
      /from "connector_opportunities".*for update/i.test(query)
    );
    const count = queries.findIndex((query) =>
      /count\(\*\).*from "connector_commitments".*"opportunity_id"/i.test(query)
    );
    assert.ok(lock >= 0 && count > lock);
  });

  it('completion reduces load but keeps a crew place; releasing reopens it', async () => {
    const id = await publish({ spots: 1, event: await programme() });
    const commitmentId = await join(id);
    assert.equal(
      await commitments.setCommitmentProgress('p-member', commitmentId, 'done'),
      true
    );
    assert.equal((await commitments.connectorLoads()).has('p-member'), false);
    assert.equal(
      (await commitments.eventStaffing('programme', ['huddle'])).has('huddle'),
      false
    );
    assert.equal((await opportunities.listOpportunities())[0].signups, 1);
    assert.equal(
      (await opportunities.listOpportunityCrew())[0].progress,
      'done'
    );
    assert.equal((await opportunities.joinOpportunity('other', id)).ok, false);
    assert.equal(
      await commitments.removeOwnCommitment('p-member', commitmentId),
      true
    );
    await join(id, 'other');
    assert.equal(
      (await opportunities.listOpportunityCrew())[0].profileId,
      'p-other'
    );
  });

  it('allows unlimited invitations and keeps unknown estimates out of summed hours, not out of counts', async () => {
    const id = await publish({ spots: null, estimatedMinutes: null });
    await join(id);
    await join(id, 'other');
    await join(id, 'third');
    assert.equal((await opportunities.listOpportunities())[0].spots, null);
    assert.equal((await opportunities.listOpportunities())[0].signups, 3);
    assert.deepEqual((await commitments.connectorLoads()).get('p-member'), {
      open: 1,
      estimatedMinutes: 0,
      unestimated: 1,
    });
  });

  it('soft closing preserves work and prevents new signups until reopened', async () => {
    const id = await publish();
    await join(id);
    assert.ok((await opportunities.setOpportunityClosed(id, true)).ok);
    assert.equal((await opportunities.joinOpportunity('other', id)).ok, false);
    assert.equal((await commitments.listCommitments('p-member')).length, 1);
    assert.ok((await opportunities.setOpportunityClosed(id, false)).ok);
    await join(id, 'other');
  });

  it('protects existing crew targets and event links, while retaining agreed commitment text on edits', async () => {
    const event = await programme();
    const id = await publish({ event });
    await join(id);
    await join(id, 'other');
    const smaller = await opportunities.saveOpportunity(
      { ...details, event, spots: 1 },
      'staff',
      id
    );
    assert.equal(smaller.ok, false);
    const relink = await opportunities.saveOpportunity(
      { ...details, event: null },
      'staff',
      id
    );
    assert.equal(relink.ok, false);
    assert.ok(
      (
        await opportunities.saveOpportunity(
          { ...details, event, title: 'Updated request', spots: 3 },
          'staff',
          id
        )
      ).ok
    );
    assert.equal(
      (await opportunities.listOpportunities())[0].title,
      'Updated request'
    );
    assert.equal(
      (await commitments.listCommitments('p-member'))[0].what,
      details.title
    );
    await join(id, 'third');
    assert.equal(
      (await commitments.listCommitments('p-third'))[0].what,
      'Updated request'
    );
  });

  it('returns explicit not-found outcomes for removed opportunities', async () => {
    for (const result of [
      await opportunities.joinOpportunity('member', 'missing'),
      await opportunities.setOpportunityClosed('missing', true),
      await opportunities.saveOpportunity(details, 'staff', 'missing'),
    ]) {
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.status, 404);
    }
  });

  it('enforces unique signups and migration checks at the database boundary', async () => {
    const id = await publish();
    await join(id);
    await assert.rejects(
      pg.query(
        'INSERT INTO connector_commitments (id, profile_id, what, house, opportunity_id) VALUES ($1, $2, $3, $4, $5)',
        ['duplicate', 'p-member', 'Again', 'education', id]
      ),
      /unique/i
    );
    for (const [field, value] of [
      ['title', ' '],
      ['details', ' '],
      ['house', 'worldBuilding'],
      ['pod', 'elsewhere'],
      ['spots', 0],
      ['spots', 10000],
      ['estimated_minutes', 0],
      ['estimated_minutes', 6001],
    ] as const) {
      await assert.rejects(
        pg.query(
          `UPDATE connector_opportunities SET "${field}" = $1 WHERE id = $2`,
          [value, id]
        ),
        /check constraint/i
      );
    }
    await programme();
    await publicEvent();
    await assert.rejects(
      pg.query(
        'UPDATE connector_opportunities SET event_id = $1, connector_event_id = $2 WHERE id = $3',
        ['official', 'huddle', id]
      ),
      /check constraint/i
    );
  });

  it('can filter the entire admin history rather than silently dropping work after a preview limit', async () => {
    await pg.exec(
      `INSERT INTO connector_commitments (id, profile_id, what, house, progress) SELECT 'history-' || n, 'p-member', 'Task ' || n, 'education', CASE WHEN n = 1 THEN 'done' ELSE 'notSet' END FROM generate_series(1, 55) n`
    );
    assert.equal((await commitments.listOpenCommitments(40)).length, 40);
    assert.equal(
      (await commitments.listOpenCommitments(null, true)).length,
      55
    );
    assert.equal((await commitments.listOpenCommitments(null)).length, 54);
  });
});

describe('linked event scope and cancellation', () => {
  it('accepts only future official public events and live programme gatherings', async () => {
    await publish({ event: await programme() });
    await publish({ event: await publicEvent() });
    const foreign = await publicEvent('foreign', 'someone-else');
    const draft = await publicEvent('draft', 'official-host', 'draft');
    await pg.query('UPDATE events SET starts_at = $1 WHERE id = $2', [
      '2000-01-01',
      'official',
    ]);
    for (const event of [
      foreign,
      draft,
      'public:official',
      'public:missing',
      'programme:missing',
    ]) {
      const result = await opportunities.saveOpportunity(
        { ...details, event },
        'staff'
      );
      assert.equal(result.ok, false, event);
      if (!result.ok) assert.equal(result.status, 409);
    }
    await pg.exec(
      "UPDATE connector_events SET cancelled_at = now() WHERE id = 'huddle'"
    );
    assert.equal(
      (
        await opportunities.saveOpportunity(
          { ...details, event: 'programme:huddle' },
          'staff'
        )
      ).ok,
      false
    );
  });

  it('rechecks cancellation on signup, marks it unavailable in discovery, and prevents reopening', async () => {
    const id = await publish({ event: await programme() });
    await pg.exec(
      "UPDATE connector_events SET cancelled_at = now() WHERE id = 'huddle'"
    );
    assert.equal((await opportunities.joinOpportunity('member', id)).ok, false);
    assert.equal(
      (await opportunities.listOpportunities())[0].eventAvailable,
      false
    );
    assert.ok((await opportunities.setOpportunityClosed(id, true)).ok);
    assert.equal(
      (await opportunities.setOpportunityClosed(id, false)).ok,
      false
    );
  });

  it('rechecks public publication, host changes and elapsed dates, not just foreign-key existence', async () => {
    const id = await publish({ event: await publicEvent() });
    for (const [field, value] of [
      ['status', 'draft'],
      ['host_group_id', 'someone-else'],
      ['starts_at', '2000-01-01'],
    ] as const) {
      await pg.query(`UPDATE events SET "${field}" = $1 WHERE id = $2`, [
        value,
        'official',
      ]);
      assert.equal(
        (await opportunities.joinOpportunity('member', id)).ok,
        false
      );
      assert.equal(
        (await opportunities.listOpportunities())[0].eventAvailable,
        false
      );
      await pg.query(
        "UPDATE events SET status = 'published', host_group_id = 'official-host', starts_at = $1 WHERE id = 'official'",
        [new Date(Date.now() + 86400000).toISOString()]
      );
    }
  });

  it('fails closed without an official host, while programme gatherings still work', async () => {
    const id = await publish({ event: await publicEvent() });
    host = null;
    assert.equal((await opportunities.joinOpportunity('member', id)).ok, false);
    assert.equal(
      (await opportunities.listOpportunities())[0].eventAvailable,
      false
    );
    await join(await publish({ event: await programme() }));
  });

  it('event deletion removes its ask but preserves personal work history', async () => {
    const id = await publish({ event: await programme() });
    await join(id);
    await pg.exec("DELETE FROM connector_events WHERE id = 'huddle'");
    assert.deepEqual(await opportunities.listOpportunities(), []);
    const [work] = await commitments.listCommitments('p-member');
    assert.equal(work.what, details.title);
    assert.equal(work.opportunityId, null);
    assert.equal(work.connectorEventId, null);
  });
});

describe('real opportunity and commitment API handlers', () => {
  it('keeps signup for signed-in active connectors only', async () => {
    const id = await publish();
    for (const [user, status] of [
      [null, 401],
      ['pending', 403],
      ['declined', 403],
      ['inactive', 403],
      ['none', 403],
      ['unknown-account', 403],
    ] as const) {
      viewer = user;
      assert.equal(
        (
          await memberRoute.POST(
            request('/api/connectors/opportunities', 'POST', { id })
          )
        ).status,
        status
      );
    }
    assert.deepEqual(await opportunities.listOpportunityCrew(), []);
  });

  it('gates staff publishing, editing and closing using the existing general admin role', async () => {
    const id = await publish();
    for (const user of [null, 'member', 'pending']) {
      viewer = user;
      admin = false;
      assert.equal(
        (
          await adminRoute.POST(
            request('/api/admin/connectors/opportunities', 'POST', details)
          )
        ).status,
        403
      );
      assert.equal(
        (
          await adminRoute.PATCH(
            request('/api/admin/connectors/opportunities', 'PATCH', {
              id,
              closed: true,
            })
          )
        ).status,
        403
      );
    }
    viewer = 'staff';
    admin = true;
    assert.equal(
      (
        await adminRoute.POST(
          request('/api/admin/connectors/opportunities', 'POST', details)
        )
      ).status,
      200
    );
    assert.equal(
      (
        await adminRoute.PATCH(
          request('/api/admin/connectors/opportunities', 'PATCH', {
            id,
            closed: true,
          })
        )
      ).status,
      200
    );
    assert.equal(
      (
        await adminRoute.PATCH(
          request('/api/admin/connectors/opportunities', 'PATCH', {
            ...details,
            id,
            title: 'A staff edit',
          })
        )
      ).status,
      200
    );
  });

  it('does not trust client-selected profiles, creators or assignees', async () => {
    const id = await publish();
    const response = await memberRoute.POST(
      request('/api/connectors/opportunities', 'POST', {
        id,
        profileId: 'p-other',
        userId: 'other',
        assignedBy: 'staff',
      })
    );
    assert.equal(response.status, 200);
    assert.equal((await commitments.listCommitments('p-other')).length, 0);
    const [work] = await commitments.listCommitments('p-member');
    assert.equal(work.assignedBy, null);
    viewer = 'staff';
    admin = true;
    const created = await adminRoute.POST(
      request('/api/admin/connectors/opportunities', 'POST', {
        ...details,
        createdBy: 'other',
      })
    );
    const body = (await created.json()) as { data: { id: string } };
    const [stored] = await db
      .select()
      .from(schema.connectorOpportunities)
      .where(eq(schema.connectorOpportunities.id, body.data.id));
    assert.equal(stored.createdBy, 'staff');
  });

  it('rejects malformed payloads, invalid estimates, targets, event encodings, houses and pods', async () => {
    for (const bad of [null, [], {}, { id: '' }, { id: 1 }]) {
      assert.equal(
        (
          await memberRoute.POST(
            request('/api/connectors/opportunities', 'POST', bad)
          )
        ).status,
        400
      );
    }
    const invalidJson = new NextRequest(
      'http://localhost/api/connectors/opportunities',
      { method: 'POST', body: '{' }
    );
    assert.equal((await memberRoute.POST(invalidJson)).status, 400);
    viewer = 'staff';
    admin = true;
    for (const bad of [
      null,
      [],
      { ...details, estimatedMinutes: -1 },
      { ...details, estimatedMinutes: 1.5 },
      { ...details, estimatedMinutes: '90' },
      { ...details, spots: 0 },
      { ...details, spots: 10000 },
      { ...details, house: 'worldBuilding' },
      { ...details, pod: 'elsewhere' },
      { ...details, event: 'unknown:thing' },
    ]) {
      assert.equal(
        (
          await adminRoute.POST(
            request('/api/admin/connectors/opportunities', 'POST', bad)
          )
        ).status,
        400
      );
    }
    assert.equal(
      (
        await adminRoute.PATCH(
          request('/api/admin/connectors/opportunities', 'PATCH', details)
        )
      ).status,
      400
    );
  });

  it('stores optional own-work estimates with the same validation and ownership rules as assignments', async () => {
    for (const bad of [0, -1, 0.5, 6001, '90']) {
      assert.equal(
        (
          await ownRoute.POST(
            request('/api/connectors/commitments', 'POST', {
              what: 'My own work',
              house: 'education',
              estimatedMinutes: bad,
            })
          )
        ).status,
        400
      );
    }
    assert.equal(
      (
        await ownRoute.POST(
          request('/api/connectors/commitments', 'POST', {
            what: 'My own work',
            house: 'education',
            estimatedMinutes: 90,
            profileId: 'p-other',
            assignedBy: 'staff',
          })
        )
      ).status,
      200
    );
    assert.equal(
      (
        await ownRoute.POST(
          request('/api/connectors/commitments', 'POST', {
            what: 'Unestimated work',
            house: 'education',
          })
        )
      ).status,
      200
    );
    const work = await commitments.listCommitments('p-member');
    assert.equal(work[0].estimatedMinutes, 90);
    assert.equal(work[0].opportunityId, null);
    assert.equal(work[0].assignedBy, null);
    assert.equal(work[1].estimatedMinutes, null);
    assert.deepEqual((await commitments.connectorLoads()).get('p-member'), {
      open: 2,
      estimatedMinutes: 90,
      unestimated: 1,
    });
  });

  it('shares connector progress with staff without allowing ownership bypasses or staff-assignment release', async () => {
    const id = await publish();
    const commitmentId = await join(id);
    viewer = 'other';
    assert.equal(
      (
        await ownRoute.PATCH(
          request('/api/connectors/commitments', 'PATCH', {
            id: commitmentId,
            progress: 'done',
          })
        )
      ).status,
      404
    );
    assert.equal(
      (
        await ownRoute.PATCH(
          request('/api/connectors/commitments', 'PATCH', {
            id: commitmentId,
            remove: true,
          })
        )
      ).status,
      404
    );
    viewer = 'member';
    assert.equal(
      (
        await ownRoute.PATCH(
          request('/api/connectors/commitments', 'PATCH', {
            id: commitmentId,
            progress: 'done',
          })
        )
      ).status,
      200
    );
    assert.equal(
      (await opportunities.listOpportunityCrew())[0].progress,
      'done'
    );
    viewer = 'staff';
    admin = true;
    const assigned = await tasksRoute.POST(
      request('/api/admin/connectors/tasks', 'POST', {
        profileId: 'p-member',
        what: 'An assigned task',
        house: 'education',
      })
    );
    assert.equal(assigned.status, 200);
    const body = (await assigned.json()) as { data: { id: string } };
    viewer = 'member';
    admin = false;
    assert.equal(
      (
        await ownRoute.PATCH(
          request('/api/connectors/commitments', 'PATCH', {
            id: body.data.id,
            remove: true,
          })
        )
      ).status,
      403
    );
    assert.equal(
      (
        await ownRoute.PATCH(
          request('/api/connectors/commitments', 'PATCH', {
            id: body.data.id,
            progress: 'done',
          })
        )
      ).status,
      200
    );
    viewer = 'staff';
    admin = true;
    assert.equal(
      (
        await tasksRoute.DELETE(
          request(`/api/admin/connectors/tasks?id=${commitmentId}`, 'DELETE')
        )
      ).status,
      200
    );
    assert.equal((await opportunities.listOpportunities())[0].signups, 0);
  });

  it('preserves the storage guard including completed history and gives accurate recovery guidance', async () => {
    const id = await publish();
    await pg.exec(
      `INSERT INTO connector_commitments (id, profile_id, what, house, progress) SELECT 'history-' || n, 'p-member', 'Task ' || n, 'education', 'done' FROM generate_series(1, 200) n`
    );
    const response = await memberRoute.POST(
      request('/api/connectors/opportunities', 'POST', { id })
    );
    assert.equal(response.status, 409);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /storage limit/);
    assert.doesNotMatch(body.error, /close.*first/i);
    assert.equal((await opportunities.listOpportunities())[0].signups, 0);
  });

  it('logs unexpected server errors and returns an explicit failure rather than a successful-looking response', async () => {
    viewer = 'staff';
    admin = true;
    const log = mock.method(console, 'error', () => {});
    await pg.exec(
      'ALTER TABLE connector_opportunities RENAME TO unavailable_opportunities'
    );
    try {
      const response = await adminRoute.POST(
        request('/api/admin/connectors/opportunities', 'POST', details)
      );
      assert.equal(response.status, 500);
      const body = (await response.json()) as {
        success: boolean;
        error: string;
      };
      assert.equal(body.success, false);
      assert.match(body.error, /could not save/i);
      assert.equal(log.mock.callCount(), 1);
    } finally {
      await pg.exec(
        'ALTER TABLE unavailable_opportunities RENAME TO connector_opportunities'
      );
      log.mock.restore();
    }
  });
});
