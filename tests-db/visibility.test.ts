import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { and, eq, type SQL } from 'drizzle-orm';
import * as schema from '@/lib/schema';
import {
  STATUS_TYPE_PANAS,
  getVisibilityFromRecipients,
} from '@/lib/utils/getVisibility';

const pg = new PGlite();
const db = drizzle(pg, { schema });
// Postgres.js returns rows directly; PGlite wraps raw execute results.
const appDb = new Proxy(db, {
  get(target, key, receiver) {
    if (key === 'execute') {
      return async (query: SQL) => (await target.execute(query)).rows;
    }
    const value = Reflect.get(target, key, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
const dialect = new PgDialect();
const uri = (actor: string) => `https://visibility.invalid/p/${actor}`;
const followers = (actor: string) => `${uri(actor)}/followers`;
let viewer: string | undefined;
let signedIn = false;
let timeline: typeof import('@/lib/federation/wrappers/timeline');
let status: typeof import('@/lib/federation/wrappers/status');
let group: typeof import('@/lib/federation/wrappers/group');

// Replace DB/auth/navigation boundaries and forward the federation barrel to
// real wrappers. Group authorization, relational SQL, and GET handlers execute.
mock.module(import.meta.resolve('../lib/db.ts'), {
  namedExports: { db: appDb },
});
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    auth: async () => (signedIn ? { user: { id: 'account' } } : null),
  },
});
mock.module(import.meta.resolve('../lib/server/active-profile.ts'), {
  namedExports: {
    getActiveProfileWithActor: async () =>
      viewer ? { socialActor: { id: viewer }, defaultCcLicense: 'cc-0' } : null,
  },
});
mock.module(import.meta.resolve('next/navigation'), {
  namedExports: {
    notFound: () => {
      throw new Error('NOT_FOUND');
    },
    redirect: (url: string) => {
      throw new Error(`REDIRECT:${url}`);
    },
  },
});
mock.module(import.meta.resolve('../lib/federation/index.ts'), {
  namedExports: {
    socialConfig: { domain: 'visibility.invalid' },
    getActorUrl: uri,
    getInboxUrl: (actor: string) => `${uri(actor)}/inbox`,
    getOutboxUrl: (actor: string) => `${uri(actor)}/outbox`,
    getFollowingUrl: (actor: string) => `${uri(actor)}/following`,
    getFollowersUrl: followers,
    getActorByScreenname: async (username: string) =>
      db.query.socialActors.findFirst({
        where: eq(schema.socialActors.username, username),
      }),
    getActorPosts: (...args: Parameters<typeof timeline.getActorPosts>) =>
      timeline.getActorPosts(...args),
    getStatusWithLikeStatus: (
      ...args: Parameters<typeof timeline.getStatusWithLikeStatus>
    ) => timeline.getStatusWithLikeStatus(...args),
    getStatusReplies: (...args: Parameters<typeof status.getStatusReplies>) =>
      status.getStatusReplies(...args),
    deleteStatus: (...args: Parameters<typeof status.deleteStatus>) =>
      status.deleteStatus(...args),
    createStatus: (...args: Parameters<typeof status.createStatus>) =>
      status.createStatus(...args),
    getPublicTimeline: (
      ...args: Parameters<typeof timeline.getPublicTimeline>
    ) => timeline.getPublicTimeline(...args),
    getGroupTimeline: (...args: Parameters<typeof timeline.getGroupTimeline>) =>
      timeline.getGroupTimeline(...args),
    getGroupByHandle: (...args: Parameters<typeof group.getGroupByHandle>) =>
      group.getGroupByHandle(...args),
    getMembership: (...args: Parameters<typeof group.getMembership>) =>
      group.getMembership(...args),
  },
});

let postsRoute: typeof import('../app/api/social/actors/[username]/posts/route');
let statusRoute: typeof import('../app/api/social/statuses/[statusId]/route');
let repliesRoute: typeof import('../app/api/social/statuses/[statusId]/replies/route');
let NextRequest: typeof import('next/server').NextRequest;
let redirectPage: typeof import('../app/status/[statusId]/page');
let createRoute: typeof import('../app/api/social/statuses/route');
let groupPostsRoute: typeof import('../app/api/social/groups/[handle]/posts/route');
let outboxRoute: typeof import('../app/p/[user]/outbox/route');
const { PUBLIC, notExpired, visibleTo } =
  await import('@/lib/federation/wrappers/visibility');

before(async () => {
  // Generate the queried columns from the current schema, not a stale copy.
  // Constraints/defaults unrelated to the exercised queries are unnecessary.
  for (const table of [
    schema.profiles,
    schema.socialActors,
    schema.socialStatuses,
    schema.socialFollows,
    schema.socialGroups,
    schema.socialGroupMembers,
    schema.socialAttachments,
    schema.socialLikes,
    schema.socialBlocks,
    schema.socialTags,
    schema.socialDmRequests,
  ]) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map(
      (column) =>
        `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}`
    );
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(', ')})`);
  }
  await pg.exec(`
    ALTER TABLE social_statuses ALTER COLUMN likes_count SET DEFAULT 0;
    ALTER TABLE social_statuses ALTER COLUMN replies_count SET DEFAULT 0;
    ALTER TABLE social_actors ALTER COLUMN status_count SET DEFAULT 0;
  `);

  for (const id of ['alice', 'bob', 'carol', 'dave', 'erin', 'banned']) {
    await db.insert(schema.socialActors).values({
      id,
      username: id,
      domain: 'visibility.invalid',
      uri: uri(id),
      followersUrl: followers(id),
      followingUrl: `${uri(id)}/following`,
      inboxUrl: `${uri(id)}/inbox`,
      outboxUrl: `${uri(id)}/outbox`,
      publicKey: 'fixture',
    });
  }
  await db.insert(schema.socialFollows).values([
    { actorId: 'bob', targetActorId: 'alice', status: 'accepted' },
    { actorId: 'erin', targetActorId: 'alice', status: 'pending' },
  ]);
  await db.insert(schema.socialGroups).values([
    { id: 'open', actorId: 'carol', visibility: 'public' },
    { id: 'closed', actorId: 'erin', visibility: 'private' },
  ]);
  await db.insert(schema.socialGroupMembers).values([
    { groupId: 'closed', actorId: 'dave', status: 'active' },
    { groupId: 'closed', actorId: 'erin', status: 'pending' },
    { groupId: 'closed', actorId: 'banned', status: 'banned' },
  ]);

  const posts = [
    { id: 'public', recipientTo: [PUBLIC] },
    {
      id: 'unlisted',
      recipientTo: [followers('alice')],
      recipientCc: [PUBLIC],
    },
    { id: 'followers', recipientTo: [followers('alice')] },
    { id: 'followers_cc', recipientCc: [followers('alice')] },
    { id: 'dm_dave', recipientTo: [uri('dave')] },
    { id: 'dm_cc', recipientCc: [uri('dave')] },
    { id: 'wrong_followers', recipientTo: [followers('carol')] },
    {
      id: 'expired',
      recipientTo: [uri('dave')],
      expiresAt: new Date('2000-01-01'),
    },
    { id: 'draft', published: null, recipientTo: [PUBLIC] },
    { id: 'story', type: schema.STATUS_TYPE_STORY, recipientTo: [PUBLIC] },
    { id: 'group_open', groupId: 'open', recipientTo: [followers('carol')] },
    { id: 'group_closed', groupId: 'closed', recipientTo: [followers('erin')] },
    { id: 'group_public_address', groupId: 'closed', recipientTo: [PUBLIC] },
    { id: 'group_named', groupId: 'closed', recipientTo: [uri('bob')] },
    { id: 'reply_public', inReplyToId: 'public', recipientTo: [PUBLIC] },
    { id: 'reply_dm', inReplyToId: 'public', recipientTo: [uri('dave')] },
    {
      id: 'reply_expired',
      inReplyToId: 'public',
      recipientTo: [PUBLIC],
      expiresAt: new Date('2000-01-01'),
    },
    {
      id: 'reply_closed',
      inReplyToId: 'group_closed',
      groupId: 'closed',
      recipientTo: [followers('erin')],
    },
    // Older/malformed replies must not bypass the parent gate.
    { id: 'reply_parent_dm', inReplyToId: 'dm_dave', recipientTo: [PUBLIC] },
    {
      id: 'reply_parent_group',
      inReplyToId: 'group_closed',
      recipientTo: [PUBLIC],
    },
    {
      id: 'reply_parent_expired',
      inReplyToId: 'expired',
      recipientTo: [PUBLIC],
    },
  ];
  await db.insert(schema.socialStatuses).values(
    posts.map((post) => ({
      actorId: 'alice',
      uri: `https://visibility.invalid/status/${post.id}`,
      type: 'Note',
      published: new Date('2026-01-01'),
      recipientTo: [],
      recipientCc: [],
      ...post,
    }))
  );
  await db.insert(schema.socialTags).values([
    {
      statusId: 'followers',
      type: 'Mention',
      name: '@carol',
      href: uri('carol'),
    },
    {
      statusId: 'group_closed',
      type: 'Mention',
      name: '@dave',
      href: uri('dave'),
    },
  ]);
  timeline = await import('@/lib/federation/wrappers/timeline');
  status = await import('@/lib/federation/wrappers/status');
  group = await import('@/lib/federation/wrappers/group');
  postsRoute = await import('../app/api/social/actors/[username]/posts/route');
  statusRoute = await import('../app/api/social/statuses/[statusId]/route');
  repliesRoute =
    await import('../app/api/social/statuses/[statusId]/replies/route');
  redirectPage = await import('../app/status/[statusId]/page');
  createRoute = await import('../app/api/social/statuses/route');
  groupPostsRoute =
    await import('../app/api/social/groups/[handle]/posts/route');
  outboxRoute = await import('../app/p/[user]/outbox/route');
  ({ NextRequest } = await import('next/server'));
});

after(async () => {
  await pg.close();
  mock.restoreAll();
});

async function matching(predicate: SQL): Promise<string[]> {
  const { sql, params } = dialect.sqlToQuery(predicate);
  const result = await pg.query<{ id: string }>(
    `SELECT id FROM social_statuses WHERE ${sql} ORDER BY id`,
    params
  );
  return result.rows.map((row) => row.id);
}

const personalIds = [
  'public',
  'unlisted',
  'followers',
  'followers_cc',
  'dm_dave',
  'dm_cc',
  'wrong_followers',
  'expired',
];

async function personal(viewerId?: string) {
  const seen = await matching(visibleTo(viewerId));
  return seen.filter((id) => personalIds.includes(id));
}

describe('production addressing predicate through PgDialect and Postgres', () => {
  for (const [label, actor, expected] of [
    ['anonymous', undefined, ['public', 'unlisted']],
    ['stranger', 'carol', ['public', 'unlisted']],
    ['pending follower', 'erin', ['public', 'unlisted']],
    [
      'accepted follower',
      'bob',
      ['followers', 'followers_cc', 'public', 'unlisted'],
    ],
    [
      'named recipient',
      'dave',
      ['dm_cc', 'dm_dave', 'expired', 'public', 'unlisted'],
    ],
    ['author', 'alice', [...personalIds].sort()],
  ] as const) {
    it(`${label}: exact recipient matrix (following never grants other DMs)`, async () => {
      assert.deepEqual(await personal(actor), expected);
    });
  }
  it('expiry is independent of addressing', async () => {
    assert.ok((await matching(visibleTo('dave'))).includes('expired'));
    assert.ok(
      !(await matching(and(visibleTo('dave'), notExpired())!)).includes(
        'expired'
      )
    );
  });
});

const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

describe('actual wrapper queries against isolated Postgres', () => {
  for (const [label, actor, expected] of [
    ['anonymous', undefined, ['group_open', 'public', 'unlisted']],
    ['stranger', 'carol', ['group_open', 'public', 'unlisted']],
    ['pending follower/member', 'erin', ['group_open', 'public', 'unlisted']],
    ['banned member', 'banned', ['group_open', 'public', 'unlisted']],
    [
      'accepted follower',
      'bob',
      ['followers', 'followers_cc', 'group_open', 'public', 'unlisted'],
    ],
    [
      'member/recipient',
      'dave',
      [
        'dm_cc',
        'dm_dave',
        'group_closed',
        'group_named',
        'group_open',
        'group_public_address',
        'public',
        'unlisted',
      ],
    ],
    [
      'author without membership',
      'alice',
      [
        'dm_cc',
        'dm_dave',
        'followers',
        'followers_cc',
        'group_open',
        'public',
        'unlisted',
        'wrong_followers',
      ],
    ],
  ] as const) {
    it(`getActorPosts: ${label} exact rows`, async () => {
      const result = await timeline.getActorPosts(
        'alice',
        actor,
        undefined,
        50
      );
      assert.deepEqual(ids(result.statuses), expected);
    });
  }

  for (const read of ['getStatus', 'getStatusWithLikeStatus'] as const) {
    it(`${read}: recipient, followers, expiry, and group gates`, async () => {
      const get =
        read === 'getStatus'
          ? status.getStatus
          : timeline.getStatusWithLikeStatus;
      for (const actor of [undefined, 'carol', 'erin', 'bob']) {
        assert.equal(await get('dm_dave', actor), null);
      }
      assert.ok(await get('dm_dave', 'dave'));
      assert.ok(await get('dm_cc', 'dave'));
      assert.ok(await get('dm_dave', 'alice'));
      assert.ok(await get('followers', 'bob'));
      assert.equal(await get('followers', 'erin'), null);
      assert.equal(await get('expired', 'dave'), null);
      assert.ok(await get('unlisted'));
      assert.ok(await get('group_open'));
      assert.ok(await get('group_closed', 'dave'));
      for (const actor of [undefined, 'alice', 'bob', 'erin', 'banned']) {
        for (const id of [
          'group_closed',
          'group_public_address',
          'group_named',
        ]) {
          assert.equal(
            await get(id, actor),
            null,
            `${actor} must not read ${id}`
          );
        }
      }
    });
  }

  it('permalink keeps its story exclusion', async () => {
    assert.equal(
      await timeline.getStatusWithLikeStatus('story', 'alice'),
      null
    );
  });

  it('replies authorize each child independently', async () => {
    assert.deepEqual(ids((await status.getStatusReplies('public')).replies), [
      'reply_public',
    ]);
    assert.deepEqual(
      ids(
        (await status.getStatusReplies('public', undefined, 20, 'bob')).replies
      ),
      ['reply_public']
    );
    assert.deepEqual(
      ids(
        (await status.getStatusReplies('public', undefined, 20, 'dave')).replies
      ),
      ['reply_dm', 'reply_public']
    );
  });

  it('replies require a readable, unexpired parent even if the child is public', async () => {
    for (const parent of ['dm_dave', 'group_closed', 'expired', 'missing']) {
      for (const actor of [undefined, 'bob', 'erin', 'banned']) {
        assert.deepEqual(
          await status.getStatusReplies(parent, undefined, 20, actor),
          {
            replies: [],
            nextCursor: null,
          }
        );
      }
    }
    assert.deepEqual(
      ids(
        (await status.getStatusReplies('dm_dave', undefined, 20, 'dave'))
          .replies
      ),
      ['reply_parent_dm']
    );
    assert.deepEqual(
      ids(
        (await status.getStatusReplies('group_closed', undefined, 20, 'dave'))
          .replies
      ),
      ['reply_closed', 'reply_parent_group']
    );
  });

  it('reply and actor-post pagination keep their existing argument order', async () => {
    const first = await status.getStatusReplies('public', undefined, 1, 'dave');
    assert.deepEqual(ids(first.replies), ['reply_dm']);
    assert.equal(first.nextCursor, 'reply_dm');
    const second = await status.getStatusReplies(
      'public',
      first.nextCursor!,
      1,
      'dave'
    );
    assert.deepEqual(ids(second.replies), ['reply_public']);
    assert.equal(second.nextCursor, null);
    const posts = await timeline.getActorPosts('alice', 'dave', 'public', 1);
    assert.equal(posts.statuses.length, 1);
    assert.equal(posts.statuses[0].id, 'group_public_address');
    assert.equal(posts.nextCursor, 'group_public_address');
  });

  it('profile replies option still filters private children', async () => {
    const posts = await timeline.getActorPosts(
      'alice',
      undefined,
      undefined,
      100,
      true
    );
    assert.ok(ids(posts.statuses).includes('reply_public'));
    assert.ok(!ids(posts.statuses).includes('reply_dm'));
    assert.ok(!ids(posts.statuses).includes('reply_closed'));
  });

  it('public timeline excludes unlisted and private groups despite public addressing', async () => {
    assert.deepEqual(
      ids(
        (await timeline.getPublicTimeline(undefined, undefined, 50)).statuses
      ),
      ['public']
    );
  });

  it('mention tags cannot grant personal private reads; group members keep mentions', async () => {
    assert.deepEqual(
      ids((await timeline.getAtMeTimeline('carol')).statuses),
      []
    );
    assert.ok(
      ids((await timeline.getAtMeTimeline('dave')).statuses).includes(
        'group_closed'
      )
    );
  });
});

describe('real route handlers with session/active-actor boundaries stubbed', () => {
  it('posts API withholds private rows from anonymous and pending-follower viewers', async () => {
    for (const actor of [undefined, 'erin']) {
      viewer = actor;
      signedIn = actor !== undefined;
      const response = await postsRoute.GET(
        new NextRequest('https://visibility.invalid/api?limit=50'),
        { params: Promise.resolve({ username: 'alice' }) }
      );
      assert.deepEqual(ids((await response.json()).data.statuses), [
        'group_open',
        'public',
        'unlisted',
      ]);
    }
  });

  it('posts API resolves the active actor, not account id, including replies/pagination', async () => {
    signedIn = true;
    viewer = 'dave';
    const response = await postsRoute.GET(
      new NextRequest('https://visibility.invalid/api?limit=50&replies=true'),
      { params: Promise.resolve({ username: 'alice' }) }
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(ids(body.data.statuses).includes('dm_dave'));
    assert.ok(ids(body.data.statuses).includes('reply_dm'));
    assert.ok(!ids(body.data.statuses).includes('followers'));
  });

  it('single status API returns indistinguishable 404s to unauthorized and actorless sessions', async () => {
    for (const actor of [undefined, 'carol', 'bob']) {
      viewer = actor;
      signedIn = actor !== undefined;
      const response = await statusRoute.GET(
        new NextRequest('https://visibility.invalid/api'),
        { params: Promise.resolve({ statusId: 'dm_dave' }) }
      );
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        success: false,
        error: 'Status not found',
      });
    }
    signedIn = true;
    viewer = undefined;
    assert.equal(
      (
        await statusRoute.GET(
          new NextRequest('https://visibility.invalid/api'),
          { params: Promise.resolve({ statusId: 'dm_dave' }) }
        )
      ).status,
      404
    );
    viewer = 'dave';
    assert.equal(
      (
        await statusRoute.GET(
          new NextRequest('https://visibility.invalid/api'),
          { params: Promise.resolve({ statusId: 'dm_dave' }) }
        )
      ).status,
      200
    );
  });

  it('replies API threads viewer, cursor and limit without shifting parameters', async () => {
    signedIn = true;
    viewer = 'dave';
    const first = await repliesRoute.GET(
      new NextRequest('https://visibility.invalid/api?limit=1'),
      { params: Promise.resolve({ statusId: 'public' }) }
    );
    const firstBody = await first.json();
    assert.deepEqual(ids(firstBody.data.replies), ['reply_dm']);
    assert.equal(firstBody.data.nextCursor, 'reply_dm');
    const response = await repliesRoute.GET(
      new NextRequest('https://visibility.invalid/api?cursor=reply_dm&limit=1'),
      { params: Promise.resolve({ statusId: 'public' }) }
    );
    const body = await response.json();
    assert.deepEqual(ids(body.data.replies), ['reply_public']);
    assert.equal(body.data.nextCursor, null);
    signedIn = false;
    viewer = undefined;
    const denied = await repliesRoute.GET(
      new NextRequest('https://visibility.invalid/api'),
      { params: Promise.resolve({ statusId: 'dm_dave' }) }
    );
    assert.deepEqual((await denied.json()).data, {
      replies: [],
      nextCursor: null,
    });
  });

  it('legacy redirect resolves the active actor without revealing private status existence', async () => {
    signedIn = true;
    viewer = 'dave';
    await assert.rejects(
      redirectPage.default({
        params: Promise.resolve({ statusId: 'dm_dave' }),
      }),
      { message: 'REDIRECT:/p/alice/dm_dave/' }
    );
    for (const actor of [undefined, 'bob']) {
      viewer = actor;
      signedIn = actor !== undefined;
      await assert.rejects(
        redirectPage.default({
          params: Promise.resolve({ statusId: 'dm_dave' }),
        }),
        { message: 'NOT_FOUND' }
      );
    }
  });
});

describe('Panas feed uses mutual follows without narrowing joined groups', () => {
  const viewerId = 'home_viewer';
  const extraPanas = Array.from({ length: 25 }, (_, i) => `home_extra_${i}`);
  const expected = [
    'group_closed',
    'group_named',
    'group_open',
    'group_public_address',
    'home_beyond_cap',
    'home_mutual',
    'home_mutual_group',
    'home_own',
    'home_unlisted',
  ];

  before(async () => {
    const actors = [
      viewerId,
      'home_pana',
      'home_following',
      'home_follower',
      'home_pending_in',
      'home_pending_out',
      'home_rejected_in',
      'home_rejected_out',
      'home_muted',
      'home_blocked',
      'home_group',
      ...extraPanas,
    ];
    await db.insert(schema.socialActors).values(
      actors.map((id) => ({
        id,
        username: id,
        type: id === 'home_group' ? 'Group' : 'Person',
        domain: 'visibility.invalid',
        uri: uri(id),
        followersUrl: followers(id),
        followingUrl: `${uri(id)}/following`,
        inboxUrl: `${uri(id)}/inbox`,
        outboxUrl: `${uri(id)}/outbox`,
        publicKey: 'fixture',
      }))
    );

    const edge = (
      from: string,
      to: string,
      state: 'accepted' | 'pending' | 'rejected' = 'accepted'
    ) => ({
      actorId: from,
      targetActorId: to,
      status: state,
      acceptedAt: state === 'accepted' ? new Date('2026-01-01') : null,
    });
    await db.insert(schema.socialFollows).values([
      edge(viewerId, 'home_pana'),
      edge('home_pana', viewerId),
      edge(viewerId, 'home_following'),
      edge('home_follower', viewerId),
      edge(viewerId, 'home_pending_in'),
      edge('home_pending_in', viewerId, 'pending'),
      edge(viewerId, 'home_pending_out', 'pending'),
      edge('home_pending_out', viewerId),
      edge(viewerId, 'home_rejected_in'),
      edge('home_rejected_in', viewerId, 'rejected'),
      edge(viewerId, 'home_rejected_out', 'rejected'),
      edge('home_rejected_out', viewerId),
      edge(viewerId, 'home_muted'),
      edge('home_muted', viewerId),
      edge(viewerId, 'home_blocked'),
      edge('home_blocked', viewerId),
      ...extraPanas.flatMap((id, i) => [
        {
          ...edge(viewerId, id),
          acceptedAt: new Date(i === 24 ? '2025-01-01' : '2026-01-01'),
        },
        edge(id, viewerId),
      ]),
    ]);
    await db.insert(schema.socialGroupMembers).values([
      { actorId: viewerId, groupId: 'open', status: 'active' },
      { actorId: viewerId, groupId: 'closed', status: 'active' },
      { actorId: 'home_pending_in', groupId: 'closed', status: 'pending' },
      { actorId: 'home_rejected_in', groupId: 'closed', status: 'banned' },
    ]);
    await db.insert(schema.socialGroups).values({
      id: 'home_unjoined',
      actorId: 'home_group',
      visibility: 'public',
    });
    await db.insert(schema.socialBlocks).values([
      { actorId: viewerId, targetActorId: 'home_muted', kind: 'mute' },
      { actorId: viewerId, targetActorId: 'home_blocked', kind: 'block' },
    ]);

    const post = (
      id: string,
      actorId: string,
      overrides: Partial<typeof schema.socialStatuses.$inferInsert> = {}
    ) => ({
      id,
      actorId,
      uri: `https://visibility.invalid/status/${id}`,
      type: 'Note',
      published: new Date('2026-01-01'),
      recipientTo: [PUBLIC],
      recipientCc: [],
      ...overrides,
    });
    await db.insert(schema.socialStatuses).values([
      post('home_own', viewerId),
      post('home_mutual', 'home_pana'),
      post('home_unlisted', 'home_pana', {
        recipientTo: [followers('home_pana')],
        recipientCc: [PUBLIC],
      }),
      post('home_oneway_out', 'home_following'),
      post('home_oneway_in', 'home_follower'),
      post('home_pending_in', 'home_pending_in'),
      post('home_pending_out', 'home_pending_out'),
      post('home_rejected_in', 'home_rejected_in'),
      post('home_rejected_out', 'home_rejected_out'),
      post('home_muted', 'home_muted'),
      post('home_blocked', 'home_blocked'),
      post('home_beyond_cap', extraPanas[24]),
      post('home_mutual_group', 'home_pana', { groupId: 'open' }),
      post('home_unjoined_group', 'home_pana', { groupId: 'home_unjoined' }),
      post('home_muted_group', 'home_muted', { groupId: 'open' }),
      post('home_blocked_group', 'home_blocked', { groupId: 'closed' }),
      post('home_dm', 'home_pana', { recipientTo: [uri(viewerId)] }),
      post('home_story', 'home_pana', { type: schema.STATUS_TYPE_STORY }),
      post('home_reply', 'home_pana', { inReplyToId: 'home_mutual' }),
      post('home_expired', 'home_pana', { expiresAt: new Date('2000-01-01') }),
      post('home_draft', 'home_pana', { published: null }),
    ]);
  });

  it('returns exactly mutual posts, own posts, and active joined-group posts', async () => {
    const result = await timeline.getHomeTimeline(viewerId, undefined, 50);
    assert.deepEqual(ids(result.statuses), expected);
    assert.equal(result.nextCursor, null);
    assert.equal(
      result.statuses.filter((row) => row.id === 'home_mutual_group').length,
      1
    );
  });

  it('does not cap connections at the profile list page size', async () => {
    const { listMutualFollowIds } =
      await import('@/lib/federation/wrappers/follow');
    assert.deepEqual(
      new Set(await listMutualFollowIds(viewerId)),
      new Set(['home_pana', 'home_muted', 'home_blocked', ...extraPanas])
    );
    assert.ok(
      ids(
        (await timeline.getHomeTimeline(viewerId, undefined, 50)).statuses
      ).includes('home_beyond_cap')
    );
  });

  it('keeps own posts even when the viewer has no mutual follows', async () => {
    assert.deepEqual(
      ids((await timeline.getHomeTimeline('home_follower')).statuses),
      ['home_oneway_in']
    );
  });

  it('pending and banned memberships do not add private-group posts', async () => {
    for (const actor of ['home_pending_in', 'home_rejected_in']) {
      assert.deepEqual(ids((await timeline.getHomeTimeline(actor)).statuses), [
        actor,
      ]);
    }
  });

  it('losing reciprocity removes personal posts but keeps joined-group posts', async () => {
    const reverse = and(
      eq(schema.socialFollows.actorId, 'home_pana'),
      eq(schema.socialFollows.targetActorId, viewerId)
    );
    await db
      .update(schema.socialFollows)
      .set({ status: 'pending' })
      .where(reverse);
    try {
      assert.deepEqual(
        ids((await timeline.getHomeTimeline(viewerId, undefined, 50)).statuses),
        expected.filter((id) => id !== 'home_mutual' && id !== 'home_unlisted')
      );
    } finally {
      await db
        .update(schema.socialFollows)
        .set({ status: 'accepted' })
        .where(reverse);
    }
  });

  it('pagination preserves the same audience without duplicates', async () => {
    const seen: string[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await timeline.getHomeTimeline(viewerId, cursor, 2);
      seen.push(...page.statuses.map((row) => row.id));
      cursor = page.nextCursor ?? undefined;
      if (cursor) {
        assert.ok(!cursors.has(cursor), 'pagination must advance');
        cursors.add(cursor);
      }
    } while (cursor);
    assert.deepEqual(seen.sort(), expected);
  });

  it('Everyone still includes public posts from one-way connections', async () => {
    const seen = ids(
      (await timeline.getPublicTimeline(viewerId, undefined, 50)).statuses
    );
    assert.ok(seen.includes('home_oneway_out'));
    assert.ok(seen.includes('home_oneway_in'));
    for (const id of [
      'home_unlisted',
      'home_dm',
      'home_muted',
      'home_blocked',
      'group_closed',
    ]) {
      assert.ok(!seen.includes(id), `${id} must not enter Everyone`);
    }
    assert.ok(seen.includes('home_unjoined_group'));
    const outsider = ids(
      (await timeline.getPublicTimeline('home_follower', undefined, 50))
        .statuses
    );
    assert.ok(!outsider.includes('group_public_address'));
  });
});

describe('new mutual-only posts preserve their circle without becoming messages', () => {
  const owner = 'circle_owner';
  const pana = 'circle_pana';
  const media = {
    type: 'image',
    mediaType: 'image/png',
    url: 'https://visibility.invalid/photo.png',
    name: 'A little moment',
  };
  let rootId: string;
  let replyId: string;
  let legacyId: string;

  const postPanas = (actorId: string, inReplyToId?: string) =>
    status.createStatus(
      actorId,
      'For my mutual circle',
      undefined,
      inReplyToId,
      'private',
      undefined,
      undefined,
      undefined,
      'cc-by-4',
      { audience: 'panas' }
    );

  const apiPost = (body: unknown, actorId = owner) => {
    signedIn = true;
    viewer = actorId;
    return createRoute.POST(
      new NextRequest('https://visibility.invalid/api/social/statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  };

  before(async () => {
    const actors = [
      owner,
      pana,
      'circle_outgoing',
      'circle_follower',
      'circle_pending_in',
      'circle_pending_out',
      'circle_stranger',
      'circle_new',
      'circle_empty',
      'circle_large',
      'circle_room',
      ...Array.from({ length: 27 }, (_, i) => `circle_extra_${i}`),
    ];
    await db.insert(schema.socialActors).values(
      actors.map((id) => ({
        id,
        username: id,
        type: id === 'circle_room' ? 'Group' : 'Person',
        domain: 'visibility.invalid',
        uri: uri(id),
        followersUrl: followers(id),
        followingUrl: `${uri(id)}/following`,
        inboxUrl: `${uri(id)}/inbox`,
        outboxUrl: `${uri(id)}/outbox`,
        publicKey: 'fixture',
      }))
    );
    const edge = (
      actorId: string,
      targetActorId: string,
      state: 'accepted' | 'pending' = 'accepted'
    ) => ({
      actorId,
      targetActorId,
      status: state,
    });
    await db
      .insert(schema.socialFollows)
      .values([
        edge(owner, pana),
        edge(pana, owner),
        edge(owner, 'circle_outgoing'),
        edge('circle_follower', owner),
        edge(owner, 'circle_pending_in'),
        edge('circle_pending_in', owner, 'pending'),
        edge(owner, 'circle_pending_out', 'pending'),
        edge('circle_pending_out', owner),
        edge(pana, 'circle_stranger'),
        edge('circle_stranger', pana),
        ...Array.from({ length: 27 }, (_, i) => `circle_extra_${i}`).flatMap(
          (id) => [edge('circle_large', id), edge(id, 'circle_large')]
        ),
      ]);
    await db.insert(schema.socialGroups).values({
      id: 'circle_room',
      actorId: 'circle_room',
      visibility: 'private',
    });
    await db.insert(schema.socialGroupMembers).values({
      groupId: 'circle_room',
      actorId: owner,
      status: 'active',
    });

    const root = await postPanas(owner);
    assert.ok(root.success);
    rootId = root.status.id;
    const reply = await status.createStatus(
      pana,
      'A reply',
      undefined,
      rootId,
      'private'
    );
    assert.ok(reply.success);
    replyId = reply.status.id;
    const legacy = await status.createStatus(
      owner,
      'Legacy followers post',
      undefined,
      undefined,
      'private'
    );
    assert.ok(legacy.success);
    legacyId = legacy.status.id;
  });

  it('records only complete accepted mutual recipients, with no public or follower broadcast', async () => {
    const row = await db.query.socialStatuses.findFirst({
      where: eq(schema.socialStatuses.id, rootId),
    });
    assert.ok(row);
    assert.equal(row.type, STATUS_TYPE_PANAS);
    assert.deepEqual(row.recipientTo, [uri(pana)]);
    assert.deepEqual(row.recipientCc, [uri(owner)]);
    assert.equal(row.expiresAt, null);
    assert.equal(row.groupId, null);
    assert.equal(
      getVisibilityFromRecipients(row.recipientTo, row.recipientCc, row.type),
      'private'
    );
    assert.equal(
      (
        await db.query.socialDmRequests.findMany({
          where: eq(schema.socialDmRequests.senderActorId, owner),
        })
      ).length,
      0
    );
  });

  it('authorizes mutuals and the author, not one-way, pending, or anonymous readers', async () => {
    for (const actorId of [owner, pana]) {
      assert.equal((await status.getStatus(rootId, actorId))?.id, rootId);
      assert.equal(
        (await timeline.getStatusWithLikeStatus(rootId, actorId))?.id,
        rootId
      );
    }
    for (const actorId of [
      undefined,
      'circle_outgoing',
      'circle_follower',
      'circle_pending_in',
      'circle_pending_out',
      'circle_stranger',
    ]) {
      assert.equal(await status.getStatus(rootId, actorId), null);
      assert.equal(
        await timeline.getStatusWithLikeStatus(rootId, actorId),
        null
      );
    }
  });

  it('keeps legacy private posts followers-only rather than reinterpreting old rows', async () => {
    const legacy = await status.getStatus(legacyId, 'circle_follower');
    assert.equal(legacy?.type, 'Note');
    assert.deepEqual(legacy?.recipientTo, [followers(owner)]);
    assert.equal(await status.getStatus(legacyId, 'circle_outgoing'), null);
  });

  it('includes authorized new Panas posts in Panas, never Everyone or anonymous profile posts', async () => {
    for (const actorId of [owner, pana]) {
      assert.ok(
        ids((await timeline.getHomeTimeline(actorId)).statuses).includes(rootId)
      );
    }
    assert.ok(
      !ids(
        (await timeline.getHomeTimeline('circle_follower')).statuses
      ).includes(rootId)
    );
    assert.ok(
      !ids(
        (await timeline.getPublicTimeline(owner, undefined, 50)).statuses
      ).includes(rootId)
    );
    assert.ok(
      !ids(
        (await timeline.getActorPosts(owner, undefined, undefined, 50)).statuses
      ).includes(rootId)
    );
  });

  it("inherits the original circle for replies, not the replier's different mutuals", async () => {
    const reply = await status.getStatus(replyId, owner);
    assert.equal(reply?.type, STATUS_TYPE_PANAS);
    assert.deepEqual(reply?.recipientTo, [uri(pana)]);
    assert.deepEqual(reply?.recipientCc, [uri(owner)]);
    assert.equal(await status.getStatus(replyId, 'circle_stranger'), null);
    assert.deepEqual(
      ids(
        (await status.getStatusReplies(rootId, undefined, 20, owner)).replies
      ),
      [replyId]
    );
    assert.deepEqual(
      ids(
        (
          await status.getStatusReplies(
            rootId,
            undefined,
            20,
            'circle_stranger'
          )
        ).replies
      ),
      []
    );
  });

  it('refuses widened and unauthorized replies before creating any orphan row', async () => {
    const beforeRows = await db
      .select({ id: schema.socialStatuses.id })
      .from(schema.socialStatuses);
    const widened = await status.createStatus(
      pana,
      'Not public',
      undefined,
      rootId,
      'public'
    );
    assert.equal(widened.success, false);
    for (const visibility of ['private', 'public'] as const) {
      const denied = await status.createStatus(
        'circle_stranger',
        'Not authorized',
        undefined,
        rootId,
        visibility
      );
      assert.deepEqual(denied, {
        success: false,
        error: 'Parent status not found',
      });
    }
    const reinterpret = await postPanas(pana, legacyId);
    assert.equal(reinterpret.success, false);
    assert.deepEqual(
      await db
        .select({ id: schema.socialStatuses.id })
        .from(schema.socialStatuses),
      beforeRows
    );
  });

  it('revokes other recipients when reciprocity ends, including access to thread replies', async () => {
    const reverse = and(
      eq(schema.socialFollows.actorId, pana),
      eq(schema.socialFollows.targetActorId, owner)
    );
    await db
      .update(schema.socialFollows)
      .set({ status: 'pending' })
      .where(reverse);
    try {
      assert.equal(await status.getStatus(rootId, pana), null);
      assert.ok(
        !ids((await timeline.getHomeTimeline(pana)).statuses).includes(rootId)
      );
      assert.deepEqual(
        ids(
          (await status.getStatusReplies(rootId, undefined, 20, pana)).replies
        ),
        []
      );
    } finally {
      await db
        .update(schema.socialFollows)
        .set({ status: 'accepted' })
        .where(reverse);
    }
  });

  it('does not retroactively disclose old circle posts to newly mutual people', async () => {
    await db.insert(schema.socialFollows).values([
      { actorId: owner, targetActorId: 'circle_new', status: 'accepted' },
      { actorId: 'circle_new', targetActorId: owner, status: 'accepted' },
    ]);
    assert.equal(await status.getStatus(rootId, 'circle_new'), null);
    assert.equal(await status.getStatus(replyId, 'circle_new'), null);
  });

  it('does not cap the publishing audience at the 24-person profile page', async () => {
    const created = await postPanas('circle_large');
    assert.ok(created.success);
    assert.ok(Array.isArray(created.status.recipientTo));
    assert.equal(created.status.recipientTo.length, 27);
    assert.ok(created.status.recipientTo.includes(uri('circle_extra_26')));
    assert.equal(
      (await status.getStatus(created.status.id, 'circle_extra_26'))?.id,
      created.status.id
    );
  });

  it('allows an empty mutual circle without falling back to public or DM delivery', async () => {
    const created = await postPanas('circle_empty');
    assert.ok(created.success);
    assert.deepEqual(created.status.recipientTo, []);
    assert.deepEqual(created.status.recipientCc, [uri('circle_empty')]);
    assert.equal(await status.getStatus(created.status.id), null);
    assert.equal(
      (await status.getStatus(created.status.id, 'circle_empty'))?.id,
      created.status.id
    );
    assert.ok(
      !ids(
        (await timeline.getSentDirectMessages('circle_empty')).statuses
      ).includes(created.status.id)
    );
  });

  it('never treats circle notes as inbox, sent, held mail, or one-to-one conversations', async () => {
    for (const actorId of [owner, pana]) {
      for (const result of [
        await timeline.getReceivedDirectMessages(actorId),
        await timeline.getSentDirectMessages(actorId),
      ]) {
        assert.ok(!ids(result.statuses).includes(rootId));
        assert.ok(!ids(result.statuses).includes(replyId));
      }
      assert.ok(
        !(await timeline.getDirectConversations(actorId)).some(
          (row) => row.lastMessage.id === rootId
        )
      );
    }
    assert.deepEqual(await timeline.getDirectConversation(owner, pana), []);
    assert.ok(
      !ids((await timeline.getAtMeTimeline(pana)).statuses).includes(rootId)
    );
  });

  it('preserves real mentions during a held DM request, without moving circle posts into Requests', async () => {
    await db.insert(schema.socialDmRequests).values({
      senderActorId: owner,
      recipientActorId: pana,
      state: 'pending',
    });
    await db.insert(schema.socialTags).values({
      statusId: rootId,
      type: 'Mention',
      name: `@${pana}`,
      href: uri(pana),
    });
    assert.ok(
      !ids(await timeline.getHeldRequestStatuses(pana)).includes(rootId)
    );
    assert.ok(
      ids((await timeline.getAtMeTimeline(pana)).statuses).includes(rootId)
    );
  });

  it('declining mail cannot strip a recipient from a social circle post', async () => {
    const { deleteDirectThreadRequest } =
      await import('@/lib/federation/wrappers/dm-gate');
    assert.equal(await deleteDirectThreadRequest(pana, owner), true);
    const row = await db.query.socialStatuses.findFirst({
      where: eq(schema.socialStatuses.id, rootId),
    });
    assert.deepEqual(row?.recipientTo, [uri(pana)]);
    assert.equal((await status.getStatus(rootId, pana))?.id, rootId);
  });

  it('defends public readers and the federation outbox even against malformed public addressing', async () => {
    const id = 'circle_malformed_public';
    await db.insert(schema.socialStatuses).values({
      id,
      actorId: owner,
      type: STATUS_TYPE_PANAS,
      content: 'Still private',
      uri: `${uri(owner)}/statuses/${id}`,
      published: new Date(),
      recipientTo: [PUBLIC],
      recipientCc: [uri(owner)],
    });
    assert.equal(await status.getStatus(id), null);
    assert.ok(
      !ids(
        (await timeline.getPublicTimeline(undefined, undefined, 50)).statuses
      ).includes(id)
    );
    const response = await outboxRoute.GET(
      new NextRequest(`https://visibility.invalid/p/${owner}/outbox?page=true`),
      { params: Promise.resolve({ user: owner }) }
    );
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).orderedItems, []);
  });

  it('accepts media-only posts through the real route and inherits the saved account license', async () => {
    const response = await apiPost({
      attachments: [media],
      visibility: 'public',
    });
    assert.equal(response.status, 200);
    const created = (await response.json()).data.status;
    assert.equal(created.content, '');
    assert.equal(created.ccLicense, 'cc-0');
    assert.deepEqual(created.recipientTo, [PUBLIC]);
    const attachments = await db.query.socialAttachments.findMany({
      where: eq(schema.socialAttachments.statusId, created.id),
    });
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].url, media.url);
  });

  it('retains explicit API license overrides and supports media-only Panas posts', async () => {
    const response = await apiPost({
      attachments: [media],
      visibility: 'private',
      audience: 'panas',
      ccLicense: 'cc-by-sa-4',
    });
    assert.equal(response.status, 200);
    const created = (await response.json()).data.status;
    assert.equal(created.type, STATUS_TYPE_PANAS);
    assert.equal(created.ccLicense, 'cc-by-sa-4');
    assert.equal(await status.getStatus(created.id, 'circle_follower'), null);
  });

  it('rejects empty posts, invalid bodies, and invalid Panas audience combinations', async () => {
    const beforeRows = await db
      .select({ id: schema.socialStatuses.id })
      .from(schema.socialStatuses);
    for (const body of [
      null,
      [],
      { content: ' ' },
      { content: 7, attachments: [media] },
      { content: 'No widening', audience: 'panas', visibility: 'public' },
      {
        content: 'No unknown audience',
        audience: 'friends',
        visibility: 'private',
      },
    ]) {
      assert.equal((await apiPost(body)).status, 400);
    }
    assert.deepEqual(
      await db
        .select({ id: schema.socialStatuses.id })
        .from(schema.socialStatuses),
      beforeRows
    );
    assert.equal((await status.createStatus(owner, '')).success, false);
  });

  it('guards Panas likes and unlike counts with the same audience as reading', async () => {
    for (const actorId of ['circle_follower', 'circle_stranger']) {
      for (const method of [status.likeStatus, status.unlikeStatus]) {
        assert.deepEqual(await method(actorId, rootId), {
          success: false,
          liked: false,
          likesCount: 0,
          error: 'Status not found',
        });
      }
    }
    assert.equal((await status.likeStatus(pana, rootId)).liked, true);
    assert.equal((await status.unlikeStatus(pana, rootId)).liked, false);
  });

  it('keeps group media-only posts on the group route with member-only addressing and saved licensing', async () => {
    signedIn = true;
    viewer = owner;
    const request = () =>
      new NextRequest(
        'https://visibility.invalid/api/social/groups/circle_room/posts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attachments: [media],
            visibility: 'unlisted',
          }),
        }
      );
    const params = { params: Promise.resolve({ handle: 'circle_room' }) };
    const response = await groupPostsRoute.POST(request(), params);
    assert.equal(response.status, 201);
    const created = (await response.json()).data.status;
    assert.equal(created.groupId, 'circle_room');
    assert.equal(created.ccLicense, 'cc-0');
    assert.deepEqual(created.recipientTo, [followers('circle_room')]);
    assert.deepEqual(created.recipientCc, []);
    assert.equal(await status.getStatus(created.id, pana), null);
    viewer = pana;
    assert.equal((await groupPostsRoute.POST(request(), params)).status, 403);
  });
});

describe('local public timeline', () => {
  const localActorId = 'everyone_legacy';
  const remoteActorId = 'everyone_remote';
  const profileId = 'everyone_legacy_profile';

  const post = async (body: {
    visibility: 'public' | 'unlisted' | 'private';
    audience?: 'panas';
  }) => {
    signedIn = true;
    viewer = localActorId;
    const response = await createRoute.POST(
      new NextRequest('https://visibility.invalid/api/social/statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'A legacy local account', ...body }),
      })
    );
    assert.equal(response.status, 200);
    return (await response.json()).data.status;
  };

  before(async () => {
    await db.insert(schema.profiles).values({
      id: profileId,
      email: 'legacy@visibility.invalid',
      name: 'Legacy local member',
      socialEligible: true,
    });
    await db.insert(schema.socialActors).values(
      [
        { id: localActorId, domain: 'legacy.invalid', profileId },
        { id: remoteActorId, domain: 'remote.invalid' },
      ].map(({ id, domain, profileId }) => {
        const actorUri = `https://${domain}/p/${id}`;
        return {
          id,
          username: id,
          domain,
          profileId,
          uri: actorUri,
          followersUrl: `${actorUri}/followers`,
          followingUrl: `${actorUri}/following`,
          inboxUrl: `${actorUri}/inbox`,
          outboxUrl: `${actorUri}/outbox`,
          publicKey: 'fixture',
        };
      })
    );
  });

  it('shows a real public API write in Everyone and the author Panas feed despite a legacy domain', async () => {
    const created = await post({ visibility: 'public' });
    assert.deepEqual(created.recipientTo, [PUBLIC]);
    assert.ok(
      ids((await timeline.getHomeTimeline(localActorId)).statuses).includes(
        created.id
      )
    );

    for (const authenticated of [false, true]) {
      signedIn = authenticated;
      viewer = authenticated ? localActorId : undefined;
      const response = await createRoute.GET(
        new NextRequest(
          'https://visibility.invalid/api/social/statuses?limit=50'
        )
      );
      assert.equal(response.status, 200);
      const posts = (await response.json()).data.statuses;
      assert.ok(ids(posts).includes(created.id));
    }
    const actor = await db.query.socialActors.findFirst({
      where: eq(schema.socialActors.id, localActorId),
    });
    assert.equal(actor?.domain, 'legacy.invalid');
    assert.equal(actor?.uri, `https://legacy.invalid/p/${localActorId}`);
  });

  it('does not widen unlisted, followers-only, or Panas posts from legacy-domain local accounts', async () => {
    const hiddenIds: string[] = [];
    for (const body of [
      { visibility: 'unlisted' },
      { visibility: 'private' },
      { visibility: 'private', audience: 'panas' },
    ] as const) {
      hiddenIds.push((await post(body)).id);
    }
    for (const actorId of [undefined, localActorId]) {
      const seen = ids(
        (await timeline.getPublicTimeline(actorId, undefined, 50)).statuses
      );
      for (const id of hiddenIds) {
        assert.ok(!seen.includes(id), `${id} must not enter Everyone`);
      }
    }
  });

  it('filters remote authors before limiting pages and retains canonical-domain actors without profiles', async () => {
    const localIds = [
      'zz_everyone_06',
      'zz_everyone_05',
      'zz_everyone_03',
      'zz_everyone_02',
    ];
    const authors = [
      remoteActorId,
      remoteActorId,
      remoteActorId,
      localActorId,
      'alice',
      remoteActorId,
      localActorId,
      'alice',
      remoteActorId,
    ];
    await db.insert(schema.socialStatuses).values(
      authors.map((actorId, i) => {
        const id = `zz_everyone_0${9 - i}`;
        return {
          id,
          actorId,
          uri: `https://visibility.invalid/status/${id}`,
          type: 'Note',
          published: new Date('2100-01-01'),
          recipientTo: [PUBLIC],
          recipientCc: [],
        };
      })
    );

    const first = await timeline.getPublicTimeline(undefined, undefined, 2);
    assert.deepEqual(
      first.statuses.map((row) => row.id),
      localIds.slice(0, 2)
    );
    assert.equal(first.nextCursor, localIds[1]);
    assert.ok(first.nextCursor);
    const second = await timeline.getPublicTimeline(
      undefined,
      first.nextCursor,
      2
    );
    assert.deepEqual(
      second.statuses.map((row) => row.id),
      localIds.slice(2)
    );
    assert.ok(
      [...first.statuses, ...second.statuses].every(
        (row) => row.actorId !== remoteActorId
      )
    );
  });

  it('still excludes blocked and muted legacy-domain local authors', async () => {
    for (const kind of ['block', 'mute'] as const) {
      await db.insert(schema.socialBlocks).values({
        actorId: 'bob',
        targetActorId: localActorId,
        kind,
      });
      try {
        const page = await timeline.getPublicTimeline('bob', undefined, 50);
        assert.ok(page.statuses.some((row) => row.actorId === 'alice'));
        assert.ok(page.statuses.every((row) => row.actorId !== localActorId));
      } finally {
        await db
          .delete(schema.socialBlocks)
          .where(
            and(
              eq(schema.socialBlocks.actorId, 'bob'),
              eq(schema.socialBlocks.targetActorId, localActorId)
            )
          );
      }
    }
  });
});

describe('readable comment threads', () => {
  const rootId = 'comments_root';
  const otherRootId = 'comments_other_thread';
  const orderedIds = ['comments_z', 'comments_a', 'comments_b', 'comments_m'];

  before(async () => {
    const post = (id: string) => ({
      id,
      actorId: 'alice',
      uri: `https://visibility.invalid/status/${id}`,
      type: 'Note',
      recipientTo: [PUBLIC],
      recipientCc: [],
      published: new Date('2026-02-01'),
    });
    await db.insert(schema.socialStatuses).values([
      post(rootId),
      post(otherRootId),
      ...orderedIds.map((id, i) => ({
        ...post(id),
        inReplyToId: rootId,
        published: new Date(`2026-03-0${Math.min(i + 1, 3)}`),
      })),
    ]);
  });

  it('paginates chronologically without skipping random IDs or duplicating timestamp ties', async () => {
    let cursor: string | undefined;
    const seen: string[] = [];
    for (const expectedId of orderedIds) {
      const page = await status.getStatusReplies(rootId, cursor, 1);
      assert.deepEqual(
        page.replies.map((reply) => reply.id),
        [expectedId]
      );
      seen.push(page.replies[0].id);
      if (expectedId === orderedIds[orderedIds.length - 1]) {
        assert.equal(page.nextCursor, null);
      } else {
        assert.ok(page.nextCursor);
      }
      cursor = page.nextCursor ?? undefined;
    }
    assert.deepEqual(seen, orderedIds);
  });

  it('does not accept a cursor from another thread as a comment-page boundary', async () => {
    assert.deepEqual(await status.getStatusReplies(rootId, otherRootId, 1), {
      replies: [],
      nextCursor: null,
    });
  });

  it('expands a two-comment preview into a normal page without gaps or repeated comments', async () => {
    const preview = await status.getStatusReplies(rootId, undefined, 2);
    assert.deepEqual(
      preview.replies.map((reply) => reply.id),
      orderedIds.slice(0, 2)
    );
    assert.ok(preview.nextCursor);
    const expanded = await status.getStatusReplies(
      rootId,
      preview.nextCursor,
      20
    );
    assert.deepEqual(
      expanded.replies.map((reply) => reply.id),
      orderedIds.slice(2)
    );
    assert.equal(expanded.nextCursor, null);
    assert.deepEqual(
      [...preview.replies, ...expanded.replies].map((reply) => reply.id),
      orderedIds
    );
  });

  it('returns the current viewer like state without exposing the joined like rows', async () => {
    assert.equal((await status.likeStatus('bob', orderedIds[0])).liked, true);
    for (const actorId of ['bob', 'carol', undefined]) {
      signedIn = Boolean(actorId);
      viewer = actorId;
      const response = await repliesRoute.GET(
        new NextRequest(
          `https://visibility.invalid/api/social/statuses/${rootId}/replies?limit=1`
        ),
        { params: Promise.resolve({ statusId: rootId }) }
      );
      assert.equal(response.status, 200);
      const reply = (await response.json()).data.replies[0];
      assert.equal(reply.id, orderedIds[0]);
      assert.equal(reply.liked, actorId === 'bob');
      assert.equal(reply.likesCount, 1);
      assert.ok(!('likes' in reply));
      assert.ok(!('privateKey' in reply.actor));
    }
  });
});
