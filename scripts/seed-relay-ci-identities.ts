import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  profiles,
  relayGroupMembers,
  relayGroups,
  users,
} from '../lib/schema';

const identities = [
  {
    userId: 'relay-ci-test-1-user',
    profileId: 'relay-ci-test-1-profile',
    email: 'relay-ci-test-1@panamia.club',
    screenname: 'relay-test-1',
    name: 'Relay CI Test 1',
    pubkey: 'b5a0dc306ece9c20c62b27727cbd120dcbd9ac2491e5f6ceae2d10066e2f86d5',
  },
  {
    userId: 'relay-ci-test-2-user',
    profileId: 'relay-ci-test-2-profile',
    email: 'relay-ci-test-2@panamia.club',
    screenname: 'relay-test-2',
    name: 'Relay CI Test 2',
    pubkey: 'ba86020444b9e5755858b0bc288a95b76b8548b3b6078bcb6bb06ec8e0cd6f7c',
  },
] as const;

async function main() {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('POSTGRES_URL is required');
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(relayGroups)
        .values({
          groupId: 'panamia-test',
          name: 'Panamia Test',
          about: 'Protocol test group for the Panamia relay.',
          discoverable: true,
          createdBy: null,
          joinPolicy: 'open',
        })
        .onConflictDoUpdate({
          target: relayGroups.groupId,
          set: {
            name: 'Panamia Test',
            about: 'Protocol test group for the Panamia relay.',
            discoverable: true,
            createdBy: null,
            joinPolicy: 'open',
            updatedAt: new Date(),
          },
        });

      for (const identity of identities) {
        await tx
          .insert(users)
          .values({
            id: identity.userId,
            email: identity.email,
            emailVerified: true,
            name: identity.name,
            screenname: identity.screenname,
            accountType: 'personal',
          })
          .onConflictDoUpdate({
            target: users.email,
            set: {
              emailVerified: true,
              name: identity.name,
              screenname: identity.screenname,
              updatedAt: new Date(),
            },
          });

        await tx
          .insert(profiles)
          .values({
            id: identity.profileId,
            userId: identity.userId,
            screenname: identity.screenname,
            email: identity.email,
            name: identity.name,
            active: true,
            membershipLevel: 'basic',
            nostrPubkey: identity.pubkey,
            nostrPubkeySource: 'byo',
          })
          .onConflictDoUpdate({
            target: profiles.email,
            set: {
              userId: identity.userId,
              screenname: identity.screenname,
              name: identity.name,
              active: true,
              membershipLevel: 'basic',
              nostrPubkey: identity.pubkey,
              nostrPubkeySource: 'byo',
              updatedAt: new Date(),
            },
          });

        await tx
          .insert(relayGroupMembers)
          .values({
            groupId: 'panamia-test',
            pubkey: identity.pubkey,
          })
          .onConflictDoNothing();
      }
    });

    console.log('Seeded relay CI identities and panamia-test membership.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
