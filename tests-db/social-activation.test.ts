import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';
import { canCreateSocialActor } from '@/lib/federation/gates';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const domain = 'social.test.invalid';
const actorUri = (username: string) => `https://${domain}/p/${username}`;
let session: {
  user: { id: string; email: string; name: string; isAdmin: boolean };
} | null;
let selectedProfile: string | undefined;
let generatedKeys = 0;
let actors: typeof import('@/lib/federation/wrappers/actor');
let follows: typeof import('@/lib/federation/wrappers/follow');
let me: typeof import('../app/api/social/actors/me/route');
let followRoute: typeof import('../app/api/social/actors/[username]/follow/route');
let screennameRoute: typeof import('../app/api/user/screenname/set/route');
let activeProfile: typeof import('@/lib/server/active-profile');
let gate: typeof import('@/components/social/SocialEligibilityGate');
let NextRequest: typeof import('next/server').NextRequest;
let actorQuery: {
  data?: {
    actor: schema.PublicSocialActor | null;
    eligible: boolean;
    screenname?: string | null;
  };
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => Promise<void>;
};

mock.module(import.meta.resolve('../lib/db.ts'), {
  namedExports: { db },
});
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: { auth: async () => session },
});
mock.module(import.meta.resolve('next/headers'), {
  namedExports: {
    cookies: async () => ({
      get: (name: string) =>
        name === 'pana_active_profile' && selectedProfile
          ? { value: selectedProfile }
          : undefined,
    }),
  },
});
mock.module(import.meta.resolve('../lib/federation/crypto/keys.ts'), {
  namedExports: {
    generateActorKeyPair: () => {
      generatedKeys++;
      return {
        publicKey: `public-key-${generatedKeys}`,
        privateKey: `private-key-${generatedKeys}`,
      };
    },
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
    canCreateSocialActor,
    createActorForProfile: (
      ...args: Parameters<typeof actors.createActorForProfile>
    ) => actors.createActorForProfile(...args),
    getActorByScreenname: (
      ...args: Parameters<typeof actors.getActorByScreenname>
    ) => actors.getActorByScreenname(...args),
    createFollow: (...args: Parameters<typeof follows.createFollow>) =>
      follows.createFollow(...args),
    deleteFollow: (...args: Parameters<typeof follows.deleteFollow>) =>
      follows.deleteFollow(...args),
  },
});
mock.module(import.meta.resolve('../lib/query/social.ts'), {
  namedExports: {
    useMyActor: () => actorQuery,
    useEnableSocial: () => {
      throw new Error('Eligible members must not need the opt-in mutation');
    },
  },
});

const tables = [
  schema.users,
  schema.profiles,
  schema.profileOwners,
  schema.socialActors,
  schema.socialFollows,
  schema.socialBlocks,
  schema.screennameHistory,
  schema.socialGroups,
];

before(async () => {
  for (const table of tables) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map(
      (column) =>
        `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`
    );
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(', ')})`);
  }
  await pg.exec(`
    ALTER TABLE profiles ALTER COLUMN social_eligible SET DEFAULT true;
    ALTER TABLE social_actors
      ADD UNIQUE (profile_id),
      ADD UNIQUE (uri),
      ADD UNIQUE (username, domain),
      ALTER COLUMN following_count SET DEFAULT 0,
      ALTER COLUMN followers_count SET DEFAULT 0,
      ALTER COLUMN status_count SET DEFAULT 0;
    ALTER TABLE profile_owners ADD UNIQUE (profile_id, user_id);
  `);
  actors = await import('@/lib/federation/wrappers/actor');
  follows = await import('@/lib/federation/wrappers/follow');
  activeProfile = await import('@/lib/server/active-profile');
  me = await import('../app/api/social/actors/me/route');
  followRoute =
    await import('../app/api/social/actors/[username]/follow/route');
  screennameRoute = await import('../app/api/user/screenname/set/route');
  gate = await import('@/components/social/SocialEligibilityGate');
  ({ NextRequest } = await import('next/server'));
});

function signIn(isAdmin = false) {
  session = {
    user: {
      id: 'viewer',
      email: 'viewer@test.invalid',
      name: 'Viewer',
      isAdmin,
    },
  };
}

async function member(
  id: string,
  options: { handle?: string | null; eligible?: boolean; active?: boolean } = {}
) {
  const handle = options.handle === undefined ? id : options.handle;
  await db.insert(schema.users).values({
    id,
    email: `${id}@test.invalid`,
    name: `Account name for ${id}`,
    screenname: handle,
  });
  await db.insert(schema.profiles).values({
    id: `${id}-profile`,
    userId: id,
    email: `${id}@test.invalid`,
    name: handle || id,
    screenname: handle,
    socialEligible: options.eligible ?? true,
    active: options.active ?? true,
  });
}

beforeEach(async () => {
  for (const table of [...tables].reverse()) await db.delete(table);
  await member('viewer');
  signIn();
  selectedProfile = undefined;
  generatedKeys = 0;
  actorQuery = {
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: async () => {},
  };
});

after(async () => {
  await pg.close();
});

async function backfill() {
  const route = await import('../app/api/admin/social/actors/backfill/route');
  return route.POST();
}

function claim(screenname = 'viewer-new') {
  return screennameRoute.POST(
    new NextRequest(`https://${domain}/api/user/screenname/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screenname, name: 'Viewer' }),
    })
  );
}

function gateMarkup() {
  return renderToStaticMarkup(
    createElement(gate.SocialEligibilityGate, { children: 'member-feed' })
  );
}

test('reading the current actor automatically prepares an eligible member', async () => {
  const response = await me.GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.eligible, true);
  assert.equal(body.data.actor.username, 'viewer');
  assert.equal(body.data.actor.domain, domain);
  assert.equal(body.data.actor.profileId, 'viewer-profile');
  assert.equal('privateKey' in body.data.actor, false);
  assert.equal(generatedKeys, 1);

  const second = await me.GET();
  assert.equal((await second.json()).data.actor.id, body.data.actor.id);
  assert.equal(generatedKeys, 1);
});

test('concurrent provisioning creates exactly one stable identity', async () => {
  const results = await Promise.allSettled([
    actors.createActorForProfile('viewer-profile'),
    actors.createActorForProfile('viewer-profile'),
    actors.createActorForProfile('viewer-profile'),
  ]);
  const identities = await db.select().from(schema.socialActors);
  assert.equal(identities.length, 1);
  for (const settled of results) {
    if (settled.status !== 'fulfilled') assert.fail(settled.reason);
    const result = settled.value;
    if (!result.success) assert.fail(result.error);
    assert.equal(result.actor.id, identities[0].id);
    assert.equal(result.actor.publicKey, identities[0].publicKey);
    assert.equal('privateKey' in result.actor, false);
  }
});

test('existing legacy-domain actors retain their identity and signing keys', async () => {
  const result = await actors.createActorForProfile('viewer-profile');
  assert.equal(result.success, true);
  await db.update(schema.socialActors).set({
    domain: 'legacy.test.invalid',
    uri: 'https://legacy.test.invalid/p/viewer',
  });
  const [before] = await db.select().from(schema.socialActors);

  await me.GET();
  signIn(true);
  const response = await backfill();
  assert.equal(response.status, 200);
  const [after] = await db.select().from(schema.socialActors);
  assert.deepEqual(after, before);
  assert.equal(generatedKeys, 1);
});

test('a username collision never adopts or overwrites another identity', async () => {
  await member('other');
  await actors.createActorForProfile('other-profile');
  await db
    .update(schema.socialActors)
    .set({ username: 'viewer', uri: actorUri('viewer') });
  const [before] = await db.select().from(schema.socialActors);

  const result = await actors.createActorForProfile('viewer-profile');
  assert.equal(result.success, false);
  if (result.success) assert.fail('The other identity cannot be adopted');
  assert.match(result.error, /already|conflict/i);
  assert.deepEqual(await db.select().from(schema.socialActors), [before]);
});

for (const collision of ['username', 'uri'] as const) {
  test(`a ${collision}-only collision never claims an unlinked actor`, async () => {
    await member('other');
    await actors.createActorForProfile('other-profile');
    await db.update(schema.socialActors).set({
      profileId: null,
      ...(collision === 'username'
        ? { username: 'viewer' }
        : { uri: actorUri('viewer') }),
    });
    const [before] = await db.select().from(schema.socialActors);

    const result = await actors.createActorForProfile('viewer-profile');
    assert.equal(result.success, false);
    assert.deepEqual(await db.select().from(schema.socialActors), [before]);
  });
}

test('automatic setup exposes provisioning failures rather than pretending the actor is absent', async () => {
  await member('other');
  await actors.createActorForProfile('other-profile');
  await db.update(schema.socialActors).set({ uri: actorUri('viewer') });
  await assert.rejects(me.GET(), /Could not prepare social account/);
});

test('the original activation endpoint remains idempotent for older clients', async () => {
  const first = await me.POST();
  const second = await me.POST();
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(
    (await first.json()).data.actor.id,
    (await second.json()).data.actor.id
  );
  assert.equal(generatedKeys, 1);
});

test('ineligible and handle-less profiles are not provisioned automatically', async () => {
  await db
    .update(schema.profiles)
    .set({ socialEligible: false })
    .where(eq(schema.profiles.id, 'viewer-profile'));
  const denied = await me.GET();
  assert.equal((await denied.json()).data.eligible, false);

  await db
    .update(schema.profiles)
    .set({ socialEligible: true, screenname: null });
  await db.update(schema.users).set({ screenname: null });
  const incomplete = await me.GET();
  assert.equal((await incomplete.json()).data.actor, null);
  await db.update(schema.profiles).set({ screenname: '   ' });
  const blank = await me.GET();
  assert.equal((await blank.json()).data.actor, null);
  const creation = await actors.createActorForProfile('viewer-profile');
  assert.equal(creation.success, false);
  assert.equal(generatedKeys, 0);
  assert.deepEqual(await db.select().from(schema.socialActors), []);
});

test('automatic setup preserves the eligibility gate rather than using listing activity', async () => {
  await db.update(schema.profiles).set({ active: false });
  const profile = await activeProfile.getActiveProfileWithActor('viewer');
  assert.equal(profile?.socialActor?.username, 'viewer');
});

test('forged active-profile selections cannot provision an unowned listing', async () => {
  await db.insert(schema.profiles).values({
    id: 'listing',
    email: 'listing@test.invalid',
    name: 'Unclaimed Listing',
    screenname: 'unclaimed-listing',
    socialEligible: true,
  });
  selectedProfile = 'listing';
  const response = await me.GET();
  assert.equal((await response.json()).data.actor.profileId, 'viewer-profile');
  const identities = await db.select().from(schema.socialActors);
  assert.deepEqual(
    identities.map((actor) => actor.profileId),
    ['viewer-profile']
  );
});

test('authorized act-as setup provisions the business, not the owner', async () => {
  await db.insert(schema.profiles).values({
    id: 'listing',
    email: 'listing@test.invalid',
    name: 'Claimed Listing',
    screenname: 'claimed-listing',
    socialEligible: true,
  });
  await db.insert(schema.profileOwners).values({
    userId: 'viewer',
    profileId: 'listing',
    role: 'owner',
  });
  selectedProfile = 'listing';
  const response = await me.GET();
  assert.equal((await response.json()).data.actor.profileId, 'listing');
  assert.deepEqual(
    (await db.select().from(schema.socialActors)).map(
      (actor) => actor.username
    ),
    ['claimed-listing']
  );
});

test('signed-out actor reads do not create an identity', async () => {
  session = null;
  assert.equal((await me.GET()).status, 401);
  assert.equal(generatedKeys, 0);
});

test('choosing a first handle makes a new member followable immediately', async () => {
  await db.delete(schema.profiles);
  await db.update(schema.users).set({ screenname: null });
  assert.equal((await claim()).status, 200);
  const actor = await actors.getActorByScreenname('viewer-new');
  assert.ok(actor);
  assert.equal(actor.domain, domain);
  assert.equal(actor.username, 'viewer-new');
});

test('retrying an unchanged handle repairs a missing actor without a rename', async () => {
  assert.equal((await claim('viewer')).status, 200);
  const actor = await actors.getActorByScreenname('viewer');
  assert.ok(actor);
  assert.deepEqual(await db.select().from(schema.screennameHistory), []);
});

test('choosing a handle does not override social ineligibility', async () => {
  await db.update(schema.profiles).set({ socialEligible: false });
  assert.equal((await claim()).status, 200);
  assert.equal(await actors.getActorByScreenname('viewer-new'), null);
  assert.equal(generatedKeys, 0);
});

test('a first follow works without visiting the activation screen', async () => {
  await member('target');
  await actors.createActorForProfile('target-profile');
  const response = await followRoute.POST(
    new NextRequest(`https://${domain}/api/social/actors/target/follow`, {
      method: 'POST',
    }),
    { params: Promise.resolve({ username: 'target' }) }
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.follow.status, 'accepted');
  assert.equal((await db.select().from(schema.socialActors)).length, 2);
});

test('existing members can be repaired without signing in themselves', async () => {
  await member('claribel', { handle: 'kachikai' });
  await member('anette', { handle: 'anette-es-de-pana' });
  assert.equal(await actors.getActorByScreenname('kachikai'), null);
  signIn(true);
  const response = await backfill();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: { processed: 3, remaining: 0 },
  });
  for (const username of ['kachikai', 'anette-es-de-pana']) {
    const actor = await actors.getActorByScreenname(username);
    assert.ok(actor);
    assert.equal(actor.domain, domain);
  }
  const viewer = await actors.getActorByScreenname('viewer');
  assert.ok(viewer);
  const suggestions = await follows.listSuggestedActors(viewer.id, 10);
  assert.deepEqual(suggestions.map((actor) => actor.username).sort(), [
    'anette-es-de-pana',
    'kachikai',
  ]);
  assert.ok(suggestions.every((actor) => !('privateKey' in actor)));
  const search = await import('../app/api/social/actors/search/route');
  const result = await search.GET(
    new NextRequest(`https://${domain}/api/social/actors/search?q=Anette`)
  );
  assert.deepEqual(
    (await result.json()).data.map(
      (actor: { username: string }) => actor.username
    ),
    ['anette-es-de-pana']
  );
  const privateName = await search.GET(
    new NextRequest(`https://${domain}/api/social/actors/search?q=Claribel`)
  );
  assert.deepEqual((await privateName.json()).data, []);
  assert.deepEqual(await db.select().from(schema.socialFollows), []);
});

test('repair is bounded and repeatable until all existing eligible members are ready', async () => {
  for (let i = 0; i < 12; i++) await member(`member-${i}`);
  signIn(true);
  const first = await backfill();
  assert.deepEqual((await first.json()).data, { processed: 10, remaining: 3 });
  const second = await backfill();
  assert.deepEqual((await second.json()).data, { processed: 3, remaining: 0 });
  const third = await backfill();
  assert.deepEqual((await third.json()).data, { processed: 0, remaining: 0 });
  assert.equal(generatedKeys, 13);
});

test('repair excludes unclaimed listings, ineligible members, and missing handles', async () => {
  await member('denied', { eligible: false });
  await member('incomplete', { handle: null });
  await db.insert(schema.profiles).values({
    id: 'unclaimed',
    email: 'listing@test.invalid',
    name: 'Unclaimed Listing',
    screenname: 'unclaimed-listing',
    socialEligible: true,
  });
  signIn(true);
  const response = await backfill();
  assert.deepEqual((await response.json()).data, {
    processed: 1,
    remaining: 0,
  });
  assert.deepEqual(
    (await db.select().from(schema.socialActors)).map(
      (actor) => actor.profileId
    ),
    ['viewer-profile']
  );
});

test('repair and automatic setup honor legacy user-handle fallback', async () => {
  await db.update(schema.profiles).set({ screenname: null });
  signIn(true);
  const response = await backfill();
  assert.equal(response.status, 200);
  assert.equal(
    (await actors.getActorByScreenname('viewer'))?.profileId,
    'viewer-profile'
  );
});

test('only an authenticated admin can repair other member identities', async () => {
  assert.equal((await backfill()).status, 401);
  session = null;
  assert.equal((await backfill()).status, 401);
  assert.equal(generatedKeys, 0);
});

test('repair reports a collision instead of claiming success or stealing the actor', async () => {
  await member('other');
  await actors.createActorForProfile('other-profile');
  await db
    .update(schema.socialActors)
    .set({ username: 'viewer', uri: actorUri('viewer') });
  signIn(true);
  const response = await backfill();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).success, false);
  assert.equal((await db.select().from(schema.socialActors)).length, 1);
});

test('eligible members see the feed without an enable-social prompt', async () => {
  const response = await me.GET();
  actorQuery.data = (await response.json()).data;
  const html = gateMarkup();
  assert.match(html, /member-feed/);
  assert.doesNotMatch(html, /Enable Social Features/);
});

test('a member missing a handle is directed to profile setup, not social opt-in', () => {
  actorQuery.data = { actor: null, eligible: true, screenname: null };
  const html = gateMarkup();
  assert.match(html, /Choose Your Handle/);
  assert.match(html, /\/account\/profile\/edit/);
  assert.doesNotMatch(html, /Enable Social Features/);
});

test('a provisioning failure remains an explicit retryable error', () => {
  actorQuery.isError = true;
  actorQuery.error = new Error('Could not prepare social account');
  const html = gateMarkup();
  assert.match(html, /Try Again/);
  assert.doesNotMatch(
    html,
    /Social Features Unavailable|Enable Social Features/
  );
});

test('a handled profile with missing actor data offers a retry, not another handle', () => {
  actorQuery.data = { actor: null, eligible: true, screenname: 'viewer' };
  const html = gateMarkup();
  assert.match(html, /Try Again/);
  assert.doesNotMatch(html, /Choose Your Handle|Enable Social Features/);
});
