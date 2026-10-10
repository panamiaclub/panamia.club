# Peer Mentoring — Guide & Roadmap

> **PROTOTYPE STATUS**: Peer-to-peer video mentoring using WebRTC is in **prototype/experimental stage**. While functional for testing, it may not work in all network configurations (especially behind strict firewalls or symmetric NATs). TURN server configuration is planned for improved connectivity.

## Table of Contents

- [Overview](#overview)
- [Philosophy & Best Practices](#philosophy--best-practices)
- [Getting Started](#getting-started)
- [User Guide](#user-guide)
- [Video Test (PoC)](#video-test-poc)
- [Session Types](#session-types)
- [Notification System](#notification-system)
- [Developer Guide](#developer-guide)
- [API Reference](#api-reference)
- [Roadmap](#roadmap)

---

## Overview

The Pana Mia Club mentoring feature enables **peer-to-peer video mentoring** within the community. Every user can act as both a **mentor** and a **mentee**, facilitating knowledge sharing and professional growth.

### Key Features

- **Profile Management**: Create and customize your mentoring profile
- **Mentor Discovery**: Search and filter mentors by expertise and language
- **Session Types**: Four session types (artistic, knowledge transfer, pana planning, pana support)
- **Session Booking**: Schedule sessions with a calendar interface
- **Mentor Confirmation**: Sessions require mentor approval before scheduling
- **Notifications**: ~~Notifications for session requests, confirmations, and cancellations~~ — retired, see [Notification System](#notification-system)
- **WebRTC Video**: Peer-to-peer video calls via Durable Object signaling
- **Real-time Chat**: Text messaging during sessions (persisted in DO SQLite)
- **Peer-to-Peer File Transfer**: Send files directly between participants via WebRTC data channels
- **Network Resilience**: Automatic reconnection on wifi/cellular network switches
- **Session History**: Track past and upcoming sessions

### Technology Stack

- **WebRTC**: Direct peer-to-peer connections for video/audio/data
- **Durable Objects + WebSocket**: Signaling server and chat persistence (replaces Pusher)
- **better-auth**: Secure authentication
- **PostgreSQL (Supabase)**: Relational database with Drizzle ORM
- **Cloudflare Workers + Hyperdrive**: Edge deployment with DB pooling
- **shadcn/ui**: Modern, accessible UI components

### Current Limitations

- **Network restrictions**: May not work behind strict firewalls or symmetric NATs
- **No TURN servers**: Relies on STUN only, limiting connectivity success rate
- **Browser compatibility**: Requires modern browsers with WebRTC support

---

## Philosophy & Best Practices

### MENTOR.org E-Mentoring Standards

Pana MIA's peer mentoring feature is informed by MENTOR's _E-Mentoring Supplement to the Elements of Effective Practice for Mentoring™_, which establishes evidence-based standards for technology-enabled mentoring programs.

> "E-mentoring elevates the unique intersection of mentoring and technology by providing mentees and mentors with a diverse field of programs that center availability and accessibility of platforms, eliminate geographic barriers for matches, encourage improvement of social and relationship skills, and offer specialized academic or career related support."
>
> — MENTOR: The National Mentoring Partnership

**Reference:** [E-Mentoring Supplement to the Elements of Effective Practice for Mentoring](https://www.mentoring.org/resource/e-mentoring-supplement-to-the-elements-of-effective-practice-for-mentoring/)

### Elements of Effective Practice

The _Elements of Effective Practice for Mentoring™_ outlines six core standards:

1. **Recruitment** — How mentors and mentees are attracted to the program
2. **Screening** — Ensuring safety and appropriate matching
3. **Training** — Preparing participants for effective mentoring relationships
4. **Matching & Initiating** — Connecting mentors and mentees thoughtfully
5. **Monitoring & Support** — Ongoing oversight of mentoring relationships
6. **Closure** — Ending relationships appropriately when needed

### Pana MIA's Approach

**Peer-to-Peer Model**

- Every user can be both mentor and mentee
- Expertise is distributed across the community
- Relationships are mutual and reciprocal

**Offline Mentoring Sessions**

- Support for in-person meetings alongside video calls
- Community events as mentoring opportunities
- Local connections strengthened through digital discovery

**Accessibility-First Design**

- Mobile-responsive interface
- Multiple session types for different needs
- Free options always available (panamia_planning)

**Community Safety**

- Session requests require mentor confirmation
- Cancellation tracking for accountability

---

## Getting Started

### Prerequisites

1. **Account**: Sign in to Pana Mia Club
2. **Browser**: Modern browser with WebRTC support (Chrome, Firefox, Safari, Edge)
3. **Permissions**: Camera and microphone access for video sessions
4. **Connection**: Stable internet connection (recommended: 5 Mbps+)

### Quick Start

1. Navigate to **Mentoring** → **Profile**
2. Enable your mentoring profile
3. Add your expertise and languages
4. Browse **Discover** to find mentors
5. Book your first session!

---

## User Guide

### Setting Up Your Mentoring Profile

Navigate to: **Mentoring** → **Mentoring Profile** → **Edit Profile**

1. Check "Enable mentoring profile" to become discoverable
2. Fill out your **Mentoring Bio** (10–500 characters)
3. Add **Areas of Expertise** (1–10 tags, e.g. "JavaScript", "Career Advice")
4. Add **Languages** (1+, e.g. "English", "Spanish")
5. Optionally set a **Video Introduction URL**, **Mentoring Goals**, and **Hourly Rate**
6. Click **Save Profile**

### Finding Mentors

Go to: **Mentoring** → **Discover**

Filter mentors by:

- **Expertise**: Search for specific skills
- **Language**: Filter by language
- **Free Only**: Show only free mentors

Each mentor card shows name, bio, expertise tags, languages, and rate. Click **Book Session** to proceed.

### Booking a Session

1. **Choose Session Type** (artistic, knowledge transfer, pana planning, or pana support)
2. **Select a Date** from the calendar (future dates only)
3. **Choose a Time Slot** (9 AM–5 PM, 30-minute intervals)
4. **Set Duration** (15, 30, 60, 90, or 120 minutes)
5. **Describe the Topic** (5–200 characters)
6. Click **Request Session**

Your session shows as "Pending" until the mentor accepts. They are **not**
notified — see [Notification System](#notification-system).

### Joining a Video Session

1. Go to **Mentoring** → **My Sessions** and click **Join Session**
2. Grant camera and microphone permissions
3. Wait for the other participant (connection takes 3–10 seconds)
4. Use controls: **Mute/Unmute**, **Camera On/Off**, **End Call**
5. Use the **Chat** panel for text messaging
6. Take **Session Notes** (auto-saved, persist after session)

### Managing Sessions

Go to: **Mentoring** → **My Sessions**

- **Upcoming Sessions**: Join, or cancel with a reason
- **Past Sessions**: View details, notes, and cancellation reasons

---

## Video Test (PoC)

A proof-of-concept page at `/m/webrtc-test` demonstrates the WebRTC + Durable Object signaling infrastructure independently of the mentoring session scaffolding.

### Architecture

```
Browser A ──WebSocket──► Durable Object (SignalingRoom) ◄──WebSocket── Browser B
    │                        │                                    │
    │    SDP offer/answer    │    SDP offer/answer                │
    │    ICE candidates      │    ICE candidates                  │
    │    chat messages       │    chat messages (persisted)        │
    │                        │                                    │
    └────── WebRTC P2P ──────┼────── video / audio / files ───────┘
                             │
                        SQLite storage
                     (participants, chat)
                     deleted on last leave
```

**Signaling Server**: `worker/signaling-room.ts` — a Durable Object class that:

- Accepts WebSocket connections from up to 3 participants
- Relays SDP offers/answers and ICE candidates between peers
- Persists participants and chat history in SQLite
- Supports reconnection (wifi → cellular) without losing room state
- Deletes all data when the last participant sends `leave`

**Worker routing**: `worker/index.ts` routes `/ws/signaling/:roomId` to the DO. The DO class is exported for wrangler discovery and bound as `SIGNALING_ROOM` in `wrangler.jsonc` (using `new_sqlite_classes` for CF free plan compatibility).

### How to Test

1. Deploy or run locally (`yarn dev:vinext`)
2. Log in and navigate to `/m/webrtc-test`
3. Click **Join Room** (grants camera/mic)
4. Have a second logged-in user open the same page and click **Join Room**
5. Video should connect within a few seconds

All users on the page share a single hardcoded room (`pana-test-room`, max 3 participants).

### Features Demonstrated

| Feature                       | How it works                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Video/audio**               | `getUserMedia` → tracks added to `RTCPeerConnection` → peer-to-peer                                                                                           |
| **Signaling**                 | WebSocket to Durable Object relays SDP + ICE between peers                                                                                                    |
| **Chat**                      | Messages sent via WebSocket → persisted in DO SQLite → broadcast to all                                                                                       |
| **Chat history**              | On join/reconnect, server sends full chat history from SQLite                                                                                                 |
| **Reconnection**              | On WebSocket drop, client retries with exponential backoff (up to 5 attempts). Server keeps participant in SQLite so peers know they're expected back         |
| **File transfer (immediate)** | "Send Now" reads file → chunks at 16 KB → sends via `RTCDataChannel` with back-pressure handling. Receiver reassembles and offers download                    |
| **File transfer (deferred)**  | "Send After Call" queues files locally. "End Call & Send Files" stops media tracks (frees bandwidth), then drains the queue over data channels before leaving |
| **Cleanup**                   | Explicit `leave` message removes participant from SQLite. Last participant's leave deletes all chat and participant data                                      |

### Signaling Protocol

Client → Server:

```
{ type: "join", userId, userName }
{ type: "offer", sdp, target }
{ type: "answer", sdp, target }
{ type: "ice-candidate", candidate, target }
{ type: "chat", text }
{ type: "leave" }
```

Server → Client:

```
{ type: "room-state", participants: [{userId,userName}], chatHistory: [{from,fromName,text,ts}] }
{ type: "peer-joined", userId, userName, peers }
{ type: "peer-left", userId }
{ type: "offer"|"answer"|"ice-candidate", from, sdp|candidate }
{ type: "chat", from, fromName, text, ts }
{ type: "error", message }
```

### File Transfer Limits

Files are sent peer-to-peer via `RTCDataChannel` — no server-side limit. Practical constraints:

- **Per-message**: 16 KB chunks (safe cross-browser max)
- **Memory**: Both sides buffer in memory; ~100–200 MB is comfortable
- **Back-pressure**: Sender pauses when `bufferedAmount` exceeds 256 KB
- **Deferred mode**: Stops video first, giving file transfer full bandwidth

---

## Session Types

| Type                 | Description                                                       | Pricing          |
| -------------------- | ----------------------------------------------------------------- | ---------------- |
| `artistic`           | Creative consultation — poem critique, art feedback, music review | Mentor sets rate |
| `knowledge_transfer` | Business advice, career guidance, technical skills                | Mentor sets rate |
| `panamia_planning`   | Community planning and coordination                               | Always free      |
| `pana_support`       | Peer support — personal guidance and solidarity                   | Mentor sets rate |

---

## Notification System

**Retired.** Mentoring sessions no longer create notifications — the request,
accept, decline and cancel routes still move a session through its states, but
none of them tells the other party. This was switched off along with the
writing-collaboration notifications; see
[NOTIFICATIONS-ROADMAP.md](./NOTIFICATIONS-ROADMAP.md).

The `mentoring` context survives in the `notification_context` enum and in
`getNotificationMessage` so rows written before the change still render.
Retiring a context is not the same as deleting it — Postgres has no
`DROP VALUE`, and `Invite`/`Accept`/`Reject` rows never expire.

### What used to fire

```
Mentee requests session → status: 'pending'   → Mentor notified (Invite)
Mentor accepts          → status: 'scheduled'  → Mentee notified (Accept)
Mentor declines         → status: 'declined'   → Mentee notified (Reject) + reason
Either party cancels    → status: 'cancelled'  → Other party notified (Delete) + reason
```

| Event             | ActivityPub Type | Context     |
| ----------------- | ---------------- | ----------- |
| Session requested | `Invite`         | `mentoring` |
| Session accepted  | `Accept`         | `mentoring` |
| Session declined  | `Reject`         | `mentoring` |
| Session cancelled | `Delete`         | `mentoring` |

Re-wiring these is cheap — the sentences are still written. The harder gap is
that there is no member-facing mentoring surface to read them on: `app/mentoring`
does not exist, only the admin views under `app/admin/mentoring` and
`app/account/admin/mentoring`.

---

## Developer Guide

### File Structure

```
app/m/
├── layout.tsx                          # Auth-gated layout with nav
├── page.tsx                            # Landing hub (4 cards)
├── discover/
│   ├── page.tsx                        # Mentor discovery
│   └── _components/
│       ├── filters.tsx                 # Search filters (client)
│       └── mentor-card.tsx             # Mentor display card
├── profile/
│   ├── page.tsx                        # Profile view
│   └── edit/
│       └── _components/
│           └── profile-form.tsx        # Profile edit form
├── schedule/
│   ├── page.tsx                        # Sessions dashboard (SSR)
│   ├── _components/
│   │   └── sessions-list.tsx           # Session cards (client)
│   └── book/
│       └── _components/
│           └── booking-form.tsx        # Booking form
├── session/
│   └── [sessionId]/
│       ├── page.tsx                    # Session page (SSR, auth check)
│       └── _components/
│           ├── video-room.tsx          # WebRTC video (placeholder)
│           ├── chat-panel.tsx          # Chat (placeholder)
│           └── notes-panel.tsx         # Session notes
└── webrtc-test/
    ├── page.tsx                        # Video test page (SSR)
    └── _components/
        └── video-call.tsx              # Full WebRTC PoC (client)

worker/
├── index.ts                            # CF Worker entry — routes /ws/signaling/:room to DO
└── signaling-room.ts                   # Durable Object: WebSocket signaling + SQLite state

app/api/mentoring/
├── discover/route.ts                   # GET: search mentors
├── profile/route.ts                    # GET/PUT: mentoring profile
└── sessions/
    ├── route.ts                        # GET/POST: list/create sessions
    └── [sessionId]/route.ts            # GET/PATCH: get/update session
```

### Key Infrastructure

- `wrangler.jsonc` — Durable Objects binding (`SIGNALING_ROOM` → `SignalingRoom`), migration tag `v1` with `new_sqlite_classes`
- `worker/index.ts` — Re-exports `SignalingRoom` class, routes `/ws/signaling/:roomId` to DO stub
- `worker/signaling-room.ts` — DO with SQLite tables (`participants`, `chat`), restores state on wake, cleans up on last leave

### Database Schema

The mentoring feature uses two Drizzle models (see `lib/schema/index.ts`):

- **profiles** — Extended with `mentoring` JSONB field (`MentoringInterface` in `lib/interfaces.ts`)
- **mentor_sessions** — Tracks sessions (status, scheduling, notes, cancellation)

Indexes on mentor/mentee email, userId, status, and scheduledAt for query performance.

### Troubleshooting

**Camera/mic not working**: Check browser permissions (chrome://settings/content/camera or about:preferences#privacy).

**"Connecting..." never completes**: Likely a firewall/NAT issue. TURN servers are planned. Workaround: try a different network.

**Poor video quality**: Low bandwidth. Turn off camera for audio-only. Need 5+ Mbps for comfortable video.

**WebSocket connection failed**: Ensure the worker is deployed with the `SIGNALING_ROOM` Durable Object binding. Check `wrangler.jsonc` has the `durable_objects` and `migrations` sections.

---

## API Reference

### Sessions

| Endpoint                               | Method | Description                                                             |
| -------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `/api/mentoring/sessions`              | GET    | List user's sessions (`role`, `status` query params)                    |
| `/api/mentoring/sessions`              | POST   | Request new session (`mentorEmail`, `scheduledAt`, `duration`, `topic`) |
| `/api/mentoring/sessions/[id]`         | GET    | Get session details                                                     |
| `/api/mentoring/sessions/[id]`         | PATCH  | Update notes (`action: 'update_notes'`) or cancel (`action: 'cancel'`)  |
| `/api/mentoring/sessions/[id]/respond` | POST   | Accept/decline request                                                  |

### Profiles

| Endpoint                  | Method | Description                                                    |
| ------------------------- | ------ | -------------------------------------------------------------- |
| `/api/mentoring/profile`  | GET    | Get mentoring profile                                          |
| `/api/mentoring/profile`  | POST   | Update mentoring profile                                       |
| `/api/mentoring/discover` | GET    | Search available mentors (`expertise`, `language`, `freeOnly`) |

---

## Roadmap

### Near-Term

- Google Calendar integration — sync sessions with external calendars
- Session reminders — email/notification before scheduled sessions
- Availability calendar — mentors set available time slots

### Medium-Term

- TURN server configuration — improved connectivity behind firewalls
- Session recording — optional, with consent
- Screen sharing — for technical/visual demonstrations
- Mentor badges — recognition for active community mentors
- Integrate Video Test PoC into actual session pages (`/m/session/[id]`)

### Long-Term

- Payment integration — Stripe checkout for paid sessions
- Group sessions — one-to-many mentoring for workshops
- Mentor matching algorithm — AI-assisted recommendations
- Federation — ActivityPub integration for cross-community mentoring

---

### References

- [MENTOR: E-Mentoring Supplement](https://www.mentoring.org/resource/e-mentoring-supplement-to-the-elements-of-effective-practice-for-mentoring/)
- [Elements of Effective Practice for Mentoring™](https://www.mentoring.org/resource/elements-of-effective-practice-for-mentoring/)
