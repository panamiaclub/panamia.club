import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from '../lib/schema';
import {
  assertStagingDatabase,
  type StagingState,
} from '../scripts/e2ee-staging-config';

export async function connectStaging(state: StagingState) {
  assertStagingDatabase(state.databaseUrl);
  const sql = postgres(state.databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
    onnotice: () => undefined,
  });
  try {
    const markers = await sql<{ run_id: string }[]>`
      SELECT run_id FROM pana_e2ee_pilot.owner
    `;
    if (markers.length !== 1 || markers[0].run_id !== state.runId) {
      throw new Error('Database does not belong to this isolated pilot.');
    }
    return sql;
  } catch (error) {
    await sql.end({ timeout: 5 });
    throw error;
  }
}

function actorRecord(
  origin: string,
  handle: string,
  id: string,
  profileId: string | null,
  name: string
) {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const uri = `${origin}/api/federation/actor/${handle}`;
  return {
    id,
    profileId,
    username: handle,
    domain: '127.0.0.1',
    type: profileId ? 'Person' : 'Group',
    name,
    uri,
    inboxUrl: `${uri}/inbox`,
    outboxUrl: `${uri}/outbox`,
    followersUrl: `${uri}/followers`,
    followingUrl: `${uri}/following`,
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  };
}

export async function seedStaging(
  sql: Sql,
  state: StagingState,
  scopes: readonly ('demo' | 'check')[] = ['demo', 'check']
) {
  const db = drizzle(sql, { schema });
  for (const scope of scopes) {
    for (const person of scope === 'demo'
      ? ['alice', 'bob']
      : ['alice', 'bob', 'carol']) {
      const handle = `stage-${scope}-${person}`;
      const account = {
        userId: randomUUID(),
        profileId: randomUUID(),
        actorId: randomUUID(),
        email: `${handle}@e2ee-staging.invalid`,
        handle,
      };
      state.accounts[`${scope}-${person}`] = account;
      const name = `Staging ${scope} ${person}`;
      await db.insert(schema.users).values({
        id: account.userId,
        email: account.email,
        emailVerified: true,
        name,
        screenname: handle,
        accountType: 'personal',
      });
      await db.insert(schema.profiles).values({
        id: account.profileId,
        userId: account.userId,
        screenname: handle,
        email: account.email,
        name,
        active: true,
      });
      await db
        .insert(schema.socialActors)
        .values(
          actorRecord(
            state.origin,
            handle,
            account.actorId,
            account.profileId,
            name
          )
        );
    }
    const group = {
      id: randomUUID(),
      actorId: randomUUID(),
      handle: `stage-${scope}-group`,
    };
    state.groups[scope] = group;
    await db
      .insert(schema.socialActors)
      .values(
        actorRecord(
          state.origin,
          group.handle,
          group.actorId,
          null,
          `Staging ${scope} private group`
        )
      );
    await db.insert(schema.socialGroups).values({
      id: group.id,
      actorId: group.actorId,
      createdByProfileId: state.accounts[`${scope}-alice`].profileId,
      visibility: 'private',
      joinPolicy: 'request',
      memberCount: 2,
    });
    await db.insert(schema.socialGroupMembers).values(
      ['alice', 'bob'].map((person) => ({
        groupId: group.id,
        actorId: state.accounts[`${scope}-${person}`].actorId,
        role: person === 'alice' ? ('admin' as const) : ('member' as const),
        status: 'active' as const,
        joinedAt: new Date(),
      }))
    );
  }
}

export async function resetCheckAccounts(state: StagingState) {
  const sql = await connectStaging(state);
  try {
    const database = drizzle(sql, { schema });
    await database.transaction(async (db) => {
      const checkAccounts = ['check-alice', 'check-bob', 'check-carol'].map(
        (name) => {
          const account = state.accounts[name];
          if (
            !account ||
            account.handle !== `stage-${name}` ||
            account.email !== `stage-${name}@e2ee-staging.invalid`
          ) {
            throw new Error('The automated-check fixture manifest is invalid.');
          }
          return account;
        }
      );
      for (const account of checkAccounts) {
        const [user] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, account.userId));
        const [actor] = await db
          .select()
          .from(schema.socialActors)
          .where(eq(schema.socialActors.id, account.actorId));
        if (
          user?.email !== account.email ||
          actor?.username !== account.handle ||
          actor.profileId !== account.profileId
        ) {
          throw new Error('Refusing to reset a non-check user or actor.');
        }
      }
      const group = state.groups.check;
      const [actor] = await db
        .select()
        .from(schema.socialActors)
        .where(eq(schema.socialActors.id, group.actorId));
      if (actor?.username !== 'stage-check-group' || actor.type !== 'Group') {
        throw new Error('Refusing to reset a non-check group.');
      }
      await db
        .delete(schema.socialActors)
        .where(
          inArray(schema.socialActors.id, [
            group.actorId,
            ...checkAccounts.map((account) => account.actorId),
          ])
        );
      await db.delete(schema.users).where(
        inArray(
          schema.users.id,
          checkAccounts.map((account) => account.userId)
        )
      );
    });
    await seedStaging(sql, state, ['check']);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function stagingSignInUrl(
  state: StagingState,
  accountName: string,
  callbackPath = '/messages'
) {
  const account = state.accounts[accountName];
  if (!account) throw new Error('Unknown synthetic pilot account.');
  if (!callbackPath.startsWith('/') || callbackPath.startsWith('//')) {
    throw new Error('Pilot callbacks must stay on the local app.');
  }
  if (new URL(callbackPath, state.origin).origin !== state.origin) {
    throw new Error('Pilot callbacks cannot change origin.');
  }
  const sql = await connectStaging(state);
  try {
    const db = drizzle(sql, { schema });
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, account.userId));
    if (
      user?.email !== account.email ||
      !user.email.endsWith('@e2ee-staging.invalid')
    ) {
      throw new Error('Refusing to issue a token for a non-pilot account.');
    }
    const token = randomBytes(32).toString('base64url');
    await db.insert(schema.verification).values({
      identifier: `magic-link:${token}`,
      value: JSON.stringify({ type: 'magic-link', email: account.email }),
      expiresAt: new Date(Date.now() + 5 * 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const url = new URL('/api/auth/magic-link/verify', state.origin);
    url.searchParams.set('token', token);
    url.searchParams.set('callbackURL', callbackPath);
    return url.toString();
  } finally {
    await sql.end({ timeout: 5 });
  }
}
