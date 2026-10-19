import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { and, eq, type SQL } from 'drizzle-orm';
import * as schema from '@/lib/schema';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const dialect = new PgDialect();
const uri = (actor: string) => `https://visibility.invalid/p/${actor}`;
const followers = (actor: string) => `${uri(actor)}/followers`;
let viewer: string | undefined;
let signedIn = false;
let timeline: typeof import('@/lib/federation/wrappers/timeline');
let status: typeof import('@/lib/federation/wrappers/status');

// Replace DB/auth/navigation boundaries and forward the federation barrel to
// real wrappers. Group authorization, relational SQL, and GET handlers execute.
mock.module(import.meta.resolve('../lib/db.ts'), {
  namedExports: { db },
});
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    auth: async () => (signedIn ? { user: { id: 'account' } } : null),
  },
});
mock.module(import.meta.resolve('../lib/server/active-profile.ts'), {
  namedExports: {
    getActiveProfileWithActor: async () =>
      viewer ? { socialActor: { id: viewer } } : null,
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
  },
});

let postsRoute: typeof import('../app/api/social/actors/[username]/posts/route');
let statusRoute: typeof import('../app/api/social/statuses/[statusId]/route');
let repliesRoute: typeof import('../app/api/social/statuses/[statusId]/replies/route');
let NextRequest: typeof import('next/server').NextRequest;
let redirectPage: typeof import('../app/status/[statusId]/page');
const { PUBLIC, notExpired, visibleTo } =
  await import('@/lib/federation/wrappers/visibility');

before(async () => {
  // Generate the queried columns from the current schema, not a stale copy.
  // Constraints/defaults unrelated to reads are unnecessary for these fixtures.
  for (const table of [
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
  await pg.exec('CREATE TABLE profiles (id text, counties jsonb)');

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
  postsRoute = await import('../app/api/social/actors/[username]/posts/route');
  statusRoute = await import('../app/api/social/statuses/[statusId]/route');
  repliesRoute =
    await import('../app/api/social/statuses/[statusId]/replies/route');
  redirectPage = await import('../app/status/[statusId]/page');
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
