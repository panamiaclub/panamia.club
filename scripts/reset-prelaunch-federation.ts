import { drizzle } from 'drizzle-orm/postgres-js';
import { and, inArray, isNotNull, ne, or } from 'drizzle-orm';
import postgres from 'postgres';
import {
  socialActors,
  socialBlocks,
  socialDmRequests,
  socialFollows,
  socialLikes,
  socialStatuses,
} from '../lib/schema';
import { DEFAULT_FEDERATION_DOMAIN } from '../lib/federation/domain';

async function main() {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('POSTGRES_URL is required');
  }

  const apply = process.argv.includes('--apply');
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    const actors = await db
      .select({
        id: socialActors.id,
        username: socialActors.username,
        domain: socialActors.domain,
      })
      .from(socialActors)
      .where(
        and(
          isNotNull(socialActors.profileId),
          ne(socialActors.domain, DEFAULT_FEDERATION_DOMAIN)
        )
      );

    if (actors.length === 0) {
      console.log('No local actors remain on the retired federation domain.');
      return;
    }

    console.log(
      `${apply ? 'Resetting' : 'Would reset'} ${actors.length} local actor(s):`
    );
    for (const actor of actors) {
      console.log(`  @${actor.username}@${actor.domain}`);
    }

    if (!apply) {
      console.log('Dry run only. Pass --apply to delete pre-launch activity.');
      return;
    }

    const actorIds = actors.map((actor) => actor.id);

    await db.transaction(async (tx) => {
      await tx
        .delete(socialLikes)
        .where(inArray(socialLikes.actorId, actorIds));

      await tx
        .delete(socialFollows)
        .where(
          or(
            inArray(socialFollows.actorId, actorIds),
            inArray(socialFollows.targetActorId, actorIds)
          )
        );

      await tx
        .delete(socialBlocks)
        .where(
          or(
            inArray(socialBlocks.actorId, actorIds),
            inArray(socialBlocks.targetActorId, actorIds)
          )
        );

      await tx
        .delete(socialDmRequests)
        .where(
          or(
            inArray(socialDmRequests.senderActorId, actorIds),
            inArray(socialDmRequests.recipientActorId, actorIds)
          )
        );

      await tx
        .delete(socialStatuses)
        .where(inArray(socialStatuses.actorId, actorIds));

      await tx
        .update(socialActors)
        .set({
          followingCount: 0,
          followersCount: 0,
          statusCount: 0,
          updatedAt: new Date(),
        })
        .where(inArray(socialActors.id, actorIds));
    });

    const remaining = await db
      .select({ id: socialActors.id })
      .from(socialActors)
      .where(
        and(
          isNotNull(socialActors.profileId),
          ne(socialActors.domain, DEFAULT_FEDERATION_DOMAIN)
        )
      );

    console.log(
      `Deleted pre-launch federation activity for ${actors.length} actor(s).`
    );
    console.log(
      `${remaining.length} actor(s) still require identity repair to ${DEFAULT_FEDERATION_DOMAIN}.`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
