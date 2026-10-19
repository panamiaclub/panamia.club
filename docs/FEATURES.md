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
| Self-hosted FFmpeg WASM | Cloudflare 25 MiB asset limit    | `ffmpeg-core.wasm` (30.7 MiB) is currently loaded from jsDelivr CDN at runtime (`lib/media/transcode.ts`). This is a **privacy concern** — users encoding video or audio have their requests routed through a third-party CDN, which could log timing/IP data. Preferred solution: host the WASM in Cloudflare R2 and serve via a `panamia.club` subdomain so no third-party network request is made. Blocked until R2 is set up for this project. |

---

## Commit Scope Reference

When contributing, use these scopes in commit messages:

```
feat(articles): add co-author invitation system
fix(mentoring): resolve video connection timeout
docs(profile): update verification requirements
```

See `commitlint.config.cjs` for the complete scope list.
