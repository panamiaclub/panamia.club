# Pana Mia Club Features

This document provides an overview of features available on the platform. Each feature area corresponds to a commit scope for tracking development changes.

---

## Core User System

### Authentication (`auth`)

Secure, passwordless authentication system supporting magic link emails and OAuth providers (Google, Discord, Facebook). Users can link multiple providers to a single account.

### User Accounts (`user`)

Core user management including account settings, screenname selection, and profile preferences. Screennames are unique identifiers displayed publicly on all contributions.

### Public Profiles (`profile`)

Community member profiles showcasing artists, businesses, and creatives. Profiles can include business information, social links, photos, and verification status.

---

## Discovery & Collections

### Directory (`directory`)

Browse and search community members by category, location, and keywords. Features advanced filtering for finding artists, venues, restaurants, and local businesses.

### Lists (`lists`)

User-curated collections of local businesses, implemented as [ActivityPub Collections](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-collection) for federation compatibility. Examples: "Best Coffee Shops in Wynwood" or "Jazz Venues in Miami Beach."

A list is a named, ordered set of directory listings a pana vouches for, and every entry carries that pana's own note — the point of the feature. The directory can already tell you a cafe exists; it cannot tell you that someone you trust orders the same thing there every Tuesday.

- Lists belong to a **person**, not a profile, so switching hats never re-attributes them and a business cannot vouch for anyone. Same rule as `profile_signals`.
- Only directory listings (`directory` / `hybrid` accounts, or business-intake rows) can be added. You cannot put a person on a list.
- Visibility is `private` (default) / `unlisted` / `public`. There is no "panas-only": followers-only cannot be enforced on a pull endpoint without signed GETs, and an unenforceable visibility level is worse than none.
- Public lists are served as an AS2 `OrderedCollection` from `/api/federation/lists/[listId]`, advertising `/p/{handle}/lists/{slug}` as the `id`. Addressing only — push delivery is deferred alongside statuses (see SOCIAL-ROADMAP Phase 6).

### Search (`search`)

Full-text search across profiles and content using PostgreSQL.

---

## Peer Mentoring

### Mentoring Platform (`mentoring`)

Connect with community members for peer-to-peer mentoring sessions. Features include:

- **Discover**: Find mentors by expertise and availability
- **Scheduling**: Book sessions with calendar integration
- **Video Sessions**: Real-time video calls with WebRTC
- **Session Notes**: Collaborative note-taking during calls

---

## Community Connectors

### Connector HQ and coordination (`connectors`)

The signup form at `/connectors/join` requires one **Major house** (primary focus) and one different **Minor house** (secondary focus), alongside the existing pod, optional introduction, and optional SMS consent. Both roles are explicitly stored and labeled in HQ, the application queue, and admin coordination. Programme membership still requires coordinator review; accepted members then choose real commitments in HQ without a second approval step. House choices personalize discovery without restricting where someone can help or reserving work. Editing preferences shows the member's actual granted tier and does not change membership, tier, or existing commitments.

Older memberships keep their unranked house interests and HQ access until the member confirms both roles through the same signup/preferences form; array order is never interpreted as a major/minor ranking. Staff can record both confirmed roles in the roster, or change only the tier while leaving legacy interests untouched. The compatibility `houses` array is derived from explicit major/minor choices for confirmed memberships. No migration or automatic reassignment of work is needed.

Accepted connectors use `/connectors/hq` to see **My commitments**, discover **Find a way to help**, and revisit **Completed** work. Opportunity signup is immediate, without a second approval step. Self-directed work supports an optional estimate. Programme gatherings and canonical house-action inspiration remain available; inspiration is distinct from a staff-published request.

Staff tools stay in **Admin / Connectors**: the dashboard manages membership and the programme calendar, Applications handles acceptance, and **Coordination** at `/admin/connectors/scheduling` publishes opportunities, shows their crew, follows commitments, and assigns work from observed load. Access uses the existing general admin role. There is no member/admin perspective switch.

- **Offboarded connectors** on the admin dashboard provides a confirmed **Reactivate** action, even when the active roster is empty. It restores HQ access and active scheduling/notification eligibility at the existing tier, preserving preferences, commitments, reservations, and the offboarding record. Reactivation records the acting admin and time; it does not reopen the signup form. Pending and declined applications cannot be reactivated through this action.
- Membership edits, application decisions, offboarding, and reactivation lock the profile before reading its membership so simultaneous saves cannot overwrite a newer programme decision. Internal offboarding and reactivation metadata stays out of member form responses.
- Signups are ordinary commitments with an `opportunity_id`, not a second task list. Connector-owned progress, staff assignments, load, and crew views read those same records. Views refresh after writes; they are not live subscriptions.
- A connector can release self-chosen work after confirming, but cannot remove a staff assignment. Staff can remove work, not set someone else's progress.
- Capacity is checked under a transaction lock. A retry does not create a duplicate signup. Completing a commitment keeps its crew place; releasing it reopens the place. An invitation with no target is uncapped, not zero.
- Closing an opportunity stops new signups without deleting existing commitments. Edits apply to future signups, preserving what an existing crew agreed to. The target cannot shrink below its crew, and an event link cannot change after signup.
- Linked events must still be upcoming, uncancelled programme gatherings or published Panamia-hosted public events. Cancellation, unpublishing, host changes, and elapsed dates block new signups. Outstanding event staffing counts open work; it is not the opportunity's reservation count.
- Estimates are optional integer minutes. Unknown effort remains visibly counted, never presented as zero capacity. Timing is free text, not an overdue date or weekly-hours claim.

**Release requirement:** apply `drizzle/0071_connector_opportunities.sql` through the normal migration sequence before running this application version (`yarn deploy:vinext` already migrates first). The migration imports no prototype people, events, or commitments.

---

## Community Content

### Articles (`articles`)

Community-driven content platform for sharing stories, guides, and local knowledge. Features include:

- **Co-authorship**: Collaborate with other community members
- **Peer Review**: Quality assurance through community review
- **Rich Content**: Markdown editing with image support
- **RSS Feeds**: Subscribe to content via RSS or JSON Feed

### Comments (`comments`)

Discussion threads on articles and profiles. _(Planned - via Fediverse replies)_

See [ARTICLE-ROADMAP.md](./ARTICLE-ROADMAP.md) Stage 14 for Fediverse integration plan.

---

## Social

### Social Timeline (`social`)

Multimedia microblogging platform integrated into the community. Built on [ActivityPub](https://www.w3.org/TR/activitypub/) for federation with Mastodon, Pixelfed, and other fediverse servers. Features include:

- **Posting**: Markdown-formatted posts with content warnings and visibility controls (public, unlisted, followers-only)
- **Media Attachments**: Images (jpeg, png, webp, gif) and audio (webm voice memos), up to 4 per post
- **Timeline**: Home feed (posts from followed accounts) and public feed
- **Engagement**: Like, reply, and follow other community members
- **Markdown Editor**: Write/Preview tabs with live markdown preview
- **ActivityPub**: Server-side markdown-to-HTML conversion for federation compatibility
- **Voice Memos**: Send private voice messages to 1-8 recipients with auto-expiration after 30 days

See [SOCIAL-ROADMAP.md](./SOCIAL-ROADMAP.md) for implementation details.

---

## Events & Calendar

### Events (`events`)

_(Future)_ Discover local events, shows, and gatherings. Stay connected to what's happening in your neighborhood.

---

## Communication

### Notifications (`notifications`)

Stay updated on community activity through the notification system. Accessible via the pana flower button in the navigation.

The notification system is designed to be [ActivityPub-compatible](https://www.w3.org/TR/activitypub/) for future federation with [activities.next](https://github.com/llun/activities.next).

See [NOTIFICATIONS-ROADMAP.md](./NOTIFICATIONS-ROADMAP.md) for implementation details.

### CRM Integration (`analytics`)

Marketing contacts and inquiry handling live in GoHighLevel (GHL), reached
through `lib/ghl.ts` and the sync jobs in the CRM bridge. What exists today:

- the privacy portal at `/api/crm/*`, which lets a signed-in member read,
  manage per-channel marketing preferences for, or delete their own GHL contact
  record
- newsletter and contact sync jobs, plus membership tags written by the Stripe
  relay
- Contact Us staff notifications, routed by category (`lib/contact-routing.ts`)

Contact Us submissions do **not** yet create GHL records — the app queue at
`/account/admin/contactus` remains the only system of record for inquiries.

See [CRM-ROADMAP.md](./CRM-ROADMAP.md) for the broader integration and
[CONTACT-ROADMAP.md](./CONTACT-ROADMAP.md) for the inquiry path specifically.

---

## Business Onboarding

### Intake Forms (`forms`)

Specialized registration forms for different business types:

- Restaurants & Food Service
- Artisans & Craftspeople
- Musicians & Performers
- Visual Artists
- Venues & Event Spaces
- Retail & Shopping
- Services & Professionals
- And more...

---

## Financial

### Donations (`donations`)

Support the platform through tiered donations via Stripe:

- **dePana**: Basic supporter tier
- **Confiado**: Trusted community member
- **Real**: Major supporter

---

## Administration

### Admin Dashboard (`admin`)

Platform administration for user management, content moderation, and verification.

---

## Infrastructure

These scopes are used for technical changes that don't directly correspond to user-facing features:

| Scope       | Description                                        |
| ----------- | -------------------------------------------------- |
| `api`       | API routes and middleware                          |
| `db`        | Database models and migrations                     |
| `ui`        | Shared UI components and design system             |
| `email`     | Email templates and delivery                       |
| `config`    | Configuration and environment                      |
| `deps`      | Dependency updates                                 |
| `ci`        | CI/CD and GitHub Actions                           |
| `test`      | Testing infrastructure                             |
| `docs`      | Documentation                                      |
| `build`     | Build configuration                                |
| `hooks`     | Git hooks and automation                           |
| `analytics` | Google Analytics, GoHighLevel, conversion tracking |
| `policy`    | Legal TOS, social gates, moderation, compliance    |
| `misc`      | Miscellaneous changes                              |

---

## Deferred Upgrades

Ideas that were intentionally deferred — not forgotten. Revisit once the Cloudflare migration is stable.

| Upgrade                 | Why Deferred                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yarn PnP (Plug'n'Play)  | Cloudflare migration in progress | Currently on Berry v4 with `nodeLinker: node-modules`. PnP eliminates `node_modules` entirely for faster installs and stricter dependency isolation, but requires editor plugins and some packages may need patching. Low-risk upgrade once the new hosting is proven.                                                                                                                                                                            |
| Self-hosted FFmpeg WASM | Cloudflare 25 MiB asset limit    | `ffmpeg-core.wasm` (30.7 MiB) is currently loaded from jsDelivr CDN at runtime (`lib/media/transcode.ts`). This is a **privacy concern** — users encoding video or audio have their requests routed through a third-party CDN, which could log timing/IP data. Preferred solution: host the WASM in Cloudflare R2 and serve via a `pana.social` subdomain so no third-party network request is made. Blocked until R2 is set up for this project. |

---

## Commit Scope Reference

When contributing, use these scopes in commit messages:

```
feat(articles): add co-author invitation system
fix(mentoring): resolve video connection timeout
docs(profile): update verification requirements
```

See `commitlint.config.cjs` for the complete scope list.
