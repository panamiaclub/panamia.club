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
let actors: typeof import('@/lib/federation/wrappers/actor');
let follows: typeof import('@/lib/federation/wrappers/follow');
let blocks: typeof import('@/lib/federation/wrappers/block-filter');

mock.module(import.meta.resolve('../lib/db.ts'), {
  namedExports: { db },
});
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    auth: async () => (signedIn ? { user: { id: 'viewer-account' } } : null),
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
let NextRequest: typeof import('next/server').NextRequest;

before(async () => {
  for (const table of [
    schema.profiles,
    schema.socialActors,
    schema.socialFollows,
    schema.socialBlocks,
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
  ({ NextRequest } = await import('next/server'));
});

beforeEach(async () => {
  await db.delete(schema.socialBlocks);
  await db.delete(schema.socialFollows);
  await db.delete(schema.socialActors);
  await db.delete(schema.profiles);
  signedIn = true;

  for (const id of ['viewer', 'legacy', 'candidate', 'bridge']) {
    await db.insert(schema.profiles).values({
      id: `${id}-profile`,
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

test('the follow wrapper accepts linked legacy targets instead of leaving them pending', async () => {
  const result = await follows.createFollow('viewer', 'legacy');
  assert.ok(result.success);
  assert.equal(result.follow.status, 'accepted');
  assert.ok(result.follow.acceptedAt);
});

test('remote follows still require acceptance', async () => {
  const result = await follows.createFollow('viewer', 'remote-only');
  assert.ok(result.success);
  assert.equal(result.follow.status, 'pending');
  assert.equal(result.follow.acceptedAt, null);
  assert.equal(await follows.isFollowing('viewer', 'remote-only'), false);
});

test('canonical-domain actors without profiles still accept local follows', async () => {
  const result = await follows.createFollow('viewer', 'canonical');
  assert.ok(result.success);
  assert.equal(result.follow.status, 'accepted');
});

test('repeat follows are idempotent and unfollow reverses the accepted counts', async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await followRoute.POST(request('POST'), params());
    assert.equal(response.status, 200);
  }
  assert.equal((await db.select().from(schema.socialFollows)).length, 1);
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
});

test('following still requires a signed-in member with social features enabled', async () => {
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
    'You must enable social features first'
  );
  assert.deepEqual(await db.select().from(schema.socialFollows), []);
});
