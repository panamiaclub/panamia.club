import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';

const pg = new PGlite();
const db = drizzle(pg, { schema });
let viewer: string | null = 'alice';
let signedIn = true;
const notices: { actorId: string; payload: Record<string, unknown> }[] = [];
process.env.R2_PUBLIC_URL = 'https://uploads.chat.invalid';

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
mock.module(import.meta.resolve('../lib/federation/domain.ts'), {
  namedExports: {
    getFederationDomain: () => 'chat.invalid',
    DEFAULT_FEDERATION_DOMAIN: 'chat.invalid',
  },
});

const chat = await import('@/lib/server/group-chat');
const { getDmStream } = await import('@/lib/dm-stream');
const { GET: listRoute } =
  await import('../app/api/social/messages/groups/route');
const roomRoute = await import('../app/api/social/groups/[handle]/chat/route');
const deletionRoute =
  await import('../app/api/social/groups/[handle]/chat/[messageId]/route');
const { NextRequest } = await import('next/server');
const groupMembership = await import('@/lib/federation/wrappers/group');
const groupModeration =
  await import('@/lib/federation/wrappers/group-moderation');
const groupDeletion = await import('@/lib/server/delete-group');

getDmStream({
  DM_STREAM: {
    idFromName: (name) => name,
    get: (id) => ({
      fetch: async (_url, init) => {
        notices.push({
          actorId: String(id),
          payload: JSON.parse(String(init?.body)),
        });
        return Response.json({ delivered: 1 });
      },
    }),
  },
});

const context = (handle = 'garden') => ({
  params: Promise.resolve({ handle }),
});
const request = (method: string, value?: unknown, suffix = '') =>
  new NextRequest(
    `https://chat.invalid/api/social/groups/garden/chat${suffix}`,
    {
      method,
      ...(value === undefined
        ? {}
        : {
            body: JSON.stringify(value),
            headers: { 'Content-Type': 'application/json' },
          }),
    }
  );
let nextNonce = 0;
const input = (content = 'Hello **neighbors**!') => ({
  clientId: `chat-test-${++nextNonce}`,
  content,
});
async function send(
  content = 'Hello neighbors!',
  actor = 'alice',
  handle = 'garden'
) {
  const result = await chat.sendGroupChatMessage(handle, actor, input(content));
  if (!result.success) assert.fail(result.error);
  return result.data;
}

before(async () => {
  for (const table of [
    schema.profiles,
    schema.socialActors,
    schema.socialBlocks,
    schema.socialStatuses,
    schema.socialFollows,
    schema.socialLikes,
    schema.socialAttachments,
    schema.socialTags,
    schema.articleAnnouncements,
    schema.events,
    schema.screennameHistory,
  ]) {
    const { name, columns } = getTableConfig(table);
    await pg.exec(
      `CREATE TABLE "${name}" (${columns
        .map(
          (column) =>
            `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`
        )
        .join(', ')})`
    );
  }
  await pg.exec(
    await readFile(
      new URL('../drizzle/0044_social_groups.sql', import.meta.url),
      'utf8'
    )
  );
  await pg.exec(
    await readFile(
      new URL('../drizzle/0073_social_group_chat.sql', import.meta.url),
      'utf8'
    )
  );
  await db.insert(schema.socialActors).values([
    ...[
      'alice',
      'bob',
      'moderator',
      'admin',
      'pending',
      'banned',
      'stranger',
    ].map((id) => ({
      id,
      username: id,
      name: id,
      domain: 'chat.invalid',
      type: 'Person',
      uri: `https://chat.invalid/p/${id}`,
      inboxUrl: `https://chat.invalid/p/${id}/inbox`,
      outboxUrl: `https://chat.invalid/p/${id}/outbox`,
      followersUrl: `https://chat.invalid/p/${id}/followers`,
      followingUrl: `https://chat.invalid/p/${id}/following`,
      publicKey: 'fixture-public-key',
    })),
    ...['garden', 'open-room'].map((id) => ({
      id: `${id}-actor`,
      username: id,
      name: id,
      domain: 'chat.invalid',
      type: 'Group',
      uri: `https://chat.invalid/g/${id}`,
      inboxUrl: `https://chat.invalid/g/${id}/inbox`,
      outboxUrl: `https://chat.invalid/g/${id}/outbox`,
      followersUrl: `https://chat.invalid/g/${id}/followers`,
      followingUrl: `https://chat.invalid/g/${id}/following`,
      publicKey: 'fixture-public-key',
    })),
  ]);
  await db.insert(schema.socialGroups).values([
    {
      id: 'garden',
      actorId: 'garden-actor',
      visibility: 'private',
      memberCount: 4,
    },
    {
      id: 'open-room',
      actorId: 'open-room-actor',
      visibility: 'public',
      memberCount: 1,
    },
  ]);
  await db.insert(schema.socialGroupMembers).values([
    ...['alice', 'bob'].map((actorId) => ({
      id: `${actorId}-membership`,
      groupId: 'garden',
      actorId,
      role: 'member' as const,
      status: 'active' as const,
    })),
    {
      id: 'mod-membership',
      groupId: 'garden',
      actorId: 'moderator',
      role: 'moderator',
      status: 'active',
    },
    {
      id: 'admin-membership',
      groupId: 'garden',
      actorId: 'admin',
      role: 'admin',
      status: 'active',
    },
    {
      id: 'pending-membership',
      groupId: 'garden',
      actorId: 'pending',
      role: 'member',
      status: 'pending',
    },
    {
      id: 'banned-membership',
      groupId: 'garden',
      actorId: 'banned',
      role: 'member',
      status: 'banned',
    },
    {
      id: 'open-membership',
      groupId: 'open-room',
      actorId: 'alice',
      role: 'admin',
      status: 'active',
    },
  ]);
});

beforeEach(async () => {
  viewer = 'alice';
  signedIn = true;
  notices.length = 0;
  await db.delete(schema.socialGroupChatMessages);
  await db.delete(schema.socialBlocks);
  await db
    .insert(schema.socialGroupMembers)
    .values({
      id: 'bob-membership',
      groupId: 'garden',
      actorId: 'bob',
      status: 'active',
      role: 'member',
    })
    .onConflictDoUpdate({
      target: [
        schema.socialGroupMembers.groupId,
        schema.socialGroupMembers.actorId,
      ],
      set: { id: 'bob-membership', status: 'active', role: 'member' },
    });
  await db
    .update(schema.socialGroups)
    .set({ memberCount: 4 })
    .where(eq(schema.socialGroups.id, 'garden'));
});
after(async () => {
  await pg.close();
});

describe('native group chat membership', () => {
  it('does not make the chat of a public group public', async () => {
    for (const handle of ['garden', 'open-room', 'missing']) {
      const read = await chat.readGroupChat(handle, 'stranger');
      assert.equal(read.success, false);
      if (!read.success) assert.equal(read.status, 404);
      assert.equal(
        (await chat.sendGroupChatMessage(handle, 'stranger', input())).success,
        false
      );
    }
  });
  it('refuses pending and banned members without disclosing messages', async () => {
    await send('This is private.');
    for (const actor of ['pending', 'banned']) {
      const result = await chat.readGroupChat('garden', actor);
      assert.equal(result.success, false);
      if (!result.success)
        assert.equal(result.error, 'This group chat is not available.');
      assert.equal(
        (await chat.sendGroupChatMessage('garden', actor, input())).success,
        false
      );
    }
  });
  it('lists every active group, including an empty room, and no pending room', async () => {
    const list = await chat.listGroupChats('alice');
    assert.deepEqual(list.groups.map((group) => group.id).sort(), [
      'garden',
      'open-room',
    ]);
    assert.equal(
      list.groups.every((group) => group.lastMessage === null),
      true
    );
    assert.deepEqual((await chat.listGroupChats('pending')).groups, []);
  });
  it('revokes both reads and sends when a member is removed', async () => {
    const message = await send('A conversation before removal.');
    await db
      .update(schema.socialGroupMembers)
      .set({ status: 'banned' })
      .where(eq(schema.socialGroupMembers.id, 'bob-membership'));
    assert.equal((await chat.readGroupChat('garden', 'bob')).success, false);
    assert.equal(
      (await chat.sendGroupChatMessage('garden', 'bob', input())).success,
      false
    );
    assert.equal(
      (await chat.deleteGroupChatMessage('garden', 'bob', message.id)).success,
      false
    );
    assert.deepEqual((await chat.listGroupChats('bob')).groups, []);
  });
});

describe('native group chat persistence', () => {
  it('persists before delivery and stamps a 30-day visibility window', async () => {
    const message = await send();
    assert.equal(
      new Date(message.expiresAt).getTime() -
        new Date(message.published).getTime(),
      30 * 86_400_000
    );
    const stored = await db.select().from(schema.socialGroupChatMessages);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].body, 'Hello neighbors!');
    assert.deepEqual(notices.map((notice) => notice.actorId).sort(), [
      'admin',
      'alice',
      'bob',
      'moderator',
    ]);
    assert.equal(
      notices.every(
        (notice) =>
          notice.payload.type === 'group' &&
          notice.payload.messageId === message.id &&
          !('body' in notice.payload)
      ),
      true
    );
  });
  it('deduplicates retries by sender, group, and client nonce, not message text', async () => {
    const draft = input('Same words');
    const first = await chat.sendGroupChatMessage('garden', 'alice', draft);
    const retried = await chat.sendGroupChatMessage('garden', 'alice', draft);
    assert.equal(first.success, true);
    assert.equal(retried.success, true);
    if (first.success && retried.success)
      assert.equal(first.data.id, retried.data.id);
    await send('Same words');
    assert.equal(
      (await db.select().from(schema.socialGroupChatMessages)).length,
      2
    );
    const changed = await chat.sendGroupChatMessage('garden', 'alice', {
      ...draft,
      content: 'Different words',
    });
    assert.equal(changed.success, false);
    if (!changed.success) assert.equal(changed.status, 409);
  });
  it('keeps mirrored GIF attribution and retries JSONB metadata independent of key order', async () => {
    const draft = {
      ...input('A little hello'),
      attachments: [
        {
          type: 'image',
          mediaType: 'image/gif',
          url: 'https://uploads.chat.invalid/hello.gif',
          name: 'Hello by Artist (via GIPHY)',
        },
      ],
    };
    const first = await chat.sendGroupChatMessage('garden', 'alice', draft);
    assert.equal(first.success, true);
    const retry = await chat.sendGroupChatMessage('garden', 'alice', draft);
    assert.equal(retry.success, true);
    if (retry.success)
      assert.equal(retry.data.attachments?.[0].name, draft.attachments[0].name);
  });
  it('never sends file metadata to the live mailbox', async () => {
    await chat.sendGroupChatMessage('garden', 'alice', {
      ...input('Private caption'),
      attachments: [
        {
          type: 'image',
          mediaType: 'image/gif',
          url: 'https://uploads.chat.invalid/private.gif',
        },
      ],
    });
    assert.equal(
      notices.some(
        (notice) =>
          JSON.stringify(notice.payload).includes('Private caption') ||
          JSON.stringify(notice.payload).includes('private.gif')
      ),
      false
    );
  });
  it('filters expired and moderated rows from both the room and its preview', async () => {
    const old = await send('Expired words');
    await db
      .update(schema.socialGroupChatMessages)
      .set({ expiresAt: new Date('2000-01-01') })
      .where(eq(schema.socialGroupChatMessages.id, old.id));
    const removed = await send('Moderated words');
    assert.equal(
      (await chat.deleteGroupChatMessage('garden', 'moderator', removed.id))
        .success,
      true
    );
    const page = await chat.readGroupChat('garden', 'alice');
    assert.equal(page.success, true);
    if (page.success) assert.deepEqual(page.data.messages, []);
    assert.equal(
      (await chat.listGroupChats('alice')).groups.find(
        (group) => group.id === 'garden'
      )?.lastMessage,
      null
    );
    assert.equal(
      (await db.select().from(schema.socialGroupChatMessages)).length,
      2,
      'expiry and moderation are not permanent erasure'
    );
  });
  it('applies the existing block and mute read filter before pagination and previews', async () => {
    const visible = await send('Visible words');
    await send('Muted words', 'bob');
    await db.insert(schema.socialBlocks).values({
      id: 'mute',
      actorId: 'alice',
      targetActorId: 'bob',
      kind: 'mute',
    });
    const page = await chat.readGroupChat('garden', 'alice', { limit: 1 });
    assert.equal(page.success, true);
    if (page.success) assert.equal(page.data.messages[0].id, visible.id);
    assert.equal(
      (await chat.listGroupChats('alice')).groups.find(
        (group) => group.id === 'garden'
      )?.lastMessage?.id,
      visible.id
    );
  });
  it('pages identical timestamps deterministically without duplicates', async () => {
    const at = new Date();
    for (let index = 0; index < 5; index++) {
      await db.insert(schema.socialGroupChatMessages).values({
        id: `page-${index}`,
        groupId: 'garden',
        actorId: 'alice',
        clientId: `page-nonce-${index}`,
        body: `Message ${index}`,
        createdAt: at,
        expiresAt: new Date(at.getTime() + 86_400_000),
      });
    }
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await chat.readGroupChat('garden', 'alice', {
        limit: 2,
        cursor,
      });
      if (!result.success) assert.fail(result.error);
      ids.push(...result.data.messages.map((message) => message.id));
      cursor = result.data.nextCursor ?? undefined;
    } while (cursor);
    assert.deepEqual([...ids].sort(), [
      'page-0',
      'page-1',
      'page-2',
      'page-3',
      'page-4',
    ]);
    assert.equal(new Set(ids).size, 5);
  });
  it('reveals retry nonces only to their own sender', async () => {
    await send();
    const read = await chat.readGroupChat('garden', 'bob');
    assert.equal(read.success, true);
    if (read.success) assert.equal(read.data.messages[0].clientId, null);
  });
});

describe('native group chat input and moderation', () => {
  it('rejects empty, oversized, forged-audience, and untrusted-media payloads', async () => {
    const invalid = [
      { ...input(), content: '' },
      { ...input(), content: 'x'.repeat(5_001) },
      { ...input(), visibility: 'public' },
      { ...input(), actorId: 'admin' },
      {
        ...input(),
        attachments: [
          {
            type: 'image',
            mediaType: 'image/gif',
            url: 'https://external.invalid/tracker.gif',
          },
        ],
      },
      {
        ...input(),
        attachments: [
          {
            type: 'image',
            mediaType: 'image/svg+xml',
            url: 'https://uploads.chat.invalid/active.svg',
          },
        ],
      },
    ];
    for (const value of invalid) {
      const result = await chat.sendGroupChatMessage('garden', 'alice', value);
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.status, 400);
    }
    assert.equal(
      (await db.select().from(schema.socialGroupChatMessages)).length,
      0
    );
  });
  it('escapes hostile markup and does not render unsafe markdown links', async () => {
    const message = await send(
      '<script>alert(1)</script>\n\n[bad](javascript:alert(1))'
    );
    assert.ok(!message.content.includes('<script>'));
    assert.ok(!message.content.includes('href="javascript:'));
  });
  it('lets authors, active moderators, and admins remove messages, not other members', async () => {
    const message = await send();
    const denied = await chat.deleteGroupChatMessage(
      'garden',
      'bob',
      message.id
    );
    assert.equal(denied.success, false);
    if (!denied.success) assert.equal(denied.status, 403);
    assert.equal(
      (await chat.deleteGroupChatMessage('garden', 'alice', message.id))
        .success,
      true
    );
    const next = await send('Another message');
    assert.equal(
      (await chat.deleteGroupChatMessage('garden', 'moderator', next.id))
        .success,
      true
    );
    const third = await send('Admin moderation');
    assert.equal(
      (await chat.deleteGroupChatMessage('garden', 'admin', third.id)).success,
      true
    );
    const stored = await db
      .select()
      .from(schema.socialGroupChatMessages)
      .where(eq(schema.socialGroupChatMessages.id, third.id));
    assert.equal(stored[0].deletedByActorId, 'admin');
    assert.ok(stored[0].deletedAt);
    assert.equal(stored[0].body, 'Admin moderation');
  });
  it('cannot delete across groups or revive a deleted message by retrying', async () => {
    const draft = input('Keep the moderation decision');
    const sent = await chat.sendGroupChatMessage('garden', 'alice', draft);
    if (!sent.success) assert.fail(sent.error);
    assert.equal(
      (await chat.deleteGroupChatMessage('open-room', 'alice', sent.data.id))
        .success,
      false
    );
    await chat.deleteGroupChatMessage('garden', 'admin', sent.data.id);
    assert.equal(
      (await chat.sendGroupChatMessage('garden', 'alice', draft)).success,
      false
    );
  });
  it('validates cursors and bounded page sizes explicitly', async () => {
    for (const options of [
      { limit: 0 },
      { limit: 51 },
      { limit: NaN },
      { cursor: 'not-a-cursor' },
    ]) {
      const result = await chat.readGroupChat('garden', 'alice', options);
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.status, 400);
    }
  });
});

describe('native group chat HTTP boundary', () => {
  it('requires a session and an active-profile actor', async () => {
    signedIn = false;
    assert.equal((await listRoute()).status, 401);
    assert.equal((await roomRoute.GET(request('GET'), context())).status, 401);
    signedIn = true;
    viewer = null;
    assert.equal(
      (await roomRoute.POST(request('POST', input()), context())).status,
      403
    );
  });
  it('derives the sender server-side and returns the stored message acknowledgement', async () => {
    const response = await roomRoute.POST(
      request('POST', input('HTTP message')),
      context()
    );
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.actor.id, 'alice');
    const read = await roomRoute.GET(request('GET'), context());
    assert.equal(read.status, 200);
    assert.equal(read.headers.get('Cache-Control'), 'private, no-store');
    const data = await read.json();
    assert.equal(data.data.messages[0].id, body.data.id);
    assert.equal(data.data.viewerActorId, 'alice');
  });

  describe('group chat follows the real membership and deletion lifecycle', () => {
    it('invalidates a removed member, then excludes them from future message fan-out', async () => {
      const removed = await groupModeration.removeMember(
        'garden',
        'admin',
        'bob-membership'
      );
      assert.equal(removed.success, true);
      assert.ok(
        notices.some(
          (notice) =>
            notice.actorId === 'bob' && notice.payload.kind === 'membership'
        )
      );
      notices.length = 0;
      await send('Only current members receive this activity.');
      assert.ok(!notices.some((notice) => notice.actorId === 'bob'));
      assert.equal((await chat.readGroupChat('garden', 'bob')).success, false);
    });

    it('refreshes chat access on leave and restores it only after an active rejoin', async () => {
      assert.equal(
        (await groupMembership.leaveGroup('garden', 'bob')).success,
        true
      );
      assert.ok(
        notices.some(
          (notice) =>
            notice.actorId === 'bob' && notice.payload.kind === 'membership'
        )
      );
      assert.equal((await chat.readGroupChat('garden', 'bob')).success, false);
      assert.equal(
        (await groupMembership.joinGroup('garden', 'bob')).success,
        true
      );
      assert.equal((await chat.readGroupChat('garden', 'bob')).success, true);
    });

    it('rechecks moderator authority after demotion', async () => {
      await db
        .update(schema.socialGroupMembers)
        .set({ role: 'moderator' })
        .where(eq(schema.socialGroupMembers.id, 'bob-membership'));
      const message = await send('A member message.');
      assert.equal(
        (
          await groupModeration.setMemberRole(
            'garden',
            'admin',
            'bob-membership',
            'member'
          )
        ).success,
        true
      );
      assert.ok(
        notices.some(
          (notice) =>
            notice.actorId === 'bob' && notice.payload.kind === 'membership'
        )
      );
      assert.equal(
        (await chat.deleteGroupChatMessage('garden', 'bob', message.id))
          .success,
        false
      );
    });

    it('cascades an author deletion without retaining their message bodies', async () => {
      await db.insert(schema.socialActors).values({
        id: 'temporary-author',
        username: 'temporary-author',
        domain: 'chat.invalid',
        uri: 'https://chat.invalid/p/temporary-author',
        publicKey: 'fixture',
        inboxUrl: 'https://chat.invalid/p/temporary-author/inbox',
        outboxUrl: 'https://chat.invalid/p/temporary-author/outbox',
        followersUrl: 'https://chat.invalid/p/temporary-author/followers',
        followingUrl: 'https://chat.invalid/p/temporary-author/following',
      });
      await db
        .insert(schema.socialGroupMembers)
        .values({ groupId: 'garden', actorId: 'temporary-author' });
      const message = await send(
        'Removed with my account.',
        'temporary-author'
      );
      await db
        .delete(schema.socialActors)
        .where(eq(schema.socialActors.id, 'temporary-author'));
      assert.equal(
        (
          await db
            .select()
            .from(schema.socialGroupChatMessages)
            .where(eq(schema.socialGroupChatMessages.id, message.id))
        ).length,
        0
      );
    });

    it('includes chat in the deletion preview, cascades it, and invalidates former members', async () => {
      await db.insert(schema.socialActors).values({
        id: 'deleting-room-actor',
        username: 'deleting-room',
        domain: 'chat.invalid',
        type: 'Group',
        uri: 'https://chat.invalid/g/deleting-room',
        publicKey: 'fixture',
        inboxUrl: 'https://chat.invalid/g/deleting-room/inbox',
        outboxUrl: 'https://chat.invalid/g/deleting-room/outbox',
        followersUrl: 'https://chat.invalid/g/deleting-room/followers',
        followingUrl: 'https://chat.invalid/g/deleting-room/following',
      });
      await db
        .insert(schema.socialGroups)
        .values({ id: 'deleting-room', actorId: 'deleting-room-actor' });
      await db
        .insert(schema.socialGroupMembers)
        .values({ groupId: 'deleting-room', actorId: 'alice', role: 'admin' });
      await send('Deleted with the group.', 'alice', 'deleting-room');
      assert.equal(
        (await groupDeletion.getGroupDeletionSummary('deleting-room'))
          ?.chatMessages,
        1
      );
      const result = await groupDeletion.deleteGroup('deleting-room');
      assert.equal(result.success, true);
      assert.equal(result.deleted.chatMessages, 1);
      assert.equal(
        (
          await db
            .select()
            .from(schema.socialGroupChatMessages)
            .where(eq(schema.socialGroupChatMessages.groupId, 'deleting-room'))
        ).length,
        0
      );
      assert.ok(
        notices.some(
          (notice) =>
            notice.actorId === 'alice' &&
            notice.payload.groupId === 'deleting-room' &&
            notice.payload.kind === 'membership'
        )
      );
    });
  });
  it('keeps public-group chat member-only at the HTTP route too', async () => {
    viewer = 'stranger';
    const response = await roomRoute.GET(request('GET'), context('open-room'));
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.data, undefined);
  });
  it('rejects malformed JSON and enforces delete permissions', async () => {
    const malformed = new NextRequest(
      'https://chat.invalid/api/social/groups/garden/chat',
      { method: 'POST', body: '{' }
    );
    assert.equal((await roomRoute.POST(malformed, context())).status, 400);
    const message = await send();
    viewer = 'bob';
    assert.equal(
      (
        await deletionRoute.DELETE(new Request('https://chat.invalid'), {
          params: Promise.resolve({ handle: 'garden', messageId: message.id }),
        })
      ).status,
      403
    );
  });
  it('enables RLS without a direct-client read policy', async () => {
    await send('API-only content');
    const protection = await pg.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE relname = 'social_group_chat_messages'"
    );
    assert.equal(protection.rows[0].relrowsecurity, true);
    await pg.exec(
      'CREATE ROLE group_chat_client; GRANT SELECT ON social_group_chat_messages TO group_chat_client; SET ROLE group_chat_client;'
    );
    try {
      const result = await pg.query('SELECT * FROM social_group_chat_messages');
      assert.equal(result.rows.length, 0);
    } finally {
      await pg.exec('RESET ROLE');
    }
  });
});
