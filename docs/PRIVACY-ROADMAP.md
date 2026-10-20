# Privacy & Terms of Service Roadmap

Covers both the privacy policy and the terms of service: they share one
taxonomy, one consent mechanism, and one module registry.

## Overview

Panamia Club adopts a **layered disclosure framework** inspired by the Future of
Privacy Forum (FPF) visual privacy notices research, the Creative Commons
three-layer legal code structure, and ISO/IEC 29184:2020 online privacy notice
guidance. Every legal document ships in four representations:

| Layer                       | Audience             | Format                                                  |
| --------------------------- | -------------------- | ------------------------------------------------------- |
| **Privacy at a Glance**     | Casual users         | Scannable grid / icons ("Privacy at a Glance" diagrams) |
| **Plain-Language Summary**  | Engaged users        | Short paragraphs per topic                              |
| **Full Legal Text**         | Lawyers / regulators | Complete, section-anchored prose                        |
| **Machine-Readable Schema** | Automated tools      | JSON-LD (`policy.json`)                                 |

All layers are derived from a single **source-of-truth schema** so they cannot
drift out of sync. Each module is independently versioned with a public
changelog.

The glance grid and the prose tier list are both generated from
`app/legal/privacy/policy.json` via `lib/legal/privacy-policy.ts`. See
_Framework Architecture_ below. What the framework cannot yet do is check
itself against the database — see _Known Gaps_.

---

## Data Classification

All personal and user-generated data falls into exactly one of three tiers.
Every disclosure (Privacy at a Glance, summary, legal text, schema) must identify
which tier applies.

Each tier is subdivided into **retention classes** answering the question users
actually have: _what happens when I ask you to delete this?_ There are seven.

| Tier                | Retention class        | Meaning                                                                  |
| ------------------- | ---------------------- | ------------------------------------------------------------------------ |
| **Persistent**      | `deletable`            | Deleted immediately on confirmed request                                 |
|                     | `community_record`     | Anonymizable but not deletable after the archive threshold               |
|                     | `third_party_synced`   | Deletion requested from a named provider; their retention policy governs |
|                     | `moderation_record`    | Not deletable; outlives the accounts it concerns                         |
| **Temporary**       | `auto_purged`          | Automatically purged after a defined TTL                                 |
| **Peer Networking** | `in_the_wind`          | Propagated to servers we do not operate; deletion is advisory only       |
|                     | `participant_observed` | Seen by other people; we never retained it, they may have                |

Why the less obvious three exist:

- **`moderation_record`** — NIP-56 abuse reports cannot be user-deletable
  (an abuser would erase the reports filed against them) and are not
  CC-licensed community content. They are retained for safety independently of
  the accounts involved.
- **`in_the_wind`** — `third_party_synced` is modelled as a `providers` list
  where each entry names a counterparty and a deletion mechanism. A signed
  Nostr event propagates to an unbounded set of relays with no counterparty to
  ask, and NIP-09 deletes are advisory. Describing that as "deletion initiated"
  would be false. ActivityPub federation belongs here for the same reason.
- **`participant_observed`** covers the rest of the peer tier: data seen by
  session participants or people physically present, which we never stored.

### Persistent Data (Supabase / PostgreSQL)

Data stored for the lifetime of the user's account or longer. Persistent Data
is subdivided into four retention classes based on whether and when deletion
requests are honored.

#### Deletable on Request

Data deleted when the user requests account deletion or exercises their right
to erasure. Deletion is processed immediately upon confirmed request.

- Account credentials and authentication tokens
- Profile information (contact, address, descriptions, images, social links)
- Mentoring profile (expertise, languages, bio, hourly rate)
- Notification preferences
- Intake form submissions
- Session notes and mentoring session metadata
- Social graph (follows, followers, likes)
- RSVPs and event attendance records
- Nostr identity — the public key and whether it was issued or brought-your-own.
  The secret key (nsec) is generated in the browser and never transmitted to us,
  so there is nothing on our side to delete and nothing we can recover.
- Relay group membership (which groups a public key belongs to, and when)

**Retention:** Active account lifetime; deleted immediately on request.

#### Community Record (Deletion Not Honored After Archive)

Content that becomes part of the public or community record. Each module
defines an **archive threshold** after which the content is considered
permanent and deletion requests are not honored. Users are informed of this
at the point of publication.

| Content type                 | Archive threshold          | On deletion request (pre-archive) | On deletion request (post-archive)                              |
| ---------------------------- | -------------------------- | --------------------------------- | --------------------------------------------------------------- |
| Published articles           | 3 months after publication | Fully deleted                     | Content remains; attribution kept or anonymized (user's choice) |
| Social timeline posts        | **No archive threshold**   | **Always fully deleted**          | **Always fully deleted**                                        |
| Event records                | After event completion     | Fully deleted                     | Content remains; attribution kept or anonymized (user's choice) |
| Article peer review comments | When article is archived   | Fully deleted                     | Content remains; attribution kept or anonymized (user's choice) |

There is no event-photo row: per-event photo uploads do not exist (no
`event_photos` table). Add one if they land.

**Social timeline exception:** Personal social timeline posts (including
replies, reposts, and attachments) are **always fully deleted** on account
deletion regardless of age. The social timeline is treated as personal
expression rather than community record. An ActivityPub `Delete` activity
is sent to all known federation peers (best-effort; remote servers may or
may not comply).

**Rationale for other content types:** All user-generated content is CC BY
or CC BY-SA licensed. The CC license is irrevocable — once granted,
downstream recipients retain their rights regardless of whether the licensor
stops distributing. Honoring deletion of articles, event records, and other
community content after it has entered the public record would be
inconsistent with the CC license grant and would break attribution chains
for derivative works.

**Before archive threshold:** Deletion requests are honored for all content
types; content is removed and any federated copies receive an ActivityPub
`Delete` activity (best-effort; remote servers may or may not comply).

**After archive threshold:** The content persists (except social timeline
posts, which are always deleted). The user chooses one of two options:

- **Keep attribution:** Their name/screenname remains on published content.
  Profile page becomes a tombstone ("This member is no longer active") with
  links to their archived contributions. Private data (email, address,
  payment history, etc.) is still deleted.
- **Anonymize:** Their name/screenname is replaced with "Former Member" and
  their profile link is removed. The content and its license remain. For
  CC BY 4.0 / CC BY-SA 4.0 this invokes the licensor's Section 3(a)(3)
  attribution-removal right on the user's behalf. For CC0 1.0 there is no
  attribution requirement to remove — attribution was displayed voluntarily,
  and the platform simply stops displaying it. The choice applies uniformly
  across all three licenses.

In both cases, the original license on the content is unaffected.

#### Third-Party Synced

Data shared with external services over which Panamia Club has limited
deletion control. We will be explicit about what is shared, with whom, and
what deletion mechanisms each provider offers.

| Provider              | Data shared                                     | Deletion mechanism                                                                        | Limitations                                                                                        |
| --------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Stripe**            | Email, payment method, transaction history      | Stripe customer deletion API; transaction records retained per Stripe's legal obligations | Stripe retains transaction data for 7+ years for tax/legal compliance even after customer deletion |
| **Cloudflare Email**  | Recipient email (transactional sends only)      | No stored contacts — stateless email sending via Worker binding                           | CF may retain delivery logs per Cloudflare's data processing terms                                 |
| **GoHighLevel**       | GHL contact ID, email, name                     | Manual deletion via GHL API or dashboard                                                  | GHL data retention subject to their terms; we document opt-out via `ghlOptOut` flag                |
| **Google (OAuth)**    | Email, name, profile image (received, not sent) | Revoke OAuth grant; we delete stored tokens                                               | Google retains its own auth logs per Google's privacy policy                                       |
| **Apple (OAuth)**     | Email, name (received, not sent)                | Revoke OAuth grant; we delete stored tokens                                               | Apple retains its own auth logs per Apple's privacy policy                                         |
| **Cloudflare R2**     | Uploaded media files                            | Deleted when source record is deleted                                                     | CDN edge caches may persist briefly after origin deletion                                          |
| **ActivityPub peers** | Federated posts, actor profiles, follows        | `Delete` activity sent to known peers                                                     | Remote servers may ignore `Delete`; we cannot force removal from federated instances               |

**On account deletion:** We initiate deletion requests to all third-party
providers listed above. The privacy policy and Privacy at a Glance clearly state
which providers may retain data beyond our deletion request, and for how long.

#### Moderation Record

Safety records retained independently of the accounts they concern. **Not
deletable on request** and they survive account deletion — a member cannot
erase reports filed about them by deleting their account, and a reporter cannot
retroactively withdraw a record moderators acted on.

| Data                         | Retention                 |
| ---------------------------- | ------------------------- |
| Relay abuse reports (NIP-56) | Outlives account deletion |

Each report holds the reporter's and target's public keys, the report type, and
a snapshot of the reported content captured by the relay at forward time.
Reports are accepted from anyone — member or not — so neither pubkey is a
foreign key to `profiles`.

This class is the reason `relay_reports` is deliberately excluded from
`deleteAccount()`. Everything else keyed to a member's pubkey is purged there.

### Temporary Data (Short Retention)

Data retained only as long as necessary to provide a specific service, then
automatically purged.

- Mentoring session signaling and WebRTC connection metadata
- Whiteboard state (Durable Object SQLite — purged 30 min after session ends)
- Real-time chat messages during mentoring sessions
- Session video/audio streams (never recorded server-side unless explicitly enabled)
- OAuth tokens and transient authentication state
- IP addresses and user-agent strings (90-day analytics window)
- Email verification and magic-link tokens (expire per better-auth config)
- Pending relay group join and leave requests (joins: until an admin acts;
  leaves: a 24-hour debounce grace period)

There are no livestream SRT keys: Cloudflare-backed live-streaming was dropped
in the Nostr event-model merge. Reinstate if streaming returns.

**Retention:** Ranges from session-duration to 90 days. Each category specifies
its exact TTL in the Privacy at a Glance and schema.

### Peer Networking Data (User-to-User)

Data exchanged directly between participants, or propagated to servers we do not
operate. Split into two retention classes: `in_the_wind` (published to an
unbounded set of remote servers — ActivityPub and Nostr) and
`participant_observed` (seen by specific people, never stored by us).

Users are informed that:

- **We cannot retrieve, modify, or delete** data that has already been received
  by another participant.
- The receiving party's use of that data is governed by applicable law and
  community guidelines, not by our privacy policy alone.

Includes:

**`in_the_wind` — published to servers we do not operate:**

- Social posts, replies, likes, and follows federated via ActivityPub. A
  best-effort `Delete` activity is sent; remote servers may ignore it.
- Anything published to Nostr via the Resilience Network — group chat, kind 0
  profile metadata, RSVPs, relay lists. A Nostr event is signed by the member's
  key and stays cryptographically valid forever, so any relay may rehost it.
  NIP-09 delete requests are advisory and there is no enumerable list of relays
  to ask. We can delete from our own relay; nobody can delete from Nostr at
  large.

**`participant_observed` — digital peer interactions:**

- Video and audio streams during mentoring sessions (WebRTC peer-to-peer)
- Whiteboard content visible to session participants
- Chat messages seen by the other participant before deletion
- Co-author content shared during article collaboration
- Profile information visible to other users (name, bio, images, social links)
- Event RSVP and attendance information visible to organizers and attendees

**`participant_observed` — in-person event interactions:**

- Information shared verbally or in writing at Panamia Club events
- Business cards, contact details, or other materials exchanged between
  attendees
- Photos or recordings taken by other attendees (subject to event photo
  policy: allowed, restricted, or prohibited per event settings)
- Any personal information voluntarily disclosed to other attendees

Panamia Club has no ability to monitor, control, or delete information
exchanged between participants at in-person events. Event photo policies
and community guidelines set expectations for attendee behavior, but
enforcement of in-person data sharing is limited to community moderation
(warnings, suspension, removal from future events).

---

## Content Licensing Requirement

All user-generated content uploaded to or created on Panamia Club must be
licensed under one of the following Creative Commons licenses, selected by the
user at the time of creation:

| License          | What it allows                                                        |
| ---------------- | --------------------------------------------------------------------- |
| **CC BY 4.0**    | Anyone may share and adapt the work, with attribution                 |
| **CC BY-SA 4.0** | Same as CC BY, plus adaptations must use the same license             |
| **CC0 1.0**      | Public-domain dedication; anyone may use the work, no attribution due |

### Policy

1. **No traditionally copyrighted media.** Users may not upload content under
   "all rights reserved" copyright. Content that cannot be CC-licensed (e.g.,
   third-party copyrighted material the user does not own) must not be uploaded.
2. **License selection is required** at the point of upload or publication.
   Default is CC BY 4.0; users may switch to CC BY-SA 4.0 or CC0 1.0.
3. **License is irrevocable** per CC legal code — once published, the grant (or,
   for CC0, the public-domain dedication) cannot be withdrawn, though the user
   may stop distributing.
4. **Attribution** is displayed alongside content (author name/screenname, link
   to original, license badge). CC BY and CC BY-SA _require_ it; CC0 carries no
   such requirement, so its attribution is voluntary and may be removed on
   request without exercising a license right.
5. **Machine-readable license metadata** is embedded in every piece of content
   (JSON-LD, OpenGraph, and ActivityPub object properties).
6. **Scope:** Applies to articles, social posts, profile descriptions, event
   descriptions, photos, whiteboard exports, and any other user-contributed
   content. Does not apply to private account data (email, password, address).

### Implementation

- License picker component shared across article editor, social composer, event
  form, and image upload flows
- License stored per content item in the database (`cc_license` column:
  `cc-by-4`, `cc-by-sa-4`, or `cc-0`)
- ActivityPub objects include `cc:license` property
- Article and post pages render a visible CC badge linking to the license deed
- Upload API rejects submissions without a license selection
- ToS consent flow includes explicit acknowledgement of the CC licensing
  requirement

---

## Document Structure

```
legal/
├── privacy/
│   ├── at-a-glance.html          # Scannable grid
│   ├── summary.html                  # Plain-language summary
│   ├── full.html                     # Complete legal text
│   ├── policy.json                   # JSON-LD machine-readable
│   └── changelog.md                  # Version history
│
├── terms/
│   ├── summary.html                  # Plain-language overview
│   ├── core.html                     # Base terms (all users)
│   ├── modules/
│   │   ├── profiles.html             # Profile creation, directory listing
│   │   ├── articles.html             # Publishing, co-authoring, peer review
│   │   ├── social.html               # Timeline, follows, federation
│   │   ├── mentoring.html            # Sessions, video, whiteboard, chat
│   │   ├── events.html               # Events, venues, RSVPs, livestreaming
│   │   ├── uploads.html              # Images, media, CC licensing requirement
│   │   ├── payments.html             # Donations, memberships, Stripe
│   │   └── community.html            # Conduct, enforcement, appeals
│   ├── policy.json
│   └── changelog.md
│
├── dmca/
│   ├── policy.html                   # DMCA policy and agent contact info
│   └── takedown-form.html            # Submission form for takedown notices
│
├── breach/
│   └── policy.html                   # Data breach disclosure policy
│
├── accessibility/
│   └── statement.html                # WCAG 2.2 AA conformance statement
│
└── shared/
    ├── icons/                        # Visual icons for Privacy at a Glance
    └── cc-badges/                    # CC BY / CC BY-SA badge assets
```

---

## Privacy Policy — Section Outline

### Privacy at a Glance (Layer 1)

Grid format showing every data category with columns:

| Data | Source | Tier | Retention Class | Purpose | Retention | Shared With |
| ---- | ------ | ---- | --------------- | ------- | --------- | ----------- |

The **Tier** column shows the data tier (Persistent / Temporary / Peer).
The **Retention Class** column (for Persistent data only) shows:

- **Deletable** — removed on user request
- **Community Record** — anonymizable but not deletable after archive threshold
- **3rd-Party Synced** — deletion initiated but subject to provider policies

Categories:

- **Account** — email, password hash, screenname, name → Persistent / Deletable
- **Profile** — contact, address, descriptions, images, social links → Persistent / Deletable
- **Mentoring Profile** — expertise, languages, bio, rate → Persistent / Deletable
- **Mentoring Session** — video/audio/whiteboard/chat → Temporary + Peer
- **Session Notes** — mentor/mentee notes → Persistent / Deletable
- **Articles** — content, metadata, review history → Persistent / Community Record (3 months)
- **Article Reviews** — peer review comments → Persistent / Community Record (follows article)
- **Social Posts** — posts, replies, tags, mentions → Persistent / Community Record (3 months)
- **Social Graph** — follows, likes → Persistent / Deletable
- **Events** — event records, organizer data → Persistent / Community Record (after completion)
- **Event Photos** — approved uploads → Persistent / Community Record (3 months post-event)
- **RSVPs** — attendance data → Persistent / Deletable
- **Donations** — amount, tier → Persistent / 3rd-Party Synced (Stripe, 7-year legal hold)
- **Uploads** — images, media files → Persistent / CC-licensed (follows content retention class)
- **Analytics** — IP, user-agent, page views → Temporary (90 days)
- **OAuth** — provider tokens → Temporary / 3rd-Party Synced (provider logs)
- **Email** — CF Email Sending (stateless, no stored contacts)
- **CRM** — GoHighLevel contact data → Persistent / 3rd-Party Synced (GHL)

### Summary (Layer 2)

Sections (each links to corresponding full-text anchor):

1. What we collect and why
2. The three data tiers (Persistent, Temporary, Peer Networking)
3. Persistent data retention classes — what's deletable, what becomes
   community record, and what's synced to third parties
4. The archive threshold — when content becomes permanent and why
   (CC license irrevocability, community record integrity)
5. Who we share data with (Stripe, GoHighLevel, Cloudflare, OAuth
   providers, ActivityPub federation peers) — what each provider retains
   and what deletion mechanisms we invoke
6. Your content is CC-licensed (and what that means for deletion)
7. Your choices and rights (access, delete, correct, port, opt out,
   anonymize) — including what "anonymize" means for archived content
8. How we protect your data
9. Global Privacy Control (GPC) support
10. Children's privacy (no users under 13; COPPA)
11. International users (jurisdiction-neutral framing per ISO 29184)
12. How to contact us
13. How we notify you of changes

### Full Legal Text (Layer 3)

Satisfies disclosure requirements from:

- GDPR Articles 13/14
- California CPRA
- ISO/IEC 29184:2020 checklist
- COPPA (if applicable)

### Machine-Readable Schema (Layer 4)

```json
{
  "@context": "https://schema.org",
  "@type": "PrivacyPolicy",
  "version": "1.0.0",
  "effectiveDate": "...",
  "gpcSupported": true,
  "dataTiers": ["persistent", "temporary", "peer_networking"],
  "persistentRetentionClasses": {
    "deletable": {
      "description": "Deleted immediately upon confirmed request"
    },
    "community_record": {
      "description": "Anonymizable but not deletable after archive threshold",
      "archiveThresholds": {
        "articles": "3_months_after_publication",
        "social_posts": "3_months_after_publication",
        "events": "after_completion",
        "event_photos": "3_months_after_event",
        "article_reviews": "follows_article"
      },
      "anonymization": "author_replaced_with_Former_Member"
    },
    "third_party_synced": {
      "description": "Deletion initiated but subject to provider retention policies",
      "providers": [
        {
          "name": "Stripe",
          "purpose": "payment_processing",
          "data": ["email", "payment_method", "transaction_history"],
          "deletionMechanism": "stripe_customer_deletion_api",
          "providerRetention": "7_years_tax_legal"
        },
        {
          "name": "Cloudflare Email Sending",
          "purpose": "transactional_email",
          "data": ["recipient_email"],
          "deletionMechanism": "stateless_no_stored_contacts",
          "providerRetention": "delivery_logs_per_cf_terms"
        },
        {
          "name": "GoHighLevel",
          "purpose": "crm",
          "data": ["email", "name", "contact_id"],
          "deletionMechanism": "ghl_api_or_manual",
          "providerRetention": "subject_to_ghl_terms"
        },
        {
          "name": "Cloudflare",
          "purpose": "hosting_cdn_storage",
          "data": ["uploaded_media", "ip_address"],
          "deletionMechanism": "r2_object_deletion",
          "providerRetention": "cdn_edge_cache_brief_delay"
        },
        {
          "name": "Google",
          "purpose": "oauth_authentication",
          "data": ["email", "name", "profile_image"],
          "deletionMechanism": "revoke_grant_delete_tokens",
          "providerRetention": "google_auth_logs_per_google_policy"
        },
        {
          "name": "Apple",
          "purpose": "oauth_authentication",
          "data": ["email", "name"],
          "deletionMechanism": "revoke_grant_delete_tokens",
          "providerRetention": "apple_auth_logs_per_apple_policy"
        },
        {
          "name": "ActivityPub peers",
          "purpose": "social_federation",
          "data": ["posts", "actor_profiles", "follows"],
          "deletionMechanism": "activitypub_delete_activity",
          "providerRetention": "remote_servers_may_ignore_delete"
        }
      ]
    }
  },
  "dataCategories": ["..."],
  "userRights": {
    "access": true,
    "deletion": "deletable_class_only_or_anonymization",
    "correction": true,
    "portability": true,
    "anonymization": "community_record_class",
    "optOutOfSale": true,
    "gpcHonored": true
  },
  "contentLicense": {
    "options": ["CC-BY-4.0", "CC-BY-SA-4.0"],
    "default": "CC-BY-SA-4.0",
    "spdxIdentifiers": true,
    "irrevocable": true,
    "deletionImplication": "cc_license_survives_content_removal"
  }
}
```

---

## Terms of Service — Section Outline

### Core Terms (all users)

1. **Mutual preparation** — These terms have been mutually prepared by Panamia
   Club and its community. They shall not be construed against either party as
   the drafter. (Negates the contra proferentem doctrine that would otherwise
   interpret ambiguity against the platform.) Community members may request
   revisions or propose alterations to these terms by contacting
   hola@pana.social. Proposals are reviewed and, where adopted, incorporated
   into the next versioned release with changelog attribution.
2. **Acceptance required** — By creating an account or using any Panamia Club
   service, you agree to these terms. If you do not agree to these terms, you
   are not permitted to use Panamia Club services. Continued use after a
   versioned update constitutes acceptance of the revised terms.
3. **Eligibility** — Users must be 18 years of age or older. Panamia Club does
   not knowingly permit use by minors. Accounts discovered to belong to minors
   will be terminated and data deleted.
4. **Account** — one account per person, screenname rules, termination
5. **Content licensing** — all content must be CC BY or CC BY-SA; no all-rights-
   reserved uploads; irrevocability; attribution display
6. **AI-generated content policy:**
   - **Prohibited:** Content that is wholly AI-generated (text, images, audio,
     video) may not be published on the platform. This includes content from
     generative AI models (LLMs, image generators, voice synthesizers, etc.)
     presented as if it were human-created.
   - **Permitted with disclosure:** AI-assisted tools used as part of a
     human-directed creative process (e.g., grammar checking, translation
     assistance, code completion, accessibility descriptions) are permitted
     provided the user discloses AI assistance at the point of publication.
     The disclosure should identify the tool used and the nature of the
     assistance (e.g., "Translated with assistance from DeepL" or "Code
     reviewed with Copilot").
   - **Rationale:** The CC licensing model depends on human authorship.
     Copyright law in most jurisdictions does not protect purely AI-generated
     works, which would undermine the CC license grant. AI-assisted works
     retain human authorship and are copyrightable.
7. **Acceptable use** — prohibited conduct, spam, harassment, illegal content
8. **Law enforcement and data mining** — Panamia Club does not consent to law
   enforcement or government agencies mining, scraping, bulk-collecting, or
   conducting surveillance of user data on the platform without valid legal
   process (warrant, subpoena, or court order). Automated bulk access to user
   data by any party — law enforcement, commercial, or otherwise — is
   prohibited. Law enforcement requests must be directed to the designated
   contact and accompanied by valid legal process.
9. **Intellectual property** — user retains ownership; platform license limited
   to operating the service; CC license governs downstream use
10. **Data tiers** — reference to the three-tier data classification
11. **Limitation of liability** — standard disclaimers
12. **Dispute resolution** — Governed by the laws of the State of Florida.
    Exclusive venue: state and federal courts located in Broward County,
    Florida. No mandatory arbitration, no class-action waiver (per EFF
    guidance).
13. **Electronic recording consent** — Florida is an all-party consent state
    (Fla. Stat. § 934.03). Recording any electronic communication (video
    calls, audio, screen capture) or in-person conversation without the
    knowledge and explicit consent of all parties is prohibited and may
    constitute a criminal offense. This applies to mentoring sessions, event
    livestreams, and any other Panamia Club interactions. See module-specific
    terms for consent mechanisms.
14. **Modifications** — versioned, with changelog and advance notice
15. **Termination** — user-initiated deletion, platform-initiated suspension,
    data retention post-termination

### Module: Profiles

- Directory listing and public visibility
- Social gating (eligibility requirements for social features)
- Profile verification process
- Linked profiles
- Membership levels and what they unlock
- Image upload requirements and CC licensing

### Module: Articles

- Publishing workflow (draft → review → published)
- Co-authoring: invitation, acceptance, shared editing
- Peer review process and reviewer conduct
- CC license selection (per article)
- Removal policy (author-initiated, admin-initiated with reason)
- ActivityPub federation of articles to Mastodon
- Reply threading

### Module: Social

- ActivityPub federation: content may leave Panamia Club servers
- Peer Networking Data: federated content is subject to remote server policies
- Social eligibility gating
- Follow requests and approval
- Content warnings and visibility controls
- Hashtags, mentions, and discoverability
- Interaction with external Mastodon users
- CC license on all posts

### Module: Mentoring

- Session booking and scheduling
- Conduct expectations (mentor and mentee)
- Video/audio: WebRTC peer-to-peer (Peer Networking Data)
- Whiteboard: collaborative, Temporary Data (purged after session)
- Chat: Temporary Data
- Session notes: Persistent Data
- No server-side recording unless explicitly enabled with consent
- **All-party consent for recordings:** Florida is an all-party consent state
  (Fla. Stat. § 934.03). Recording any mentoring session (audio, video, or
  screen capture) without the knowledge and explicit consent of all
  participants is prohibited and may be a criminal offense under Florida law.
  The platform must obtain affirmative consent from all session participants
  before enabling any recording feature.
- Cancellation and no-show policy
- Free vs paid sessions and rate expectations

### Module: Events

- Event creation and organizer responsibilities
- Venue submission and approval
- RSVP and attendee data visibility
- Photo uploads and approval workflow (CC-licensed)
- Livestreaming: Cloudflare Stream, SRT keys as Temporary Data
- **All-party consent for recordings:** Florida is an all-party consent state
  (Fla. Stat. § 934.03). Recording at events (audio, video) requires the
  knowledge and consent of all recorded parties. Event photo policy settings
  (allowed, restricted, prohibited) must be communicated to attendees before
  the event. Livestreamed events must display a prominent notice that the
  event is being recorded/streamed; attendance constitutes consent to being
  recorded in the stream.
- Age restrictions and photo policies
- Cancellation policy
- Organizer and volunteer roles

### Module: Uploads

- Supported formats (JPEG, PNG, WebP, GIF)
- CC license required on all uploads
- Cloudflare R2 storage
- Content moderation and removal
- DMCA takedown process (reference dmca/policy.html)
- NCMEC/CyberTipline reporting obligation
- Prohibited content (CSAM, copyright infringement, etc.)

### Module: Payments

- Stripe for donations and memberships
- Stripe Checkout for merchandise sales; buyer contact and subscription tags may sync to GoHighLevel
- Donation tiers and membership levels
- Recurring subscription management
- Refund policy
- Tax receipts and record retention (7 years)

### Module: Community

- Code of conduct
- Behavioral expectations
- Enforcement process (warning → suspension → termination)
- Appeals mechanism
- Repeat infringer policy (DMCA)
- Admin moderation powers and transparency

---

## Consent Flow Design

### Signup

1. Display Privacy at a Glance
2. "I agree to the Terms of Service" checkbox (links to `terms/summary.html`)
3. "I understand the Privacy Policy" checkbox (links to `privacy/summary.html`)
4. Detect GPC header → auto-set data sharing preferences
5. Store consent receipt (version, timestamp, IP)

### First Contextual Encounters

Each module shows a contextual disclosure modal on first use:

| Trigger                  | Module shown                           |
| ------------------------ | -------------------------------------- |
| First profile creation   | profiles                               |
| First article draft      | articles + uploads (CC license picker) |
| First social post        | social (federation warning) + uploads  |
| First mentoring session  | mentoring (video/audio/peer data)      |
| First event creation     | events                                 |
| First event photo upload | uploads (CC license picker)            |
| First donation           | payments                               |

Each contextual modal:

- Shows the module's plain-language summary
- Links to the full legal text
- Records a consent receipt (module, version, timestamp)
- Is not shown again unless the module version changes

### Content Publication

Every publish action (article, post, photo, event) includes:

- Visible CC license badge (BY or BY-SA)
- Archive threshold notice (except social timeline):
  "This content is licensed under [CC BY-SA 4.0]. After [3 months], it
  becomes part of the community record and cannot be fully deleted. You may
  still request anonymization of your name. [Learn more]"
- Social timeline posts show a simpler notice:
  "This content is licensed under [CC BY-SA 4.0]. It can be deleted at any
  time. Federated copies on other servers may persist. [Learn more]"
- License selection persisted with the content record

### Account Deletion

The deletion flow is a multi-step process that gives the user full visibility
into what will happen.

#### Step 1 — Initiate

User navigates to Settings → Delete Account. Presented with:

> **Deleting your account is permanent.** Before proceeding, here's what
> will happen to your data. Please review each section carefully.

#### Step 2 — Data Summary

The system enumerates the user's data across all categories and displays
a summary grouped by what will happen:

**Always deleted (no action needed):**

- Account credentials (email, password, tokens)
- Profile information (contact, address, phone, social links)
- Mentoring profile (expertise, languages, bio, rate)
- Notification preferences
- Session notes and mentoring metadata
- Social timeline posts, replies, reposts, and attachments
- Social graph (follows, followers, likes)
- RSVPs and event attendance records
- Intake form submissions
- All Temporary Data (already purged or purged immediately)

**Third-party deletion requests (initiated automatically):**

| Provider          | What we'll request to delete                                          |
| ----------------- | --------------------------------------------------------------------- |
| Stripe            | Customer record (transaction history retained by Stripe for 7+ years) |
| CF Email Sending  | _(stateless — no stored contacts to delete)_                          |
| GoHighLevel       | CRM contact record                                                    |
| Cloudflare R2     | Uploaded media for deleted content                                    |
| OAuth providers   | Token revocation                                                      |
| ActivityPub peers | `Delete` activities for social posts and actor profile                |

> Some providers retain data per their own policies. [See details]

**Community record content (your choice required):**

If the user has post-archive content (articles published >3 months ago,
completed events, approved event photos >3 months old, archived peer review
comments), they are shown:

> The following content has passed its archive period and is part of the
> community record. When you published this content, you licensed it under
> Creative Commons — a license that is irrevocable under CC legal code.
> Others may have already copied, shared, or adapted your work under that
> license.
>
> **You cannot delete this content, but you can choose what happens to your
> name on it.**

| Content                       | Published  | License      | Status    |
| ----------------------------- | ---------- | ------------ | --------- |
| "Building Community in Miami" | 2026-01-15 | CC BY-SA 4.0 | Archived  |
| "Event: Casco Viejo Meetup"   | 2026-02-20 | CC BY-SA 4.0 | Completed |
| ...                           | ...        | ...          | ...       |

#### Step 3 — Attribution Choice

> **Choose how your name appears on archived content:**
>
> ○ **Keep my name** — Your name and screenname remain on your published
> content. A minimal profile page will remain visible ("This member is
> no longer active") linking to your archived contributions. No other
> personal data is retained.
>
> ○ **Remove my name** — Your name is replaced with "Former Member" on all
> archived content. Your profile page is fully removed. For CC BY / CC BY-SA
> content this uses the Creative Commons attribution-removal right
> (Section 3(a)(3)) on your behalf; for CC0 content, which carries no
> attribution requirement, we simply stop displaying your name.

If the user has no post-archive content, this step is skipped entirely.

#### Step 4 — Confirmation

> **Summary of account deletion:**
>
> - [x] Account and private data: **deleted immediately**
> - [x] Social timeline: **fully deleted** (ActivityPub `Delete` sent to peers)
> - [x] Pre-archive content ([N] items): **fully deleted**
> - [x] Third-party providers: **deletion requests sent**
> - [~] Post-archive content ([N] items): **[kept with your name / anonymized]**
>
> Type your screenname to confirm: [____________]
>
> [Cancel] [Delete My Account]

#### Step 5 — Execution

Deletion is processed immediately upon confirmation. No cooling-off period.

1. Account disabled and deletion process begins
2. All Deletable data purged
3. Social timeline posts deleted; `Delete` activities sent to AP peers
4. Pre-archive content deleted
5. Post-archive content anonymized (if chosen) or profile tombstoned
6. Active Stripe subscriptions cancelled; Stripe customer deletion initiated
7. GoHighLevel contact deleted
8. OAuth grants revoked; stored tokens deleted
9. Uploaded media for deleted content removed from R2
10. Consent receipt and deletion audit log retained for 1 year (legal basis:
    legitimate interest in demonstrating compliance)

#### Edge Cases

- **User has co-authored articles past archive:** Content remains as community
  record; only the departing user's attribution is affected. Co-authors'
  attribution is unchanged.
- **User's social posts were federated:** `Delete` activity sent to all known
  peers. Remote compliance is best-effort. The privacy policy and deletion
  confirmation both state this clearly.
- **User has active mentoring sessions:** Pending/scheduled sessions are
  cancelled with notification to the other party. Completed session records
  follow Deletable retention (deleted).
- **User has active recurring donation:** Stripe subscription cancelled before
  account deletion proceeds.
- **User is an event organizer for future events:** Deletion blocked until
  organizer role is transferred or event is cancelled. User is prompted to
  resolve this before proceeding.

---

## GPC and Privacy Signal Support

- Detect `Sec-GPC: 1` header in middleware
- When GPC is active:
  - Treat as valid CPRA opt-out of sale/sharing
  - Disable any non-essential analytics sharing
  - Record GPC detection in consent receipt
- Expose GPC support in `privacy/policy.json`
- Display GPC status on user's privacy settings page

---

## DMCA Agent Registration

1. Register designated agent at https://dmca.copyright.gov ($6)
2. Use registered agent service address (not personal address)
3. Publish agent contact info at `legal/dmca/policy.html`
4. Renew registration every 3 years
5. Implement takedown notice form at `legal/dmca/takedown-form.html`
6. Document takedown response procedure (receipt → review → action within
   24 hours → counter-notice process)

Agent details are stored as environment variables (see `.env.local.example`)
so legal pages can render them dynamically:

```
DMCA_AGENT_NAME="..."
DMCA_AGENT_EMAIL="..."
DMCA_AGENT_ADDRESS="..."
DMCA_AGENT_PHONE="..."
DMCA_REGISTRATION_DATE="..."
DMCA_RENEWAL_DATE="..."
```

---

## Data Breach Disclosure Policy

Panamia Club is subject to the **Florida Information Protection Act (FIPA)**,
Fla. Stat. § 501.171. This section defines our breach notification obligations
and internal incident response commitments.

### What Constitutes a Breach

Unauthorized access of data in electronic form containing "personal
information" as defined by § 501.171(1)(g): first name or initial + last name
combined with any of:

- Social Security number
- Financial account numbers (with access codes, passwords, etc.)
- Credit/debit card numbers (with access codes)
- Health/medical information
- Health insurance information
- Email address + password/security question
- User credentials for online accounts

**Encryption safe harbor:** If the breached data was encrypted, secured, or
otherwise rendered unusable, it falls outside the statute's definition of
"personal information" and notification is not required. This safe harbor
depends on the encryption being current and the key not being compromised.

### Panamia Club Data in Scope

Based on our data classification, the following Persistent Data categories
could trigger notification if breached:

| Data                      | FIPA category       | Stored where                |
| ------------------------- | ------------------- | --------------------------- |
| Email + password hash     | Email + credentials | Supabase (users table)      |
| Email + OAuth tokens      | Email + credentials | Supabase (accounts table)   |
| Payment method references | Financial account   | Stripe (not stored locally) |
| Full name + address       | PII combination     | Supabase (profiles table)   |

Data stored only at third parties (Stripe card numbers, OAuth provider
credentials) is their breach responsibility, not ours — but we must still
notify if our systems were the vector.

### Notification Requirements (§ 501.171)

**Timeline:**

- Notify affected individuals no later than **30 days** after determination
  of a breach or reason to believe a breach occurred
- May request **15 additional days** by providing good cause to the Florida
  Department of Legal Affairs within the original 30 days
- Notify the Florida Department of Legal Affairs if **500+ FL residents**
  are affected (within 30 days)
- Notify **consumer reporting agencies** (nationwide bureaus) without
  unreasonable delay if **1,000+ individuals** are affected at a single time
- Third-party agents (e.g., hosting providers, processors) must notify the
  covered entity within **10 days** of determining a breach

**Individual notice must include:**

- Date(s) or estimated date range of the breach
- Description of the personal information accessed or believed accessed
- Contact information for the covered entity

**AG / Department of Legal Affairs notice must include (500+ FL residents):**

- Synopsis of events surrounding the breach
- Number of residents affected or potentially affected
- Services offered to affected individuals (free of charge)
- Copy of the notice sent to individuals
- Contact information for the covered entity

**Method:** Written notice or email.

**No-harm exemption:** Notification is not required if, after investigation
and consultation with relevant law enforcement, the covered entity reasonably
determines the breach has not and will not likely result in identity theft or
other financial harm. This determination must be **documented in writing**,
**maintained for 5 years**, and **provided to the Department of Legal Affairs
within 30 days**.

**Penalties for non-compliance (per breach, not per individual):**

| Period         | Penalty                                        |
| -------------- | ---------------------------------------------- |
| Days 1–30      | $1,000/day                                     |
| Days 31–180    | $50,000 per 30-day period (or portion thereof) |
| After 180 days | Up to $500,000 maximum                         |

Violations are also treated as unfair or deceptive trade practices under
Florida consumer protection law, exposing the entity to private civil
actions.

### Internal Incident Response Plan

1. **Detection** — Monitor for unauthorized access via Cloudflare security
   events, Supabase audit logs, and application-level anomaly detection
2. **Assessment** — Within 24 hours of detection, determine scope: what data,
   how many users, attack vector, whether encryption safe harbor applies
3. **Containment** — Immediately revoke compromised credentials, rotate
   secrets, patch the vulnerability
4. **Legal review** — Determine whether FIPA notification threshold is met;
   consult counsel if ambiguous
5. **Notification** — If threshold is met:
   - Draft individual notice per § 501.171 content requirements
   - If 500+ residents: prepare AG notice package
   - Send within 30-day window (target: within 14 days)
6. **Remediation** — Document root cause, implement preventive measures,
   update security practices
7. **Transparency** — Publish a post-incident summary on the site (excluding
   details that would compromise security) as part of our commitment to the
   mutually-prepared terms

### Reasonable Security Measures (§ 501.171(2))

FIPA requires covered entities to "take reasonable measures to protect and
secure data in electronic form containing personal information." Our baseline:

- Encryption at rest (Supabase/PostgreSQL) and in transit (TLS everywhere)
- Password hashing via better-auth (bcrypt/scrypt)
- OAuth tokens stored server-side, never exposed to client
- Cloudflare WAF and DDoS protection
- Environment variable segregation (secrets never in client bundles)
- R2 bucket access controls
- Regular dependency audits (Dependabot)

### Privacy Policy Disclosure

The privacy policy must include:

- Statement that we maintain a breach response plan
- Commitment to notify affected users per Florida law
- Contact information for reporting suspected breaches
- Link to the full breach disclosure policy

---

## Framework Architecture

`app/legal/privacy/policy.json` is the source of truth. Both rendered surfaces
derive from it through `lib/legal/privacy-policy.ts`:

```
app/legal/privacy/policy.json          <- author categories HERE
        |
        v
lib/legal/privacy-policy.ts            <- resolves tier + retention class
        |                                 from position, exports `tiers`,
        |                                 `allCategories`, `providers`
        +--> components/legal/PrivacyAtAGlance.tsx   (glance grid)
        +--> app/legal/privacy/page.tsx              (prose tier list)
```

A category's tier and retention class come from **where it sits** in the JSON,
not from a field on the category:

| JSON location                        | Tier              | Class              |
| ------------------------------------ | ----------------- | ------------------ |
| `persistentRetentionClasses.<class>` | `persistent`      | the containing key |
| `temporaryData`                      | `temporary`       | `auto_purged`      |
| `peerNetworkingData.<class>`         | `peer_networking` | the containing key |

Machine-readable fields (`name`, `data`, `source`, `purpose`, `retention`) are
snake_case and stable. The `display` object carries presentation copy only.
`module` links a category to its legal terms module id.

Because that mapping is total, **tier is a filter, not a badge**. Each glance
card shows only its retention class; the class already determines the tier, so
a tier badge would restate it. Tier still earns its keep as a coarse filter —
three buttons instead of seven.

### The module registry

"A module" means an entry in four places, validated by
`scripts/check-legal-modules.sh` in pre-commit:

| File                                    | Carries                                  |
| --------------------------------------- | ---------------------------------------- |
| `app/legal/terms/namespaces.json`       | route dir -> module id (or exempt)       |
| `app/legal/terms/module-content.tsx`    | summary + items                          |
| `app/legal/terms/modules/{id}/page.tsx` | the page                                 |
| `app/legal/terms/policy.json`           | per-module version (read by consent API) |

The checker also validates that every `module` referenced from
`privacy/policy.json` resolves to a real module id.

---

## Known Gaps

Honest assessment of where the framework is weak. Ordered by cost.

### 1. It cannot tell when it is wrong about the schema

**Nothing connects the framework to the database.** Every documentation defect
found to date traces to this single gap, in both directions:

- **Documented, does not exist:** `event_photos` carried a 3-month archive
  threshold with no table behind it; `srt_keys` described dropped columns.
- **Exists, undocumented:** the `/r` relay tables held real personal data with
  no category at all, and account deletion did not touch them.

`check-legal-modules.sh` validates the registry against _itself_ — namespaces
against module-content against pages against policy.json. Every one of those is
the framework checking its own internal consistency. A category naming a
nonexistent table passes. A table full of personal data with no category
passes.

This is the highest-value fix available. See _Schema Binding_ below.

### 2. `source` is three questions wearing one label

The `display.source` field mixes:

- _who originated it_ — "You provide", "A member reports", "OAuth provider"
- _how it reached us_ — "Your recorded choices", "Automatic"
- _through what medium_ — "Physical presence", "Session activity"

This is why naming it resists every attempt: there is no single coherent thing
being named. Acceptable as a plain-language hint; do not mistake it for a
taxonomy. Note that "opt-in" must not be used here — the policy already uses it
in its regulatory sense (`optOutOfSale`, GPC/CPRA), and reusing it for "tapped
follow" would imply consent as the lawful basis.

### 3. English only

`locales/es` exists, the directory is `/directorio`, the community is South
Florida — and the document explaining what happens to people's data is English
only, with a clause saying English governs.

Moving display strings into `policy.json` was right for anti-drift and wrong
for i18n: labels now sit in a data file with no `t()` path. Translating means
`display.prose` becoming a key (`privacy.categories.nostr_identity.prose`)
rather than a literal, with `display.icon` staying as-is. Worth doing before
the prose layer is written, not after.

### 4. Re-consent hinges entirely on the major version digit

`recordConsent` matches on `majorVersion`, so a bump from 0.1 to 0.2 re-prompts
nobody, while 0.x to 1.0 re-prompts everybody. Retention classes can be added
and categories removed without triggering re-consent as long as the leading
digit is untouched.

This is a mechanism note, not a recommendation: whether a given change warrants
re-consent is the site owners' call. What the mechanism means in practice is
that **the version number they choose is the decision** — there is no separate
"is this material?" flag, so bumping major _is_ how that judgment gets
expressed. Worth knowing before `effectiveDate` is set.

### 5. Smaller

- **`display.prose` is a re-drift vector.** Each category has `label`,
  `data[]`, `retention` _and_ a hand-written sentence restating them. Editing
  `data[]` silently staling the prose is the three-copy problem shrunk to one
  file.
- **No schema validation on the JSON.** `asRawCategories` is an unchecked cast;
  the contract is convention. A bad `display.icon` silently falls back to a
  generic glyph; a missing `display` crashes the page. JSON Schema would be
  cheap.
- **`policy.json` 404s.** `JsonLd.tsx` advertises it as `encoding.contentUrl`,
  but a raw `.json` under `app/` is not a route, so the machine-readable claim
  is currently false. Fixing means moving the data file — a directory named
  `policy.json` cannot coexist with the file — which touches the terms side too.

### 6. Per-module legal prose is the remaining work

The framework's structure is in place; what it does not yet have is the
module-specific legal text that goes inside it. Privacy policy sections 1, 3, 4,
6, 7, 10 and 12 are still `<Placeholder>`, and every terms module renders its
summary and item list over a `<Placeholder>` for the full clause text.
`status: draft`, `effectiveDate: null`.

This is the expected order — get the taxonomy and the module registry right,
then write the binding prose per module — but it means the apparatus can look
more finished than it is. The next substantive step is drafting each module's
actual terms and each numbered privacy section, module by module, not more
structural work.

---

## Schema Binding

Closing gap #1. Three options were considered.

**Option A — JSON hints: categories point at tables.**
Add `"tables": ["relay_group_members"]` to each category in `policy.json`.
Rejected: strings cannot fail a build. A table rename breaks the link silently,
and it only catches documented-but-missing. Catching the direction that
actually bit us (exists-but-undocumented) needs a schema parser anyway.

**Option B — schema annotations: each table points at its category.**
Rejected: Drizzle has no first-class metadata slot on `pgTable`. The options
are comments (unenforceable) or a parallel map — which is Option C. It also
turns `lib/schema/index.ts` into a legal document.

**Option C — a typed inventory (recommended).**
A TypeScript module importing the actual Drizzle table objects:

```ts
// lib/legal/data-inventory.ts
import { relayGroupMembers, profiles, relayGroups } from '@/lib/schema';

export const NOT_PERSONAL_DATA = Symbol('not-personal-data');

// Exhaustive over every table in the schema. Adding a table without
// classifying it here is a compile error.
export const inventory: Record<
  SchemaTableName,
  CategoryName[] | typeof NOT_PERSONAL_DATA
> = {
  relay_group_members: ['relay_group_membership'],
  profiles: ['profile', 'mentoring_profile', 'nostr_identity'],
  relay_groups: NOT_PERSONAL_DATA, // group metadata, no member data
  // ...
};
```

Two properties neither other option has:

1. **Renaming or dropping a table is a compile error** — the import breaks.
   No string matching, no CI parser.
2. **Adding a table breaks the build until it is classified.** A
   `Record<AllSchemaTables, ...>` is exhaustive, so the forcing function lands
   at the moment the table is written, which is when the author actually knows
   the answer.

Caveats to design around:

- **Granularity is table-level, not column-level.** `profiles` alone backs
  three categories. This catches "table undocumented"; it does not catch "new
  personal column added to `profiles`". Column-level is possible and much
  heavier — treat as v2.
- **Some categories have no table** (`in_person_exchanges`, `webrtc_streams`,
  `session_streams`). They need an explicit "no storage" declaration in
  `policy.json` so the reverse check can assert every category is either backed
  by a table or declared storage-free.
- **The relay's own event store is out of scope.** `nostr_published_events`
  lives in the relay Worker's D1, not our Postgres. The inventory covers the
  panamia schema; the relay store must be declared external rather than
  silently missing.
- **Filtering `PgTable` from the schema module's exports** takes care — it also
  exports enums, relations, and types.

---

## Accessibility Statement

Publish at `legal/accessibility/statement.html`:

- Target conformance: WCAG 2.2 Level AA
- Known limitations (if any)
- Contact for accessibility issues
- Third-party content disclaimer
- Review and update annually

---

## Implementation Phases

### Phase 1 — Foundation (COMPLETE)

- [x] Create `legal/` directory structure (`app/legal/` route tree)
- [x] Define JSON-LD schema format for privacy policy and terms
      (`app/legal/privacy/policy.json`, `app/legal/terms/policy.json`)
- [x] Draft core terms (placeholder sections; full legal prose TBD)
- [x] Draft privacy policy (placeholder sections; full legal prose TBD)
      using GDPR Art 13/14 + CPRA checklist + ISO 29184 disclosure elements
- [x] Define data tier classification for every data category in the schema
- [x] Register DMCA agent (env var fallback: graceful "not yet registered"
      message with today's date if `DMCA_AGENT_NAME` is unset)
- [x] Old `/doc/terms-and-conditions` redirects to `/legal/terms`
- [x] Pre-commit hook validates namespace→module coverage
      (`scripts/check-legal-modules.sh`, `app/legal/terms/namespaces.json`)

### Phase 2 — Layered Presentation (COMPLETE)

- [x] Write plain-language summaries for privacy policy and each ToS module
      (summary box rendered above each module's detail list)
- [x] Design and build Privacy at a Glance component
      (`components/legal/PrivacyAtAGlance.tsx` — filterable grid, 37 categories
      derived from `policy.json`; presentation-only, no category list of its own)
- [x] Design and build CC license picker component
      (`components/legal/CCLicensePicker.tsx` — see Phase 4 for the shipped
      exports and consumers)
- [x] Build contextual disclosure modal component
      (`components/legal/ContextualDisclosure.tsx` — localStorage-backed,
      version-aware, per-module)
- [x] Create icon set for Privacy at a Glance categories
      (Lucide icons per category in PrivacyAtAGlance component)

### Phase 3 — Consent Infrastructure

- [x] Add consent receipt storage (table: `consent_receipts` — user_id,
      document, module, version, major_version, timestamp, ip, gpc_detected)
- [x] Implement consent helpers (`lib/consent.ts` — `hasConsent`, `recordConsent`)
- [ ] Wire signup consent into become-a-pana form (deferred to form rebuild)
- [x] Implement contextual module consent modal (`components/legal/ConsentModal.tsx`)
- [x] Add archive threshold consent hooks to article, event, and photo flows
      (code comments + `useModuleConsent` wiring in ArticleEditor, EventEditor,
      event photos API; activate when `/api/consent/*` routes are implemented)
- [x] Add social timeline deletion notice to social post composer
      (code comments + `useModuleConsent` wiring in PostComposer; type="notice")
- [x] Implement GPC detection in proxy middleware (`proxy.ts`)
- [x] Add privacy settings page (`/account/privacy` — view consents, GPC
      status, withdraw module consent, data rights links)

### Phase 4 — Content Licensing

- [x] Add `cc_license` column to articles, social statuses, event photos,
      and any other user-content tables
      (enum: `cc-by-4` | `cc-by-sa-4`, default `cc-by-sa-4`;
      migration: `drizzle/0010_add_cc_license.sql`)
- [x] Build shared CC license picker component
      (`components/legal/CCLicensePicker.tsx` — CCLicensePicker, CCLicenseBadge,
      CCLicensePickerModal, CCBadge, getLicenseMetadata)
- [x] Integrate license picker into article editor, social composer, event
      photo upload (ArticleEditor, PostComposer, event photos API)
- [x] Embed CC metadata in ActivityPub objects
      (`cc:license` property on Note objects in outbox route)
- [x] Render CC badges on all public content pages
      (article page byline, PostCard footer — minimal text link)
- [x] Enforce license selection in upload/publish API routes
      (articles POST/PATCH, social statuses POST, event photos POST —
      validated and stored; defaults to `cc-by-sa-4` if omitted)

### Phase 5 — Account Deletion Flow

- [x] Build deletion wizard page (`app/form/delete-account/page.tsx` — 6-page
      multi-step wizard following become-a-pana pattern: warning + data summary,
      attribution choice, third-party info, email confirmation, final
      confirmation, done page)
- [x] Build data summary view via preflight API
      (`app/api/account/delete-preflight/route.ts` — GET, returns `canDelete`,
      `blockers[]`, and `summary` with counts per content type and third-party
      service inventory)
- [x] Implement archive threshold calculation per content type
      (articles: `publishedAt < now - 3 months`; events: `status = completed`;
      event photos: `event.startsAt < now - 3 months`; social posts: always
      deleted regardless of age)
- [x] Build attribution choice step (keep name / anonymize)
      (radio group on page 2, skipped if no archived content; `'keep'`
      tombstones profile with sensitive fields cleared, `'anonymize'` sets
      `authorId`/`hostProfileId`/`uploaderProfileId` to null)
- [x] Build confirmation step with email verification
      (page 4: user types email to match `session.user.email`;
      page 5: checkbox + destructive button with spinner)
- [x] Implement immediate deletion executor
      (`lib/server/delete-account.ts` — `deleteAccount(userId, options)`,
      17-step orchestrated cleanup):
  - [x] Purge relay/Nostr data (`relay_group_members`,
        `relay_group_join_pending`, `relay_group_leave_pending` by pubkey;
        `nostrPubkey`/`nostrPubkeySource` cleared on the tombstone path).
        `relay_reports` is deliberately retained — `moderation_record`.
  - [x] Purge Deletable data (account, profile, sessions, notifications,
        consent receipts, intake forms, email migrations, interactions)
  - [x] Delete all social timeline posts regardless of age
        (attachments → tags → likes → follows → statuses → actor)
  - [x] Send ActivityPub `Delete` activities for actor to follower inboxes
        (signed with `signedHeaders` from `lib/federation/crypto/sign.ts`,
        deduplicated by shared inbox)
  - [x] Delete pre-archive content (articles with linked social statuses,
        events with cascade to photos/notes/attendees/organizers)
  - [x] Anonymize or tombstone post-archive content per user's choice
        (migration `0011_account_deletion.sql` drops NOT NULL on
        `articles.author_id`, `events.host_profile_id`,
        `event_photos.uploader_profile_id`)
  - [x] Cancel active Stripe subscriptions + delete customer
        (dynamic import of `stripe`, uses `profiles.stripe_customer_id`)
  - [x] Delete GoHighLevel contact via `GhlClient.deleteContact()`
  - [x] Revoke OAuth grants (`lib/oauth-revoke.ts` — `revokeAllOAuthTokens()`,
        Google token revocation endpoint + Apple revocation endpoint)
  - [x] Delete uploaded media from R2 (`deleteFile()` from `lib/blob/api.ts`
        for profile images, gallery, article covers, event covers, event
        photos, social attachments)
  - [x] Retain deletion audit log (`deletion_logs` table with userId, email,
        screenname, attributionChoice, archivedContentIds, deletedTables,
        thirdPartyResults, ip, completedAt, error)
- [x] Handle edge cases:
  - [x] Block deletion if user hosts future published events
        (preflight + executor both check; blocker message shown on page 1)
  - [x] Block deletion if user operates venues with upcoming events
  - [x] Block deletion if user has pending/scheduled mentoring sessions
  - [x] Handle co-authored articles (replace user entry in `coAuthors` jsonb
        with `{ userId: null, screenname: 'Previous Member', status: 'removed' }`)
  - [x] Preserve `screennameHistory` rows (federation 410 Gone continues)
- [x] Add deletion audit log table
      (migration: `drizzle/0011_account_deletion.sql` — `deletion_logs` table + `stripe_customer_id` on profiles + nullable FK columns for anonymization)
- [x] Add delete API route (`app/api/account/delete/route.ts` — POST,
      validates email confirmation, extracts IP, calls `deleteAccount()`,
      returns `{ success, warnings }` or `{ error, warnings }` with 409)
- [x] Refactor CLI delete script (`scripts/delete-user.ts` — now calls
      shared `deleteAccount()` with `attributionChoice: 'anonymize'`)
- [x] Wellness note on warning page (988 Suicide & Crisis Lifeline,
      soft muted card, non-intrusive)
- [ ] Wire Settings page "Delete Account" link to `/form/delete-account`
- [ ] TODO(GHL): Trigger GoHighLevel flow email "Your account has been deleted"

### Phase 6 — Machine-Readable Layer

- [x] `privacy/policy.json` and `terms/policy.json` already exist as source
      schemas (JSON-LD with `@context: "https://schema.org"`); no generation
      step needed — they are the source of truth
- [x] Add JSON-LD structured data to legal pages
      (`components/legal/JsonLd.tsx` — `LegalJsonLd` component embeds a slim
      schema.org `DigitalDocument` snippet via `<script type="application/ld+json">`
      with name, version, url, publisher, and optional `encoding` link to
      the full policy.json; added to all 6 legal pages)
- [x] Add OpenGraph metadata to legal pages
      (all 6 legal pages: index, privacy, terms, DMCA, breach, accessibility
      — `openGraph` fields: title, description, url, siteName, type)
- [x] Expose `.well-known/privacy-policy` endpoint
      (`app/.well-known/privacy-policy/route.ts` — 302 redirect to
      `/legal/privacy`)
- [x] Expose `.well-known/gpc.json` endpoint
      (`app/.well-known/gpc.json/route.ts` — `{ gpc: true, lastUpdate }` per
      GPC spec, 24h cache)

### Phase 7 — DMCA and Compliance

- [ ] Build takedown notice submission form
- [ ] Implement takedown workflow (receive → review → action → notify)
- [ ] Implement counter-notice workflow
- [ ] Add repeat infringer tracking
- [ ] Add NCMEC CyberTipline reporting integration (apply for ESP API access)
- [ ] Publish accessibility statement
- [ ] Draft and publish data breach disclosure policy (legal/breach/policy.html)
- [ ] Implement incident response checklist (internal runbook)
- [ ] Set up breach detection monitoring (Cloudflare security events, Supabase
      audit logs, application-level anomaly detection)
- [ ] Prepare AG notification template (for 500+ affected residents)
- [ ] Prepare individual notification template per § 501.171 content requirements
- [ ] Add breach reporting contact to privacy policy and site footer

### Phase 8 — Versioning and Maintenance

- [ ] Implement changelog generation from schema diffs
- [ ] Build notification system for policy updates (email + in-app)
- [ ] Set DMCA agent renewal reminder (3-year cycle)
- [ ] Schedule annual accessibility review
- [ ] Schedule annual privacy policy review against regulatory changes

### Phase 9 — Make the Framework Verifiable

Closes _Known Gaps_. The schema-binding layer is in place: `data-inventory.ts`
maps every Drizzle table to its categories (missing entry = compile error),
`validateInventory()` + `scripts/check-data-inventory.ts` enforce it in
pre-commit, and every table is now classified. Remaining:

- [ ] JSON Schema for `policy.json`; drop the unchecked `asRawCategories` cast
- [ ] Serve the machine-readable policy at a stable public URL. The JSON-LD on
      `/legal/privacy` already advertises `${SITE}/legal/privacy/policy.json` as
      its `encoding.contentUrl`, but nothing serves it (a raw `.json` under
      `app/` is not a route), so that link 404s today. Add a route that returns
      the raw JSON with `Content-Type: application/json` — a stable, linkable,
      crawlable endpoint for automated tools, regulators, and integrators. Same
      for `terms/policy.json`. Moving the source file means a directory named
      `policy.json` cannot coexist with the file, so this touches both policies.
- [ ] Column-level inventory (v2): catch a new personal column added to an
      already-classified table, not just an unclassified new table

---

## Standards and References

| Standard / Resource             | Use                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ISO/IEC 29184:2020              | Privacy notice structure and disclosure checklist                                                                                                             |
| GDPR Articles 13/14             | Required privacy disclosures (superset baseline)                                                                                                              |
| California CPRA                 | U.S. privacy baseline, GPC recognition                                                                                                                        |
| WCAG 2.2 AA                     | Accessibility conformance target                                                                                                                              |
| Creative Commons 4.0 Legal Code | Three-layer structure model; content licensing                                                                                                                |
| FPF Visual Privacy Notices      | Privacy at a Glance design and contextual disclosure                                                                                                          |
| FPF Short-Form Notices          | Summary layer guidance                                                                                                                                        |
| Automattic Open-Source ToS      | Forkable base terms (CC-licensed)                                                                                                                             |
| Open Terms Archive              | Industry ToS comparison                                                                                                                                       |
| SPDX License List               | Machine-readable license identifiers                                                                                                                          |
| DMCA Section 512(c)             | Safe harbor requirements                                                                                                                                      |
| 18 U.S.C. § 2258A               | NCMEC/CyberTipline mandatory reporting                                                                                                                        |
| Fla. Stat. § 501.171 (FIPA)     | Florida data breach notification requirements                                                                                                                 |
| Fla. Stat. § 501.1736           | Florida social media use by minors (age verification, parental consent, account termination) — future integration if eligibility age is ever lowered below 18 |
| Fla. Stat. § 934.03             | Florida all-party consent for electronic recordings                                                                                                           |
| EFF ToS Guidance                | No mandatory arbitration, no class-action waiver                                                                                                              |
| Global Privacy Control          | `Sec-GPC` header detection and honoring                                                                                                                       |
