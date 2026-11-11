# E2EE feasibility lab

**Non-production first milestone. Live Pana DMs and group chats are unchanged
and are not end-to-end encrypted by this work. Use invented content only.**

The owner selected **Pana-owned messaging on the existing backend**, not Matrix,
on 2026-11-10. The next steps are documented in the
[implementation plan](../../docs/CHAT-ROADMAP.md#pana-owned-e2ee-implementation-plan).
The lab now has two isolated engine modes: the original unaudited reference
and a pinned OpenMLS Rust/WASM qualification candidate. Neither is production
chat. The [engine boundary documentation](../../crypto/openmls/README.md)
records the exact pins, audit exclusions and remaining native-device gates.

## Run

```powershell
yarn install --immutable
yarn openmls:build
yarn e2ee:lab
```

Install the pinned Rust/linker and wasm-bindgen prerequisites from the engine
documentation before building. Generated JS/WASM is intentionally not committed.

Open `http://127.0.0.1:3147` for the reference engine or
`http://127.0.0.1:3147/?engine=openmls` for the candidate, in separate browser
profiles. Use the same mode for every participant in a room; the two modes
use different suites/contact formats and separate encrypted local stores.
An unsupported or failed engine selection never falls back to the reference.
The separate lab server
binds to loopback, refuses production mode, does not integrate with Pana
authentication or its mailbox/chat APIs, and does not implement a message
upload or relay API. Its filesystem allowlist
is limited to lab modules, generated crypto artifacts and dependencies, not
the whole workspace; local environment and Git files are denied. Neither the prototype nor
its development dependency is imported by production app routes.

Each profile is an independent device. Two devices exercise DMs; three or more
exercise groups. Copy public contacts between devices, compare fingerprints
through a trusted channel, and explicitly trust every current device before
joining. Create a room, invite a peer, and copy the invitation to that peer.
Later additions/removals produce a commit that existing members must process.
New members receive only the new invitation, not past room secrets.

In OpenMLS mode, explicitly accept the pending commit on its author after
simulating durable relay acceptance, then relay it to existing members.
Application sending is blocked before that acknowledgement. The button is a
lab simulation, not production delivery authorization or a real server receipt.
Do not treat a timeout as acceptance or rejection.

Copy outbound ciphertext into another device's inbound field. An attachment's
opaque object can be relayed with the envelope, but its key and filename are
inside authenticated ciphertext. Downloads use `application/octet-stream`,
not an executable peer-supplied media type.

The manual public-contact bootstrap is a laboratory trust model, **not account
authentication**. Do not equate an entered lab name with a verified Pana actor.

## What this implements

- RFC 9420 MLS, not a custom cryptographic protocol. The reference uses
  MIT-licensed `ts-mls@1.6.4` with P-256/AES-128-GCM/SHA-256/P-256. The OpenMLS
  candidate uses the mandatory X25519/AES-128-GCM/SHA-256/Ed25519 suite in WASM,
  without requiring WebCrypto's Ed25519/X25519 implementation.
- Explicit credential/signing-key pinning instead of the library's allow-all
  authentication default. Unknown credentials and changed pinned keys fail.
- Group additions and removals, private commits, authenticated messages, replay
  rejection, tamper rejection, and no plaintext fallback.
- AES-256-GCM attachment encryption with random per-file keys. Filename, media
  type and file bytes are encrypted; keys travel only inside MLS.
- Encrypted local device/ratchet state in IndexedDB using a non-extractable
  wrapping key. Same-profile browser tabs use Web Locks. Mutated state is
  persisted **before** an outbound frame is displayed. A retry returns the
  original envelope rather than encrypting again with a rolled-back ratchet.
- AES-256-GCM history backups with a random 256-bit personal recovery key.
  Version, purpose and profile/file identity are authenticated as additional
  data. Recovery restores retained history on a fresh device, not old live
  device keys or ratchet state. Expired entries are excluded.
- Message rendering as text only and opaque attachment downloads. No private
  contents, backup keys or live state are logged or sent to a network service.

Local device state and history backups are deliberately different formats.
`exportLocalSecrets()` is solely an in-process interface to encrypted local
storage; its result must never be treated as a public backup or relay payload.
Non-extractable browser keys do not defend against malicious same-origin code,
XSS, a compromised browser/OS, or an attacker using an unlocked device.
Local state and backup objects are bounded to 64 MiB of plaintext before
encryption. This is a feasibility limit, not a production storage quota.
Public device contacts, room identifiers, timing and ciphertext sizes are not
hidden. End-to-end encryption is not anonymity.

## Recovery exercise

Generate and save the personal recovery key separately, then encrypt a history
backup. Move only that encrypted backup to the replacement device. Restore with
the recovery key using the same invented profile name. The replacement can read
retained history but has a new device identity and no active room: existing
members must independently verify and invite it. Forgetting the lab device
deletes only this lab's local records and clears the displayed recovery key;
it is not remote device revocation.

A copied recovery key exposes the retained history in a corresponding backup.
Losing both usable devices and the recovery key means losing recoverability.
Copies already downloaded by another member cannot be recalled.

## Verification

```powershell
yarn openmls:check
yarn openmls:audit
yarn test:openmls:rust
yarn openmls:build
yarn test:openmls
yarn test:e2ee
yarn playwright install chromium webkit
yarn test:e2ee:browser
```

Browser coverage uses isolated contexts (not several simulated users sharing
one key store), reloads IndexedDB state, exercises concurrent tabs, transfers
encrypted files and restores a backup. The phone project uses WebKit's iPhone
browser configuration, and each engine exchanges messages between
desktop Chromium and phone WebKit. Failure injection verifies that aborted
local saves publish neither new outbound ciphertext nor decrypted attachments,
and exact receive retries remain usable. Known plaintext, filenames and
recovery keys are checked against HTTP URLs/bodies and outbound WebSocket
frames, not just against non-GET traffic.
This is **not physical iOS/Android or Capacitor Keychain/
Keystore validation**. CI requires no production database, account or secrets.

## Production gate and remaining work

The reference library explicitly states it has **not undergone a formal
security audit**. Do not select it for security-critical production use merely
because it passes the shared scenarios. The OpenMLS candidate has separate,
component-specific audit evidence and a pinned upstream provider snapshot;
neither our bindings nor the whole current dependency stack inherit a blanket
audit approval. Independent integration review remains a release checkpoint.
Its optional `@noble/curves` peer targets 2.0.1; the exercised P-256 path uses the
repository's existing 2.4.0 without downgrading that dependency. The peer/version
compatibility warning is another item to resolve in a production selection.
Signal's supported Node/native bindings are not a drop-in browser SDK;
OpenMLS's WASM/iOS/Android targets are built but not tested by its upstream CI.
Matrix's Rust/WASM stack was evaluated, but the owner selected the Pana-owned
MLS architecture instead. Software compatibility now has executable OpenMLS
evidence; physical-device qualification and the production engine decision
remain open. The lab does not enable E2EE in the app.

Before any live rollout:

1. Qualify and pin the production MLS implementation/bindings. Plan independent
   review of the engine/integration, including browser-delivered-code and
   key-directory threats, as a release checkpoint rather than a reason to stop
   preparatory engineering.
2. Implement account/profile-authorized enrollment, signed device membership,
   verification, revocation, key rotation, offline sequencing, lost-device
   recovery, and native secure storage. Do not copy the manual lab trust model.
3. Add ciphertext-only DM/group APIs and private media storage, preserving
   blocking, consent requests, transactional group membership, retry
   idempotency, and authorization on every read/write. Reconcile MLS membership
   with those authoritative rules; crypto alone is not authorization.
4. Wire encryption/decryption into the actual messaging clients. Keep previews,
   search and rendering on-device; prevent content/key leaks through logs,
   SSR, analytics, notifications, and crash reports. Older clients must not
   downgrade encrypted conversations.
5. Extend existing safety reporting with explicit consent to disclose a limited
   message selection. Existing reports do not accept media attachments; do not
   route private/illegal media into email or the general support queue.
6. Approve explicit legacy-history, federation compatibility, retention, backup
   expiry and legal-preservation policies. Existing plaintext history cannot
   become retroactively private. No historical records are deleted or migrated
   by this milestone.
7. Complete physical-device, WebView lifecycle, cross-version and adversarial
   integration exercises, then stage a limited opt-in beta. Never describe
   all live chats as encrypted merely because the lab passes.

Sources: [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html),
[pinned library and audit disclaimer](https://github.com/LukaJCB/ts-mls/tree/v1.6.4),
[Signal support boundaries](https://github.com/signalapp/libsignal),
[OpenMLS platforms](https://github.com/openmls/openmls#supported-platforms).
