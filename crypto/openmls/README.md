# OpenMLS engine qualification

**Client-side, synthetic-data qualification code. Live Pana messages are still
server-readable. This is not a production enrollment, delivery or recovery SDK.**

The Pana-owned architecture is defined in the
[chat roadmap](../../docs/CHAT-ROADMAP.md#pana-owned-e2ee-implementation-plan).
This crate implements its first engine boundary, not the remaining product
integration. Nothing here is imported into live app routes or server handlers.

## Reproducible inputs

`engine-lock.json`, `Cargo.toml`, `Cargo.lock` and `rust-toolchain.toml` pin:

| Input                                         | Selection                                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Protocol                                      | MLS 1.0, RFC 9420                                                                                     |
| Suite                                         | `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`                                                        |
| Core                                          | crates.io `openmls` 0.9.2, SHA-256 `ce4173f914cbc2dd28d9499f19e92f3e1bfebd9eea1607889924a77ca63d3ffc` |
| Core source                                   | `8a8f83b4b61fc45f28facec25e914992b3465de6`                                                            |
| Provider, credentials, traits, memory storage | Official OpenMLS source `6100df3fb1d8c3eeab53e349fcbd621f98c44fe2`, package versions 0.6.0            |
| Rust                                          | 1.99.1                                                                                                |
| wasm-bindgen                                  | 0.2.130                                                                                               |
| Advisory tools                                | cargo-audit 0.23.0, cargo-deny 0.20.2                                                                 |

The provider source pin is deliberate, not a floating `main` dependency.
The released 0.6.0 provider/credential packages resolved vulnerable
`crypto-bigint` 0.5.5 and `libcrux-kem` 0.0.9 in the lockfile. The upstream
snapshot uses the maintained dependency generation; our lock resolves
`crypto-bigint` 0.7.11 and `libcrux-kem` 0.0.10. See
[RUSTSEC-2026-0387](https://rustsec.org/advisories/RUSTSEC-2026-0387),
[RUSTSEC-2026-0330](https://rustsec.org/advisories/RUSTSEC-2026-0330) and
[RUSTSEC-2026-0331](https://rustsec.org/advisories/RUSTSEC-2026-0331).
No cryptographic algorithm was patched or implemented locally.

**These provider snapshots are not an approved production release.** Revisit
published patched releases and rerun qualification before launch. The build
rejects an unexpected core checksum, provider revision, compiler, binding
generator or OpenMLS feature set. Only the core `js` feature is allowed;
default, test, unchecked, experimental and draft features are not enabled.

### Audit scope

The [SRLabs report](https://blog.openmls.tech/SRL-OpenMLS_security_assurance_assessment.pdf)
is version 1.2, dated March 11, 2026, reviewing code through `a3402f2`
from October 22, 2025. Its SHA-256 is recorded in `engine-lock.json`.
Its scope covers the MLS core, traits and basic credentials, **not crypto or
storage providers, delivery/client examples, our new bridge, or the later
changes in these pins**. Passing this harness is not independent security
review and does not extend that report's assurance to the entire stack.

## Build and checks

Use the repository's Node/Yarn versions and a working native Rust linker.
On Windows that normally means the matching C++ build tools; a GNU toolchain
also needs its matching linker and import-library tools. Installing Rust alone
does not supply every native build prerequisite.

```powershell
rustup toolchain install 1.99.1 --profile minimal --component rustfmt --component clippy --target wasm32-unknown-unknown
cargo +1.99.1 install wasm-bindgen-cli --version 0.2.130 --locked
cargo +1.99.1 install cargo-audit --version 0.23.0 --locked
cargo +1.99.1 install cargo-deny --version 0.20.2 --locked
yarn install --immutable
yarn openmls:check
yarn openmls:audit
yarn test:openmls:rust
yarn openmls:build
yarn test:openmls
yarn test:e2ee
yarn playwright install chromium webkit
yarn test:e2ee:browser
```

`scripts/openmls.ts` runs Cargo from this directory so the pinned toolchain
applies. It verifies the dependency source/features before building or testing.
`pkg/pana_openmls.d.ts` is generated and checked in; do not edit it manually.
Generated JS/WASM, `pkg/build-info.json` and `target/` are ignored. Build metadata
records the actual WASM size/hash, source/manifest/lockfile/binding hashes,
compiler host and source pins. The interoperability suite rejects stale or
mismatched artifacts instead of testing an older successful build.

The advisory command uses standard tools, not a custom scanner:

- Cargo audit checks the entire lockfile and fails on known vulnerabilities.
- Cargo deny rejects advisory warnings, unmaintained and yanked dependencies
  in the actual WASM and native-compiler-host graphs. There are no advisory
  ignore lists. CI also exercises the Linux host graph.

Whole-lockfile audit currently displays the unmaintained
[`proc-macro-error2` notice](https://rustsec.org/advisories/RUSTSEC-2026-0173)
through `hax-lib` 0.3.7 / `core-models` 0.0.7. That analysis/model dependency
is absent from the checked WASM, Windows GNU and Linux build graphs; the notice
is **not hidden or waived for a compiled dependency**. Changing features,
targets or provider revisions requires rechecking this distinction.
These checks do not replace review of unreported defects or source changes.

## Boundary and formats

`src/lib.rs` exposes a small checked WASM interface:

- `new`, `publicKey`, `deviceIdentity`, `keyPackage`, `describeKeyPackage` and
  `approveIdentity` manage an in-memory device and explicit signing-key pins.
  A raw TLS KeyPackage is not an `MLSMessage` wrapper. Key packages are
  single-use; production needs an authenticated claim/consume queue.
- `createRoom`, `addMember`, `removeMember` and `joinRoom` maintain private-wire
  groups. Invitations are complete MLS Welcome messages. Existing members
  process private MLS commits, not the new member's Welcome.
- A locally staged membership change blocks application sends and additional
  membership changes until `acknowledgeCommit`. The caller must first verify
  durable acceptance of **that exact attempt** by its delivery service.
  A timeout is not acceptance or rejection. `discardRejectedCommit` is only
  for explicit rejection and must not rewind the ratchet.
- `encryptMessage`, `processMessage` and `roomInfo` exchange private TLS MLS
  frames and return authenticated local results. Own echoes, standalone
  proposals, malformed/trailing data, bad credentials and replay fail
  explicitly. Epochs cross the JS boundary as decimal strings.
- `snapshotLocal` / `restoreLocal` contain **raw private keys and live ratchets**.
  The inner Rust format is version 2 and binds the provider revision.
  Only authenticated, profile-bound local wrapping may store or restore it.
  It is never a relay payload, downloadable backup or replacement-device format.
  Incompatible state is rejected, not silently deleted.

Qualification limits are 1 MiB per frame, 512 KiB per application payload and
64 MiB per raw native snapshot. These are harness bounds, not approved product
quotas. Rust/WASM disposal is best-effort cleanup, not a guarantee of erasing
all JS strings, engine copies or OS memory.

`lib/e2ee/openmls-qualification.ts` provides the synthetic lab adapter. Its
contact/invitation JSON has an explicit `openmls-0.9.2` engine tag; it is not
interchangeable with the older reference lab's invitation encoding. Cached
public prekeys renew after 24 hours without changing identity, room ratchets
or still-unconsumed invitation keys. This is not a production key-package pool.
Trust all intended participants before joining; a rejected invitation can
consume its one-time private prekey and require a fresh invitation.

The shared store encrypts local state and exact retry envelopes together,
serializes tabs with Web Locks and publishes results only after IndexedDB
commits. A failed operation can still consume crypto state; persist that state
before surfacing the failure. A failed save must publish neither new outbound
ciphertext nor a newly decrypted attachment. History-only backups restore
retained history onto a fresh device, not these native snapshots.

## Qualification evidence and remaining gates

Recorded software checkpoint for this change:

| Surface                 | Evidence                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Native engine           | 9 Rust cases passed on Windows GNU                                                                                           |
| WASM/independent peer   | 4 Node cases passed, with artifact/source consistency checks                                                                 |
| Reference compatibility | 13 focused cases passed                                                                                                      |
| Browser peers           | 26 scenarios passed across reference/OpenMLS Chromium and phone-WebKit; 2 duplicate cross-engine cases intentionally skipped |
| Dependency graphs       | WASM, Windows GNU and Linux advisory checks passed without ignore entries; inactive model notice remains visible             |
| Build boundary          | Production build passed; 1,650 compiled files inspected with no qualification engine/assets included                         |
| Physical phones         | Not yet run; no Android/iOS or protected-keystore qualification claim                                                        |

The checked boundary exchanges standard private frames with an independent
`ts-mls` peer in both group-founder directions. Native cases cover pins,
private messages, malformed/replayed frames, one-time prekeys, staged/rejected
commits, reloads, join-time history and removal despite ignored control frames.
Browser scenarios also cover encrypted media, history recovery, concurrent
tabs, persistence failures and known-secret leakage in HTTP URLs/bodies and
outbound WebSocket frames.

This is interoperability and supported-flow coverage, **not a claim that every
MLS feature or complete conformance suite has been qualified**.
Chromium/phone-WebKit contexts are software checks, not physical phones.

Still required before the P1 platform decision is complete:

1. Run in actual supported Android/iOS Capacitor WebViews, including cold
   restart, backgrounding, storage pressure and OS/browser upgrades. The
   current Windows host has no authorized Android device connected and cannot
   perform an Xcode/iPhone build.
2. Record physical-device capability/results and the native protected-key
   storage contract. IndexedDB non-extractable keys are not Android Keystore
   or iOS Keychain qualification. Specify OS-backup/device-migration boundaries
   so live device keys and ratchets cannot be restored as a second live clone.
3. Review the pinned provider/source deltas, runtime delivery and binding
   threat model; revisit released dependency versions before a production pin.

P2-P8 remain product work. Synthetic names and the global approved-key map
are **not Pana profile ownership, device approval or per-room role authority**.
The manual lab ACK is **not a server receipt**. Real authorization/membership
intent must also prevent stale-epoch sends after removals, reconcile competing
commits and preserve consent/blocks. New ciphertext delivery, private R2 media,
native key protection, production backup UX, message/report integration and
release review are not implemented by this crate.

E2EE does not hide routing metadata or protect against an unlocked/compromised
endpoint, XSS, malicious same-origin client code, or a recipient sharing content.
No live chats or historical plaintext have been migrated, deleted or activated.
