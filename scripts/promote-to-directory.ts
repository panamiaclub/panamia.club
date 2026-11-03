#!/usr/bin/env npx tsx
/**
 * Audit and repair directory visibility.
 *
 * WHY THIS EXISTS
 *
 * A profile appears in the directory only when BOTH of these hold:
 *
 *   1. `profiles.active = true`   — the moderation state.
 *   2. `profiles.userId IS NULL`  — an unclaimed intake listing, which is a
 *      OR the owning `users.accountType`  listing by definition and carries no
 *      is 'directory' or 'hybrid'         account type to test.
 *
 * That predicate is `DIRECTORY_ACCOUNT_TYPES`, imported below rather than
 * restated, and it gates all five read paths: lib/server/directory.ts
 * (search + browse), /api/directory/featured, /api/directory/suggest,
 * app/sitemap.ts and /api/admin/profile/action's member count.
 *
 * The trap is that `users.accountType` defaults to 'personal' and NO route in
 * the codebase writes anything else. The one that did,
 * app/api/createExpressProfile/route.ts behind /form/become-a-pana, was
 * removed along with that form: a business is now its own listing row owned
 * through `profileOwners`, rather than a flag flipped on someone's personal
 * account. This script is therefore the only way to set it, and it stays for
 * the legacy accounts that still carry a listing on their own profile.
 * Nothing surfaces this:
 * search returns `{"data":[],"total":0}` whether the table is empty or every
 * row is filtered out. As scripts/seed-dev-data.ts puts it, "empty and broken
 * look identical from the outside".
 *
 * This script makes the difference visible, and can repair it for named
 * accounts.
 *
 * Usage:
 *   # Audit. READ ONLY — explains what the directory can and cannot see.
 *   npx tsx scripts/promote-to-directory.ts
 *
 *   # Dry run for specific accounts, by email or @screenname.
 *   npx tsx scripts/promote-to-directory.ts ana@shop.com @anabakes
 *
 *   # Write.
 *   npx tsx scripts/promote-to-directory.ts ana@shop.com --apply
 *
 * Reads POSTGRES_URL from .env.local, or from the environment if set there.
 *
 * On PowerShell, quote screenname arguments — a bare @name is parsed as the
 * splat operator and the run dies before reaching this script:
 *   npx tsx scripts/promote-to-directory.ts '@anabakes'
 *
 * Flags:
 *   --apply       Write. Without it every run is a dry run.
 *   --type=hybrid Account type to set. 'directory' (default) or 'hybrid'.
 *   --activate    Also set profiles.active = true on the named accounts.
 *
 * Deliberately does NOT touch unclaimed business-intake rows. Those are
 * approved through the emailed links at /admin/profile/action, which also
 * records the decision in `status` and mails the business — bypassing it here
 * would publish a listing nobody reviewed. The audit reports them separately
 * so they are not mistaken for a missing account type.
 *
 * Idempotent: re-running changes nothing once an account is eligible.
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, inArray, or, sql } from 'drizzle-orm';
import * as schema from '../lib/schema';
import { DIRECTORY_ACCOUNT_TYPES } from '../lib/accounts';

// drizzle.config.ts and both seed scripts already read .env.local. Without the
// same call here the script aborts with "POSTGRES_URL is required" on a machine
// that is otherwise fully configured, which reads as a broken database rather
// than a missing export.
config({ path: '.env.local', quiet: true });

const { users, profiles } = schema;

// A script whose static imports fail to resolve exits 0 under `tsx` with no
// output at all, which is indistinguishable from a clean run reporting
// nothing. Assert on these markers, never on the exit code.
console.log('PROMOTE:start');

type TargetType = (typeof DIRECTORY_ACCOUNT_TYPES)[number];

interface Candidate {
  user_id: string | null;
  email: string;
  screenname: string | null;
  account_type: string | null;
  profile_id: string | null;
  profile_name: string | null;
  profile_active: boolean | null;
  profile_screenname: string | null;
  primary_image_cdn: string | null;
  intake: boolean;
}

function parseType(argv: string[]): TargetType {
  const raw = argv.find((a) => a.startsWith('--type='))?.split('=')[1];
  if (!raw) return 'directory';
  if ((DIRECTORY_ACCOUNT_TYPES as readonly string[]).includes(raw)) {
    return raw as TargetType;
  }
  console.error(
    `Error: --type must be one of ${DIRECTORY_ACCOUNT_TYPES.join(', ')} (got "${raw}")`
  );
  process.exit(1);
}

/** Why the directory cannot see this row, in the order the query filters. */
function blockers(row: Candidate): string[] {
  const reasons: string[] = [];
  if (!row.profile_id) {
    reasons.push('no profile row (see scripts/backfill-profiles.ts)');
    return reasons;
  }
  if (!row.profile_active) reasons.push('profiles.active = false');
  // An unclaimed listing has no user to carry an account type, and is admitted
  // by the isNull(userId) branch instead.
  if (row.user_id && !isEligibleType(row.account_type)) {
    reasons.push(`users.accountType = '${row.account_type}'`);
  }
  return reasons;
}

function isEligibleType(value: string | null): boolean {
  return (
    !!value && (DIRECTORY_ACCOUNT_TYPES as readonly string[]).includes(value)
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const activate = argv.includes('--activate');
  const targetType = parseType(argv);
  const selectors = argv.filter((a) => !a.startsWith('--'));

  if (!process.env.POSTGRES_URL) {
    console.error('Error: POSTGRES_URL environment variable is required');
    process.exit(1);
  }

  const client = postgres(process.env.POSTGRES_URL);
  const db = drizzle(client, { schema });

  try {
    // ---- Always audit first. The counts are the whole point: they separate
    // "no rows" from "rows the predicate rejects".
    const [totals] = (await db.execute(sql`
      SELECT
        (SELECT count(*) FROM profiles)::int                              AS profiles_total,
        (SELECT count(*) FROM profiles WHERE active)::int                 AS profiles_active,
        (SELECT count(*) FROM users)::int                                 AS users_total,
        (SELECT count(*) FROM users
           WHERE account_type IN ('directory','hybrid'))::int             AS users_listed_type,
        (SELECT count(*) FROM profiles
           WHERE status->>'source' = 'business_intake'
             AND NOT active)::int                                         AS intake_pending,
        (SELECT count(*) FROM profiles p
           LEFT JOIN users u ON u.id = p.user_id
           WHERE p.active
             AND (p.user_id IS NULL
                  OR u.account_type IN ('directory','hybrid')))::int       AS directory_visible
    `)) as unknown as {
      profiles_total: number;
      profiles_active: number;
      users_total: number;
      users_listed_type: number;
      intake_pending: number;
      directory_visible: number;
    }[];

    console.log('\n=== directory eligibility ===');
    console.log(`  users total                     ${totals.users_total}`);
    console.log(
      `  ...with a listing account type  ${totals.users_listed_type}`
    );
    console.log(`  profiles total                  ${totals.profiles_total}`);
    console.log(`  ...active                       ${totals.profiles_active}`);
    console.log(`  intake rows awaiting approval   ${totals.intake_pending}`);
    console.log(
      `  VISIBLE IN DIRECTORY            ${totals.directory_visible}`
    );

    if (totals.directory_visible === 0 && totals.profiles_total > 0) {
      console.log(
        '\n  The directory is empty but the table is not. Every row is being\n' +
          '  filtered out — see the blockers listed below.'
      );
    }

    if (totals.intake_pending > 0) {
      console.log(
        `\n  ${totals.intake_pending} business-intake submission(s) are awaiting approval.\n` +
          '  Approve them via the emailed links at /admin/profile/action —\n' +
          '  this script deliberately leaves them alone.'
      );
    }

    // ---- Audit mode: no selectors, so report and stop.
    if (selectors.length === 0) {
      const ineligible = (await db.execute(sql`
        SELECT u.id AS user_id, u.email, u.screenname, u.account_type,
               p.id AS profile_id, p.name AS profile_name, p.active AS profile_active,
               p.screenname AS profile_screenname, p.primary_image_cdn,
               (p.status->>'source' = 'business_intake') AS intake
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.account_type NOT IN ('directory','hybrid')
           OR p.id IS NULL
           OR NOT p.active
        ORDER BY u.email
        LIMIT 50
      `)) as unknown as Candidate[];

      if (ineligible.length > 0) {
        console.log('\n=== accounts the directory cannot see ===');
        for (const row of ineligible) {
          const label = row.screenname ? `@${row.screenname}` : row.email;
          console.log(`  ${label}  —  ${blockers(row).join('; ')}`);
        }
        console.log(
          '\n  To publish one: npx tsx scripts/promote-to-directory.ts <email> --apply'
        );
      }

      console.log('\nPROMOTE:done (audit only, nothing written)');
      return;
    }

    // ---- Targeted mode.
    const wanted = selectors.map((s) => s.replace(/^@/, '').toLowerCase());

    // Built with the query builder rather than `= ANY(${...})`: a bare JS array
    // in a raw `sql` template binds as a single opaque parameter whose element
    // type Postgres has to guess, which is a needless failure mode when
    // inArray() emits an explicit list.
    const rows = (await db
      .select({
        user_id: users.id,
        email: users.email,
        screenname: users.screenname,
        account_type: users.accountType,
        profile_id: profiles.id,
        profile_name: profiles.name,
        profile_active: profiles.active,
        profile_screenname: profiles.screenname,
        primary_image_cdn: profiles.primaryImageCdn,
        intake: sql<boolean>`(${profiles.status}->>'source' = 'business_intake')`,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(
        or(
          inArray(sql`lower(${users.email})`, wanted),
          inArray(sql`lower(${users.screenname})`, wanted)
        )
      )) as unknown as Candidate[];

    const found = new Set(
      rows.flatMap(
        (r) =>
          [r.email.toLowerCase(), r.screenname?.toLowerCase()].filter(
            Boolean
          ) as string[]
      )
    );
    for (const w of wanted) {
      if (!found.has(w)) console.log(`\n  ! no account matches "${w}"`);
    }

    if (rows.length === 0) {
      console.log('\nPROMOTE:done (no matching accounts)');
      return;
    }

    console.log(
      `\n=== ${apply ? 'applying' : 'DRY RUN — planned changes'} ===`
    );

    let changed = 0;

    for (const row of rows) {
      const label = row.screenname ? `@${row.screenname}` : row.email;

      if (!row.profile_id) {
        console.log(
          `  ${label}: SKIP — no profile row. Run scripts/backfill-profiles.ts first.`
        );
        continue;
      }

      // An intake listing is administered through profile_owners and approved
      // by a human; its userId should stay NULL. If one has a user attached it
      // is the auto-claim bug scripts/audit-profile-claims.ts reports, and
      // changing the account type here would compound it.
      if (row.intake) {
        console.log(
          `  ${label}: SKIP — business-intake listing. Approve at /admin/profile/action.`
        );
        continue;
      }

      const steps: string[] = [];
      const needsType = !isEligibleType(row.account_type);
      const needsActive = !row.profile_active;

      if (needsType) {
        steps.push(`accountType '${row.account_type}' -> '${targetType}'`);
      }
      if (needsActive && activate) {
        steps.push('profiles.active false -> true');
      }

      if (steps.length === 0) {
        const note = needsActive
          ? ' (still hidden: profiles.active = false — pass --activate)'
          : '';
        console.log(`  ${label}: already eligible, nothing to do${note}`);
        continue;
      }

      console.log(`  ${label}: ${steps.join(', ')}`);

      if (needsActive && !activate) {
        console.log(
          `      ^ will STILL be hidden — profiles.active is false. Pass --activate.`
        );
      }

      // A card at /api/directory/featured also needs an image.
      // Search and browse do not, so this is a warning rather than a blocker.
      if (!row.primary_image_cdn) {
        console.log(
          '      note: no primary image — searchable, but will not appear in the homepage featured strip.'
        );
      }
      if (!row.screenname && !row.profile_screenname) {
        console.log(
          `      note: no screenname — its public page uses /listings/${row.profile_id}.`
        );
      }

      if (apply) {
        await db.transaction(async (tx) => {
          if (needsType && row.user_id) {
            await tx
              .update(users)
              .set({ accountType: targetType })
              .where(eq(users.id, row.user_id));
          }
          if (needsActive && activate) {
            await tx
              .update(profiles)
              .set({ active: true })
              .where(eq(profiles.id, row.profile_id!));
          }
        });
      }
      changed++;
    }

    if (!apply && changed > 0) {
      console.log('\n  Dry run. Re-run with --apply to write.');
    }

    console.log(
      `\nPROMOTE:done (${changed} account(s) ${apply ? 'updated' : 'would change'})`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('PROMOTE:error', error);
  process.exit(1);
});
