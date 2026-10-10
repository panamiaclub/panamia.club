/**
 * Group membership notification tests
 *
 * Phase 9 built the moderation actions. This file covers the half that tells
 * people they happened, and most of it is about the cases where the right
 * answer is to say nothing at all.
 *
 * Four silences are deliberate and each has a test, because every one of them
 * is indistinguishable from a bug unless it is written down:
 *
 *   - Unbanning says nothing. Telling someone they were unbanned tells them
 *     they were banned, which they may never have noticed.
 *   - Changing your own role says nothing. An admin may demote themselves, and
 *     being told about it by yourself is strange.
 *   - An actor with no user behind it says nothing. Groups are actors, remote
 *     actors have no local profile, and profile_id is ON DELETE SET NULL, so
 *     this is ordinary rather than exceptional.
 *   - An action that was already true says nothing, because the moderation
 *     returns before mutating and so never reaches the notify call.
 *
 * The other thing worth proving is that notification failure cannot damage
 * moderation. The action has already committed by the time we are called, and
 * a thrown error there would turn a ban that demonstrably worked into a 500.
 *
 * Fixtures are suffixed per run and removed in `after`, so this is safe
 * against a shared or seeded database and never truncates.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';

// See the note in group-search.test.ts: lib/db reads POSTGRES_URL at first
// evaluation, and static imports would hoist above this.
config({ path: '.env.local' });

const { db } = await import('@/lib/db');
const { eq, and, ne, inArray } = await import('drizzle-orm');
const {
  users,
  profiles,
  notifications,
  socialActors,
  socialBlocks,
  socialGroups,
  socialGroupMembers,
  screennameHistory,
} = await import('@/lib/schema');
const { createGroup } = await import('@/lib/federation/wrappers/group');
const {
  approveRequest,
  rejectRequest,
  setMemberRole,
  removeMember,
  banMember,
  unbanMember,
} = await import('@/lib/federation/wrappers/group-moderation');
const { notifyJoinRequested, notifyGroupPosted, notifyGroupEventPublished } =
  await import('@/lib/federation/wrappers/group-notify');
const { getNotificationMessage } = await import('@/lib/notifications');

const suffix = Math.random().toString(36).slice(2, 8);
const groupHandle = `nt${suffix}`;

let groupId: string;
let groupName: string;

/** Actor ids. */
let adminId: string;
let modId: string;
let memberId: string;
/** An actor whose profile has no user behind it -- nobody to notify. */
let userlessId: string;

/** User ids, parallel to the actors above. */
let adminUserId: string;
let modUserId: string;
let memberUserId: string;

const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];
const createdActorIds: string[] = [];

/**
 * An actor with a profile and a user behind it, as a signed-in pana has.
 *
 * The user matters here in a way it does not in the other group suites:
 * notifications are addressed to a User id and reached through
 * actor -> profile -> user, so an actor built without one is invisible to
 * every function under test.
 */
async function makeActor(label: string, withUser = true) {
  let userId: string | null = null;

  if (withUser) {
    const [user] = await db
      .insert(users)
      .values({ email: `${label}${suffix}@test.invalid`, name: label })
      .returning();
    createdUserIds.push(user.id);
    userId = user.id;
  }

  const [profile] = await db
    .insert(profiles)
    .values({
      email: `p-${label}${suffix}@test.invalid`,
      name: label,
      userId,
    })
    .returning();
  createdProfileIds.push(profile.id);

  const username = `${label}${suffix}`;
  const [actor] = await db
    .insert(socialActors)
    .values({
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
      profileId: profile.id,
      name: label,
    })
    .returning();
  createdActorIds.push(actor.id);

  return { actorId: actor.id, userId };
}

/** Membership written directly so role and status can be set outright. */
async function addMember(
  actorId: string,
  role: 'admin' | 'moderator' | 'member',
  status: 'active' | 'pending' | 'banned'
) {
  const [row] = await db
    .insert(socialGroupMembers)
    .values({
      groupId,
      actorId,
      role,
      status,
      joinedAt: status === 'active' ? new Date() : null,
    })
    .returning();
  return row.id;
}

/** Every group_membership notification sent to one person, newest first. */
async function inboxOf(userId: string) {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.target, userId),
        eq(notifications.context, 'group_membership')
      )
    );
}

/** Every notification of one context sent to one person. */
async function inboxOfContext(
  userId: string,
  context: 'group' | 'event' | 'group_membership'
) {
  return db
    .select()
    .from(notifications)
    .where(
      and(eq(notifications.target, userId), eq(notifications.context, context))
    );
}

/** The stored count, not the one a function told us it wrote. */
async function storedCount(): Promise<number> {
  const [row] = await db
    .select({ n: socialGroups.memberCount })
    .from(socialGroups)
    .where(eq(socialGroups.id, groupId));
  return row.n;
}

async function clearNotifications() {
  const targets = createdUserIds;
  if (targets.length === 0) return;
  await db.delete(notifications).where(inArray(notifications.target, targets));
}

before(async () => {
  const admin = await makeActor('na');
  adminId = admin.actorId;
  adminUserId = admin.userId as string;

  groupName = `Notify Group ${suffix}`;
  const created = await createGroup({
    handle: groupHandle,
    name: groupName,
    summary: 'A group that tells people things',
    createdByProfileId: createdProfileIds[0],
    founderActorId: adminId,
  });
  assert.equal(created.success, true, created.success ? '' : created.error);
  if (!created.success) throw new Error('fixture group failed');
  groupId = created.group.id;
  createdActorIds.push(created.actor.id);

  const mod = await makeActor('no');
  modId = mod.actorId;
  modUserId = mod.userId as string;

  const member = await makeActor('nb');
  memberId = member.actorId;
  memberUserId = member.userId as string;

  const userless = await makeActor('nu', false);
  userlessId = userless.actorId;
});

/**
 * Each test starts from the same room -- one admin, one moderator, one plain
 * member -- and an empty set of inboxes, so a count of notifications is always
 * a count of what the action under test produced.
 */
beforeEach(async () => {
  await db
    .delete(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        ne(socialGroupMembers.actorId, adminId)
      )
    );
  await db
    .update(socialGroupMembers)
    .set({ role: 'admin', status: 'active' })
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, adminId)
      )
    );
  await addMember(modId, 'moderator', 'active');
  await addMember(memberId, 'member', 'active');
  await clearNotifications();
});

after(async () => {
  await clearNotifications();
  await db
    .delete(socialGroupMembers)
    .where(eq(socialGroupMembers.groupId, groupId));
  for (const id of createdActorIds) {
    await db.delete(socialActors).where(eq(socialActors.id, id));
  }
  for (const id of createdProfileIds) {
    await db.delete(profiles).where(eq(profiles.id, id));
  }
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
  await db
    .delete(screennameHistory)
    .where(eq(screennameHistory.screenname, groupHandle));

  /* Without this the open postgres connection keeps the event loop alive and
     the runner never exits, even with every test green. */
  const client = (db as unknown as { $client?: { end?: () => Promise<void> } })
    .$client;
  await client?.end?.();
});

// ---------------------------------------------------------------------------
// The join queue
// ---------------------------------------------------------------------------

test('a join request notifies every admin and moderator, and nobody else', async () => {
  const rowId = await addMember(userlessId, 'member', 'pending');
  assert.ok(rowId);

  // The requester here needs a user, so use the plain member's actor as the
  // one asking: remove their active row first so they are only a requester.
  await db
    .delete(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, memberId)
      )
    );
  await addMember(memberId, 'member', 'pending');
  await clearNotifications();

  await notifyJoinRequested(groupId, memberId);

  const adminInbox = await inboxOf(adminUserId);
  const modInbox = await inboxOf(modUserId);
  const requesterInbox = await inboxOf(memberUserId);

  assert.equal(adminInbox.length, 1, 'the admin should be told');
  assert.equal(modInbox.length, 1, 'the moderator should be told too');
  assert.equal(
    requesterInbox.length,
    0,
    'the person asking already knows they asked'
  );

  assert.equal(adminInbox[0].type, 'Join');
  assert.equal(adminInbox[0].actor, memberUserId);
  assert.equal(adminInbox[0].objectType, 'group');
  assert.equal(adminInbox[0].objectTitle, groupName);
});

test('a join request links to the members page, where the queue is', async () => {
  await db
    .delete(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, memberId)
      )
    );
  await addMember(memberId, 'member', 'pending');
  await clearNotifications();

  await notifyJoinRequested(groupId, memberId);

  const [note] = await inboxOf(adminUserId);
  assert.equal(note.objectUrl, `/g/${groupHandle}/members`);
});

test('approving a request tells the person who asked', async () => {
  await db
    .delete(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, memberId)
      )
    );
  const rowId = await addMember(memberId, 'member', 'pending');
  await clearNotifications();

  const result = await approveRequest(groupId, adminId, rowId);
  assert.equal(result.success, true, result.success ? '' : result.error);

  const inbox = await inboxOf(memberUserId);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].type, 'Accept');
  assert.equal(inbox[0].actor, adminUserId, 'the approver is the actor');
  assert.equal(inbox[0].object, groupId, 'the id, not the handle');
  assert.equal(inbox[0].objectUrl, `/g/${groupHandle}`);
});

test('rejecting a request tells the person who asked', async () => {
  await db
    .delete(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, memberId)
      )
    );
  const rowId = await addMember(memberId, 'member', 'pending');
  await clearNotifications();

  const result = await rejectRequest(groupId, adminId, rowId);
  assert.equal(result.success, true, result.success ? '' : result.error);

  const inbox = await inboxOf(memberUserId);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].type, 'Reject');
});

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

test('being promoted says which role you gained', async () => {
  const [row] = await db
    .select()
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, memberId)
      )
    );

  const result = await setMemberRole(groupId, adminId, row.id, 'moderator');
  assert.equal(result.success, true, result.success ? '' : result.error);

  const inbox = await inboxOf(memberUserId);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].type, 'Update');
  assert.match(inbox[0].message ?? '', /now a moderator/);
  assert.match(inbox[0].message ?? '', new RegExp(groupName));
});

test('being demoted to member reads as losing a role, not gaining one', async () => {
  const [row] = await db
    .select()
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, modId)
      )
    );

  const result = await setMemberRole(groupId, adminId, row.id, 'member');
  assert.equal(result.success, true, result.success ? '' : result.error);

  const inbox = await inboxOf(modUserId);
  assert.equal(inbox.length, 1);
  assert.match(inbox[0].message ?? '', /no longer have a role/);
});

test('changing your own role notifies nobody', async () => {
  // A second admin, so the last-admin guard does not block the demotion.
  const second = await makeActor('ns');
  await addMember(second.actorId, 'admin', 'active');

  const [row] = await db
    .select()
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, adminId)
      )
    );
  await clearNotifications();

  const result = await setMemberRole(groupId, adminId, row.id, 'member');
  assert.equal(result.success, true, result.success ? '' : result.error);

  const inbox = await inboxOf(adminUserId);
  assert.equal(
    inbox.length,
    0,
    'you do not need to be told what you just did to yourself'
  );
});

// ---------------------------------------------------------------------------
// Removal and banning -- and the silence after an unban
// ---------------------------------------------------------------------------

test('being removed is announced', async () => {
  const [row] = await db
    .select()
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, memberId)
      )
    );

  const result = await removeMember(groupId, adminId, row.id);
  assert.equal(result.success, true, result.success ? '' : result.error);

  const inbox = await inboxOf(memberUserId);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].type, 'Remove');
});

test('being banned is announced, and separately from being removed', async () => {
  const [row] = await db
    .select()
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, memberId)
      )
    );

  const result = await banMember(groupId, adminId, row.id);
  assert.equal(result.success, true, result.success ? '' : result.error);

  const inbox = await inboxOf(memberUserId);
  assert.equal(inbox.length, 1);
  assert.equal(
    inbox[0].type,
    'Block',
    'a ban is not a removal with a different field'
  );
});

test('being unbanned is deliberately silent', async () => {
  const [row] = await db
    .select()
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, memberId)
      )
    );

  await banMember(groupId, adminId, row.id);
  await clearNotifications();

  const result = await unbanMember(groupId, adminId, row.id);
  assert.equal(result.success, true, result.success ? '' : result.error);

  const inbox = await inboxOf(memberUserId);
  assert.equal(
    inbox.length,
    0,
    'telling someone they were unbanned tells them they were banned'
  );
});

test('banning someone already banned repeats nothing', async () => {
  const [row] = await db
    .select()
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, memberId)
      )
    );

  await banMember(groupId, adminId, row.id);
  await clearNotifications();

  const again = await banMember(groupId, adminId, row.id);
  assert.equal(again.success, true);

  const inbox = await inboxOf(memberUserId);
  assert.equal(inbox.length, 0, 'the early return never reaches the notify');
});

// ---------------------------------------------------------------------------
// Actors with nobody behind them
// ---------------------------------------------------------------------------

test('an actor with no user is skipped without failing the moderation', async () => {
  const rowId = await addMember(userlessId, 'member', 'active');

  const result = await removeMember(groupId, adminId, rowId);
  assert.equal(
    result.success,
    true,
    'the removal must succeed even though nobody can be told'
  );

  const [gone] = await db
    .select()
    .from(socialGroupMembers)
    .where(eq(socialGroupMembers.id, rowId));
  assert.equal(gone, undefined, 'the row is still gone');
});

test('a join request from an actor with no user notifies nobody and does not throw', async () => {
  await addMember(userlessId, 'member', 'pending');
  await clearNotifications();

  await notifyJoinRequested(groupId, userlessId);

  const adminInbox = await inboxOf(adminUserId);
  assert.equal(adminInbox.length, 0);
});

test('a group that no longer exists produces no notification and no error', async () => {
  await notifyJoinRequested('does-not-exist', memberId);

  const adminInbox = await inboxOf(adminUserId);
  assert.equal(adminInbox.length, 0);
});

// ---------------------------------------------------------------------------
// Retention, and the ordering it depends on
// ---------------------------------------------------------------------------

test('membership notifications expire, overriding the never-expire rule', async () => {
  // Accept would otherwise fall under the rule that invites and their answers
  // never expire. The membership row is the audit trail, so a declined request
  // pinned to someone's bell forever serves nobody -- the context check has to
  // run before the type check for this to hold.
  await db
    .delete(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, memberId)
      )
    );
  const rowId = await addMember(memberId, 'member', 'pending');
  await clearNotifications();

  await approveRequest(groupId, adminId, rowId);

  const [note] = await inboxOf(memberUserId);
  assert.ok(note.expiresAt, 'should carry an expiry');

  const days = (note.expiresAt.getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 29 && days < 31, `expected about 30 days, got ${days}`);
});

// ---------------------------------------------------------------------------
// Notifications must not disturb the numbers Phase 9 guards
// ---------------------------------------------------------------------------

test('notifying does not touch member_count', async () => {
  const before = await storedCount();

  const [row] = await db
    .select()
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, memberId)
      )
    );
  await setMemberRole(groupId, adminId, row.id, 'moderator');

  assert.equal(
    await storedCount(),
    before,
    'a role change moves nobody in or out'
  );
});

// ---------------------------------------------------------------------------
// Announcements to the whole group
//
// Everything above lands on one person or on the leaders. These two land on
// every active member, which makes the question "who is NOT told" the one
// worth proving: the author, anyone not actually in the room, and anyone a
// block stands between.
// ---------------------------------------------------------------------------

test('a post is announced to the other active members, not to its author', async () => {
  await notifyGroupPosted(groupId, memberId, memberUserId);

  const adminInbox = await inboxOfContext(adminUserId, 'group');
  const modInbox = await inboxOfContext(modUserId, 'group');
  const authorInbox = await inboxOfContext(memberUserId, 'group');

  assert.equal(adminInbox.length, 1, 'the admin should hear about it');
  assert.equal(modInbox.length, 1, 'so should the moderator');
  assert.equal(
    authorInbox.length,
    0,
    'nobody needs telling about their own post'
  );

  assert.equal(adminInbox[0].type, 'Create');
  assert.equal(adminInbox[0].actor, memberUserId);
  assert.equal(adminInbox[0].objectType, 'group');
  assert.equal(adminInbox[0].objectTitle, groupName);

  // The group, not the individual post: the feed is where the next one will
  // be too, and the handle outlives any single status id.
  assert.equal(adminInbox[0].objectUrl, `/g/${groupHandle}`);

  assert.equal(
    getNotificationMessage({
      type: adminInbox[0].type,
      context: adminInbox[0].context,
      actorScreenname: adminInbox[0].actorScreenname,
      actorName: adminInbox[0].actorName,
      objectTitle: adminInbox[0].objectTitle,
      message: adminInbox[0].message,
    }),
    // `nb`, not `nb${suffix}`: the sentence prefers the actor's display name
    // over its screenname, and makeActor sets the name to the bare label.
    `nb posted in "${groupName}"`,
    'the group Create arm must render, not fall through to the generic sentence'
  );
});

test('a post says nothing to people who are not active members', async () => {
  await db
    .update(socialGroupMembers)
    .set({ status: 'pending' })
    .where(
      and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, modId)
      )
    );

  await notifyGroupPosted(groupId, memberId, memberUserId);

  assert.equal(
    (await inboxOfContext(modUserId, 'group')).length,
    0,
    'someone still waiting at the door is not in the room'
  );
  assert.equal(
    (await inboxOfContext(adminUserId, 'group')).length,
    1,
    'the active admin still hears it'
  );
});

test('a post is not announced to someone a block stands between', async () => {
  await db.insert(socialBlocks).values({
    actorId: adminId,
    targetActorId: memberId,
    kind: 'block',
  });

  try {
    await notifyGroupPosted(groupId, memberId, memberUserId);

    assert.equal(
      (await inboxOfContext(adminUserId, 'group')).length,
      0,
      'a block is the one thing a notification is most clearly meant to stop'
    );
    assert.equal(
      (await inboxOfContext(modUserId, 'group')).length,
      1,
      'and it stops nothing for anybody else'
    );
  } finally {
    await db
      .delete(socialBlocks)
      .where(
        and(
          eq(socialBlocks.actorId, adminId),
          eq(socialBlocks.targetActorId, memberId)
        )
      );
  }
});

test('a member with no user behind it costs the others nothing', async () => {
  await addMember(userlessId, 'member', 'active');

  await notifyGroupPosted(groupId, memberId, memberUserId);

  // There is no inbox to check -- that is the point. What must still hold is
  // that an unreachable member does not take the announcement down with it.
  assert.equal((await inboxOfContext(adminUserId, 'group')).length, 1);
  assert.equal((await inboxOfContext(modUserId, 'group')).length, 1);
});

test('a published group event reaches the members and credits the group', async () => {
  await notifyGroupEventPublished({
    groupId,
    publisherUserId: adminUserId,
    eventId: `evt-${suffix}`,
    eventSlug: `ev-${suffix}`,
    eventTitle: 'Block Party',
  });

  const modInbox = await inboxOfContext(modUserId, 'event');
  const memberInbox = await inboxOfContext(memberUserId, 'event');
  const publisherInbox = await inboxOfContext(adminUserId, 'event');

  assert.equal(modInbox.length, 1, 'the moderator should hear about it');
  assert.equal(memberInbox.length, 1, 'so should the plain member');
  assert.equal(
    publisherInbox.length,
    0,
    'the admin who pressed publish already knows'
  );

  assert.equal(modInbox[0].type, 'Create');
  assert.equal(modInbox[0].objectType, 'event');
  assert.equal(modInbox[0].objectUrl, `/e/ev-${suffix}`);

  // The group hosts it, not the admin who published it. The default sentence
  // would say "<admin> is hosting", which credits the wrong party.
  const rendered = getNotificationMessage({
    type: modInbox[0].type,
    context: modInbox[0].context,
    actorScreenname: modInbox[0].actorScreenname,
    actorName: modInbox[0].actorName,
    objectTitle: modInbox[0].objectTitle,
    message: modInbox[0].message,
  });
  assert.ok(
    rendered.includes(groupName),
    `expected the group to be named, got: ${rendered}`
  );
  assert.ok(
    rendered.includes('Block Party'),
    `expected the event title, got: ${rendered}`
  );
  assert.ok(
    !rendered.startsWith('na'),
    `expected the publisher not to be credited as host, got: ${rendered}`
  );
});
