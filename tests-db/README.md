# Database Tests

Tests that exercise `lib/` directly against a real Postgres. No browser, no
HTTP — these call the federation wrappers the same way an API route does, so
they cover the data-layer invariants the Playwright suite cannot reach from
outside.

Kept separate from `tests/` (Playwright, browser) and `tests-relay/`
(raw Nostr WebSocket frames against the relay).

## Running

### Donation checkout and account billing (no secrets)

```
yarn node --experimental-test-module-mocks --import tsx --test tests-db/donation-checkout.test.ts tests-db/billing.test.ts tests-unit/donations.test.ts
```

These suites call the production Checkout and billing handlers with Stripe's
network boundary replaced. They validate exact cents, one-time/monthly price
shapes, server-derived membership, signed-in customer reuse, verified-email
guest matching, billing ownership, current subscription state, safe portal
return URLs, and explicit failure responses. Billing uses isolated PGlite to
apply the real ownership migration and exercise its backfill, unique ownership,
cascade, and RLS. No external database, Stripe account, or network is used.

### Directory contact and signup regressions (no secrets)

```
yarn node --experimental-test-module-mocks --import tsx --test tests-db/listing-intake.test.ts tests-db/screenname-profile-email-collision.test.ts tests-db/screenname-required-fields.test.ts
```

These suites use isolated PGlite databases and stub only session, mail, and
verification boundaries. They apply the actual contact-email migration and
exercise production intake, invitation acceptance, approval, contact-edit,
account-email-change, and screenname handlers. Shared inboxes must not merge
identities, transfer ownership, approve the wrong listing, or update another
profile's mentoring data. Login emails and personal identity slots remain unique.

### Existing listing review and claims (no secrets)

```
yarn node --experimental-test-module-mocks --import tsx --test tests-db/listing-review.test.ts tests-db/listing-intake.test.ts tests-db/magic-link.test.ts
```

The review suite uses the same isolated PGlite approach and exercises the real
claim, verification, ownership, private-read, editing and photo-upload handlers.
Mail delivery, image storage, social-actor provisioning and ZIP lookup are
mocked; it never sends a real message or connects to an external database.
Coverage includes public-preview privacy, account-bound single-use tokens,
anonymous/wrong-account recovery, explicit correct-business authorization across
all editors, multiple managed listings, login/contact separation, preservation
of untouched information, and online/mobile location privacy. Browser coverage
in `tests/e2e/listing-review.spec.ts` follows the complete guided journey with
isolated API fixtures; CI uses the actual built Worker. The canonical review
entry opens Location directly; all six steps and the final authenticated
confirmation share one frame. Coverage includes adjacent Back navigation,
step pills, deep-link sign-in returns, reloads, unchanged location/photos,
completion-query tampering, stale/wrong-business review state, failed saves,
multiple managed listings and personal-editor isolation. Desktop/mobile
screenshots are produced from the real editor components with synthetic
profiles, not a separate design mock.

For local visual inspection with the site's actual rounded typeface, the suite
accepts `LISTING_REVIEW_VISUAL_FONT` as the path to a locally saved Nunito WOFF2
file. It serves that font through a browser fixture, without external font
requests. The ordinary suite does not require this optional screenshot asset.

The same review suite covers operator-only seven-day invitation issuance,
hashed storage, HttpOnly context, read-only scanners, explicit chosen-account
acceptance, expiry/revocation/contact changes, current-session confirmation and
atomic consumption/ownership under storage failures or concurrent requests.
`magic-link.test.ts` exercises the real Better Auth passwordless handler with
an in-memory adapter and mocked delivery: only the chosen login is created or
signed in, its callback retains the exact invitation target without carrying
business proof, and expired login links keep their recovery destination.

### Listing reminder lifecycle (no secrets)

```
yarn node --experimental-test-module-mocks --import tsx --test tests-db/listing-refresh.test.ts tests-db/listing-review.test.ts tests-db/listing-intake.test.ts tests-unit/listing-refresh.test.ts tests-unit/email.test.ts
```

The lifecycle suite applies `0076_listing_refresh.sql` in isolated PGlite.
It checks explicit admin-only enrollment, real day-7/14/21/28 sends, the day-30
hide threshold, duplicate job invocations, delivery failures and abandoned
acknowledgements, opt-outs and CRM Email DND, late-notice grace, server-confirmed
completion, unchanged personal identities/other businesses, directory-map
visibility, secure overdue claim/recovery, and staff-decision precedence.
Email and CRM boundaries are mocked; no production campaign, contacts,
credentials, or listing changes are used. The browser review suite also covers
the final confirmation, overdue restoration, opt-out scanners and explicit
administrative start controls.

### Isolated status visibility regression (no secrets)

```
yarn test:db:visibility
```

`visibility.test.ts` uses PGlite (real Postgres compiled to WASM) in memory.
It never loads `.env.local`, reads a connection string, or connects to an
external database. Run with Node 24; the script enables Node's experimental
module mocks to replace the database and session boundaries before importing
production code.

The same command includes `local-actors.test.ts`, also isolated in PGlite. It
exercises the real actor, follow, and suggestions API handlers and wrappers:
legacy-domain members resolve by handle, local follows are accepted, and both
suggestion tiers include those members without admitting remote accounts.
Case-insensitive handles, follow/unfollow counts, eligibility, block/mute
filtering, and signing-key projection are covered without rewriting identities.

`social-activation.test.ts` covers automatic setup through the current-actor,
handle-assignment, active-profile, and follow paths. Real unique constraints
exercise concurrent creation and conflicting identities. The bounded admin
repair covers existing members without their signing in, while excluding
unclaimed listings, missing handles, and ineligible profiles. Ownership,
legacy identities, public-key projection, retry behavior, and the removal of
the separate activation prompt are also covered.

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

### Native group chat (no secrets)

```
yarn node --experimental-test-module-mocks --import tsx --test tests-db/group-chat.test.ts
```

This suite also runs in `test:db:visibility`. It applies the real group and chat migrations
in isolated PGlite, then exercises the production storage and HTTP handlers. Both public
and private group chats require active membership; pending, banned, removed, and anonymous
viewers cannot read or send. It covers the 30-day visibility filter, bounded keyset pagination,
block/mute filtering, nonce-based idempotency, mirrored-media metadata, moderation, actual
leave/remove/rejoin/demotion paths, author/group deletion cascades, private response headers,
and RLS denying direct-client reads. No connection string or external database is used.

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
