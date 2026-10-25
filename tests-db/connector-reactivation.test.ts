import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import {
  Children,
  createElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
} from 'react';
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
    getSmsSubscriptionForUser: async () => null,
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
let opportunityRoute: typeof import('../app/api/connectors/opportunities/route');
let tasksRoute: typeof import('../app/api/admin/connectors/tasks/route');
let approveRoute: typeof import('../app/api/admin/connectors/[profileId]/approve/route');
let adminPage: typeof import('../app/admin/connectors/page').default;
let joinPage: typeof import('../app/connectors/join/page').default;
let hqPage: typeof import('../app/connectors/hq/page').default;
let applicationsPage: typeof import('../app/admin/connectors/applications/page').default;
let schedulingPage: typeof import('../app/admin/connectors/scheduling/page').default;
let CoordinationDesk: typeof import('../components/connectors/coordination-desk').CoordinationDesk;
let NextRequest: typeof import('next/server').NextRequest;

const houseFocus = {
  majorHouse: 'education',
  minorHouse: 'culturalWorkers',
} as const;

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
    CREATE TABLE social_actors (id text PRIMARY KEY, username text, domain text, type text);
    CREATE TABLE social_groups (id text PRIMARY KEY, actor_id text);
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
  opportunityRoute = await import('../app/api/connectors/opportunities/route');
  tasksRoute = await import('../app/api/admin/connectors/tasks/route');
  approveRoute =
    await import('../app/api/admin/connectors/[profileId]/approve/route');
  ({ default: adminPage } = await import('../app/admin/connectors/page'));
  ({ default: joinPage } = await import('../app/connectors/join/page'));
  ({ default: hqPage } = await import('../app/connectors/hq/page'));
  ({ default: applicationsPage } =
    await import('../app/admin/connectors/applications/page'));
  ({ default: schedulingPage } =
    await import('../app/admin/connectors/scheduling/page'));
  ({ CoordinationDesk } =
    await import('../components/connectors/coordination-desk'));
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

async function renderPage(page: () => Promise<ReactElement>) {
  assert.ok(AppRouterContext);
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: appRouterInstance },
      await page()
    )
  );
}

function renderAdmin() {
  return renderPage(adminPage);
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
    await roster.setHousesAndTier('p-inactive', houseFocus, 2);
    viewer = 'inactive';
    admin = false;
    const response = await joinRoute.POST(
      request(
        'POST',
        {
          pod: 'broward',
          majorHouse: 'culturalWorkers',
          minorHouse: 'narrativeShifters',
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
    assert.deepEqual(stored?.houses, ['culturalWorkers', 'narrativeShifters']);
    assert.equal(stored?.majorHouse, 'culturalWorkers');
    assert.equal(stored?.minorHouse, 'narrativeShifters');
    assert.equal(stored?.offboardedAt, original.offboardedAt);
    assert.equal(stored?.offboardedBy, original.offboardedBy);
    assert.equal(stored?.offboardReason, original.offboardReason);
    assert.equal(stored?.reactivatedAt, restored.reactivatedAt);
    assert.equal(stored?.reactivatedBy, 'staff');
    const body = await response.json();
    assert.deepEqual(Object.keys(body.data).sort(), [
      'bring',
      'houses',
      'majorHouse',
      'minorHouse',
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
        { pod: 'miami', ...houseFocus, status: 'active' },
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
    assert.deepEqual(fresh?.houses, ['education', 'culturalWorkers']);
  });

  it('keeps new signup pending at Tier 1 with no staff provenance', async () => {
    viewer = 'none';
    admin = false;
    const response = await joinRoute.POST(
      request(
        'POST',
        { pod: 'miami', ...houseFocus, status: 'active', tier: 3 },
        'connectors/join'
      )
    );
    assert.equal(response.status, 200);
    const stored = await raw('p-none');
    assert.equal(stored?.status, 'pending');
    assert.equal(stored?.tier, 1);
    assert.equal(stored?.majorHouse, houseFocus.majorHouse);
    assert.equal(stored?.minorHouse, houseFocus.minorHouse);
    assert.deepEqual(stored?.houses, ['education', 'culturalWorkers']);
    assert.equal(stored?.reactivatedAt, null);
    assert.equal(stored?.reactivatedBy, null);
  });

  it('locks the profile before each membership write, including form saves and decisions', async () => {
    const actions = [
      () => roster.setHousesAndTier('p-active', houseFocus, 2),
      () => roster.offboardConnector('p-active', 'staff', 'Leaving'),
      () => roster.reactivateConnector('p-active', 'staff'),
      () => {
        viewer = 'active';
        return joinRoute.POST(
          request('POST', { pod: 'miami', ...houseFocus }, 'connectors/join')
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

describe('explicit major and minor house choices', () => {
  it('rejects missing, duplicate, unknown, or unranked signup choices before any write', async () => {
    viewer = 'active';
    admin = false;
    const before = await raw('p-active');
    for (const focus of [
      {},
      { houses: ['education', 'culturalWorkers'] },
      { majorHouse: 'education' },
      { minorHouse: 'culturalWorkers' },
      { majorHouse: 'education', minorHouse: 'education' },
      { majorHouse: '', minorHouse: 'education' },
      { majorHouse: 'education', minorHouse: null },
      { majorHouse: 'education', minorHouse: 'retiredHouse' },
      { majorHouse: ['education'], minorHouse: 'culturalWorkers' },
      { majorHouse: 'education', minorHouse: 2 },
    ]) {
      queries.length = 0;
      const response = await joinRoute.POST(
        request('POST', { pod: 'miami', ...focus }, 'connectors/join')
      );
      assert.equal(response.status, 400, JSON.stringify(focus));
      assert.deepEqual(await response.json(), {
        success: false,
        error: 'Choose a major house and a different minor house.',
      });
      assert.equal(queries.length, 0);
      assert.equal(smsWrites, 0);
      assert.deepEqual(await raw('p-active'), before);
    }
  });

  it('saves the explicit roles, derives exactly two houses, and still requires approval', async () => {
    viewer = 'none';
    admin = false;
    const response = await joinRoute.POST(
      request(
        'POST',
        {
          pod: 'broward',
          ...houseFocus,
          houses: ['narrativeShifters', 'relationshipBuilding'],
          status: 'active',
          tier: 3,
          bring: 'Translation',
        },
        'connectors/join'
      )
    );
    assert.equal(response.status, 200);
    const stored = await raw('p-none');
    assert.equal(stored?.status, 'pending');
    assert.equal(stored?.tier, 1);
    assert.equal(stored?.majorHouse, 'education');
    assert.equal(stored?.minorHouse, 'culturalWorkers');
    assert.deepEqual(stored?.houses, ['education', 'culturalWorkers']);
    const body = await response.json();
    assert.equal(body.data.majorHouse, stored?.majorHouse);
    assert.equal(body.data.minorHouse, stored?.minorHouse);
    const confirmation = await renderPage(hqPage);
    assert.match(confirmation, /Your application is in/);
    assert.match(confirmation, /Major house: Education/);
    assert.match(confirmation, /Minor house: Cultural Workers/);
    viewer = 'staff';
    admin = true;
    const approval = await approveRoute.POST(undefined, {
      params: Promise.resolve({ profileId: 'p-none' }),
    });
    assert.equal(approval.status, 200);
    const accepted = await raw('p-none');
    assert.equal(accepted?.status, 'active');
    assert.equal(accepted?.tier, 1);
    assert.equal(accepted?.majorHouse, houseFocus.majorHouse);
    assert.equal(accepted?.minorHouse, houseFocus.minorHouse);
    assert.equal(accepted?.appliedAt, stored?.appliedAt);
  });

  it('never guesses legacy roles, preserves HQ access, and collects them on the edit form', async () => {
    const interests = [
      'narrativeShifters',
      'education',
      'culturalWorkers',
      'relationshipBuilding',
    ];
    for (let count = 1; count <= interests.length; count++) {
      const legacy = {
        ...original,
        status: 'active',
        houses: interests.slice(0, count),
      };
      await pg.query(
        'UPDATE profiles SET connector = $1::jsonb WHERE id = $2',
        [JSON.stringify(legacy), 'p-active']
      );
      viewer = 'active';
      admin = false;
      const me = await membership.getMyConnector('active');
      assert.equal(me?.membership.status, 'active');
      assert.equal(me?.membership.majorHouse, null);
      assert.equal(me?.membership.minorHouse, null);
      assert.deepEqual(me?.membership.houses, legacy.houses);
      const hq = await renderPage(hqPage);
      assert.match(hq, /My commitments/);
      assert.doesNotMatch(hq, /Major house:|Minor house:/);
      const form = await renderPage(joinPage);
      assert.match(form, /Those interests were not ranked/);
      assert.match(
        form,
        /<select\b(?=[^>]*name="majorHouse")(?=[^>]*required="")[^>]*>/
      );
      assert.match(
        form,
        /<select\b(?=[^>]*name="minorHouse")(?=[^>]*required="")[^>]*>/
      );
      assert.deepEqual(await raw('p-active'), legacy);
    }
  });

  it('updates only the signed-in human and preserves work, authority, and staff metadata', async () => {
    await pg.query(
      `INSERT INTO connector_opportunities (id, title, details, house, when_text, created_by, spots)
         VALUES ('reserved', 'Existing ask', 'Keep this place.', 'education', 'Next week', 'staff', 1)`
    );
    await pg.query(
      `INSERT INTO connector_commitments (id, profile_id, what, house, progress, opportunity_id)
         VALUES ('reservation', 'p-active', 'Completed reservation', 'education', 'done', 'reserved')`
    );
    await pg.query(
      `INSERT INTO connector_commitments (id, profile_id, what, house, assigned_by, assigned_at)
         VALUES ('assignment', 'p-active', 'Existing assignment', 'education', 'staff', now())`
    );
    const work = await pg.query(
      'SELECT * FROM connector_commitments ORDER BY id'
    );
    const opportunities = await pg.query(
      'SELECT * FROM connector_opportunities ORDER BY id'
    );
    const other = await raw('p-inactive');
    viewer = 'active';
    admin = false;
    const response = await joinRoute.POST(
      request(
        'POST',
        {
          profileId: 'p-inactive',
          pod: 'palmBeach',
          majorHouse: 'narrativeShifters',
          minorHouse: 'relationshipBuilding',
          bring: 'Updated offer',
          tier: 1,
          status: 'pending',
          decidedBy: 'forged',
          offboardReason: 'forged',
        },
        'connectors/join'
      )
    );
    assert.equal(response.status, 200);
    const stored = await raw('p-active');
    assert.equal(stored?.status, 'active');
    assert.equal(stored?.tier, 3);
    assert.equal(stored?.appliedAt, original.appliedAt);
    assert.equal(stored?.decidedBy, original.decidedBy);
    assert.equal(stored?.offboardReason, original.offboardReason);
    assert.equal(stored?.majorHouse, 'narrativeShifters');
    assert.equal(stored?.minorHouse, 'relationshipBuilding');
    assert.deepEqual(stored?.houses, [
      'narrativeShifters',
      'relationshipBuilding',
    ]);
    assert.deepEqual(await raw('p-inactive'), other);
    assert.deepEqual(
      (await pg.query('SELECT * FROM connector_commitments ORDER BY id')).rows,
      work.rows
    );
    assert.deepEqual(
      (await pg.query('SELECT * FROM connector_opportunities ORDER BY id'))
        .rows,
      opportunities.rows
    );
    const form = await renderPage(joinPage);
    assert.match(
      form,
      /<option\b(?=[^>]*value="narrativeShifters")(?=[^>]*selected="")[^>]*>/
    );
    assert.match(
      form,
      /<option\b(?=[^>]*value="relationshipBuilding")(?=[^>]*selected="")[^>]*>/
    );
    const hq = await renderPage(hqPage);
    assert.match(hq, /Major house: Narrative Shifters/);
    assert.match(hq, /Minor house: Relationship Building/);
    assert.doesNotMatch(hq, /INTERNAL STAFF NOTE/);
  });

  it('staff house edits validate both roles and preserve raw preferences and audit data', async () => {
    const before = await raw('p-active');
    for (const focus of [
      { houses: ['education', 'culturalWorkers'] },
      { majorHouse: 'education' },
      { minorHouse: 'culturalWorkers' },
      { majorHouse: 'education', minorHouse: 'education' },
      { majorHouse: 'education', minorHouse: 'retiredHouse' },
      { majorHouse: null, minorHouse: null },
    ]) {
      const response = await rosterRoute.PATCH(
        request('PATCH', { profileId: 'p-active', tier: 2, ...focus })
      );
      assert.equal(response.status, 400);
      assert.deepEqual(await raw('p-active'), before);
    }
    const response = await rosterRoute.PATCH(
      request('PATCH', { profileId: 'p-active', tier: 2, ...houseFocus })
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await raw('p-active'), {
      ...before,
      ...houseFocus,
      houses: ['education', 'culturalWorkers'],
      tier: 2,
    });
    const swapped = await rosterRoute.PATCH(
      request('PATCH', {
        profileId: 'p-active',
        tier: 2,
        majorHouse: houseFocus.minorHouse,
        minorHouse: houseFocus.majorHouse,
      })
    );
    assert.equal(swapped.status, 200);
    assert.deepEqual((await raw('p-active'))?.houses, [
      'culturalWorkers',
      'education',
    ]);
    const me = await membership.getMyConnector('active');
    assert.equal(me?.membership.majorHouse, 'culturalWorkers');
    assert.equal(me?.membership.minorHouse, 'education');
  });

  it('the roster helper writes only confirmed house choices and the granted tier', async () => {
    const before = await raw('p-active');
    const focus = {
      ...houseFocus,
      status: 'inactive',
      offboardReason: 'Overwrite the staff record',
      houses: ['narrativeShifters'],
    };
    const updated = await roster.setHousesAndTier('p-active', focus, 2);
    assert.ok(updated);
    assert.deepEqual(await raw('p-active'), {
      ...before,
      ...houseFocus,
      houses: ['education', 'culturalWorkers'],
      tier: 2,
    });
  });

  it('tier-only staff edits preserve legacy interests without confirming or clearing roles', async () => {
    const before = await raw('p-active');
    const response = await rosterRoute.PATCH(
      request('PATCH', { profileId: 'p-active', tier: 2 })
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await raw('p-active'), { ...before, tier: 2 });
    const me = await membership.getMyConnector('active');
    assert.equal(me?.membership.majorHouse, null);
    assert.equal(me?.membership.minorHouse, null);
    assert.deepEqual(me?.membership.houses, original.houses);
  });

  it('staff edits cannot approve inactive or pending memberships or bypass admin authorization', async () => {
    for (const who of [null, 'active']) {
      viewer = who;
      admin = false;
      const response = await rosterRoute.PATCH(
        request('PATCH', { profileId: 'p-active', tier: 2, ...houseFocus })
      );
      assert.equal(response.status, 403);
    }
    viewer = 'staff';
    admin = true;
    for (const id of [
      'inactive',
      'pending',
      'declined',
      'none',
      'malformed',
      'missing',
    ]) {
      const before = await raw(`p-${id}`);
      const response = await rosterRoute.PATCH(
        request('PATCH', { profileId: `p-${id}`, tier: 2, ...houseFocus })
      );
      assert.equal(response.status, 404);
      assert.deepEqual(await raw(`p-${id}`), before);
    }
  });

  it('confirmed house focus never restricts opportunity signup or staff assignments across houses', async () => {
    await roster.setHousesAndTier('p-active', houseFocus, 3);
    const before = await raw('p-active');
    await pg.query(
      `INSERT INTO connector_opportunities (id, title, details, house, when_text, created_by, spots)
       VALUES ('cross-house', 'Help another house', 'All connectors can help.', 'narrativeShifters', 'Next week', 'staff', 1)`
    );
    viewer = 'active';
    admin = false;
    const signup = await opportunityRoute.POST(
      request('POST', { id: 'cross-house' }, 'connectors/opportunities')
    );
    assert.equal(signup.status, 200);
    assert.equal((await signup.json()).success, true);
    viewer = 'staff';
    admin = true;
    const assignment = await tasksRoute.POST(
      request(
        'POST',
        {
          profileId: 'p-active',
          what: 'Support relationship work',
          house: 'relationshipBuilding',
        },
        'admin/connectors/tasks'
      )
    );
    assert.equal(assignment.status, 200);
    const work = await pg.query(
      'SELECT house, assigned_by FROM connector_commitments WHERE profile_id = $1 ORDER BY house',
      ['p-active']
    );
    assert.deepEqual(work.rows, [
      { house: 'narrativeShifters', assigned_by: null },
      { house: 'relationshipBuilding', assigned_by: 'staff' },
    ]);
    assert.deepEqual(await raw('p-active'), before);
  });

  it('application and coordination pages show the persisted roles consistently', async () => {
    for (const id of ['active', 'pending']) {
      await pg.query(
        'UPDATE profiles SET connector = $1::jsonb WHERE id = $2',
        [
          JSON.stringify({
            ...original,
            status: id,
            ...houseFocus,
            houses: [houseFocus.majorHouse, houseFocus.minorHouse],
          }),
          `p-${id}`,
        ]
      );
    }
    const applications = await renderPage(applicationsPage);
    assert.match(applications, /Major house: Education/);
    assert.match(applications, /Minor house: Cultural Workers/);
    const coordination = await schedulingPage();
    const desk = Children.toArray(coordination.props.children).find(
      (child) => isValidElement(child) && child.type === CoordinationDesk
    );
    assert.ok(isValidElement<ComponentProps<typeof CoordinationDesk>>(desk));
    const person = desk.props.people.find(
      (row) => row.profileId === 'p-active'
    );
    assert.ok(person);
    assert.equal(person.majorHouse, houseFocus.majorHouse);
    assert.equal(person.minorHouse, houseFocus.minorHouse);
    assert.deepEqual(person.houses, [
      houseFocus.majorHouse,
      houseFocus.minorHouse,
    ]);
  });

  it('confirmed roles survive offboarding and reactivation without changing their order', async () => {
    const saved = await roster.setHousesAndTier('p-active', houseFocus, 2);
    assert.ok(saved);
    await roster.offboardConnector('p-active', 'staff', 'Test recovery');
    const offboarded = await raw('p-active');
    const restored = await roster.reactivateConnector('p-active', 'staff');
    assert.ok(restored);
    assert.equal(restored.majorHouse, houseFocus.majorHouse);
    assert.equal(restored.minorHouse, houseFocus.minorHouse);
    assert.deepEqual(restored.houses, [
      houseFocus.majorHouse,
      houseFocus.minorHouse,
    ]);
    assert.deepEqual(await raw('p-active'), {
      ...offboarded,
      status: 'active',
      reactivatedAt: restored.reactivatedAt,
      reactivatedBy: 'staff',
    });
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
