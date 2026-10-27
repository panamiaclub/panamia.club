import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const domain = 'current.invalid';
const actorUri = (username: string, host = domain) =>
  `https://${host}/p/${username}`;
let signedIn = true;
let signedInUserId = 'viewer-account';
let actors: typeof import('@/lib/federation/wrappers/actor');
let follows: typeof import('@/lib/federation/wrappers/follow');
let blocks: typeof import('@/lib/federation/wrappers/block-filter');

mock.module(import.meta.resolve('../lib/db.ts'), {
  namedExports: { db },
});
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    auth: async () => (signedIn ? { user: { id: signedInUserId } } : null),
  },
});
mock.module(import.meta.resolve('../lib/server/active-profile.ts'), {
  namedExports: {
    getActiveProfileWithActor: async () =>
      db.query.profiles.findFirst({
        where: eq(schema.profiles.id, 'viewer-profile'),
        with: { socialActor: true },
      }),
  },
});
mock.module(import.meta.resolve('../lib/federation/index.ts'), {
  namedExports: {
    socialConfig: { domain },
    getActorUrl: actorUri,
    getInboxUrl: (username: string) => `${actorUri(username)}/inbox`,
    getOutboxUrl: (username: string) => `${actorUri(username)}/outbox`,
    getFollowersUrl: (username: string) => `${actorUri(username)}/followers`,
    getFollowingUrl: (username: string) => `${actorUri(username)}/following`,
    getActorByScreenname: (
      ...args: Parameters<typeof actors.getActorByScreenname>
    ) => actors.getActorByScreenname(...args),
    createFollow: (...args: Parameters<typeof follows.createFollow>) =>
      follows.createFollow(...args),
    deleteFollow: (...args: Parameters<typeof follows.deleteFollow>) =>
      follows.deleteFollow(...args),
    getFollowRelationship: (
      ...args: Parameters<typeof follows.getFollowRelationship>
    ) => follows.getFollowRelationship(...args),
    getViewerBlockState: (
      ...args: Parameters<typeof blocks.getViewerBlockState>
    ) => blocks.getViewerBlockState(...args),
    listSuggestedActors: (
      ...args: Parameters<typeof follows.listSuggestedActors>
    ) => follows.listSuggestedActors(...args),
  },
});

let actorRoute: typeof import('../app/api/social/actors/[username]/route');
let followRoute: typeof import('../app/api/social/actors/[username]/follow/route');
let suggestionsRoute: typeof import('../app/api/social/suggestions/route');
let notificationsRoute: typeof import('../app/api/notifications/route');
let readNotificationRoute: typeof import('../app/api/notifications/[id]/read/route');
let unreadCountRoute: typeof import('../app/api/notifications/unread-count/route');
let NextRequest: typeof import('next/server').NextRequest;

before(async () => {
  for (const table of [
    schema.users,
    schema.profiles,
    schema.socialActors,
    schema.socialFollows,
    schema.socialBlocks,
    schema.notifications,
  ]) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map(
      (column) =>
        `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`
    );
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(', ')})`);
  }
  actors = await import('@/lib/federation/wrappers/actor');
  follows = await import('@/lib/federation/wrappers/follow');
  blocks = await import('@/lib/federation/wrappers/block-filter');
  actorRoute = await import('../app/api/social/actors/[username]/route');
  followRoute =
    await import('../app/api/social/actors/[username]/follow/route');
  suggestionsRoute = await import('../app/api/social/suggestions/route');
  notificationsRoute = await import('../app/api/notifications/route');
  readNotificationRoute =
    await import('../app/api/notifications/[id]/read/route');
  unreadCountRoute =
    await import('../app/api/notifications/unread-count/route');
  ({ NextRequest } = await import('next/server'));
});

beforeEach(async () => {
  await db.delete(schema.notifications);
  await db.delete(schema.socialBlocks);
  await db.delete(schema.socialFollows);
  await db.delete(schema.socialActors);
  await db.delete(schema.profiles);
  await db.delete(schema.users);
  signedIn = true;
  signedInUserId = 'viewer-account';

  for (const id of ['viewer', 'legacy', 'candidate', 'bridge']) {
    await db.insert(schema.users).values({
      id: `${id}-account`,
      email: `${id}@test.invalid`,
      name: id,
      screenname: id,
    });
    await db.insert(schema.profiles).values({
      id: `${id}-profile`,
      userId: `${id}-account`,
      email: `${id}@test.invalid`,
      name: id,
      screenname: id,
      active: true,
      socialEligible: true,
    });
  }
  const fixtures = [
    { id: 'viewer', domain, profileId: 'viewer-profile' },
    { id: 'legacy', domain: 'legacy.invalid', profileId: 'legacy-profile' },
    {
      id: 'candidate',
      domain: 'legacy.invalid',
      profileId: 'candidate-profile',
    },
    { id: 'bridge', domain, profileId: 'bridge-profile' },
    { id: 'canonical', domain },
    { id: 'remote-lookalike', username: 'legacy', domain: 'remote.invalid' },
    { id: 'remote-only', domain: 'remote.invalid' },
    { id: 'legacy-orphan', domain: 'legacy.invalid' },
  ];
  await db.insert(schema.socialActors).values(
    fixtures.map((fixture) => {
      const username = fixture.username ?? fixture.id;
      const uri = actorUri(username, fixture.domain);
      return {
        ...fixture,
        username,
        uri,
        inboxUrl: `${uri}/inbox`,
        outboxUrl: `${uri}/outbox`,
        followersUrl: `${uri}/followers`,
        followingUrl: `${uri}/following`,
        publicKey: 'fixture-public-key',
        privateKey: 'fixture-private-key',
        followersCount: 0,
        followingCount: 0,
        statusCount: 0,
      };
    })
  );
});

after(async () => {
  await pg.close();
});

function params(username = 'legacy') {
  return { params: Promise.resolve({ username }) };
}

function request(method = 'GET', username = 'legacy') {
  return new NextRequest(
    `https://${domain}/api/social/actors/${username}/follow`,
    { method }
  );
}

async function connect(actorId: string, targetActorId: string) {
  await db.insert(schema.socialFollows).values({
    actorId,
    targetActorId,
    status: 'accepted',
    acceptedAt: new Date(),
  });
}

test('a linked legacy-domain member resolves instead of a remote namesake', async () => {
  const actor = await actors.getActorByScreenname('legacy');
  assert.equal(actor?.id, 'legacy');
  assert.equal(actor?.domain, 'legacy.invalid');
  assert.equal(actor?.uri, actorUri('legacy', 'legacy.invalid'));
});

test('actor handles resolve case-insensitively like public profile handles', async () => {
  assert.equal((await actors.getActorByScreenname('LeGaCy'))?.id, 'legacy');
  assert.equal(
    (await actors.getActorByScreenname('CaNoNiCaL'))?.id,
    'canonical'
  );
});

test('canonical-domain actors without profiles still resolve', async () => {
  assert.equal(
    (await actors.getActorByScreenname('canonical'))?.id,
    'canonical'
  );
});

test('remote and unlinked legacy actors do not become local handles', async () => {
  for (const username of ['remote-only', 'legacy-orphan', 'missing']) {
    assert.equal(await actors.getActorByScreenname(username), null);
  }
});

test('the profile actor API returns a legacy identity without its signing key', async () => {
  const response = await actorRoute.GET(request(), params());
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.actor.id, 'legacy');
  assert.equal(data.actor.domain, 'legacy.invalid');
  assert.equal(data.actor.uri, actorUri('legacy', 'legacy.invalid'));
  assert.equal(data.isSelf, false);
  assert.equal('privateKey' in data.actor, false);
});

test('a new local member can follow a legacy member through the actual API', async () => {
  const response = await followRoute.POST(request('POST'), params());
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.follow.status, 'accepted');
  assert.ok(data.follow.acceptedAt);
  assert.equal(await follows.isFollowing('viewer', 'legacy'), true);
  const viewer = await actors.getActorByScreenname('viewer');
  const target = await actors.getActorByScreenname('legacy');
  assert.equal(viewer?.followingCount, 1);
  assert.equal(target?.followersCount, 1);
  assert.equal(target?.uri, actorUri('legacy', 'legacy.invalid'));
});

test('new follows create an unread notification linking to the follower profile', async () => {
  const startedAt = Date.now();
  const response = await followRoute.POST(request('POST'), params());
  assert.equal(response.status, 200);

  const notes = await db.select().from(schema.notifications);
  assert.equal(notes.length, 1);
  const [note] = notes;
  assert.equal(note.type, 'Follow');
  assert.equal(note.context, 'follow');
  assert.equal(note.actor, 'viewer-account');
  assert.equal(note.target, 'legacy-account');
  assert.equal(note.object, 'viewer-profile');
  assert.equal(note.objectType, 'profile');
  assert.equal(note.objectUrl, '/p/viewer');
  assert.equal(note.actorScreenname, 'viewer');
  assert.equal(note.actorName, 'viewer');
  assert.equal(note.message, null);
  assert.equal(note.read, false);
  assert.equal(note.emailSent, false);
  assert.ok(note.expiresAt);
  const retention = 30 * 24 * 60 * 60 * 1000;
  assert.ok(note.expiresAt.getTime() >= startedAt + retention);
  assert.ok(note.expiresAt.getTime() <= Date.now() + retention);
});

test('the recipient can list and mark a follow alert as read using its UI id', async () => {
  await followRoute.POST(request('POST'), params());
  const [stored] = await db.select().from(schema.notifications);
  assert.ok(stored);

  const listRequest = new NextRequest(
    `https://${domain}/api/notifications?unreadOnly=true`
  );
  const unreadRequest = new NextRequest(
    `https://${domain}/api/notifications/unread-count`
  );
  const senderList = await notificationsRoute.GET(listRequest);
  assert.equal((await senderList.json()).data.total, 0);
  const readParams = { params: Promise.resolve({ id: stored.id }) };
  assert.equal(
    (await readNotificationRoute.POST(undefined, readParams)).status,
    404
  );

  signedInUserId = 'legacy-account';
  const response = await notificationsRoute.GET(listRequest);
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.total, 1);
  assert.equal(data.notifications.length, 1);
  const [note] = data.notifications;
  assert.equal(note._id, stored.id);
  assert.equal(note.displayMessage, 'viewer started following you');
  assert.equal(note.objectUrl, '/p/viewer');
  const unread = await unreadCountRoute.GET(unreadRequest);
  assert.equal((await unread.json()).data.count, 1);

  const read = await readNotificationRoute.POST(undefined, {
    params: Promise.resolve({ id: note._id }),
  });
  assert.equal(read.status, 200);
  const cleared = await unreadCountRoute.GET(unreadRequest);
  assert.equal((await cleared.json()).data.count, 0);
  const [updated] = await db.select().from(schema.notifications);
  assert.equal(updated.read, true);
  assert.ok(updated.readAt);
});

test('the follow wrapper accepts linked legacy targets instead of leaving them pending', async () => {
  const result = await follows.createFollow('viewer', 'legacy');
  assert.ok(result.success);
  assert.equal(result.follow.status, 'accepted');
  assert.ok(result.follow.acceptedAt);
  assert.equal((await db.select().from(schema.notifications)).length, 1);
});

test('remote follows still require acceptance', async () => {
  const result = await follows.createFollow('viewer', 'remote-only');
  assert.ok(result.success);
  assert.equal(result.follow.status, 'pending');
  assert.equal(result.follow.acceptedAt, null);
  assert.equal(await follows.isFollowing('viewer', 'remote-only'), false);
  assert.deepEqual(await db.select().from(schema.notifications), []);
});

test('canonical-domain actors without profiles still accept local follows', async () => {
  const result = await follows.createFollow('viewer', 'canonical');
  assert.ok(result.success);
  assert.equal(result.follow.status, 'accepted');
  assert.deepEqual(await db.select().from(schema.notifications), []);
});

test('repeat follows are idempotent and unfollow reverses the accepted counts', async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await followRoute.POST(request('POST'), params());
    assert.equal(response.status, 200);
  }
  assert.equal((await db.select().from(schema.socialFollows)).length, 1);
  assert.equal((await db.select().from(schema.notifications)).length, 1);
  assert.equal(
    (await actors.getActorByScreenname('legacy'))?.followersCount,
    1
  );
  const response = await followRoute.DELETE(request('DELETE'), params());
  assert.equal(response.status, 200);
  assert.equal(await follows.isFollowing('viewer', 'legacy'), false);
  assert.equal(
    (await actors.getActorByScreenname('legacy'))?.followersCount,
    0
  );
  assert.equal(
    (await actors.getActorByScreenname('viewer'))?.followingCount,
    0
  );
  assert.equal((await db.select().from(schema.notifications)).length, 1);
});

test('following back celebrates becoming Panas without changing the earlier alert', async () => {
  await follows.createFollow('viewer', 'legacy');

  const result = await follows.createFollow('legacy', 'viewer');
  assert.equal(result.success, true);
  const notes = await db.select().from(schema.notifications);
  assert.equal(notes.length, 2);
  const mutual = notes.find((note) => note.target === 'viewer-account');
  assert.ok(mutual);
  assert.equal(mutual.actor, 'legacy-account');
  assert.equal(mutual.objectUrl, '/p/legacy');
  assert.equal(mutual.message, 'you and legacy became Panas!');

  const listRequest = new NextRequest(`https://${domain}/api/notifications`);
  const viewerResponse = await notificationsRoute.GET(listRequest);
  const viewerNotes = (await viewerResponse.json()).data.notifications;
  assert.equal(viewerNotes.length, 1);
  assert.equal(viewerNotes[0].displayMessage, 'you and legacy became Panas!');

  signedInUserId = 'legacy-account';
  const legacyResponse = await notificationsRoute.GET(listRequest);
  const legacyNotes = (await legacyResponse.json()).data.notifications;
  assert.equal(legacyNotes.length, 1);
  assert.equal(legacyNotes[0].displayMessage, 'viewer started following you');

  await follows.createFollow('legacy', 'viewer');
  assert.equal((await db.select().from(schema.notifications)).length, 2);
});

test('Panas notification wording is preserved after an unfollow', async () => {
  await follows.createFollow('viewer', 'legacy');
  await follows.createFollow('legacy', 'viewer');
  await follows.deleteFollow('legacy', 'viewer');

  const response = await notificationsRoute.GET(
    new NextRequest(`https://${domain}/api/notifications`)
  );
  const notes = (await response.json()).data.notifications;
  assert.equal(notes.length, 1);
  assert.equal(notes[0].displayMessage, 'you and legacy became Panas!');
  assert.equal(await follows.isFollowing('legacy', 'viewer'), false);
});

for (const status of ['pending', 'rejected'] as const) {
  test(`a ${status} reverse follow does not trigger the Panas message`, async () => {
    await db.insert(schema.socialFollows).values({
      actorId: 'legacy',
      targetActorId: 'viewer',
      status,
      acceptedAt: null,
      uri: `${actorUri('legacy')}/follows/${status}`,
    });

    const result = await follows.createFollow('viewer', 'legacy');
    assert.equal(result.success, true);
    signedInUserId = 'legacy-account';
    const response = await notificationsRoute.GET(
      new NextRequest(`https://${domain}/api/notifications`)
    );
    const notes = (await response.json()).data.notifications;
    assert.equal(notes.length, 1);
    assert.equal(notes[0].message, null);
    assert.equal(notes[0].displayMessage, 'viewer started following you');
  });
}

test('following again after an unfollow creates a new alert', async () => {
  await follows.createFollow('viewer', 'legacy');
  await follows.deleteFollow('viewer', 'legacy');
  await follows.createFollow('viewer', 'legacy');

  assert.equal((await db.select().from(schema.notifications)).length, 2);
  assert.equal(
    (await actors.getActorByScreenname('legacy'))?.followersCount,
    1
  );
});

test('existing follow relationships do not backfill notifications', async () => {
  await connect('viewer', 'legacy');
  const result = await follows.createFollow('viewer', 'legacy');
  assert.equal(result.success, true);
  assert.deepEqual(await db.select().from(schema.notifications), []);
});

for (const id of ['viewer', 'legacy']) {
  test(`follows remain silent when ${id} has no linked user`, async () => {
    await db
      .update(schema.profiles)
      .set({ userId: null })
      .where(eq(schema.profiles.id, `${id}-profile`));

    const result = await follows.createFollow('viewer', 'legacy');
    assert.equal(result.success, true);
    assert.deepEqual(await db.select().from(schema.notifications), []);
  });

  test(`a mute by ${id} does not suppress the other Pana's follow alert`, async () => {
    await db.insert(schema.socialBlocks).values({
      actorId: id,
      targetActorId: id === 'viewer' ? 'legacy' : 'viewer',
      kind: 'mute',
    });

    const result = await follows.createFollow('viewer', 'legacy');
    assert.equal(result.success, true);
    assert.equal((await db.select().from(schema.notifications)).length, 1);
  });
}

test('self-follows and missing actors do not create notifications', async () => {
  for (const [from, to] of [
    ['viewer', 'viewer'],
    ['missing', 'legacy'],
    ['viewer', 'missing'],
  ]) {
    const result = await follows.createFollow(from, to);
    assert.equal(result.success, false);
  }
  assert.deepEqual(await db.select().from(schema.socialFollows), []);
  assert.deepEqual(await db.select().from(schema.notifications), []);
});

test('notification failures are logged without failing the saved follow', async (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  await pg.exec(
    'ALTER TABLE notifications ADD CONSTRAINT reject_notification CHECK (false)'
  );

  try {
    const response = await followRoute.POST(request('POST'), params());
    assert.equal(response.status, 200);
    assert.equal(await follows.isFollowing('viewer', 'legacy'), true);
    assert.equal(
      (await actors.getActorByScreenname('viewer'))?.followingCount,
      1
    );
    assert.equal(
      (await actors.getActorByScreenname('legacy'))?.followersCount,
      1
    );
    assert.deepEqual(await db.select().from(schema.notifications), []);
    assert.equal(errors.mock.callCount(), 1);
    const [message, details] = errors.mock.calls[0].arguments;
    assert.equal(
      message,
      '[createFollow] Failed to create follow notification'
    );
    assert.equal(details.actorId, 'viewer');
    assert.equal(details.targetActorId, 'legacy');
    assert.ok(details.error instanceof Error);
  } finally {
    await pg.exec(
      'ALTER TABLE notifications DROP CONSTRAINT reject_notification'
    );
  }
});

test('cold-start suggestions include linked legacy members but not remote actors', async () => {
  const response = await suggestionsRoute.GET();
  assert.equal(response.status, 200);
  const suggested = (await response.json()).data.actors;
  const ids = suggested.map((actor: { id: string }) => actor.id);
  assert.ok(ids.includes('legacy'));
  assert.ok(ids.includes('candidate'));
  assert.ok(ids.includes('canonical'));
  assert.ok(!ids.includes('viewer'));
  assert.ok(!ids.includes('remote-lookalike'));
  assert.ok(!ids.includes('remote-only'));
  assert.ok(!ids.includes('legacy-orphan'));
  assert.ok(suggested.every((actor: object) => !('privateKey' in actor)));
});

test('shared-Pana suggestions include legacy members before filling from recent accounts', async () => {
  for (const [from, to] of [
    ['viewer', 'bridge'],
    ['bridge', 'viewer'],
    ['bridge', 'legacy'],
    ['legacy', 'bridge'],
    ['bridge', 'remote-only'],
    ['remote-only', 'bridge'],
  ]) {
    await connect(from, to);
  }
  const suggested = await follows.listSuggestedActors('viewer', 1);
  assert.equal(suggested.length, 1);
  assert.equal(suggested[0].id, 'legacy');
  assert.equal(suggested[0].mutualCount, 1);
  assert.equal('privateKey' in suggested[0], false);
});

test('legacy members already followed, blocked, or muted stay out of suggestions', async () => {
  await connect('viewer', 'bridge');
  await db.insert(schema.socialBlocks).values([
    { actorId: 'viewer', targetActorId: 'legacy', kind: 'block' },
    { actorId: 'viewer', targetActorId: 'candidate', kind: 'mute' },
  ]);
  const suggested = await follows.listSuggestedActors('viewer', 20);
  assert.deepEqual(
    suggested.map((actor) => actor.id),
    ['canonical']
  );
});

test('a block still prevents follows in either direction across saved domains', async () => {
  await db.insert(schema.socialBlocks).values({
    actorId: 'legacy',
    targetActorId: 'viewer',
    kind: 'block',
  });
  for (const [from, to] of [
    ['viewer', 'legacy'],
    ['legacy', 'viewer'],
  ]) {
    const result = await follows.createFollow(from, to);
    assert.equal(result.success, false);
    if (!result.success)
      assert.equal(result.error, 'Cannot follow this account');
  }
  assert.deepEqual(await db.select().from(schema.socialFollows), []);
  assert.deepEqual(await db.select().from(schema.notifications), []);
});

test('ineligible members are not granted follow access by the domain fix', async () => {
  await db
    .update(schema.profiles)
    .set({ socialEligible: false })
    .where(eq(schema.profiles.id, 'viewer-profile'));
  const response = await followRoute.POST(request('POST'), params());
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Not eligible to follow');
  assert.deepEqual(await db.select().from(schema.socialFollows), []);
  assert.deepEqual(await db.select().from(schema.notifications), []);
});

test('following rejects signed-out sessions and profiles without an available actor', async () => {
  signedIn = false;
  assert.equal((await followRoute.POST(request('POST'), params())).status, 401);
  signedIn = true;
  await db
    .delete(schema.socialActors)
    .where(eq(schema.socialActors.id, 'viewer'));
  const response = await followRoute.POST(request('POST'), params());
  assert.equal(response.status, 403);
  assert.equal(
    (await response.json()).error,
    'Social features are unavailable for this profile'
  );
  assert.deepEqual(await db.select().from(schema.socialFollows), []);
  assert.deepEqual(await db.select().from(schema.notifications), []);
});
