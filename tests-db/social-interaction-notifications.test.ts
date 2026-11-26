import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const domain = 'notifications.invalid';
const uri = (id: string) => `https://${domain}/p/${id}`;
const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
let statuses: typeof import('@/lib/federation/wrappers/status');
let getNotificationMessage: typeof import('@/lib/notifications').getNotificationMessage;

mock.module(import.meta.resolve('../lib/db.ts'), {
  namedExports: { db },
});
mock.module(import.meta.resolve('../lib/federation/index.ts'), {
  namedExports: {
    socialConfig: { domain },
    getFollowersUrl: (id: string) => `${uri(id)}/followers`,
  },
});

before(async () => {
  const oldContexts = schema.notificationContext.enumValues.filter(
    (context) => context !== 'like' && context !== 'reply'
  );
  await pg.exec(
    `CREATE TYPE notification_context AS ENUM (${oldContexts.map((value) => `'${value}'`).join(', ')})`
  );
  await pg.exec(
    readFileSync(
      new URL(
        '../drizzle/0078_social_interaction_notifications.sql',
        import.meta.url
      ),
      'utf8'
    )
  );
  for (const table of [
    schema.users,
    schema.profiles,
    schema.socialActors,
    schema.socialStatuses,
    schema.socialLikes,
    schema.socialFollows,
    schema.socialBlocks,
    schema.socialGroups,
    schema.socialGroupMembers,
    schema.socialAttachments,
    schema.socialDmRequests,
    schema.notifications,
  ]) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map((column) => {
      const type =
        table === schema.notifications && column.name === 'context'
          ? 'notification_context'
          : column.enumValues
            ? 'text'
            : column.getSQLType();
      return `"${column.name}" ${type}${column.primary ? ' PRIMARY KEY' : ''}`;
    });
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(', ')})`);
  }
  await pg.exec(`
    CREATE UNIQUE INDEX social_likes_actor_status_unique ON social_likes(actor_id, status_id);
    ALTER TABLE social_statuses ALTER COLUMN likes_count SET DEFAULT 0;
    ALTER TABLE social_statuses ALTER COLUMN replies_count SET DEFAULT 0;
    ALTER TABLE social_actors ALTER COLUMN status_count SET DEFAULT 0;
  `);
  statuses = await import('@/lib/federation/wrappers/status');
  ({ getNotificationMessage } = await import('@/lib/notifications'));
});

beforeEach(async () => {
  await pg.exec(`
    TRUNCATE notifications, social_likes, social_statuses, social_blocks,
      social_follows, social_group_members, social_groups, social_actors,
      profiles, users, social_attachments, social_dm_requests;
  `);
  for (const id of ['author', 'replier', 'other', 'userless']) {
    if (id !== 'userless') {
      await db.insert(schema.users).values({
        id: `${id}-user`,
        email: `${id}@test.invalid`,
        name: id,
        screenname: id,
      });
      await db.insert(schema.profiles).values({
        id: `${id}-profile`,
        userId: `${id}-user`,
        email: `${id}@test.invalid`,
        name: id,
        socialEligible: true,
      });
    }
    await db.insert(schema.socialActors).values({
      id,
      username: id,
      domain,
      uri: uri(id),
      inboxUrl: `${uri(id)}/inbox`,
      outboxUrl: `${uri(id)}/outbox`,
      followersUrl: `${uri(id)}/followers`,
      followingUrl: `${uri(id)}/following`,
      publicKey: 'fixture-public-key',
      privateKey: 'fixture-private-key',
      profileId: id === 'userless' ? null : `${id}-profile`,
    });
  }
});

after(async () => {
  mock.restoreAll();
  await pg.close();
});

async function post(id = 'post', actorId = 'author', groupId?: string) {
  const [row] = await db
    .insert(schema.socialStatuses)
    .values({
      id,
      actorId,
      uri: `${uri(actorId)}/statuses/${id}`,
      content: '<p>Private content must not enter notification copy</p>',
      type: 'Note',
      recipientTo: [PUBLIC],
      recipientCc: [],
      groupId,
      published: new Date(),
    })
    .returning();
  return row;
}

async function inbox() {
  return db.select().from(schema.notifications);
}

test('a like alerts the author once, links to the post, and expires after 30 days', async () => {
  await post();
  assert.equal((await statuses.likeStatus('replier', 'post')).success, true);
  await statuses.likeStatus('replier', 'post');
  const [alert] = await inbox();
  assert.equal((await inbox()).length, 1);
  assert.equal(alert.target, 'author-user');
  assert.equal(alert.actor, 'replier-user');
  assert.equal(alert.context, 'like');
  assert.equal(alert.type, 'Like');
  assert.equal(alert.object, 'post');
  assert.equal(alert.objectUrl, '/status/post');
  assert.equal(alert.read, false);
  assert.equal(getNotificationMessage(alert), 'replier liked your post');
  assert.ok(alert.expiresAt);
  assert.ok(
    Math.abs(alert.expiresAt.getTime() - Date.now() - 30 * 86400000) < 5000
  );
  await statuses.unlikeStatus('replier', 'post');
  assert.equal((await inbox()).length, 1);
});

test('concurrent retries create one like, count increment, and alert', async () => {
  await post();
  const results = await Promise.all([
    statuses.likeStatus('replier', 'post'),
    statuses.likeStatus('replier', 'post'),
  ]);
  assert.ok(results.every((result) => result.success));
  assert.equal((await db.select().from(schema.socialLikes)).length, 1);
  assert.equal((await inbox()).length, 1);
  const saved = await db.query.socialStatuses.findFirst();
  assert.equal(saved?.likesCount, 1);
});

test('a reply alerts only the immediate parent author and links to the reply', async () => {
  await post();
  const result = await statuses.createStatus(
    'replier',
    'A reply',
    undefined,
    'post'
  );
  assert.equal(result.success, true);
  if (!result.success) return;
  const [alert] = await inbox();
  assert.equal(alert.target, 'author-user');
  assert.equal(alert.context, 'reply');
  assert.equal(alert.type, 'Create');
  assert.equal(alert.object, result.status.id);
  assert.equal(alert.objectUrl, `/status/${result.status.id}`);
  assert.equal(getNotificationMessage(alert), 'replier replied to your post');

  await statuses.createStatus(
    'other',
    'Nested reply',
    undefined,
    result.status.id
  );
  const alerts = await inbox();
  assert.equal(alerts.length, 2);
  assert.equal(alerts.filter((row) => row.target === 'author-user').length, 1);
  assert.equal(alerts.filter((row) => row.target === 'replier-user').length, 1);
});

test('private group replies notify the parent author, not the whole membership', async () => {
  await db.insert(schema.socialGroups).values({
    id: 'group',
    actorId: 'other',
    visibility: 'private',
  });
  for (const actorId of ['author', 'replier', 'other']) {
    await db.insert(schema.socialGroupMembers).values({
      groupId: 'group',
      actorId,
      status: 'active',
      role: 'member',
    });
  }
  await post('post', 'author', 'group');
  const result = await statuses.createStatus(
    'replier',
    'Group reply',
    undefined,
    'post'
  );
  assert.equal(result.success, true);
  assert.deepEqual(
    (await inbox()).map((row) => row.target),
    ['author-user']
  );
});

test('self-interactions and actors without local accounts are silent', async () => {
  await post();
  await statuses.likeStatus('author', 'post');
  await statuses.createStatus('author', 'My reply', undefined, 'post');
  await post('remote-post', 'userless');
  await statuses.likeStatus('replier', 'remote-post');
  await statuses.createStatus(
    'replier',
    'Remote reply',
    undefined,
    'remote-post'
  );
  await statuses.likeStatus('userless', 'post');
  assert.deepEqual(await inbox(), []);
});

for (const [actorId, targetActorId] of [
  ['author', 'replier'],
  ['replier', 'author'],
]) {
  test(`blocks from ${actorId} suppress both interaction alerts`, async () => {
    await post();
    await db.insert(schema.socialBlocks).values({
      actorId,
      targetActorId,
      kind: 'block',
    });
    await statuses.likeStatus('replier', 'post');
    await statuses.createStatus('replier', 'Blocked reply', undefined, 'post');
    assert.deepEqual(await inbox(), []);
  });
}

test('a reply its parent author cannot read does not leak an alert', async () => {
  await post();
  const result = await statuses.createStatus(
    'replier',
    'Followers only',
    undefined,
    'post',
    'private'
  );
  assert.equal(result.success, true);
  assert.deepEqual(await inbox(), []);
});

test('DM interactions do not bypass the separate message request notification gate', async () => {
  await post();
  await db
    .update(schema.socialStatuses)
    .set({ recipientTo: [uri('replier')], recipientCc: [] })
    .where(eq(schema.socialStatuses.id, 'post'));
  await statuses.likeStatus('replier', 'post');
  await statuses.createStatus('replier', 'Reply', undefined, 'post');
  assert.deepEqual(await inbox(), []);
});

test('notification storage failure cannot fail an already-saved like or reply', async (t) => {
  await post();
  const insert = db.insert.bind(db);
  t.mock.method(db, 'insert', (table: Parameters<typeof db.insert>[0]) => {
    if (table === schema.notifications)
      throw new Error('notification storage unavailable');
    return insert(table);
  });
  const errors = t.mock.method(console, 'error', () => {});
  assert.equal((await statuses.likeStatus('replier', 'post')).success, true);
  const reply = await statuses.createStatus(
    'replier',
    'Saved reply',
    undefined,
    'post'
  );
  assert.equal(reply.success, true);
  assert.equal((await db.select().from(schema.socialLikes)).length, 1);
  assert.equal((await db.select().from(schema.socialStatuses)).length, 2);
  assert.equal(errors.mock.callCount(), 2);
});
