# Admin access

Who can reach the admin surface at `admin.pana.social`, who can grant that
access to somebody else, and why the second one is deliberately awkward.

## The tiers

| Tier                  | Source                            | Uses admin screens | Grants admin |
| --------------------- | --------------------------------- | ------------------ | ------------ |
| **Super admin**       | `ADMIN_EMAILS` secret             | yes                | **yes**      |
| **Admin**             | `profiles.roles.admin`            | yes                | no           |
| **Content moderator** | `profiles.roles.contentModerator` | abuse reports only | no           |

`session.user.isAdmin` is the union of the first two. `session.user.isSuperAdmin`
is the env tier alone and never reads the column. Both are computed in
`enrichUserFields()` in `auth.ts`, on every request.

Server-side gates live in `lib/server/admin-auth.ts`:

- `checkAdminAuth()` — ordinary admin work: reading a queue, working the
  inbox, exporting. Use this for almost everything.
- `checkSuperAdminAuth()` — anything that changes _who_ is an admin. Use it
  for that and nothing else.
- `checkModeratorAuth()` — the abuse-report queue, and nothing else. Admits
  admins and content moderators.

## Directory listing profiles

Listing names in `/admin/listings` are links. Approved listings open their
public profile through `/listings/<profileId>`, which redirects to `/p/<handle>`
when the listing has a handle. Pending and declined listings open
`/admin/listings/<profileId>/preview` instead.

The preview checks `checkAdminAuth()` before reading the listing and accepts
only business-intake profiles. It is rendered per request, excluded from
search indexing, and does not expose unpublished listings through the public
profile routes. Save, recommend, share, claim, social, photo-upload, and
booking controls are absent from the preview. Opening it does not publish or
otherwise change the listing.

## The roles page

`/admin/users/roles` is the canonical place to see and change staff roles. It
has two halves:

- **The roster** — everyone who holds a role, from
  `GET /api/admin/users/roles`. Small and bounded, so it is returned whole
  rather than paged.
- **Search** — `GET /api/admin/users/search?q=`, an ILIKE over name,
  screenname and email, to reach somebody who has no role yet.

That split exists because the two questions are opposites. `/api/getUserList`
pages every account and reports each one's roles, so finding the four people
who hold one meant walking past everyone who does not — which stops being
possible well before the member list stops growing.

`lib/admin/roles.ts` is the catalogue the page renders, and it lists **only
roles something enforces**. `mentoringModerator` and `eventOrganizer` are
deliberately absent: a button that grants an unchecked flag would report
success, show a badge, and confer nothing. Add one there only after it has a
gate, in that order.

### Why the roster is not one query

Admin is the union of a column and an environment variable, and the two
disagree about what a person is. `profiles.roles.admin` belongs to a profile,
which belongs to an account. An `ADMIN_EMAILS` entry may have no profile, and
may have no account at all — a founder who has never signed in is still an
admin the moment they do.

So the endpoint reads the column holders, the accounts behind `ADMIN_EMAILS`,
and the `ADMIN_EMAILS` entries that match no account, then merges on user id.
Addresses matching nothing are **shown** rather than dropped, because a
typo'd secret and a correct one otherwise look identical.

## Granting admin

From `/admin/users/roles`, as a super admin. The button writes
`profiles.roles.admin` through `POST /api/admin/users/admin-role`.

A grant takes effect on the target's **next page load**. `enrichUserFields()`
re-reads `profiles` every request, so there is no sign-out step, no cache to
bust and no redeploy.

Three cases the route refuses rather than quietly accepting:

- **Revoking a super admin** returns 409. `isAdmin` is a union, so clearing the
  column on an `ADMIN_EMAILS` member would leave them an admin — writing it
  anyway would return success and leave you believing you had removed access
  the account still had. Remove them from the secret instead.
- **An account with no profile** returns 409. The grant rides
  `profiles.roles`, so an account with no profile row has nowhere to hold it.
  The person needs to finish signing up first.
- **A non-boolean payload** returns 400, so a missing field cannot read as a
  revoke and the string `"false"` cannot read as a grant.

The write merges into the existing `roles` object rather than replacing it —
that column also carries `mentoringModerator`, `eventOrganizer` and
`contentModerator`.

## The moderation rota

A **content moderator** reaches the abuse-report queue at `/admin/reports` and
is emailed when a new report arrives. That is the whole role: no other admin
screen, and no ability to grant anything to anybody.

Grant it from `/admin/users/roles`, as an **admin** — not a super admin. The
button writes `profiles.roles.contentModerator` through
`POST /api/admin/users/content-moderator`.

Three things follow from that choice, and they are the point of the role:

- **It cannot replicate itself.** The grant route is gated on
  `checkAdminAuth`, which a moderator does not pass. The founder bottleneck is
  only needed where the power being handed out includes the power to hand it
  out.
- **A revoke always revokes.** There is no environment tier behind
  `contentModerator`, so the column is the whole answer. The 409 that guards
  the admin toggle has no analogue here.
- **Mailing and acting stay in step.** `moderationTeamEmails()` in
  `lib/server/relay-reports.ts` builds the recipient list from
  `roles.admin ∪ roles.contentModerator ∪ ADMIN_EMAILS` — the same two fields
  `checkModeratorAuth` reads, plus the founder tier, which is admin by
  definition and may have no `profiles` row to find.

### Why it exists

Abuse reports used to be mailed to `ADMIN_EMAILS` and the queue was gated on
`checkAdminAuth`. One variable was doing three unrelated jobs: naming the
founder tier, acting as the default inbox for several notification streams,
and standing in for the moderation team. They pull in opposite directions —
the first wants one or two people, the last wants as many as will volunteer.

The practical consequence was that **adding somebody to the moderation rota
also gave them the power to make anybody an admin**, because the only way to
start mailing them was to add them to that secret. Privilege escalation by
mailing-list edit. So in practice nobody was added, and the queue stayed with
one person.

`contentModerator` already existed on the roles column and was read into the
session — it was simply checked by nothing. Making it real split the smallest
responsibility away from the largest one.

Two roles in that column are still inert: `mentoringModerator` and
`eventOrganizer` are computed into the session and read by nothing. They
should either get a gate or be removed.

### What the sidebar does

`lib/admin/views.ts` carries an optional `access?: 'admin' | 'moderator'` on
each tool, defaulting to `'admin'`; only `reports` is marked `'moderator'`.
`components/Admin/nav.tsx` filters on it, so a moderator's sidebar is one row
and the Overview shelf is hidden from them.

That is about _drawing_, not _serving_ — the route is the boundary. Keeping
both in one file is what stops a tool from being served to moderators but left
out of their nav, or drawn for them and then refused.

While the session is still resolving, the nav draws the full column and
narrows it afterwards. Growing a sidebar moves every row under the pointer at
the moment the page becomes clickable; shrinking one only removes rows the
viewer was never going to hit.

## Bootstrapping the first super admin

This is the one step that cannot happen inside the product, and it happens
**once**, not per admin.

```
npx wrangler secret put ADMIN_EMAILS
```

Paste the complete comma-separated list. Spacing does not matter; the parser
trims. There is a single Worker (`panamia-next`) with no named environments,
so no `--env` flag is needed. Secrets roll out as a new Worker version
immediately — no separate deploy. `adminEmailList()` reads `process.env` on
every call rather than caching at module load, so a rotation takes effect as
soon as the new version is live rather than whenever an isolate recycles.

Verify by loading `/api/admin/checkAdminStatus` while signed in. It returns
`{"data":{"admin_status":true}}` once you are in.

### The secret replaces, and cannot be read back

`wrangler secret put` overwrites the whole value, and Cloudflare will not
show you the current one. Writing only your own address therefore silently
drops every other super admin **and** re-points the default notification
inbox:

- `lib/email.ts` falls back to `ADMIN_EMAILS[0]` for the four streams that
  send without naming a recipient: newsletter signups, affiliate TOS
  acceptances, public listing intake, and profile submissions. Contact Us is
  **not** one of them — it always passes an explicit address from
  `lib/contact-routing.ts`, and only an unauthenticated `press` enquiry fans
  out to the secret.
- Abuse reports are no longer affected. `moderationTeamEmails()` unions the
  secret with everyone holding `roles.admin` or `roles.contentModerator`, so
  the rota survives a secret overwrite.

If the current list has been lost, it can be recovered without the secret:
whichever inbox receives profile-submission mail is `ADMIN_EMAILS[0]`
(`DEV_RECEIVER_EMAIL` is local-only, so the fallback applies in production),
and any abuse report sent before the moderation rota landed went to every
entry.

## Why the website cannot do the bootstrap

Somebody has to be first, and there is nobody to authorize that grant. An
endpoint that could create the first admin without an existing admin is an
endpoint anyone who finds it can call.

## Why the grant power stays on the env var

If every admin could create admins, one compromised staff account would be
self-replicating and effectively permanent: revoking the original would not
revoke what it had already created, and there would be no tier left that the
attacker could not reach.

Keeping the grant power on the secret means the recovery path lives somewhere
a web session cannot touch. Recovering from a compromise requires access to
Cloudflare, not just a cookie.

## Rejected: calling the Cloudflare API from the site

Proposed, and declined on purpose. Record of the decision so it is not
re-litigated:

A token that can rewrite `ADMIN_EMAILS` can rewrite every other secret in the
same Worker — `BETTER_AUTH_SECRET`, `POSTGRES_URL`, the payment keys.
Cloudflare's scoping does not go finer than "edit this Worker", which is
equivalent to deploying arbitrary code. Holding that token on the site would
turn any XSS or auth bug on pana.social into full infrastructure takeover.

It is also self-defeating. The env tier is a usable recovery path _because_ a
web session cannot reach it. Give the website that reach and there are no
longer two tiers — just one tier with extra moving parts and a very powerful
credential sitting inside the blast radius it was supposed to be outside of.

If the real need is "somebody other than the founder should be able to promote
people," the answer is a DB-backed super admin tier that super admins can
grant, keeping `ADMIN_EMAILS` purely as break-glass. That keeps the recovery
property and needs no Cloudflare credential on the site.

## Escalation paths that are closed

- **Claiming an unclaimed profile** adopts that row's `roles`. Harmless while
  the column held only scoped moderator flags; now that `roles.admin` grants
  the admin surface, an unclaimed row carrying it would hand admin to whoever
  proves control of the matching email address — a much weaker bar than the
  founder gate. Both claim paths (`auth.ts`, `lib/server/profile.ts`) strip it.
  No row can carry it today, since the only writer is the gated route, but
  seeded, imported and migrated data reach that column without passing it.
- **Deleting an account** clears `roles` (`lib/server/delete-account.ts`), so a
  grant cannot outlive the account. `profiles.userId` is also
  `onDelete: cascade`.
- **Profile edit endpoints** all write explicit column lists. None of them
  accept `roles` from a request body, and `crm/contact/copy-field` restricts
  itself to a two-field allow-list.

## Why `profiles.roles` and not a column

`users.role` was dropped in `drizzle/0021_drop_users_role.sql` as dead data, so
re-adding a column would reopen a settled decision. The JSONB needs no
migration, and `profiles.userId` is `UNIQUE`, so the identity profile is
strictly 1:1 with the account — there is no ambiguity about whose roles count.
Directory listings created through `/form/get-listed` leave `userId` NULL and
are administered through `profileOwners`, which is what lets one person run
several listings without any of them being their identity.
