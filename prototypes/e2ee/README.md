# E2EE feasibility lab

**Non-production first milestone. Live Pana DMs and group chats are unchanged
and are not end-to-end encrypted by this work. Use invented content only.**

## Run

```powershell
yarn install --immutable
yarn e2ee:lab
```

Open `http://127.0.0.1:3147` in separate browser profiles. The separate lab server
binds to loopback, refuses production mode, has no Pana account/session access,
and does not implement a message upload or relay API. Neither the prototype nor
its development dependency is imported by production app routes.

Each profile is an independent device. Two devices exercise DMs; three or more
exercise groups. Copy public contacts between devices, compare fingerprints
through a trusted channel, and explicitly trust every current device before
joining. Create a room, invite a peer, and copy the invitation to that peer.
Later additions/removals produce a commit that existing members must process.
New members receive only the new invitation, not past room secrets.

Copy outbound ciphertext into another device's inbound field. An attachment's
opaque object can be relayed with the envelope, but its key and filename are
inside authenticated ciphertext. Downloads use `application/octet-stream`,
not an executable peer-supplied media type.

The manual public-contact bootstrap is a laboratory trust model, **not account
authentication**. Do not equate an entered lab name with a verified Pana actor.

## What this implements

- RFC 9420 MLS using pinned MIT-licensed `ts-mls@1.6.4`, not a custom messaging
  protocol. The P-256/AES-128-GCM/SHA-256/P-256 suite avoids requiring WebCrypto
  Ed25519/X25519 support in older WebViews.
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
yarn test:e2ee
yarn playwright install chromium webkit
yarn test:e2ee:browser
```

Browser coverage uses isolated contexts (not several simulated users sharing
one key store), reloads IndexedDB state, exercises concurrent tabs, transfers
encrypted files and restores a backup. The phone project uses WebKit's iPhone
browser configuration, and a cross-engine pair exchanges messages between
desktop Chromium and phone WebKit. This is **not physical iOS/Android or Capacitor Keychain/
Keystore validation**. CI requires no production database, account or secrets.

## Production gate and remaining work

The selected MLS implementation explicitly states it has **not undergone a
formal security audit**. This milestone is a compatibility prototype, not an
approval to adopt it for security-critical production use. A reviewed
implementation/integration and independent specialist review remain required.
Its optional `@noble/curves` peer targets 2.0.1; the exercised P-256 path uses the
repository's existing 2.4.0 without downgrading that dependency. The peer/version
compatibility warning is another item to resolve in a production selection.
Signal's supported Node/native bindings are not a drop-in browser SDK;
OpenMLS's WASM/iOS/Android targets are built but not tested by its upstream CI.
Matrix's Rust/WASM crypto stack is another candidate, but it expects Matrix
device/key distribution and has different group-security tradeoffs. The lab
does not settle that production architecture choice.

Before any live rollout:

1. Select and independently review the production protocol implementation and
   integration, including browser-delivered-code and key-directory threats.
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
