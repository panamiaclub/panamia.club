# Relay Abuse Reports Roadmap

This document outlines the plan for surfacing NIP-56 abuse reports (kind `1984`)
published to `relay.panamia.club` inside Pana's admin console, so a moderator can
act on them. It follows the forward-to-pana pattern established for NIP-29
roster advisories in commit `cb67d26` (_"forward NIP-29 advisories to pana with
24h leave debounce"_), but inverts the failure model — see
[§ Why reports diverge from advisories](#why-reports-diverge-from-advisories).

Scope is deliberately narrow: **forward reports → store → show in admin
console**. Acting on a report (kick/ban via NIP-29 moderation events) is sketched
as a later phase, not committed here.

---

## Out of scope

- **"Propose an Edit"** (Amethyst's edit-proposal feature). Different event kind,
  not kind `1984`, and impractical to action server-side. Explicitly dropped.
- **Rate limiting / member-restricting reports themselves.** Decision
  (2026-06-02): report-flooding is an accepted annoyance. A flood of kind `1984`
  events is bounded by the relay's existing event handling and will not break the
  relay; we will not rate-limit, dedup-at-ingest, or member-restrict reporting on
  the relay side. (Storage-side dedup is still used — see
  [§ Pana side](#pana-side-storage--admin-console) — purely to keep the admin
  queue readable, not as an abuse control.)

  **Amended (2026-06-26):** a single _locality_ gate at ingest was added — see
  [§ Locality gate](#locality-gate-reject-reports-about-non-local-targets). It
  is not rate-limiting or member-restriction (reports from anyone, at any
  volume, about local targets are still accepted); it only rejects reports whose
  targets aren't hosted here at all. In practice nearly all observed report-spam
  was cross-relay noise about content this relay never held, which this removes
  without touching the "accept from anyone" posture.

---

## Current state

Kind `1984` has **no special handling today**, and — importantly — it is
**currently rejected from anyone outside panamia membership**:

- It is present in the relay's allowed-kinds allowlist
  (`external/nosflare/src/config.ts:84`).
- **But** the write gate at `external/nosflare/src/durable-object.ts:1083`
  requires every non-ephemeral kind's author to clear the panamia-membership
  check. Kind `1984` is **not** in the `EPHEMERAL_PUBKEY_KINDS` exemption, so a
  report from a non-member is rejected at `durable-object.ts:1097` with
  `"restricted: not a panamia member"` — it is never stored or broadcast.
- It is **not** in `ADVISORY_KINDS`, so the interception block at
  `durable-object.ts:1183` does not touch it. A report from a _member_ falls
  through to the normal path — `processEvent(event, session.id, this.env)` at
  `durable-object.ts:1240` — which verifies, persists to the relay D1 store, and
  broadcasts to subscribers.
- Nothing reaches pana. The admin console (`app/account/admin/*`: signups,
  users, podcasts, contactus) has **no moderation or reports surface**.

So today only members can file a report, and even theirs go nowhere a moderator
can see. This roadmap changes both: **accept reports from anyone** (next
section) and **surface them in the admin console**.

---

## Why reports diverge from advisories

The advisory forward (`forwardAdvisoryToPana`, `relay-worker.ts:453`, invoked at
`durable-object.ts:1189`) is **synchronous and fail-closed**:

- The relay blocks on pana's decision before sending `OK`.
- If pana is unreachable, the advisory is **rejected** and the roster freezes.

That is correct for advisories because they are _control-plane_ — they mutate the
group roster and pana is the source of truth.

Reports are the opposite. A NIP-56 report is **informational and public**; it
gates nothing. Copying the advisory model literally would be wrong in two ways:

1. It would block the publisher's `OK` on pana being up.
2. It would **drop the report** (losing the moderation signal) whenever pana is
   down.

So the report path must be **fire-and-forget and fail-open**:

| Aspect            | NIP-29 advisory (existing)           | NIP-56 report (this roadmap)                |
| ----------------- | ------------------------------------ | ------------------------------------------- |
| Relay intercepts? | Yes — suppresses normal persist      | **No** — report still persists+broadcasts   |
| Forward timing    | Synchronous, before `OK`             | **After** `processEvent` succeeds           |
| On pana down      | Reject event, freeze roster          | **Ignore** — report already stored on relay |
| Pana's role       | Source of truth (decides)            | Mirror / moderation inbox (records)         |
| Return value used | Yes — decision drives `OK`/republish | No — forward is best-effort                 |

---

## Architecture

```
        Amethyst (or any client)
                │  kind 1984 report event
                ▼
   ┌─────────────────────────────────────────────┐
   │  relay.panamia.club  (external/nosflare)       │
   │                                               │
   │  durable-object.ts                            │
   │   1. processEvent()  ── persist + broadcast   │  ← unchanged NIP-56 behavior
   │   2. if kind===1984: forwardReportToPana()    │  ← NEW, fire-and-forget
   │                          │ (Service Binding)  │
   └──────────────────────────┼────────────────────┘
                              ▼  env.PANAMIA.fetch
   ┌─────────────────────────────────────────────┐
   │  panamia (Next.js)                            │
   │                                               │
   │  POST /api/internal/relay/report   ── NEW     │
   │        └─ INSERT relay_reports (dedup)        │
   │                                               │
   │  /account/admin/reports            ── NEW     │
   │        └─ moderation queue UI                 │
   └─────────────────────────────────────────────┘
```

---

## Relay side (`external/nosflare`)

### Accept reports from anyone (ungated) — required

Reports must be accepted from **any pubkey, member or not**. Abuse can come from
accounts the relay has no relationship with, so gating reports to members would
blind moderators to exactly the reports that matter most.

This is a deliberate carve-out from the membership write gate at
`durable-object.ts:1083`. Kind `1984` must be exempted from that check the same
way `EPHEMERAL_PUBKEY_KINDS` is — e.g. extend the gate condition so a `1984`
event skips the membership requirement (a dedicated `UNGATED_KINDS`/
`REPORT_KIND` constant reads more clearly than overloading the ephemeral set).

Constraints on the carve-out:

- **Only the membership gate is bypassed.** Signature verification, the
  allowed-kinds check (`1984` is already listed), `containsBlockedContent`, and
  the tag allowlist (`durable-object.ts:1105`–`1132`) still apply. We are
  loosening _who_ may report, not skipping event sanity.
- **Unauthenticated publish must work.** NIP-42 AUTH is not required to file a
  report; the only AUTH-related check that fires is the
  "authenticated pubkey must match event pubkey" rule (`durable-object.ts:1050`),
  which is a no-op for clients that never AUTHed. Confirm a non-member,
  un-AUTHed client can publish `1984` end to end.
- Reports remain ordinary public NIP-56 events: still persisted to D1 and
  broadcast, exactly as a member's report is today.

This carve-out is the prerequisite for everything below — without it, the
forward only ever sees members' reports.

### Locality gate: reject reports about non-local targets

Implemented 2026-06-26 (`durable-object.ts`, `reportTargetsAreLocal` +
post-signature gate in `handleEvent`). "Accept from anyone" opened the relay to
cross-relay report-spam: clients broadcast a kind `1984` report to **every**
relay in the author's list regardless of where the reported content lives, so
relay.panamia.club began accumulating reports about accounts and events it has
never hosted (observed: external pubkeys whose only activity here was the report
itself, including all-category bursts against a single absent target).

The gate accepts a report only if at least one of its targets is hosted here:

- any `e`-tagged event id is present in our D1 store, **or**
- any `p`-tagged pubkey has authored at least one event in our D1 store.

Otherwise the relay replies `rejected: report target not hosted on this relay`.
A report with no usable `p`/`e` tags references nothing local and is rejected.

Design constraints:

- **Self-contained on the relay.** The check uses `queryEvents` against our own
  D1 only — **no** panamia membership lookup. Report admission must never depend
  on (or be blockable by) the pana control plane. Consequence: "user hosted
  here" means "has authored an event here", not "is a panamia member"; a member
  who has never posted has no local content to moderate and is treated as
  non-local. Accepted, given the self-sufficiency requirement.
- **Runs after signature verification**, before `processEvent`, so rejected
  reports never touch D1.
- **Storage errors are not swallowed.** A D1 failure propagates to
  `handleEvent`'s catch, which returns a transient `error:` OK so the client
  retries — accepting-on-error would be pointless, since the same outage would
  fail the subsequent persist anyway.

This is relevance-gating, not anti-flood: a member or stranger can still file
any number of reports about content this relay actually holds.

### Hook placement

Add a forward **after** the existing `processEvent` call at
`durable-object.ts:1240`, gated on `event.kind === 1984`. The normal
persist/broadcast must run first and unchanged — we are mirroring, not
intercepting. Do **not** add `1984` to `ADVISORY_KINDS`.

Fire-and-forget: the forward must not block the `OK` already sent for the event.
Run it detached (un-awaited promise, or `this.state.waitUntil(...)` if the DO's
`DurableObjectState` exposes `waitUntil` in our Workers runtime — **confirm at
implementation time**, do not assume). Any failure is swallowed and logged; the
report is already durable on the relay regardless.

### `forwardReportToPana(event, env)` — new fn in `relay-worker.ts`

Mirror the shape of `forwardAdvisoryToPana` (`relay-worker.ts:453`), minus the
decision handling:

- POST to `https://internal/api/internal/relay/report` via `env.PANAMIA.fetch`.
- Body carries the report's salient fields, parsed from the NIP-56 event:
  - `event_id`, `reporter_pubkey` (= `event.pubkey`), `created_at`
  - `report_type` — the value on the report tag (`spam` / `profanity` /
    `impersonation` / `nudity` / `illegal` / `malware` / `other`; "Violence" in
    Amethyst maps to `other`)
  - `target_pubkey` — the `p` tag (reported account)
  - `target_event_id` — the `e` tag, if present (reported note)
  - `content` — the reporter's freeform "Additional Context"
- On non-2xx or thrown error: `console.error` and return. No retry, no effect on
  the event.

### Reporter acknowledgment (`OK` message)

When a `1984` event is accepted, reply with a report-specific `OK` string
instead of the generic save message, so a reporter's client can surface
confirmation. NIP-56 itself defines no relay→reporter response — the NIP-01 `OK`
message is the only channel — so this is a courtesy, not a spec requirement.

The change is **relay-only and trivial**: `processEvent` does not emit the `OK`
itself, it returns `{ success, message }`, and the DO sends the `OK` at the call
site (`durable-object.ts:1247`) with `result.message`. So we only override the
string there when `result.success && event.kind === 1984`:

```
received: report logged for moderator review
```

(default for all other kinds stays `"Event saved successfully"`.)

Caveat: the `OK` message is for client consumption; whether a given client
(e.g. Amethyst) shows the string to the human reporter is up to that client.
Best-effort, may be invisible — we do not depend on it.

### Tag extraction

`getHTag` exists and is imported (`durable-object.ts:26`); equivalents for `e`/`p`
tags and the NIP-56 report-type may not. Add small helpers (or inline parse) to
pull the first `e` tag, first `p` tag, and the report-type. A kind `1984` event
may carry multiple `e`/`p` tags with per-tag report types — **for v1, take the
first `p` tag and its report type; record additional tags only if cheap.**
Document the simplification inline.

---

## Pana side (storage + admin console)

### New endpoint: `app/api/internal/relay/report/route.ts`

Mirror `app/api/internal/relay/group-event/route.ts`:

- Service-Binding-only; no HTTP-level auth (same rationale documented at
  `group-event/route.ts:15` — Service Bindings bypass the public network).
- Validate the payload shape, `INSERT` into `relay_reports`, return
  `{ stored: true }` (or `{ stored: false, reason }`). The relay ignores the
  response either way, but a clean contract aids debugging.
- `export const maxDuration = 5;` as in `group-event`.

### New table: `relay_reports` (`lib/schema/index.ts` + migration)

Follow the drizzle `pgTable` conventions used by `relayGroupMembers`
(`lib/schema/index.ts:~`). Proposed columns:

| Column            | Type                          | Notes                                  |
| ----------------- | ----------------------------- | -------------------------------------- |
| `id`              | pk                            | serial / uuid per house convention     |
| `event_id`        | text notNull                  | the kind 1984 event id                 |
| `reporter_pubkey` | text notNull                  | hex x-only pubkey (no FK; see members) |
| `target_pubkey`   | text                          | reported account, nullable             |
| `target_event_id` | text                          | reported note, nullable                |
| `report_type`     | enum or text                  | NIP-56 type; consider a `pgEnum`       |
| `content`         | text                          | freeform reporter context              |
| `reported_at`     | timestamp(tz) notNull         | from `event.created_at`                |
| `received_at`     | timestamp(tz) notNull default | server insert time                     |
| `status`          | enum default `'open'`         | `open` / `actioned` / `dismissed`      |

- **Dedup index** on `(reporter_pubkey, target_pubkey, report_type)` with
  `onConflictDoNothing` (or `DO UPDATE SET reported_at = excluded.reported_at`).
  This is a _readability_ measure for the queue, not an abuse control — per the
  out-of-scope decision, we are not trying to stop floods, just to avoid one
  reporter showing up 500 times for the same target.
- No FK from `*_pubkey` to `profiles` — consistent with the existing
  `relay_group_members` note that the `nostr_pubkey` linkage is deferred.

New migration: next free number is **`0007`** (latest is
`drizzle/0006_add_article_cover_image_alt.sql`). Hand-author the SQL and register
it in `drizzle/meta/_journal.json`, matching how `0004_add_relay_group_pending.sql`
was done in `cb67d26`.

### New admin page: `app/account/admin/reports/page.tsx`

Sits alongside the existing admin pages (`app/account/admin/{signups,users,
podcasts,contactus}/page.tsx`). Minimum viable:

- List `relay_reports` rows, newest first, with `status = 'open'` filtered to the
  top.
- Show reporter, target (pubkey + optional event id), report type, freeform
  context, and timestamps.
- Resolve actions that flip `status`: **Dismiss** (`dismissed`) and a placeholder
  **Mark actioned** (`actioned`). Actual enforcement is Phase 2.
- Reuse the admin auth gate the other `account/admin` pages already use
  (`app/api/admin/checkAdminStatus`).

---

## Phasing

- **Phase 1 — Capture (this roadmap).** Relay forward + `relay_reports` table +
  read-only-ish admin queue with dismiss/mark-actioned status flips. Reports
  become visible to moderators. No enforcement.
- **Phase 2 — Action (sketch only).** Wire an admin action to NIP-29 moderation:
  a "kick" that emits the kind `9000`/`9001` the relay already republishes on
  roster changes (see `republishGroupStateAfterRosterChange` in
  `durable-object.ts`). This closes the loop from _report_ → _moderator decision_
  → _roster/relay effect_. Requires deciding scope (per-group vs relay-wide ban)
  and is intentionally deferred.

---

## Open questions

1. **`waitUntil` in the DO.** Confirm whether `DurableObjectState.waitUntil` is
   available/effective in our Workers runtime, or whether an un-awaited promise
   is the right fire-and-forget primitive. Affects the hook implementation.
2. **Report-type storage as `pgEnum` vs free `text`.** Enum is tidier and matches
   house style (`articleStatus`, etc.), but NIP-56's type set has shifted over
   time and clients send unknown values; a `text` column with an app-level
   allowlist is more forgiving. Lean `text` unless we want strictness.
3. **Multiple `e`/`p` tags per report.** v1 takes the first; revisit if real
   reports commonly target multiple events/accounts at once.
4. **Retention.** Do open/dismissed reports accumulate forever, or is there a
   prune policy? Not blocking for Phase 1.
