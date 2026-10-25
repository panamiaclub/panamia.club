import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'vinext/shims/internal/app-router-context';
import { appRouterInstance } from 'vinext/shims/navigation';
import * as schema from '@/lib/schema';

const pg = new PGlite();
const queries: string[] = [];
const db = drizzle(pg, {
  schema,
  logger: { logQuery: (query) => queries.push(query) },
});
let viewer: string | null = 'staff';
let admin = true;
let smsWrites = 0;

mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    auth: async () =>
      viewer ? { user: { id: viewer, isAdmin: admin } } : null,
  },
});
mock.module(import.meta.resolve('../lib/sms-subscriptions.ts'), {
  namedExports: {
    normalizeSmsPhone: (phone: string) => (phone ? '+13055550100' : null),
    requestIp: () => null,
    subscribeProfileToSms: async () => {
      smsWrites++;
      return null;
    },
    unsubscribeProfileFromSms: async () => {
      smsWrites++;
      return null;
    },
  },
});

let roster: typeof import('../lib/connectors/roster');
let membership: typeof import('../lib/connectors/membership');
let rosterRoute: typeof import('../app/api/admin/connectors/roster/route');
let joinRoute: typeof import('../app/api/connectors/join/route');
let approveRoute: typeof import('../app/api/admin/connectors/[profileId]/approve/route');
let adminPage: typeof import('../app/admin/connectors/page').default;
let NextRequest: typeof import('next/server').NextRequest;

const original = {
  status: 'inactive',
  pod: 'miami',
  houses: ['education', 'culturalWorkers'],
  tier: 3,
  bring: '  Original offer  ',
  appliedAt: '2026-01-01T00:00:00.000Z',
  decidedAt: '2026-01-02T00:00:00.000Z',
  decidedBy: 'original-coordinator',
  offboardedAt: '2026-10-25T18:00:00.000Z',
  offboardedBy: 'offboarding-coordinator',
  offboardReason: 'INTERNAL STAFF NOTE',
  customAudit: { preserved: true },
};

before(async () => {
  await pg.exec(`
    CREATE TABLE users (id text PRIMARY KEY, email text NOT NULL);
    CREATE TABLE profiles (
      id text PRIMARY KEY, user_id text UNIQUE, name text NOT NULL,
      screenname text, email text NOT NULL, connector jsonb,
      primary_image_cdn text, roles jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE venues (id text PRIMARY KEY, name text);
    CREATE TABLE events (id text PRIMARY KEY, title text, starts_at timestamptz, status text, host_group_id text, venue_id text);
    CREATE TABLE referral_attributions (id text PRIMARY KEY, referred_user_id text UNIQUE);
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
  roster = await import('../lib/connectors/roster');
  membership = await import('../lib/connectors/membership');
  rosterRoute = await import('../app/api/admin/connectors/roster/route');
  joinRoute = await import('../app/api/connectors/join/route');
  approveRoute =
    await import('../app/api/admin/connectors/[profileId]/approve/route');
  ({ default: adminPage } = await import('../app/admin/connectors/page'));
  ({ NextRequest } = await import('next/server'));
});

beforeEach(async () => {
  await pg.exec(
    'TRUNCATE connector_commitments, connector_opportunities, connector_events, events, referral_attributions, profiles, users CASCADE'
  );
  viewer = 'staff';
  admin = true;
  smsWrites = 0;
  for (const [id, status] of [
    ['staff', null],
    ['inactive', 'inactive'],
    ['active', 'active'],
    ['pending', 'pending'],
    ['declined', 'declined'],
    ['none', null],
    ['malformed', 'inactive'],
  ]) {
    await pg.query('INSERT INTO users VALUES ($1, $2)', [
      id,
      `${id}@example.invalid`,
    ]);
    await pg.query(
      'INSERT INTO profiles (id, user_id, name, screenname, email, connector, roles) VALUES ($1, $2, $3, $2, $4, $5::jsonb, $6::jsonb)',
      [
        `p-${id}`,
        id,
        `Name ${id}`,
        `${id}@example.invalid`,
        status
          ? JSON.stringify({
              ...original,
              status,
              ...(id === 'malformed' ? { houses: [] } : {}),
            })
          : null,
        JSON.stringify({ admin: id === 'inactive' }),
      ]
    );
  }
  queries.length = 0;
});

after(async () => {
  await pg.close();
  mock.restoreAll();
});

function request(
  method: string,
  body?: unknown,
  path = 'admin/connectors/roster'
) {
  return new NextRequest(`http://localhost/api/${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
}

async function raw(profileId = 'p-inactive') {
  const result = await pg.query<{
    connector: Record<string, unknown> | null;
  }>('SELECT connector FROM profiles WHERE id = $1', [profileId]);
  return result.rows[0]?.connector ?? null;
}

async function renderAdmin() {
  assert.ok(AppRouterContext);
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: appRouterInstance },
      await adminPage()
    )
  );
}

describe('Connector reactivation and preserved programme state', () => {
  it('lists only valid inactive memberships without widening the active roster', async () => {
    assert.deepEqual(
      (await roster.listRoster()).map((row) => row.profileId),
      ['p-active']
    );
    assert.deepEqual(
      (await roster.listInactiveRoster()).map((row) => row.profileId),
      ['p-inactive']
    );
    await pg.query(
      'UPDATE profiles SET connector = $1::jsonb, name = $2 WHERE id = $3',
      [JSON.stringify(original), 'Ari', 'p-none']
    );
    assert.deepEqual(
      (await roster.listInactiveRoster()).map((row) => row.displayName),
      ['Ari', 'Name inactive']
    );
  });

  it('changes only status and reactivation provenance, preserving raw audit and preferences', async () => {
    const before = await raw();
    const result = await roster.reactivateConnector('p-inactive', 'staff');
    assert.ok(result);
    assert.equal(result.status, 'active');
    assert.equal(result.tier, 3);
    assert.equal(result.reactivatedBy, 'staff');
    assert.ok(result.reactivatedAt);
    assert.ok(Number.isFinite(Date.parse(result.reactivatedAt)));
    assert.deepEqual(await raw(), {
      ...before,
      status: 'active',
      reactivatedAt: result.reactivatedAt,
      reactivatedBy: 'staff',
    });
    const account = await pg.query(
      'SELECT user_id, roles FROM profiles WHERE id = $1',
      ['p-inactive']
    );
    assert.deepEqual(account.rows[0], {
      user_id: 'inactive',
      roles: { admin: true },
    });
    assert.equal(smsWrites, 0);
  });

  it('preserves completed reservations and staff assignments while restoring roster and HQ membership', async () => {
    await pg.query(
      `INSERT INTO connector_opportunities (id, title, details, house, when_text, created_by, spots)
       VALUES ('reserved', 'Existing invitation', 'Keep the existing reservation.', 'education', 'Next week', 'staff', 1)`
    );
    await pg.query(
      `INSERT INTO connector_commitments (id, profile_id, what, house, progress, opportunity_id)
       VALUES ('completed', 'p-inactive', 'Already done', 'education', 'done', 'reserved')`
    );
    await pg.query(
      `INSERT INTO connector_commitments (id, profile_id, what, house, assigned_by, assigned_at)
       VALUES ('assigned', 'p-inactive', 'Existing assignment', 'education', 'staff', now())`
    );
    const work = await pg.query(
      'SELECT * FROM connector_commitments ORDER BY id'
    );
    assert.equal(await membership.countConnectorsInPod('miami'), 1);
    await roster.reactivateConnector('p-inactive', 'staff');
    assert.deepEqual(
      (await pg.query('SELECT * FROM connector_commitments ORDER BY id')).rows,
      work.rows
    );
    assert.equal(await membership.countConnectorsInPod('miami'), 2);
    assert.equal(
      (await membership.getMyConnector('inactive'))?.membership.status,
      'active'
    );
    assert.equal(roster.rosterTallies(await roster.listRoster()).total, 2);
    assert.deepEqual(await roster.listInactiveRoster(), []);
    assert.equal(await raw('p-none'), null);
  });

  it('refuses active, pending, declined, malformed, missing, and absent memberships', async () => {
    for (const id of [
      'active',
      'pending',
      'declined',
      'malformed',
      'none',
      'missing',
    ]) {
      const before = await raw(`p-${id}`);
      assert.equal(
        await roster.reactivateConnector(`p-${id}`, 'staff'),
        null,
        id
      );
      assert.deepEqual(await raw(`p-${id}`), before);
    }
  });

  it('preserves offboarding and reactivation history through later roster and preference edits', async () => {
    const restored = await roster.reactivateConnector('p-inactive', 'staff');
    assert.ok(restored);
    await roster.setHousesAndTier('p-inactive', ['education'], 2);
    viewer = 'inactive';
    admin = false;
    const response = await joinRoute.POST(
      request(
        'POST',
        {
          pod: 'broward',
          houses: ['culturalWorkers'],
          bring: 'An updated offer',
          status: 'pending',
          tier: 1,
          offboardReason: 'Overwrite the audit',
          reactivatedBy: 'someone-else',
        },
        'connectors/join'
      )
    );
    assert.equal(response.status, 200);
    const stored = await raw();
    assert.equal(stored?.status, 'active');
    assert.equal(stored?.tier, 2);
    assert.equal(stored?.pod, 'broward');
    assert.deepEqual(stored?.houses, ['culturalWorkers']);
    assert.equal(stored?.offboardedAt, original.offboardedAt);
    assert.equal(stored?.offboardedBy, original.offboardedBy);
    assert.equal(stored?.offboardReason, original.offboardReason);
    assert.equal(stored?.reactivatedAt, restored.reactivatedAt);
    assert.equal(stored?.reactivatedBy, 'staff');
    const body = await response.json();
    assert.deepEqual(Object.keys(body.data).sort(), [
      'bring',
      'houses',
      'pod',
      'status',
      'tier',
    ]);
    assert.equal(JSON.stringify(body).includes('INTERNAL STAFF NOTE'), false);
  });

  it('does not turn signup edits or a stale approval into reactivation', async () => {
    viewer = 'inactive';
    admin = false;
    const response = await joinRoute.POST(
      request(
        'POST',
        { pod: 'miami', houses: ['education'], status: 'active' },
        'connectors/join'
      )
    );
    assert.equal(response.status, 200);
    assert.equal((await raw())?.status, 'inactive');
    viewer = 'staff';
    admin = true;
    const approval = await approveRoute.POST(undefined, {
      params: Promise.resolve({ profileId: 'p-inactive' }),
    });
    assert.equal(approval.status, 400);
    assert.equal((await raw())?.status, 'inactive');
    const fresh = await roster.reactivateConnector('p-inactive', 'staff');
    assert.deepEqual(fresh?.houses, ['education']);
  });

  it('keeps new signup pending at Tier 1 with no staff provenance', async () => {
    viewer = 'none';
    admin = false;
    const response = await joinRoute.POST(
      request(
        'POST',
        { pod: 'miami', houses: ['education'], status: 'active', tier: 3 },
        'connectors/join'
      )
    );
    assert.equal(response.status, 200);
    const stored = await raw('p-none');
    assert.equal(stored?.status, 'pending');
    assert.equal(stored?.tier, 1);
    assert.equal(stored?.reactivatedAt, null);
    assert.equal(stored?.reactivatedBy, null);
  });

  it('locks the profile before each membership write, including form saves and decisions', async () => {
    const actions = [
      () => roster.setHousesAndTier('p-active', ['education'], 2),
      () => roster.offboardConnector('p-active', 'staff', 'Leaving'),
      () => roster.reactivateConnector('p-active', 'staff'),
      () => {
        viewer = 'active';
        return joinRoute.POST(
          request(
            'POST',
            { pod: 'miami', houses: ['education'] },
            'connectors/join'
          )
        );
      },
      () =>
        membership.decideConnectorApplication('p-pending', 'active', 'staff'),
    ];
    for (const action of actions) {
      queries.length = 0;
      await action();
      const lockedRead = queries.findIndex((query) =>
        /from "profiles".*for update/i.test(query)
      );
      const update = queries.findIndex((query) =>
        /^update "profiles"/i.test(query)
      );
      assert.ok(lockedRead >= 0 && update > lockedRead, queries.join('\n'));
    }
  });
});

describe('admin-only reactivation API and UI', () => {
  it('denies signed-out and non-admin sessions before touching membership', async () => {
    for (const who of [null, 'active', 'inactive']) {
      viewer = who;
      admin = false;
      queries.length = 0;
      const response = await rosterRoute.POST(
        request('POST', { profileId: 'p-inactive' })
      );
      assert.equal(response.status, 403);
      assert.equal(queries.length, 0);
      assert.equal((await raw())?.status, 'inactive');
    }
  });

  it('allows an offboarded general admin to reactivate their own membership', async () => {
    viewer = 'inactive';
    admin = true;
    const response = await rosterRoute.POST(
      request('POST', { profileId: 'p-inactive', tier: 1, houses: [] })
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'active');
    assert.equal(body.data.tier, 3);
    assert.equal(body.data.reactivatedBy, 'inactive');
    assert.deepEqual(body.data.houses, original.houses);
  });

  it('reports malformed JSON and missing profile IDs without changing anything', async () => {
    const malformed = new NextRequest(
      'http://localhost/api/admin/connectors/roster',
      { method: 'POST', body: '{' }
    );
    assert.equal((await rosterRoute.POST(malformed)).status, 400);
    for (const body of [null, [], {}, { profileId: 1 }, { profileId: ' ' }]) {
      assert.equal((await rosterRoute.POST(request('POST', body))).status, 400);
    }
    assert.deepEqual(await raw(), original);
  });

  it('refuses pending and declined applications and duplicate reactivation explicitly', async () => {
    for (const id of ['pending', 'declined', 'active', 'none', 'missing']) {
      const response = await rosterRoute.POST(
        request('POST', { profileId: `p-${id}` })
      );
      assert.equal(response.status, 404);
      assert.equal((await response.json()).success, false);
    }
    assert.equal(
      (await rosterRoute.POST(request('POST', { profileId: 'p-inactive' })))
        .status,
      200
    );
    assert.equal(
      (await rosterRoute.POST(request('POST', { profileId: 'p-inactive' })))
        .status,
      404
    );
  });

  it('rolls back and logs database failures instead of reporting success', async () => {
    await pg.exec(`
      CREATE FUNCTION fail_reactivation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Injected isolated failure'; END;
      $$;
      CREATE TRIGGER fail_reactivation BEFORE UPDATE ON profiles
      FOR EACH ROW WHEN (NEW.connector ->> 'status' = 'active')
      EXECUTE FUNCTION fail_reactivation();
    `);
    const log = mock.method(console, 'error', () => {});
    try {
      const response = await rosterRoute.POST(
        request('POST', { profileId: 'p-inactive' })
      );
      assert.equal(response.status, 500);
      assert.equal((await response.json()).success, false);
      assert.equal(log.mock.callCount(), 1);
      assert.deepEqual(await raw(), original);
    } finally {
      log.mock.restore();
      await pg.exec(
        'DROP TRIGGER fail_reactivation ON profiles; DROP FUNCTION fail_reactivation();'
      );
    }
  });

  it('renders recovery on the actual admin page even with an empty active roster', async () => {
    await pg.query('UPDATE profiles SET connector = NULL WHERE id = $1', [
      'p-active',
    ]);
    const html = await renderAdmin();
    assert.match(html, /There are no active connectors/);
    assert.match(html, /Offboarded connectors \(1\)/);
    assert.match(html, /Name inactive/);
    assert.match(html, /Reactivate<\/button>/);
    assert.match(html, /INTERNAL STAFF NOTE/);
    await roster.reactivateConnector('p-inactive', 'staff');
    const refreshed = await renderAdmin();
    assert.match(refreshed, /Offboarded connectors \(0\)/);
    assert.match(refreshed, /Tier 3/);
    assert.doesNotMatch(refreshed, /INTERNAL STAFF NOTE/);
  });

  it('does not render staff recovery tools for an ordinary Connector', async () => {
    viewer = 'active';
    admin = false;
    queries.length = 0;
    await assert.rejects(renderAdmin());
    assert.equal(queries.length, 0);
  });
});
