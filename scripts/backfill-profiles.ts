#!/usr/bin/env npx tsx
/**
 * Backfill profiles for accounts that already have a screenname.
 *
 * A profile is the platform's social identity — social_actors references
 * profiles, so an account without one can browse but can never post or follow.
 * New accounts get a profile when they claim a screenname (see
 * app/api/user/screenname/set/route.ts), but anyone who claimed theirs before
 * that change will never pass through that route again. This closes the gap.
 *
 * Does NOT list anyone in the directory: that is filtered on users.accountType,
 * which this script never touches.
 *
 * Usage:
 *   POSTGRES_URL=... npx tsx scripts/backfill-profiles.ts [--apply]
 *
 * Defaults to a dry run. Pass --apply to write. Idempotent either way.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import * as schema from '../lib/schema';

const { users, profiles } = schema;

async function main() {
  const apply = process.argv.includes('--apply');

  if (!process.env.POSTGRES_URL) {
    console.error('Error: POSTGRES_URL environment variable is required');
    process.exit(1);
  }

  const client = postgres(process.env.POSTGRES_URL);
  const db = drizzle(client, { schema });

  try {
    // Left join rather than NOT IN: profiles.userId is nullable, and NOT IN
    // against a column containing NULLs matches nothing at all.
    const candidates = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        screenname: users.screenname,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(and(isNotNull(users.screenname), isNull(profiles.id)));

    console.log(
      `${candidates.length} account(s) with a screenname but no profile.`
    );

    if (candidates.length === 0) {
      console.log('Nothing to do.');
      return;
    }

    let created = 0;
    let claimed = 0;

    for (const user of candidates) {
      const email = user.email.toLowerCase();
      // Guaranteed by the isNotNull filter above.
      const screenname = user.screenname!;

      // Only adopt an imported personal profile. A listing sharing this inbox
      // must stay separate from the human's identity.
      const unclaimed = await db.query.profiles.findFirst({
        where: and(
          eq(profiles.email, email),
          isNull(profiles.userId),
          sql`${profiles.status}->>'source' IS DISTINCT FROM 'business_intake'`
        ),
        columns: { id: true },
      });

      const name = user.name?.trim() || screenname;

      if (unclaimed) {
        console.log(
          `  claim  ${screenname} -> existing profile ${unclaimed.id}`
        );
        if (apply) {
          await db
            .update(profiles)
            .set({ userId: user.id })
            .where(eq(profiles.id, unclaimed.id));
        }
        claimed++;
        continue;
      }

      console.log(`  create ${screenname} (name: ${name})`);
      if (apply) {
        await db.insert(profiles).values({
          userId: user.id,
          email,
          name,
          active: true,
        });
      }
      created++;
    }

    console.log(
      `\n${apply ? 'Applied' : 'Dry run'}: ${created} created, ${claimed} claimed.`
    );
    if (!apply) console.log('Re-run with --apply to write these changes.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
