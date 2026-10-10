# Notifications System Roadmap

This document outlines the implementation plan for Pana MIA's in-app notification system, designed to be **ActivityPub-compatible from the start** for future federation.

---

## Upstream Reference

> **IMPORTANT**: This implementation is designed to align with [llun/activities.next](https://github.com/llun/activities.next), a Next.js-native ActivityPub server.
>
> When implementing notification features, always check activities.next for:
>
> - Database schema patterns (`lib/database/`)
> - ActivityPub activity types (`lib/activities/`)
> - Job queue patterns (`lib/jobs/`)
>
> The goal is to enable future integration or migration to a federated architecture.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         pana.social                                │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  Notification System (Phase 1 - Complete)                     │ │
│  │  - PostgreSQL table with ActivityPub-shaped schema            │ │
│  │  - Flower button UI in header                                 │ │
│  │  - Co-author/review workflows                                 │ │
│  │  - Email notifications via CF Email Sending                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              ↑                                      │
│                       Internal events                               │
│                              ↓                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  Federation Bridge (Phase 2 - Later)                          │ │
│  │  - Translate internal notifications → ActivityPub Activities  │ │
│  │  - Import ActivityPub Activities → internal notifications     │ │
│  │  - Connect to activities.next sidecar                         │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              ↕
               (future: federation via ActivityPub)
                              ↕
┌─────────────────────────────────────────────────────────────────────┐
│                  social.pana.social (Phase 2)                      │
│                  activities.next instance                           │
│                  - Full ActivityPub federation                      │
│                  - Mastodon-compatible                              │
│                  - Article comments from Fediverse                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. ActivityPub-Shaped Schema

Internal notification types map directly to [ActivityPub Activity Types](https://www.w3.org/TR/activitystreams-vocabulary/#activity-types):

| Pana MIA Event     | ActivityPub Activity | Description                   |
| ------------------ | -------------------- | ----------------------------- |
| Co-author invite   | `Invite`             | Invite someone to collaborate |
| Invite accepted    | `Accept`             | Accept an invitation          |
| Invite declined    | `Reject`             | Decline an invitation         |
| Article published  | `Create`             | Create new content            |
| Revision requested | `Update`             | Request changes               |
| Article boosted    | `Announce`           | Share/repost content          |
| Article liked      | `Like`               | Favorite content              |
| User followed      | `Follow`             | Follow an actor               |

### 2. Actor Model Compatibility

Users are treated as "Actors" with:

- Unique identifier (userId/screenname)
- Public profile URL
- Potential federated address (`@user@pana.social`)

### 3. Object References

All notifications reference:

- **Actor**: Who triggered the notification
- **Object**: What the notification is about (article, profile, etc.)
- **Target**: Who receives the notification

This mirrors ActivityPub's Actor → Activity → Object model.

---

## Data Model

### Notification Schema

```typescript
/**
 * Notification Schema
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/notifications/
 * See: lib/database/types/ for comparable patterns
 *
 * This schema is intentionally "ActivityPub-shaped" to enable
 * future federation without schema migration.
 */

// NOTE: This example shows the schema design. Actual implementation uses Drizzle.
// See lib/schema/index.ts for the current Notification model.

// ActivityPub-compatible activity types
// See: https://www.w3.org/TR/activitystreams-vocabulary/#activity-types
export type NotificationActivityType =
  | 'Invite' // Co-author/reviewer invitation
  | 'Accept' // Invitation accepted
  | 'Reject' // Invitation declined
  | 'Create' // Article published, comment added
  | 'Update' // Revision requested, article updated
  | 'Delete' // Content removed
  | 'Announce' // Boost/share (future)
  | 'Like' // Favorite (future)
  | 'Follow' // User followed (future)
  | 'Undo'; // Undo previous action

// Pana MIA-specific context for the activity
export type NotificationContext =
  | 'coauthor' // Co-authorship workflow
  | 'review' // Peer review workflow
  | 'article' // Article lifecycle
  | 'mention' // User mentioned (future)
  | 'follow' // Follow relationship (future)
  | 'system'; // System announcements

export interface INotification extends Document {
  // ActivityPub-compatible core fields
  type: NotificationActivityType;
  actor: Types.ObjectId; // Who triggered this (→ AS2 actor)
  object?: Types.ObjectId; // What it's about (→ AS2 object)
  target: Types.ObjectId; // Who receives this (→ AS2 target)

  // Pana MIA context
  context: NotificationContext;

  // Denormalized data for display (avoids extra queries)
  actorScreenname?: string;
  objectType?: 'article' | 'profile' | 'comment';
  objectTitle?: string;
  objectUrl?: string;
  message?: string; // Personal message (invitation text)

  // State
  read: boolean;
  readAt?: Date;

  // Email notification tracking
  emailSent: boolean;
  emailSentAt?: Date;
  emailPreferenceKey?: string; // Which preference controls this

  // Retention
  expiresAt?: Date; // TTL for auto-cleanup

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    // Core ActivityPub-shaped fields
    type: {
      type: String,
      required: true,
      enum: [
        'Invite',
        'Accept',
        'Reject',
        'Create',
        'Update',
        'Delete',
        'Announce',
        'Like',
        'Follow',
        'Undo',
      ],
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },
    object: {
      type: Schema.Types.ObjectId,
      refPath: 'objectType',
    },
    target: {
      type: Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },

    // Context
    context: {
      type: String,
      required: true,
      enum: ['coauthor', 'review', 'article', 'mention', 'follow', 'system'],
      index: true,
    },

    // Denormalized display data
    actorScreenname: String,
    objectType: {
      type: String,
      enum: ['article', 'profile', 'comment'],
    },
    objectTitle: String,
    objectUrl: String,
    message: String,

    // State
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: Date,

    // Email tracking
    emailSent: {
      type: Boolean,
      default: false,
    },
    emailSentAt: Date,
    emailPreferenceKey: String,

    // Retention (TTL index)
    expiresAt: Date,
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
notificationSchema.index({ target: 1, read: 1, createdAt: -1 });
notificationSchema.index({ target: 1, context: 1, createdAt: -1 });

// TTL index for auto-cleanup of expired notifications
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Notification =
  models.notification ||
  model<INotification>('notification', notificationSchema);
```

### User Schema Additions

```typescript
/**
 * Add to existing user model
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/notifications/
 * See: lib/database/sql/accounts.ts for email preferences pattern
 */

interface UserNotificationPreferences {
  // Article workflow
  coauthorInvites: boolean; // Default: true
  reviewRequests: boolean; // Default: true
  articlePublished: boolean; // Default: true
  revisionNeeded: boolean; // Default: true

  // Social (future)
  newFollower: boolean; // Default: true
  articleReplies: boolean; // Default: true
  mentions: boolean; // Default: true

  // System
  systemAnnouncements: boolean; // Default: true
}
```

---

## Retention Policy

| Notification Type                  | Read Retention | Unread Retention |
| ---------------------------------- | -------------- | ---------------- |
| Invitations (Invite/Accept/Reject) | Indefinite     | Indefinite       |
| Article lifecycle (Create/Update)  | 90 days        | Indefinite       |
| Social (Like/Follow/Announce)      | 30 days        | 90 days          |
| System announcements               | 30 days        | 90 days          |

Implemented via scheduled cleanup on `expiresAt` field. Set at creation time based on notification type.

---

## Coverage by Domain

One table, one bell, one `/updates` page. Every domain writes into the same
`notifications` table through `createNotification`, and the `context` column is
what makes a row legible — it is the switch `getNotificationMessage` reads to
decide which sentence a row becomes. Adding a domain means adding a context and
a `case`, not a new table or a new surface.

### Where each domain stands

A context counts as in use below only when something calls `createNotification`
with it. A `case` in `getNotificationMessage` is not evidence of that — several
sentences are written for events that nothing fires, and three more are left
over from domains that have been switched off. Reading the switch alone will
overstate what ships. Both lists are in the next section.

| Domain          | Contexts that fire          | State                                                                                                                                                                                                                                                                                      |
| --------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Writing**     | —                           | **Retired.** Co-author invite and response, review request and verdict, and publishing-notifies-contributors all used to fire; every one of those calls has been removed. `coauthor` and `review` survive as enum values and `case` blocks only so rows already in the table stay readable      |
| **Mentoring**   | —                           | **Retired.** Request, accept, decline and cancel all used to fire; those calls have been removed. `mentoring` survives for the same reason                                                                                                                                                      |
| **Pana Social** | —                           | Thin — the social graph itself notifies nobody. `follow` and `mention` have no caller, and `mention` has no `case` either, so it would fall through to the generic fallback; reply and boost-of-your-post are unwritten. The `message` rows that do fire belong to Messages below               |
| **Events**      | `event` (Create, Delete)    | Two paths fire. A group's event going live announces itself to the group's members — on **publish**, not creation, because events are born as drafts and a draft is visible only to the group's managers. The other is an admin suspending a venue, which cancels its future events and tells going/maybe attendees. The organizer lifecycle is written but unwired — there is no co-organizer endpoint. RSVP and reminders missing; `venue` is an objectType with no context |
| **Groups**      | `group`, `group_membership` | The widest coverage of any domain — invitations, join requests, role changes, removal, bans, and two announcements that reach the whole membership: a top-level post in the group feed, and a group event going live. The one thing missing is a way to turn the last two off; see "Announcing to a whole group" below |
| **Messages**    | `message`                   | Voice memos only, suppressed when the sender is held in the recipient's Requests folder; needs per-conversation collapsing                                                                                                                                                                      |
| **Connectors**  | —                           | **No context.** `app/connectors/{join,hq,admin}` notify nobody                                                                                                                                                                                                                                 |
| **Admin**       | `article`, `event`          | **Outbound only.** Admins can remove or restore an article and suspend a venue, and each tells the people affected. Since publishing stopped notifying, admin moderation is the _only_ producer of `article`. Nothing travels the other way: report queues and verification requests reach admins only by visiting `app/admin/reports`, and `system` has a sentence with no caller |

### Contexts that were switched off

`coauthor`, `review` and `mentoring` are retired. The routes that created them
no longer call `createNotification`, but none of the supporting machinery was
deleted, and that is deliberate:

| What stays                       | Why                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| The three `notification_context` enum values | Postgres has no `DROP VALUE`, the declared order is the type's sort order, and live rows still reference them |
| Their `case` blocks in `getNotificationMessage` | Rows already written have to keep rendering. Invite, Accept and Reject never expire, so some of these outlive every retention window. Deleting the cases would rewrite somebody's history into "Someone performed an action" |
| Their arms in `getExpirationDate` | Unreachable for new rows, kept to document what the existing ones were given                                                 |

Retiring a context is therefore not the same as removing it. The sentences stay
until the rows do, which for the non-expiring types is indefinitely.

**What this cost.** Two pages lost their only entry point. `/a/<slug>/invite`
and `/a/<slug>/review` still work, but they were reachable only by clicking the
notification, and there is no index of invitations you have _received_ — the
editor's Pending Invitations panel is the author's view of who they invited, not
the invitee's. `ArticleEditor` still sends invitations, so an author can create
one that the other person has no in-app way to find; the link has to be passed
along out-of-band. Mentoring has the opposite problem and so lost nothing:
there is no member-facing surface at all (`app/mentoring` does not exist), only
the admin views. If writing collaboration is ever picked back up, the fix is an
invitations index rather than re-wiring the bell.

### Sentences written for events that never fire

Distinct from the above: `getNotificationMessage` handles these and no route
has _ever_ called them. They are a promise the switch makes and the API does
not keep, so a reader checking coverage there will count domains that are not
wired:

| Context  | Types                                  | Missing piece                                                           |
| -------- | -------------------------------------- | ----------------------------------------------------------------------- |
| `event`  | Invite, Accept, Reject, Update | No co-organizer endpoint. `Create` used to sit in this list and no longer does — a group event announces itself on publish |
| `follow` | Follow                                 | The follow action does not notify                                       |
| `system` | (passthrough `message`)                | Nothing creates a system notification                                   |

Either wire them or delete the cases; leaving both is what made the table above
wrong the first time it was written.

### Announcing to a whole group

Every notification described above lands on one person, or on the handful of
leaders who can answer a join request. Two do not: a top-level post in a group
feed, and a group's event going live. Those go to every active member, which
makes them a different kind of thing with its own failure modes.

**Why they are not a loop over `createNotification`.** That function spends
three queries per call — a block check, an actor lookup for denormalization,
and the insert. That is the right shape for one recipient and the wrong one for
two hundred: a single post to a mid-sized group would be six hundred round
trips inside a request somebody is waiting on. `createNotificationsForTargets`
does the same work set-at-a-time — resolve every user to its actor once, ask
once which are blocked, look the sender up once, insert every row in one
statement. Four queries whether the group has three members or three thousand.

It is a second way to write the `notifications` table, so it deliberately
carries the same two guarantees the single path has, because a second door is a
second place to forget them:

- blocks still stop a notification, in either direction, mutes excluded
- the sender is never notified about their own action — which the single path
  leaves to its callers and this one cannot, since the sender is almost always
  a member of the group being announced to

**What is deliberately excluded.** Only `active` members hear anything: a
`pending` row is somebody still waiting at the door and a `banned` row is a
tombstone. Replies are excluded too — `notifyGroupPosted` is called only for
top-level posts, because announcing every reply to the whole membership is how
one busy thread turns the bell into something people learn to ignore. Edits,
reactions, joins and leaves are all unannounced for the same reason.

**Blocks, specifically.** The batch filter is `filterBlockedActorIds`, not
`filterHiddenActorIds`. The two look interchangeable and are not: the latter
folds in mutes, and a mute is about what the *muter* sees. Using it here would
mean an author who muted somebody had silently switched off *that person's*
notifications — a one-directional preference reaching across to edit someone
else's bell.

**The gap this opens: there is no mute.** A member of a busy group cannot turn
these two off. The only exit is leaving the group, which is a much larger
decision than "stop telling me about every post." `profiles.notification_preferences`
is a `jsonb` column that has existed since the initial schema and is read by
nothing — it is the obvious home for a per-group opt-out and would need no
migration. Until it is wired, treat every addition to the whole-group
announcements as something that has to argue for itself, because the volume it
creates cannot currently be declined.

A second, smaller gap: these are one row per member per event, with no
collapsing. Ten posts in a day is ten rows per member rather than one "10 new
posts in X". The same per-conversation collapsing that Messages needs would
apply here.

### The two real gaps

**Connectors** has routes for joining, an HQ, and an admin view, and no way to
tell anyone anything. It needs a `connector` context covering at minimum: a
join request landing on connector admins (`Join`), its approval or denial
landing on the applicant (`Accept`/`Reject`), and HQ announcements (`Announce`).
This is the same shape `group_membership` already solved, including the
direction problem — `Join` travels applicant→org while `Accept` travels
org→applicant, so the sentences are written from different sides.

**Admin** currently only reaches users by side effect. Removing an article and
suspending a venue both notify the people affected, but nothing carries work
*to* moderators, and `system` — the context meant for announcements — has a
sentence and no caller, so there is no broadcast either. A `moderation` context
would let a filed report (`Create`), a verification request (`Invite`), and a
resolution (`Accept`/`Reject`) reach the people who act on them. The target for
these is a role rather than a person, which the current schema cannot express —
`notifications.target` is a single actor. Fanning out one row per admin is the
cheap answer and is correct while the admin list is small; it stops being
correct the moment it isn't.

### Cross-cutting work, in priority order

1. **Honor `notificationPreferences`.** The column exists on the profile table
   (`lib/schema/index.ts:527`) and nothing reads it. Every domain added makes
   the bell noisier with no way to turn anything down. Per-context on/off is the
   smallest useful shape and maps 1:1 onto the enum.

2. **Collapse before fanning out.** `Create` on a 500-member group writes 500
   rows, and ten likes on one post are ten bell entries. Both want the same
   fix — a grouping key so "3 people liked your post" is one row that updates,
   rather than three that accumulate. Do this before adding connectors and
   moderation, not after; retrofitting it across six domains is harder than
   building it into two.

3. **Channels beyond in-app.** Delivery today is the bell, the tab title, and a
   desktop toast — all of which require the tab to be open. Email digest is the
   obvious second channel, and it depends on preferences (1) and collapsing (2)
   both existing first, or it sends 500 emails.

---

## Implementation Phases

### Phase 1: Core Notification System

**Status**: [Planned] Planned

Build the foundation that articles, mentoring, and future features will use.

#### Files to Create

| File                                           | Purpose                    |
| ---------------------------------------------- | -------------------------- |
| `lib/schema/index.ts`                          | Drizzle Notification model |
| `lib/notifications.ts`                         | Helper functions           |
| `app/api/notifications/route.ts`               | List notifications         |
| `app/api/notifications/unread-count/route.ts`  | Badge count                |
| `app/api/notifications/[id]/read/route.ts`     | Mark as read               |
| `app/api/notifications/mark-all-read/route.ts` | Mark all read              |
| `app/updates/page.tsx`                         | Full history page          |
| `components/account/notifications-menu.tsx`    | Masthead button + panel    |
| `components/NotificationItem.tsx`              | Individual notification    |
| `components/NotificationAlerts.tsx`            | Tab title + desktop toasts |

#### Helper Functions

```typescript
/**
 * lib/notifications.ts
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/notifications/
 * See: lib/activities/actions/ for comparable patterns
 */

import {
  Notification,
  NotificationActivityType,
  NotificationContext,
} from './model/notification';
import { sendEmail } from './email';
import user from './model/user';

interface CreateNotificationParams {
  type: NotificationActivityType;
  actor: string; // userId
  target: string; // userId
  context: NotificationContext;
  object?: string; // objectId
  objectType?: 'article' | 'profile' | 'comment';
  objectTitle?: string;
  objectUrl?: string;
  message?: string;
}

/**
 * Create a notification and optionally send email
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/notifications/
 * Maps to ActivityPub Activity creation pattern
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<void> {
  // Get actor screenname for denormalization
  const actorUser = await user.findById(params.actor).select('screenname');

  // Determine expiration based on type
  const expiresAt = getExpirationDate(params.type, params.context);

  // Create notification
  const notification = await Notification.create({
    ...params,
    actorScreenname: actorUser?.screenname,
    read: false,
    emailSent: false,
    expiresAt,
  });

  // Check email preferences and send if enabled
  await maybeSendNotificationEmail(notification);
}

/**
 * Determine notification expiration based on type
 */
function getExpirationDate(
  type: NotificationActivityType,
  context: NotificationContext
): Date | undefined {
  // Invitations never expire (audit trail)
  if (type === 'Invite' || type === 'Accept' || type === 'Reject') {
    return undefined;
  }

  // System announcements expire after 30 days
  if (context === 'system') {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  // Article lifecycle expires after 90 days
  if (context === 'article' || context === 'coauthor' || context === 'review') {
    return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  }

  // Social expires after 30 days
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}
```

#### API Endpoints

| Endpoint                           | Method | Description                    |
| ---------------------------------- | ------ | ------------------------------ |
| `/api/notifications`               | GET    | List notifications (paginated) |
| `/api/notifications/unread-count`  | GET    | Get unread count for badge     |
| `/api/notifications/[id]/read`     | POST   | Mark single as read            |
| `/api/notifications/mark-all-read` | POST   | Mark all as read               |

#### Components

| Component                            | Description                                    |
| ------------------------------------ | ---------------------------------------------- |
| `account/notifications-menu.tsx`     | Masthead bell + unread badge + recent panel    |
| `NotificationItem.tsx`               | Individual notification with icon, text, time  |
| `NotificationList.tsx`               | Full paginated list for account page           |

> **Shipped as:** the bell button and its panel are one component,
> `components/account/notifications-menu.tsx`, built on `MenuSurface` — the same
> frame the identity and signed-out menus use, so it gets the dropdown-on-desktop
> /bottom-sheet-on-phones behavior, scroll lock, and roving focus for free.
> Earlier drafts of this roadmap split it into `NotificationFlower.tsx` +
> `NotificationDropdown.tsx` on a separate dropdown primitive; those were removed
> rather than mounted, because a second popup implementation 12px from the first
> would drift.

#### UI/UX

The notification bell button:

- Displays in the masthead immediately left of the profile button
- Shows unread count badge (red dot or number)
- Clicking opens dropdown with recent notifications
- "View all" links to `/updates`
- Polling every 30 seconds for unread count (no WebSocket needed)

---

### Phase 2: Federation Bridge (Future)

**Status**: [Planned] Future

Connect internal notifications to ActivityPub ecosystem.

#### Option A: activities.next Sidecar

Deploy [activities.next](https://github.com/llun/activities.next) as `social.pana.social`:

```
pana.social                    social.pana.social
     ↓                                ↑
Article published ──────────→ Create Note activity
     ↓                                ↓
Fediverse reply  ←──────────── Inbox receives reply
     ↓                                ↓
Show as comment                Stored in activities.next
```

#### Option B: Native ActivityPub

Implement ActivityPub directly in Pana MIA using patterns from activities.next:

- WebFinger endpoint (`/.well-known/webfinger`)
- Actor endpoints (`/users/[screenname]`)
- Inbox/Outbox handlers
- HTTP Signatures

**Recommendation**: Start with Option A (sidecar) for faster iteration, migrate to Option B if needed for tighter integration.

---

### Phase 3: Lists Alignment (Future)

**Status**: [Planned] Future

The current `userlist` model can be aligned with ActivityPub Collections:

| Current Field | ActivityPub Equivalent          |
| ------------- | ------------------------------- |
| `user_id`     | `attributedTo` (owner)          |
| `name`        | `name`                          |
| `desc`        | `summary`                       |
| `public`      | `to: public` vs `to: followers` |
| `profiles[]`  | `items[]` (OrderedCollection)   |

**UPSTREAM REFERENCE**: See activities.next `lib/database/sql/` for Collection patterns.

---

## Code Comment Standard

All notification-related code MUST include upstream reference comments:

```typescript
/**
 * UPSTREAM REFERENCE: external/activities.next/lib/services/notifications/
 * See: [specific file path] for comparable pattern
 *
 * This [component/function/schema] is designed to align with
 * activities.next for future ActivityPub federation.
 */
```

---

## Dependencies

### Required (Already in project)

- PostgreSQL / Drizzle
- NextAuth (user context)
- CF Email Sending (`lib/email.ts`)

### New Dependencies

| Package | Purpose                     | Phase |
| ------- | --------------------------- | ----- |
| None    | Phase 1 uses existing stack | 1     |

### Future Dependencies

| Package           | Purpose                | Phase         |
| ----------------- | ---------------------- | ------------- |
| `activities.next` | Federation sidecar     | 2             |
| `http-signature`  | ActivityPub signatures | 2 (if native) |

---

## Revision History

| Date       | Change                                                     |
| ---------- | ---------------------------------------------------------- |
| 2024-12-29 | Initial roadmap created with ActivityPub-compatible design |
