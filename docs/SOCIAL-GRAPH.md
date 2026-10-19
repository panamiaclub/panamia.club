# Social Graph — Model, Discovery & Safety

> **STATUS**: Mixed. Read the status of each section before building from it.
>
> - **[The Model](#the-model)** — **shipped and now ratified.** Pana = mutual follow. This section
>   documents a decision to _keep_ existing behaviour, not to change it.
> - **[Naming](#the-word-does-three-jobs)** — **copy fixes pending.** The word currently carries
>   three different meanings in shipped UI.
> - **[Follows You badge](#decision-1--the-follows-you-badge)** and
>   **[owner-only Pana count](#decision-2--the-pana-count-is-owner-only)** — **approved, not built.**
> - **[Discovery](#a--discovery-through-shared-activity)** and **[Block & mute](#b--block--mute)** —
>   **proposals.** No table, route, or component described there exists.
>
> The next free migration number is `0052` (`origin/main` holds through `0050_social_blocks`;
> `0051_social_dm_requests` is claimed by the DM-gating branch).

## Table of Contents

- [Why This Document Exists](#why-this-document-exists)
- [What Already Exists](#what-already-exists)
- [The Model](#the-model)
- [The Word Does Three Jobs](#the-word-does-three-jobs)
- [Decision 1 — The "Follows You" Badge](#decision-1--the-follows-you-badge)
- [Decision 2 — The Pana Count Is Owner-Only](#decision-2--the-pana-count-is-owner-only)
- [Decision 3 — Mutual Panas](#decision-3--mutual-panas)
- [A — Discovery Through Shared Activity](#a--discovery-through-shared-activity)
- [B — Block & Mute](#b--block--mute)
- [C — Safety Beyond Blocking](#c--safety-beyond-blocking)
- [Roadmap](#roadmap)
- [Risks & Open Questions](#risks--open-questions)

---

## Why This Document Exists

`SOCIAL-ROADMAP.md` covers the federation plumbing — actors, statuses, inbox delivery, what is
imported from activities.next. It does not describe the _relationship model_: what a connection
means, who can see it, and how two panas who should know each other actually find one another.

That gap is why the same word ended up meaning three different things in shipped UI, and why
discovery still falls back to "recently joined" for anyone without a graph.

The product goal that decides most arguments below, stated by the product owner:

> _"I want to prioritize connection, and at the same time I want to make it easy for panas to find
> each other."_

Those two goals pull in different directions more often than they look like they should, and most
of the reasoning here is about which one wins where.

---

## What Already Exists

Everything in this section was read from the code, not inferred. File references are current as of
this document's commit.

### Follows are asymmetric and nobody approves anything

| Case                      | Status on insert | Where                                                |
| ------------------------- | ---------------- | ---------------------------------------------------- |
| Local → local             | `accepted`       | `lib/federation/wrappers/follow.ts` (`createFollow`) |
| Local → remote            | `pending`        | same — awaits a remote `Accept`                      |
| Remote → local (incoming) | `accepted`       | `lib/federation/inbox-handler.ts` (~L145)            |

Incoming federated follows are accepted outright, with an auto-`Accept` sent back. The code's own
comment calls this "immediately accepted for POC."

**The `social_follow_status` enum is misleading.** It is `pending | accepted | rejected`
(`lib/schema/index.ts` L128) and defaults to `pending`, but:

- `pending` only ever applies to _outbound remote_ follows waiting on another server.
- **`rejected` is never written anywhere in the codebase.**
- There is no accept/reject endpoint. No approval UI exists because no approval exists.

The effective model is Twitter-public / Mastodon-unlocked.

### A Pana is a mutual follow

`countMutualFollows` and `listMutualFollows` (`follow.ts` L318, L336) self-join `social_follows`
through a `reciprocal` alias, requiring **both** directions to be `accepted`. Following four
hundred people produces zero Panas unless they follow back.

This is already a real permission boundary, not a label. `GET /api/social/actors/[username]/panas`
returns `count` to everyone and the `actors` list only to signed-in viewers — see
[Decision 2](#decision-2--the-pana-count-is-owner-only), which changes this.

### Discovery is graph-only, and local-only

`listSuggestedActors` (`follow.ts` L360–487) returns two tiers:

1. **Panas in common** — a bilateral graph walk, carrying a real `mutualCount`.
2. **Recently joined locals** — cold-start filler, `mutualCount: 0`.

Suggestions are deliberately local-only. A mixed local/remote list cannot label its buttons
truthfully, because a remote follow sits `pending` and "Following" would be a lie on half the
cards.

Tier 2 is the honest part of the problem: it is the system admitting the graph cannot help someone
who does not already have one.

### There is no block or mute

No table, no route, no UI. `listSuggestedActors` flags this explicitly — when blocking lands it
must be subtracted there too, "or this module becomes the one place a blocked account reappears."

---

## The Model

**Decision: keep Pana = mutual follow. Derived, never requested, never approved.**

```mermaid
graph LR
    A[Follow<br/>one-way, instant] --> B[Pana<br/>mutual, derived]
    B --> C[Gated surfaces<br/>panas list, future lists/attendance]
    A -.->|no request, no rejection event| A
```

### Why not a friend model

The friend model's real cost in a small local scene is **rejection**. Declining a stranger on a
global network is free. Declining someone you will see at a show in Little Haiti next month is
socially loaded — and so is the request that sits unanswered for three weeks.

A derived mutual never generates that event. You simply do not follow back, and _"I didn't get
around to it"_ stays permanently available to both parties. In a community where everybody
overlaps in person, that ambiguity is a feature.

There is a technical cost too: ActivityPub is follow-shaped. An approval model means either locked
accounts with follow requests or fighting the protocol.

### Why the name is right

Not novelty — **reciprocity is already in the word.** _Somos panas_ takes two people. You can
follow someone unilaterally; you cannot really be someone's pana unilaterally.

So the mutual definition is not a technical constraint bolted onto a warm word. It is the meaning
the word already has in the language this community speaks, which means the concept explains
itself without a tooltip.

### Honest note on prior art

The mechanism is not new:

- **Snapchat** is the close precedent — add someone, they add back, you are friends and features
  unlock. No approval dialog; the mutual state _is_ the relationship.
- **"Mutuals"** is a universal folk concept on Twitter, Bluesky and Instagram. All three show a
  _follows you_ badge. None of them make it a named tier.

What is uncommon is the **combination**: a derived mutual that is both _named_ and _load-bearing
for permissions_. On Twitter, mutuals is a vibe. Here it is a capability. That combination is the
distinctive part — the underlying graph operation is ordinary, and we should not tell ourselves
otherwise.

### Local-first precedent worth keeping in view

The most durable local networks de-emphasise the person graph entirely:

| Approach    | Example                     | Organising unit   |
| ----------- | --------------------------- | ----------------- |
| Place-first | Nextdoor, Front Porch Forum | Verified address  |
| Group-first | Buy Nothing, Discord, Band  | The group         |
| Event-first | Meetup, Partiful            | Co-attendance     |
| Vouch       | Lobsters, Metafilter        | Invitation chains |
| Capped      | Path (~150, Dunbar)         | Scarcity          |

Front Porch Forum has run for years in Vermont with essentially no social graph — it is a
neighbourhood digest. Buy Nothing is hyperlocal groups with no friending. Their shared lesson is
that in local community, **place and activity carry the connective load that a follow graph
carries globally.** That lesson is what [section A](#a--discovery-through-shared-activity) acts on.

---

## The Word Does Three Jobs

This is already shipped and already inconsistent.

| Where                                                                              | Meaning           | Kind       |
| ---------------------------------------------------------------------------------- | ----------------- | ---------- |
| Rail stat, suggestions copy, `/panas` endpoint                                     | Mutual follow     | Bilateral  |
| **Feed tab "Panas"** (`feed-page.tsx` L47)                                         | People you follow | Unilateral |
| "Ask the Panas", "hosted by Panas", "N Panas going", "Find Panas in the directory" | Any member        | Everyone   |

The codebase already knows. `feed-page.tsx` carries a comment flagging it as a live hazard:

> _"'Panas' in particular means mutual follows elsewhere in this product (the rail counts them that
> way), while `/api/social/timeline` documents itself as 'posts from followed accounts + own'. The
> label is the one the design approved; the hint is what the endpoint actually returns, and the two
> must not be allowed to drift apart silently."_

A full-sentence hint was used to paper over the conflict rather than resolve it.

### Resolution

**"Pana" is reserved for the mutual relationship.** The loose "any member" usages become
_members_ / _the community_ / _Pana Mia members_.

Strings to change (roughly six, all cheap):

| File                    | Current                                            |
| ----------------------- | -------------------------------------------------- |
| `feed-modules.tsx` L94  | "Markets, workshops, and dinners hosted by Panas." |
| `feed-modules.tsx` L149 | "N Panas going"                                    |
| `feed-page.tsx` L160    | "Ask the Panas something…"                         |
| `feed-page.tsx` L306    | "go and find Panas"                                |
| `feed-page.tsx` L316    | "Find Panas in the directory…"                     |
| `stories-rail.tsx` L9   | "the panas they follow"                            |

**The feed tab is renamed `Following`, not made mutual-only.** On a network this young a
mutuals-only timeline would be close to empty, and an empty feed is the worst available first
impression. The label changes to match the endpoint; the endpoint does not change to match the
label.

---

## Decision 1 — The "Follows You" Badge

**Status: approved, not built.**

Derived-mutual has one well-known failure mode: **it is invisible.** Nothing tells you why a
surface unlocked. Twitter gets away with it because nothing depends on mutuals. Here things do.

So the relationship state must be legible wherever a follow decision is offered:

| Viewer sees                | Badge           | Action label |
| -------------------------- | --------------- | ------------ |
| They follow you, you don't | **Follows you** | Follow back  |
| You follow, they don't     | —               | Following    |
| Both                       | **Pana**        | Following    |
| Neither                    | —               | Follow       |

Surfaces: profile header, suggestion cards, follower/following lists, directory results.

The row that earns this feature is the first one. "Follows you" turns a hidden mechanic into a
connection prompt — it tells somebody they are one tap away from a Pana. That single badge does
more for the connection goal than any counter, because it is actionable rather than decorative.

`getFollowRelationship` already exists in `follow.ts` and returns both directions, so the data is
there. This is a rendering change plus making sure list endpoints carry the pair.

---

## Decision 2 — The Pana Count Is Owner-Only

**Status: approved, not built.** Product owner:

> _"In the main page the user sees how many panas they have, but it's hidden when others see their
> page. So it's a detail only they have."_

### What changes

| Surface                             | Today       | After                             |
| ----------------------------------- | ----------- | --------------------------------- |
| Own feed rail (`feed-rail.tsx` L92) | Count shown | **Unchanged** — already self-only |
| Own profile                         | Count shown | Count shown                       |
| Someone else's profile              | Count shown | **Hidden**                        |
| `/panas` `count` for a non-owner    | Returned    | **Not returned**                  |

The feed rail needs no change — it only ever renders the signed-in user's own sidebar.

### Three consequences that must land together

**1. The list has to follow the count.** Today `canSeeList` is `Boolean(session?.user?.id)` — _any_
signed-in viewer can read the full list of who you are panas with. Hiding the aggregate while
leaving every name readable is incoherent, and worse than doing nothing: it would look like
privacy without being privacy. If the count is owner-only, `canSeeList` must become
`session.user.id === owner`.

**2. The route's docblock currently argues the opposite.** It justifies a public count on the
grounds that "every person inside it chose the connection from both sides, so it reveals nothing
one party can impose on another." That reasoning is sound and this decision overrides it anyway,
on different grounds: a visible count is a vanity metric, and vanity metrics build audiences rather
than connections. **The comment must be rewritten in the same commit as the behaviour.** A comment
left contradicting its code is exactly how the last production defect stayed invisible.

**3. The Panas tab disappears for visitors.** `personal-profile.tsx` renders Panas as both a stat
(L70) and a tab. For a non-owner, the tab must not render at all — a locked or empty tab is worse
than an absent one. Profiles therefore carry one fewer tab for visitors than for the owner, which
is a deliberate asymmetry and should be stated in the component.

### What stays public

The **Pana badge** on a profile stays visible to everyone. Knowing that you and someone are
connected is different from being able to enumerate or count their connections — the first is
context, the second is a graph map. Keeping the badge is what preserves the social meaning of the
tier after the number goes away.

---

## Decision 3 — Mutual Panas

**Status: built.** Product owner, after the panas meeting:

> _"We moved to not showing any followers, panas, etc — but we came up with the idea of sharing
> 'Mutual Panas', which is the panas you share with that person."_

Decision 2 took the aggregate off other people's profiles and left a gap where a profile used to
say something about connection. Mutual Panas fills it without reopening what Decision 2 closed.

### What it is

Given a viewer V looking at profile P, a Mutual Pana is any M who is a Pana of **both**. Four
accepted follow rows, all bilateral — the same walk `listSuggestedActors` already makes to rank
strangers, pinned to one person instead of ranging over the graph.

`getSharedPanas` in `lib/federation/wrappers/follow.ts`. One query: the self-joins do the set
intersection, and `count(*) over ()` carries the full total beside a capped page of faces, so the
rail can say "and 9 more" truthfully without a second round trip.

### Why this is not Decision 2 with extra steps

It is **viewer-scoped**, and that is the entire argument. Every actor it can return is already a
Pana of the person asking. Visiting a hundred profiles tells a viewer, at most, which of **their
own** Panas each of those people is connected to. It never names a person the viewer is not
already connected to, and it cannot be assembled into P's Pana list — the ceiling on everything it
will ever disclose is V's own graph, which V already has.

So the two rules do not conflict:

| Surface                  | Scope         | Who sees it                             |
| ------------------------ | ------------- | --------------------------------------- |
| Pana count / list        | About P       | P only                                  |
| Mutual Panas             | About V ∩ P   | Any signed-in visitor, not P's own page |
| Pana badge on one person | About V and P | Everyone                                |

Decision 2 exists so a profile does not carry a score. An overlap the viewer is personally inside
of is not a score, it is the oldest introduction there is: _"you both know these people."_

### Rules it still has to obey

- **Owner gets nothing.** Your Mutual Panas with yourself are just your Panas, which is the
  owner-only list. The field is empty on your own profile.
- **Signed out gets nothing.** No graph, no intersection, and the module does not render.
- **Blocks and mutes subtract, from the viewer's side only.** Filtering by P's hidden list would
  leak P's mutes one name at a time. Blocks sever follows both ways, so anyone P blocked has
  already fallen out of the join. A blocked P returns an empty overlap outright rather than a
  filtered one. A consequence worth knowing: V and P can see different numbers on each other's
  profiles, because each answer is filtered by the asker's own hidden list. That asymmetry is the
  privacy rule working.
- **Absent, not zero.** "0 Mutual Panas" is a verdict on a relationship, and a new member would
  collect it on every profile they opened. No overlap means no module.

### Naming

"Mutual" is the product's word, as in _"Panas you both have"_. It does not mean a second degree of
mutuality stacked on the mutual follow that already makes a Pana — every edge walked is bilateral.
The wrapper is `getSharedPanas` to keep "mutual mutual follows" out of the code; the UI says Mutual
Panas because that is what the panas called it.

---

## A — Discovery Through Shared Activity

**Status: proposal.**

Graph-based discovery has a cold-start problem that a local network feels sooner than a global
one. The current second tier — "recently joined" — is the system saying it has nothing better.

But the strong local signals already exist in the database and none of them are wired into
discovery:

| Signal          | Source                      | Reason string shown to user              |
| --------------- | --------------------------- | ---------------------------------------- |
| Co-attendance   | event attendees             | "You were both at Nochebuena en Wynwood" |
| Co-membership   | `social_group_members`      | "Both in Little Haiti Creatives"         |
| Shared taste    | recommendation lists (#234) | "You both recommend Café La Palma"       |
| Proximity       | profile neighbourhood / zip | "Also in Little Havana"                  |
| Panas in common | existing graph walk         | "3 Panas in common"                      |

### Why this beats more graph

- **It works on day one.** The first fifty members have no graph. They do have a neighbourhood and
  an event they went to.
- **The reason is explainable and true.** _"You were both at this"_ is a better introduction to a
  stranger than _"3 mutual panas"_, and it is verifiable by the person reading it.
- **It is local.** Co-attendance at a Miami show is a signal a global network cannot generate and
  cannot copy. This is the part that makes the product specifically about this place.

### Shape

Extend `listSuggestedActors` from two tiers to a ranked union, each candidate carrying a typed
reason rather than a bare number:

```ts
type SuggestionReason =
  | { kind: 'panas_in_common'; count: number }
  | { kind: 'co_attended'; eventId: string; eventTitle: string }
  | { kind: 'co_member'; groupId: string; groupName: string }
  | { kind: 'shared_recommend'; profileId: string; profileName: string }
  | { kind: 'nearby'; neighborhood: string };
```

`/api/social/suggestions` already returns `mutualCount` rather than a rendered string
specifically so copy stays in the UI layer — the same discipline applies to reasons. The route
returns structured reasons; the component renders them.

Constraints carried over from today's implementation: **local actors only** (remote follows sit
`pending`, so the button cannot be labelled honestly), and **every tier must be filtered by
[block/mute](#b--block--mute)** once that exists.

Ordering should prefer specific over generic — a shared event beats a shared neighbourhood, because
everyone shares a neighbourhood with thousands of people.

---

## B — Block & Mute

**Status: proposal. Prerequisite for shipping [A](#a--discovery-through-shared-activity).**

No block or mute exists today. In a geographically local network this matters more than in a
global one: avoiding an ex, a harasser, or a former employer is a _local_ safety need, and the
people involved are people you will physically encounter.

Right now nothing stops someone following you, and discovery may actively resurface them. A model
with no approval step needs an escape hatch, or "no approval" becomes "no recourse."

### Two different tools

|                        | Block                                      | Mute                         |
| ---------------------- | ------------------------------------------ | ---------------------------- |
| Follows                | Severed both directions, re-follow blocked | Untouched                    |
| Their feed view of you | Your public posts hidden                   | Unchanged                    |
| Your feed              | They disappear                             | They disappear               |
| Discovery              | Removed from both sides                    | Removed from yours           |
| Visible to them        | Not announced                              | Not announced                |
| Use case               | Safety                                     | "I like you, not your posts" |

Mute is the one people reach for most often and the one that keeps a small community livable —
it lets somebody stay connected to a neighbour whose posting volume they cannot stand, which is a
very local problem.

### Schema sketch (migration `0050`)

```
social_blocks
  id, actor_id, target_actor_id, kind ('block' | 'mute'), created_at
  unique (actor_id, target_actor_id, kind)
  index on (actor_id), index on (target_actor_id)
```

A single table with a `kind` discriminator rather than two tables: every read path needs to ask
"is there anything between these two actors," and one indexed lookup beats two.

### Every surface that must subtract it

This list is the actual work; the table is trivial by comparison.

- `listSuggestedActors` — called out in its own comments as the place a blocked account would
  otherwise reappear
- Timeline / feed queries, all three filters
- Follower and following lists
- `countMutualFollows` / `listMutualFollows` — a block severs the follows, so this should follow
  naturally, but it needs a test
- Stories rail
- Notifications
- Search and directory results
- Federation: an incoming `Follow` from a blocked actor must be rejected rather than auto-accepted
  — this is the one place `social_follow_status.rejected` would finally get written

### Federation reality check

ActivityPub has a `Block` activity, but remote servers may ignore it, and announcing a block to the
blocked instance leaks information. The honest scope is **local enforcement only**: we control what
our server shows and delivers. That limitation should be stated in the UI rather than implied, in
the same spirit as `PRIVACY-ROADMAP.md`'s note that remote servers may ignore `Delete`.

---

## C — Safety Beyond Blocking

**Status: proposal. §B is one part of this, not the whole of it.**

Blocking is **recourse**: it works after somebody has already reached you. A model with no approval
step needs recourse, but recourse alone means every pana's first experience of a bad actor is the
harm itself. The full set is three tools doing different jobs:

|                      | Tool                                | When it acts                         |
| -------------------- | ----------------------------------- | ------------------------------------ |
| **Prevention**       | DM gating, optional follow approval | Before contact                       |
| **Recourse**         | Block, mute                         | After contact, one person at a time  |
| **Community remedy** | Reporting, moderation               | After contact, on behalf of everyone |

We have none of the three. §B covers the middle column. This section covers the other two, plus the
disclosure audit that is specific to a local network.

There is a fourth exposure that none of the three columns catches: a **deceptive link**, where the
visible text disagrees with the destination. It is not prevention, recourse or remedy — it is a
property of how post HTML renders, it is live on every feed surface, and sanitising does not touch
it because the markup is perfectly valid. It now has a **fourth kind of answer: disclosure.**
`lib/link-safety.ts` badges any link whose text does not already say where it goes, so the reader
sees the real host before clicking. Held DM requests go further — `/updates` flattens them to plain
text, which removes the anchor outright. See "Deceptive links" in `docs/SECURITY_AUDIT.md` for what
the badge does and does not cover.

Worth weighing here because federated posts are authored on instances we do not moderate, so
blocking and reporting both arrive after the click — and disclosure, unlike the other three columns,
acts _before_ it. It also only informs: the badge reveals the host, it cannot judge whether the host
is hostile, and it blocks nothing.

### C1 — Direct messages are ungated

**This is the largest open safety gap, and it is larger than the missing block.**

`createStatus` in `lib/federation/wrappers/status.ts` validates exactly three things for
`visibility: 'direct'` — that there is at least one recipient, that there are no more than eight,
and that the recipient rows exist. `app/api/social/statuses/route.ts` adds one more: that the array
is non-empty. **Neither layer checks any relationship between sender and recipient.**

So any account can message eight panas at once, unsolicited, and the route then writes a
notification for each one. Blocking does not help here: the first message is the harm, and blocking
is only available afterwards. In a geographically local network the sender may also know the
recipient's neighbourhood, their groups, and which venues they post from.

**Decision.** A per-account setting with three values, defaulting to the first:

| Setting                | Who may open a DM thread                        |
| ---------------------- | ----------------------------------------------- |
| `everyone` _(default)_ | Any local actor; non-Panas land in **Requests** |
| `panas`                | Mutual follows only; no Requests folder         |
| `nobody`               | No new threads; existing ones continue          |

The gate belongs on **thread creation**, not on every message, or replying inside a thread the
recipient already accepted would break. An existing thread is itself the consent.

**Why the default moved from `panas` to `everyone`.** An earlier draft of this section defaulted to
`panas` and described it as a real product trade. The trade was being made in the wrong direction.
The scarce resource in a network this size is not conversation volume, it is **first contacts that
happen at all** — a pana finds a maker or a business in the directory and writes to them. Gating on
mutual follow blocks precisely that person. A mutual follow is also a weak proxy for consent: it is
a thinner claim than _"I read your profile and want to work with you."_

**Requests supplies the consent that `panas` was standing in for.** A thread opened by a non-Pana is
held in a separate Requests folder instead of the inbox, and — the load-bearing part — **it does not
generate a notification.** That removes the harm this section opens with, which was never really
"a stranger wrote to me" but "a stranger can make my phone buzz eight times." The recipient reviews
on their own schedule and accepts, deletes, or blocks; accepting is what creates the thread, and
until then there is nothing to reply to.

This keeps the safety property and drops the cost. `panas` remains for panas who want no Requests
folder at all, and `nobody` for those who want no new threads.

**The folder shows the message, not just the sender.** An earlier server-side draft returned senders
only, on the reasoning that a name is the minimum needed to triage. It is also less than the minimum:
if you cannot see what was said, **accepting becomes the only way to find out** — and accepting is
exactly the consent the gate exists to ask for. For a local network the content is also the whole
signal that separates a neighbour from a bot. So `/updates` renders the held body and its voice memo,
with no like or reply affordance, and the composer stays shut until the thread is accepted.

The body is rendered as **plain text, not HTML**. Status content is `marked.parse()` output and
nothing strips raw markup from it, so a held message is attacker-authored by construction. Flattening
also defuses the lure where friendly anchor text hides a hostile link — which is precisely what a
stranger's first message would carry.

**Deleting withdraws the message; it must not publish it.** The hold works by `notHeldRequest`
excluding statuses that have a _pending_ request row, so deleting only that row would flip the
message visible and deliver the very thing the recipient refused. `deleteDirectThreadRequest`
therefore runs in a transaction that also strips the recipient's URI from the status's `recipient_to`.
It strips rather than deletes the status because a direct message carries up to eight recipients and
deleting would retract it from the other seven. The sender keeps their copy — Sent reads by author
and never consults the recipient list — which is what keeps the withdrawal invisible to them, the
same silence the hold itself relies on.

### C2 — Optional follow approval already half-exists

`social_actors.manually_approves_followers` is in the schema and is populated for remote actors by
`lib/federation/remote-actor.ts`. **`createFollow` never reads it.** A local pana cannot require
approval, and the column currently implies an option that is not wired.

This is the cheapest safety feature available: the gate for the minority who want one, without
imposing approval on everyone. It does not change the default model described in
[The Model](#the-model) — open follows stay the default — it just stops the schema from lying.

Honouring it means `createFollow` sets `pending` instead of `accepted` for a locked target, and
there has to be somewhere to approve from. If we decide not to do that, **drop the column**, because
a field that looks like a safety setting and does nothing is worse than its absence.

### C3 — There is no way to report anything

No report, flag, or moderation table exists among the forty in `lib/schema/index.ts`. The
consequence is structural rather than cosmetic: without it, a bad actor is handled by fifty people
each independently blocking them, nobody can see that it happened fifty times, and the account
stays. Blocking scales linearly with victims; that is the definition of a missing remedy.

The schema is the easy half:

```
social_reports
  id, reporter_actor_id, subject_actor_id, subject_status_id (nullable),
  reason (enum), note (text), status ('open' | 'actioned' | 'dismissed'),
  created_at, resolved_at, resolved_by
```

**The hard half is not schema, it is staffing.** A report queue nobody reads is worse than no report
button, because it collects a promise of review that is never performed. See
[Risks](#risks--open-questions) — this needs a named human before the table is worth writing.

`social_groups` already has a `social_group_role` with moderators. Whether instance-level moderation
reuses that vocabulary or is a separate role is an open design question.

### C4 — Ban evasion and rate limits

A blocked person makes a second account. Nothing in §B addresses that, and nothing can fully.

Two cheap mitigations worth having before they are needed, neither of which is a real solution:

- **Rate limits on follow and DM-thread creation per account per hour.** Caps the blast radius of a
  fresh account without affecting anyone behaving normally.
- **New-account friction for DMs specifically** — an account hours old opening threads with eight
  strangers is the shape of the problem.

A small, locally-rooted community is itself the strongest mitigation here, and it is worth not
over-engineering this. The point is to make the cheap version exist rather than to solve it.

### C5 — The disclosure audit is the local-first part

Everything above exists on any social network. What is specific to Pana Mia is that its users
**physically encounter each other**, which turns ordinary metadata into location data.

`lib/event.ts` already gets this right and should be the standard the rest is held to.
`getProfileEventsFeed` returns hosting publicly but attendance **only to the owner**, and the
comment explains why: `event_attendees` has no per-row visibility column, so no pana has consented
to publishing any given RSVP, and a profile listing every event someone is going to would be _"a
location history assembled from rows they only ever agreed to share with the organizer."_

The same question has not been asked of everything else. Each of these should get an explicit
answer rather than inheriting whatever the query happens to do today:

- **Story views** (`social_story_views`) — the viewer list tells an author who was watching
- **Group membership lists** — a neighbourhood group is a location claim
- **Venue and location tags on posts** — a pattern of them is a routine
- **`screenname_history`** — a pana who changes handle to get away from someone should not have the
  rename publicly link the two
- **Suggestion reasons** — already flagged under [Risks](#risks--open-questions): _"you were both at
  X"_ discloses attendance indirectly, which C5 and the co-attendance tier both depend on

A block must subtract from every one of these too, which is why this section sits next to §B rather
than after it.

---

## Roadmap

### Phase 1 — Naming and legibility

- [ ] Rename feed tab `Panas` → `Following`; keep the explanatory hint
- [ ] Fix the six "Pana = any member" strings
- [x] Add `Follows you` / `Pana` badges to the personal profile, suggestion cards and directory results
- [ ] Add the same badges to follower and following lists — blocked on the line below
- [ ] Ensure list endpoints return both follow directions

`/api/social/follows` currently returns the listed actor only, with no indication of whether the
viewer follows them or they follow the viewer. `ActorList` therefore has nothing to render a badge
from. That endpoint has to carry both directions before the list surfaces can be finished, which is
why those two boxes are still open.

### Phase 2 — Pana count privacy

- [x] `/panas`: owner-only `count`, `canSeeList` becomes owner-only
- [x] Rewrite the route docblock in the same commit
- [x] Hide the Panas stat and tab for non-owners
- [x] Keep the Pana badge public

### Phase 2.5 — Mutual Panas

Fills the gap Phase 2 left on other people's profiles. See
[Decision 3](#decision-3--mutual-panas).

- [x] `getSharedPanas` wrapper — one query, window count beside a capped page
- [x] Viewer-scoped `mutualPanas` on `/panas`, absent for the owner and signed-out viewers
- [x] Profile rail module, hidden entirely when the overlap is empty
- [x] Clear the query cache on identity switch — the response varies by viewer, the cache key
      does not

### Phase 3 — Block & mute

- [ ] Migration `0050` + journal entry
- [ ] Wrappers, routes, and the subtraction pass across every surface listed above
- [ ] Reject incoming federated follows from blocked actors
- [ ] Settings screen listing blocks and mutes

### Phase 3.5 — Prevention

Ships with or immediately after Phase 3. Blocking without these leaves the first contact unguarded.

- [x] DM gating: `everyone` / `panas` / `nobody`, defaulting to `everyone`, enforced on thread
      creation — migration `0051`, `lib/federation/wrappers/dm-gate.ts`
- [x] Requests folder: threads from non-Panas held out of the inbox and **suppressed from
      notifications** until accepted — `social_dm_requests` + `/api/social/dm-requests`, with the
      Requests tab on `/updates` showing the held message and offering accept / delete / block.
- [ ] Honour `manually_approves_followers` in `createFollow`, with somewhere to approve from — or
      drop the column
- [ ] Rate limits on follow and DM-thread creation

### Phase 3.6 — Community remedy

Gated on the moderation-owner question in [Risks](#risks--open-questions). Do not build the table
before that is answered.

- [ ] `social_reports` + report action on profiles and posts
- [ ] A queue, and a named human reading it
- [ ] Decide whether instance moderators reuse `social_group_role` or get their own vocabulary

### Phase 4 — Activity-based discovery

- [ ] Typed `SuggestionReason`
- [ ] Co-attendance, co-membership, shared-recommend and proximity tiers
- [ ] Ranking: specific before generic
- [ ] Block/mute filtering on every tier

Phase 3 lands before Phase 4 on purpose. Discovery amplifies reach, and amplifying reach without an
escape hatch is the wrong order.

---

## Risks & Open Questions

**Who reads the reports?** [C3](#c3--there-is-no-way-to-report-anything) is blocked on this and not
on engineering. A report button that files into a queue nobody opens is worse than no button: it
collects a promise of review that is never performed, and it invites panas to disclose an incident
to a system that will not answer. The options are a single owner, a rotating pana, or promoting
group moderators to instance level — each with a different failure mode when that person is
unavailable or is themselves the subject. **Name the human before building the table.**

**DM gating's default — resolved.** It is `everyone`, with threads from non-Panas held in a
notification-free Requests folder. [C1](#c1--direct-messages-are-ungated) carries the reasoning and
the reversal from the earlier `panas` default, decided against the `/mock/dms` comparison. The
setting still has to exist; only its default moved.

**The `rejected` enum value stays dead until blocking ships.** Worth leaving a comment on the enum
saying so, because it currently reads like an approval flow that was built and lost.

**Owner-only counts weaken the Panas tab's original justification.** The tab exists because "a
profile with four hundred Panas needs somewhere for the rest of them to be." If only the owner can
see it, the tab is a personal index rather than a public one. That may be fine — but it is a
different feature than the one that was designed, and it should be revisited rather than inherited.

**Co-attendance has a consent question.** Event attendance is currently owner-only. Using it to
generate suggestions exposes it indirectly: _"you were both at X"_ tells someone that the other
person attended X. This needs either an opt-in, or restriction to events where attendance is
already public. **Do not build the co-attendance tier before resolving this.**

**Proximity has the same shape.** Surfacing neighbourhood-level suggestions is a disclosure for
people who did not expect their neighbourhood to be a discovery key. Neighbourhood granularity is
probably acceptable; anything finer is not.

**No cap is proposed.** Path capped friends at ~150 to force intentionality. We are not doing that,
because the directory half of the product needs businesses to be followable without limit. Worth
remembering that the cap option exists if the graph later turns into an audience race.

**Mutual-only feed remains untried.** If the network gets dense enough that a Panas-only timeline
would be full, it becomes worth revisiting as an option — not as a replacement for Following.
