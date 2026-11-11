import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import { mock } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '../../lib/schema';
import { getPrivateChatStorage, type R2Bucket } from '../../lib/r2';

if (process.env.NODE_ENV === 'production')
  throw new Error(
    'The synthetic encryption API harness cannot run in production.'
  );
process.env.CHAT_E2EE_ENABLED = '1';
process.env.FEDERATION_DOMAIN = 'fixture.invalid';
const context = new AsyncLocalStorage<{ userId: string | null }>();
const pg = new PGlite();
const db = drizzle(pg, { schema });
mock.module(new URL('../../lib/db.ts', import.meta.url).href, {
  exports: { db },
});
mock.module(new URL('../../auth.ts', import.meta.url).href, {
  exports: {
    auth: async () => {
      const userId = context.getStore()?.userId;
      return userId ? { user: { id: userId } } : null;
    },
  },
});
mock.module(new URL('../../lib/federation/domain.ts', import.meta.url).href, {
  exports: {
    getFederationDomain: () => 'fixture.invalid',
    DEFAULT_FEDERATION_DOMAIN: 'fixture.invalid',
  },
});
const { NextRequest } = await import('next/server');
const deviceRoute =
  await import('../../app/api/social/encryption/devices/route');
const packageRoute =
  await import('../../app/api/social/encryption/key-packages/route');
const checkpointRoute =
  await import('../../app/api/social/encryption/checkpoint/route');
const activationRoute =
  await import('../../app/api/social/encryption/activation/route');
const identityResetRoute =
  await import('../../app/api/social/encryption/identity-reset/route');
const backupRoute =
  await import('../../app/api/social/encryption/backups/route');
const backupItemRoute =
  await import('../../app/api/social/encryption/backups/[backupId]/route');
const roomRoute = await import('../../app/api/social/encryption/rooms/route');
const roomItemRoute =
  await import('../../app/api/social/encryption/rooms/[roomId]/route');
const visibilityRoute =
  await import('../../app/api/social/encryption/rooms/[roomId]/visibility/route');
const restartRoute =
  await import('../../app/api/social/encryption/rooms/[roomId]/restart/route');
const eventRoute =
  await import('../../app/api/social/encryption/rooms/[roomId]/events/route');
const eventItemRoute =
  await import('../../app/api/social/encryption/rooms/[roomId]/events/[eventId]/route');
const claimRoute =
  await import('../../app/api/social/encryption/rooms/[roomId]/key-package/route');
const receiptRoute =
  await import('../../app/api/social/encryption/rooms/[roomId]/receipts/[attemptId]/route');
const mediaRoute = await import('../../app/api/social/encryption/media/route');
const mediaItemRoute =
  await import('../../app/api/social/encryption/media/[mediaId]/route');

const objects = new Map<string, Uint8Array>();
const bucket: R2Bucket = {
  async put(key, value) {
    if (!(value instanceof Uint8Array))
      throw new Error('The harness accepts only encrypted byte arrays.');
    objects.set(key, Uint8Array.from(value));
  },
  async get(key) {
    const value = objects.get(key);
    return value
      ? { arrayBuffer: async () => Uint8Array.from(value).buffer }
      : null;
  },
  async delete(keys) {
    for (const key of typeof keys === 'string' ? [keys] : keys)
      objects.delete(key);
  },
};
getPrivateChatStorage({ CHAT_E2EE_BUCKET: bucket });
const audit: Array<{ method: string; path: string; body: string }> = [];
for (const table of [
  schema.users,
  schema.profiles,
  schema.profileOwners,
  schema.socialActors,
  schema.socialGroups,
  schema.socialGroupMembers,
  schema.socialBlocks,
  schema.socialFollows,
  schema.socialDmRequests,
  schema.socialStatuses,
  schema.socialGroupChatMessages,
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
await pg.exec(`ALTER TABLE social_dm_requests ALTER COLUMN state SET DEFAULT 'pending';
  CREATE UNIQUE INDEX fixture_dm_pair ON social_dm_requests(recipient_actor_id, sender_actor_id);`);
for (const name of [
  '0078_chat_e2ee_devices',
  '0079_chat_e2ee_rooms',
  '0080_chat_e2ee_plaintext_guards',
  '0081_chat_e2ee_media',
  '0082_chat_e2ee_recovery',
  '0083_chat_e2ee_lifecycle',
])
  await pg.exec(
    await readFile(
      new URL(`../../drizzle/${name}.sql`, import.meta.url),
      'utf8'
    )
  );

async function reset() {
  await pg.exec(`TRUNCATE users, profiles, profile_owners, social_actors, social_groups,
    social_group_members, social_blocks, social_follows, social_dm_requests,
    social_statuses, social_group_chat_messages, chat_e2ee_rooms, chat_e2ee_object_deletions CASCADE`);
  objects.clear();
  audit.length = 0;
  for (const name of ['alice', 'bob', 'carol']) {
    await db
      .insert(schema.users)
      .values({ id: `${name}-user`, email: `${name}@fixture.invalid`, name });
    await db.insert(schema.profiles).values({
      id: `${name}-profile`,
      userId: `${name}-user`,
      name,
      email: `${name}@fixture.invalid`,
      socialEligible: true,
    });
    await db.insert(schema.socialActors).values({
      id: name,
      profileId: `${name}-profile`,
      username: name,
      name,
      domain: 'fixture.invalid',
      type: 'Person',
      uri: `https://fixture.invalid/p/${name}`,
      inboxUrl: `https://fixture.invalid/p/${name}/inbox`,
      outboxUrl: `https://fixture.invalid/p/${name}/outbox`,
      followersUrl: `https://fixture.invalid/p/${name}/followers`,
      followingUrl: `https://fixture.invalid/p/${name}/following`,
      publicKey: 'fixture-activitypub-key',
      encryptedChatRequired: false,
    });
  }
  await db.insert(schema.socialActors).values({
    id: 'garden-actor',
    username: 'garden',
    name: 'Garden',
    domain: 'fixture.invalid',
    type: 'Group',
    uri: 'https://fixture.invalid/g/garden',
    inboxUrl: 'https://fixture.invalid/g/garden/inbox',
    outboxUrl: 'https://fixture.invalid/g/garden/outbox',
    followersUrl: 'https://fixture.invalid/g/garden/followers',
    followingUrl: 'https://fixture.invalid/g/garden/following',
    publicKey: 'fixture-activitypub-key',
    encryptedChatRequired: false,
  });
  await db.insert(schema.socialGroups).values({
    id: 'garden',
    actorId: 'garden-actor',
    memberCount: 2,
    visibility: 'private',
    encryptedChatRequired: false,
  });
  await db.insert(schema.socialGroupMembers).values([
    {
      id: 'alice-garden',
      groupId: 'garden',
      actorId: 'alice',
      role: 'admin',
      status: 'active',
    },
    {
      id: 'bob-garden',
      groupId: 'garden',
      actorId: 'bob',
      role: 'member',
      status: 'active',
    },
  ]);
}
await reset();

async function dispatch(
  request: InstanceType<typeof NextRequest>
): Promise<Response> {
  const path = request.nextUrl.pathname;
  const method = request.method;
  if (path === '/api/social/encryption/devices')
    return method === 'GET'
      ? deviceRoute.GET(request)
      : deviceRoute.POST(request);
  if (path === '/api/social/encryption/key-packages')
    return packageRoute.POST(request);
  if (path === '/api/social/encryption/checkpoint')
    return checkpointRoute.POST(request);
  if (path === '/api/social/encryption/activation')
    return activationRoute.POST(request);
  if (path === '/api/social/encryption/identity-reset')
    return identityResetRoute.POST(request);
  if (path === '/api/social/encryption/backups')
    return method === 'GET'
      ? backupRoute.GET(request)
      : backupRoute.POST(request);
  if (path === '/api/social/encryption/media') return mediaRoute.POST(request);
  if (path === '/api/social/encryption/rooms')
    return method === 'GET' ? roomRoute.GET(request) : roomRoute.POST(request);
  let match = /^\/api\/social\/encryption\/backups\/([^/]+)$/.exec(path);
  if (match)
    return backupItemRoute.GET(request, {
      params: Promise.resolve({ backupId: match[1] }),
    });
  match = /^\/api\/social\/encryption\/media\/([^/]+)$/.exec(path);
  if (match) {
    const params = { params: Promise.resolve({ mediaId: match[1] }) };
    if (method === 'GET') return mediaItemRoute.GET(request, params);
    if (method === 'PUT') return mediaItemRoute.PUT(request, params);
    if (method === 'DELETE') return mediaItemRoute.DELETE(request, params);
  }
  match =
    /^\/api\/social\/encryption\/rooms\/([^/]+)(?:\/(events|key-package|receipts|visibility|restart)(?:\/([^/]+))?)?$/.exec(
      path
    );
  if (match) {
    const roomId = match[1];
    if (!match[2])
      return roomItemRoute.GET(request, {
        params: Promise.resolve({ roomId }),
      });
    if (match[2] === 'visibility')
      return visibilityRoute.GET(request, {
        params: Promise.resolve({ roomId }),
      });
    if (match[2] === 'restart')
      return restartRoute.POST(request, {
        params: Promise.resolve({ roomId }),
      });
    if (match[2] === 'events' && !match[3])
      return method === 'GET'
        ? eventRoute.GET(request, { params: Promise.resolve({ roomId }) })
        : eventRoute.POST(request, { params: Promise.resolve({ roomId }) });
    if (match[2] === 'events' && match[3])
      return eventItemRoute.DELETE(request, {
        params: Promise.resolve({ roomId, eventId: match[3] }),
      });
    if (match[2] === 'key-package')
      return claimRoute.POST(request, { params: Promise.resolve({ roomId }) });
    if (match[2] === 'receipts' && match[3])
      return receiptRoute.GET(request, {
        params: Promise.resolve({ roomId, attemptId: match[3] }),
      });
  }
  return Response.json(
    { success: false, error: 'Synthetic route unavailable.' },
    { status: 404 }
  );
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url ?? '/', 'http://127.0.0.1:3147');
    let response: Response;
    if (url.pathname === '/__e2ee/health') {
      response = Response.json({ synthetic: true });
    } else if (url.pathname === '/__e2ee/reset') {
      await reset();
      response = Response.json({ reset: true });
    } else if (url.pathname === '/__e2ee/audit') {
      response = Response.json(audit);
    } else if (url.pathname === '/__e2ee/group/add-carol') {
      await db
        .insert(schema.socialGroupMembers)
        .values({
          id: 'carol-garden',
          groupId: 'garden',
          actorId: 'carol',
          role: 'member',
          status: 'active',
        })
        .onConflictDoNothing();
      response = Response.json({ added: true });
    } else if (url.pathname === '/__e2ee/group/remove-bob') {
      await db
        .delete(schema.socialGroupMembers)
        .where(eq(schema.socialGroupMembers.id, 'bob-garden'));
      response = Response.json({ removed: true });
    } else {
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of incoming) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.length;
        if (total > 25 * 1024 * 1024)
          throw new Error('Synthetic request exceeds its size bound.');
        chunks.push(bytes);
      }
      const bytes = Buffer.concat(chunks);
      audit.push({
        method: incoming.method ?? 'GET',
        path: url.pathname + url.search,
        body: bytes.toString('utf8'),
      });
      if (audit.length > 1000) audit.shift();
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (typeof value === 'string') headers.set(name, value);
      }
      const user = headers.get('x-pana-fixture-user');
      const request = new NextRequest(url, {
        method: incoming.method,
        headers,
        ...(incoming.method === 'GET' || incoming.method === 'HEAD'
          ? {}
          : { body: Uint8Array.from(bytes).buffer }),
      });
      response = await context.run(
        {
          userId: ['alice-user', 'bob-user', 'carol-user'].includes(user ?? '')
            ? user
            : null,
        },
        () => dispatch(request)
      );
    }
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(
      'Synthetic encryption API request failed',
      error instanceof Error ? error.message : 'unknown'
    );
    outgoing.statusCode = 500;
    outgoing.end('Synthetic harness failed.');
  }
});
server.listen(3148, '127.0.0.1', () =>
  console.log('Synthetic encryption API ready on loopback.')
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () =>
    server.close(() => {
      void pg.close().then(() => process.exit(0));
    })
  );
}
