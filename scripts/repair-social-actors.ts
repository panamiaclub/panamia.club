#!/usr/bin/env npx tsx
/**
 * Repair local SocialActor identity columns so profiles are findable.
 *
 * `getActorByScreenname` — the lookup behind /api/social/actors/[username],
 * the follow button, and WebFinger — matches on BOTH username and domain:
 *
 *   and(eq(a.username, screenname), eq(a.domain, socialConfig.domain))
 *
 * Two independent defects put rows outside that predicate, and the symptom of
 * each is identical: a 404 that looks exactly like "this profile has no social
 * presence", when in fact the actor exists and is merely unreachable.
 *
 * 1. Actors minted under the wrong domain. `getFederationDomain()` falls back
 *    to the hostname in NEXT_PUBLIC_HOST_URL, so a process run with a local
 *    host but pointed at a shared database writes `domain = 'localhost'` and
 *    URIs of the form `https://localhost/p/name`.
 *
 * 2. Actors left behind by a rename. `syncActorFromProfile` copies name,
 *    summary and icon, and deliberately does NOT touch username or uri —
 *    correct for a federated actor, whose URI remote servers hold as a primary
 *    key, but it means renaming a profile strands its actor under the old
 *    handle.
 *
 * A rename that never called `syncActorFromProfile` at all also leaves the
 * actor's display name quoting the old business, which is what a follower
 * would see. `name` is not identity, so it is synced for every actor here,
 * including ones whose handle must be left alone.
 *
 * `summary` is deliberately NOT synced. The seeder wrote profiles.five_words
 * (a short tagline) there, while `getProfileSummary` would write the much
 * longer descriptions.details. Both are defensible bios and neither is stale,
 * so choosing between them is a product decision rather than a repair.
 *
 * WHY REWRITING IS SAFE HERE, AND WHEN IT WOULD NOT BE
 *
 * lib/federation/domain.ts is emphatic that changing an actor's identity
 * orphans it: the fediverse sees a new account and the Move migration carries
 * followers but not posts. That hazard is real and applies to an actor that
 * has federated. It cannot apply to an actor nothing could ever reach — no
 * remote server resolves `https://localhost/`.
 *
 * Rather than reason about which rows those are, this script refuses to touch
 * any actor showing evidence of use: statuses, follows in either direction, or
 * likes. An inert actor is rewritten; an active one is reported and skipped.
 * That guard is what makes the script safe to point at production.
 *
 * Remote actors (profile_id IS NULL) are cached copies of accounts on other
 * servers and are never considered.
 *
 * Usage:
 *   POSTGRES_URL=... npx tsx scripts/repair-social-actors.ts [--apply]
 *   POSTGRES_URL=... npx tsx scripts/repair-social-actors.ts --domain panamia.club --apply
 *
 * Defaults to a dry run. Pass --apply to write. Safe to run repeatedly: a
 * second run reports nothing to do.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, isNotNull, sql } from 'drizzle-orm';
import * as schema from '../lib/schema';
import { DEFAULT_FEDERATION_DOMAIN } from '../lib/federation/domain';

const { socialActors, profiles } = schema;

/**
 * Mirrors socialConfig.endpoints in lib/federation/index.ts. Inlined because
 * importing that barrel pulls in the app's Cloudflare-aware db client, which a
 * plain node script cannot construct. assertTemplatesMatchReality below proves
 * the copy still agrees with what the application actually minted.
 */
const urlsFor = (username: string, domain: string) => {
  const base = `https://${domain}/p/${username}`;
  return {
    uri: base,
    inboxUrl: `${base}/inbox`,
    outboxUrl: `${base}/outbox`,
    followersUrl: `${base}/followers`,
    followingUrl: `${base}/following`,
  };
};

type ActorRow = {
  id: string;
  username: string;
  domain: string;
  uri: string;
  inboxUrl: string;
  outboxUrl: string;
  followersUrl: string;
  followingUrl: string;
  actorName: string | null;
  screenname: string | null;
  profileId: string;
  profileName: string;
};

/**
 * Guard against the inlined templates drifting from the real ones.
 *
 * Any actor already sitting on the target domain was minted by the app itself,
 * so its stored URIs are ground truth. If this script would have produced
 * something different, every rewrite below is suspect and nothing should run.
 */
function assertTemplatesMatchReality(actors: ActorRow[], domain: string) {
  const reference = actors.find(
    (a) => a.domain === domain && a.uri.startsWith(`https://${domain}/p/`)
  );
  if (!reference) {
    console.log(
      'No existing actor on the target domain to check URL templates against.'
    );
    return;
  }

  const expected = urlsFor(reference.username, reference.domain);
  const mismatches = (
    ['uri', 'inboxUrl', 'outboxUrl', 'followersUrl', 'followingUrl'] as const
  ).filter((k) => reference[k] !== expected[k]);

  if (mismatches.length > 0) {
    console.error(
      `\nURL templates disagree with @${reference.username}, minted by the app:`
    );
    for (const k of mismatches) {
      console.error(
        `  ${k}\n    stored: ${reference[k]}\n    built:  ${expected[k]}`
      );
    }
    console.error(
      '\nRefusing to run. Re-sync urlsFor() with socialConfig.endpoints.'
    );
    process.exit(1);
  }

  console.log(
    `URL templates verified against @${reference.username} (minted by the app).`
  );
}

async function main() {
  const apply = process.argv.includes('--apply');

  const domainIdx = process.argv.indexOf('--domain');
  const domainArg = domainIdx === -1 ? undefined : process.argv[domainIdx + 1];
  if (domainIdx !== -1 && (!domainArg || domainArg.startsWith('--'))) {
    console.error(
      'Error: --domain requires a value, e.g. --domain panamia.club'
    );
    process.exit(1);
  }
  const targetDomain = domainArg ?? DEFAULT_FEDERATION_DOMAIN;

  if (!process.env.POSTGRES_URL) {
    console.error('Error: POSTGRES_URL environment variable is required');
    process.exit(1);
  }

  console.log('ACTORS:start');
  console.log(`Target identity domain: ${targetDomain}\n`);

  const client = postgres(process.env.POSTGRES_URL, { prepare: false });
  const db = drizzle(client, { schema });

  try {
    const actors: ActorRow[] = await db
      .select({
        id: socialActors.id,
        username: socialActors.username,
        domain: socialActors.domain,
        uri: socialActors.uri,
        inboxUrl: socialActors.inboxUrl,
        outboxUrl: socialActors.outboxUrl,
        followersUrl: socialActors.followersUrl,
        followingUrl: socialActors.followingUrl,
        actorName: socialActors.name,
        screenname: profiles.screenname,
        profileId: profiles.id,
        profileName: profiles.name,
      })
      .from(socialActors)
      .innerJoin(profiles, eq(profiles.id, socialActors.profileId))
      .where(isNotNull(socialActors.profileId));

    console.log(`${actors.length} local actor(s) examined.`);
    assertTemplatesMatchReality(actors, targetDomain);

    // One round trip for every table that would make an actor "in use".
    const active = new Set<string>(
      (
        await db.execute<{ actor_id: string }>(sql`
          SELECT actor_id FROM social_statuses
          UNION SELECT actor_id FROM social_follows
          UNION SELECT target_actor_id FROM social_follows
          UNION SELECT actor_id FROM social_likes
        `)
      ).map((r) => r.actor_id)
    );

    // (username, domain) is uniquely indexed and uri is unique, so a rewrite
    // that collides would abort the transaction. Detect it first and report
    // which actor is in the way.
    const takenByOther = new Map<string, string>();
    for (const a of actors) takenByOther.set(`${a.username}@${a.domain}`, a.id);

    let repaired = 0;
    let displaySynced = 0;
    let skippedActive = 0;
    let skippedCollision = 0;
    let skippedNoHandle = 0;

    for (const actor of actors) {
      const patch: Partial<typeof socialActors.$inferInsert> = {};

      // The display name is not identity. syncActorFromProfile rewrites it
      // routinely, so it is safe to correct on every actor — including one
      // whose handle is frozen because it has federated. The summary is
      // deliberately left alone: the seeder wrote profiles.five_words there
      // while getProfileSummary would write descriptions.details, and picking
      // a winner is a product call, not a repair.
      const desiredName = actor.profileName;
      if (actor.actorName !== desiredName) {
        console.log(
          `  display     @${actor.username}: ${JSON.stringify(actor.actorName)} -> ${JSON.stringify(desiredName)}`
        );
        patch.name = desiredName;
        displaySynced++;
      }

      const username = actor.screenname?.trim();
      const desired = username ? urlsFor(username, targetDomain) : null;
      const identityCurrent =
        !!username &&
        !!desired &&
        actor.username === username &&
        actor.domain === targetDomain &&
        actor.uri === desired.uri &&
        actor.inboxUrl === desired.inboxUrl &&
        actor.outboxUrl === desired.outboxUrl &&
        actor.followersUrl === desired.followersUrl &&
        actor.followingUrl === desired.followingUrl;

      if (!username) {
        console.warn(
          `  no handle   ${actor.profileId}: profile has no screenname, leaving identity alone`
        );
        skippedNoHandle++;
      } else if (identityCurrent) {
        // nothing to do
      } else if (active.has(actor.id)) {
        console.warn(
          `  IN USE      @${actor.username}@${actor.domain} -> @${username}@${targetDomain}: has posts/follows/likes, leaving identity alone`
        );
        skippedActive++;
      } else {
        const holder = takenByOther.get(`${username}@${targetDomain}`);
        if (holder && holder !== actor.id) {
          console.warn(
            `  COLLISION   @${username}@${targetDomain} already belongs to actor ${holder}, leaving identity alone`
          );
          skippedCollision++;
        } else {
          console.log(
            `  repair      @${actor.username}@${actor.domain} -> @${username}@${targetDomain}`
          );
          Object.assign(patch, {
            username,
            domain: targetDomain,
            ...desired!,
          });
          takenByOther.delete(`${actor.username}@${actor.domain}`);
          takenByOther.set(`${username}@${targetDomain}`, actor.id);
          repaired++;
        }
      }

      if (apply && Object.keys(patch).length > 0) {
        await db
          .update(socialActors)
          .set(patch)
          .where(eq(socialActors.id, actor.id));
      }
    }

    console.log(
      `\n${apply ? 'Applied' : 'Dry run'}: ${repaired} handle(s) repaired, ${displaySynced} display name(s) synced.`
    );
    if (skippedActive > 0) {
      console.log(
        `${skippedActive} skipped as in use — these have federated; renaming them needs a Move.`
      );
    }
    if (skippedCollision > 0) {
      console.log(`${skippedCollision} skipped on a name collision.`);
    }
    if (skippedNoHandle > 0) {
      console.log(`${skippedNoHandle} skipped with no screenname.`);
    }
    if (repaired === 0 && displaySynced === 0) {
      console.log('Everything already in sync. Nothing to do.');
    } else if (!apply) {
      console.log('Re-run with --apply to write these changes.');
    }
    console.log('ACTORS:done');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
