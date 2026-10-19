# Database Tests

Tests that exercise `lib/` directly against a real Postgres. No browser, no
HTTP — these call the federation wrappers the same way an API route does, so
they cover the data-layer invariants the Playwright suite cannot reach from
outside.

Kept separate from `tests/` (Playwright, browser) and `tests-relay/`
(raw Nostr WebSocket frames against the relay).

## Running

### Isolated status visibility regression (no secrets)

```
yarn test:db:visibility
```

`visibility.test.ts` uses PGlite (real Postgres compiled to WASM) in memory.
It never loads `.env.local`, reads a connection string, or connects to an
external database. Run with Node 24; the script enables Node's experimental
module mocks to replace the database and session boundaries before importing
production code.

The suite renders the production addressing predicate with `PgDialect`, then
executes the actual actor-post, permalink, redirect lookup, reply, public-feed,
and mention queries through Drizzle against PGlite. It also calls the real
posts/status/replies GET handlers with stubbed sessions and active profiles.
The federation barrel forwards to the real wrappers; navigation is stubbed
to assert the legacy redirect's destination or not-found outcome.
It covers accepted versus pending follows, named `to`/`cc` recipients, expiry,
public versus unlisted, active versus pending/banned group membership, public
addressing inside private groups, parent authorization, and pagination.
Group authorization remains independent of personal-post addressing: a public
group is readable by anyone, while private groups require active membership,
even for the author or a named recipient.

The separate `Status Visibility` workflow runs only this suite on fork PRs
without secrets or the Playwright job's database setup.

### Existing database-backed suites

```
yarn test:db
```

Other suites read `POSTGRES_URL` from `.env.local` locally. In CI the variable is already
exported and dotenv leaves it alone, so the same command works unchanged.

## What's tested

`group-lifecycle.test.ts` covers `lib/federation/wrappers/group.ts`:

- `createGroup` mints a `Group`-typed actor and seats the founder as admin
- `topics` round-trips as a flag map, `rules` as an ordered array
- handles are unique across the flat screenname namespace
- `getGroupByHandle` withholds `privateKey` and does not nest the group twice
- `joinGroup` is idempotent and keeps `member_count` truthful
- the last active admin cannot leave and strand the group
- a ban blocks both leaving and rejoining
- `request` policy yields a pending row that does not count as membership
- `invite` policy refuses a self-serve join
- deleting a group actor cascades to the group and its members

`recommendation-lists.test.ts` covers
`lib/federation/wrappers/recommendation-list.ts`:

- `createList` defaults to private and mints a per-owner unique slug
- a retitle never rewrites the slug, because it rides in the federated `id`
- only the owner can update, delete, add to, or reorder a list
- directory listings can be recommended; a personal profile cannot
- the same business twice on one list is refused, across two lists is fine
- `item_count` and positions stay truthful across adds and removes
- reorder rewrites the running order and rejects an incomplete one
- `published_at` is stamped once and survives an unpublish/republish
- deleting a business tombstones the entry instead of rewriting the list
- deleting a list cascades to its items

## Writing more

Fixtures must be namespaced with a per-run random suffix and removed in an
`after` hook. The database these run against is shared and seeded, so a test
that truncates or assumes an empty table will destroy someone's dev data and
race other CI runs.

`scripts/reset-test-db.ts` does truncate everything. It exists for CI's
dedicated database — never couple a suite here to it.

Close the pool in teardown (`db.$client.end()`), or postgres.js keeps the
process alive and the runner hangs.
