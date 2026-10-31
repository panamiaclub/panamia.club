# Onboarding Roadmap

What a person meets between clicking a magic link and becoming a participating
member, and what has to change for that stretch to work.

## Overview

`docs/ACCOUNTS-ROADMAP.md` owns the **data model** — which table holds what, and
when a `profiles` row comes into being. This document owns the **experience**:
the arrival moment, what a new member is asked for, in what order, and what
happens when they decline.

The platform's sign-in is good. One field, no password, four OAuth providers.
The problem is everything immediately after it: a brand-new member and a member
of three years land on the same page, see the same copy, and are given the same
nothing. One of them is missing a profile and cannot post, follow, or be
followed — and nothing on screen says so.

### Design Philosophy

1. **The door stays open.** Sign-in and sign-up are the same exchange, because
   the site is passwordless — the account is created the first time a magic link
   is used. Asking a visitor to classify themselves as new or returning before
   anything has explained the difference is a question with no answer.
2. **Gate the action, not the door.** Arrival is never blocked. What a member
   cannot do yet is explained at the point they try to do it.
3. **Nobody is left silently inert.** If something is unavailable because a step
   was skipped, say which step, and offer it in place.
4. **Ask for a thing where it pays off.** A postcode belongs to the moment
   someone searches nearby, not to a form they fill out before they have seen
   anything.
5. **Arrival is not intent.** Someone who clicked a magic link from a
   half-finished business listing was going somewhere. An interstitial may
   interrupt that journey, but it must not end it.

---

## Current State

### One door

`/signin` is the only entry point. It offers a magic link (email + Turnstile)
and whichever of Google, Apple, Wikimedia and Mastodon have credentials
configured — all four are `false` by default in `lib/env.config.ts`, so a
default deployment offers the magic link alone.

`callbackUrl` defaults to the **current surface's** `rootPath`, not the main
site's, so signing in on Pana Social returns you to Pana Social.

### Business-owner entry

`/form/get-listed` is a single owner-focused application: one main account email,
prefilled and read-only for signed-in applicants, with an optional separate
business contact. There is no "helping someone else" or management opt-out branch.
Signed-in applicants manage the business immediately. Guests receive one named
"Confirm and manage [business]" email that signs them in or creates their account,
then asks for one explicit confirmation at `/listings/setup`.

The setup GET is read-only; only the authenticated confirmation POST assigns
ownership. It selects the business and reloads `/account/profile/edit`, avoiding
a separate invitation acceptance and manual identity-switching detour. Expired
email links can be recovered through the permanent setup URL in the same email.
Business intake/setup do not trigger personal screenname onboarding, and owners
with managed listings are not required to create a social profile. The account
menu still offers personal-profile setup when they want to participate socially.

Staff review is independent of account setup. Approved listings have stable
public `/listings/{id}` pages before an owner chooses a handle, and show a claim
invitation only when no account administers them. Existing approved listings are
not unpublished or assigned to anyone as part of this flow.

The main account inbox always receives application decisions. An optional
business inbox is an additional copy, not a replacement. Matching addresses get
one message. A guest's named setup email also serves as their submission receipt;
a different business contact gets a receipt without the sign-in link. Connected
owners receive future decisions at their current account email. Sign-in and setup
links stay private to that account.

### What happens on a first sign-in

| Step                   | Where       | Effect                                                                                                      |
| ---------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `user.create.before`   | `auth.ts`   | Rejects a sign-in with no email. Nothing else.                                                              |
| `users` row            | Better Auth | Created. `screenname` null, `accountType` `'personal'`.                                                     |
| `account.create.after` | `auth.ts`   | OAuth only — `claimProfileForUser(…, true)`                                                                 |
| `session.create.after` | `auth.ts`   | Magic link's path, since the account hook never fires for it — `claimProfileForUser(…, false)`              |
| `claimProfileForUser`  | `auth.ts`   | Attaches an **existing unclaimed** profile matching the email. Business listings excluded. Creates nothing. |
| `ensureSocialActor`    | `auth.ts`   | Builds the ActivityPub actor — but only if a profile exists.                                                |

A member whose email has no pre-existing listing therefore finishes sign-in
with a `users` row and nothing else.

### The half-state

| Record          | Present after first sign-in?                                                |
| --------------- | --------------------------------------------------------------------------- |
| `users`         | Yes                                                                         |
| `profiles`      | **No** — created only by `POST /api/user/screenname/set` or `become-a-pana` |
| `social_actors` | **No** — references `profiles`, so it cannot exist yet                      |

The consequence, per `docs/ACCOUNTS-ROADMAP.md`: the member can browse, but can
never post, follow, or be followed. Nothing communicates this.

### What exists today to catch it

| Mechanism                            | Where                       | Problem                                                                                                                                                                                      |
| ------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ScreennameGate`                     | `app/layout.tsx`            | A skippable modal. Correctly mounted in the layout so it catches every door, but its skip says nothing about what skipping costs, and dismissal is remembered for the whole browser session. |
| `CallToActionBar` `complete-profile` | `components/MainHeader.tsx` | Points at `/form/become-a-pana` — the **business listing** form. It offers a person who wants to read a feed the job of registering a company.                                               |
| `IdentityMenu`                       | masthead                    | `return null` when `identities.length === 0`, so it vanishes for precisely the profile-less members who need it most.                                                                        |

---

## The Gap

1. **There is no arrival moment.** A new member and a returning one are routed
   identically, to a surface root, with identical copy.
2. **The half-state is silent.** No profile means no posting and no following,
   and the UI neither explains nor offers a remedy.
3. **The one nudge points at the wrong thing.** Sending a consumer to
   `become-a-pana` is the exact conflation `ACCOUNTS-ROADMAP.md` was written to
   undo.
4. **The account menu hides from the people who need it.** Because it returns
   null without identities, a profile-less member has no avatar menu — and since
   sign-out moved into that menu (#178), no way to sign out at all.

---

## Proposed Model

A single interstitial, `/welcome`, shown once to accounts that have not yet
claimed a screenname. It names the place, collects the name and screenname that
unlock participation, and then returns the member to wherever they were going.

```
magic link / OAuth
        │
        ▼
  callbackUrl (unchanged)
        │
        ▼
  ScreennameGate ── has screenname? ──yes──▶ stay put
        │ no
        ├── legacy account ──▶ skippable name + screenname modal
        └── new account ─────▶ /welcome?next=<where they landed>
                                   │
                                   ├── claim screenname + display name ──▶ next
                                   └── skip (cost stated) ──────────────▶ next
                                                                            │
                                                          "Finish setting up"
                                                          row persists in the
                                                          account menu
```

---

## Decisions

### 1. An interstitial, not a wizard

One page, two required inputs: name and screenname. Multi-step onboarding is how
you convert a first-time visitor into a bounce. Everything that is not
load-bearing is asked for later, in context.

### 2. Intent is preserved with `?next=`

`ScreennameGate` fires on whatever page the callback landed on, which may be a
page the member deliberately chose. `/welcome` therefore carries the origin in
`next` and returns there on completion **or** on skip.

`next` must be validated as a site-relative path — a value starting with `/` but
not `//` or `/\` — or it is an open redirect.

### 3. Display name and screenname are both required to finish setup

This closes the original name-quality gap recorded in `ACCOUNTS-ROADMAP.md`:

> `users.name ?? screenname` guarantees a non-null `profiles.name`, but a
> screenname-derived display name is a poor default. The screenname prompt
> should ideally collect a display name at the same time.

A magic-link member has no name from any provider, so without this every such
profile is named after its handle. Both the welcome form and the legacy modal
now collect a name and screenname and require non-whitespace values before
submission. `POST /api/user/screenname/set` rejects a first claim with HTTP 400
when either field is missing, blank, or not a string; an existing member can
still change only their handle without resubmitting their name.

Skipping still permits browsing; it does not complete setup or create a profile.

### 4. The skip stays, but states its cost

Removing the skip would contradict the reasoning recorded in `ScreennameGate`
and `ACCOUNTS-ROADMAP.md`: a screenname is locked for
`SCREENNAME_COOLDOWN_DAYS` (90), so coercing a first-time visitor into one is
worse than asking again. The defect is not that skipping is possible — it is
that today's skip is silent about the consequence.

### 5. New and legacy accounts are treated differently

`/welcome` is a first-run experience and reads oddly for an account that has
existed for two years without a handle. Those members — the backfill population
described in `ACCOUNTS-ROADMAP.md` — keep the existing modal.

---

## Implementation

### Phase 1 — arrival

| #   | Area  | File                                   | Change                                                                                                                            |
| --- | ----- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | API   | `app/api/user/me/route.ts`             | Return `createdAt` so the client can tell a new account from a legacy one                                                         |
| 2   | Route | `app/welcome/`                         | The interstitial: names the place, claims screenname + display name, honest skip, returns to `next`                               |
| 3   | Gate  | `components/ScreennameGate.tsx`        | New accounts redirect to `/welcome?next=…`; legacy accounts keep the modal                                                        |
| 4   | Menu  | `components/account/identity-menu.tsx` | Render for any signed-in member, including those with no identities; add a "Finish setting up" row when the screenname is missing |
| 5   | CTA   | `components/MainHeader.tsx`            | Point the `complete-profile` bar at `/welcome` instead of `/form/become-a-pana`                                                   |

Change 4 also repairs the sign-out regression noted above.

### Phase 2 — the fork

Offer, after the screenname is claimed, the three things a member can actually
do: explore the directory (`/d`), join the conversation (`/s`), or list a
business (`/form/become-a-pana`, which sets `accountType`). This is the
person-versus-business split that `ACCOUNTS-ROADMAP.md` specifies; the welcome
page is where it should first be offered, as one click rather than a form.

| #   | Area  | File                                       | Change                                                                             |
| --- | ----- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | Route | `app/welcome/start/`                       | The fork: two browse doors plus a listing door, gated on a claimed screenname      |
| 2   | Flow  | `app/welcome/_components/welcome-view.tsx` | Land a completed claim on the fork, unless the member was already headed somewhere |

Three details settled during the build:

- **The fork yields to intent.** A member interrupted on the way to a specific
  page is returned there, not handed a tour — `?next=` outranks the fork, per
  Decision §2. It appears only when the destination is a front door, which is
  the case that means "nowhere in particular".
- **Skipping the screenname skips the fork.** Someone who just declined to
  answer a question has not asked for a second screen. Skip goes straight to
  the destination.
- **The listing door hides for accounts that already have one.** Offering
  `become-a-pana` to a `directory` or `hybrid` account is noise. No new
  write path was needed: `createExpressProfile` already updates an existing
  profile rather than inserting a second one (`ACCOUNTS-ROADMAP.md` #7), which
  is what keeps the `UNIQUE` constraint on `profiles.userId` satisfied now that
  every member arrives with a profile.

### Phase 3 — contextual asks

- **Display name and avatar** — shipped. See below.
- **Who to follow** — already works. `listSuggestedActors` falls back to
  recently-joined local actors when the mutual-follow walk returns nothing, and
  the card labels that tier "New to Pana Social". An earlier draft of this
  document claimed the opposite; see Known Gaps for what was actually wrong.

#### Shipped: the first-post ask

`app/s/_components/identity-prompt.tsx`, rendered by the feed once
`PostComposer` reports a successful post.

The timing carries the whole idea. Asked before the post, "add a photo" is a
chore between a member and the thing they came to do. Asked immediately after
their words go up under a bare handle, it answers a question they are already
asking themselves. So the prompt is mounted on the composer's existing
`onSuccess` callback and cannot appear before a post exists.

It nudges rather than gates: the post is already published when the card
appears, nothing is withheld, and "Not now" hides it for the browser session
via `IDENTITY_DISMISS_KEY`, keyed by actor id so a shared browser does not
inherit someone else's answer.

**Detecting an unset name** is subtler than detecting a missing avatar, and
`describeBareIdentity` in `lib/onboarding.ts` owns the rule. `profiles.name` is
`NOT NULL`, so it is never empty; a legacy member who skipped the name field
during setup got it filled from their screenname (`app/api/user/screenname/set` —
`displayName || session.user.name || newScreenname`), and that value is what
`createActorForProfile` copies to `socialActors.name`. An actor whose name
equals its username may therefore be showing a legacy fallback. New claims
require a name, but existing profiles can still need this nudge.
The false positive — somebody whose real name genuinely is their handle — costs
one dismissible card, which is the right side to err on.

The card links out to the pages that already exist rather than inlining a
second editor: `/account/user/edit` for the name, `/account/profile/images` for
the photo. Only the missing half is offered.

#### Dropped: the `zipCode` ask

An earlier draft of this phase proposed asking for `users.zipCode` at the first
locality-scoped directory search. It was cut, and the account-settings input
that wrote the column was removed with it.

The field was doing nothing. Every reference to `users.zipCode` was the account
settings round trip — the edit page sent it, `saveSessionUser` wrote it,
`getSessionUser` handed it back — under a label reading "Used to personalize
search results and site features." Nothing personalized anything with it.

It is also redundant. The directory already answers "near me" directly and
does not need a zip:

- **Distance** comes from shared browser coordinates: `geolat`/`geolng` through
  `calcDistance` in `lib/geolocation.ts`, driving the finite radius filter and
  the `nearest` sort. Coordinates are cached for a day and sent to the search
  API only at two decimal places.
- **No location** means the complete South Florida directory. The browser is
  prompted only after an explicit "Use my location" click; denied, unsupported
  and unavailable location all keep the directory usable without a geographic
  fallback filter.

A zip is a coarser proxy for the browser coordinates, so making it useful would
mean shipping a zip→coordinates table purely to synthesize a signal the browser
already provides. Asking again at search time would also have meant asking a
second time for a string the account panel already collected and ignored.

The column survives with a comment in `lib/schema/index.ts`; existing rows hold
real data and dropping it is a migration for no benefit.

**It has already come back once.** The account settings redesign (#183) landed
while this work was in flight and re-created the input in
`app/account/user/edit/_components/user-settings-view.tsx`, under a nav section
called "Where you are" whose lede promised "A ZIP code is enough to sort the
directory and the events near you." That is the same promise the old copy made and the same one nothing kept. The
directory now keeps location discovery in context: an explicit location CTA,
finite radius choices when coordinates exist, and all South Florida otherwise.

---

## Known Gaps

- **~~Follow suggestions cannot seed a first run.~~** Withdrawn — this was a
  misreading. `listSuggestedActors` runs the friend-of-friend query first, and
  when it comes back short it tops the list up from recently-joined local actors
  (`lib/federation/wrappers/follow.ts`, the `fresh` query). A member with zero
  follows gets that second tier, and `SuggestionsModule` flags those cards "New
  to Pana Social" rather than claiming a mutual that does not exist. The note is
  kept rather than deleted because the claim reached a PR description before
  anyone read past the first query.
- **`hasProfile` fails closed.** `components/MainHeader.tsx` catches a failed
  `/api/getProfile` with `setHasProfile(false)`, so a network blip shows an
  established member the complete-profile bar.
- **Dismissal is per browser session.** `ScreennameGate` stores its dismissal in
  `sessionStorage`, so a member who skips is asked again in every new tab
  session. The account-menu row added in Phase 1 is the calmer channel; the
  modal's frequency should be revisited once it exists.
- **No first-run copy on `/signin` itself.** The page branches only on
  `isBecomeAPana`. A visitor arriving from a "join us" link still reads copy
  addressed to a returning member.

---

## Related

- `docs/ACCOUNTS-ROADMAP.md` — the account-type model and where profiles are created
- `docs/SCREENNAME.md` — screenname rules, validation, and the 90-day cooldown
- `docs/SIGNIN.md` — provider switching and account linking
- `docs/SOCIAL-ROADMAP.md` — the ActivityPub layer that consumes these profiles
- `auth.ts` — `claimProfileForUser`, `ensureSocialActor`, and the database hooks
