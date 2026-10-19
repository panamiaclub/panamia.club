/**
 * Group feed visibility tests
 *
 * Phase 3 attaches posts to groups, which makes membership an authorization
 * rule rather than a display detail: a post in a private group must be
 * readable by its members and by nobody else. That rule is enforced in a
 * dozen separate queries, so the thing worth testing is not "does the feed
 * work" but "does every single read path apply it".
 *
 * Hence one test per read path, named after the path. A leak here is silent
 * -- no error, no log line, just a private post rendered to a stranger -- and
 * it is unrecoverable, because you cannot un-show something. These tests are
 * the only thing standing between a refactor and that outcome.
 *
 * Fixtures are per-run random and deleted in `after`, so this is safe against
 * a shared or seeded database and never truncates.
 *
 * @see lib/federation/wrappers/group-visibility.ts
 * @see docs/GROUPS-ROADMAP.md
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';

// lib/db reads POSTGRES_URL at module-eval time and static imports hoist
// above this call, so the imports below have to be dynamic.
config({ path: '.env.local' });

const { db } = await import('@/lib/db');
const { and, eq, isNotNull } = await import('drizzle-orm');
const { profiles, socialActors, socialFollows, socialStatuses, socialTags } =
  await import('@/lib/schema');
const { createGroup, joinGroup } =
  await import('@/lib/federation/wrappers/group');
const { createFollow } = await import('@/lib/federation/wrappers/follow');
const { createStatus, getStatus, getStatusReplies, likeStatus, unlikeStatus } =
  await import('@/lib/federation/wrappers/status');
const {
  getHomeTimeline,
  getActorPosts,
  getPublicTimeline,
  getAtMeTimeline,
  getGroupTimeline,
  getSentDirectMessages,
  getStatusWithLikeStatus,
} = await import('@/lib/federation/wrappers/timeline');
const { personalStatusesOnly } =
  await import('@/lib/federation/wrappers/group-visibility');

const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';

const suffix = Math.random().toString(36).slice(2, 8);

const createdActorIds: string[] = [];
let profileId: string;

/** In both groups, and followed by nobody. */
let authorId: string;
/** In both groups, and follows the author. Used for the duplicate guard. */
let memberId: string;
/** In neither group. Follows the author, so the follow arm is exercised. */
let strangerId: string;

let publicGroupId: string;
let privateGroupId: string;
let publicGroupHandle: string;
let privateGroupHandle: string;

/** Author's ordinary post, no group. The control in every assertion. */
let personalStatusId: string;
/** Post in the public group. A stranger may read this one. */
let publicGroupStatusId: string;
/** Post in the private group. The post that must never escape. */
let privateGroupStatusId: string;
/** Reply to the private post, to cover the reply path separately. */
let privateReplyId: string;

const mkActor = (username: string) => ({
  username,
  domain: 'test.invalid',
  type: 'Person',
  uri: `https://test.invalid/users/${username}`,
  inboxUrl: `https://test.invalid/users/${username}/inbox`,
  outboxUrl: `https://test.invalid/users/${username}/outbox`,
  followersUrl: `https://test.invalid/users/${username}/followers`,
  followingUrl: `https://test.invalid/users/${username}/following`,
  publicKey: 'test-public-key',
  privateKey: 'test-private-key',
});

const ids = (r: { statuses: Array<{ id: string }> }) =>
  r.statuses.map((s) => s.id);

before(async () => {
  const [profile] = await db
    .insert(profiles)
    .values({ email: `gf${suffix}@test.invalid`, name: 'Feed Founder' })
    .returning();
  profileId = profile.id;

  const [author, member, stranger] = await db
    .insert(socialActors)
    .values([
      mkActor(`fa${suffix}`),
      mkActor(`fm${suffix}`),
      mkActor(`fs${suffix}`),
    ])
    .returning();
  authorId = author.id;
  memberId = member.id;
  strangerId = stranger.id;
  createdActorIds.push(author.id, member.id, stranger.id);

  publicGroupHandle = `fgp${suffix}`;
  privateGroupHandle = `fgq${suffix}`;

  const pub = await createGroup({
    handle: publicGroupHandle,
    name: 'Open Kitchen',
    summary: 'Anyone may read',
    topics: ['cooking'],
    visibility: 'public',
    joinPolicy: 'open',
    createdByProfileId: profileId,
    founderActorId: authorId,
  });
  assert.equal(pub.success, true);
  if (!pub.success) throw new Error('fixture failed');
  publicGroupId = pub.group.id;
  createdActorIds.push(pub.actor.id);

  // joinPolicy 'open' on a private group so joining yields active membership
  // without an approval endpoint. Visibility is what is under test here, not
  // the join flow -- that is covered in group-lifecycle.test.ts.
  const priv = await createGroup({
    handle: privateGroupHandle,
    name: 'Closed Kitchen',
    summary: 'Members only',
    topics: ['cooking'],
    visibility: 'private',
    joinPolicy: 'open',
    createdByProfileId: profileId,
    founderActorId: authorId,
  });
  assert.equal(priv.success, true);
  if (!priv.success) throw new Error('fixture failed');
  privateGroupId = priv.group.id;
  createdActorIds.push(priv.actor.id);

  assert.equal((await joinGroup(publicGroupId, memberId)).success, true);
  assert.equal((await joinGroup(privateGroupId, memberId)).success, true);

  // Both followers follow the author. This is what makes the leak tests
  // meaningful: the stranger is already entitled to the author's ordinary
  // posts, so anything extra they receive came from the group.
  await createFollow(memberId, authorId);
  await createFollow(strangerId, authorId);

  // createFollow only auto-accepts when the target is on the local domain,
  // and these fixtures are deliberately remote-looking. Accept them by hand
  // so the follow arm of the home timeline is actually exercised -- with
  // pending follows the leak tests would pass for the wrong reason.
  await db
    .update(socialFollows)
    .set({ status: 'accepted', acceptedAt: new Date() })
    .where(eq(socialFollows.targetActorId, authorId));

  const personal = await createStatus(
    authorId,
    `Personal post ${suffix}`,
    undefined,
    undefined,
    'public'
  );
  assert.equal(personal.success, true);
  if (!personal.success) throw new Error('fixture failed');
  personalStatusId = personal.status.id;

  const inPublic = await createStatus(
    authorId,
    `Public group post ${suffix}`,
    undefined,
    undefined,
    'public',
    undefined,
    undefined,
    undefined,
    'cc-by-4',
    { groupId: publicGroupId }
  );
  assert.equal(inPublic.success, true);
  if (!inPublic.success) throw new Error('fixture failed');
  publicGroupStatusId = inPublic.status.id;

  const inPrivate = await createStatus(
    authorId,
    `Private group post ${suffix}`,
    undefined,
    undefined,
    'public',
    undefined,
    undefined,
    undefined,
    'cc-by-4',
    { groupId: privateGroupId }
  );
  assert.equal(inPrivate.success, true);
  if (!inPrivate.success) throw new Error('fixture failed');
  privateGroupStatusId = inPrivate.status.id;

  const reply = await createStatus(
    memberId,
    `Private reply ${suffix}`,
    undefined,
    privateGroupStatusId,
    'public',
    undefined,
    undefined,
    undefined,
    'cc-by-4',
    { groupId: privateGroupId }
  );
  assert.equal(reply.success, true);
  if (!reply.success) throw new Error('fixture failed');
  privateReplyId = reply.status.id;

  // Name the stranger inside the private post. A mention is normally an
  // invitation to read, which is exactly why it is dangerous here.
  await db.insert(socialTags).values({
    statusId: privateGroupStatusId,
    type: 'Mention',
    name: `@fs${suffix}`,
    href: `https://test.invalid/users/fs${suffix}`,
  });
});

after(async () => {
  for (const id of createdActorIds) {
    await db.delete(socialActors).where(eq(socialActors.id, id));
  }
  if (profileId) {
    await db.delete(profiles).where(eq(profiles.id, profileId));
  }

  const client = (db as unknown as { $client?: { end?: () => Promise<void> } })
    .$client;
  await client?.end?.();
});

test('a private group post is not addressed to the public collection', async () => {
  const row = await db.query.socialStatuses.findFirst({
    where: eq(socialStatuses.id, privateGroupStatusId),
  });
  const to = (row?.recipientTo ?? []) as string[];
  assert.ok(
    !to.includes(PUBLIC),
    'a private group post claiming public addressing is a false statement about who may read it'
  );
  assert.deepEqual(row?.recipientCc ?? [], []);
});

test('a public group post keeps the addressing its author chose', async () => {
  const row = await db.query.socialStatuses.findFirst({
    where: eq(socialStatuses.id, publicGroupStatusId),
  });
  const to = (row?.recipientTo ?? []) as string[];
  assert.ok(
    to.includes(PUBLIC),
    'a public group must not silently narrow its posts'
  );
});

test('home timeline: a non-member never receives a private group post', async () => {
  const seen = ids(await getHomeTimeline(strangerId));
  assert.ok(
    seen.includes(personalStatusId),
    'the stranger follows the author, so the control post must be present'
  );
  assert.ok(!seen.includes(privateGroupStatusId));
});

test('home timeline: a member receives a private group post exactly once', async () => {
  // The member is both in the group and following the author, so this post
  // matches the group arm and would also match the follow arm. Without
  // isNull(groupId) on the follow arm it renders twice.
  const seen = ids(await getHomeTimeline(memberId));
  const hits = seen.filter((id) => id === privateGroupStatusId).length;
  assert.equal(hits, 1, `expected exactly one copy, got ${hits}`);
});

test('actor posts: a private group post is absent from the public profile', async () => {
  const seen = ids(await getActorPosts(authorId, strangerId));
  assert.ok(
    seen.includes(personalStatusId),
    'ordinary posts must still show on a profile'
  );
  assert.ok(
    !seen.includes(privateGroupStatusId),
    'the author is public but the post is not'
  );
});

test('actor posts: a member does see the private group post on the profile', async () => {
  const seen = ids(await getActorPosts(authorId, memberId));
  assert.ok(seen.includes(privateGroupStatusId));
});

test('actor posts: a signed-out viewer sees neither private post nor an error', async () => {
  const seen = ids(await getActorPosts(authorId));
  assert.ok(seen.includes(personalStatusId));
  assert.ok(!seen.includes(privateGroupStatusId));
});

test('public timeline: a private group post never appears', async () => {
  const seen = ids(await getPublicTimeline(strangerId, undefined, 50));
  assert.ok(!seen.includes(privateGroupStatusId));
});

test('at-me timeline: being mentioned does not hand over a private post', async () => {
  const seen = ids(await getAtMeTimeline(strangerId));
  assert.ok(
    !seen.includes(privateGroupStatusId),
    'a mention must not act as a back door into a group'
  );
});

test('at-me timeline: a mentioned member still gets the post', async () => {
  await db.insert(socialTags).values({
    statusId: privateGroupStatusId,
    type: 'Mention',
    name: `@fm${suffix}`,
    href: `https://test.invalid/users/fm${suffix}`,
  });
  const seen = ids(await getAtMeTimeline(memberId));
  assert.ok(
    seen.includes(privateGroupStatusId),
    'the gate must not break mentions for people who are allowed to read'
  );
});

test('permalink: a non-member gets nothing rather than a 403', async () => {
  const viaTimeline = await getStatusWithLikeStatus(
    privateGroupStatusId,
    strangerId
  );
  assert.equal(
    viaTimeline,
    null,
    'a 403 would confirm the post exists, which is half of what the group was keeping'
  );

  const viaStatus = await getStatus(privateGroupStatusId, strangerId);
  assert.equal(viaStatus, null);
});

test('permalink: a member can open the private post', async () => {
  const found = await getStatusWithLikeStatus(privateGroupStatusId, memberId);
  assert.ok(found, 'members must still be able to open their own group posts');
});

test('replies: a non-member cannot read a thread inside a private group', async () => {
  const { replies } = await getStatusReplies(
    privateGroupStatusId,
    undefined,
    20,
    strangerId
  );
  assert.ok(
    !replies.some((r) => r.id === privateReplyId),
    'guessing a parent id must not expose the thread'
  );
});

test('replies: a member reads the thread normally', async () => {
  const { replies } = await getStatusReplies(
    privateGroupStatusId,
    undefined,
    20,
    memberId
  );
  assert.ok(replies.some((r) => r.id === privateReplyId));
});

test('group timeline: a non-member reading a private group gets nothing', async () => {
  const seen = ids(await getGroupTimeline(privateGroupId, strangerId));
  assert.equal(seen.length, 0);
});

test('group timeline: a member reading a private group gets the posts', async () => {
  const seen = ids(await getGroupTimeline(privateGroupId, memberId));
  assert.ok(seen.includes(privateGroupStatusId));
});

test('group timeline: a stranger can read a public group', async () => {
  const seen = ids(await getGroupTimeline(publicGroupId, strangerId));
  assert.ok(
    seen.includes(publicGroupStatusId),
    'a public group must be readable without joining it'
  );
});

test('sent messages: private group posts are not filed as DMs', async () => {
  // These posts are not publicly addressed, which is also how a DM looks.
  // Without an explicit filter the author's own Sent list fills up with them.
  const seen = ids(await getSentDirectMessages(authorId));
  assert.ok(!seen.includes(privateGroupStatusId));
});

test('outbox: no group post federates, public groups included', async () => {
  const rows = await db.query.socialStatuses.findMany({
    where: and(
      eq(socialStatuses.actorId, authorId),
      isNotNull(socialStatuses.published),
      personalStatusesOnly()
    ),
    columns: { id: true },
  });
  const seen = rows.map((r) => r.id);
  assert.ok(seen.includes(personalStatusId));
  assert.ok(
    !seen.includes(publicGroupStatusId),
    'group federation is deferred until the outbox is audited'
  );
  assert.ok(!seen.includes(privateGroupStatusId));
});

test('posting: a non-member cannot write into a group', async () => {
  const result = await createStatus(
    strangerId,
    'let me in',
    undefined,
    undefined,
    'public',
    undefined,
    undefined,
    undefined,
    'cc-by-4',
    { groupId: privateGroupId }
  );
  assert.equal(result.success, false);
});

test('posting: a non-member cannot write into a public group either', async () => {
  // Readable is not writable. A public group is still a membership.
  const result = await createStatus(
    strangerId,
    'hello kitchen',
    undefined,
    undefined,
    'public',
    undefined,
    undefined,
    undefined,
    'cc-by-4',
    { groupId: publicGroupId }
  );
  assert.equal(result.success, false);
});

test('likes: a non-member cannot like a post they cannot see', async () => {
  const liked = await likeStatus(strangerId, privateGroupStatusId);
  assert.equal(liked.success, false);

  // Unlike leaks the same count, so it is gated identically.
  const unliked = await unlikeStatus(strangerId, privateGroupStatusId);
  assert.equal(unliked.success, false);
});

test('likes: a member can like a private group post', async () => {
  const liked = await likeStatus(memberId, privateGroupStatusId);
  assert.equal(liked.success, true);
  assert.equal(liked.liked, true);
});

test('deleting a group removes its posts rather than releasing them', async () => {
  // ON DELETE SET NULL would strip the only marker making these private and
  // quietly promote every one of them onto the author's public profile.
  const throwaway = await createGroup({
    handle: `fgx${suffix}`,
    name: 'Temporary',
    summary: 'Deleted during the test',
    topics: ['temp'],
    visibility: 'private',
    joinPolicy: 'open',
    createdByProfileId: profileId,
    founderActorId: authorId,
  });
  assert.equal(throwaway.success, true);
  if (!throwaway.success) throw new Error('fixture failed');

  const post = await createStatus(
    authorId,
    `Doomed post ${suffix}`,
    undefined,
    undefined,
    'public',
    undefined,
    undefined,
    undefined,
    'cc-by-4',
    { groupId: throwaway.group.id }
  );
  assert.equal(post.success, true);
  if (!post.success) throw new Error('fixture failed');

  await db.delete(socialActors).where(eq(socialActors.id, throwaway.actor.id));

  const survivor = await db.query.socialStatuses.findFirst({
    where: eq(socialStatuses.id, post.status.id),
  });
  assert.equal(
    survivor,
    undefined,
    'the post must go with the group, not become a public personal post'
  );
});

/**
 * Reply inheritance.
 *
 * The fixture reply above passes `{ groupId: privateGroupId }` explicitly,
 * which is what made this bug survivable for so long: the suite was exercising
 * a path the product does not use. No reply composer in the app sends a group
 * id -- `PostCard` and `feed-post-card` both call the generic status endpoint
 * with `inReplyTo` and nothing else -- so every real reply to a group post was
 * taking the branch nothing covered.
 *
 * These tests therefore omit `options` entirely. That omission is the point,
 * and a future refactor that "tidies" it by passing the group id again would
 * delete the coverage without failing anything.
 */
test('a reply inherits its parent group when the caller sends none', async () => {
  const reply = await createStatus(
    memberId,
    `Inherited reply ${suffix}`,
    undefined,
    privateGroupStatusId,
    'public'
  );
  assert.equal(reply.success, true);
  if (!reply.success) throw new Error('reply failed');

  const row = await db.query.socialStatuses.findFirst({
    where: eq(socialStatuses.id, reply.status.id),
  });
  assert.equal(
    row?.groupId,
    privateGroupId,
    'a reply written with no group id must still belong to its parent group'
  );
});

test('an inherited reply does not escape to a non-member', async () => {
  const reply = await createStatus(
    memberId,
    `Escaping reply ${suffix}`,
    undefined,
    privateGroupStatusId,
    'public'
  );
  assert.equal(reply.success, true);
  if (!reply.success) throw new Error('reply failed');

  assert.equal(
    await getStatus(reply.status.id, strangerId),
    null,
    'a non-member reading the reply is the leak this inheritance prevents'
  );
  assert.ok(
    await getStatus(reply.status.id, memberId),
    'and a member must still be able to read it'
  );
});

test('a non-member cannot reply into a public group', async () => {
  const reply = await createStatus(
    strangerId,
    `Outsider reply ${suffix}`,
    undefined,
    publicGroupStatusId,
    'public'
  );
  assert.equal(
    reply.success,
    false,
    'reading a public group does not confer posting into it'
  );
});

test('a reply may not be filed into a group other than its parent', async () => {
  const reply = await createStatus(
    memberId,
    `Mismatched reply ${suffix}`,
    undefined,
    privateGroupStatusId,
    'public',
    undefined,
    undefined,
    undefined,
    'cc-by-4',
    { groupId: publicGroupId }
  );
  assert.equal(
    reply.success,
    false,
    'honouring the caller here would move a reply out of the private thread it answers'
  );
});
