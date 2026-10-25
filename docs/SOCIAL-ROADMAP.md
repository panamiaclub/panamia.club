# Social Roadmap

Integrated social features for pana.social using [activities.next](https://github.com/llun/activities.next) as a capability provider.

## Overview

This document outlines the plan to add native social features to pana.social. Behind the scenes, the social layer federates with Mastodon, Pixelfed, and other ActivityPub servers.

### Design Philosophy

1. **Native experience**: Social features feel like part of panamia, not a "federation" bolt-on
2. **Invisible federation**: Users follow accounts and see posts; implementation details are not displayed
3. **Articles + Social**: Article comments come from the social layer (local + remote replies)
4. **Read-only upstream**: activities.next code imported via git subtree, never modified

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                          pana.social                              │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────┐     ┌─────────────────────────────────────┐   │
│  │    Article      │     │         Social Timeline             │   │
│  │  "My New Post"  │     │  ┌─────────────────────────────┐    │   │
│  │                 │     │  │ @author: Check out my new   │    │   │
│  │  [content...]   │     │  │ article about...            │    │   │
│  │                 │     │  │ [link] pana.social/a/...│    │   │
│  │  ─────────────  │     │  └─────────────────────────────┘    │   │
│  │  Comments:      │     │  ┌─────────────────────────────┐    │   │
│  │  ┌───────────┐  │     │  │ @coauthor: Excited to share │    │   │
│  │  │ @user@mast│◄─┼─────┼──│ this new article...         │    │   │
│  │  │ Great!    │  │     │  │ [link] pana.social/a/...│    │   │
│  │  └───────────┘  │     │  └─────────────────────────────┘    │   │
│  │  ┌───────────┐  │     │  ┌─────────────────────────────┐    │   │
│  │  │ @local    │◄─┼─────┼──│ @someone@mastodon.social    │    │   │
│  │  │ Love it!  │  │     │  │ replied to @author...       │    │   │
│  │  └───────────┘  │     │  └─────────────────────────────┘    │   │
│  └─────────────────┘     └─────────────────────────────────────┘   │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│  lib/federation/           external/activities.next/ (Read-only)   │
│  └── Panamia wrappers      └── ActivityPub capability provider     │
├────────────────────────────────────────────────────────────────────┤
│  PostgreSQL                                                        │
│  ├── articles, profiles, users (panamia tables)                    │
│  └── social_actors, social_statuses, social_follows (social_*)     │
└────────────────────────────────────────────────────────────────────┘
```

### Dependency Management

We selectively import and execute code from `external/activities.next/`. To avoid pulling in 50+ unnecessary dependencies, we trace only what's needed.

**Approach**: When importing modules from activities.next, track their dependencies in a manifest:

```
lib/federation/DEPENDENCIES.json    ← Generated manifest of required deps
scripts/trace-federation-deps.ts    ← Analyzes imports, generates manifest
scripts/validate-federation-deps.ts ← CI check: deps in manifest exist in package.json
```

**Workflow**:

1. Import a module from `external/activities.next/lib/...`
2. Run `npx tsx scripts/trace-federation-deps.ts <entry-files>`
3. Script traces imports, outputs `DEPENDENCIES.json`
4. Add missing deps to root `package.json`
5. CI validates deps stay in sync

**Example DEPENDENCIES.json**:

```json
{
  "description": "Dependencies required for ActivityPub federation",
  "source": "external/activities.next",
  "dependencies": {
    "jsonwebtoken": {
      "version": "^9.0.0",
      "reason": "HTTP signature signing",
      "imports": ["external/activities.next/lib/utils/signature.ts"]
    }
  },
  "existingInRoot": ["zod"],
  "newDepsNeeded": ["jsonwebtoken"]
}
```

### Article ↔ Social Integration

When an article is published:

1. **Author + co-authors** can each pre-compose an announcement post (optional)
2. **On publish**: All announcement posts go live simultaneously for "social splash effect"
3. **Replies to announcements** appear as comments below the article
4. **Comments section** shows replies from local users AND remote users (Mastodon, etc.)

```
Article (published)
├── Announcement by @author (SocialStatus, optional)
│   └── Reply from @reader@mastodon.social
│   └── Reply from @local_user
├── Announcement by @coauthor1 (SocialStatus, optional)
│   └── Reply from @fan@pixelfed.social
└── Announcement by @coauthor2 (SocialStatus, optional)

Comments Section renders ALL replies across ALL announcements
```

## Database Strategy

### Schema Namespacing

Prefix all social tables with `social_` to avoid conflicts with panamia tables:

| Table              | Purpose                                 |
| ------------------ | --------------------------------------- |
| social_actors      | ActivityPub actors (linked to Profile)  |
| social_statuses    | Posts, announcements, replies           |
| social_follows     | Follow relationships (local + remote)   |
| social_likes       | Likes/favorites                         |
| social_timelines   | Timeline entries for each actor         |
| social_attachments | Media attachments on posts              |
| social_tags        | Hashtags and mentions                   |
| social_recipients  | Post recipients (to/cc for ActivityPub) |

### Key Models

```typescript
// lib/schema/index.ts — key social models (abbreviated)

// Profile ↔ SocialActor (1:1, optional)
// Local users who enable social features get an actor
export const socialActors = pgTable(
  'social_actors',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    username: text('username').notNull(), // screenname
    domain: text('domain').notNull(), // pana.social for local
    profileId: text('profile_id').unique(),
    publicKey: text('public_key').notNull(),
    privateKey: text('private_key'), // null for remote actors
    inboxUrl: text('inbox_url').notNull(),
    outboxUrl: text('outbox_url').notNull(),
    followersUrl: text('followers_url').notNull(),
    followingUrl: text('following_url').notNull(),
    name: text('name'),
    summary: text('summary'),
    iconUrl: text('icon_url'),
    followingCount: integer('following_count').notNull().default(0),
    followersCount: integer('followers_count').notNull().default(0),
    statusCount: integer('status_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [unique().on(t.username, t.domain)]
);

// SocialStatus - posts, announcements, replies
// NOT 1:1 with Article - multiple authors can announce the same article
export const socialStatuses = pgTable(
  'social_statuses',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    uri: text('uri').notNull().unique(), // ActivityPub URI
    actorId: text('actor_id').notNull(),
    articleId: text('article_id'),
    type: text('type').notNull(), // Note, Article, etc.
    content: text('content'),
    contentWarning: text('content_warning'),
    url: text('url'),
    inReplyToUri: text('in_reply_to_uri'),
    inReplyToId: text('in_reply_to_id'),
    isDraft: boolean('is_draft').notNull().default(false),
    published: timestamp('published', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index().on(t.articleId),
    index().on(t.inReplyToUri),
    index().on(t.actorId, t.published),
  ]
);

// ArticleAnnouncement - draft announcements that publish with article
export const articleAnnouncements = pgTable(
  'article_announcements',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    articleId: text('article_id').notNull(),
    authorId: text('author_id').notNull(),
    content: text('content').notNull(),
    attachments: jsonb('attachments').notNull().default([]),
    statusId: text('status_id').unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [unique().on(t.articleId, t.authorId)]
);
```

### Migration Notes

- **Deprecate `mastodonPostUrl`** on Article model (will be removed in future migration)
- Add `ArticleAnnouncement` relation to Article
- Add `SocialStatus` relation to Article (for published announcements)

## Implementation Phases

### Phase 1: Infrastructure Setup (done)

**Status**: Complete

- [x] Add activities.next as git subtree in `external/activities.next/`
- [x] Create pre-commit hook to prevent external modifications
- [x] Add Playwright upstream integrity test
- [x] Add GitHub Actions workflow for upstream monitoring
- [x] Create `lib/federation/` directory structure
- [x] Add TypeScript path alias for external imports

### Phase 2: Database Schema (done)

**Status**: Complete

**Goal**: Add social tables to PostgreSQL

- [x] Create Drizzle models with `social_` prefix
- [x] Add SocialActor model (linked to Profile)
- [x] Add SocialStatus model (posts, replies)
- [x] Add ArticleAnnouncement model (draft announcements)
- [x] Add SocialFollow model (follow relationships)
- [x] Add SocialLike model (favorites)
- [x] Add supporting models (attachments, tags, recipients)
- [x] Create migration
- [x] Deprecate `mastodonPostUrl` field on Article

### Phase 3: Actor Management (done)

**Status**: Complete

**Goal**: Local users can have social identities

- [x] Create actor when user enables social features
- [x] Generate RSA keypair for HTTP signatures
- [x] WebFinger endpoint (`/.well-known/webfinger`)
- [x] Actor endpoint (`/p/[screenname]`)
- [x] Sync actor when profile changes (name, bio, avatar)

**Note on Username Sync**: The actor `username` is set from `profile.slug` at
creation time and is **never updated** afterward. This is intentional—changing
ActivityPub usernames breaks federation since remote servers cache the old
username. The `syncActorFromProfile()` function updates `name`, `summary`, and
`iconUrl` but not `username`. If a user needs a different social username, they
would need to delete and recreate their actor (losing followers).

### Phase 3.5: Legacy Feature Removal (done)

**Status**: Complete

**Goal**: Remove legacy UserFollow/UserList features to make way for social layer

The existing following and lists features were removed to avoid parallel
feature sets. SocialFollow is now the sole follow mechanism.

**Removed**:

- Database models: `UserFollow`, `UserList`, `UserListMember`
- API routes: `/api/user/getFollowing`, `/api/user/updateFollowing`,
  `/api/user/getList`, `/api/user/updateList`, `/api/list/*`, and legacy
  `/api/addFollower`, `/api/removeFollower`, `/api/getFollowing`, etc.
- UI pages: `/account/user/following`, `/account/user/lists`, `/list/[id]`
- Query hooks: `useUserFollowing`, `useMutateUserFollowing`, `useUserLists`,
  `useMutateUserLists`

**Added**:

- Navigation item "Timeline Posts" → `/timeline`
- Migration to drop `user_follows`, `user_lists`, `user_list_members` tables

### Phase 4: Social Timeline (Local) (done)

**Status**: Complete

**Goal**: Users can post, discover the public community feed, and switch to their mutual Panas

- [x] Friendly social-card composer with public Everyone default and mutual-only Panas sharing
- [x] Prominent photo/video and audio actions, inline playable media, file drop and image paste
- [x] Media-only posts, four-attachment limit, upload-busy protection, and visible draft-preserving errors
- [x] Optional content warning and formatting preview under More; saved account license applied server-side
- [x] Everyone opens by default; Panas shows mutual follows, own posts, and joined groups (`/s`)
- [x] Post detail page (`/status/[statusId]`)
- [x] Reply to posts (inline composer on post detail)
- [x] Like posts (optimistic UI with `useLikePost`/`useUnlikePost`)
- [x] Follow/unfollow local users (`FollowButton` component)
- [x] User's own posts list (`/p/[user]` profile page)
- [x] Follow buttons in directory search results

**Implementation**:

- Wrappers: `lib/federation/wrappers/{status,follow,timeline}.ts`
- API routes: `app/api/social/{timeline,statuses,actors,follows}/`
- React Query hooks: `lib/query/social.ts`
- UI components: `components/social/`
- Pages: `app/{s,p/[user],status/[statusId]}/`

**Hybrid Layout**: Actor profile page uses tabs (Posts | Followers | Following)
instead of separate pages. The feed opens on Everyone, with optional Panas and Voice notes tabs.
Panas requires accepted follows in both directions; group membership still adds joined-group posts
independently of follows.

### Phase 4B: Markdown Editor & Media Attachments

**Status**: Complete

**Goal**: Upgrade PostComposer with markdown editing and media upload support

**Markdown Editor**:

- [x] Write/Preview tabs in PostComposer (matching ArticleEditor UX)
- [x] Monospace textarea with markdown hint text
- [x] Client-side preview via `react-markdown`
- [x] Server-side MD-to-HTML conversion via `marked` for ActivityPub compatibility
- [x] Stored content is HTML (federation-ready `Note.content`)

**Media Attachments**:

- [x] Upload endpoint (`POST /api/social/media`) using Cloudflare R2 storage
- [x] Accepted types: images (jpeg, png, webp, gif) and audio (webm for voice memos)
- [x] Max file size: 10 MB, max 4 attachments per post
- [x] `SocialAttachment` records created alongside status
- [x] Thumbnail previews in PostComposer with remove button
- [x] `AttachmentGrid` component for display (responsive image grid, inline audio player)
- [x] Attachments included in all timeline queries

**Files**:

- `components/social/PostComposer.tsx` — Write/Preview tabs, media upload button, attachment previews
- `components/social/AttachmentGrid.tsx` — Responsive display grid for images and audio
- `app/api/social/media/route.ts` — R2 upload endpoint
- `lib/federation/wrappers/status.ts` — MD-to-HTML via `marked`, `SocialAttachment` creation
- `lib/federation/wrappers/timeline.ts` — `include: { attachments: true }` on all queries
- `lib/interfaces.ts` — `attachments` field on `SocialStatusDisplay`

**FLOSS Audio/Video Expansion**

**Status**: Complete

The current media implementation has two gaps to address:

1. **Audio/webm Safari bug** — `audio/webm` (the only accepted audio type) is not playable on Safari or iOS. Voice memo users on iPhone cannot hear recordings.
2. **No video support** — video MIME types are not accepted by the upload endpoint.

**FLOSS codec philosophy**: The project favors royalty-free, open codecs consistent with `docs/FLOSS-ALTERNATIVES.md`. H.264/AAC (MP4) carries patent licensing obligations through at least 2028. HLS is an Apple-controlled proprietary container format. WebM, VP9, AV1, and Opus are royalty-free and have no patent encumbrances.

**Safari coverage**: Superseded — see "Video: H.264 switch" below. The original plan targeted Chromium and Firefox only and showed Safari users an unsupported-browser message. That reasoning no longer holds for video: WebKit shipped full WebM support in Safari 17.4 (March 2024), and H.264/AAC MP4 plays on every Safari ever shipped. Video now targets all browsers. Audio (Opus in Ogg) is still Chromium/Firefox-only and keeps its fallback message.

**Video: H.264 switch**: Video is transcoded to H.264/AAC MP4, not VP8/WebM. Two reasons:

1. **Hardware decode.** iOS 17.4+ can play VP8-in-WebM, but WebKit lists hardware decode for VP9/H.264/HEVC/AV1 only. VP8 decodes in software — battery drain and dropped frames, which matters most in a feed that decodes several clips at once.
2. **It unlocks Cloudflare Media Transformations**, whose documented input is H.264 MP4. That is the route to poster frames (`mode=frame`, 1 unit each) for `social_attachments.preview_url`, which is still unused.

No new dependency: the `@ffmpeg/core@0.12.10` build already loaded is configured `--enable-gpl --enable-libx264` and carries FFmpeg's native AAC encoder. The project was already distributing that GPL core to encode VP8, so H.264 adds no new license obligation.

Encoder flags that are load-bearing (`lib/media/transcode.ts`):

- `-pix_fmt yuv420p` — Safari/QuickTime reject 4:2:2 and 4:4:4, which libx264 will otherwise inherit from the source.
- `-movflags +faststart` — moves the moov atom to the front so playback starts before the full file arrives.
- `-preset veryfast` — this core is built `--disable-asm`, so x264's hand-written SIMD is absent and slow presets cost far more here than natively.

`playsInline` is required on every `<video>`: without it iPhone forces playback into native fullscreen.

**Codec stack**:

| Format | Codec       | Container            | Use                                      |
| ------ | ----------- | -------------------- | ---------------------------------------- |
| Audio  | Opus        | `.ogg` / `.webm`     | Voice memos, audio posts                 |
| Video  | H.264 + AAC | `.mp4`               | Short video clips                        |
| Video  | VP8 + Opus  | `.webm`              | Legacy: posts predating the H.264 switch |
| Images | —           | jpeg, png, webp, gif | Unchanged                                |

**Playback compatibility**:

| Browser       | audio/ogg (Opus) | video/mp4 (H.264) |
| ------------- | ---------------- | ----------------- |
| Chrome / Edge | (yes)            | (yes)             |
| Firefox       | (yes)            | (yes)             |
| Safari / iOS  | (no)             | (yes)             |

**Client-side transcoding with ffmpeg.wasm**:

[`@ffmpeg/ffmpeg`](https://github.com/ffmpegwasm/ffmpeg.wasm) runs a WebAssembly build of ffmpeg in the browser. Transcoding happens before upload — the server receives a finished `.mp4` file and stores it without any server-side processing. The `@ffmpeg/ffmpeg` JS wrapper is MIT; the `@ffmpeg/core` wasm binary it loads is GPL-2.0-or-later, because it is built `--enable-gpl` with x264/x265.

Audio pipeline:

```
MediaRecorder (audio/webm, browser-native) → ffmpeg.wasm → audio/ogg (Opus) → upload
```

Video pipeline:

```
<input type="file"> (any format) → ffmpeg.wasm → video/mp4 (H.264+AAC) → upload
```

The ffmpeg.wasm WASM binary (~31 MB) is loaded on demand only when the user selects a file to upload, not on page load.

**Video playback**:

Plain `<video controls playsInline preload="metadata">` with a `<source>` whose `type` comes from the stored `mediaType`, so legacy WebM attachments keep announcing themselves correctly. A faststart H.264 MP4 needs no player library and no HLS for clips of this length.

**Updated accepted MIME types** (`app/api/social/media/route.ts`):

```typescript
const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/ogg', // Opus audio (replaces audio/webm)
  'video/mp4', // H.264/AAC video
  'video/webm', // legacy: posts predating the H.264 switch
];
```

The existing `audio/webm` MIME type accepted by `VoiceMemoComposer` will be removed from the server allowlist once the client-side Opus transcode is in place.

**Implementation tasks**:

- [x] Add `@ffmpeg/ffmpeg`, `@ffmpeg/util`, `@ffmpeg/core`, and `@vidstack/react` to dependencies
- [x] Create `scripts/copy-ffmpeg-wasm.js` — copies WASM to `public/ffmpeg/` via postinstall
- [x] Create `lib/media/transcode.ts` — `transcodeToOpus` and `transcodeToMp4Video` via ffmpeg.wasm singleton
- [x] Update `PostComposer.tsx` — run audio/video through transcode before upload, show "Transcoding… X%"
- [x] Update `VoiceMemoComposer.tsx` — replace raw `audio/webm` upload with Opus transcode, Safari guard
- [x] Update `app/api/social/media/route.ts` — accept `audio/ogg` and `video/mp4`, remove `audio/webm`
- [x] Update `AttachmentGrid.tsx` — native `<video>` for all browsers, Safari fallback for audio only
- [x] Add Safari/iOS "Please use Chrome or Firefox" notice for audio/video playback

### Phase 4C: Voice Memo Direct Messages

**Status**: Complete

**Goal**: Send private voice memos to other users

Voice memos are ActivityPub `direct` visibility messages sent to specific recipients (1-8 users). They use the existing post infrastructure but with a dedicated composer and auto-expiration.

**Features**:

- [x] @-mention autocomplete for recipient selection (1-8 recipients)
- [x] Voice recording (WebM audio, max 60 seconds)
- [x] Optional text content alongside or instead of voice recording
- [x] Direct visibility (recipients receive via ActivityPub `recipientTo`)
- [x] Auto-expiration: 30-day soft delete via `expiresAt` timestamp (was 7; see
      `drizzle/0062_dm_expiry_30_days.sql`)
- [x] Profile page "Send Voice Memo" button
- [x] Relocated notifications to `/updates/` with VoiceMemoComposer integration

**Technical Details**:

- `expiresAt` field on `SocialStatus` for soft delete
- Timeline queries filter out statuses where `expiresAt < now()`
- `VoiceMemoComposer` component with recipient chips and audio recording
- `SendVoiceMemoButton` component for profile pages
- Actor search API (`GET /api/social/actors/search`) for @-autocomplete

**Files**:

- `components/social/VoiceMemoComposer.tsx` — DM-specific composer with recipient selection
- `components/social/SendVoiceMemoButton.tsx` — Dialog trigger for profile pages
- `app/api/social/actors/search/route.ts` — Actor username search for autocomplete
- `lib/federation/wrappers/status.ts` — `direct` visibility + `expiresAt` handling
- `lib/federation/wrappers/timeline.ts` — `notExpiredFilter` on all timeline queries
- `app/updates/page.tsx` — Relocated from `/account/notifications/`

**TODO**: Hard delete of expired DMs and their R2 attachments — tracked in Phase 11.

### Phase 5: Article Announcements

**Goal**: Authors can announce articles when published

- [ ] Add announcement composer to article edit page
- [ ] Each author/co-author can write their own announcement
- [ ] Draft announcements stored in ArticleAnnouncement
- [ ] On article publish: create SocialStatus for each announcement
- [ ] Announcements include link to article

### Phase 6: Article Comments from Social

**Goal**: Article comments section shows social replies

- [ ] Query all SocialStatuses that are replies to article announcements
- [ ] Render replies as comments below article
- [ ] Allow logged-in users to reply (creates SocialStatus)
- [ ] Show reply author info (local or remote)
- [ ] Threaded replies support

### Phase 7: Federation - Outbound

**Goal**: Local posts federate to remote servers

- [x] HTTP signature signing for outgoing requests
- [x] Outbox endpoint (`/p/[user]/outbox`) — public-only statuses
- [x] Following endpoint (`/p/[user]/following`) — collection summary
- [x] Actor banner/header image in JSON-LD (`image` property)
- [ ] Deliver Create activities to followers' inboxes
- [ ] Deliver Follow activities to remote actors
- [ ] Deliver Like activities
- [ ] Deliver Undo activities (unfollow, unlike)

**Delivery Architecture — `FederationDelivery` Durable Object** (deferred)

The unchecked items above are blocked on having a viable delivery mechanism. Inline delivery from the request handler isn't viable: a popular post can hit 100+ followers across many hosts, which blows the CF Workers request budget, and there's no retry story if a remote server is flaky or slow. `createStatus()` in `lib/federation/wrappers/status.ts` already persists `recipientTo` / `recipientCc` correctly — only the fan-out step is missing.

**Plan**: Introduce a `FederationDelivery` Durable Object keyed by remote host (e.g. `mastodon.social`). After the status row commits, enqueue one job per unique destination host containing the activity and the target inbox URLs. The DO owns:

- Persistent queue in DO storage (survives request termination)
- Alarm-based exponential backoff retries
- Per-host request coalescing and rate limiting
- Dead-letter handling for persistently failing destinations

**Why DO over CF Queues**: Queues is the simpler answer for plain at-least-once delivery, but loses per-host state. For ActivityPub specifically, per-host state matters — it gives us per-destination ordering (helps with Create→Delete races), request coalescing (batching multiple activities going to the same host), connection reuse, and being a good citizen to remote instances. DOs edge out Queues on this axis.

**Knock-on cleanups once the DO exists**:

- `handleFollow()` in `lib/federation/inbox-handler.ts` currently fires Accept activities with `.catch(console.error)` and no retry. Replace with an enqueue call to the delivery DO.
- The `pending` follow status in `lib/federation/wrappers/follow.ts` becomes meaningful — a Follow sent via the DO stays `pending` until the remote Accept arrives at our inbox and transitions it to `accepted`.

Search the codebase for `DEFERRED (Phase 7)` for the concrete hook points.

**Visibility & Federation**:

- **Everyone (public)**: Included in the public outbox; outbound inbox delivery is the deferred work above.
- **Panas**: Explicit mutual-recipient snapshots with current mutual-read checks. Internal `Panas` status type, private visibility, no PUBLIC/followers broadcast, and no federation outbox or future delivery fan-out. Replies inherit the original circle.
- **Unlisted (legacy/API)**: Publicly readable, but absent from Everyone and the federation outbox. Not a local or county restriction.
- **Followers only (legacy/API)**: Ordinary private `Note` rows keep their original followers-collection addressing, which **includes remote followers**. These are not reinterpreted as mutual-only Panas posts.
- **Direct**: Sent to specific recipients only

### Phase 8: Federation - Inbound

**Goal**: Receive and process activities from remote servers

- [x] Inbox endpoint (`/p/[user]/inbox`)
- [x] HTTP signature verification
- [x] Process Follow activities (auto-accept, send Accept back)
- [x] Process Undo Follow activities (remove follow, decrement counts)
- [ ] Follow request approval flow (`manuallyApprovesFollowers`)
  - [ ] Pending follow requests shown in `/updates`
  - [ ] Accept/Reject UI with notification
  - [ ] Send Accept or Reject activity back to remote actor
  - [ ] User setting to toggle manual approval (default: auto-accept)
- [ ] Process Create activities (remote posts/replies)
- [ ] Process Like activities
- [ ] Process Delete activities
- [ ] Activity deduplication (`processed_activities` table keyed by `activity.id`)
- [ ] HTTP Signature replay protection (Date window + seen-digest cache)

**Deduplication**: Follow/Undo Follow today are implicitly deduped by the `social_follows` UNIQUE constraint. Once Create/Like/Delete processing lands, that implicit protection goes away — the same Create activity replayed twice would insert two status rows. Add an explicit `processed_activities` table keyed by `activity.id` with a short TTL sweep, and check it before dispatching in `handleInboxPost()`.

**Replay protection**: `handleInboxPost()` verifies HTTP Signatures but does not check the `Date` header window or track seen `(keyId, digest)` tuples, so a captured signed request can be replayed. A small cache — either a Postgres table with TTL sweep or a single Durable Object keyed by day-bucket — would close this. Reject requests with a Date outside ±5 minutes, and reject digests already seen inside the window. Low priority; see the `DEFERRED` note in `lib/federation/inbox-handler.ts`.

### Phase 9: Remote Follows & Discovery

**Goal**: Users can follow accounts on other servers

- [ ] Search for remote accounts by handle (@user@domain)
- [ ] WebFinger lookup for remote actors
- [ ] Fetch and cache remote actor profiles
- [ ] Follow remote accounts
- [ ] Display remote posts in timeline

### Phase 10: Polish & Moderation

**Goal**: Production-ready social features

- [ ] Block users (local and remote)
- [ ] Block instances
- [ ] Report content
- [ ] Content warnings support
- [ ] Rate limiting on federation endpoints
- [ ] Admin dashboard for moderation

### Phase 11: Realtime Timeline & Infrastructure Polish

**Goal**: Restore live-updating timelines and tighten background infrastructure

This phase captures work that was deferred when Pusher was removed and when the app migrated to Cloudflare Workers. None of it blocks user-facing features, but all of it improves the responsiveness and robustness of the social layer.

**Realtime timeline updates** (Pusher replacement)

When Pusher was removed, the "new post appears live in followers' feeds" UX regressed — `/s` currently relies on manual refresh. The plan is to reuse the WebSocket + Durable Object hibernation pattern already implemented in `worker/signaling-room.ts` for WebRTC signaling.

- [ ] Introduce a `TimelineFeed` Durable Object that holds the set of connected WebSocket clients for a given channel
- [ ] Shard the public timeline across a small fixed set of DOs; use one DO per user for the home timeline
- [ ] After `createStatus()` commits, publish the new status to the relevant DO(s)
- [ ] Client: subscribe via WebSocket on `/s` page mount, merge incoming statuses into the React Query cache

**Important**: This is a push channel layered on top of the existing read path. It is **not** a move to fan-out-on-write. `getHomeTimeline()` in `lib/federation/wrappers/timeline.ts` stays as a Postgres query — a per-user timeline DO would still cold-start from storage and hit the DB on hibernation wake, so materializing reads buys nothing while adding a stateful component. See the `DESIGN NOTE` on `getHomeTimeline()` for the reasoning.

**Browser push notifications via Durable Object**

UPSTREAM REFERENCE: external/activities.next `#528` / `#532` / `#536`

The upstream activities.next project added Web Push notification support (VAPID-based, service worker, per-notification-type settings). Rather than porting their standalone `web-push` npm approach (which depends on Node.js `crypto`), push notifications should be built into the notification Durable Object alongside the WebSocket replacement above:

- A DO per actor holds push subscriptions in durable storage alongside WebSocket connections — one notification event fans out to both channels.
- VAPID signing and ECDH key agreement use the Web Crypto API natively in CF Workers — no `web-push` npm package needed.
- The DO dispatches encrypted payloads directly via `fetch()` to the push endpoint, and auto-cleans stale subscriptions on 410/404 responses.
- Settings UI: per-notification-type toggles (mention, reply, follow, like) stored in the actor's profile preferences.

Schema needed: `push_subscriptions` table (actorId, endpoint, p256dh, auth) — see upstream migration `20260406120000_add_push_subscriptions.js` for reference.

- [ ] Add `push_subscriptions` Drizzle model to schema
- [ ] VAPID keypair generation and env var config (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`)
- [ ] Push subscription API routes (subscribe/unsubscribe, serve VAPID public key)
- [ ] Service worker (`sw.js`) with push event listener and notification click routing
- [ ] Push notification dispatch from notification DO (Web Crypto VAPID signing)
- [ ] Per-notification-type settings UI in account settings

**Proactive remote actor refresh** (minor)

- [ ] Background refresh of known remote actors via a DO with alarms

Today `ensureRemoteActor()` in `lib/federation/wrappers/remote-actor.ts` refreshes lazily on a 3-day TTL — an actor is only re-fetched when someone happens to reference them. A DO with alarms could proactively refresh actors we've delivered to in the last week, keeping public keys and inbox URLs fresher and avoiding latency spikes on the first interaction after TTL expiry. Low priority; the lazy path is correct, just not ideal.

**Expired DM hard delete** (holdover from Phase 4C)

- [ ] Hard delete for `expiresAt`-past statuses and their R2 attachments

Options: a Cloudflare Cron Trigger on a dedicated worker, or an alarm on a housekeeping DO that sweeps expired rows and deletes the R2 objects. Query-side filtering already hides expired DMs (`notExpired()` in `timeline.ts`), so this is purely storage hygiene.

## Directory Structure

```
lib/federation/
├── index.ts                 # Public API exports
├── config.ts                # Configuration
│
├── wrappers/                # High-level APIs
│   ├── actor.ts             # Actor CRUD
│   ├── status.ts            # Post/reply CRUD
│   ├── follow.ts            # Follow management
│   ├── timeline.ts          # Timeline queries
│   └── announcement.ts      # Article announcements
│
├── bridges/                 # Data transformation
│   ├── profile-to-actor.ts  # Profile → SocialActor
│   └── status-to-comment.ts # SocialStatus → Comment display
│
├── activities/              # ActivityPub handlers
│   ├── inbox.ts             # Incoming processing
│   ├── outbox.ts            # Outgoing delivery
│   └── handlers/
│       ├── create.ts
│       ├── follow.ts
│       ├── like.ts
│       └── delete.ts
│
├── crypto/                  # HTTP signatures
│   ├── keys.ts
│   ├── sign.ts
│   └── verify.ts
│
└── webfinger/               # WebFinger protocol
    └── index.ts
```

## Configuration

Social features use the existing `NEXT_PUBLIC_HOST_URL` for domain detection. No additional environment variables required for basic functionality.

Optional variables for ActivityPub metadata (shown to remote servers):

```bash
# Optional: Instance metadata for ActivityPub
SOCIAL_INSTANCE_NAME="Pana Mia Club"
SOCIAL_INSTANCE_DESCRIPTION="Panama's creative community"
SOCIAL_ADMIN_EMAIL=admin@pana.social
```

## User Experience

### For Article Authors

1. Write article as normal
2. Before publishing, optionally write an announcement post
3. Co-authors can each write their own announcement
4. On publish, announcements go live automatically
5. View comments (replies) below the article

### For Social Users

1. Enable social features in account settings
2. Choose a handle (@screenname@pana.social)
3. Post updates, follow others, engage with content
4. Browse Everyone by default, or switch to Panas for mutual follows, own posts, and joined groups
5. Follow accounts from other servers (@user@mastodon.social)

### For Article Readers

1. Read article
2. See comments section below (powered by social replies)
3. Reply to join the conversation (requires account)
4. Comments from Mastodon users appear alongside local comments

## Security

1. **HTTP Signatures**: All federation requests signed/verified
2. **Domain Verification**: Actor domains must match request origins
3. **Rate Limiting**: Protect against abuse from remote servers
4. **Content Sanitization**: Strip unsafe HTML from federated content
5. **Private Keys**: Encrypted at rest
6. **Moderation Tools**: Block users, instances, report content

## Rollback

If social features cause issues:

1. Revert the deployment or push a fix
2. Articles and core features continue working normally
3. Existing social data preserved in database

## References

- [ActivityPub W3C Spec](https://www.w3.org/TR/activitypub/)
- [activities.next Repository](https://github.com/llun/activities.next)
- [Mastodon ActivityPub Docs](https://docs.joinmastodon.org/spec/activitypub/)
- [WebFinger RFC 7033](https://tools.ietf.org/html/rfc7033)
