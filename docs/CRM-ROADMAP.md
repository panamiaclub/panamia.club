# CRM Integration Roadmap (GoHighLevel)

## Overview

GoHighLevel (GHL) is Panamia's CRM layer. It manages the **pre-signup funnel** (leads, marketing automation, re-engagement sequences) and continues tracking members after they sign up. GHL provides email/SMS marketing, pipeline management, and contact enrichment — capabilities that fall outside Panamia's core product scope and are deliberately kept separate.

The integration is designed around two concerns that must not be conflated:

1. **Privacy portal ("peaky window")** — a Settings page section that lets authenticated users read and manage their own GHL contact record directly. On-demand, user-driven, non-blocking.
2. **Dedicated CRM worker** — a background sync engine (`panamia-crm-bridge`) that keeps GHL contact fields, tags, and pipeline stages in sync with Panamia DB state. Invisible to users.

Inquiry routing (Contact Us submissions into GHL Tasks and Opportunities) is a
third concern, specified separately in [CONTACT-ROADMAP.md](./CONTACT-ROADMAP.md).

---

## Integration Model

**Model B: GHL is the superset. Panamia is System of Record post-signup.**

```
GHL contacts:
  ├── Leads (no Panamia account yet)
  │     └── GHL automation → user clicks link → signs up to Panamia
  │                                   ↓
  └── Linked users (ghlContactId stored on Panamia profile)
            ↓ one-way sync (dedicated CRM worker)
        Panamia DB changes → GHL contact field/tag/pipeline updates
```

GHL holds contacts from the moment they enter the funnel (event check-in, opt-in form, referral, etc.). When a lead signs up to Panamia, their GHL contact is linked via `ghlContactId` on the `profiles` table. From that point, the CRM worker pushes Panamia state changes to GHL; GHL automation reacts to those state changes to trigger sequences.

---

## System of Record

| Data                                     | System of Record                        | Notes                                                                      |
| ---------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| Contact identity (name, email, phone)    | GHL (pre-signup), Panamia (post-signup) | Panamia is authoritative after signup; copy-to-profile is opt-in per field |
| Lead source / UTM / event check-in       | GHL                                     | Read-only in privacy portal; not copied to Panamia                         |
| Marketing preferences (DND, unsubscribe) | GHL                                     | Written by privacy portal; synced inbound via webhook                      |
| Member profile (bio, mentoring, roles)   | Panamia                                 | Pushed outbound to GHL custom fields by CRM worker                         |
| Subscription / payment status            | Panamia (Stripe)                        | CRM worker relays to GHL **tags** (not pipeline stage — see Phase 6)       |
| Pipeline stage                           | GHL                                     | Not written by any code today; GHL automation or manual only               |
| Tags                                     | GHL                                     | CRM worker writes; GHL automation reacts                                   |
| Inquiry state (Contact Us)               | Panamia (intake), GHL (work)            | See [CONTACT-ROADMAP.md](./CONTACT-ROADMAP.md)                             |

---

## Contact Lifecycle

```
NOTE: the pipeline stage transitions below are the intended design, not the
implemented one. See Phase 4 — no pipeline code exists in the worker today.

Entry points (lead sources)
        ↓
GHL contact created (lead)
        ↓
GHL automation sends nurture sequence
        ↓
User clicks link → signs up to Panamia
        ↓
Signup claim: ghlContactId linked to profile
        ↓
CRM worker: pushes profile fields, sets pipeline stage → "Active Member"
        ↓
Member subscribes (Stripe) → CRM worker: pipeline → "Paying Member"
        ↓
Member inactive 30d → CRM worker adds "inactive-30d" tag
        ↓
GHL automation fires re-engagement sequence
        ↓
Member cancels subscription → CRM worker: pipeline → "Churned"
```

---

## Lead Sources

Contacts enter GHL only through explicit opt-in or legitimate interaction:

| Source           | Mechanism                                                                |
| ---------------- | ------------------------------------------------------------------------ |
| Event check-in   | Organizer scans QR / enters email; GHL contact created with event tag    |
| Opt-in forms     | GHL-hosted or embedded forms on panamia.club                              |
| Referral         | Existing member shares link with UTM; landing page submits to GHL        |
| Abandoned signup | User starts Panamia signup but doesn't complete; email captured pre-auth |
| Manual import    | Admin imports attendee list from off-platform event (with consent)       |
| Contact Us       | Authenticated submitter, or unauthenticated press (tagged `unverified`)  |
| Instagram DM     | GHL auto-creates a contact from the IG profile; usually has no email     |

PDL (People Data Layer) enrichment data, if used, is displayed read-only in the privacy portal with a provenance note ("sourced from third-party data provider") and is excluded from the copy-to-profile option.

---

## Privacy Portal ("Peaky Window")

A dedicated section on the user's Settings page. Calls the GHL API directly from the main app on behalf of the authenticated user. Entirely on-demand — no background sync involved.

### What it shows

- GHL contact fields (name, email, phone, custom fields)
- Lead source metadata (e.g., "event check-in: Panama City Meetup 2025-03")
- Current pipeline stage and tags
- DND / subscription status per channel (email, SMS)
- PDL enrichment data (read-only, with provenance note)

### User actions

| Action                              | Effect                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Unsubscribe from GHL communications | Sets DND for all channels on the GHL contact                                                 |
| Delete GHL contact                  | Deletes contact from GHL; sets `ghlOptedOut = true` on Panamia profile to prevent recreation |
| Copy field to Panamia profile       | Opt-in, per field; excludes PDL enrichment fields                                            |

### GHL ToS compliance

GHL ToS §1.4 (Data Subject Rights Management) actively requires operators to honor data subject requests (access, deletion, opt-out). The privacy portal is the fulfillment mechanism for these obligations — it is not optional for compliance.

### Resilience

The GHL API call is **non-blocking**. If GHL is unavailable:

- Show a graceful error state: "Could not load marketing data — try again later"
- The Settings page continues to function normally
- GHL is never a hard dependency for core app function

---

## Dedicated CRM Worker

A separate Cloudflare Workers project (`panamia-crm-bridge`, at `external/panamia-next-crm-bridge/`). Runs entirely in the background — no user requests touch it.

### Role

State bridge: reads Panamia DB state → writes GHL contact fields, tags, and pipeline stages. Does **not** send email or SMS — GHL's own automation engine reacts to the state changes the worker writes.

### Responsibilities

| Concern                       | Mechanism                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Outbound contact sync         | Profile field changes → GHL custom field updates                                             |
| Tag management                | Membership status, activity level → GHL tags                                                 |
| Pipeline stage transitions    | Signup → Active Member → Paying Member → Churned                                             |
| Inbound GHL webhooks          | DND changes, manual pipeline moves by sales rep → update Panamia `ghlOptedOut`               |
| Stripe relay                  | Stripe webhook → translate subscription events to GHL pipeline/tag changes                   |
| Inactive user sweep (cron)    | Query `lastLoginAt > 30d` → add `inactive-30d` tag in GHL → GHL fires re-engagement sequence |
| Contact sync catch-all (cron) | Sweep recently updated profiles → push any missed field changes                              |

### Wrangler bindings needed

- `HYPERDRIVE` — same Supabase DB as main app (new binding ID, separate from main app's binding)
- `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_WEBHOOK_SECRET` as env vars

### Cron schedule

| Trigger                 | Job                                                        |
| ----------------------- | ---------------------------------------------------------- |
| `0 * * * *` (hourly)    | `jobs/contact-sync.ts` — sweep recently updated profiles   |
| `0 3 * * *` (daily 3am) | `jobs/inactive-sweep.ts` — query `lastLoginAt > 30d` → tag |

### Split rationale

Separating the CRM worker from the main app provides:

- **Failure isolation**: GHL API errors, rate limits, or outages cannot affect user-facing requests
- **Deployment independence**: CRM logic can be updated without touching the main app
- **Clean separation**: Marketing automation logic is structurally isolated from core product code

CF Workers do support cron triggers on the main app directly — splitting is an architectural preference, not a hard technical requirement. The worker could start as cron handlers in the main app and be extracted later.

---

## GHL → Panamia (Inbound)

When GHL state changes should affect Panamia:

| GHL Event                          | Panamia Action                                                     |
| ---------------------------------- | ------------------------------------------------------------------ |
| Contact DND set (all channels)     | Set `ghlOptedOut = true` on profile                                |
| Contact deleted                    | Set `ghlOptedOut = true` on profile                                |
| Manual pipeline move by sales rep  | Log to Panamia (audit only, no state change)                       |
| Inquiries opportunity stage change | Update `contact_submissions.status` (see CONTACT-ROADMAP)          |
| Contact merged into another        | Absorbed ID stops resolving; re-resolve by email, update stored ID |

Inbound events arrive via GHL webhook to `POST /webhooks/ghl` on the CRM worker. The worker verifies the HMAC signature (`GHL_WEBHOOK_SECRET`) before processing.

---

## Verified GHL API Behavior

Observed against the live location on 2026-07-31 by `scripts/ghl-verify.ts`.
**None of the bridge code has ever been exercised against a real GHL response**
— every finding below therefore applies to code that is currently assumed to
work rather than known to. Each contradicted either the documentation or an
assumption already written into `src/lib/ghl.ts` or the handlers.

### Affecting the bridge's client (`src/lib/ghl.ts`)

- **A missing contact is a 400, not a 404**, returning
  `{"error":"Contact with id X not found","status":400}`. The bridge client
  throws a bare `Error` carrying only status text, so it cannot distinguish
  "merged away, re-resolve by email" from a transport failure. The main app's
  client grew `GhlApiError.isNotFound` for this; the bridge has no equivalent.
- **A 2xx does not mean the write happened.** Deleting a task answers 200 while
  leaving the task in place, and the task _list_ then stops returning it — so a
  list-based confirmation reports success for a record still visible in the
  dashboard. Any bridge write whose effect matters must be confirmed by reading
  the record back directly, not by status code and not by a list scan.
- **A 401 does not imply a bad token or a missing scope.** GHL also answers 401
  when an endpoint refuses the `Version` header. `GET /users/` returned 401
  under `v3` and 200 under `2021-07-28` in consecutive runs, so version handling
  must be per-endpoint and 401 must never be logged as an auth failure alone.
- **`PUT /contacts/{id}/dnd` does not exist — resolved 2026-07-31.** It answers
  404 "Cannot PUT". The bridge's `updateDnd()` called it and could never have
  worked; it now writes DND through `PUT /contacts/{id}` like the main app.
  The bug was **latent, not live**: nothing in the worker called `updateDnd`,
  and `inactive-sweep` only uses `addTag`. An earlier draft of this section said
  the sweep depended on it, which was wrong.
- **`dndSettings` key casing is load-bearing.** `PUT /contacts/{id}` requires
  `Email`/`SMS`/`WhatsApp`/`Call` and rejects the lowercase spelling with 422
  ("dndSettings.property email should not exist"). Lowercase appears in the
  create-contact v3 schema, which is a different endpoint. The rejection is
  loud, so a wrong casing cannot silently leave DND half-applied — worth noting
  because that was the feared failure mode.
- **DND is genuinely per-channel.** A single channel can be suppressed with
  `dnd: false` and reads back suppressed, so the top-level flag is a master
  switch rather than a gate over `dndSettings`. This is what makes per-channel
  controls possible; without it the only honest UI would be all-or-nothing.
- **A partial `dndSettings` merges** rather than replacing — naming one channel
  leaves the others as they were. Undocumented, so `setDndChannels()` still
  writes all four, but a single-key write would not currently destroy state.
  Note this differs from upsert's `tags`, which does replace.
- **Upsert's `tags` field overwrites the contact's entire tag set.** Adding a
  tag without destroying others requires `POST /contacts/{id}/tags`, which is
  confirmed additive. Any bridge path that upserts with tags can silently strip
  `panamia-subscriber` off a paying member.

### Affecting the inbound handler (`src/handlers/webhook-ghl.ts`)

- **The handler targets the wrong delivery mechanism.** It requires an
  HMAC-SHA256 signature on `x-wm-hmac-sha256` and 401s without one. That suits
  the native webhook subscription, but the inquiry design uses a Workflow
  **Webhook (Outbound)** action, which documents no configurable headers and no
  signing. Authentication has to become a shared secret in the action's Custom
  Data plus an unguessable path.
- **Its event names are assumptions.** `contact.delete` and `contact.dnd_update`
  have never been seen on the wire, and a workflow webhook's payload shape is
  author-controlled anyway.
- Treat the file as a starting point to rewrite rather than a working receiver.

### Confirmed working

Contact create (duplicates rejected with a recoverable `meta.contactId`),
additive tagging, task create with `assignedTo` preserved, the task completion
round trip, and opportunity create. `Version: v3` is accepted by contact, task,
opportunity, pipeline, location, and custom-field endpoints.

---

## Panamia → GHL Field Mapping

| Panamia Field               | GHL Custom Field               | Notes                                           |
| --------------------------- | ------------------------------ | ----------------------------------------------- |
| `profiles.bio`              | `panamia_bio`                  | Plain text                                      |
| `profiles.panaVerified`     | `panamia_verified`             | Boolean                                         |
| `profiles.mentoring` (JSON) | `panamia_mentoring`            | Serialized JSON or tag                          |
| `users.name`                | Contact `firstName`/`lastName` | Split on first space                            |
| `users.email`               | Contact `email`                | Read-only (GHL owns pre-signup)                 |
| `subscriptions.status`      | Pipeline stage                 | active → "Paying Member"; cancelled → "Churned" |
| `subscriptions.planId`      | `panamia_plan`                 | Plan name tag                                   |
| `lastLoginAt`               | `panamia_last_login`           | ISO 8601 date                                   |

Tags written by the CRM worker follow the `panamia-*` prefix convention (e.g., `panamia-verified`, `panamia-mentor`, `inactive-30d`).

---

## GHL ToS Compliance Notes

Key findings from ToS review relevant to this integration:

- **§1.4 Data Subject Rights**: Operators must provide a mechanism for contacts to request access, deletion, and opt-out. The privacy portal fulfills this requirement.
- **Consent for contact creation**: Contacts may only be created with explicit opt-in. All lead sources listed above require affirmative consent at point of capture.
- **PDL enrichment data**: If used, must be displayed with provenance disclosure and may not be re-exported to the data subject as if it were first-party data. The privacy portal enforces this with the read-only display and exclusion from copy-to-profile.
- **`ghlOptedOut` flag**: Prevents the CRM worker from recreating a contact that the user has deleted via the privacy portal. Without this guard, deleting a GHL contact would be immediately undone by the next sync cycle.

---

## Phased Rollout

### Phase 1 — Schema additions (complete)

- Added `ghlContactId: text('ghl_contact_id')` (nullable) to `profiles` table
- Added `ghlOptedOut: boolean('ghl_opted_out')` (default `false`) to `profiles` table
- Migration: `drizzle/0006_ghl_profiles.sql`

### Phase 2 — Privacy portal API routes (complete)

- `GET /api/crm/contact` — fetch authenticated user's GHL contact record
- `POST /api/crm/contact/unsubscribe` — set DND on all channels
- `DELETE /api/crm/contact` — delete GHL contact; set `ghlOptedOut = true`, clear `ghlContactId`
- `POST /api/crm/contact/copy-field` — copy `name` or `phone` field to Panamia profile
- GHL client: `lib/ghl.ts` (reads `GHL_API_KEY` / `GHL_LOCATION_ID` from env)
- All routes degrade gracefully (503) if GHL is unconfigured or unreachable
- Settings page section: not yet built (UI is out of scope for this phase)

### Phase 3 — Signup claim (complete)

- `auth.ts` `account.create.after` hook: after profile claim, searches GHL by email
- If a matching GHL contact is found and `ghlOptedOut = false`, links `ghlContactId` on profile
- Best-effort: GHL errors are caught and logged; account creation never blocked
- NOT IMPLEMENTED: the pipeline stage move to "Active Member" was specified here
  but no opportunity or pipeline code exists in the worker (see Phase 4)

### Phase 4 — Dedicated CRM worker (partial)

- **Pipeline stage transitions are NOT implemented.** The Overview, Contact
  Lifecycle, and System of Record sections describe the worker writing stages
  (Signup, Active Member, Paying Member, Churned); no such code exists. The
  worker writes contact fields and tags only. Any pipeline movement in the GHL
  account today is GHL-native automation reacting to those tags, or manual.
- `jobs/contact-sync.ts` — hourly sweep of recently updated profiles → push name + `panamia_verified` custom field to GHL
- `jobs/inactive-sweep.ts` — daily sweep via raw SQL against sessions table; adds `inactive-30d` tag on GHL contacts with no session activity in 30 days
- `src/lib/schema.ts` — corrected: `panaVerified` is accessed from `verification` JSONB (not a separate column); `lastLoginAt` removed (use sessions table instead)
- TODO (ops): deploy worker, configure HYPERDRIVE binding ID in `wrangler.jsonc`, set cron triggers in CF dashboard

### Phase 5 — GHL inbound webhook handler (written, never verified)

Previously marked complete. It is code-complete but has never received a real
delivery, and the 2026-07-31 findings above show its two load-bearing
assumptions are likely wrong. Reclassified so nothing downstream treats it as
proven.

- `handlers/webhook-ghl.ts` — HMAC-SHA256 signature verification + DB update via HYPERDRIVE
- `contact.delete` → sets `ghlOptedOut=true`, clears `ghlContactId` on profile
- `contact.dnd_update` (dnd=true) → sets `ghlOptedOut=true` on profile
- Signature header `x-wm-hmac-sha256` and both event names are guesses; a
  Workflow webhook sends neither a signature nor these names
- TODO (ops): register worker's `/webhooks/ghl` URL in GHL → Settings → Webhooks, capture one real delivery, and rewrite the handler against what actually arrives

### Phase 6 — Stripe relay (complete)

- `handlers/webhook-stripe.ts` — Stripe signature verification (timestamp + HMAC-SHA256) with 5-minute replay window
- `customer.subscription.created/updated` (active/trialing) → adds `panamia-subscriber` + `panamia-plan-{planId}` tags, removes `panamia-churned`
- `customer.subscription.deleted` or lapsed status → adds `panamia-churned`, removes `panamia-subscriber`
- GHL contact found via `users.email` → `profiles.ghlContactId` join; silently skips if no contact linked
- `STRIPE_WEBHOOK_SECRET` added to `.env.example` and `Env` interface
- TODO (ops): register worker's `/webhooks/stripe` URL in Stripe dashboard → Webhooks; subscribe to `customer.subscription.*` events

---

## Required Env Vars

### Main app (privacy portal)

| Var               | Type   | Location   | Required | Purpose                         |
| ----------------- | ------ | ---------- | -------- | ------------------------------- |
| `GHL_API_KEY`     | SECRET | CF-RUNTIME | No       | GHL private integration API key |
| `GHL_LOCATION_ID` | VAR    | CF-RUNTIME | No       | GHL sub-account/location ID     |

### CRM worker (`panamia-crm-bridge`) — not in main app

| Var                  | Purpose                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GHL_API_KEY`        | Same key as main app (or a separate worker-scoped key)                                                                                |
| `GHL_LOCATION_ID`    | Same location ID as main app                                                                                                          |
| `GHL_WEBHOOK_SECRET` | HMAC secret to verify inbound GHL webhook signatures                                                                                  |
| `GHL_WEBHOOK_URL`    | The worker's public URL registered in GHL as webhook endpoint                                                                         |
| `CRM_WORKER_SECRET`  | Shared HMAC secret for main app ↔ CRM worker internal calls (if privacy portal routes through worker instead of calling GHL directly) |

---

## Access Control

| Route                               | Required                                  |
| ----------------------------------- | ----------------------------------------- |
| `GET /api/crm/contact`              | Authenticated user (own data only)        |
| `POST /api/crm/contact/unsubscribe` | Authenticated user (own data only)        |
| `DELETE /api/crm/contact`           | Authenticated user (own data only)        |
| `POST /api/crm/contact/copy-field`  | Authenticated user (own data only)        |
| `POST /webhooks/ghl` (CRM worker)   | Valid `GHL_WEBHOOK_SECRET` HMAC signature |

All privacy portal routes verify that the GHL contact ID belongs to the authenticated user's profile before making any GHL API call. There is no admin-level route to read or modify another user's GHL contact via the main app — administrative GHL access goes through the GHL dashboard directly.
