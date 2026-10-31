# Accounts Roadmap

How Panamia Club distinguishes **vendor accounts** (business listings in the
directory) from **consumer accounts** (people who search the directory and
participate in Pana social), and what has to change to support both.

## Overview

The platform already has two distinct account concepts in the schema. What it
lacks is a signup path that produces the second one. Today the only self-serve
route to a usable account runs through `become-a-pana`, which publishes the
account to the vendor directory — so there is no way to be a member of Pana
social without also being listed as a business.

The fix requires **no migration and no new columns**. The discriminator already
exists, is already populated, and is already correct on every existing row.

### Design Philosophy

1. **One profile, two presentations** — consumers and vendors share a single
   `profiles` record. Social and the directory read the same identity, so
   following a vendor and following a neighbor are the same operation.
2. **Directory listing is a property, not an identity** — being a business is a
   value of `accountType`, not a different kind of account.
3. **Consumers are not second-class** — a consumer profile is approved, active,
   and followable. It is simply not a business listing.
4. **Not listed means not indexed** — anything excluded from the directory is
   also excluded from the sitemap.

---

## Current State

### Owner-focused listing setup

The current business intake is separate from a person's identity profile.
`profiles.userId` stays `NULL` for a business; `profile_owners` connects its
manager, allowing one account to administer multiple listings without replacing
the person's profile. The main application email is the login identity.
`profiles.email` is only a copied business contact and may be changed separately.

Application notifications go to both the owner account email and this business
contact, with identical addresses deduplicated. Before setup is confirmed,
the explicitly invited account email receives the same approval/decline decision.
After confirmation, the current owner login email is resolved through ownership
links, so changing the login address does not lose application notifications.
Private setup and sign-in links are never copied to the business inbox.

Signed-in applicants receive ownership automatically when they submit the
owner-focused form. Guests confirm a business-specific setup email and then make
an explicit authenticated ownership confirmation. Ordinary sign-in never
automatically accepts an anonymously submitted invitation. Legacy intake payloads
and invitations keep their existing behavior.

Account setup does not gate publication. Staff still approve `active: false`
applications, and approved listings without owners or handles are public at
`/listings/{profileId}`. Their public page keeps the claim invitation until
someone actually administers the listing; a handle alone is not a claim.
Business managers do not need a personal social profile to use their dashboard.
No migration or reassignment of existing approved businesses is required.

### The two tables

| Table      | Role                        | Created when                      |
| ---------- | --------------------------- | --------------------------------- |
| `users`    | Auth identity               | Any sign-in (Better Auth)         |
| `profiles` | Directory listing / profile | Only via an explicit profile flow |

The relationship is 1:1 — `profiles.userId` is `UNIQUE`, `onDelete: 'cascade'`,
and **nullable** (migration `0022`). Nullability supports two real flows:

- **Unclaimed profiles** — an admin-imported listing that predates its account.
  `claimProfileForUser()` in `auth.ts` attaches it on first sign-in by matching
  `profiles.email` against the user's email.
- **Tombstoned profiles** — account deletion nulls `user_id` to sever the
  cascade so the record survives for attribution.

Postgres treats `NULL`s as distinct, so many such rows coexist under the unique
constraint.

### Signing up does not create a profile

`auth.ts` contains no `insert(profiles)` anywhere. It only ever _claims_ a
pre-existing row. Profiles are created by:

| Path                               | Sets                    | Notes                          |
| ---------------------------------- | ----------------------- | ------------------------------ |
| `POST /api/createExpressProfile`   | `active: true`          | `become-a-pana`; needs session |
| `POST /api/profile/importProfiles` | `active: true`          | Admin bulk import              |
| `scripts/migrate-from-mongodb.ts`  | `active` per legacy doc | One-time migration             |

**A plain sign-up therefore yields a user with no profile.**

### What `active` actually means

`profiles.active` (default `false`) is the **moderation state**, not a
visibility preference. It is written by:

| Location                         | Write           | Meaning           |
| -------------------------------- | --------------- | ----------------- |
| `app/api/admin/profile/action`   | `active: true`  | Approved by admin |
| `app/api/admin/profile/action`   | `active: false` | Declined by admin |
| `lib/server/delete-account.ts`   | `active: false` | Account deleted   |
| `app/api/profile/sendSubmission` | reads `false`   | Awaiting review   |

Because `active: false` already means _declined, deleted, or pending_, it cannot
be reused to mean "this account is a consumer". Doing so would make consumers
indistinguishable from rejected vendors, pollute the admin review queue, and
make the deletion path ambiguous.

### Reading the profile is what gates social

Every social capability funnels through one check in `lib/federation/gates.ts`:

```ts
export function canCreateSocialActor(profile: Profile | null): GateResult {
  if (!profile) return { allowed: false, reason: 'no_profile' };
  if (!profile.socialEligible)
    return {
      allowed: false,
      reason: profile.socialIneligibleReason ?? 'not_eligible',
    };
  return { allowed: true };
}
```

`canPost`, `canFollow`, `canBeFollowed`, and `canFederate` all delegate to it.
The coupling is structural as well as procedural: `social_actors.profileId` is a
`UNIQUE` foreign key to **`profiles`**, not to `users`.

Two consequences worth stating plainly:

- **No profile means no social at all.** Not a degraded timeline — no actor.
- **None of the gates read `active`.** Directory visibility and social
  eligibility are already decoupled at the permission layer. `socialEligible`
  defaults to `true`.

### `accountType` exists and is inert

```ts
export const accountType = pgEnum('account_type', [
  'personal',
  'directory',
  'hybrid',
  'other',
]);
// users.accountType — .notNull().default('personal')
```

The column is selected and echoed by `/api/user/me`, `/api/user/get`,
`/api/getUserList`, `/api/getSessionUser`, `/api/saveSessionUser`,
`/api/affiliate/acceptTOS`, and `lib/user.ts`. **Nothing branches on it.**

The rebuild notes at the top of `app/form/become-a-pana/page.tsx` already
specify the intended branching — personal profiles collect neighborhoods and
must not store a street address; `directory` and `hybrid` collect the full
address — with a stated rationale: name plus address is a notifiable
combination under FIPA.

Because the default is `'personal'`, **every account that has ever signed up
without completing `become-a-pana` is already tagged correctly.**

---

## The Gap

A consumer who wants to use Pana social must have a profile. The only
self-serve way to get one is `become-a-pana`, which hardcodes `active: true`
("Self-created profiles are active immediately"). So joining social means
publishing yourself to the vendor directory.

The distinction was designed. It was never wired up.

---

## Proposed Model

Keep one profile per user. Let `accountType` decide directory listing. Leave
`active` meaning exactly what it means today, for both account types.

| Concern             | Field                      | Applies to          |
| ------------------- | -------------------------- | ------------------- |
| Approved and live   | `profiles.active`          | Consumers + vendors |
| Listed in directory | `users.accountType`        | Vendors only        |
| Social enabled      | `profiles.socialEligible`  | Consumers + vendors |
| Billing tier        | `profiles.membershipLevel` | Orthogonal          |

A **consumer account** is then: a `users` row with `accountType: 'personal'`
and a `profiles` row that is `active: true`, `socialEligible: true`, carries no
street address, is reachable at `/p/[screenname]`, and is absent from both the
directory and the sitemap.

A **vendor account** is the same record with `accountType` set to
`directory` or `hybrid` and the address fields populated.

---

## Decisions

### 1. Consumers bypass the admin approval queue

Consumer profiles are created `active: true` without review. There is nothing
to vet — no listing, no address, no business claim — and gating signup behind a
moderation queue would block social onboarding entirely.

Abuse is handled by `profiles.socialEligible` + `socialIneligibleReason`, which
suspends social participation without touching listing state. This is the
correct separation: `active` answers "is this listing approved", `socialEligible`
answers "may this account participate". Consumers only ever engage the second.

Consequence: changes #8 and #9 are mandatory, not optional.

### 2. Resilience is gated by membership, not by account type

The relay membership check is
`profiles WHERE nostrPubkey = hex AND active = true AND membershipLevel != 'free'`
— a paid-membership gate. The module's stated value proposition addresses "a
non-technical member" and sells personal identity, key backup, and social
presence. That is a consumer proposition, not a vendor one.

Consumers therefore get Resilience when they hold a paid membership, on exactly
the same terms as vendors.

This resolves a pre-existing inconsistency. Two gates disagree today:

| Gate                        | Consumer | Requires                            |
| --------------------------- | -------- | ----------------------------------- |
| `getProfileReadiness()`     | `/r` UI  | become-a-pana complete + screenname |
| `/api/internal/relay/check` | nosflare | `active` + `membershipLevel`        |

The UI is stricter than the service it fronts, so a paying member can pass the
relay check and still be bounced by the interface. Change #5 aligns them.

### 3. Downgrading to `personal` clears the address

This is policy, not preference. The rebuild notes in
`app/form/become-a-pana/page.tsx` state that personal profiles must not store
street addresses, to limit FIPA breach exposure.

A vendor reverting to `personal` must therefore null `addressLine1`,
`addressLine2`, `addressLine3`, `addressLocality`, `addressRegion`,
`addressPostalCode`, `addressCountry`, `addressLat`, `addressLng`, and
`addressGooglePlaceId`. The profile record and its social identity survive; only
the listing data is removed.

---

## Implementation

### Where the profile is created

Signup is the wrong hook. Three constraints rule it out:

| Constraint                                                                         | Consequence                                     |
| ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| `profiles.name` is `NOT NULL`; `users.name` is nullable                            | A magic-link signup may have no name to write   |
| `users.screenname` is nullable, assigned later via `POST /api/user/screenname/set` | A profile made at signup has no `/p/` URL       |
| `social_actors.username`/`uri`/`inboxUrl` all derive from screenname               | No screenname means no actor can be constructed |

Screenname assignment is the first moment at which all three hold. That is the
creation point. `app/api/user/screenname/set/route.ts` already loads the user's
profile in order to sync an existing actor, so this is an extension of an
existing branch rather than a new hook.

Source `profiles.name` from the name required during a first screenname claim.
The `users.name ?? screenname` fallback remains for legacy accounts repairing a
missing profile during a handle change.

### Changes

| #   | Area       | File                                       | Change                                                                                                |
| --- | ---------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1   | Onboarding | `app/api/user/screenname/set/route.ts`     | Create a profile when none exists: `active: true`, required submitted name on first claim, no address |
| 2   | Directory  | `app/api/directory/suggest/route.ts`       | Add `inArray(users.accountType, ['directory', 'hybrid'])`                                             |
| 3   | Directory  | `lib/server/directory.ts`                  | Same predicate on the `getSearch()` query                                                             |
| 4   | Indexing   | `app/sitemap.ts`                           | Same predicate — see _Privacy_ below                                                                  |
| 5   | Readiness  | `lib/relay/profile-readiness.ts`           | Require profile + screenname only; drop `locallyBased`/`fiveWords` from the gate                      |
| 6   | Onboarding | `app/form/become-a-pana/page.tsx`          | Set `accountType` on submit; branch the form per the existing rebuild notes                           |
| 7   | Onboarding | `app/api/createExpressProfile/route.ts`    | Update the caller's existing profile rather than inserting a second one                               |
| 8   | Admin      | `app/api/admin/allProfiles/route.ts`       | Same predicate — consumers must not flood the admin profile list                                      |
| 9   | Admin      | `app/api/admin/profile/action/route.ts`    | Same predicate on the active-profile count                                                            |
| 10  | Downgrade  | wherever `accountType` moves to `personal` | Null every address field — see _Decisions_ §3                                                         |

Item 7 matters: once a consumer profile exists, `become-a-pana` is an **upgrade**
of that record, not an insert. The `UNIQUE` constraint on `profiles.userId`
will reject the insert otherwise.

Items 8 and 9 follow directly from the approval bypass. Both admin queries
select on `active = true` alone, and `allProfiles` returns name, email, and
phone for every match. Without the filter, every consumer signup lands in the
admin's vendor list.

### As built

The predicate lives in `lib/accounts.ts` as `DIRECTORY_ACCOUNT_TYPES`, imported
by all five read paths (#2, #3, #4, #8, #9) so the policy has one definition.
That module deliberately imports nothing, so both server queries and client
components can use it.

Three details differ from the table above:

- **Unclaimed profiles survive the filter.** `getSearch()` and `allProfiles`
  match `userId IS NULL OR accountType IN (…)`. A profile with no user is a
  legacy listing imported before accounts existed; it has no account to carry a
  type, and a bare `inArray` would have silently dropped every one of them.
  `suggest` and `sitemap` need no such clause — both already `innerJoin` users.
- **#6 sets the account type but does not branch the form.** Submitting
  `become-a-pana` now asks whether the listing is a business or a hybrid and
  writes that to `users.accountType`. The per-type field branching described in
  the file's rebuild notes (address fields, neighborhood pickers) remains
  outstanding.
- **#10 has no call site.** Nothing in the product writes `personal` back onto
  an account, so there is no downgrade to guard yet. The policy is encoded as
  `ADDRESS_FIELDS_CLEARED_ON_DOWNGRADE` / `clearedAddressPatch()` in
  `lib/accounts.ts`, ready for whoever builds that path.

`scripts/backfill-profiles.ts` closes the _Existing profile-less users_ gap
below. It defaults to a dry run; pass `--apply` to write.

### Driving users to the creation point

Hanging profile creation off screenname assignment only works if new accounts
actually reach that route. They did not: `ScreennamePrompt` was rendered in
exactly one place, `app/a/new/page.tsx`, so a user who signed in and never
wrote an article never claimed a screenname and therefore never got a profile
or social access.

`components/ScreennameGate.tsx` closes that. It is mounted once in
`app/layout.tsx` and, for any authenticated user without a screenname, surfaces
the prompt. It lives in the layout rather than on `/signin` because sign-in
arrives through several doors — magic-link callback, OAuth callback, and
pre-existing accounts that never had a screenname — each landing on an
arbitrary `callbackUrl`. The layout is the only place that catches all of them.

It is deliberately **skippable**. `SCREENNAME_COOLDOWN_DAYS = 90` in the set
route makes claiming a screenname a 90-day-locked decision, so trapping a
first-time visitor behind a modal to force one is worse than asking again
later. Dismissal is stored in `sessionStorage` keyed by user id, so signing out
and back in as someone else re-prompts. Fetch failures are swallowed — this is
a nudge, not a gate, and the user cannot act on the error.

### Explicitly unchanged

- **`lib/federation/gates.ts`** — no edits. Consumers get a profile, so they
  pass. `socialEligible` already defaults to `true`.
- **`app/api/user/search/route.ts`** — this is _not_ public people-search. It is
  the session-gated co-author/reviewer invite picker used by
  `components/UserSearch.tsx`. Filtering personal accounts out of it would block
  inviting a Pana as an article co-author.
- **Schema / migrations** — nothing. `accountType` already exists and is
  already populated.

---

## Privacy

`app/sitemap.ts` currently submits every profile matching
`active = true AND screenname IS NOT NULL` to search engines as
`/p/{screenname}`.

Creating consumer profiles without applying change #4 would publish every
member of the platform to Google. Changes #1 and #4 must ship together.

The decision of record is that personal profiles are reachable by direct link
and through social activity only — not discoverable by search, on-site or off.

---

## Known Gaps

- **`other` is unspecified.** The enum's fourth value has no defined directory
  behaviour. Under the predicate above it is not listed, which is a sensible
  default but has never been decided. Nothing currently writes it.
- **Existing profile-less users.** Accounts that signed up before this change
  have no profile and therefore no social access. Because creation hangs off
  screenname assignment, anyone who _already_ has a screenname will never pass
  through that route again. `scripts/backfill-profiles.ts` handles this — it
  left-joins rather than using `NOT IN`, since `profiles.userId` is nullable and
  `NOT IN` against a column containing NULLs matches nothing at all. Run it once
  after deploy.
- **Legacy name quality.** First screenname claims now require a nonblank name
  in both the welcome form and the legacy prompt, with server-side enforcement.
  Older profiles may still carry a screenname-derived display name; the
  contextual identity prompt lets those members replace it.
- **Form branching.** `become-a-pana` now records the account type but still
  shows every field to every type. The rebuild notes at the top of
  `app/form/become-a-pana/page.tsx` describe the intended per-type branching.

---

## Related

- `docs/SOCIAL-ROADMAP.md` — the ActivityPub layer that consumes these profiles
- `docs/DATABASE-DESIGN.md` — schema conventions and migration workflow
- `docs/PRIVACY-ROADMAP.md` — data classification and retention tiers
- `docs/SCREENNAME.md` — screenname rules, which gate `/p/[user]` resolution
- `lib/schema/index.ts` — `accountType` (L31), `users` (L319), `profiles` (L523)
