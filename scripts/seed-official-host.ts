#!/usr/bin/env npx tsx
/**
 * Set Panamia up as a host.
 *
 * WHY THIS EXISTS
 *
 * Panamia publishes events of its own, and connectors get staffed to them.
 * But an event is hosted by exactly one of `host_profile_id` or
 * `host_group_id` (the `events_single_host` CHECK), and until this script has
 * run there is no row for Panamia to be either of those. There was no
 * Panamia-the-organisation in the database at all — only panas, listings and
 * the clubs panas start.
 *
 * It mints a social group, not a profile. The reasoning is in the docblock on
 * `events.hostGroupId` and repeated in lib/server/official-host.ts: deleting an
 * account blocks while it hosts upcoming events and deletes its completed
 * ones, so hanging the organisation's calendar off one person's profile means
 * the day they leave is the day the calendar dies.
 *
 * WHAT DEPENDS ON IT
 *
 * `listAssignableEvents` scopes the "Panamia events" half of the connector
 * task picker to this group. Before it exists that half is empty — the admin
 * can still attach a task to a connector event, and the picker says so. After
 * it exists, published future events hosted by this group become assignable
 * and nobody else's do.
 *
 * Usage:
 *   # Report. READ ONLY — says whether Panamia exists and what it would do.
 *   npx tsx scripts/seed-official-host.ts
 *
 *   # Dry run naming the founding admin.
 *   npx tsx scripts/seed-official-host.ts --founder=jose@panamia.club
 *
 *   # Write.
 *   npx tsx scripts/seed-official-host.ts --founder=jose@panamia.club --apply
 *
 * Reads POSTGRES_URL from .env.local, or from the environment if set there.
 *
 * On PowerShell, quote a screenname selector — a bare @name is parsed as the
 * splat operator and the run dies before reaching this script:
 *   npx tsx scripts/seed-official-host.ts '--founder=@jose'
 *
 * Idempotent: re-running once the group exists reports it and changes nothing.
 *
 * FLAGS
 *   --founder=<email|@screenname>  The pana seated as the group's first admin.
 *   --apply                        Write. Without it every run is a dry run.
 */

import { config } from 'dotenv';

// Must precede the imports below. `socialConfig.domain` is evaluated when
// lib/federation is first loaded, so a static import would freeze the
// federation domain before .env.local had been read and mint the actor under
// the fallback domain instead. Those URIs are permanent once federated.
config({ path: '.env.local', quiet: true });

const { db } = await import('@/lib/db');
const { eq, sql } = await import('drizzle-orm');
const { profiles, socialActors, users } = await import('@/lib/schema');
const { createGroup } = await import('@/lib/federation/wrappers/group');
const { OFFICIAL_HOST_HANDLE, officialHostGroupId, resetOfficialHostCache } =
  await import('@/lib/server/official-host');
const { getFederationDomain } = await import('@/lib/federation/domain');

// A script whose static imports fail to resolve exits 0 under `tsx` with no
// output at all, which is indistinguishable from a clean run reporting
// nothing. Assert on these markers, never on the exit code.
console.log('SEED_OFFICIAL_HOST:start');

/** What the group says about itself on its page and to remote servers. */
const GROUP_NAME = 'Panamia';
const GROUP_SUMMARY =
  'Pana Mia Club — the organisation behind the directory, the events, and the Community Connectors programme.';

interface Founder {
  profileId: string;
  actorId: string;
  label: string;
}

/**
 * Resolve the pana who will be seated as the group's first admin.
 *
 * `createGroup` needs both halves: the profile for moderation history, and the
 * actor for the membership row. A pana with no social actor cannot found a
 * group, so the join is inner rather than left — an account that has never
 * been through federation is a clear error here, not a null to paper over.
 */
async function resolveFounder(selector: string): Promise<Founder> {
  const byScreenname = selector.startsWith('@');
  const value = byScreenname ? selector.slice(1) : selector;

  const [row] = await db
    .select({
      profileId: profiles.id,
      actorId: socialActors.id,
      email: profiles.email,
      screenname: profiles.screenname,
    })
    .from(profiles)
    .innerJoin(socialActors, eq(socialActors.profileId, profiles.id))
    .where(
      byScreenname
        ? eq(profiles.screenname, value)
        : sql`EXISTS (
            SELECT 1 FROM ${users}
            WHERE ${users.id} = ${profiles.userId}
              AND lower(${users.email}) = ${value.toLowerCase()}
          )`
    )
    .limit(1);

  if (!row) {
    console.error(
      `Error: no pana with a social actor matches "${selector}".\n` +
        '       Checked profiles.' +
        (byScreenname ? 'screenname' : 'email') +
        ' joined to social_actors.profile_id.\n' +
        '       An account that has never federated has no actor to found a group with.'
    );
    process.exit(1);
  }

  return {
    profileId: row.profileId,
    actorId: row.actorId,
    label: row.screenname ? `@${row.screenname}` : row.email,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const founderArg = argv
    .find((a) => a.startsWith('--founder='))
    ?.split('=')
    .slice(1)
    .join('=');

  if (!process.env.POSTGRES_URL) {
    console.error(
      'Error: POSTGRES_URL is not set. Add it to .env.local or export it.'
    );
    process.exit(1);
  }

  const domain = getFederationDomain();
  console.log(`Federation domain: ${domain}`);
  console.log(`Official handle:   ${OFFICIAL_HOST_HANDLE}@${domain}\n`);

  // Read through the same resolver the application uses, so this reports on
  // exactly what `listAssignableEvents` will find rather than on a second
  // query that could disagree with it.
  resetOfficialHostCache();
  const existing = await officialHostGroupId();

  if (existing) {
    console.log(`Panamia already hosts. social_groups.id = ${existing}`);
    console.log(
      'Nothing to do. Published future events hosted by this group are assignable.'
    );
    return;
  }

  console.log('Panamia does not exist yet as a host.');
  console.log(
    'Until it does, the "Panamia events" half of the connector task picker is empty.\n'
  );

  if (!founderArg) {
    console.log(
      'Pass --founder=<email|@screenname> to name the founding admin, then --apply to write.'
    );
    return;
  }

  const founder = await resolveFounder(founderArg);
  console.log(`Founding admin: ${founder.label} (actor ${founder.actorId})`);

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to create the group.');
    return;
  }

  const result = await createGroup({
    handle: OFFICIAL_HOST_HANDLE,
    name: GROUP_NAME,
    summary: GROUP_SUMMARY,
    visibility: 'public',
    // Not 'open'. The organisation's own group is not something a pana joins
    // by clicking a button -- being in it is what makes somebody staff.
    joinPolicy: 'invite',
    createdByProfileId: founder.profileId,
    founderActorId: founder.actorId,
    // The handle is in RESERVED_SCREENNAMES, held for exactly this.
    allowReservedHandle: true,
  });

  if (!result.success) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  console.log(`\nCreated. social_groups.id = ${result.group.id}`);
  console.log(`Actor: ${result.actor.uri}`);
  console.log(
    'Published future events hosted by this group are now assignable to connectors.'
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // postgres.js keeps the process alive otherwise.
    await db.$client.end();
    console.log('SEED_OFFICIAL_HOST:done');
  });
