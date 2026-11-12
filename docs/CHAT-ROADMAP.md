# Chat — Design & Roadmap

> **STATUS**: **DM and native group chat are implemented in the repository.** DMs use the existing
> direct-status store. Groups use `social_group_chat_messages` and existing active memberships.
> Both use the authenticated actor mailbox at `/ws/dm`. Apply migration `0074_social_group_chat`
> before deploying group chat. Event chat and the generic room/socket design below remain proposals.
>
> **E2EE direction selected (2026-11-10):** build Pana-owned encrypted messaging
> on the existing backend, using a standard protocol and a maintained implementation.
> Matrix is not the selected architecture. Production chat is still server-readable;
> the existing encryption lab is not a rollout. See the
> [Pana-owned E2EE implementation plan](#pana-owned-e2ee-implementation-plan).
>
> **Decided (2026-10), by the product owner:** chat replaces the mail experience, and it is scoped
> to **three** room types — direct messages between panas, rooms inside **groups**, and rooms inside
> **events**. That answers the question this document previously called _"blocks everything else"_.
> See [The three scopes](#the-three-scopes).
>
> **Also decided: only signed-up members can access chat.** Anonymous email RSVPs and inbound Nostr
> RSVPs stay in events but are not in event rooms — see
> [Event rooms admit signed-in attendees only](#event-rooms-admit-signed-in-attendees-only). With
> that, nothing in this document is blocked on a product decision.
>
> **What "replace the mail" does and does not mean.** It retires the mail _interface_ — the
> `/updates` inbox/sent tabs and the refresh-to-see-a-reply model panas are complaining about. It
> does **not** retire the direct-status _substrate_ underneath DMs, because four shipped things ride
> it and one of them is the safety gate from `docs/SOCIAL-GRAPH.md` §C1. See
> [What replacing mail costs](#what-replacing-mail-costs), which is the section to read before
> arguing for a cleaner teardown.
>
> This material was extracted from `docs/GROUPS-ROADMAP.md`, where it was originally phase 5. Groups
> originally shipped without it; native group chat is now described below.

## Table of Contents

- [Pana-owned E2EE implementation plan](#pana-owned-e2ee-implementation-plan)
- [Hosted staging environment plan](#hosted-staging-environment-plan)
- [Overview](#overview)
- [Current Messages workspace](#current-messages-workspace)
- [Current group chats](#current-group-chats)
- [The three scopes](#the-three-scopes)
- [What replacing mail costs](#what-replacing-mail-costs)
- [DMs expire after thirty days](#dms-expire-after-thirty-days)
- [Storage — one transport, two stores](#storage--one-transport-two-stores)
- [The authorization gate](#the-authorization-gate)
- [Event rooms admit signed-in attendees only](#event-rooms-admit-signed-in-attendees-only)
- [Realtime delivery is not realtime affordances](#realtime-delivery-is-not-realtime-affordances)
- [Path A — live delivery on the mail substrate](#path-a--live-delivery-on-the-mail-substrate)
- [Why Nostr Cannot Back In-App Chat](#why-nostr-cannot-back-in-app-chat)
- [Precedent — SignalingRoom](#precedent--signalingroom)
- [Proposed Design](#proposed-design)
- [Schema](#schema)
- [Do Not Copy The Signaling Auth Model](#do-not-copy-the-signaling-auth-model)
- [Roadmap](#roadmap)
- [Risks & Open Questions](#risks--open-questions)

---

## Pana-owned E2EE implementation plan

**Status: disabled-by-default product implementation; not activated in production.**
The product owner selected this direction on 2026-11-10. It supersedes the
earlier Matrix evaluation, not the existing plaintext chat implementation.
No Matrix server, paid service, new cryptographic protocol, or automatic
production activation is part of this implementation.

**Implementation checkpoint:** P1 has a pinned OpenMLS 0.9.2 Rust/WASM
boundary, checked upstream provider snapshots and independent-peer
interoperability. P2-P7 now include account-bound devices, ciphertext
delivery, membership, private media, recovery and the existing Messages UI.
The real product client is exercised against actual API handlers with
synthetic accounts, not just the original protocol lab. The
[engine documentation](../crypto/openmls/README.md) records dependency/advisory
decisions, wire/local-state boundaries and audit exclusions. Android Keystore
instrumentation and the real Android 16/WebView 133 product client pass
cold process restart and background/foreground checks. [Source-verified macOS
CI](https://github.com/panamiaclub/panamia.club/actions/runs/43080471724) also passes
the iOS simulator build, unsigned device archive and actual Keychain/product-client
setup, cold restart and foreground delivery. Supported physical-device qualification,
operational review and independent security review remain release
gates. `CHAT_E2EE_ENABLED` stays `0`; no real messages have been migrated.

### Confirmed scope and boundaries

- Encrypt private DMs and members-only group chats, including message media.
  Preserve the current text/photo/GIF experience and supported media formats.
  Audio/voice content must not get a plaintext bypass; bringing back a retired
  recorder or adding live calls is not part of this work.
- New group members get messages sent after joining, not automatic access to
  earlier history. A person's own verified replacement device is a different
  case and can restore retained history.
- Provide encrypted backups protected by a user-held personal recovery key.
  Account sign-in alone must not decrypt old conversations. Pana gets no
  administrator master decryption key.
- Reuse Workers, Postgres, R2 and the authenticated actor mailbox. Keep the Pana
  interface, existing account system, profile identities, consent requests,
  blocking, group roles and membership authorization.
- Public posts, stories, directory content and their ActivityPub behavior remain
  outside this encryption change. Event rooms and new messaging features are
  outside the initial encrypted release.

**Proposed rollout defaults:** start with compatible Pana clients only.
Do not silently fall back to plaintext for an external or outdated client.
Label existing server-readable history as legacy and keep it separate; do not
delete it, call it retroactively encrypted, or revive expired messages.
Preserve the current 30-day visibility rule while explicitly specifying new
ciphertext, media, backup and legal-preservation retention before launch.
Changing legacy deletion policy requires a separate product decision.

### Architecture

The client owns encryption, decryption, secret state and recovery secrets.
The backend owns authentication, access policy, public device/key-package
distribution, ordered opaque delivery, encrypted-object storage and quotas.
Cryptography does not replace authorization on any read or write.

Use MLS (RFC 9420) for asynchronous two-person and group conversations.
**Qualify OpenMLS first**, including the exact release, crypto provider,
storage format and browser/native bindings. Its
[published SRLabs audit](https://blog.openmls.tech/posts/2026-05-27-independent-audit/)
is evidence for the audited scope, not automatic approval of every later release
or a new WASM bridge. Upstream
[platform coverage](https://github.com/openmls/openmls#supported-platforms)
lists WASM/iOS/Android as built but not tested. Prove our target configurations.
Use a supported standard cipher suite with experimental features disabled.

The [existing lab](../prototypes/e2ee/README.md) supplies useful behavior scenarios,
not the production engine, identity authority or approved device state.
Do not promote its unaudited `ts-mls` dependency or manual trust model into
production. If OpenMLS does not qualify, evaluate another maintained MLS
implementation; do not invent cryptography or switch to Matrix without a new
architecture decision.

Add versioned, chat-only encrypted storage for device credentials, single-use
key packages, room/event metadata, opaque messages, private media ownership
and encrypted backups. Reference existing actors/groups instead of creating a
second authoritative social membership system. Final schemas follow engine
qualification. Use journaled Drizzle migrations, server-only database access,
RLS and the privacy data inventory.

This is not a plaintext mirror into a second store. The existing
`socialStatuses` and `social_group_chat_messages` remain legacy data paths;
new encrypted messages must never also be written there as readable text.
The "Storage" and mail-substrate sections below describe the current system,
not an instruction to dual-write encrypted conversations into that system.

### Work packages and dependencies

| Phase                                      | Deliverable                                                                                                                       | Completion evidence                                                                                                                                                                                                                            | Prerequisites  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| P1. Engine and platform qualification      | Pin and wrap a reviewed MLS implementation; specify threat model, wire versions and local state contract.                         | Independent peers exchange private messages/commits; conformance, tamper, replay, join/removal and persistence cases work in browser engines, with real Android/iOS capability probes. Record native build prerequisites and remaining limits. | None           |
| P2. Profile identities and devices         | Account/profile-bound credentials, approved devices, key-package lifecycle, verification, revocation and ownership rules.         | Forged/stale identity selections cannot register or send as another profile. Login alone cannot substitute a trusted device key. Personal/business identities and manager revocations stay isolated.                                           | P1             |
| P3. Ciphertext delivery backend            | Private room/event APIs, ordered log, idempotency, device authorization, quotas and mailbox invalidations.                        | Independent authorized clients deliver only opaque frames. Unauthorized reads/writes fail; simultaneous commits cannot create competing accepted room epochs; retries return the accepted envelope without duplicate messages.                 | P1, P2         |
| P4. Membership and consent synchronization | Connect MLS membership to Pana DM gates, group roles, joins, removals, blocks and device revocations.                             | New members cannot decrypt earlier messages; removed/revoked devices cannot decrypt future ones, even when they ignore removal. Offline membership changes never permit sends under stale access.                                              | P2, P3         |
| P5. Encrypted media                        | Encrypt files and sensitive metadata before upload; private R2 binding and authorized delivery.                                   | Relay/storage objects reveal neither file contents nor decryption keys. Wrong-room access, tampering, copied URLs, exact upload limits and cleanup behave correctly.                                                                           | P3             |
| P6. Durable state and recovery             | Atomic local state/outbox, cross-tab coordination, native key protection, encrypted backup and fresh-device recovery.             | Crash/retry/upgrade cases do not reuse message keys. Recovery restores retained history without cloning live device/ratchet state or reactivating a revoked device. Expired history stays expired.                                             | P2, P4, P5     |
| P7. Product integration and reporting      | Wire all private-message entrypoints, inbox/threads, media, device/recovery UX, explicit report disclosure and legacy boundaries. | The actual web/native apps handle success, missing keys, pending membership, failures and profile switches explicitly, without plaintext fallback or content leaks. Existing consent/block/delete behavior is preserved.                       | P3, P4, P5, P6 |
| P8. Release qualification                  | Adversarial integration coverage, performance/usage measurement, independent review, fixes and staged activation.                 | Release criteria below pass; affected users/clients have explicit supported states; production claims match what is actually enabled.                                                                                                          | P7             |

P4 and P5 can proceed independently once their prerequisites are ready.
Validation belongs in every package, not only P8. Independent review is a
**production release checkpoint**, not a requirement to stop all development
while looking for a reviewer.

### Security-critical implementation rules

**Bind identities explicitly.** Reuse `requireProfileAccess` and existing
ownership/membership rules, but encrypted requests must name and validate
their profile, actor and device consistently. A stale active-profile cookie
must not redirect a queued encrypted send to the personal-profile fallback.
Do not change unrelated editors' existing fallback behavior. Do not reuse the
server-held ActivityPub signing private keys as E2EE device keys.

**Approval is not just login.** Specify the profile trust root, device
approval/delegation, visible key-change verification, recovery authorization,
and ownership-transfer rules before enrollment ships. Define business-manager
history delegation explicitly; a server-side role change must not silently
export personal keys or install a trusted device. A lost-key identity reset
must be visible to peers, not an administrative way to unlock old messages.

**Order membership changes safely.** Persist room revisions and expected MLS
epochs transactionally. A removal/revocation must put affected rooms into a
rekey-required state until a remaining authorized client commits the new
membership. Reject new application frames under the old access state,
including offline queued frames. Show "secure membership update pending"
instead of falling back. Process authorized protocol-control events even
when the UI hides a blocked author's ordinary messages. No server private
room key is introduced to make offline changes easier.

**Persist before publish.** Serialize all operations touching a device's
ratchet, across tabs/processes as applicable. Commit changed crypto state and
the exact outgoing envelope atomically before transmission. Network retries
reuse that envelope, not the old key. If a stale-epoch attempt is rejected,
process the new state and create a fresh encryption attempt without rewinding
the ratchet. Bind retries and room/profile identifiers to the authenticated
payload. Version local storage migrations; never silently wipe keys after an
upgrade or clone live state onto a replacement device.

Bind roster changes to authorized membership intent and approved profile/device
credentials. Receiving clients must validate that binding rather than accept
every cryptographically valid MLS proposal. A server-supplied device list is
not, by itself, permission to insert an unseen participant. Define initial
trust, peer verification and identity-reset limits explicitly.

**Keep media private throughout.** The current photo upload and GIF mirroring
paths deliver readable media and must not be used unchanged for encrypted
messages. Keep public-post uploads separate. Use a private R2 bucket/binding,
not a supposedly private prefix in the existing public bucket. Encrypt media
and its sensitive manifest on-device; carry its key only inside the encrypted
message. Enforce server-side ownership, ciphertext limits, quotas and expiry
as well as client-side file validation. Public GIF discovery is not made
anonymous by encrypting the selected file.

**Recovery is a separate format.** Document exactly which retained history,
media keys and identity-authorization material a backup contains. Protect it
with a user-held high-entropy secret, authenticated version/profile context
and a reviewed encryption format. Do not restore an old live MLS state,
device identity, message counter or send queue as if it were the replacement
device. Re-enroll with fresh device keys and current room authorization.
Account recovery without the recovery secret cannot become a hidden
message-decryption backdoor. Keep backup expiry and legal holds consistent
with the declared retention policy.

**Cover every write path.** Updating `/messages` alone is insufficient.
Audit standalone group chat, profile/deep-link entrypoints, media hooks,
generic direct-status creation, multi-recipient API sends and any legacy
reply paths. After encrypted activation, server-side guards must refuse
plaintext private writes for that scope, including from old clients.
Preserve ambiguous DM refusals and quiet held requests. Do not add a new
composer or revive a removed feature merely to exercise encryption.

**Avoid secondary plaintext copies.** Render and sanitize decrypted content
on-device. Keep previews/search local. Exclude message bodies, recovery
secrets and private keys from SSR, logs, analytics, crash reports, server
notifications and shared caches. Maintain strict profile cache/draft
boundaries. Metadata such as participants, device IDs, timestamps and sizes
remains observable; do not promise anonymity or protection against a
compromised endpoint or malicious client code.

**Reporting is an explicit exception.** Extend the existing safety workflow
with a participant-approved, limited readable message selection and context.
Do not disclose full conversations or private keys. Keep report access
restricted and audited, and report text out of notification emails.
Do not introduce report media uploads, automatic server decryption or
content-scanning bots as an encryption shortcut. Staff response, legal
preservation and reporting procedures remain separate operational work.

### Implemented product contract

`lib/e2ee/chat-client.ts` is the account/profile-bound client. It uses the
checked Rust/WASM engine, not the reference `ts-mls` lab. Device approval uses
a separate owner-held authorization key, not the server's ActivityPub key.
Requests bind the exact profile, actor, device, route, body and current
device-state hash. A stale selection or restored/copied live snapshot fails
closed. Local snapshots, exact outboxes, encrypted history and ciphertext
files commit atomically before publication; server checkpoints contain hashes,
never live private state.

The existing DM workspace, inbox, standalone group chat, photo/GIF composer,
transcript and profile/deep-link entrypoints share the encrypted path.
Encrypted text renders as text, not untrusted HTML. File manifests and keys
travel only inside authenticated encrypted messages; file objects use the
separate private R2 binding. Photos are re-encoded locally before encryption;
GIF discovery still contacts its public provider. Supported private files are
at most 10 MiB each (four protocol attachments; the current composer retains
its photo/GIF controls). The unrelated 200 MiB public-video path is not a
private-video guarantee.

Enabling a profile requires saving its personal key and an encrypted identity
backup. **History backups are an explicit per-conversation action**, not a
promise of automatic continuous recovery. Messages since the last saved
backup cannot be recovered after device loss. An approved manager without an
owner's authorization key gets a separate personal history key; approval does
not disclose a colleague's key or history. Another device must enter the
existing personal key to open that user's retained backups. Recovery restores
history/media authorization, not old devices, counters, send queues or MLS
ratchets. Backup indexing is paginated.

Losing every key does not unlock old messages. An owner can explicitly
acknowledge a last-resort identity reset, save a new key and revoke all old
devices (at most once per 24 hours). This changes the public trust root,
discards the resetting device's local live/cache state and forces peers to
verify the changed identity. Old retained backups still require their old
personal keys. Owner removal/demotion or personal ownership transfer freezes
the identity until a current owner performs this visible reset; it does not
silently promote an editor into cryptographic authority. A fresh signed room
session is allowed only after every old approved cryptographic participant is
gone, or an empty setup times out. It cannot replace a functioning participant
just because another device is offline.

Persistent actor/group latches reject plaintext private writes even when the
rollout flag is paused. Legacy history remains separately labelled and
server-readable. Rejected/failed legacy chat writes return bounded errors;
SQL parameters containing rejected text or attachment details never go to
the framework logger, including activation races caught by the database latch.
Public social upload callers mark `social-post`; legacy chat
uploads name their target and are refused for encrypted scopes. Once any
encrypted scope exists, old unmarked upload clients must update rather than
publish a private file before their message is refused. Ordinary posts and
stories remain outside E2EE. Compatible Pana clients are required; external
ActivityPub DMs do not receive a plaintext downgrade.

Mailbox broadcasts contain only room/type/timestamp invalidations. Held
requests stay quiet, and encrypted mailbox delivery rechecks current profile
users rather than sending to a removed manager's old socket. Cached history
revalidates visibility without making temporary mutes permanently destroy it.
Reports can include one bounded, explicitly consented text excerpt; that
unverified quotation stays in the restricted safety record, never in email.
No report attachment or file/recovery-key disclosure is introduced.

### Retention, rollback and supported clients

- Messages disappear after their authenticated 30-day deadline. Scheduled
  maintenance removes expired/deleted application ciphertext while retaining
  ordered tombstones and active MLS control data for offline catch-up.
  Author deletion purges that author's application frames and media access;
  deleting a DM participant closes the room immediately. Scheduled cleanup
  deletes permanently closed rooms and their remaining protocol records,
  encrypted files and room backups; active-room ordering/control data stays intact.
- Bound media expires with its message; unbound reservations expire after one
  day. Private-object deletion work survives FK cascades and failed R2 deletes.
  The scheduler runs even when encrypted sending is paused. Legacy plaintext
  DM physical-deletion policy is unchanged.
- History backup objects expire 30 days after backup creation (or when their
  conversation/group is deleted), independently
  of per-message visibility. Recovery never resurrects expired entries. Identity
  backups persist until replacement or account/profile deletion. Reset versions
  have separate history slots so a new key does not overwrite the old retained
  copy before recovery.
- HTTPS, Web Crypto, IndexedDB, Web Locks and bounded-request support are
  required. Unsupported browsers/system WebViews show an update requirement.
  Native apps additionally require the protected-storage plugin, an explicitly
  trusted first-party origin and device-bound wrapping. There is no native-to-web
  key fallback. Android excludes OS backup/transfer; iOS uses
  `WhenUnlockedThisDeviceOnly` non-synchronizable Keychain material and excludes
  WebKit live state from OS backup.
- Rebuild the pinned engine with `yarn openmls:build`, then use
  `yarn build:encrypted` for an encryption-capable deployment. Missing, partial
  or stale artifacts cannot become another crypto implementation. Ordinary
  non-E2EE builds can omit the engine and explicitly refuse encrypted operations.
  A deployment rollback may pause sending, not clear the transport latches.

### Isolated full-application pilot

`yarn e2ee:staging` runs the built application, actual Better Auth magic-link
sessions, a fresh PostgreSQL 16 cluster and local-only private R2/DO/KV bindings.
It is **local staging, not a hosted/public beta**. Production remains disabled;
production database credentials, Cloudflare accounts and email delivery are not
needed. Use synthetic data only.

Build the pinned engine as documented in `crypto/openmls/README.md` and supply
an installed PostgreSQL 16 binary directory. A Windows example is:

```powershell
$pilot = Join-Path $env:TEMP 'e2ee-staging-196'
yarn e2ee:staging setup --directory $pilot --postgres-bin 'C:\tools\pgsql\bin'
yarn e2ee:staging check --directory $pilot
yarn e2ee:staging serve --directory $pilot
```

`setup` refuses an existing output directory and snapshots the current source
outside the worktree. Only the snapshot receives a generated allowlisted Worker
config with encryption enabled. It reuses installed dependencies/qualified WASM
and references the protected upstream checkout without inspecting or copying it;
normal build output, `wrangler.jsonc`, `.env.local` and `.dev.vars` are untouched.
Subprocesses receive generated auth/database credentials and a separate config
home, not inherited production/provider secrets. The database is loopback-only,
uses a fresh non-default port and must prove its per-run ownership marker before
seeding, reset or login. Schema replay follows the migration journal and records
the applied hashes. No shared cluster or production migration command is used.

`check` resets only the labelled `check-*` synthetic accounts; manual `demo-*`
accounts are separate. It blocks non-local browser HTTP/WebSocket requests,
disables traces/screenshots/video and closes its own Worker/database processes.
`pilot-results.json` contains metadata, not message bodies or keys. The private
`pilot.json`, generated config, browser failure context and database/object
directories must never be committed, published or uploaded as CI artifacts.
The CI job publishes only the metadata report, not this private directory. Each
check removes the previous report first; a failed check cannot leave a stale
success report.

`serve` starts the same isolated resources for manual checks; stop it with
Ctrl+C. In another terminal, generate a five-minute, single-use synthetic login:

```powershell
yarn e2ee:staging login --directory $pilot --account demo-alice
yarn e2ee:staging login --directory $pilot --account demo-bob
```

Open these in separate browser profiles, not tabs sharing a cookie jar.
Enrollment and local recovery-key handling use the normal UI. Never use the
production-oriented seed/sign-in scripts or a remote-database override to make
this pilot work. Source changes require a fresh `setup` directory so the tested
snapshot and schema remain explicit. A local sample is not a production
throughput/billing estimate, physical-device proof or independent review.

### Hosted staging environment plan

**Status: deployment wiring implemented; hosted provisioning is blocked on
verified isolated Supabase access. Nothing is deployed.** Build one temporary,
restricted HTTPS environment using the existing Cloudflare/Supabase accounts.
This is not a second production stack or approval to activate real chats.
Keep production `CHAT_E2EE_ENABLED` at `"0"` and the implementation PR unmerged.

Read-only inventory confirmed `panamia-media`, `panamia-media-preview`,
`panamia-chat-private` and `panamia-chat-private-preview` already exist. Public
`r2.dev` access is disabled on the private preview bucket. The visible KV
namespace is the existing `VINEXT_KV_CACHE`; do not reuse it for staging.
GitHub already has `Preview`, `Production` and `ios-release` environments, but
`Preview` currently has no environment secrets or protection rules. A preview
label, a `preview_bucket_name`, or a version of the production Worker is not
proof of database, storage or credential isolation.

#### Proposed resource layout

| Surface                 | Hosted staging choice                                                                                                       | Required boundary                                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web app                 | Separate Worker, proposed name `panamia-staging`; proposed HTTPS host `staging.panamia.club`                                | Not a version/route of `panamia-next`. Verify cookie-domain isolation before choosing the hostname; use a separate preview origin if production domain-wide cookies would be exposed.                                                      |
| Database                | Reuse an unused, isolated nonproduction Supabase/Postgres project if available; otherwise approve a dedicated project       | Never production's database, public schema, connection string or a copy of member chats. Verify project identity independently, including pooler project/user identity, before creating a staging ownership marker or applying migrations. |
| Storage                 | Reuse the existing preview buckets only after confirming exclusive nonproduction use; otherwise create staging-only buckets | Same application binding names, different resources. Private chat storage has neither public development URLs nor public custom domains. Do not clear a shared preview bucket.                                                             |
| Cache and live delivery | New staging KV namespace; the existing DO classes deployed under the separate staging Worker                                | Do not bind production cache IDs or production-script Durable Objects.                                                                                                                                                                     |
| Authentication          | New Better Auth secret, host-only staging cookies and a distinct cookie prefix; controlled test accounts                    | Build-time `NEXT_PUBLIC_HOST_URL`, runtime `BETTER_AUTH_URL`, callbacks and native origin agree. Staging identity/federation domain is not production's domain.                                                                            |
| Access                  | Restricted tester/reviewer access; prefer Cloudflare Access if available                                                    | Check email-link sign-in and WebSocket upgrades in browsers and native WebViews. Automation credentials belong only in protected CI, never in shipped JavaScript or phone builds.                                                          |

#### Implementation phases

| Phase                             | Work                                                                                                                                                                                                      | Completion evidence                                                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Confirm reuse and approvals    | Inventory existing nonproduction Workers, bucket bindings, Supabase projects, cookie scope and deploy/DNS permissions. Decide whether a new database or Access plan is needed.                            | Recorded resource IDs and isolation boundaries, with any incremental spend approved before creation.                                                                                   |
| 2. Build the hosted configuration | Add a dedicated staging config/build path and staging ownership checks. Replay the migration journal into the verified empty test database and seed separate manual/automated accounts.                   | Build metadata identifies the exact source and qualified WASM; all bindings and secrets target staging. Production files, data and flags are unchanged.                                |
| 3. Add protected deployment       | Create or configure a protected GitHub staging environment with staging-specific secret names, then deploy an explicitly selected trusted commit.                                                         | Deploy checks refuse production Worker names, project IDs, bucket/cache IDs and missing staging secrets; HTTPS/auth/private-storage smoke checks pass.                                 |
| 4. Qualify the hosted application | Adapt the existing full-app scenarios for the approved HTTPS origin and stage-only account reset/cleanup. Exercise text/photos, consent, concurrent sends, recovery, revocation and group joins/removals. | Real hosted account sessions, private object reads and metadata-only evidence; copied media URLs, wrong-profile access and plaintext downgrades are refused.                           |
| 5. Produce phone test builds      | Separate Android/iOS test identities, staging sign-in URL schemes/associations, exact navigation/vault origin allowlists and the staging server URL.                                                      | Both test apps install without overwriting production and complete real sign-in against staging. iPhone age assurance uses an entitled organization build, not a Personal Team bypass. |
| 6. Check operations and teardown  | Measure usage, connections, quotas and spending; verify expiry/private-object cleanup, retries, alerts and pause behavior. Document removal of pilot-owned resources and credentials.                     | Accepted operating limits, no secret/content logging, and rollback pauses encrypted sends rather than enabling plaintext. No production or shared preview resource is deleted.         |

The existing `yarn e2ee:staging` origin/database guards deliberately accept only
managed loopback resources. Do not weaken them with a remote override or use
the production-oriented seeding/sign-in helpers. Hosted build/deploy, seed,
login and reset commands need their own explicit approved-origin/resource
checks; the local/CI pilot remains available as a separate safe test path.

Use staging-specific CI secret names rather than falling back to repository
production secrets when an environment secret is missing. The first deployment
must work from the trusted feature commit without merging encryption into main.
Account for GitHub's default-branch registration requirement when introducing a
new manually dispatched workflow; an explicit guarded deployment can precede
that automation. Do not dispatch the production deployment or migration workflow.

Initially omit production email, OAuth, payment, SMS/CRM, relay/federation and
webhook credentials/bindings. Add deployment-mode guards so tests cannot contact
real recipients or silently use production defaults. Sign-in starts with
controlled accounts and staging-only one-use links; any email sender added later
must enforce the tester recipient list. Do not enable the production scheduler
unchanged: qualify stage-only chat maintenance before enabling its triggers.
Show an unmistakable test-data banner and disable search indexing.

`CAPACITOR_SERVER_URL` already changes the shell's server and derives a trusted
origin, but it is not the whole phone isolation change. Current auth helpers and
URL schemes use `social.pana.app`, and navigation/trust helpers also recognize
production hosts. Stage-specific app IDs, schemes, callback handling and
allowlists must agree without changing the production app's permanent identity
or accepting production links inside the staging vault.

Plan approximately **3-5 focused engineering days** for hosted configuration,
deployment, test-account tooling and initial qualification once access is
available. This is an estimate, not a delivery commitment; Apple signing/access,
external review and physical-phone qualification can extend the calendar.
Existing account allowances may cover Worker/storage/cache usage. Verify spare
database projects and billing before assuming any additional monthly cost.
No new spending is approved by this plan.

The owner inputs before provisioning are Supabase project access/selection,
confirmation of deploy/DNS and protected-environment permissions, the tester
access policy, and approval of any incremental charges. Organization signing
and authorized phones are additionally required for the phone phase. No keys,
database credentials, recovery secrets or tester email lists belong in this
document or chat.

Hosted staging does not satisfy the independent review gate or authorize a
production beta. Production beta eligibility still needs a server-enforced
participant/group allowlist, separate release approval and the remaining
physical-device/security gates.

#### Hosted staging operator entry point

`yarn e2ee:hosted-staging` is separate from the loopback pilot. It never loads
`.env.local`, falls back to production credentials, or creates a paid project.
Supply a verified resource registry with `version`, `environment`, `worker`,
`accountId`, `origin`, `databaseProjectRef`, `productionDatabaseProjectRef`,
`kvNamespaceId`, `publicBucket` and `privateBucket`. The Worker name must be
`panamia-staging`; the dedicated bucket names are `panamia-staging-media` and
`panamia-staging-chat-private`. Registry validation rejects the production
project, cache, buckets, Worker and origin.

Configure `STAGING_POSTGRES_URL`, `STAGING_BETTER_AUTH_SECRET` and, for deployment,
`STAGING_CLOUDFLARE_API_TOKEN` through secure environment settings. Do not paste
them into chat. The database URL must identify the selected Supabase project
using its direct hostname or its session-pooler username; transaction pooling
and arbitrary hosts are refused. All hosted connections verify TLS certificates.

```powershell
yarn e2ee:hosted-staging validate --resources $registry
yarn e2ee:hosted-staging init --resources $registry
yarn e2ee:hosted-staging build --resources $registry --directory $hostedBuild
yarn e2ee:hosted-staging deploy --resources $registry --directory $hostedBuild
yarn e2ee:hosted-staging resume --resources $registry
yarn e2ee:hosted-staging login --resources $registry --account demo-alice
```

`init` requires a clean committed source and either an empty public database or
its exact staging ownership marker. It serializes operators, commits each
migration together with its immutable journal hash, and atomically seeds
synthetic accounts with their admission marker. Interrupted transactions roll
back rather than leaving half-applied migrations or orphaned test users.
Migrations require PostgreSQL 16 `psql` on PATH or `PG_BIN_DIR`.
`build` creates a fresh absolute `hosted-staging-<id>` directory
outside the repository. `deploy` rechecks generated bindings, source and WASM
bytes, uploads runtime credentials as secrets rather than public vars, and
verifies the approved HTTPS origin's source-specific health response.

Initialization and redeployment leave test access paused. `resume` requires a
clean checkout and healthy deployment for that exact source before updating the
owned admission marker with a compare-and-swap. `pause --resources $registry`
can stop newly admitted requests without a build; it does not clear encryption
latches, keys, history, counters or outboxes. Admitted users can still sign out.
It is not a remote wipe: offline history, already-open sockets and requests
already admitted are not retroactively revoked. Missing access state in an older
marker also fails closed until an operator initializes and resumes it.

The staging Worker runs only bounded private encrypted-chat retention, hourly,
including while test access is paused. Each invocation verifies its dedicated
environment and source marker before initializing the private bucket, records
metadata-only job outcomes, and propagates failed/deferred deletion work for
retry. It never delegates production scheduled tasks such as SMS sync, mail,
listing refreshes or external probes.

The dedicated `worker/staging.ts` refuses missing or inconsistent credentials,
database/source markers and wrong origins. Only admitted test accounts and
current operator-issued one-use invitations reach application routes. Public
signup, arbitrary OAuth, mail delivery, relay publishing, external integration
mutations and production federation endpoints are unavailable. Staging sessions
use a separate cookie prefix, host-only cookies and a shorter lifetime;
authenticated pages show a synthetic-data banner and responses are not indexed
or cached.

The `Guarded Staging Deploy` workflow requires a protected `Staging` environment,
explicit source SHA, and a successful encrypted qualification run for that same
SHA. Qualification also compiles the actual staging gateway using isolated,
synthetic credentials without any deployment. It downloads only that run's
qualified static engine. Supply the registry
as `STAGING_RESOURCES_JSON` and use only staging-specific secret names; missing
values and absent reviewer protection fail before deployment. The workflow must
be registered on the default branch before manual dispatch, or the guarded
operator commands must be used for the first deployment. Neither path uses the
production deployment workflow.
The reviewed `resume_test_access` workflow input is false by default; otherwise
an operator must explicitly run `resume` after the verified deployment.

Phone builds must be prepared inside the staging source/build snapshot, never
by syncing a staging identity over the production native worktree. The staging
build marker and `CAPACITOR_SERVER_URL` select the separate
`social.pana.app.staging` identity and staging-only URL/vault allowlists. Android
Debug additionally uses `-PhostedStaging`; iOS Debug needs the staging bundle ID,
`PANA_AUTH_URL_SCHEME` override and organization-entitled
`App/Staging.entitlements`. Production and personal sideload defaults remain
unchanged. The age-assurance controller is not bypassed; signed phone
qualification remains a separate gate.

The hosting blocker is not Cloudflare subscription setup: no Supabase management
connection or isolated staging project credentials are available in this session.
The owner must connect Supabase or configure the selected nonproduction project
securely, confirm resource isolation and approve any incremental charges before
the guarded deployment is run. The existing local/CI pilot remains available.

### Milestones, effort and release gate

**Original first milestone: time-box P1 to 5-10 working days.** Deliver an evidence-based
go/no-go on the MLS engine and target platforms, a pinned adapter/wire-state
contract, and an updated estimate. Use synthetic accounts, not real chats.
iOS native qualification requires macOS build access and real-device access;
desktop WebKit emulation is not a substitute.

The disabled-by-default implementation now includes media, recovery and the
existing Messages/group UI. Qualify its isolated application pilot before an
opt-in beta. Migration or activation of real conversations is a separate release
action.

A preliminary planning allowance is **12-20 engineer-weeks** for the complete
Pana-owned path, assuming an experienced engineer, native-device access and
reuse of current UI/auth/transport infrastructure. This is not a quote or a
deadline and must be revised after P1. The earlier Matrix-based 8-14 week range
does not apply unchanged. No Matrix hosting bill is added, but Workers, DB,
R2, maintenance, support and review still have costs; measure actual usage
instead of promising the existing free-plan budget will suffice.

Before production activation, demonstrate all of the following:

- Database/object-store/relay captures contain no normal message plaintext,
  usable private device keys or recovery secrets. Explicit reports are the
  documented exception, not an always-on copy.
- Identity substitution, wrong-profile access, stale manager access, replay,
  malformed frames, duplicate sends and concurrent/offline membership changes
  fail safely. Group joins/removals hold cryptographically, not merely in UI filters.
- Physical Android/iOS, browser reloads, multiple tabs, app backgrounding,
  upgrades, lost devices and backup restoration preserve the stated guarantees.
- Private text, photos, GIFs and supported media cannot bypass the encrypted
  path. Legacy history, expiration, content rendering, notifications and
  existing public feeds behave as documented.
- The pinned engine/bindings and integration receive the planned security
  review; findings and release-affecting audit/version differences are resolved.
- Rollout flags, diagnostics and rollback procedures preserve ciphertext and
  keys. An emergency rollback may pause encrypted sending or require a client
  update; it must never switch an encrypted conversation to plaintext.

---

## Overview

Panas should be able to talk to each other in real time without installing anything. The constraint
that decides most of what follows was stated by the product owner:

> _"I don't want users to leave the pana system, so I'd rather build the chat and groups in our
> site."_

Direct-message chat lives at **`/messages`**, with HTTP reads/writes and live invalidations over
`/ws/dm`. Group and event rooms are not implemented. Separately, `/r/groups` still hands panas a
deeplink to a third-party Nostr client —
`components/relay/ImportInstructions.tsx:7` hardcodes
`https://web.nostrord.com/?relay=relay.pana.social&group=panamia-test`. Nostrord, Amethyst, and
0xchat are where the talking currently happens, which is precisely the outcome the constraint rules
out for group and event conversations.

### Goals

- Real-time messaging inside pana.social — no app install, no client handoff
- Messages are in Postgres, so they can be moderated, searched, and swept on account deletion
- Identity is established server-side and cannot be forged by the client
- Runs on the Cloudflare Workers free plan

### Non-Goals

- Threads, reactions, read receipts, or typing indicators in the first release
- Federation **for group and event rooms**. Those are explicitly the "stay on the site" surface, and
  ActivityPub has no good real-time chat story. DM rooms are the exception and keep federating,
  because they ride the existing direct-status substrate — see
  [Storage](#storage--one-transport-two-stores)
- Replacing `/r/groups`. Relay groups stay as a separate bring-your-own-client feature for panas who
  want censorship-resistant Nostr rooms

---

## Current Messages workspace

The E2EE effort retains an isolated [protocol feasibility lab](../prototypes/e2ee/README.md)
and a real-client/API qualification harness. The disabled product integration is
described above; no live encryption rollout has occurred. The lab documents the independent
review and integration gates before that claim can change.

The production `/messages` workspace shares transcript/composer primitives and
`components/messages/workspace.module.css` with `/mock/dm-chat`, but no mock data or
simulated send controls. Its compact inbox intentionally omits the mock's heading,
marketing copy, search field and New message button on both the website and native apps.
Messages belongs to Pana Social's route registry and retains the real masthead and account menu.
The workspace fills the remaining viewport, with legal links kept below it in browsers.
Native messaging omits the legal footer and composer helper text. Its header message
shortcut stays hidden throughout Messages, including the inbox and Requests.
Opening a conversation hides the app's bottom tabs and inner Back control; the
app-header Back (and Android hardware Back) returns to the message list, preserving drafts
and restoring focus. Standalone group chats keep their existing Back-to-group destination.
The chat uses a warm, lightly textured cream/butter canvas, distinct sender bubbles, shared
photo/initial avatars, clearer timestamps, and 44px primary touch controls. The desktop and
mobile workspace avoid a redundant outer scrollbar; only their content panes scroll.
The GIF picker stays inside the visible conversation, including when a multiline draft and
an existing attachment leave too little room above the composer.

- The compact composer starts as one row and grows to 128px before scrolling.
  Return inserts a newline on phones; desktop Enter sends, Shift+Enter inserts
  a newline, and IME composition is never submitted as a message.
- **Attach a photo** opens the system image chooser directly in one gesture.
  One photo and the existing GIF may accompany a message, including without a caption.
  Photos reuse the authenticated `/api/social/media` upload and the existing
  Pana media-link delivery model; they are not end-to-end encrypted and copied
  media links can be viewed outside the conversation. Conversation details and
  the photo control's accessible description explain this without an intermediary
  attachment menu; no new privacy or encryption promise is made.
  Camera pixels are resized to a 2048px longest edge and re-encoded as JPEG so
  source metadata such as GPS is not uploaded. The original-file limit is 10 MB.
  JPEG, PNG and WebP are supported; HEIC files can be converted when the browser
  can decode them, with an explicit JPEG/PNG/WebP recovery message otherwise.
- Message timestamps, compact per-message expiry and actual server acceptance
  live inside tighter Pana-coloured bubbles. Direct messages omit redundant
  sender avatars; groups retain sender identity. Report and authorized delete
  controls stay accessible. There are still no calls, voice, presence or read receipts.
- Desktop conversation and transcript panes scroll independently; the composer stays in view.
  Mobile uses a list/detail flow with Back navigation, including during loading and errors.
- Individual and group conversations share one inbox ordered by recent activity;
  Requests remains separate and contains only held individual messages. A subtle group icon
  identifies group rows. Separate selection keys, drafts and delivery paths keep the two
  conversation types distinct; membership and consent checks are unchanged.
- Start a text chat using **Message** on another pana's profile. The shared personal/business
  profile action opens `/messages?to=<actor-id>` through the existing gated DM endpoint.
  Incoming requests still need explicit acceptance. Sign-in preserves the selected target,
  and existing standalone group links (`/messages?group=<handle>`) open the same mixed inbox.
  Newly started profile chats stay easy to find while their first draft is still unsent.
- DMs stay out of profile **Posts** lists and counts, including the sender's and recipient's
  views. Profile filtering happens before pagination and also excludes direct replies when
  requested. Public, followers-only, Panas, and readable group posts retain their audiences;
  Messages and authorized DM permalinks remain unchanged.
- Text, photo and mirrored-GIF drafts are held per conversation in component memory. Reloading, unmounting
  the workspace, signing out, or switching the active profile clears them; browser storage is not used.
- Each submitted message retains its recipient, text, and attachments while sending or failed.
  **Retry** reuses that local bubble. A server acknowledgement is matched to its refetched row by
  status ID, never by message text. No message is labelled queued because a socket disconnected.
- Reading older messages is not interrupted by incoming messages. A local jump-to-latest control
  reports messages arriving while that thread is open; this is not persisted unread tracking.
- Requests require explicit acceptance before replying, including requests whose messages have
  expired. Accept/Delete errors remain visible. Refusals keep the shared, deliberately ambiguous
  wording. Expiry notices, federation notes, safe HTML rendering, GIPHY attribution, and existing
  attachment/voice players are retained.

The DM API, consent gate, 30-day visibility window, and socket/polling fallback are unchanged.
Event rooms, floating chat, presence, read receipts, and typing indicators are not added.
Retry is an explicit new HTTP attempt, not a server-side idempotency guarantee: a lost
acknowledgement after persistence can still result in a duplicate message.

---

## Current group chats

Each native group has one members-only chat, available from its **Chat** navigation at
`/g/[handle]/chat` and from the **Groups** folder in `/messages`. The group page links back to
Messages with `/messages?group=[handle]`. Text, mirrored GIFs, sender identities, failed-send
recovery, older-message pagination, and the approved desktop/mobile presentation are shared
with the messaging workspace. Drafts remain in component memory, not browser storage.

- `social_group_members.status = 'active'` is the authorization for **both** public and private
  groups. Public group posts do not make group chat public. Pending, banned, removed, and
  signed-out viewers cannot read or send. The active profile's actor is resolved server-side.
- The group's ID is the room key. No `chat_rooms` provisioning row or parallel membership table
  is needed for exactly one room per group. Messages never become `socialStatuses`, enter feeds
  or discovery activity counts, or federate.
- The product-owner decision is a **30-day visibility window**, matching DMs.
  `GROUP_CHAT_EXPIRY_DAYS = 30`; expiry is checked on room reads and sidebar previews.
  It is not a permanent-erasure policy, and the story purge does not silently delete chat.
- The author, an active moderator, or an active admin can remove a message for everyone.
  Removal is a soft delete with `deletedAt` and `deletedByActorId`; ordinary reads omit it.
  Group deletion cascades to its chat and includes chat counts in the confirmation preview.
  Author deletion cascades to their messages.
- Group writes use `(group_id, actor_id, client_id)` uniqueness. Retry reuses the same nonce,
  so a lost acknowledgement cannot create a second group message. A different payload cannot
  reuse that nonce, and retry cannot revive a moderated or expired message. Other members are
  not given the sender's nonce.
- Group and membership invalidations contain IDs and timestamps only, never text or media.
  Recipients are current active members, read after commit. Membership changes additionally
  invalidate the affected member, including on removal, leave, role change, and group deletion.
  The existing authenticated APIs remain authoritative; a cached room is hidden on 401/403/404.
- Fan-out uses at most eight concurrent mailbox requests with the existing two-second deadline.
  No new room-member cap is imposed. Reconnect, focus refresh, and 15-second polling remain
  the fallback. There is one actor mailbox connection, not a connection per group.

The endpoints are `GET /api/social/messages/groups`,
`GET|POST /api/social/groups/[handle]/chat`, and
`DELETE /api/social/groups/[handle]/chat/[messageId]`.
Reads and writes recheck membership in the storage layer; chat operations lock the parent and
membership through the transaction. Responses are private/no-store. The table enables RLS with
no direct-client policies, preventing a Supabase API grant from bypassing the application gate.
The isolated PGlite suite in `tests-db/group-chat.test.ts` exercises the migration, SQL, HTTP
handlers, membership lifecycle, moderation, expiry, retry uniqueness, and RLS without secrets.

---

## The three scopes

Chat is one feature with one transport and one UI, parameterised by what the room hangs off.

| Scope     | Room is                 | Membership source                                | Exists today                            |
| --------- | ----------------------- | ------------------------------------------------ | --------------------------------------- |
| **DM**    | A pair of actors        | `social_dm_requests` + `dm_policy` + blocks      | ✅ `lib/federation/wrappers/dm-gate.ts` |
| **Group** | One `social_groups` row | `social_group_members` where `status = 'active'` | ✅ `lib/schema/index.ts:2044`           |
| **Event** | One `events` row        | `event_attendees` where `profileId IS NOT NULL`  | ✅ `lib/schema/index.ts:2355`           |

The good news is that **none of these needs a new membership model.** Every scope already has a
table that answers "may this person be in this room", and group and event membership are already
enforced by shipped API routes. Chat adds a room and a socket; it does not add a concept of who
belongs.

The one thing to resist is inventing a `chat_room_members` table. It would immediately be a second,
divergent answer to a question three existing tables already answer, and the first bug would be
someone removed from a group who is still in its chat.

---

## What replacing mail costs

"Replace the mail system" is the right instinct about the _experience_ — filing paperwork, refreshing
to see a reply — and the wrong instinct about the _substrate_, because the substrate is load-bearing
for things that have nothing to do with the inbox UI.

A DM today is a `socialStatuses` row with `visibility: 'direct'`. Retiring that row type breaks:

| What breaks                | Where                                        | Why it matters                                                         |
| -------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| **Federation**             | ActivityPub direct addressing                | A DM to a Mastodon account works today. Chat does not federate at all. |
| **The DM consent gate**    | `lib/federation/wrappers/dm-gate.ts`         | `allow`/`hold`/`refuse`, the Requests folder, the no-notify property   |
| **Block / mute semantics** | `isBlockedEitherWay`, `filterHiddenActorIds` | Already audited against the status read path                           |
| **Moderation**             | A DM is a status, so status tooling applies  | A chat transcript is not a status; nothing we built would apply        |
| **Test coverage**          | `tests-db/social-dm-requests.test.ts`        | 12 assertions on hold/accept/delete/block/policy behaviour             |

The consent gate is the one to be most careful with. `docs/SOCIAL-GRAPH.md` §C1 calls ungated DMs
_"the largest open safety gap"_, and `dm-gate.ts` is the thing that closed it. It is not a filter
that can be ported in an afternoon: it encodes that a held message **must not notify**, and that
every refusal returns one identical string so that a blocked sender cannot tell a block apart from a
closed inbox by contrast. Re-deriving that against a new store is how a safety property quietly
stops holding.

**So: replace the interface, keep the substrate.** The `/updates` inbox and sent tabs retire when DM
chat reaches parity. `socialStatuses` stays exactly where it is.

---

## DMs expire after thirty days

Keeping the substrate means inheriting a property of it that the mail interface was hiding and a
transcript cannot. Direct messages expire — and until this was raised, they expired after **seven
days**, in production, undocumented.

`lib/federation/wrappers/status.ts` stamps `expiresAt` on **every** direct row at write time — not
only on held requests, not only on unaccepted threads — and `notExpired()` in
`lib/federation/wrappers/timeline.ts:43` filters those rows out on read.

The row itself survives. `lib/jobs/purge-expired.ts:9-18` deliberately excludes DMs from the hourly
sweep, on the stated reasoning that hard-deleting somebody's conversation is a product decision and
not a cleanup detail. So expiry here is a read filter, and that is what made this decision cheap to
act on.

### It erodes, it does not expire

Because the stamp is applied per row at write time, a conversation never expires as a unit. It
erodes from its oldest message forward. An actively used thread is a sliding window: the reply sent
this morning is good for the full term, while the message that started the thread may already be
gone.

That is the part that does not survive the interface change. An inbox is a list of recent items and
has no beginning anyone expects to find, so items falling off the bottom read as ordinary. A
transcript has one, and it is usually the half holding the context — what was agreed, what the price
was, which weekend was being held. A transcript that silently loses its own first page is
indistinguishable from data loss, and the panas who lose it will report it as a bug, because from
the inside that is exactly what it is.

### Decision — thirty days (2026-10)

**`DM_EXPIRY_DAYS = 30`.** Thirty covers the span a real conversation runs: an event being planned,
a booking being arranged, a trade being negotiated. Seven did not — it expired mid-conversation,
which is the worst available moment.

Expiry is kept rather than dropped because it is now a stated property rather than an accident. The
alternative, making DMs durable, is defensible — the consent gate, not disappearance, is what makes
DMs safe — but it is a larger promise, and it is the one that cannot be walked back later. Thirty
days can be extended again; "your messages are kept forever" cannot be retracted.

`drizzle/0062_dm_expiry_30_days.sql` applies the new window to messages already sent. Two properties
of that backfill are deliberate and worth keeping if it is ever revisited:

- **It extends, it does not revive.** The predicate is `expires_at > NOW()`. Dropping it would
  un-hide every DM sent in the last thirty days, because the rows were never deleted. Disappearing
  was documented for legacy voice memos, and somebody may have
  sent something they would not have sent otherwise. Honouring that costs old history nobody
  currently sees; breaking it costs somebody a reasonable expectation of privacy, and cannot be
  undone once they have seen it.
- **It excludes stories.** `social_statuses` has two writers of `expires_at`: DMs, and stories at
  `STORY_LIFETIME_HOURS = 24`. There is no `visibility` column to filter on, so `type <> 'Story'` is
  what keeps a one-day story from becoming a month-long post.

### What the UI still owes

The number changed; the obligation did not. A transcript that drops messages without saying so is
still the one option not available. `/messages` renders the remaining time per message and keeps
the 30-day window visible in the sidebar and conversation details.

---

## Storage — one transport, two stores

This is the central design call, and it follows directly from the table above.

**DM rooms read and write `socialStatuses` (direct).** They keep federation, the consent gate, voice
memos, block filtering, moderation, and the existing tests — none of which have to be touched.

**Groups read and write `social_group_chat_messages`.** Their existing membership is the gate;
no private chat row is mirrored into the public/federated status store. The generic
`chat_rooms` / `chat_messages` proposal later in this document remains a possible design for
event rooms, not the schema native groups currently use.

### Why not one store for all three

The tempting symmetry is a single `chat_messages` table, with DM messages _also_ mirrored to direct
statuses so federation survives. That is a dual write to two stores with different schemas,
different delete semantics, and different expiry — `DM_EXPIRY_DAYS`
([thirty days](#dms-expire-after-thirty-days)) applies to statuses and would not apply to the
mirror. Dual writes drift, and the drift here is silent: the federated copy and the copy a pana sees
would disagree, and nothing would report it.

One store per scope has no drift because there is nothing to keep in sync.

### Why this is invisible in the UI

A message is `{ id, author, body, createdAt }` whichever table it came from. The difference is one
adapter at the query layer selected on room scope, not a difference the chat component can see. To a
pana there is one Messages surface, which is the entire point of the product change.

---

## The authorization gate

The implemented group gate is in `lib/server/group-chat.ts`; both public and private groups
require an active membership. HTTP identity is resolved in `group-chat-request.ts`.
The shared actor socket carries only invalidations; authorization is rechecked when actual data
is fetched. A socket connection never grants membership in a group.

The following unified-room gate is the **remaining event-room proposal**, not a second group
endpoint. It delegates to the table that already owns the answer and follows the
rule in [Do Not Copy The Signaling Auth Model](#do-not-copy-the-signaling-auth-model): identity is
resolved in the Worker and set on the inner `stub.fetch`, and the DO ignores any identity in the
payload.

```ts
// /ws/chat/:scope/:id
const session = await auth();
if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

// session → active profile → actor. A user may act as a business, so the
// actor is whoever they are currently acting as, not their own profile.
// See lib/server/active-profile.ts:68-79.
const profile = await getActiveProfileWithActor(session.user.id);
if (!profile?.socialActor) return new Response('Forbidden', { status: 403 });

switch (scope) {
  case 'dm':
    // Reuses the shipped gate. Does NOT re-implement consent.
    if (!(await mayWriteDirectThread(profile.socialActor.id, id)))
      return forbidden();
    break;

  case 'group': {
    const m = await getMembership(id, profile.socialActor.id); // group.ts:588
    if (m?.status !== 'active') return forbidden(); // 'pending' and 'banned' are not members
    break;
  }

  case 'event': {
    // Keyed on profileId, so attendees with a null profileId — anonymous
    // email and Nostr RSVPs — can never match. That exclusion is the
    // decision, not an accident: see "signed-in attendees only" below.
    const a = await getAttendee(id, profile.id);
    if (!a || a.status === 'not_going' || !a.emailVerifiedAt)
      return forbidden();
    break;
  }
}
```

Three things that are easy to get wrong and are deliberate above:

- **`pending` is not a member.** A pending join request must not read the room, or the request queue
  becomes a way to read any private group.
- **`banned` is not merely absent.** It is a tombstone that exists precisely so the person cannot
  re-enter; treating a missing row and a banned row the same way re-admits them on rejoin.
- **The group branch keys on `actorId`, the event branch on `profileId`.** That is not an
  inconsistency to tidy up — it is what the two shipped tables actually store, and bridging them in
  the gate is cheaper than migrating either. It is also what enforces
  [signed-in attendees only](#event-rooms-admit-signed-in-attendees-only) for free.

---

## Event rooms admit signed-in attendees only

**Decided (2026-10), by the product owner: only signed-up members can access chat.** This section
records the constraint that forced the question and what the answer costs, because the cost is real
and someone will rediscover it the first time an event room looks empty.

`event_attendees` does not require an account. From `lib/schema/index.ts:2355`:

```ts
// Set for logged-in attendees; null for anonymous email RSVPs.
profileId: text('profile_id').references(() => profiles.id, ...),
// Nullable: RSVPs that arrive from Nostr (kind 31925) have no email — they
// are keyed by nostrPubkey instead. Web RSVPs always set email.
email: text('email'),
nostrPubkey: text('nostr_pubkey'),
```

So an event has three classes of attendee, and only one of them can hold an authenticated WebSocket:

| Attendee             | Has `profileId` | In chat                                          |
| -------------------- | --------------- | ------------------------------------------------ |
| Logged-in RSVP       | yes             | **Yes**                                          |
| Anonymous email RSVP | no              | **No** — no account, so no session, so no socket |
| Nostr RSVP (31925)   | no              | **No** — no local account at all                 |

This was never a bug to code around. There is no way to authenticate a person who has never had an
account, and issuing a room token over email would create a credential with no revocation story,
attached to an address that may not even be verified.

### What the decision means for the gate

`profileId IS NOT NULL` becomes a membership predicate, not an edge case — which is what makes the
event branch of [the gate](#the-authorization-gate) as simple as the group branch. Rooms are
provisioned for every event; the gate, not the room, is what excludes people.

Email and Nostr RSVPs are unaffected in every other respect. They still RSVP, still count toward
capacity, still get event mail. They do not see a chat tab.

### The cost this accepts

On a local network where email RSVP may be the common path, an event room can be a fraction of the
guest list. A room with two people in it is the
[liveness problem](#realtime-delivery-is-not-realtime-affordances) this document warns about, aimed
at events instead of DMs.

Two cheap things keep that from reading as broken, and both should land with the first event room:

- **Don't advertise an empty room.** No chat tab until the room has a floor of signed-in attendees.
  An absent tab reads as "not a feature here"; an empty one reads as "nobody came".
- **Say who the room is for.** "Chat is open to attendees with a pana account" is a true sentence
  that explains the gap, where silence makes it look like a bug.

The residual gap also has an obvious close: an email RSVP who claims an account joins the room. The
RSVP flow already sends a magic link, so claiming could attach a profile to the existing row. That
is now a **growth path rather than a blocker** — worth building when event chat earns it, and not
before.

---

## Realtime delivery is not realtime affordances

The `/mock/dms` comparison asked one binary question — mail **or** chat — and every argument in this
document inherits that framing. The panas asking for realtime have exposed it as a false binary,
because "realtime" names two separable things and the comparison only ever priced them together.

|                          | What it is                                        | What it costs                                         |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------- |
| **Realtime delivery**    | A message you were sent appears without a refresh | A socket. No schema change, no second store           |
| **Realtime affordances** | Presence dots, typing indicators, read receipts   | A second store, or liveness the network cannot supply |

**The anti-realtime argument in this document is entirely an argument against the second column.**
Reread it:

> Real-time affordances **advertise liveness**: on a network of a few hundred locals, a presence dot
> that always reads "offline" and a typing indicator that never fires make a room look abandoned.

Every noun there is an affordance. None of it is delivery. A message arriving the moment it is sent
advertises nothing and can never read as abandoned — it is invisible until there is something to
show, and when there is, it is strictly better than the member discovering it on next refresh.

**Mail's recorded cost was delivery, not affordances.** The mock listed exactly one serious cost
against the model we chose — _"No realtime. A reply appears on refresh or poll."_ That is column
one. It was priced as though buying it meant buying the chat model, and it does not.

**And the chat model's costs are all substrate costs, which delivery does not incur.** The mock's
own list:

- _"Does not federate."_
- _"Two parallel DM systems unless the direct-status path is retired."_
- _"Block, mute, and report all need re-implementing against a second store."_
- _"Moderation gets harder: a transcript is not a status, so nothing we built applies."_

Every one of those is caused by `chat_messages` being a new table, not by the socket. Adding a
socket in front of `socialStatuses` pays none of them: federation still works because the message is
still a status, block filtering still applies because it is the same read path, moderation still
applies because it is the same row. Audio notes and voice memos have since been retired without
changing this direct-message substrate.

**Conclusion: buy column one, decline column two.** That deletes the only cost recorded against the
mail substrate while costing nothing the mock warned about — which is why the substrate survives the
decision to replace the mail _interface_.

---

## Path A — live delivery on the mail substrate

> **Status: built.** Steps 1–4 below have shipped. `worker/dm-stream.ts` holds the DO,
> `lib/dm-stream.ts` the fan-out, `app/messages/_lib/use-dm-socket.ts` the client half.
> Two decisions the design below did not anticipate are recorded in
> [What the build changed](#what-the-build-changed).

**This is now the DM scope's delivery layer**, not an alternative to chat. The architecture below
was designed before the three-scope decision and survives it unchanged, because an actor-scoped
mailbox does not care what the UI on top of it looks like. What changed is its framing: it is no
longer "instead of chat", it is "how DM chat gets its messages".

Scope: a DM that has been sent appears in an open thread without a refresh. Nothing else.

**Explicitly out of scope:** presence, typing indicators, and read receipts — the affordances the
liveness argument above rules out for two-person threads. Group and event rooms may earn them
later; a cold DM thread does not.

### Shape

One Durable Object **per recipient actor**, not per thread. A thread DO would need the member to
have the thread open to receive anything, which is the one case where they do not need the socket.
An actor-scoped DO is a mailbox: the member holds one connection, and anything addressed to them
arrives on it regardless of which thread is on screen. This refreshes conversations and Requests;
it does not create read state or an unread badge.

```
POST /api/social/statuses (visibility: 'direct')
  └─ createStatus() writes the row            ← Postgres stays authoritative
       └─ for each actor in {recipients} ∪ {author}:
            env.DM_STREAM.idFromName(actorId) → stub.fetch('/notify')
                 └─ broadcast to that actor's open sockets (if any)
```

The DO stores **nothing**. It is a fan-out point, not a cache — which is the significant divergence
from both `SignalingRoom` and the chat design below, and it is what keeps this path free of the
second-store costs listed above. If the member is offline the notify is a no-op and they read the
message from Postgres on next load, exactly as they do today. Delivery is therefore best-effort by
construction, and the existing read path is the fallback rather than a recovery mechanism that has
to be written.

### Auth

Identical to the rule in [Do Not Copy The Signaling Auth Model](#do-not-copy-the-signaling-auth-model),
and non-negotiable for the same reason. `/ws/dm` resolves the session in the Worker, derives the
actor ID server-side, and routes to that actor's DO. The client never names the mailbox it is
connecting to — if it could, it could read anyone's.

### Steps

All four have shipped.

1. ~~`DmStream` DO class; binding with `new_sqlite_classes` (free-plan requirement, same as
   `SignalingRoom`'s `v1` tag), plus a `migrations` entry.~~ — `worker/dm-stream.ts`, `v2` tag.
2. ~~Authenticated `/ws/dm` upgrade in `worker/index.ts`, alongside the existing
   `/ws/signaling/` branch. Session → actor ID → `idFromName(actorId)`.~~ — in the first commit,
   as required.
3. ~~Notify-on-send from the direct branch of `createStatus` in
   `lib/federation/wrappers/status.ts`.~~ — `notifyDirectMessage` never rejects; the row is already
   committed when it runs.
4. ~~Client hook that opens the socket and invalidates the thread query on message. Reconnect with
   backoff; on reconnect, refetch rather than replay.~~ — `useDmSocket`, 1s→30s backoff.

### What the build changed

Two things the design above did not anticipate.

**The author is in the fan-out set, not just the recipients.** The sketch says "for each recipient
actor", which is wrong for multi-device: sending a DM from a phone would never tell the same
member's laptop anything happened, because the author's own actor is not a recipient. The set is
**recipients ∪ {author}**. The sending client refetches once, redundantly, and every other device
the member holds stays consistent.

This also means `conversationActorId` is computed **per mailbox** rather than once per message — a
message from A to B belongs to _B's thread with A_ and to _A's thread with B_. It is `null` for a
multi-recipient DM, which has no 1:1 thread to name, and the client falls back to refreshing the
list.

**Held recipients are notified too.** The request gate suppresses a _notification_, not delivery:
the message still lands in their Requests folder, so a live Requests tab should fill in. This
discloses nothing to the sender, because fan-out is per mailbox and the sender only ever learns
about their own.

**`handleNotify` returns a `delivered` count.** It is the one honest signal about the gap between
"sent" and "seen": `delivered === 0` for an actor means they hold no live socket. That is exactly
the condition for sending a push instead, and the DO is the only thing in the system that knows it.
See [Background delivery needs push](#background-delivery-needs-push-and-that-is-true-everywhere).

### Mobile — it already works, because the app is this app

This was asked as "will the Durable Object work if we build a native client?", and the honest answer
turned out to be narrower and better than the one first given: **there is already a mobile app in
this repo, and the socket already runs inside it unmodified.**

[`capacitor.config.ts`](../capacitor.config.ts) points a WKWebView / Android WebView at
`https://pana.social` — the same Worker this document describes. Its own words: _"cookies, auth and
routing all behave exactly as they do in a browser on that origin."_ So `use-dm-socket.ts` builds
`wss://pana.social/ws/dm` from `location`, the WebView sends the session cookie on a same-origin
upgrade, and `worker/index.ts` resolves it exactly as it does for a desktop tab. There is no second
client, no second auth path, and no native socket to write. One implementation, three platforms —
which is the whole premise of [MOBILE-ROADMAP.md](./MOBILE-ROADMAP.md).

`resolveUserIdFromHeaders(headers)` is still the right seam, but for a reason unrelated to mobile:
the raw Worker `fetch` entry has no Next request context, so `next/headers` does not resolve there
and the session has to be read from an explicit `Headers`. If a true native client is ever built it
inherits that for free — no cookie jar, but full control of the upgrade request's headers, so it
sets the cookie itself and arrives indistinguishable from a browser.

#### Surviving a suspend — the bug this question found

Asking the mobile question turned up a real defect, and not a mobile-only one.

Reconnect was driven entirely by `socket.onclose`. But a connection torn down by a suspending OS,
a closed laptop lid, or a changed network **never sends a close frame**: `readyState` keeps reading
`OPEN` on a socket that is gone, and `send()` on it buffers rather than throwing. `onclose` never
fires, so the hook never reconnects. The thread survived that on its fifteen-second interval; the
conversation list, which had neither an interval nor a focus refetch, would have gone stale
indefinitely. On mobile that is **every** backgrounding — the app would feel live once and never
again.

Liveness is now asserted instead of assumed:

- **A heartbeat that demands an answer.** The `'pong'` that `setWebSocketAutoResponse` already
  returns is now checked for. No reply inside `PONG_TIMEOUT_MS` and the client closes the socket
  itself — `close()` fires `onclose` _locally_ even when the peer is unreachable, so the existing
  reconnect path takes it from there and there is no second recovery mechanism to keep in step.
- **Wake-driven reconnect.** `visibilitychange` and `online` re-probe immediately and reset the
  backoff rather than waiting out a timer that was scheduled before the device went to sleep.
- **A floor under the list.** `useConversations` gained `refetchOnWindowFocus` so it is never wholly
  dependent on socket health.

Plain DOM events were chosen over Capacitor's `App.appStateChange` deliberately: MOBILE-ROADMAP's
rule is that _the shell is additive, never a fork_, and importing a Capacitor plugin into a web hook
would fork it. `visibilitychange` fires in browsers and WebViews alike.

#### Background delivery needs push, and that is true everywhere

**No socket design delivers to an app that is not running.** iOS and Android suspend sockets with
the process; a closed laptop does the same. Signal, WhatsApp, Slack and Discord all answer this the
same way — a **second transport**, not a different first one. So "make it work on all platforms"
means adding push, not rearchitecting this.

The hook point already exists: `handleNotify` returns `{ delivered: N }`, and `delivered === 0`
means nobody was listening and a push should be sent instead. That is
[MOBILE-ROADMAP.md](./MOBILE-ROADMAP.md) Next Steps step 4, which needs
`@capacitor/push-notifications`, APNs and FCM credentials, and a device-token table tied to the
account — none of which can be created or tested from here, which is why this is recorded rather
than half-built.

### Prerequisite — the DM chat view had to exist first

**Both have now shipped**, the view first and the socket on top of it. The ordering mattered: a
socket whose only job is to make an open thread update live has nothing to update until there is an
open thread, so building the transport first would have meant shipping a DO whose sole consumer was
a mock.

What the view was built on was already here — direct statuses, `recipientTo`, `inReplyToId`, the
gating from `0051_social_dm_requests`, the held-request review in `/updates`, and the list routes
under `app/api/social/messages/`. What was missing was a thread you could sit in and watch; that is
`app/messages/`.

[`/mock/dm-chat`](../app/mock/dm-chat) remains the design fixture: conversation list, transcript,
composer, and the delivery states this path produces — sending, sent, and queued-while-disconnected.
It also renders the three gate answers, a federated thread, and the
[expiry countdown](#dms-expire-after-thirty-days), which is where that question came from.

This is also what makes "replace the mail" concrete. The DM chat view _is_ the replacement for the
inbox/sent tabs — the tabs retire when it reaches parity, not before, so there is never a window
where a pana cannot reach a conversation.

### How this relates to group and event rooms

The implemented group path reuses the actor mailbox rather than introducing a second socket
or a membership cache in a room DO. The server reads current recipients after commit and emits
metadata-only `group` frames. This also refreshes the group list while another conversation is
open. The future event-room design may still use room-scoped fan-out if its workload warrants it.

|           | DM                        | Native group chat            |
| --------- | ------------------------- | ---------------------------- |
| DO scope  | per recipient actor       | same actor mailbox           |
| DO stores | nothing                   | nothing                      |
| Store     | `socialStatuses` (direct) | `social_group_chat_messages` |
| Federates | yes                       | no                           |

Neither blocks the other, and nothing in the DM path is thrown away or migrated when rooms land,
because the DM DO never owns any data.

---

## Why Nostr Cannot Back In-App Chat

The obvious shortcut is to keep the relay and build a chat UI on top of it here. That is blocked,
and the block is deliberate.

`components/relay/EnrollSection.tsx:450` tells every enrolling pana:

> _"Your secret key (nsec) is shown once. We don't store it."_

And `:398` — _"never sent to or stored on our servers."_ The schema backs the promise: `profiles`
carries `nostrPubkey` and `nostrPubkeySource` (`lib/schema/index.ts:684-685`) and no secret-key
column anywhere.

Signing a kind-9 group message requires that secret in the browser on **every visit**. Every way to
put it there is unacceptable:

| Approach                    | Why it fails                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| Paste the nsec each session | Trains panas to type secret keys into web forms — the exact habit that gets people drained |
| Keep it in `localStorage`   | Any XSS anywhere on the origin becomes total, permanent identity compromise                |
| Store it server-side        | Breaks a promise made in the product UI                                                    |
| Require a NIP-07 extension  | Another install — back to "leave the pana system"                                          |

`lib/nostr/sign.ts` and `lib/nostr/publish-browser.ts` are both capable — browser schnorr signing
and a NIP-42 AUTH WebSocket publisher already exist. Capability was never the problem. **Key
custody is.**

**Conclusion: in-app chat must be native Postgres + Durable Object.**

---

## Precedent — SignalingRoom

`worker/signaling-room.ts` is a SQLite-backed Durable Object that already implements WebSocket
handling, a `chat` table, a `participants` table, join-with-reconnect that refreshes `joined_at`, a
30-minute stale purge, broadcast, and `cleanupIfEmpty()` teardown. `wrangler.jsonc` describes the
binding as _"Durable Objects for WebSocket-based real-time features (signaling, chat)"_.

Routing is established at `worker/index.ts:95`:

```ts
if (url.pathname.startsWith('/ws/signaling/')) {
  const roomId = url.pathname.split('/')[3];
  const id = env.SIGNALING_ROOM.idFromName(roomId);
  return env.SIGNALING_ROOM.get(id).fetch(request);
}
```

A chat room DO is a copy of a pattern already running in production in this repo. Two things about
it must **not** be copied — see [persistence](#durable-object-for-fan-out-postgres-for-truth) and
[auth](#do-not-copy-the-signaling-auth-model).

---

## Proposed Design

### Durable Object for fan-out, Postgres for truth

The DO holds a hot buffer in its own SQLite so a joining member gets `room-state` instantly, then
persists through to Postgres via `app/api/internal/*` — the route family `setInternalAuthToken`
(`worker/index.ts`) already exists to serve.

Postgres is authoritative because DO-only history would be invisible to moderation, invisible to
search, and invisible to account-deletion sweeps. That also matches the posture
`docs/RESILIENCE-ROADMAP.md:309` sets for the relay: panamia is the source of truth.

**One deliberate divergence from `SignalingRoom`:** it wipes its tables in `cleanupIfEmpty()` when
the last participant disconnects. Correct for an ephemeral three-person video call, catastrophic for
a chat room. Chat history survives an empty room.

> **Free-plan constraint:** the `wrangler.jsonc` migration entry for the chat DO class must use
> `new_sqlite_classes`, not `new_classes`. The existing `SignalingRoom` migration tag `v1` shows the
> shape.

---

## Schema

**Historical generic-room proposal.** Native groups now use the smaller, group-keyed schema in
`drizzle/0074_social_group_chat.sql` and `lib/schema/index.ts`. The proposal below is retained for
event-room planning; do not create a second group membership or message store alongside it.

**Group and event rooms only.** DM rooms do not appear here — they read and write `socialStatuses`
with `visibility: 'direct'`, per [Storage](#storage--one-transport-two-stores).

```ts
export const chatRoomScope = pgEnum('chat_room_scope', ['group', 'event']);

// One room per group or event. The scope column says which of the two FKs is
// set; exactly one is, enforced by the check constraint below.
export const chatRooms = pgTable(
  'chat_rooms',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    scope: chatRoomScope('scope').notNull(),
    groupId: text('group_id').references(() => socialGroups.id, {
      onDelete: 'cascade',
    }),
    eventId: text('event_id').references(() => events.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // A room belongs to exactly one thing. Without this, a row with both FKs
    // null is a room with no membership source — which means no auth gate.
    scopeTargetCk: check(
      'chat_rooms_scope_target_ck',
      sql`(${table.scope} = 'group' AND ${table.groupId} IS NOT NULL AND ${table.eventId} IS NULL)
       OR (${table.scope} = 'event' AND ${table.eventId} IS NOT NULL AND ${table.groupId} IS NULL)`
    ),
    groupIdx: uniqueIndex('chat_rooms_group_idx').on(table.groupId),
    eventIdx: uniqueIndex('chat_rooms_event_idx').on(table.eventId),
  })
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    roomId: text('room_id')
      .notNull()
      .references(() => chatRooms.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => socialActors.id),
    body: text('body').notNull(),
    replyToId: text('reply_to_id').references(
      (): AnyPgColumn => chatMessages.id
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    // The only read pattern that matters: newest N in a room, and paging back.
    roomCreatedIdx: index('chat_messages_room_created_idx').on(
      table.roomId,
      table.createdAt
    ),
  })
);
```

Three things worth calling out:

`actorId` is the author even for event rooms, whose _membership_ is keyed on `profileId`. The gate
bridges profile → actor on the way in (see [the gate](#the-authorization-gate)); storing the actor
keeps one author type across both stores, so the UI renders a DM author and a room author with the
same code.

`deletedAt` is a soft delete. Moderation needs to remove a message from the room without destroying
the evidence of what was removed — and unlike Nostr, where
`components/relay/groups/GroupDetail.tsx:290` has to warn that messages cannot be retracted, a
native store can actually honor a takedown.

`onDelete: 'cascade'` on `roomId` means deleting a group or event takes its chat with it. That is
deliberate: a room whose parent is gone has no membership source, so it could never be read again
anyway, and leaving the rows behind would just be an unreachable transcript.

---

## Do Not Copy The Signaling Auth Model

> **Warning: this is the one thing most likely to be got wrong by copying the existing DO.**

`/ws/signaling/:roomId` performs **no authentication**. It routes straight through to the DO, and
the DO trusts `data.userId` from the client's own `join` message. For a mentoring proof-of-concept
behind unguessable room IDs that is survivable. For chat it is a hole: anyone could open the socket
and claim to be anyone.

Browsers cannot set headers on a WebSocket, so the check belongs in the Worker — which **can** set
headers on the inner `stub.fetch`:

```ts
if (url.pathname.startsWith('/ws/chat/')) {
  const roomId = url.pathname.split('/')[3];

  // NOT `await auth()`. That reads `next/headers`, which only resolves inside a
  // Next server context — and worker/index.ts is the raw fetch handler that runs
  // *before* that context exists. Pass the request's headers explicitly instead.
  // This is also what lets a native mobile client authenticate: see the
  // resolveUserIdFromHeaders docblock in auth.ts.
  const userId = await resolveUserIdFromHeaders(request.headers);
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const member = await getRoomMembership(roomId, userId);
  if (!member || member.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  // The client cannot forge these: they are set server-side on the inner fetch.
  const authed = new Request(request);
  authed.headers.set('X-Pana-Actor-Id', member.actorId);
  authed.headers.set('X-Pana-Room-Role', member.role);

  const id = env.CHAT_ROOM.idFromName(roomId);
  return env.CHAT_ROOM.get(id).fetch(authed);
}
```

Both reads are database queries, so this branch must sit **inside `runWithDb`** — as `/ws/dm` does.

The DO reads identity from the header and **ignores any identity in the message payload**. Build it
this way in the first commit; retrofitting identity into a live chat protocol means a flag day.

---

## Roadmap

Two independent tracks. The DM track replaces the mail experience; the rooms track adds the two new
surfaces. Neither blocks the other.

> **DM track:** ~~DM chat view~~ → ~~[Path A](#path-a--live-delivery-on-the-mail-substrate)
> delivery~~ → **retire the `/updates` mail tabs** ← next. The first two have shipped; the tabs
> retire only once the view reaches parity with them.

The native group track is implemented: one room per group, storage-layer membership gates,
actor-mailbox invalidations, persistence, moderation, and both UI entry points.
The generic-room steps below remain planning material for **event rooms**.

### Step 1 — Room provisioning and the gate

The scope question is answered, so this replaces it. Create `chat_rooms` / `chat_messages`, and
write the three-branch gate **first** — before any transport — because it is the thing every other
step depends on being right, and it is testable without a socket.

- Group rooms are already keyed directly by the existing group ID; no provisioning step is required
- Event rooms: provisioned for every event; the gate excludes attendees without accounts per
  [signed-in attendees only](#event-rooms-admit-signed-in-attendees-only)
- No chat tab until a room has a floor of signed-in attendees — an absent tab reads better than an
  empty room
- Gate tests mirroring `tests-db/social-dm-requests.test.ts`: pending is not a member, banned is not
  absent, unverified RSVP is not an attendee

### Step 2 — Transport

- Chat DO class; binding with `new_sqlite_classes`
- Authenticated `/ws/chat/:scope/:id` upgrade per the snippet above, **in the first commit**
- Broadcast and reconnect, modelled on `SignalingRoom` minus the teardown

### Step 3 — Persistence

- The `app/api/internal/*` write path
- Backfill-on-join so a member who was offline gets history from Postgres, not just the DO buffer
- Account-deletion sweep includes chat

### Step 4 — Surface

- One chat UI across all three scopes, differing only in the room list it hangs off
- Moderation affordances: soft delete, and whatever the room's role model allows

---

## Risks & Open Questions

### ~~What is chat scoped to?~~ — answered (2026-10)

**Answered: DMs, groups, and events.** See [The three scopes](#the-three-scopes). This section is
kept because the reasoning that produced it still constrains what gets built.

The argument that settled it: real-time affordances **advertise liveness**. On a network of a few
hundred locals, a presence dot that always reads "offline" and a typing indicator that never fires
make a room look abandoned, where an async thread with three messages in it reads as perfectly
healthy. Chat earns its infrastructure where people are already talking — a group with a shared
purpose, an event with a guest list — not in a cold two-person thread.

**That rules out _affordances_ in a cold thread. It does not rule out _delivery_,** and delivery is
what the panas actually asked for — see
[Realtime delivery is not realtime affordances](#realtime-delivery-is-not-realtime-affordances).
Reading it as "no sockets near DMs" is the misreading to avoid. The practical consequence is the
split in Path A: DMs get live delivery and no presence; group and event rooms may earn presence
later, once there is evidence the rooms are populated enough for it to read as alive rather than
empty.

### ~~Can event chat include attendees without accounts?~~ — answered (2026-10)

**Answered: no. Only signed-up members can access chat.** Email-only and Nostr-only RSVPs cannot
authenticate, so they are not in the room. See
[Event rooms admit signed-in attendees only](#event-rooms-admit-signed-in-attendees-only) for what
that costs and the two mitigations that ship with it. Group rooms and DMs were never affected.

### ~~How long should a DM last?~~ — answered (2026-10)

**Answered: thirty days.** `DM_EXPIRY_DAYS = 30`, with `drizzle/0062_dm_expiry_30_days.sql`
extending messages already sent. The previous value was seven days, which expired mid-conversation —
the worst available moment, and invisible until the surface became a transcript. See
[DMs expire after thirty days](#dms-expire-after-thirty-days) for why expiry was kept rather than
dropped, and for the two deliberate properties of the backfill: it extends without reviving, and it
excludes stories.

### Member cap per room

Native group chat uses existing group membership without a new participant cap. Its mailbox
fan-out is concurrency- and time-bounded, with polling as a fallback. Event-room participant
limits remain an open design question; `SignalingRoom`'s three-person cap is not inherited.

### Other open questions

- **Does chat need federation at all?** Assumed no, per [Non-Goals](#non-goals).
- **Does the Postgres write path need to be synchronous with broadcast,** or can it lag? Lagging is
  cheaper and risks losing the tail of a room's history if a DO evicts mid-write.
- **Do relay groups eventually bind to native chat,** or stay fully separate? Staying separate is
  the assumption throughout. Note that `docs/RESILIENCE-ROADMAP.md:551` already plans a
  Nostr→ActivityPub bridge in the opposite direction, which may make this moot.
