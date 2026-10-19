# Chat — Design & Roadmap

> **STATUS**: **Proposal. Nothing here is implemented.** No migration, table, route, Durable Object,
> or component described below exists yet.
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
> ship without it.

## Table of Contents

- [Overview](#overview)
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

## Overview

Panas should be able to talk to each other in real time without installing anything. The constraint
that decides most of what follows was stated by the product owner:

> _"I don't want users to leave the pana system, so I'd rather build the chat and groups in our
> site."_

Today there is **no chat UI anywhere in this repo.** The closest thing that ships is
`/r/groups`, which hands panas a deeplink to a third-party Nostr client —
`components/relay/ImportInstructions.tsx:7` hardcodes
`https://web.nostrord.com/?relay=relay.panamia.club&group=panamia-test`. Nostrord, Amethyst, and
0xchat are where the talking currently happens, which is precisely the outcome the constraint rules
out.

### Goals

- Real-time messaging inside panamia.club — no app install, no client handoff
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

| What breaks                | Where                                         | Why it matters                                                         |
| -------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| **Federation**             | ActivityPub direct addressing                 | A DM to a Mastodon account works today. Chat does not federate at all. |
| **Voice memos**            | `components/social/VoiceMemoComposer.tsx:331` | Shipped feature; sends `visibility: 'direct'`                          |
| **The DM consent gate**    | `lib/federation/wrappers/dm-gate.ts`          | `allow`/`hold`/`refuse`, the Requests folder, the no-notify property   |
| **Block / mute semantics** | `isBlockedEitherWay`, `filterHiddenActorIds`  | Already audited against the status read path                           |
| **Moderation**             | A DM is a status, so status tooling applies   | A chat transcript is not a status; nothing we built would apply        |
| **Test coverage**          | `tests-db/social-dm-requests.test.ts`         | 12 assertions on hold/accept/delete/block/policy behaviour             |

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
  was documented — `docs/FEATURES.md` told panas voice memos auto-expire — and somebody may have
  sent something they would not have sent otherwise. Honouring that costs old history nobody
  currently sees; breaking it costs somebody a reasonable expectation of privacy, and cannot be
  undone once they have seen it.
- **It excludes stories.** `social_statuses` has two writers of `expires_at`: DMs, and stories at
  `STORY_LIFETIME_HOURS = 24`. There is no `visibility` column to filter on, so `type <> 'Story'` is
  what keeps a one-day story from becoming a month-long post.

### What the UI still owes

The number changed; the obligation did not. A transcript that drops messages without saying so is
still the one option not available. `/mock/dm-chat` renders the remaining time per message, and
whatever ships has to do the same or better.

---

## Storage — one transport, two stores

This is the central design call, and it follows directly from the table above.

**DM rooms read and write `socialStatuses` (direct).** They keep federation, the consent gate, voice
memos, block filtering, moderation, and the existing tests — none of which have to be touched.

**Group and event rooms read and write a new `chat_messages` table.** Neither has anything to
inherit: there is no federated group-chat story, no event-chat substrate, and no existing consent
model for either. They are local-only by design, which the [Non-Goals](#non-goals) already assume.

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

One function, three branches, each delegating to the table that already owns the answer. Follows the
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
- _"Two parallel DM systems unless the direct-status path is retired, and voice memos live on that
  path."_
- _"Block, mute, and report all need re-implementing against a second store."_
- _"Moderation gets harder: a transcript is not a status, so nothing we built applies."_

Every one of those is caused by `chat_messages` being a new table, not by the socket. Adding a
socket in front of `socialStatuses` pays none of them: federation still works because the message is
still a status, block filtering still applies because it is the same read path, moderation still
applies because it is the same row, and voice memos keep working because nothing moved.

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
arrives on it regardless of which thread is on screen — which is also what makes an unread badge
live, for free.

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
`https://panamia.club` — the same Worker this document describes. Its own words: _"cookies, auth and
routing all behave exactly as they do in a browser on that origin."_ So `use-dm-socket.ts` builds
`wss://panamia.club/ws/dm` from `location`, the WebView sends the session cookie on a same-origin
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

Path A is the DM half. Group and event rooms use the same transport pattern but a different DO
scope — a **room** DO rather than an actor mailbox — because their membership is a set that the
server already knows, and a room broadcast is O(members) once rather than N mailbox hops.

|           | DM                        | Group / event         |
| --------- | ------------------------- | --------------------- |
| DO scope  | per recipient actor       | per room              |
| DO stores | nothing                   | recent history buffer |
| Store     | `socialStatuses` (direct) | `chat_messages`       |
| Federates | yes                       | no                    |

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

The steps below are the **group and event rooms** track.

### Step 1 — Room provisioning and the gate

The scope question is answered, so this replaces it. Create `chat_rooms` / `chat_messages`, and
write the three-branch gate **first** — before any transport — because it is the thing every other
step depends on being right, and it is testable without a socket.

- Group rooms: auto-provision on group creation, or lazily on first open
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

`SignalingRoom` caps at `MAX_PARTICIPANTS = 3`. A chat room needs a real number, and the DO
broadcast loop is O(members) per message.

### Other open questions

- **Does chat need federation at all?** Assumed no, per [Non-Goals](#non-goals).
- **Does the Postgres write path need to be synchronous with broadcast,** or can it lag? Lagging is
  cheaper and risks losing the tail of a room's history if a DO evicts mid-write.
- **Do relay groups eventually bind to native chat,** or stay fully separate? Staying separate is
  the assumption throughout. Note that `docs/RESILIENCE-ROADMAP.md:551` already plans a
  Nostr→ActivityPub bridge in the opposite direction, which may make this moot.
