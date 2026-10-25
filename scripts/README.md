# Scripts Directory

Utility scripts for development, maintenance, and data operations.

## Available Scripts

### `env-check.ts`

Environment variable management and validation:

```bash
npm run env:check     # Validate required variables are set
npm run env:workflow  # Generate GitHub Actions env snippet
npm run env:list      # List all variables with locations
npm run env:secrets   # List variables for GitHub Secrets
npm run env:vars      # List variables for GitHub Variables
```

Uses `lib/env.config.ts` as the source of truth.

### `create-signin-link.ts`

Generate magic sign-in links for testing:

```bash
npx tsx scripts/create-signin-link.ts user@example.com
```

Two measured gotchas if you `curl` the link rather than opening it:

- **The dev server binds `::1` only.** `localhost:3003` and `[::1]:3003`
  answer; `127.0.0.1:3003` is refused with `curl: (7)`. That means the usual
  virtual-host recipe `--resolve host:port:127.0.0.1` silently never reaches
  the server, and an empty response body reads exactly like a broken route.
  Use `--resolve social.localhost:3003:[::1]`. Note Postgres is the opposite —
  `127.0.0.1:5433` is correct there — so the right loopback form differs per
  service.
- **Verify always redirects to the www host**, whichever host served it,
  because `callbackURL` is relative. Signing in on `social.localhost` still
  lands you on `localhost`. The social session is created regardless; check it
  with `/api/auth/get-session` rather than by looking at the page you land on.

### `get-signin-link.ts`

Retrieve existing sign-in tokens from the database.

```bash
npx tsx scripts/get-signin-link.ts user@example.com
```

### `delete-user.ts`

Delete a user and their associated data (accounts, sessions, profile):

```bash
npx tsx scripts/delete-user.ts user@example.com
```

### `migrate-from-mongodb.ts`

One-time migration from the legacy MongoDB export to PostgreSQL, moving every
BunnyCDN image into Cloudflare R2 on the way. It reads local dump files — there
is no live MongoDB connection.

```bash
# Preview: parses, maps and reports without writing. Reads no credentials.
npx tsx scripts/migrate-from-mongodb.ts --input ./mongodump/test --dry-run

# Full migration (rows + images)
npx tsx scripts/migrate-from-mongodb.ts --input ./mongodump/test

# Rows only, leaving images on BunnyCDN for a later pass
npx tsx scripts/migrate-from-mongodb.ts --input ./mongodump/test --skip-images

# The follow-up image pass (only touches rows still on a legacy CDN)
npx tsx scripts/migrate-from-mongodb.ts --images-only

# Fill empty columns on rows that already exist, instead of skipping them
npx tsx scripts/migrate-from-mongodb.ts --input ./mongodump/test --merge
```

**Input files** — per collection, first match wins: `<name>.json` (extended-JSON
array or JSONL), `<name>.jsonl`, or `<name>.bson` (needs `npm i -D bson`).

**What gets migrated:**

- `users.json` → `users` (the app-level collection, not `nextauth_*`)
- `profiles.json` → `profiles`
- legacy `profiles.slug` → `users.screenname`, so old `/p/<slug>` URLs keep working
- a placeholder `users` row per unclaimed profile (see below)
- images (BunnyCDN → Cloudflare R2)

Sessions, accounts and newsletter signups are deliberately not migrated; the
script header explains why for each.

**The legacy review queue.** `profiles.active` gates every public listing
query, and the old directory left 37 submissions unactioned behind it — some
for over two years. That queue was worked in 2026-08, so the import approves
every pending submission except the spam in `REJECTED_ON_REVIEW`, stamping
`status.approved` only where none exists. Legacy `status.declined` timestamps
are carried across for the record but no longer decide visibility; two of them
were a misclick and a reversal. Approvals are listed under `autoApproved`.

**Screennames** are truncated on a word boundary to fit the 24-character limit,
and collisions take a `-2`, `-3` suffix, rather than being dropped — a clipped
URL beats an unreachable profile, and renaming later is a supported flow. Only
reserved words and slugs that clean up to nothing are refused, under
`screennameRejects`; every clip is listed under `screennameTruncations`.

**Placeholder users.** `screenname` lives on `users`, and `/p/[user]` resolves
by walking `users.screenname → profiles.userId`, so a profile with no account
behind it has no public URL at all — the overwhelming majority of legacy
listings. The final row phase mints one inert user per unclaimed profile:
`emailVerified` false and no `accounts` row, so there is no credential and no
way to sign in as one. When the real owner arrives, better-auth's magic-link
flow looks a user up by email before creating one, so they are signed into that
row and land already owning their listing.

Two things follow from this. `auth.ts` `claimProfileForUser()` finds nothing
left to claim for these users, so its HighLevel lookup leans on a
first-ever-session check instead. And `profiles.userId` is `ON DELETE CASCADE`,
so undoing a run means clearing `profiles.user_id` **first** — deleting the
users directly takes the listings with them. The report's `placeholders[]`
records every profile/user id pair.

**Merging.** `--merge` only ever fills columns the existing row left empty, and
`false` counts as a value so live flags are never flipped on. The one exception
is `createdAt`, where the older timestamp wins — that is the real join date.
Columns where both sides hold different values are left alone and recorded under
`merged[].conflicts` in the report.

**The report matters.** Every run writes `migration-report-<timestamp>.json`
next to the input. A failed image transfer clears the image reference rather
than leaving a pointer at a CDN being switched off, so that report is the only
surviving record of those source URLs. Keep it.

**Requirements:**

- R2 credentials for the image pass, read from `.env.local` or the shell:
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`,
  `R2_PUBLIC_URL`. `--skip-images` needs none of them.
- A Postgres URL via `--postgres`, `$POSTGRES_DIRECT_URL`, or `$POSTGRES_URL`.
  Prefer the direct (unpooled) URL: postgres.js uses prepared statements, which
  Supabase's transaction-mode pooler rejects.
- The target database must already have the Drizzle migrations applied. Note
  that `0014_lockdown_public_schema_api` expects Supabase's `anon`,
  `authenticated` and `service_role` roles to exist.

### `reset-test-db.ts`

Reset the test database by truncating all tables (for CI):

```bash
npm run db:reset
# or
npx tsx scripts/reset-test-db.ts
```

**There is no separate test database on a developer machine.** The script's own
docstring says to use it "only with a dedicated test database", and locally
that instruction cannot be followed: every worktree's `.env.local` points at
the same `127.0.0.1:5433/panamia`. Its safety check only rejects URLs
containing `prod`, `main` or `live`, so `panamia` passes it. Running this
locally truncates every table for **every** worktree and every running dev
server, not just yours. It does require `POSTGRES_URL` to be set in the
environment — it is not read from `.env.local` — which is the only thing
standing between a bare `yarn db:reset` and everyone else's data.

### `seed-dev-data.ts`

Seeds the committed base data fixture: users, profiles, `profile_owners` and
the business actor. Run it with the social seed via `db:seed`, which chains
both in the required order:

```bash
npm run db:seed
# or, base layer only
npx tsx scripts/seed-dev-data.ts
```

Run this **before** `seed-test-account.ts`, which resolves profiles by
screenname and silently skips the ones it cannot find.

The fixture is deliberately shaped so that local results mean something:

- Both branches of directory eligibility are present — an unclaimed intake
  listing (`profiles.userId` null) and a `directory` sole trader — so the
  `featured` and `suggest` read paths can be told apart from dead code.
- Two rows must stay invisible: an unapproved submission (`active: false`) and
  an unclaimed personal profile. A read path that returns them is widened, not
  working.
- `seed_p_legacy` and `seed_biz_pending` differ only in `status.source`, so the
  OAuth auto-claim guard is observable attaching in one case and declining in
  the other. Ad-hoc local data left this column null, which
  `notBusinessListing()` passes, making the guard untestable in both directions.
- At least one business name carries a Spanish accent, because unaccented
  fixtures hide accent-sensitive matching. This is how the `suggest` typeahead
  bug was found.

Every row mirrors a production writer and names it in a comment, and the script
uses Drizzle rather than raw SQL so a schema change breaks it at `tsc` time.
It re-queries with the production predicates when it finishes and exits
non-zero if the shapes disagree — asserting ids rather than counts, since a
count cannot distinguish a guard that discriminates from one that rejects
everything.

Idempotent: re-running updates the `seed_`-prefixed rows in place.

**The local database is shared by every worktree.** All `.env.local` files
point at the same `127.0.0.1:5433/panamia`, so this seeds _the_ dev database,
not _a_ dev database. Two consequences worth knowing before you trust a local
measurement:

- Seeding while someone else is probing changes their results mid-run. Two
  sessions on this repo each recorded a measurement, disbelieved it when it
  later disagreed with itself, and assumed operator error — the database had
  changed underneath them.
- Rows you did not create are normal. Seeing unfamiliar data is not evidence
  of a bug or of a stale query.

This is why the verification block asserts specific `seed_`-prefixed ids
rather than row counts. A count is not stable in a database someone else is
writing to; an id is.

### `unseed.ts`

Removes every row the seed scripts wrote, and nothing else.

```bash
yarn db:unseed            # dry run — counts only, writes nothing
yarn db:unseed --yes      # actually delete
yarn db:unseed --inventory # read-only audit of current and older demo fixtures
yarn db:unseed --yes --include-demo-groups # opt-in: remove wholly fixture-owned groups too
```

This is the other half of `db:seed`. The seeders will write to a remote
database when given `SEED_ALLOW_REMOTE=1`, and before this script that was a
one-way door: the only teardown was `db:reset`, which truncates **everything**
and whose guard (see above) a Supabase URL passes. So the safe-looking option
was the one that destroyed the most.

It matches current fixtures by the `seed_` prefix, and the older 100-business
fixture by `seeduser_` (users) and `seedprof_` (profiles). Identity profiles
attached to a seeded user are included even if their own IDs are unprefixed.
Names, handles, stock photos and email addresses are **never** delete criteria.
It uses Postgres `starts_with()` rather than `LIKE 'seed_%'` — in `LIKE`, `_` is a
single-character wildcard, so the pattern would also match a real id beginning
`seedX`. Nothing looks like that today, which is what would make it a quiet
bug rather than a loud one.

Three things are worth knowing before trusting it:

- **Actors are matched by profile, not by id.** `seed-dev-data.ts` builds them
  through `createActorForProfile` — the real production writer, deliberately —
  and that writer mints its own unprefixed id. A prefix-only sweep misses
  them, and because `social_actors.profile_id` is `SET NULL` rather than
  `CASCADE`, deleting profiles first would orphan them with no way left to
  tell they were seeded. They are deleted first, while they can still be
  found.
- **It stops rather than cascading into real data.** The `RESTRICT` foreign
  keys on `events` and `venues` exist so a seeded row cannot be pulled out
  from under something real, such as a real event held at a seeded venue.
  When that happens the whole thing rolls back in one
  transaction and names the blocking row. Repoint or remove it and run again.
- **Real ownership blocks deletion.** A seeded listing attached to or claimed
  by a real account is protected. A test account administering a real listing
  must transfer that ownership before it can be removed. A seeded actor ID
  attached to a real profile also stops the cleanup. Retained groups keep
  accurate active member counts; removing their last active administrator is
  blocked until administration is transferred. Cross-fixture follows, likes
  and verified RSVPs block deletion until their counters are reconciled,
  rather than silently leaving real account or event totals stale.

Dry run is the default, so it is safe to point at an unfamiliar database just
to see what it would touch. Counts shown exclude rows removed by cascade, so
the real total is higher than the number printed.

For production, use **Actions → Database Migrations → Run workflow** with
`test_data_action: dry-run` first. This uses the existing `POSTGRES_URL` Actions
secret without copying credentials locally or into logs, and does not apply
migrations. Review the fixture counts, then select `delete` and enter
`DELETE TEST DATA` in `confirmation`. Deletion runs atomically, followed by a
second dry run and inventory. The inventory reports counts and hashes of the
retained real account/profile IDs so preservation can be checked without
logging their personal details.

`include_demo_groups` is a separate, default-off workflow checkbox, equivalent
to `--include-demo-groups`. It removes only groups created by fixture profiles,
with fixture administrators and no real members (including pending or banned
members), real posts, real replies, real likes, or non-fixture hosted events.
Their group actors and posts are removed in the same transaction. Groups with
real participation remain protected even when this option is enabled.

`include_demo_events` / `--include-demo-events` also removes the exact
`demo_ev_` namespace written by `seed-real-events.ts`. These explicitly marked
sample events can reference fixture listings or otherwise real hosts. They
are removed before hosts/groups in the same transaction; genuine events
remain protected. This option is off by default.

If an operator explicitly approves deleting a specific demo group despite its
real memberships, pass its `group_fingerprint` from the inventory using
`--approved-group-fingerprint <hash>` (workflow input
`approved_group_fingerprint`). This exception affects only memberships in that
one group: real member accounts/profiles remain intact, and real creators,
posts, replies, likes and hosted events still block deletion.

The cleanup's isolated PGlite regression suite never connects to production:

```bash
node --experimental-test-module-mocks --import tsx --test tests-db/unseed.test.ts
```

### `fetch-directory-photos.ts`

Builds the stock photo pool in `public/img/directory/` from the Pexels API.
This is a sourcing tool, not part of the app — nothing at runtime talks to
Pexels, and the pool is committed.

```bash
PEXELS_API_KEY=... npm run photos:fetch
```

`PEXELS_API_KEY` is deliberately **not** in `lib/env.config.ts`. That file
drives Cloudflare deployment config and the CI env checks; a key only ever
needed to regenerate a committed fixture does not belong in either, and adding
it would make every deploy expect a variable the running app never reads.

**Why there are food sub-themes.** Twelve of the twenty seeded businesses are
tagged Food. Keying photos on category alone stapled three near-identical
plates of food across a whole results page, so the food category is split into
food-truck, bakery, cafe, market and supper-club. Eleven categories plus five
sub-themes at three photos each is the 48-file pool.

**Compression is optional and self-healing.** `sharp` is present transitively
(`@cloudflare/vite-plugin` → `miniflare`), not declared as a dependency, so the
script loads it through a guarded dynamic import and skips compression if it
resolves to nothing rather than failing the run. With it, the pool is 4.4 MB
instead of 5.9 MB; the worst single file drops from 1120 KB to 111 KB.

Each run rewrites `credits.json` with the photographer, source URL and alt text
per file. The Pexels **API** terms require visible attribution even though the
photo licence itself does not, which is what the credit line under the
directory results is for. Do not remove it while these photos are in use.

### `seed-business-photos.ts`

Assigns pooled photos to directory listings, replacing the generated
`data:image/png;base64` gradients that were standing in for real covers.

```bash
npx tsx scripts/seed-business-photos.ts            # dry run, prints the plan
npx tsx scripts/seed-business-photos.ts --apply    # write
npx tsx scripts/seed-business-photos.ts --explain  # matcher only, no database
npm run db:photos                                  # alias for the dry run
```

**Check which database it names before you trust an `--apply`.** Every
worktree's `.env.local` points at the same local `127.0.0.1:5433/panamia`, so a
bare `--apply` rewrites the dev database and leaves the live site untouched —
which reads exactly like the script having silently done nothing. Pass
`--postgres <url>` to target production explicitly. Every run prints the host
and database name it resolved (never the URL, which carries the password), and
says so out loud when an `--apply` is pointed at localhost.

**Which column is the cover.** There isn't one. `lib/server/directory.ts` reads
`coverImage` out of the `galleryImages` JSONB as `gallery1CDN`, and
`profiles.primaryImageCdn` is the **logo**. The script therefore writes
`gallery1CDN` and clears `primaryImageCdn` to null: these are stock
photographs, and the same photo rendered both as the card cover and in the 52px
logo circle beside it reads as a bug. `result-card.tsx` renders the logo
conditionally, so null degrades to a cover-only card.

**Name keywords are checked before categories, on purpose.** The seeded data is
mis-tagged — "Clave Sound" (music) and "Raiz Bodywork" (breathwork) are both
filed under Food, and a skincare market is Food,Products. Matching on category
first gives all three a photograph of dinner. Where categories are trusted, a
priority order lets a specific one beat a broad one. `--explain` runs the whole
matcher against a table of real listing names with no database connection, which
is how that behaviour is checked.

Photos live in `public/` rather than R2 because `lib/image-src.ts` refuses to
optimize any `src` that is not root-relative, and there is no `remotePatterns`
equivalent to grant an exception.

These are stand-ins. Replace them with real photography from the businesses as
it arrives, and drop the credit line when the last stock photo is gone.

### `reseed-directory-content.ts`

Rewrites the name, screenname, category, copy and photos of the 100 seeded
directory listings so a listing describes one coherent business.

```bash
npx tsx scripts/reseed-directory-content.ts                 # dry run
npx tsx scripts/reseed-directory-content.ts --apply         # write
npx tsx scripts/reseed-directory-content.ts --postgres <url>
```

The same `--postgres` / localhost warning as `seed-business-photos.ts` applies;
read that section first.

**What was wrong.** The seeded rows were generated combinatorially, so the name,
the category and the three description fields were each drawn independently.
That produced three separate failures: categories that contradict the business
(`Clave Sound` filed under Food), copy that describes someone else entirely
(`Telar Forge`, a forge, selling hand-poured candles; `Ceiba Ceramics` doing
leather work), and one brand split across unrelated trades (`Ceiba Ceramics` /
`Ceiba Craft` / `Ceiba Workshop`). There is no generator in this repo to repair
— the rows were written straight into the database — so this script is the
source of truth for them.

**Archetypes, not heuristics.** Each listing is pinned to one of ~48 archetypes
that bundle a category, a photo theme and the copy together, so those three
agree by construction. Guessing from the business name, the way
`seed-business-photos.ts` has to, can only ever be as good as its keyword list.

**Renames keep the trailing noun.** Splitting `Ceiba Craft` off gives
`Madera Craft`, never `Madera Goods`. Only the brand word moves, so the
category, photo and copy stay valid and the row still reads as the same kind of
business. `descriptions.background` embeds the old name and carries a real
neighborhood and founding year, so the name inside it is substituted rather
than the sentence regenerated.

**Branches are kept paired.** Eight rows are a second location of another row
(`Trenza Studio` / `Trenza Studio Aventura`). They deliberately share an
archetype and a copy variant, because they are one business.

**Copy variants.** Four supper clubs reciting the same paragraph is what gave
the original data away, so archetypes that several unrelated businesses share
carry alternates, selected per listing through `Listing.v`. The script refuses
to run if a variant index is out of range, and reports any two unrelated
businesses that would end up with the same paragraph — branches excepted.

It also refuses to run if a new screenname is already taken by a row it is not
renaming, since `profiles.screenname` is uniquely indexed and the rows are
updated one at a time.

**Social links follow the rename.** The seeded `socials` are derived from the
screenname, so a renamed listing would otherwise advertise the brand it used to
be — "Website: el-fogon-cafe.example.com" under the heading Ventanita Cafe.
Both spellings are replaced, since Instagram and TikTok handles drop the
hyphens, and the script reports any value that still mentions the old name
afterwards.

**Re-running is safe.** A listing is keyed by the screenname it had when this
script was written, but the row answers to its new slug once a run has landed,
so the lookup tries both. A second run reports `0 renamed` and changes nothing
else — the name substitution and the social rewrite are both no-ops the second
time.

### `repair-social-actors.ts`

Makes every local business reachable over the social API, and repairs the
fallout the rename above left in `social_actors`:

```bash
# Dry run: report what would change, write nothing. Default.
npx tsx scripts/repair-social-actors.ts

# Write the changes
npx tsx scripts/repair-social-actors.ts --apply

# Target a domain other than the configured federation domain
npx tsx scripts/repair-social-actors.ts --domain pana.social
```

**What was wrong.** `getActorByScreenname` matches on `username` _and_
`domain`, so an actor with either column wrong is invisible and
`/api/social/actors/<slug>` answers 404 — indistinguishable from a business
that simply has no social presence. Two things put rows in that state: actors
minted by a local process against a shared database kept `domain = 'localhost'`
and `https://localhost/p/...` URIs, and `syncActorFromProfile` deliberately
never touches `username`, so `reseed-directory-content.ts` moved 41
screennames without moving the handles behind them.

**Display names too.** The same renames left `social_actors.name` quoting the
old business — a follower of Ventanita Cafe saw "El Fogon Cafe". `name` is not
identity, so it is synced for every actor, including ones whose handle is
frozen. `summary` is left alone on purpose: the seeder wrote
`profiles.five_words` there while `getProfileSummary` would write the much
longer `descriptions.details`, and picking between two valid bios is a product
decision, not a repair.

**It refuses to rename an actor that has federated.** `lib/federation/domain.ts`
explains why an actor's identity is normally write-once — remote servers hold
the URI as a permanent key, and a Move carries followers but not posts. That
applies to an actor someone can actually reach, which a `localhost` URI never
was. Rather than judge that row by row, the script skips any actor with
statuses, follows in either direction, or likes, and says so. It also checks
the target handle is not already taken, since `(username, domain)` is uniquely
indexed.

**It verifies its own URL templates.** The script builds URLs from inlined
copies of `socialConfig.endpoints`, because importing the federation barrel
pulls in the Cloudflare-aware database client. To keep the copies honest it
rebuilds the URLs of an actor the app itself minted and aborts if the result
differs.

**Re-running is safe.** Rows already correct are left untouched and a second
run reports `Everything already in sync. Nothing to do.`

### `validate-migrations.sh`

Validates Prisma migration files for naming conventions and standards:

```bash
./scripts/validate-migrations.sh          # Check all migrations
./scripts/validate-migrations.sh --staged # Check only staged migrations
```

Called automatically by pre-commit hook.

## Running Scripts

TypeScript scripts can be run with `npx tsx`:

```bash
npx tsx scripts/script-name.ts [args]
```

For shell scripts, ensure they're executable:

```bash
chmod +x scripts/script-name.sh
./scripts/script-name.sh
```

## Environment Variables

Scripts typically need access to:

- `POSTGRES_URL` or `DATABASE_URL` - PostgreSQL connection
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` - Cloudflare R2 access
- `PEXELS_API_KEY` - only for `fetch-directory-photos.ts`, and only when
  regenerating the committed photo pool. Not part of `lib/env.config.ts`.
- Other service-specific credentials

Load from `.env.local` or set in shell environment.

## Adding New Scripts

1. Create script in this directory
2. Use `.ts` for TypeScript, `.sh` for shell scripts
3. **Update this README** to document the new script
4. Consider adding npm script alias in `package.json`

> **Note:** The pre-commit hook will warn if scripts are modified without updating this README.
