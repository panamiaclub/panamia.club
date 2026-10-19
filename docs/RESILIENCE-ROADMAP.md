# Resilience Roadmap

This document captures architectural decisions and planned work for platform resilience and decentralization — primarily the integration of a self-hosted Nostr relay as a panamia.club sidecar service.

---

## Current status (2026-05)

The PoC is live at `wss://relay.panamia.club` and the `/r` enrollment flow on `daydream.panamia.club` is end-to-end functional. A new user signs in, picks a screenname, completes the become-a-pana form, generates a keypair in the browser, enrolls into `panamia-test`, and lands directly in the group from Nostrord (mobile + web) without an admin-approval gate.

**Shipped**

- Membership-gated relay with NIP-42 AUTH and per-event panamia membership check via Service Binding
- `profiles.nostrPubkey` (+ `nostr_pubkey_source`) and `relay_groups` / `relay_group_members` tables
- `/r` enrollment UI: client-side keypair generation, server-side enroll, browser-published kind 0 (screenname seed), kind 10009 (group list)
- NIP-29 group ACL — h-tag write gate, REQ-time filter narrowing, broadcast-side membership check, mention-leak prevention
- Relay-signed lazy emission of kinds 39000 / 39001 / 39002 and kind 9000 grants, with a 60s DO-side cache and deterministic event ids derived from `joinedAt`
- Kind 0 lock for relay-issued pubkeys (panamia owns `name` / `nip05`)
- NIP-05 endpoint at `/.well-known/nostr.json` served by the relay
- CORS preflight handling so browser clients (Nostrord web) can complete the NIP-11 handshake
- DM acceptance smoke (NIP-04 + NIP-17 / kind 1059)

**Not yet built**

- BYO-pubkey upload flow + correlation-risk disclosure
- NIP-46 remote signer (key custody for issued keys)
- nosflare → panamia data endpoints for stats / public feed / contact graph (the "panamia-next calls nosflare" half of the API plan below)
- Active panamia → relay push endpoint — today the relay pulls group state lazily on REQ rather than receiving pushes
- Public group bridged to ActivityPub (see _Future Considerations_)
- Hide-entirely upgrade for non-discoverable groups
- Abuse-report intake UI and operator tooling
- Mesh-mode local relay
- Narrow confidentiality clause in the membership terms — see _Member-leak threat model_ under NIP-29 below. Group chat is read-gated at the relay but not encrypted end-to-end, so the practical defense against a member exfiltrating chat to a public relay or screenshotting it elsewhere is policy and trust, not cryptography. Today there is no clause in the membership agreement that addresses this; adding one is the single highest-leverage step before the group feature scales.
- Visual fingerprint for relay identity. Comparing the relay's 64-char hex pubkey across Amethyst/Damus/etc. and `/r` is not a practical verification UX for members. Deferred design: render the Pana logo outline as the relay's kind 0 profile picture, colorized deterministically from the pubkey (e.g. hue-shifts driven by hash bytes), and show the same colorized rendering on `/r`. A returning member can do a two-second visual vibe-check against what they remember; a silent pubkey rotation would produce a visibly different logo and prompt an out-of-band check. The monthly heartbeat (already shipped) gives a temporal signal; this adds a spatial one. Not a substitute for cryptographic verification — a complementary low-friction layer.

### Source-code disclosure

The customizations in `external/nosflare/` (panamia ACL, kind 9000 grant emission, NIP-29 metadata signing, kind 0 profile lock, CORS handler, etc.) are kept private. The base [nosflare](https://github.com/Spl0itable/nosflare) project is MIT-licensed upstream; our changes layer on top in a private subtree and are not republished. The relay's authority model (panamia is the sole moderator, the relay key is the sole admin) makes the customization itself part of the security boundary — exposing the modified source would map our internal ACL surface for attackers without meaningfully helping the upstream ecosystem.

---

## Nostr Relay Sidecar (nosflare)

**Project:** [nosflare](https://github.com/Spl0itable/nosflare) — MIT licensed (panamia customizations not republished; see _Source-code disclosure_ above)
**Deployment target:** `relay.panamia.club` — separate Cloudflare Worker

### Why a sidecar, not bundled

The relay is deployed as an independent Cloudflare Worker rather than merged into `panamia-next` because it requires incompatible infrastructure:

|                 | panamia-next                       | nosflare relay           |
| --------------- | ---------------------------------- | ------------------------ |
| Database        | Hyperdrive → Supabase (PostgreSQL) | D1 (SQLite, CF-native)   |
| Protocol        | HTTP/HTTPS                         | WebSocket (long-lived)   |
| Durable Objects | None                               | WebSocket mesh, 9-region |
| CPU limit       | Default                            | Up to 300,000ms          |
| Cron triggers   | None                               | Daily DB maintenance     |

Relay event data (Nostr events, subscriptions) belongs in D1, not Supabase. D1 is co-located with the Worker (no network hop for writes), uses global read replication via the Session API, and keeps relay traffic isolated from core app data.

### Cloudflare Service Bindings

The two workers communicate via CF Service Bindings — internal calls that never touch the public internet (zero network hop, no egress cost, no auth required). Two bindings are needed, one in each direction:

```toml
# nosflare wrangler.toml — nosflare calls panamia-next (membership check)
[[services]]
binding = "PANAMIA"
service  = "panamia-next"
```

```jsonc
// panamia-next wrangler.jsonc — panamia-next calls nosflare (data retrieval)
"services": [{ "binding": "RELAY", "service": "nosflare" }]
```

---

## Membership Gating

### Prerequisite

Add `nostr_pubkey TEXT UNIQUE` (nullable) and `nostr_pubkey_source TEXT` (`'issued'` | `'byo'`) to the `profiles` table. The default path is **panamia-issued** at member onboarding (key custody via NIP-46 remote signer or equivalent — design TBD). Members may also **upload their own pubkey** ("BYO") after acknowledging a disclosure that cross-relay activity under the same key can be correlated with panamia group membership and may reveal real-world identity. See _Identity model_ under _NIP-29_ below.

### How it works

Nosflare's existing `hasPaidForRelay(pubkey, env)` function (called from the Durable Object on each event, with in-memory caching) is replaced with a membership check:

1. nosflare receives an event from a Nostr client
2. Checks in-memory cache (`getCachedPaymentStatus`) — if warm, free
3. On cache miss: calls `env.PANAMIA.fetch('/api/internal/relay/check?pubkey=[hex]')` via Service Binding
4. panamia-next queries Supabase via Drizzle: `profiles` where `nostrPubkey = hex AND active = true AND membershipLevel != 'free'`
5. Returns `{ allowed: boolean }`
6. Result cached in DO memory for the session lifetime

Membership logic stays in panamia.club. No Supabase credentials are exposed in the nosflare environment.

### New route required in panamia-next (called by nosflare)

```
GET /api/internal/relay/check?pubkey=[hex]
→ { allowed: boolean }
```

Provided by panamia-next, called by nosflare via `env.PANAMIA.fetch(...)`. Only reachable internally via Service Binding, not from the public internet.

---

## Data nosflare Can Expose

Every Nostr event has a plaintext envelope regardless of whether its content is encrypted:

```json
{ "id", "pubkey", "created_at", "kind", "tags", "content", "sig" }
```

`content` is encrypted only for certain kinds (DMs). The envelope — including timestamps, kind, and `tags` — is always readable.

### Encrypted vs. public by event kind

| Kind | Type               | Content   | Metadata visible to relay      |
| ---- | ------------------ | --------- | ------------------------------ |
| 0    | Profile metadata   | Plaintext | Yes                            |
| 1    | Short text note    | Plaintext | Yes                            |
| 4    | NIP-04 DM (legacy) | Encrypted | Recipient `p` tag visible      |
| 17   | NIP-17 DM          | Encrypted | Recipient `p` tag visible      |
| 1059 | Gift wrap (NIP-17) | Encrypted | Recipient **hidden** by design |
| 6    | Repost             | Plaintext | Yes                            |
| 7    | Reaction           | Plaintext | Yes                            |

The relay can report on **volume and type** of encrypted traffic but cannot decrypt content. Kind 1059 (gift wrap) was specifically designed to obscure even recipient metadata.

### Planned API endpoints provided by nosflare, called by panamia-next

panamia-next calls these via `env.RELAY.fetch(...)` (Service Binding). nosflare queries D1 and returns the result. These are not public HTTP endpoints.

**User stats** — for profile pages, "last active" indicators, and billing visibility:

```
nosflare provides:  GET /api/internal/user-stats?pubkey=[hex]
panamia-next calls: env.RELAY.fetch('/api/internal/user-stats?pubkey=...')
→ { last_seen: unix, bytes_transferred: 1048576 }
```

`bytes_transferred` should be tracked as a running byte counter in the Durable Object (which sees every raw WebSocket frame), flushed periodically to D1. This captures actual relay traffic regardless of event kind or content structure. **TODO: implement when instrumenting nosflare.**

**Public feed** — kind 1 posts for the social timeline:

```
nosflare provides:  GET /api/internal/feed?pubkey=[hex]&limit=20
panamia-next calls: env.RELAY.fetch('/api/internal/feed?pubkey=...')
→ [{ id, pubkey, created_at, content, sig }, ...]
```

panamia-next should verify signatures using `@noble/curves` before display.

**Contact graph** — kind 3 contact list `p` tags:

```
nosflare provides:  GET /api/internal/network?pubkey=[hex]
panamia-next calls: env.RELAY.fetch('/api/internal/network?pubkey=...')
→ { follows: ["hex", ...] }
```

Useful for "members you might know" features.

---

## Social Timeline Integration

### Polling (simple)

panamia-next calls nosflare's feed endpoint via Service Binding (`env.RELAY.fetch(...)`) at page render time. Works for profile pages and non-realtime feeds.

### Real-time (preferred for live feed)

panamia.club frontend connects directly to the relay as a Nostr client:

```
browser → wss://relay.panamia.club → live kind 1 event stream
```

A standard Nostr REQ subscription filtered to registered member pubkeys delivers the real-time feed without any custom API endpoints. Requires a small client-side Nostr library (~50 lines or a lightweight package).

---

## Privacy Considerations

Surfaces derived from relay metadata should be clearly communicated to users:

- **Last seen** reveals when a member was last active on the relay
- **DM volume** (kind 4/17 counts) reveals communication frequency, not content
- **Kind 4/17 `p` tags** reveal _who_ a user messaged, not _what_ was said — a known Nostr protocol limitation
- **Kind 1059** gift-wrapped messages are designed to hide all metadata; the relay cannot enumerate recipients

If panamia.club surfaces any of the above, users should understand it is derived from public relay metadata, not decrypted content.

---

## End-User Value Proposition

### Why a community relay matters to a non-technical member

**Their social presence doesn't disappear.**

Public relays shut down constantly, throttle storage, or evict old events without warning. This is the Nostr ecosystem's most under-discussed problem. Crucially, _Nostr clients do not reliably save content_ — they are viewers and publishers, not storage systems. When a member posts, the client signs the event and sends it to their configured relays. Clients may cache events locally for performance (Amethyst uses on-device SQLite, Primal has a backend cache), but these are ephemeral UX caches — device-specific, clearable, not a reliable archive. **The relays are the persistence layer.** If a member's relays disappear, their posts, followers, and social graph go with them. A community relay backed by an organization they are already a member of provides a credible guarantee that their data will be there tomorrow.

**A real identity that works everywhere.**

`name@panamia.club` as a NIP-05 identifier is verifiable in every Nostr client — the difference between sharing `npub14ctdq...` and sharing `maria@panamia.club`. Because it is backed by actual directory membership rather than self-assertion, it carries social trust that generic identifiers (e.g. `user@nostr.com`) do not. It is also portable — it works in Primal, Damus, Amethyst, and any future client, independent of panamia.club's own app.

**A spam-free community feed.**

Public relays are flooded with bots, scam accounts, and noise. A members-only relay guarantees that every post in the community feed comes from a verified member. This is a dramatically better experience for anyone new to the Nostr ecosystem.

**Key backup that doesn't exist elsewhere.**

Losing a Nostr private key means losing your identity, followers, and post history permanently — there is no recovery path in the base protocol. No major public relay solves this. The `/r` module's client-side encrypted key backup addresses the single biggest UX barrier to mainstream Nostr adoption. This alone is a meaningful reason for a member to use the panamia.club relay over public alternatives.

**A declared home relay — with an organisational commitment behind it.**

The Nostr base protocol (NIP-01) is deliberately silent on retention. Most public relays operate "best effort" — keeping content as long as storage allows, pruning without notice, shutting down without warning. There is no enforcement mechanism and no recovery path when a relay evicts events. The community-developed outbox model (NIP-65) was a direct response to this gap: users explicitly declare their "home relays" — the relays where their content is intended to live long-term. Nostr clients that implement NIP-65 know to fetch a member's posts from their declared home relay first. As of early 2026, clients with meaningful NIP-65 / outbox model support include:

- **Gossip** (desktop) — the reference outbox implementation, built around NIP-65 from the ground up
- **Amethyst** (Android) — one of the more complete mobile implementations
- **Coracle** (web) — strong outbox support
- **Snort** (web) — NIP-65 aware
- **Nostur** (iOS) — implements relay list metadata
- **Primal** (iOS/Android/web) — partial; its backend caching infrastructure (cache1.primal.net) somewhat sidesteps strict NIP-65 compliance
- **Damus** (iOS) — limited; historically slow to adopt the outbox model

Support quality varies significantly — "implements NIP-65" can mean anything from publishing a kind 10002 event to fully routing reads and writes through declared relays. This landscape is evolving quickly; verify against current client changelogs before making UX assumptions.

`relay.panamia.club` is designed to serve as members' home relay, backed by an explicit organisational commitment: **panamia.club commits to retaining member content for the lifetime of their active membership.** This is something no public relay offers. It transforms the relay from infrastructure into a membership benefit — a verifiable promise that a member's social presence is safe.

### The combined pitch to a member

> _Your community profile, your posts, and your identity — backed up, spam-free, guaranteed, and yours — accessible from any Nostr app._

---

## Prerequisites Summary

| Task                                                                       | Required for                   |
| -------------------------------------------------------------------------- | ------------------------------ |
| `profiles.nostrPubkey` + `nostr_pubkey_source` columns + migration         | Everything                     |
| Panamia-side key issuance flow (NIP-46 remote signer or equivalent)        | Default identity path          |
| BYO-pubkey upload form + correlation-risk disclosure acknowledgment        | Opt-in identity path           |
| `/api/internal/relay/check` route in panamia.club                           | Membership gating              |
| `/api/internal/relay/group-membership?pubkey=[hex]` route in panamia.club   | NIP-29 group ACL               |
| Service Binding in nosflare `wrangler.toml` (nosflare → panamia-next)      | Membership gating              |
| Service Binding in panamia-next `wrangler.jsonc` (panamia-next → nosflare) | Stats, feed, network graph     |
| nosflare internal API endpoints                                            | Stats, feed, network graph     |
| Signature verification via `@noble/curves`                                 | Displaying public posts safely |

---

## NIP-29: Relay-Based Groups

### Why NIP-29

panamia.club is a resilience network. Groups are the organisational primitive for emergency coordination — neighborhood watch, supply distribution, status reporting. NIP-29 (Relay-Based Groups) provides:

- **Membership enforcement** — the relay controls who can read and write to a group
- **Relay-signed metadata** — group name, description, member list, admin list are authoritative events signed by the relay's keypair
- **Standard event format** — group messages are ordinary Nostr events with an `h` tag, queryable by any NIP-29 aware client

### Privacy posture: public discovery, private content

| Surface                               | Visibility                                  | Rationale                                                                  |
| ------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| Kind 39000 (group name, about, pic)   | **Public** (subject to `discoverable` flag) | Members and prospective members can browse the directory of groups.        |
| Kind 39001 (admin list)               | **Members only**                            | Admin identities are not advertised externally.                            |
| Kind 39002 (member list)              | **Members only**                            | Required for offline mesh mode (members must see roster on cached state).  |
| Kind 39003 (roles)                    | **Members only**                            | Co-located with the rest of group internals.                               |
| Kind 9 / 11 / 10 / 12 (chat, replies) | **Members only** (read & write)             | Group content is private to membership.                                    |
| Kind 7 (reactions tagged `#h`)        | **Members only**                            | Reactions otherwise leak member presence.                                  |
| Kind 9021 (join request)              | Not broadcast                               | Joining is panamia-driven, not member-driven; see _Authority model_ below. |

**Group display names default to panamia screen names**, not legal names. Members opt in to surfacing their real name on a per-group basis, mirroring the existing Article feature's identity-disclosure model.

**`discoverable` flag**: groups whose _existence_ is sensitive (e.g. private support groups) are marked non-discoverable in panamia. The relay skips 39000 emission for those; members still reach them via direct `#h` queries using the group ID provided out-of-band by panamia.

**Sanitization**: 39000 `name`/`about` fields are sanitized at the panamia → relay boundary. Anything in those fields is global Nostr-public.

### Member-leak threat model

Group chat is **read-gated at the relay** but **not encrypted end-to-end**. A member who has legitimate read access can:

- Copy any kind 9/11 event and republish it to another Nostr relay. The signature is valid, the receiving relay doesn't enforce our NIP-29 ACL, and the event becomes publicly readable there. We have no protocol-level way to detect or prevent this.
- Screenshot, paste, or otherwise quote group content outside Nostr entirely.

DMs (kinds 4/17/1059) stay encrypted to the recipient regardless of where the event lands, so they are not part of this threat model.

**Realistic mitigations**: the practical defense is policy and trust, not cryptography.

1. A **narrow confidentiality clause** in the membership agreement: "you will not republish other members' group messages outside the panamia community without their consent." Clear assent via the existing clickwrap. Violation is grounds for membership termination. This is the single highest-leverage addition before group features scale.
2. **Set expectations in the `/r` privacy copy** — flag that the protection is policy, not cryptography. Better to surface this upfront than to handle it as a surprise after a leak.
3. **Account termination + revocation** is the fast lane; lawsuits against individual leakers are usually cost-ineffective unless the harm is substantial.
4. **DMCA takedowns** to the receiving relay if a leak goes to a public Nostr relay (every chat message is technically copyrighted by its author).
5. The current operator-can-read moderation model is what makes (1)-(4) enforceable — if we ever move to content E2E (see _End-to-end encryption_ discussion), the operator-side moderation half of the deterrent stack disappears with it.

**Standing**: by default only panamia (the contracting party) can sue under the confidentiality clause. Naming members as third-party beneficiaries would let them sue each other directly; that is unusual, can chill signups, and most communities never need it. Defer until concretely required.

**Scope discipline**: the clause must be narrow. Sweeping "never discuss anything you saw here, ever" language is likely unenforceable as overbroad. Tie it specifically to republication of other members' messages.

This subsection is design-only; the actual clause drafting belongs in `PRIVACY-ROADMAP.md` and should go through legal review.

### Authority model: panamia is sole source of truth

**No member admins _at the relay_.** All group state changes — creation, deletion, membership add/remove, metadata edits — reach nosflare exclusively from the panamia-next service via Service Binding. This materially simplifies the design:

- Client-published moderation kinds (9000, 9001, 9002, 9005, 9007, 9008, 9009) are **rejected** by nosflare regardless of author. No role-based write authorization is needed.
- Client-published 9021 / 9022 (join/leave requests) are accepted but treated as **advisory signals** to panamia, not as relay state changes. Membership only changes when panamia pushes the change.
- Kind 39001 (admin list) is emitted with the relay's own pubkey as the sole admin, since panamia speaks through the relay.

Panamia pushes membership and metadata changes to nosflare via a dedicated internal endpoint; nosflare regenerates the affected 39000/39001/39002 replaceable events under its own keypair.

**Members drive those changes through panamia** (`/r/groups`, added 2026-08-07). A member creates a group, sets it invite-only or open to all panas, invites by screenname, edits its name and description, and leaves — but every one of those is a write to panamia's tables, which the relay then reads. The relay's posture is unchanged: it still rejects every client-published moderation kind, still treats 9021/9022 as advisory, and still lists only its own pubkey in kind 39001. There is no relay-visible role and no NIP-29 role event (kind 39003 stays unused).

Panamia-side, the group creator holds two permissions — metadata edits, and invites to an invite-only group — recorded in `relay_groups.created_by` as a pubkey. This is deliberately **not** surfaced as an "owner" or "admin" role in the UI; members see the affordances, not a title. When the holder leaves, it passes silently to the longest-tenured remaining member, so a live group always has someone able to edit it. `created_by IS NULL` marks the hand-provisioned groups (`panamia-test`, `panamia-public`), which members cannot edit.

Two lifecycle rules live in `lib/relay/group-lifecycle.ts`, both applied after `matureGroupLeaves`, since maturation is what actually empties a roster:

- A group whose last member has left is deleted. Hand-provisioned groups are exempt — an empty one is a group nobody has joined yet.
- Creator rights are reassigned as described above.

Because leaves go through the 24h debounce, a group dissolves a day after its last member clicks leave, not immediately — the web path and the kind-9022 path deliberately share that timer so the relay's roster view never diverges from panamia's.

### Identity model

- **Default: panamia-issued pubkeys.** Keys are provisioned by panamia at member onboarding. This prevents cross-relay correlation of group membership via public posts on other relays — the default-safe path for non-technical members.
- **Opt-in: bring-your-own pubkey.** A member may upload an existing Nostr pubkey _after_ acknowledging an explicit disclosure: activity on other relays under the same pubkey can be correlated with their panamia group membership and may reveal real-world identity. The disclosure copy lives alongside the pubkey upload form. This unlocks NIP-65 outbox interop and lets existing Nostr users keep their identity, at a cost they have explicitly accepted.
- **Per-group display name**: defaults to the member's panamia screen name; opt-in to real name per-group, same model as the Article feature.
- Key custody (issued keys): NIP-46 remote signer or equivalent (design TBD; not blocking for the relay PoC). BYO-pubkey users self-custody.

### Canonical client: nostrord

The client side is **nostrord** ([github.com/nostrord/nostrord](https://github.com/nostrord/nostrord)) — Kotlin Multiplatform, NIP-29 native. We control the client choice; we do **not** need to design for compatibility with Primal, Damus, Amethyst, Chachi, 0xchat, etc. This narrows the protocol surface to what nostrord actually exercises.

A code audit of `external/nostrord` confirms the client is **relay-authoritative**: membership (`_groupMembers`) is derived purely from kind 39002 with no persistent local cache, admin status comes from kind 39001, and group existence comes from kind 39000. The client publishes 9007/9021/9022 but always waits for relay confirmation (39000/39002) before showing state. **There is no client-side state that fights back against relay-emitted truth.** The panamia-driven authority model maps cleanly onto what nostrord expects.

### NIP-29 event kinds

**Client-published, accepted by relay**:

| Kind    | Purpose           | Notes                                           |
| ------- | ----------------- | ----------------------------------------------- |
| 9 / 11  | Group chat / note | Tagged `["h", groupId]`. Members only.          |
| 10 / 12 | Replies           | Members only.                                   |
| 7       | Reaction          | Tagged `["h", groupId]`. Members only.          |
| 9021    | Join request      | Advisory; forwarded to panamia for review.      |
| 9022    | Leave request     | Advisory; forwarded to panamia.                 |
| 5       | Event deletion    | Author-only (delete own message); members only. |

**Client-published, rejected by relay** (with `OK false, "restricted: panamia-managed"`): kinds 9000, 9001, 9002, 9005-from-non-author, 9007, 9008, 9009.

**Relay-signed, parameterized replaceable**:

| Kind  | Content                               | Visibility   |
| ----- | ------------------------------------- | ------------ |
| 39000 | Group metadata (name, about, picture) | Public*      |
| 39001 | Admin list (relay pubkey only)        | Members only |
| 39002 | Member list (panamia-driven)          | Members only |
| 39003 | Supported roles                       | Members only |

\* subject to `discoverable` flag

### Ecosystem status (2026-04)

NIP-29 adoption remains early. Reference relay (fiatjaf's relay29, Go) was archived April 2026. With nostrord as the canonical client, panamia.club controls both sides of the protocol and is not blocked on third-party client adoption. Spec compliance is followed for future-proofing but is not a delivery dependency.

### Implementation in nosflare

**Scope summary** (PoC, ~2-3 weeks):

| Phase                                                            | Effort   |
| ---------------------------------------------------------------- | -------- |
| D1 schema (`groups`, `group_members`)                            | 0.5 day  |
| Panamia ACL hook (membership fetch on AUTH, stash on session)    | 1-2 days |
| Read gating (REQ-time filter narrowing + broadcast `Set.has`)    | 1-2 days |
| Write gating (member-only kinds, panamia-managed kind rejection) | 1-2 days |
| Relay keypair + 39000/39001/39002 signing + emission trigger     | 2-3 days |
| Panamia → relay push endpoint (membership / metadata changes)    | 2-3 days |
| CLOSED reasons (`auth-required`, `restricted`)                   | 0.5 day  |
| Tests (membership read/write, mention-leak, discoverable flag)   | 2-3 days |

**Schema additions** (D1):

- `tag_h` column on `events` table + `'h'` in the `event_tags_cache_multi` tag type index (enables fast group queries)
- `groups` table — `group_id`, `name`, `about`, `picture`, `discoverable BOOLEAN`, `created_at`
- `group_members` table — `(group_id, pubkey)` with `joined_at`, audit fields. **No roles column** (no member admins).
- _No_ `group_invites` table — invites are panamia-managed.

**Relay signing**: `RELAY_PRIVATE_KEY` stored as a Cloudflare secret. The relay signs kinds 39000-39003 with its own keypair using `@noble/curves/secp256k1` (already a dependency). These are parameterized replaceable events — nosflare's existing replacement logic (kinds 30000-39999) handles them automatically.

**Panamia → relay push**: a new internal endpoint on nosflare, called via Service Binding from panamia-next:

```
POST /api/internal/group-state
Body: { groupId, op: "create"|"update"|"delete"|"add-member"|"remove-member", ...payload }
```

On receipt, nosflare updates D1 and emits a fresh signed 39000/39001/39002 for that group. No webhook/polling needed; panamia drives all changes synchronously.

**Membership lookup on AUTH**: after NIP-42 AUTH succeeds, nosflare calls panamia (`/api/internal/relay/group-membership?pubkey=[hex]`) to fetch the user's `Set<groupId>`. Stashed on the WebSocket session struct. At <500 users we accept the per-handshake roundtrip and skip caching.

**Access control** (read path):

- **REQ-time filter narrowing**: when a subscription filter touches kind 9/7/10/11/12/39001/39002/39003, the server checks `session.groups` and rewrites `#h` / `#d` to the intersection. Empty intersection → `CLOSED <subId> "restricted"`.
- **Live broadcast**: `broadcastToLocalSessions()` adds one `session.groups.has(event.h)` check before dispatching private kinds.
- **Mention-leak prevention**: the `#h` membership check runs _before_ `#p` matching. A non-member subscribed to their own pubkey via `#p` will not receive a kind 9 from a group they are not in even if the message mentions them.
- **Public 39000**: no per-subscriber filter; emitted to all subscribers (skipped only for groups marked non-discoverable).

**Access control** (write path):

- Events with an `h` tag are rejected unless `session.groups.has(h)`.
- Kinds 9000/9001/9002/9007/9008/9009 from any client → `OK false, "restricted: panamia-managed"`.
- Kind 5 (deletion): author may delete own event in a group they belong to; otherwise rejected.
- Kind 9021/9022: accepted from any authed pubkey, **not stored as state**, forwarded to panamia (informational).

**Hide-entirely is deferred.** Public-read-of-group-names is the chosen PoC posture. Stub comments are placed at the three insertion points so a future "hide non-discoverable groups from non-members entirely" upgrade can be implemented without rediscovering the hot paths:

```ts
// durable-object.ts — broadcastToLocalSessions
// TODO(nip29-hide-entirely): for non-discoverable groups, skip kind 39000
// dispatch to sessions whose authedPubkey is not in session.groups.
```

```ts
// relay-worker.ts — REQ initial scan
// TODO(nip29-hide-entirely): if filter is kinds:[39000] with no #d, exclude
// non-discoverable groups unless the subscriber is a member.
```

```ts
// processEvent — kind 9 with mentions
// TODO(nip29-hide-entirely): mention-leak prevention currently relies on
// broadcast-side membership check; if hide-entirely is enabled, also strip
// outsider pubkeys from broadcast targets at REQ-match time.
```

**New module**: `src/nip29.ts` — all NIP-29 logic (relay signing, panamia push handler, metadata generation, membership queries, ACL helpers). Membership checks are designed as pure functions that work against either D1 or a plain roster object, so the module can be extracted for mesh relay use.

### Mesh mode — NIP-29 without internet

When infrastructure fails and members communicate over BLE/LoRa mesh, NIP-29 operates under three relaxed constraints:

1. **No membership changes** — the group roster is frozen at last-known state, cached on devices
2. **Non-globally synced threads** — mesh partitions develop independent message histories, merged when connectivity returns
3. **No relay-signed metadata** — kinds 39000-39003 are not generated (no relay private key available); clients use cached copies

**What stays the same for the user:**

- Same group, same name, same member list
- Type a message, nearby members see it
- Threaded replies work (`previous` tags provide causal ordering)
- Messages are authenticated (schnorr signatures verify sender identity)

**Architecture:**

```
Online:  App -> WebSocket -> relay.panamia.club (CF Worker) -> D1 -> broadcast
Mesh:    App -> WebSocket -> ws://localhost:4848 (local relay) -> roster check -> BLE/LoRa
```

The client connects to "a relay" over standard Nostr WebSocket protocol (REQ/EVENT/EOSE). In mesh mode, that relay is a lightweight local process using the same protocol but storing events in local SQLite and forwarding over mesh. The app needs minimal awareness of which mode it's in — the transport changes, the protocol doesn't.

**Packet size:** A minimal NIP-29 group message is ~300+ bytes; LoRa max is ~250 bytes. Mitigations include BLE for local (higher bandwidth), LoRa for long-range (compressed/fragmented), and compact binary wire format reconstructed to valid Nostr JSON on receipt.

**Recovery:** Events created during mesh mode are valid signed Nostr events. When internet returns, the local relay syncs them to `relay.panamia.club`. They merge into D1 as legitimate group history. The relay regenerates metadata events (39000-39003) to reflect current state.

**NIP-26 delegation was considered** for authorizing mesh nodes to sign on the relay's behalf, but it is marked "unrecommended" by the Nostr community and not widely implemented. The freeze-and-cache approach is simpler and sufficient.

**Prior art and open proposals (Nostr-over-BLE/LoRa).** No shipping NIP-29 client currently implements Bluetooth or LoRa mesh, and there is no finalized NIP for offline event transport. The relevant discussion lives in a few places — verify links against the current state of those repos before citing externally, as some threads are stale:

- [nostr-protocol/nips](https://github.com/nostr-protocol/nips/issues) issue tracker — periodic threads on offline-first Nostr, BLE event exchange, and store-and-forward; no PR has landed
- Amethyst's [github.com/vitorpamplona/amethyst](https://github.com/vitorpamplona/amethyst) issue tracker — early experiments with BLE-based npub/contact exchange, unrelated to event-stream mesh

Because the upstream Nostr design is unsettled, our roadmap's local-relay-as-gateway approach is deliberately a wrapper around standard Nostr WebSocket — whatever the ecosystem eventually picks for mesh framing can be implemented inside the gateway without touching the panamia client surface. **LoRa scope of work is genuinely unknown today**: the packet-size mismatch above is a known constraint, but the rest (radio licensing, antenna handoff, multi-hop forwarding semantics, sync conflict resolution under long partition windows) needs design work we have not started.

### Abuse reporting

Secure comms does not grant blanket anonymity. Every event on the relay is signed by an authenticated pubkey tied to a panamia.club member account (via `profiles.nostrPubkey`). This is a deliberate design choice: the relay provides encrypted transport and membership-gated access, but the operator retains the ability to identify who posted what and to act on abuse reports.

**Report intake:**

- In-app abuse report button on any group message, routed to a monitored queue (not a shared inbox)
- Public abuse report form on the panamia.club website — accessible to anyone, not just members (e.g. a non-member who received forwarded content or a law enforcement contact)
- Reports include the event ID, event pubkey, group ID, and reporter's account (or contact info for external reports) — sufficient to identify the content, the author, and the context
- Content removal is performed by panamia (the sole authority): panamia issues a delete via the relay's internal `/api/internal/group-state` endpoint, which removes the event from D1. Member-published kind 9005 deletions are limited to the author's own events.

**Processing requirements:**

- Every report receives a response within 48-72 hours
- CSAM reports trigger the mandatory preserve-then-report workflow: preserve the content, report to NCMEC via CyberTipline, terminate the account, retain records. Deletion happens _after_ NCMEC reporting, not before.
- Sex trafficking reports are escalated to a designated handler with law enforcement contact information
- General abuse (harassment, spam, threats) follows a warn/suspend/ban escalation with documented decisions

**Why this matters for NIP-29 groups specifically:**

- Private groups (read-restricted) are not a shield from moderation — the relay operator can always read group content because the relay stores events in plaintext (content encryption is per-event, not per-group)
- There are no member admins. All moderation authority lives with panamia, exercised through the relay's internal control plane. The relay operator can remove any event from D1 and revoke any member's access.
- The membership-gated model means every author is a known member, not an anonymous public poster — abuse attribution is straightforward

**Mesh mode considerations:**

- During mesh operation, abuse reports queue locally and sync when connectivity returns
- Events created during mesh mode are signed and attributable — the same pubkey-to-member mapping applies
- Moderation actions (event deletion, member removal) cannot be enforced across mesh partitions until the relay is reachable, but they apply retroactively on sync

---

## NIP-104 (MLS) Transport Policy

NIP-104 (a.k.a. NIP-EE) defines end-to-end encrypted group messaging on Nostr using the IETF MLS protocol. Unlike NIP-29, MLS groups are **cryptographic**, not relay-managed: membership is enforced by who holds group keys, not by the relay's ACL. The relay's role for MLS is moving ciphertext between member pubkeys — nothing more.

### What the relay does and does not do

- **Does not** authorize group membership — the relay cannot read MLS state and has no way to know who is in which group.
- **Does not** validate MLS protocol messages — they are ciphertext.
- **Does** gate KeyPackage publication (kind 443) and KeyPackage Relay List (kind 10051) by panamia membership, so only members advertise MLS identities through this relay.
- **Does not** gate gift wraps (kind 1059), which carry MLS Welcomes (kind 444) and Group events (kind 445). This bypass is the same one used for NIP-17 DMs (`external/nosflare/src/durable-object.ts` — kind 1059 skips the membership check): non-members must be able to deliver encrypted messages to members.

### Why this asymmetry is correct

A panamia member can use `relay.panamia.club` as their advertised MLS endpoint (KeyPackage discovery). Anyone — member or not — can then encrypt a Welcome or group message _to_ that member and post it as a gift wrap. The relay sees only opaque envelopes addressed by `p`-tag. This matches how Signal-style messaging works on Nostr: the inbox is open, the contents are private.

### What "limit to panamia members" means for MLS

The front-door gate (panamia membership) controls _who can advertise MLS identity through this relay_, not _who can be in a group via this relay_. Two panamia members can form an MLS group that includes a non-member; the non-member just receives the gift wraps via some other relay. The relay cannot prevent this, and there is no reason to try.

### Operational items deferred

- **KeyPackage staleness** — kind 443 events accumulate as members rotate device keys; stale KeyPackages cause failed invites. A cron prune of old KeyPackages per pubkey is deferred until usage data warrants it.
- **Gift-wrap retention** — kind 1059 volume scales with MLS Commit rate; the daily D1 maintenance cron may need MLS-aware retention rules once adoption is non-trivial.
- **Rate-limit posture** — kind 1059 is currently exempt from per-pubkey rate limits (`external/nosflare/src/config.ts` — `excludedRateLimitKinds`). Revisit if MLS traffic gets chatty.
- **Spec drift** — kind numbers above reflect the current NIP-EE draft (PR #1427). If the draft renumbers KeyPackage / KeyPackage Relay List before merge, update `config.ts` and this section.

### Client landscape (2026-05)

The active client for MLS-on-Nostr (NIP-EE / Marmot) is [White Noise](https://www.whitenoise.chat) ([source](https://github.com/parres-hq/whitenoise)). Most other Nostr clients that expose a "private group" feature today are using NIP-17 chat rooms instead — encrypted with the sender's long-term identity key, which means a key compromise unlocks the history retroactively and traffic volume grows with group size.

Both NIP-17 chat rooms and MLS travel as kind 1059 gift wraps from the relay's point of view, so the relay already carries today's encrypted-group traffic without modification. The only MLS-specific relay work — member-gated KeyPackage (kind 443) and KeyPackage Relay List (kind 10051) emission, described above — is harmless to leave configured for the future. As MLS adoption grows, no relay change should be needed.

---

## Future Considerations

- **NIP-05 identity** (`username@panamia.club`) — panamia.club could serve `/.well-known/nostr.json` mapping member usernames to their registered hex pubkeys, giving members a verified Nostr identity tied to their directory profile
- **ActivityPub bridge via a dedicated public group** — panamia already has `social_actors` and partial ActivityPub infrastructure. Rather than an in-band `!public` prefix on individual messages (mixes private + public traffic on the same group, leaks on typo), the planned UX is a dedicated NIP-29 group (e.g. `panamia-public`) explicitly marked as bridged in its 39000 metadata. A worker subscribes to kind 9/11 events with `#h=panamia-public` and republishes them as ActivityPub Notes via the author's `social_actors` row. Bridge participation is itself opt-in (join the group); revoking the bridge means leaving the group, no custom flow.
- **Mesh relay implementation** — lightweight Nostr relay for mobile/embedded devices, using the `nip29.ts` pure-function membership checks against a cached roster, forwarding events over BLE/LoRa
- **Primal NIP-29 support** — lobby PrimalHQ to add NIP-29 group support; if adopted, panamia.club groups become accessible from a mainstream Nostr client without a custom UI
