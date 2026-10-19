# Relay Protocol Tests

Protocol-level tests for the panamia-nosflare relay (`wss://relay.panamia.club`).
Kept separate from the Playwright suite (`tests/`) — these speak raw Nostr
WebSocket frames, no browser involved.

## Running

```
yarn test:relay                                # against the default RELAY_URL
RELAY_URL=wss://staging.example yarn test:relay
```

## What's tested

`acl.test.ts` exercises the NIP-29 access-control matrix backed by the seeded
`panamia-test` group:

- relay-wide membership gate (`/api/internal/relay/check`)
- group-write gating (`h` tag required, must be a member)
- panamia-managed kind rejection (9000-series)
- advisory join/leave (9021/9022) accepted but not persisted
- REQ-time filter narrowing on `#h`
- broadcast-side membership filter (covered indirectly via the read tests)

## Adding tests

`helpers.ts` exposes:

- `signEvent(skHex, partial)` — Schnorr sign a Nostr event from a hex secret.
- `connectAndAuth(skHex)` — open a `ws://` connection and complete NIP-42 AUTH.
- `publish(ws, skHex, partial)` / `request(ws, subId, filter)` — single-shot helpers.

The tests assume the seeded `panamia-test` group exists and contains both
pubkeys from `.relay-test-keypairs.json`. If those drift, update the constants
at the top of the test file rather than re-seeding.
