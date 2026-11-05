import { after, before, beforeEach, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from '@/lib/schema';
import { STATUS_TYPE_PANAS } from '@/lib/utils/getVisibility';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const domain = 'feed.invalid';
const uri = (id: string) => `https://${domain}/p/${id}`;
const followers = (id: string) => `${uri(id)}/followers`;
const publishedAt = new Date('2026-11-05T12:00:00Z');
let signedIn = true;
let viewer: string | null = 'viewer';
let timeline: typeof import('@/lib/federation/wrappers/timeline');

mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
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
mock.module(import.meta.resolve('../lib/federation/index.ts'), {
  namedExports: {
    socialConfig: { domain },
    getFeedTimeline: (...args: Parameters<typeof timeline.getFeedTimeline>) =>
      timeline.getFeedTimeline(...args),
    parseFeedCursor: (token: string) => timeline.parseFeedCursor(token),
  },
});
timeline = await import('@/lib/federation/wrappers/timeline');
const { PUBLIC } = await import('@/lib/federation/wrappers/visibility');
const { GET } = await import('../app/api/social/timeline/route');
const { NextRequest } = await import('next/server');

const post = (
  id: string,
  actorId = 'stranger',
  hoursAgo = 0,
  fields: Partial<typeof schema.socialStatuses.$inferInsert> = {}
) =>
  db.insert(schema.socialStatuses).values({
    id,
    actorId,
    uri: `https://${domain}/status/${id}`,
    type: 'Note',
    content: id,
    published: new Date(publishedAt.getTime() - hoursAgo * 3_600_000),
    recipientTo: [PUBLIC],
    recipientCc: [],
    ...fields,
  });
const ids = (page: Awaited<ReturnType<typeof timeline.getFeedTimeline>>) =>
  page.statuses.map((status) => status.id);
const request = (query = '') =>
  GET(new NextRequest(`https://${domain}/api/social/timeline${query}`));

before(async () => {
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
  ]) {
    const { name, columns } = getTableConfig(table);
    await pg.exec(
      `CREATE TABLE "${name}" (${columns
        .map(
          (column) =>
            `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}`
        )
        .join(', ')})`
    );
  }
  await db.insert(schema.profiles).values({
    id: 'legacy-profile',
    name: 'Legacy Pana',
    email: 'legacy@feed.invalid',
  });
  await db.insert(schema.socialActors).values(
    [
      'viewer',
      'newcomer',
      'pana',
      'following',
      'follower',
      'pending',
      'stranger',
      'blocked',
      'muted',
      'blocking',
      'remote',
      'legacy',
      'joined',
      'unjoined',
      'open',
    ].map((id) => ({
      id,
      username: id,
      domain: ['remote', 'legacy'].includes(id) ? 'old.invalid' : domain,
      profileId: id === 'legacy' ? 'legacy-profile' : null,
      uri: uri(id),
      followersUrl: followers(id),
      followingUrl: `${uri(id)}/following`,
      inboxUrl: `${uri(id)}/inbox`,
      outboxUrl: `${uri(id)}/outbox`,
      publicKey: 'fixture',
      type: ['joined', 'unjoined', 'open'].includes(id) ? 'Group' : 'Person',
    }))
  );
  await db.insert(schema.socialGroups).values([
    { id: 'joined', actorId: 'joined', visibility: 'private' },
    { id: 'unjoined', actorId: 'unjoined', visibility: 'private' },
    { id: 'open', actorId: 'open', visibility: 'public' },
  ]);
});

beforeEach(async () => {
  signedIn = true;
  viewer = 'viewer';
  for (const table of [
    schema.socialStatuses,
    schema.socialFollows,
    schema.socialGroupMembers,
    schema.socialAttachments,
    schema.socialLikes,
    schema.socialBlocks,
  ])
    await db.delete(table);
  await db.insert(schema.socialFollows).values([
    { actorId: 'viewer', targetActorId: 'pana', status: 'accepted' },
    { actorId: 'pana', targetActorId: 'viewer', status: 'accepted' },
    { actorId: 'viewer', targetActorId: 'following', status: 'accepted' },
    { actorId: 'follower', targetActorId: 'viewer', status: 'accepted' },
    { actorId: 'viewer', targetActorId: 'pending', status: 'accepted' },
    { actorId: 'pending', targetActorId: 'viewer', status: 'pending' },
  ]);
  await db.insert(schema.socialGroupMembers).values({
    actorId: 'viewer',
    groupId: 'joined',
    status: 'active',
  });
});
after(async () => {
  mock.restoreAll();
  await pg.close();
});

it('gently boosts mutual Panas by six hours, not popularity, without burying fresh community posts', async () => {
  await post('pana-recent', 'pana', 2);
  await post('community-fresh', 'stranger', 0);
  await post('oneway', 'following', 0.5, { likesCount: 100_000 });
  await post('pending', 'pending', 1);
  await post('pana-old', 'pana', 10);
  assert.deepEqual(ids(await timeline.getFeedTimeline('viewer')), [
    'pana-recent',
    'community-fresh',
    'oneway',
    'pending',
    'pana-old',
  ]);
});

it('bounds the recency advantage at exactly six hours', async () => {
  await post('pana-before', 'pana', 6 - 1 / 3600);
  await post('community-fresh', 'stranger', 0);
  await post('pana-after', 'pana', 6 + 1 / 3600);
  assert.deepEqual(ids(await timeline.getFeedTimeline('viewer')), [
    'pana-before',
    'community-fresh',
    'pana-after',
  ]);
});

it('includes local public posts for new members, including legacy-domain profile owners, but not remote discovery', async () => {
  await post('local');
  await post('legacy', 'legacy', 1);
  await post('remote', 'remote');
  await post('unlisted', 'stranger', 0, {
    recipientTo: [followers('stranger')],
    recipientCc: [PUBLIC],
  });
  assert.deepEqual(ids(await timeline.getFeedTimeline('newcomer')), [
    'local',
    'legacy',
  ]);
});

it('combines authorized personal and group posts once without widening Panas or group privacy', async () => {
  await post('pana-public', 'pana');
  await post('pana-private', 'pana', 1, {
    type: STATUS_TYPE_PANAS,
    recipientTo: [uri('viewer')],
    recipientCc: [uri('pana')],
  });
  await post('not-addressed', 'pana', 0, {
    type: STATUS_TYPE_PANAS,
    recipientTo: [uri('stranger')],
    recipientCc: [uri('pana')],
  });
  await post('malformed-panas', 'stranger', 0, { type: STATUS_TYPE_PANAS });
  await post('joined', 'stranger', 0, {
    groupId: 'joined',
    recipientTo: [followers('joined')],
  });
  await post('unjoined', 'pana', 0, { groupId: 'unjoined' });
  await post('open', 'stranger', 0, { groupId: 'open' });
  await post('own', 'viewer');
  const result = ids(await timeline.getFeedTimeline('viewer'));
  assert.deepEqual(result.slice().sort(), [
    'joined',
    'open',
    'own',
    'pana-private',
    'pana-public',
  ]);
  assert.equal(result.filter((id) => id === 'pana-public').length, 1);
  assert.ok(
    !ids(await timeline.getFeedTimeline('newcomer')).includes('pana-private')
  );
  assert.ok(
    !ids(await timeline.getFeedTimeline('newcomer')).includes('joined')
  );
});

it('rechecks lost reciprocity and membership without hiding still-public posts', async () => {
  await post('public', 'pana');
  await post('private', 'pana', 0, {
    type: STATUS_TYPE_PANAS,
    recipientTo: [uri('viewer')],
    recipientCc: [uri('pana')],
  });
  await post('joined', 'stranger', 0, {
    groupId: 'joined',
    recipientTo: [followers('joined')],
  });
  await db
    .update(schema.socialFollows)
    .set({ status: 'pending' })
    .where(
      and(
        eq(schema.socialFollows.actorId, 'pana'),
        eq(schema.socialFollows.targetActorId, 'viewer')
      )
    );
  await db.update(schema.socialGroupMembers).set({ status: 'banned' });
  assert.deepEqual(ids(await timeline.getFeedTimeline('viewer')), ['public']);
});

it('keeps DMs, stories, replies, expired/draft posts, blocks and mutes out of every feed arm', async () => {
  await post('visible');
  await post('dm', 'pana', 0, { recipientTo: [uri('viewer')] });
  await post('own-dm', 'viewer', 0, { recipientTo: [uri('stranger')] });
  await post('story', 'pana', 0, { type: schema.STATUS_TYPE_STORY });
  await post('reply', 'pana', 0, { inReplyToId: 'visible' });
  await post('expired', 'pana', 0, { expiresAt: new Date('2000-01-01') });
  await post('draft', 'pana', 0, { published: null });
  await db.insert(schema.socialBlocks).values([
    { actorId: 'viewer', targetActorId: 'blocked', kind: 'block' },
    { actorId: 'viewer', targetActorId: 'muted', kind: 'mute' },
    { actorId: 'blocking', targetActorId: 'viewer', kind: 'block' },
  ]);
  for (const actor of ['blocked', 'muted', 'blocking']) {
    await post(actor, actor);
    await post(`${actor}-group`, actor, 0, { groupId: 'joined' });
  }
  assert.deepEqual(ids(await timeline.getFeedTimeline('viewer')), ['visible']);
});

it('paginates by boosted time and ID, not random ID order or a deleted boundary row', async () => {
  for (const [id, author, hours] of [
    ['a', 'pana', 2],
    ['z', 'stranger', 0],
    ['m', 'stranger', 0],
    ['b', 'pana', 8],
    ['x', 'stranger', 3],
    ['c', 'stranger', 4],
  ] as const)
    await post(id, author, hours);
  // Exercise the same millisecond precision used to encode the cursor.
  await db.execute(
    sql`UPDATE social_statuses SET published = published + interval '0.000123 seconds'`
  );
  const first = await timeline.getFeedTimeline('viewer', undefined, 2);
  assert.deepEqual(ids(first), ['a', 'z']);
  const cursor = timeline.parseFeedCursor(first.nextCursor!);
  assert.ok(cursor);
  await db
    .delete(schema.socialStatuses)
    .where(eq(schema.socialStatuses.id, 'z'));
  const seen = ids(first);
  let next: typeof cursor | undefined = cursor;
  while (next) {
    const page = await timeline.getFeedTimeline('viewer', next, 2);
    seen.push(...ids(page));
    next = page.nextCursor
      ? timeline.parseFeedCursor(page.nextCursor)!
      : undefined;
  }
  assert.deepEqual(seen, ['a', 'z', 'm', 'b', 'x', 'c']);
  assert.equal(new Set(seen).size, seen.length);
});

it('serves the mixed feed through the authenticated route and rejects invalid cursors and limits', async () => {
  await post('pana', 'pana', 2);
  await post('public');
  const response = await request('?limit=1');
  assert.equal(response.status, 200);
  const first = (await response.json()).data;
  assert.deepEqual(
    first.statuses.map((row: { id: string }) => row.id),
    ['pana']
  );
  const second = await request(`?limit=1&cursor=${first.nextCursor}`);
  assert.equal((await second.json()).data.statuses[0].id, 'public');
  for (const query of [
    '?cursor=old-id',
    '?cursor=%%%',
    '?limit=0',
    '?limit=-1',
    '?limit=51',
    '?limit=wat',
  ]) {
    assert.equal((await request(query)).status, 400, query);
  }
  signedIn = false;
  assert.equal((await request()).status, 401);
  signedIn = true;
  viewer = null;
  assert.deepEqual((await (await request()).json()).data, {
    statuses: [],
    nextCursor: null,
  });
});
