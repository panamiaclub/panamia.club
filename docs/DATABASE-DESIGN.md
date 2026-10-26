# Database Design

## Stack

| Component     | Technology                                            |
| ------------- | ----------------------------------------------------- |
| Database      | PostgreSQL 16 via [Supabase](https://supabase.com)    |
| ORM           | [Drizzle ORM](https://orm.drizzle.team) + postgres.js |
| Auth adapter  | `@auth/drizzle-adapter`                               |
| Production    | Cloudflare Hyperdrive (connection pooling)            |
| Migrations    | `drizzle-kit` — files in `drizzle/`                   |
| Schema source | `lib/schema/index.ts`                                 |

## Connection Architecture

In Cloudflare Workers, the `HYPERDRIVE` binding injects a pooled connection string at runtime. Locally and in CI, `POSTGRES_URL` is used directly.

```typescript
// lib/db.ts
const connectionString =
  typeof (globalThis as any).HYPERDRIVE !== 'undefined'
    ? (globalThis as any).HYPERDRIVE.connectionString
    : process.env.POSTGRES_URL!;

export const db = drizzle(postgres(connectionString), { schema });
```

`POSTGRES_DIRECT_URL` (unpooled) is used only by `drizzle-kit migrate` — never at runtime.

### Pool size differs on purpose: `max: 5` deployed, `max: 1` locally

Do not "fix" the local pool to match production. They are unlike on purpose,
because what sits between the Worker and Postgres is not the same thing.

Deployed, Hyperdrive is the multiplexer, so `max: 5` describes connections it
already knows how to share. Locally there is no multiplexer — the dev server
talks straight to Postgres over the **cf** build of postgres.js, whose socket
polyfill does not keep concurrent queries apart on a shared connection. With
more than one query in flight a Bind lands against another query's Parse and
the server raises:

```
PostgresError 08P01: bind message supplies 4 parameters,
                     but prepared statement "" requires 3
```

Which makes every `Promise.all` a coin toss, and leaves sequential code looking
perfectly healthy. `prepare: false` does **not** avoid it; only `max: 1` does,
by serialising onto one connection. This shipped once already — `/e` 500ed for
every signed-in reader in local dev, from a `Promise.all` in
`lib/events/discovery.ts`.

## Schema Overview

24 models across five functional groups. See `lib/schema/index.ts` for the full definition.

| Group          | Tables                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Auth**       | `users`, `accounts`, `sessions`, `verification_tokens`                                                                         |
| **Profiles**   | `profiles`                                                                                                                     |
| **Content**    | `articles`, `article_announcements`                                                                                            |
| **Social**     | `social_actors`, `social_statuses`, `social_follows`, `social_likes`, `social_attachments`, `social_tags`, `social_recipients` |
| **Mentoring**  | `mentor_sessions`, `intake_forms`                                                                                              |
| **Engagement** | `notifications`, `user_follows`, `user_lists`, `user_list_members`, `interactions`, `screenname_history`                       |
| **Ops**        | `contact_submissions`, `newsletter_signups`, `email_migrations`, `o_auth_verifications`                                        |

## Design Decisions

### Accounts, Listings, and Contact Email

`users.email` is the unique address used to sign in. A person's identity profile
is linked by the unique `profiles.user_id`; directory listings are separate
profiles administered through `profile_owners`, with `user_id` left null.

`profiles.email` is a private contact address, not an identifier. A person's
profile and several differently named listings may share it. Migration
`0072_profile_contact_email` replaces the old email-unique constraint with a
lookup index. Repeat business-intake applications are instead constrained by
the case-insensitive combination of listing name and contact email.

Signed-in applicants may copy their Pana email into a listing or enter another
contact address. Copying is not a live link: subsequent account-email changes
only update the identity profile. Listing contact details remain independently
editable. Managing the listing is a separate, explicit choice bound to the
authenticated user ID, never inferred from its contact address.

Guests may submit without an account and optionally invite a personal address,
including the same address as the listing contact. The sign-in link goes only
to that chosen personal address, and ownership requires accepting the invitation.
Without an invitation the listing stays unclaimed; later claims verify access
to the listing inbox while retaining the claimant's separate personal account.

Approval links and listing edits identify profiles by ID. Legacy approval
links remain valid by matching both email and their review access key.

### JSONB for Flexible Fields

Fields with variable structure use `jsonb` columns rather than normalized tables, avoiding premature schema rigidity:

| Table             | JSONB columns                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `profiles`        | `socials`, `hours`, `categories`, `locations`, `images`, `mentoring`, `verification`, `roles`, `descriptions` |
| `articles`        | `co_authors`, `reviewed_by`                                                                                   |
| `social_statuses` | `recipient_to`, `recipient_cc`                                                                                |
| `intake_forms`    | `form_data`                                                                                                   |

### CUID Primary Keys

All tables use `text` PKs generated by `@paralleldrive/cuid2`:

```typescript
id: text('id')
  .primaryKey()
  .$defaultFn(() => createId());
```

Collision-resistant, URL-safe, monotonically sortable — no UUID extension required.

### Sessions Table

`sessions` uses `sessionToken` as the primary key (required by `@auth/drizzle-adapter`). All other tables use `id`.

### Timestamps

All tables carry `created_at` and `updated_at` as `timestamp({ withTimezone: true })`. `updated_at` uses `.$onUpdateFn(() => new Date())`.

## Migration Workflow

### Creating a Migration

```bash
# 1. Edit lib/schema/index.ts
# 2. Generate the SQL file
npx drizzle-kit generate

# 3. Open the generated drizzle/NNNN_name.sql and add the required headers:
#    -- Purpose: ...
#    -- Ticket: PANA-XXX (or N/A)
#    -- Reversible: Yes | No | Partial

# 4. Commit schema + migration together
git add lib/schema/index.ts drizzle/
git commit -m "feat(db): ..."
```

### Applying Migrations

```bash
npx drizzle-kit migrate   # local / CI
yarn deploy:vinext        # runs migrate, then builds and deploys to Cloudflare
```

Note that `drizzle-kit migrate` only applies migrations listed in
`drizzle/meta/_journal.json`. A `.sql` file without a journal entry is not
"pending" — it is invisible, and migrate exits 0 having skipped it. CI replays
migrations by filesystem glob and so cannot catch this; `scripts/validate-migrations.sh`
is what does, and it runs in CI with `--strict`.

### Immutability

Once committed, migration files are immutable. The pre-commit hook blocks edits to existing `drizzle/NNNN_*.sql` files. To fix a mistake, generate a new migration.

### Required Headers

Every migration file must include in its first 30 lines:

```sql
-- Purpose: <why this migration exists — business context>
-- Ticket: PANA-XXX (or N/A for infrastructure)
-- Reversible: Yes | No | Partial
--
-- Rollback:
--   DROP TABLE IF EXISTS ...;
```

See `drizzle/TEMPLATE.sql` for a complete example. The pre-commit hook enforces these fields via `scripts/validate-migrations.sh`.

### Tracking Applied Migrations

Drizzle records applied migrations in `__drizzle_migrations`. To inspect:

```sql
SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at;
```

```bash
npx drizzle-kit studio   # visual schema browser
```

## Sidecar Architecture

Transactional features (pet sitting, rentals, marketplace) will be implemented as separate Next.js apps sharing the same Supabase instance. Because all user identity lives in the `users` table, sidecars get real foreign keys without duplicating user data:

```sql
CREATE TABLE bookings (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  sitter_id  TEXT NOT NULL REFERENCES users(id),
  listing_id TEXT NOT NULL REFERENCES listings(id),
  ...
);
```

Shared auth is automatic — sidecars read the same `sessions` table.

## Testing

E2E tests require a real PostgreSQL connection (PGLite is incompatible with Next.js/Turbopack). Set `POSTGRES_URL` locally or use `POSTGRES_URL_TEST` in CI.

## Related

- `lib/schema/index.ts` — full schema definition
- `drizzle/` — migration files
- `drizzle/TEMPLATE.sql` — migration documentation template
- [FLOSS-ALTERNATIVES.md](./FLOSS-ALTERNATIVES.md) — license notes
