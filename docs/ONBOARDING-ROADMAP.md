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

Invitation/reminder proof pages and their private APIs select `no-referrer`
in the global proxy: the runtime applies proxy headers after route headers.
Route-owned cache directives and public directory/map policies are unchanged.

### Review and claim an existing listing

The permanent entry for an existing directory business is
`/listings/claim/start?id={profileId}`. Use the actual public PostgreSQL profile
ID, never an import/source ID or an email address. The page shows a public-only
preview before sign-in. Opening it or signing in does not assign ownership.

An unclaimed business requires an explicit request for a one-hour, one-time
ownership link sent to its business contact inbox. The requesting Pana account
may use a different email. Verification is bound to that account; a signed-out
visitor returns to the same token after sign-in, and a wrong-account visit can
switch accounts without consuming the rightful requester's link. Existing claim
URLs still work. New verification emails also retain the public profile ID for
expired/used-link recovery.

Already-authorized owners go directly to `/listings/review?id={profileId}`,
not an "already claimed" dead end. Owners can still use the permanent entry
when their listing is not public; other visitors cannot preview it, and the
review does not offer a broken public destination. The canonical review entry
checks access and redirects straight to Location, with no separate card
overview. One branded six-step wizard reuses the address, description, category,
private contact, public link and photo editors, in that order. The existing
`/account/profile/{step}?listingId={profileId}` deep links keep their section,
including after sign-in and reload. Each editor carries `listingId` explicitly
and checks `profile_owners` (or the
existing direct ownership link) again on reads and writes. Invalid, foreign or
personal profile scopes never fall back to the currently active identity.
The journey does not switch the active-profile cookie.

Existing information is prefilled and omitted values are preserved. Every
business must provide a real, recognized five-digit US ZIP to complete its
listing review, including online-only and mobile/appointment-based businesses.
ZIP+4 is normalized to its first five digits, preserving leading zeros. Location
asks how people can find the business before showing the corresponding fields.
**Public visiting address** requires a public street address, city, state and
recognized ZIP; an exact map point remains optional. **Online** and
**Mobile or by appointment** ask only for a recognized business base ZIP, never
a street, private home address or exact point. A missing, invalid or
not-yet-verified saved ZIP leaves all location choices unselected and offers no
**Keep current location details** shortcut. Keyboard focus alone does not choose
a mode. A verified saved ZIP still allows keeping current details unchanged,
including legacy ZIP-only or public-point locations.

Selecting a mode changes only the form until an explicit save. Online/mobile
saves clear previous street/exact-point data while preserving unrelated service
counties and profile fields; mobile does not mark the business online-only.
Returning to a public visiting address never restores a legacy online row's
hidden street or exact point without explicit entry. Missing location is not
classified as online-only.
Without a visiting address, a ZIP is an approximate base area, not directions,
a service/delivery boundary or an exact street point. ZIP validation and
street/point privacy use the existing address API and verified ZIP cache.
Each review editor has one Back/continue footer after its editable fields in DOM
and keyboard order, including **Continue to confirmation** at the end of Photos.
There is no duplicate top or sticky next action. Saving each section continues
to the next; Back returns to the preceding step and the six pills allow direct navigation.
The first Back exits to the selected listing's permanent entry. Keeping location
or photos unchanged uses the same continue action rather than a second save
button. A saved **primary business photo** is required to finish the review.
An existing real saved primary photo counts without another upload. Gallery
photos remain optional and cannot substitute for the primary; neither an
unsaved selection, failed/empty upload response, personal avatar nor site
placeholder meets the requirement. Photos checks the scoped upload response and
refetches this business before continuing. Saving, skipping and switching steps
never confirm the review, and optional steps need not be visited.

Photo saves stage new, uniquely keyed objects before changing the profile.
Only selected slots are merged into the locked current row after access is
rechecked, so concurrent saves to different slots keep both changes. Failed
uploads or database writes leave saved photos intact; unreferenced staged
objects are cleaned up where possible. Superseded objects are removed only
after persistence, never while another current slot retains their URL.
Cleanup failures are logged without reporting a committed save as failed.
Storage cleanup is best-effort: provider failures or an unavailable database
can leave unreferenced objects, and foreign/imported media is not deleted.

After Photos, `/listings/review?id={profileId}&complete=1` opens the final check
inside the same wizard frame, with a read-only summary and Back to photos. It
does not mark anything complete on arrival. Only the authenticated **Confirm
business information** POST, after verifying the locked business's current ZIP
and saved primary photo, can save `lastReviewedAt`, complete the current
reminder cycle and restore an eligible overdue-review pause; staff restrictions
remain authoritative. The success screen is backed by the server's review state,
not `complete` or `confirmed` query parameters alone. It links to the updated
public listing when available and the exact business's management wizard.
Direct requests, skipped steps, stale location/photo data and URL flags cannot
bypass these requirements. A missing primary photo returns a Photos-field error before
any completion/restoration writes, with a link back to Photos. Historical review
timestamps are preserved when requirements are no longer met. No external
image-existence lookup is made. Unknown ZIPs return a Location-field error;
temporary lookup failures are retryable and leave review, cycle and visibility unchanged. A
previously verified ZIP does not require another network lookup.

Cream/ink surfaces, orange actions, indigo step pills and progress are scoped to
listing-review mode; ordinary personal editors retain their account styling and
save behavior. Review deadlines, holds and errors stay in the wizard. Reminder
preferences are available in a compact disclosure without changing campaign or
visibility policies, including when the business has no primary photo.

This is a product UI path only. It does not create, schedule or send a campaign,
import contacts, bulk-claim businesses, or modify existing listings on arrival.
Published legacy listings without ZIPs or primary photos remain published. There
is no data backfill, migration or new background requirement-based deactivation.
Personal editors, intake drafts and edits to other business fields do not
acquire these review requirements.

### Inbox invitation shortcut (operator-issued, not an account login)

An operator may prepare a distinct invitation for a published, unclaimed intake
listing. The delivery contract is
`/listings/invite?id={publicProfileId}#token={opaqueInvitation}`. Deliver that URL
privately **only to the business contact returned by issuance**; do not publish
it, log it, drop its fragment, or copy it to another address. The plain stable
claim/review URLs above remain the non-secret recovery and management routes.

The invitation lasts **seven days from issuance**, independently of the existing
30-minute passwordless sign-in link and one-hour account-bound ownership email.
It proves access to the business inbox for one listing; it cannot log in as or
impersonate a personal account. Opening it, including scanner/preview loads,
performs no account creation, ownership grant, email send or token consumption.

The raw invitation is carried in a URL fragment, not a query string sent to
servers or third parties. The client checks it through a same-origin JSON POST
and retains it in a host-only, HttpOnly, SameSite=Lax cookie scoped to the
invitation API (Secure in production). This only preserves context: inspection
is read-only and does not spend the proof. The fragment is removed from the
address bar. No invitation proof or business email is put into login callbacks,
browser storage, public API responses or analytics. Passwordless sign-in returns
to `/listings/invite?id={publicProfileId}` on the same origin; use the same
browser, or reopen the original invitation in the browser already signed in.

Signed-in visitors see the account that would manage the listing and can change
accounts before **Confirm claim and review**. Signed-out visitors see **Sign in
or create an account**, first-time Google/email guidance, and the business name
they will confirm after returning. Existing members use their Pana account.
Business and personal login emails can differ; a personal public profile or
screenname is not required to manage a business. A valid invitation
replaces the second business-inbox verification email, not the chosen account's
sign-in. Existing public claim links without invitations keep their original
account-bound verification. Already-authorized managers may go directly to the
stable review route even when the invitation has been used or expired.

Authenticated acceptance checks the displayed account ID/email again and locks
the listing before its invitation. Ownership and invitation consumption commit
together using the shared first-claim helper; an outage rolls both back.
Inspection and acceptance check current contact, pending setup and ownership
state. A contact edit or successful first claim revokes outstanding invitation
proof. Reissue/revoke operations use the same listing lock, so concurrent
requests cannot produce two first owners or two usable invitations.

Issuance plumbing (no delivery or campaign execution):

- `POST /api/admin/listings/{profileId}/invitation`: admin session and same-origin
  request required. Reads the actual current business contact, replaces any
  prior invitation for that listing, and returns the URL, recipient and expiry.
  A caller-supplied recipient/email cannot change the destination.
- `DELETE /api/admin/listings/{profileId}/invitation`: admin-only revocation.
  This does not touch passwordless or existing account-bound claim tokens.
- `POST /api/listings/invitations/context`: validates the fragment and stages
  browser context only. `GET /api/listings/invitations?profileId={id}` is read-only.
- `POST /api/listings/invitations`: requires the current session, explicit
  acceptance and its expected account ID/email; grants only the scoped listing
  and returns its exact review path. It never changes the active identity.

Only hashes of the invitation and bound inbox fields are stored, namespaced in
the existing verification table. An admin receives the raw delivery URL once;
normal inspection never returns it or private contacts. Replaced, revoked,
expired, contact-changed and wrong-context links offer the stable claim path
or support; changed sessions must reload and confirm again. No production
invitations are minted by development/testing, and campaign delivery remains
subject to separate approval.

### Thirty-day review reminders and overdue recovery

Staff may explicitly enroll one published business at
`/admin/listings/{profileId}/refresh`. The page is read-only until the operator
checks the authorization box and starts the cycle. The migration, ordinary
sign-in, claim links and listing edits do not enroll anyone.

The existing hourly Worker checks due cycles. A successful initial email starts
the 30-day clock. Reminders follow at days 7, 14, 21 and 28; the fourth is the
final notice. At day 30 an unanswered cycle is paused by setting `active=false`
and recording `status.refreshPause.reason = 'review_overdue'`. No profile,
photos, location or ownership data is deleted. Late notices remain seven days
apart, and the last successful reminder always receives at least 48 hours before
hiding; delivery lateness extends the deadline rather than shortening notice.

The last step of the listing journey now requires an explicit, authenticated
**Confirm business information** action. It records `profiles.lastReviewedAt`
and completes the current cycle atomically with cancellation of pending
reminders. Merely opening `?complete=1`, signing in, claiming, or saving one
section does not confirm the review. Existing values can be left unchanged
when the business already has a verified US ZIP. Otherwise, add a real ZIP in
Location before confirming; online and mobile businesses are not exempt. Choose
the public visiting-address form or the ZIP-only online/mobile form as appropriate.
Never guess a ZIP or provide a private home address.

Unclaimed businesses receive fresh seven-day inbox invitations in reminders.
Claimed businesses receive a non-secret review link at their current managing
account emails, not whichever identity is active in the browser. Recipients are
resolved from actual ownership links, with duplicate inboxes removed. Business
and personal login emails remain separate.

Overdue unclaimed listings retain the secure claim path even while their public
directory/profile page is hidden. A valid overdue-pause marker and cycle allow
ownership verification; claiming alone does not republish them. The subsequent
authorized confirmation restores only that overdue pause. The marker contains a
guard against changes to staff decisions, administrative state, or identity.
Staff approve/decline operations cancel the cycle and clear the marker. A manual
suspension or cancelled cycle is never overridden by an owner confirmation.

Delivery is recorded per cycle, round and recipient hash before the provider is
called. Confirmed recipients are not automatically mailed twice for that round.
The native mail binding does not promise delivery idempotency: rejected sends
and abandoned/unacknowledged attempts put the cycle on hold, not into a blind
retry loop. Development console logging cannot count as a delivered reminder.
The initial clock stays unset when the first email fails. Staff can inspect
delivery references, mark a delayed bounce, hold/cancel a cycle, or explicitly
acknowledge resend risk before retrying. Changed recipients, known bounces, and
a held final notice require a fresh cycle rather than an immediate overdue hide.
Before hiding, the job also checks that the initial notice and every reminder
reached a currently relevant manager or business inbox; a new, unnotified
contact/ownership handoff is held instead of inheriting an old deadline.

Local email opt-outs and existing CRM Email DND are checked before sending and
before hiding; an unavailable preference lookup holds the cycle. Every reminder
includes a scoped stop-reminders link whose GET is read-only and whose explicit
confirmation records the listing preference without claiming or republishing
it. Owners can also stop reminders from the review page. Opt-outs are not
treated as ignored notices, and staff cannot bypass the preference with retry.
An owner can allow future listing reminders without starting a new campaign.

Initial, weekly and final `listing.refresh` notices use the listing-only variant
of `emailLayout` in `lib/email-templates/layout.ts`, along with the closely
related `listing.claim` and `listing.setup` messages. The cream/orange/indigo
palette, current PNG wordmark, inline table layout and text fallbacks match the
site without changing unrelated authentication or admin templates. The job's
`reminderNotice` flag selects presentation only; deadlines, recipient selection,
proof URLs, opt-outs and successful-delivery lifecycle rules are unchanged.
All refresh stages put the new-account and different-login-email reassurance
before the review button and detailed ZIP/photo instructions in both HTML and
plain text. The invitation guidance still requires sign-in and explicit claim
confirmation for an unclaimed listing, not a second business verification email.

For a private, no-send preview, run
`yarn tsx scripts\preview-listing-emails.ts <private-output-directory>`.
It writes HTML, plain text and a subject manifest directly from the registered
`renderTemplate` path used by `sendTemplateEmail`, including all refresh stages,
owned-listing links, claim verification and setup recovery. It uses only sample
data, reserved `.invalid` action URLs and deliberately invalid proof strings;
it imports neither the transport nor the database and requires no credentials.
Keep previews outside public assets. Outlook can fall back to square corners
and system fonts; images can be blocked without losing the name, content or CTA.
Presentation does not guarantee Inbox placement. Mail provider/authentication
settings, controlled sends and production campaign approvals remain separate.

The server APIs are:

- `GET/POST /api/admin/listings/{profileId}/refresh`: authorized staff status,
  explicit start, hold, bounce flag, cancellation and controlled retry.
- `GET/POST /api/listings/review`: private exact-business status and authenticated
  final confirmation or reminder preference. Account and cycle snapshots are
  checked again on writes.
- `POST /api/listings/review/stop`: a scoped, non-login suppression capability
  from `/listings/reminders/stop?cycleId={id}#token={proof}`.

Recipient emails and delivery/invitation URLs are not copied into the delivery
ledger. Only hashes, dates, states and references are retained; the tables have
RLS with no direct-client policies and cascade when their business is deleted.
Cron telemetry remains aggregate counts, not private contacts or messages.
Migration `0076_listing_refresh.sql` is required before deployment. It changes
no listing visibility and creates no cycles. Campaign enrollment, real sends,
merge and deployment are still separate operational approvals.

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
  `calcDistance` in `lib/geolocation.ts`, driving the `nearest` sort. Coordinates
  are cached for a day and sent to the search API only at two decimal places.
- **Area** comes from the visible map bounds. Sharing location centers the
  camera on the viewer without imposing a hidden radius; old radius links
  cannot exclude distant or unlocated matches from directory discovery.
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
nearest sorting when coordinates exist, and viewport-based area discovery
without a separate radius control.

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
