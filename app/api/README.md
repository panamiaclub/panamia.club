# API Routes

Server-side API endpoints for the Pana MIA application.

## Authentication

| Endpoint                           | Method | Description                                     |
| ---------------------------------- | ------ | ----------------------------------------------- |
| `/api/auth/[...all]`               | \*     | better-auth handlers (signin, signout, session) |
| `/api/auth/verify-turnstile`       | POST   | Verify Cloudflare Turnstile tokens              |
| `/api/register`                    | POST   | Register new user                               |
| `/api/oauth/complete-verification` | POST   | Complete OAuth email verification               |

## User Management (`/api/user/*`)

Current user operations:

| Endpoint                             | Method | Description                |
| ------------------------------------ | ------ | -------------------------- |
| `/api/user/me`                       | GET    | Get current user's data    |
| `/api/user/screenname`               | PATCH  | Update screenname          |
| `/api/user/search`                   | GET    | Search users by screenname |
| `/api/user/author`                   | GET    | Get author account status  |
| `/api/user/request-email-migration`  | POST   | Request email change       |
| `/api/user/complete-email-migration` | POST   | Confirm email change       |

### Profile Editing (via `/api/user/*` or `/api/profile/*`)

These endpoints handle profile data updates. Similar endpoints exist under
`/api/admin/*`, `/api/affiliate/*`, and `/api/geo/*` for different contexts:

| Endpoint               | Method | Description                         |
| ---------------------- | ------ | ----------------------------------- |
| `*/get`                | GET    | Get profile data                    |
| `*/saveDesc`           | POST   | Update description                  |
| `*/saveAddress`        | POST   | Update location                     |
| `*/saveContact`        | POST   | Update contact info                 |
| `*/saveSocial`         | POST   | Update social links                 |
| `*/saveCategories`     | POST   | Update categories                   |
| `*/saveGenteDePana`    | POST   | Update Gente de Pana                |
| `*/saveDefaultLicense` | POST   | Set default publishing (CC) license |
| `*/upload`             | POST   | Upload profile image                |
| `*/acceptTOS`          | POST   | Accept terms of service             |
| `*/action`             | POST   | Profile actions (verify, etc.)      |

## Articles (`/api/articles/*`)

Community articles feature:

| Endpoint                       | Method | Description                   |
| ------------------------------ | ------ | ----------------------------- |
| `/api/articles`                | GET    | List published articles       |
| `/api/articles`                | POST   | Create new article            |
| `/api/articles/my`             | GET    | Get user's own articles       |
| `/api/articles/recent`         | GET    | Recent published articles     |
| `/api/articles/search`         | GET    | Search articles (for replies) |
| `/api/articles/[slug]`         | GET    | Get article by slug           |
| `/api/articles/[slug]`         | PATCH  | Update article                |
| `/api/articles/[slug]`         | DELETE | Delete article                |
| `/api/articles/[slug]/publish` | POST   | Publish article               |
| `/api/articles/[slug]/replies` | GET    | Get article replies           |

### Co-author Management

| Endpoint                                 | Method | Description               |
| ---------------------------------------- | ------ | ------------------------- |
| `/api/articles/[slug]/coauthors/invite`  | POST   | Invite co-author          |
| `/api/articles/[slug]/coauthors/respond` | POST   | Accept/decline invitation |

### Review Workflow

| Endpoint                               | Method   | Description     |
| -------------------------------------- | -------- | --------------- |
| `/api/articles/[slug]/review/request`  | POST     | Request review  |
| `/api/articles/[slug]/review/respond`  | POST     | Submit review   |
| `/api/articles/[slug]/review/comments` | GET/POST | Review comments |

### Mastodon Comments

| Endpoint                        | Method | Description              |
| ------------------------------- | ------ | ------------------------ |
| `/api/articles/[slug]/comments` | GET    | Fetch Mastodon comments  |
| `/api/articles/[slug]/mastodon` | GET    | Get linked Mastodon post |
| `/api/articles/[slug]/mastodon` | PATCH  | Set Mastodon post URL    |

## Notifications (`/api/notifications/*`)

| Endpoint                           | Method | Description               |
| ---------------------------------- | ------ | ------------------------- |
| `/api/notifications`               | GET    | List user's notifications |
| `/api/notifications/unread-count`  | GET    | Get unread count          |
| `/api/notifications/mark-all-read` | POST   | Mark all as read          |
| `/api/notifications/[id]/read`     | POST   | Mark single as read       |

## Mentoring (`/api/mentoring/*`)

| Endpoint                       | Method    | Description        |
| ------------------------------ | --------- | ------------------ |
| `/api/mentoring/profile`       | GET/POST  | Mentor profile     |
| `/api/mentoring/discover`      | GET       | Find mentors       |
| `/api/mentoring/sessions`      | GET/POST  | Session management |
| `/api/mentoring/sessions/[id]` | GET/PATCH | Single session     |

## Directory & Search

| Endpoint                  | Method | Description           |
| ------------------------- | ------ | --------------------- |
| `/api/getDirectorySearch` | GET    | Search directory      |
| `/api/getUsersByCategory` | GET    | Filter by category    |
| `/api/getFeaturedPanas`   | GET    | Get featured profiles |
| `/api/getProfile`         | GET    | Get public profile    |

### Online business base ZIPs

`POST /api/listings/intake` accepts an explicit `onlineOnly` business choice.
Online businesses must provide a valid US ZIP in `addressPostalCode`; ZIP+4 is
normalized to five digits. A missing or unlocatable ZIP returns `400`, and a
temporary lookup failure returns `503` before a listing is created.
Storefront ZIPs remain optional and mobile/appointment-based listings are not
silently classified as online.

`POST /api/profile/saveAddress` enforces the same rule for `online_only: true`
or an already-online profile, accepting both `zipcode` and `postalCode` address
aliases. Online saves store only the base ZIP and its approximate locality,
clearing street-address and exact-coordinate fields. The resolved location is
kept in the existing `profiles.geo.zipArea` JSONB field; no migration is needed.

Directory results expose this approximate location as `online_zip`, while
`geo` is `null` for online businesses. Nearby searches use the ZIP area, not an
old home coordinate. Web and native maps create nonempty ZIP groups from their
current result page; a ZIP bubble is not a delivery-zone or pickup promise.
Older online listings with a usable ZIP can resolve it without trusting their
old street coordinates. Missing/unavailable locations stay discoverable in
All-areas searches and are visibly reported as unplottable.

ZIP lookup sends only the public five-digit code to
[Zippopotam.us](https://api.zippopotam.us), not names, contact details, or street
addresses. GeoNames data is attributed under
[CC BY 4.0](https://www.geonames.org/about.html); lookups are cached for 30 days.
The directory's existing five-minute public-response cache still applies to
location edits.

## Map Tiles (`/api/map/*`)

| Endpoint                     | Method | Description                                |
| ---------------------------- | ------ | ------------------------------------------ |
| `/api/map/tiles/{z}/{x}/{y}` | GET    | Vector basemap tiles for the directory map |

Reads a PMTiles archive in R2 with HTTP range requests. Coordinates are
bounds-checked before R2 is touched; tiles the archive does not cover answer
`204`, malformed or over-max coordinates `404`. Responses are immutable and
cached for a week.

## Social (`/api/social/*`)

The social timeline (microblogging) feature, surfaced at the `/s` page. Built on
an ActivityPub-style actor/status model so posts can federate (see
[Federation](#federation-apifederation) below). Access is gated by
`SocialEligibilityGate` / `lib/query/social.ts`. See `docs/SOCIAL-ROADMAP.md`.

### Actors

| Endpoint                               | Method      | Description                                 |
| -------------------------------------- | ----------- | ------------------------------------------- |
| `/api/social/actors/me`                | GET/POST    | Get or create the current user's actor      |
| `/api/social/actors/me/posts`          | GET         | Current user's own posts                    |
| `/api/social/actors/search`            | GET         | Search actors by name/handle                |
| `/api/social/actors/[username]`        | GET         | Get an actor's public profile               |
| `/api/social/actors/[username]/posts`  | GET         | An actor's public posts                     |
| `/api/social/actors/[username]/follow` | POST/DELETE | Follow / unfollow an actor                  |
| `/api/social/actors/[username]/panas`  | GET         | Own Panas, or Mutual Panas with the viewer  |
| `/api/social/actors/[username]/groups` | GET         | Public groups an actor belongs to           |
| `/api/social/actors/[username]/events` | GET         | Events an actor hosts; RSVPs are owner-only |
| `/api/social/follows`                  | GET         | List the current user's follows             |

### Statuses (posts)

| Endpoint                                  | Method      | Description                    |
| ----------------------------------------- | ----------- | ------------------------------ |
| `/api/social/statuses`                    | GET/POST    | List or create statuses        |
| `/api/social/statuses/[statusId]`         | GET/DELETE  | Get or delete a single status  |
| `/api/social/statuses/[statusId]/like`    | POST/DELETE | Like / unlike a status         |
| `/api/social/statuses/[statusId]/replies` | GET         | Get replies to a status        |
| `/api/social/timeline`                    | GET         | Home / public timeline (paged) |

### Media & Messages

| Endpoint                     | Method | Description                        |
| ---------------------------- | ------ | ---------------------------------- |
| `/api/social/media`          | POST   | Register a media attachment        |
| `/api/social/media/upload`   | POST   | Upload media (images, voice memos) |
| `/api/social/messages/inbox` | GET    | Received direct messages           |
| `/api/social/messages/sent`  | GET    | Sent direct messages               |

> Voice memos (recorded via `components/social/VoiceMemoComposer`) post through
> the media + status endpoints and surface on the `/updates` page.

## Federation (`/api/federation/*`)

ActivityPub endpoints that expose local content to the fediverse (Mastodon,
Pixelfed, etc.):

| Endpoint                        | Method | Description                            |
| ------------------------------- | ------ | -------------------------------------- |
| `/api/federation/actor/[user]`  | GET    | ActivityPub actor document             |
| `/api/federation/events/[slug]` | GET    | ActivityPub representation of an event |

## Events (`/api/events/*`)

Community events, surfaced at `/e/[slug]` (with `/e/[slug]/manage/*` organizer
tools) and editable via `components/EventEditor`:

| Endpoint                                    | Method           | Description                     |
| ------------------------------------------- | ---------------- | ------------------------------- |
| `/api/events`                               | GET/POST         | List or create events           |
| `/api/events/[slug]`                        | GET/PATCH/DELETE | Get, update, or delete an event |
| `/api/events/[slug]/rsvp`                   | POST/DELETE      | RSVP / cancel RSVP              |
| `/api/events/[slug]/rsvp/list`              | GET              | List RSVPs                      |
| `/api/events/[slug]/organizers`             | GET/POST         | List / add organizers           |
| `/api/events/[slug]/organizers/[profileId]` | PATCH/DELETE     | Update / remove an organizer    |
| `/api/events/[slug]/photos`                 | GET/POST         | List / add event photos         |
| `/api/events/[slug]/photos/[photoId]`       | PATCH/DELETE     | Update / remove a photo         |
| `/api/events/[slug]/notes`                  | GET/POST         | Organizer notes                 |
| `/api/events/[slug]/calendar.ics`           | GET              | Download event as iCalendar     |
| `/api/events/[slug]/stream-webhook`         | POST             | Live-stream provider webhook    |

## Venues (`/api/venues/*`)

Physical venues that host events, surfaced at `/venues`, `/venues/new`, and
`/venues/[slug]`:

| Endpoint                   | Method    | Description                  |
| -------------------------- | --------- | ---------------------------- |
| `/api/venues`              | GET/POST  | List or create venues        |
| `/api/venues/[slug]`       | GET/PATCH | Get or update a venue        |
| `/api/venues/check-parcel` | GET       | Look up parcel/property data |

## Admin (`/api/admin/*`)

Admin-only endpoints (require admin role):

| Endpoint                             | Method | Description            |
| ------------------------------------ | ------ | ---------------------- |
| `/api/admin/checkAdminStatus`        | GET    | Check if user is admin |
| `/api/admin/getDashboard`            | GET    | Admin dashboard data   |
| `/api/admin/allProfiles`             | GET    | List all profiles      |
| `/api/admin/importProfiles`          | POST   | Bulk import profiles   |
| `/api/admin/mentoring/dashboard`     | GET    | Mentoring admin data   |
| `/api/admin/articles/[slug]/remove`  | POST   | Remove article         |
| `/api/admin/articles/[slug]/restore` | POST   | Restore article        |

## Forms & Submissions

| Endpoint                        | Method | Description                   |
| ------------------------------- | ------ | ----------------------------- |
| `/api/createContactUs`          | POST   | Submit contact form           |
| `/api/createSignup`             | POST   | Submit signup form            |
| `/api/listings/intake`          | POST   | Submit a business listing     |
| `/api/admin/contactSubmissions` | GET    | List contact submissions      |
| `/api/admin/contactSubmissions` | PATCH  | Set contact submission status |
| `/api/getSignupList`            | GET    | List signup requests          |

Directory intake accepts a listing contact `email` independently of account
ownership. Signed-in applicants can explicitly set `manageWithPana: true` to
manage the new listing with their existing account. Otherwise, optional
`personalEmail` records an invitation and receives a sign-in link; omitting it
leaves the listing unclaimed without creating an account. The two email
addresses may match. A successful response includes `profileId`, `management`
(`account`, `invitation`, or `unclaimed`), `invitationEmail`, and
`invitationSent`, so the form does not promise an invitation email that failed.
The form also sends `expectedManagerId` to reject a changed sign-in rather than
silently assigning the listing to another account. Submission resends target
`profileId` and require a listing manager or staff administrator.

## Payments

| Endpoint                       | Method    | Description                                      |
| ------------------------------ | --------- | ------------------------------------------------ |
| `/api/create-checkout-session` | POST      | Create a donation Stripe Checkout Session        |
| `/api/shop/checkout`           | POST      | Reserve stock and create a shop Checkout Session |
| `/api/shop/webhook`            | POST      | Verify and process Stripe commerce events        |
| `/api/shop/portal`             | POST      | Open the signed-in subscriber's Customer Portal  |
| `/api/admin/shop`              | GET/PATCH | Read orders and update inventory or fulfillment  |
| `/api/admin/shop`              | POST      | Synchronize active one-time Stripe prices        |
| `/api/admin/shop/products`     | POST      | Create a Stripe product and price                 |
| `/api/admin/shop/products`     | PATCH     | Edit product, visibility, inventory, or price     |
| `/api/admin/shop/products`     | DELETE    | Archive a product and its active price            |
| `/api/admin/shop/media`        | POST      | Upload a product image to R2                      |
| `/api/admin/shop/refund`       | POST      | Issue a full or partial Stripe refund             |

## CRM / Marketing Data (`/api/crm/*`)

Backs the "Marketing Data (HighLevel)" section of `/account/user/edit`. Each
route acts on the authenticated user's own GHL contact record and degrades
gracefully — GHL is never a hard dependency. See
[docs/CRM-ROADMAP.md](../../docs/CRM-ROADMAP.md).

| Endpoint                       | Method | Description                                               |
| ------------------------------ | ------ | --------------------------------------------------------- |
| `/api/crm/contact`             | GET    | Read the user's GHL contact record                        |
| `/api/crm/contact`             | DELETE | Delete the contact and set `ghlOptedOut`                  |
| `/api/crm/contact/subscribe`   | POST   | Clear DND on all channels                                 |
| `/api/crm/contact/unsubscribe` | POST   | Set DND on all channels                                   |
| `/api/crm/contact/dnd`         | PATCH  | Set DND for one channel (`Email`/`SMS`/`WhatsApp`/`Call`) |
| `/api/crm/contact/copy-field`  | POST   | Copy a GHL field onto the Panamia profile                 |
| `/api/crm/contact/enroll`      | POST   | Enroll the contact in a GHL test workflow                 |

`/dnd` reads the contact before writing and rewrites every channel. GHL was
verified to merge a partial `dndSettings` rather than replace it, so this is
belt-and-braces against undocumented behavior — but the read is needed anyway,
since the top-level `dnd` flag is only true when every channel is suppressed.

## Realtime (WebRTC signaling)

Realtime is handled by a Cloudflare **Durable Object** (`SignalingRoom`, see
`worker/signaling-room.ts`), not a REST endpoint — Pusher has been removed.

| Endpoint                | Protocol  | Description                                |
| ----------------------- | --------- | ------------------------------------------ |
| `/ws/signaling/:roomId` | WebSocket | WebRTC signaling room (max 3 participants) |

The room relays SDP offers/answers, ICE candidates, chat, and Yjs whiteboard
updates between peers; media and files flow peer-to-peer (the server only
relays signaling). Participants and chat history are persisted in the DO's
SQLite so a dropped client (e.g. wifi → cellular) can reconnect; all state is
deleted once the last participant leaves.

This backs the **mentoring video** proof-of-concept at `/m/webrtc-test`
(peer-to-peer video/audio, text chat, data-channel file transfer, and a
collaborative whiteboard at `/m/webrtc-test/whiteboard`).

## Image Uploads

| Endpoint             | Method | Description          |
| -------------------- | ------ | -------------------- |
| `/api/uploadImage`   | POST   | General image upload |
| `/api/editAvatar`    | POST   | Update avatar        |
| `/api/editBanner`    | POST   | Update banner        |
| `/api/getUserImages` | GET    | Get user's images    |

## Context-Specific API Groups

Several API groups provide the same operations but scoped to different contexts:

| Group              | Context                      |
| ------------------ | ---------------------------- |
| `/api/profile/*`   | User's own profile           |
| `/api/admin/*`     | Admin managing any profile   |
| `/api/affiliate/*` | Affiliate partner operations |
| `/api/geo/*`       | Geographic/location-based    |
| `/api/user/*`      | User account operations      |

## Response Format

All API endpoints return JSON with consistent structure:

```typescript
// Success
{ success: true, data: { ... } }

// Error
{ success: false, error: "Error message" }
```

## Authentication

Most endpoints require authentication via a better-auth session.
Admin endpoints additionally check for admin role.
Public endpoints (search, profiles, articles) don't require auth.
