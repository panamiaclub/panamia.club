/**
 * Drizzle ORM Schema
 *
 * Drizzle schema for all 23 models, 11 enums, and FK relations.
 * All 23 models, 11 enums, and all FK relations are defined here.
 *
 * Column naming: use explicit snake_case column names so the schema is
 * self-documenting and casing config on the drizzle client is not required.
 */

import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// =============================================================================
// Enums
// =============================================================================

export const accountType = pgEnum('account_type', [
  'personal',
  'directory',
  'hybrid',
  'other',
]);

export const notificationActivityType = pgEnum('notification_activity_type', [
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
  // Group membership. Join travels from a person toward a group, which is the
  // opposite direction to Invite. Remove and Block stay separate because being
  // removed once and being barred are different outcomes -- see drizzle/0052.
  'Join',
  'Remove',
  'Block',
]);

export const notificationContext = pgEnum('notification_context', [
  // coauthor, review and mentoring are retired: nothing creates them any more.
  // The writing collaboration routes (co-author invites, review requests) and
  // the mentoring session routes stopped notifying, but the values have to
  // stay, and in this order. Postgres has no DROP VALUE for an enum, the
  // declared order is the type's sort order, and rows already written still
  // reference them -- Invite, Accept and Reject never expire, so some of
  // these outlive every retention window. getNotificationMessage still
  // renders all three.
  'coauthor',
  'review',
  'article',
  'mentoring',
  'mention',
  'follow',
  'message',
  'system',
  'event',
  // Group invitations and their answers — see app/api/relay/groups.
  'group',
  // Social group membership — see lib/federation/wrappers/group-notify.ts.
  // Deliberately not 'group': that context reads Accept as "they joined your
  // group" for the inviter, where this one needs "your request was approved"
  // for the person who asked.
  'group_membership',
]);

export const notificationObjectType = pgEnum('notification_object_type', [
  'article',
  'profile',
  'session',
  'comment',
  'event',
  'venue',
  'group',
]);

export const ccLicense = pgEnum('cc_license', [
  'cc-by-4',
  'cc-by-sa-4',
  'cc-0',
]);

export const articleType = pgEnum('article_type', [
  'business_update',
  'community_commentary',
  'staff_update',
]);

export const articleStatus = pgEnum('article_status', [
  'draft',
  'pending_review',
  'revision_needed',
  'published',
  'removed',
]);

export const membershipLevel = pgEnum('membership_level', [
  'free',
  'basic',
  'premium',
  'business',
  'partner',
]);

export const sessionType = pgEnum('session_type', [
  'artistic',
  'knowledge_transfer',
  'panamia_planning',
  'pana_support',
]);

export const sessionStatus = pgEnum('session_status', [
  'pending',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'declined',
]);

export const intakeFormType = pgEnum('intake_form_type', [
  'art',
  'apparel',
  'food',
  'goods',
  'org',
  'services',
]);

export const socialFollowStatus = pgEnum('social_follow_status', [
  'pending',
  'accepted',
  // Written when an incoming Follow arrives from an actor the target has
  // blocked. Before blocking existed this value was unreachable, which made
  // the enum read like an approval flow that had been built and lost.
  'rejected',
]);

/**
 * Block and mute are one table with a discriminator rather than two tables:
 * every read path asks "is there anything between these two actors", and one
 * indexed lookup beats two. See docs/SOCIAL-GRAPH.md section B.
 */
export const socialBlockKind = pgEnum('social_block_kind', ['block', 'mute']);

/**
 * Who may open a new direct-message thread with an account.
 *
 * Ordered most open to most closed. The default is deliberately `everyone`:
 * the scarce resource in a network this size is first contacts that happen at
 * all -- a pana finds a maker in the directory and writes to them -- and
 * gating on mutual follow blocks exactly that person. `panas` is a weak proxy
 * for consent anyway; it is a thinner claim than "I read your profile and want
 * to work with you".
 *
 * The safety property that `panas` was standing in for is supplied instead by
 * the Requests folder: a thread opened by a non-Pana is held and, the
 * load-bearing part, rings nobody's phone. See docs/SOCIAL-GRAPH.md section C1.
 *
 * Local accounts only. ActivityPub has no equivalent field, so a remote actor's
 * value is always the default and is never read -- we cannot know a remote
 * server's policy and must not invent one.
 */
export const socialDmPolicy = pgEnum('social_dm_policy', [
  'everyone',
  'panas',
  'nobody',
]);

/**
 * Whether a recipient has consented to correspond with a sender.
 *
 * Only two values, because "declined" is deliberately not one of them. The
 * Requests UI offers delete-without-replying and block as separate actions,
 * and those mean different things: deleting is "not now", which must leave the
 * sender able to try again, while block is the permanent answer and is already
 * enforced by social_blocks. A `declined` state would be a third, invisible
 * block with no settings screen to undo it from.
 */
export const socialDmRequestState = pgEnum('social_dm_request_state', [
  'pending',
  'accepted',
]);

// New Events enums
export const eventStatus = pgEnum('event_status', [
  'draft',
  'published',
  'cancelled',
  'completed',
]);

// 'unlisted' = excluded from the /e listing and never crossposted to Nostr, but
// still viewable by direct URL (secret link). It is NOT access-controlled —
// true invitation-only private events (followers/invite/private) are a future
// phase, intentionally dropped in the Nostr merge; see docs/EVENTS-ROADMAP.md.
export const eventVisibility = pgEnum('event_visibility', [
  'public',
  'unlisted',
]);

// online / offline / hybrid — maps 1:1 to nostrlab's NIP-52 `mode` tag, lower
// case on the wire (see lib/event.ts crosspost mapping).
export const eventMode = pgEnum('event_mode', ['online', 'offline', 'hybrid']);

export const rsvpStatus = pgEnum('rsvp_status', [
  'going',
  'maybe',
  'not_going',
]);

export const venueStatus = pgEnum('venue_status', [
  'pending_review',
  'active',
  'suspended',
]);

export const parkingOptions = pgEnum('parking_options', [
  'none',
  'street',
  'lot',
  'garage',
  'valet',
  'limited_garage',
  'good_luck',
]);

export const venueType = pgEnum('venue_type', [
  'bar_restaurant',
  'library_civic',
  'park_outdoor_public',
  'private_residence',
  'religious_community_hall',
  'coworking_office',
  'gallery_museum',
  'theater_performance',
  'studio_practice',
  'classroom_school',
  'beach_waterfront',
  'hotel_ballroom',
  'warehouse_industrial',
  'rooftop',
  'other',
]);

export const venueEnvironment = pgEnum('venue_environment', [
  'indoor',
  'outdoor',
  'mixed',
]);

export const venueUsage = pgEnum('venue_usage', [
  'single_purpose',
  'mixed_use',
]);

export const adaAccessibility = pgEnum('ada_accessibility', [
  'yes',
  'partial',
  'none',
  'unknown',
]);

export const rentalModel = pgEnum('rental_model', [
  'free',
  'hourly',
  'flat',
  'tickets',
  'request_quote',
  'revenue_share',
  'other',
]);

export const venueOwnership = pgEnum('venue_ownership', [
  'private',
  'public',
  'nonprofit',
  'unknown',
]);

// Moderator workflow state for forwarded NIP-56 abuse reports.
// 'removed' is terminal/non-revocable: the reported content + report event have
// been hard-deleted from the relay, so there is nothing to reopen.
// Contact Us moderation state. Declared order is load-bearing: Postgres sorts
// enum columns by declaration, so `orderBy: asc(status)` floats open (unhandled)
// submissions to the top of the admin queue.
export const contactSubmissionStatus = pgEnum('contact_submission_status', [
  'open',
  'actioned',
  'dismissed',
]);

// What a Contact Us submission is about. Keep in sync with CONTACT_CATEGORIES
// in lib/contact-categories.ts, which carries the labels for form + admin.
export const contactSubmissionCategory = pgEnum('contact_submission_category', [
  'general',
  'membership',
  'press',
  'technical',
  'other',
]);

export const relayReportStatus = pgEnum('relay_report_status', [
  'open',
  'actioned',
  'dismissed',
  'removed',
]);

// Provenance of a profile's nostr_pubkey: 'issued' = generated client-side
// via the /r flow; 'byo' = uploaded by the user after acknowledging the
// cross-relay correlation disclosure. See docs/RESILIENCE-ROADMAP.md.
// How a member-created group admits people. 'open' groups are listed on
// /r/groups/browse and joinable in one click; 'invite_only' groups are
// reachable only through a relay_group_invites row. `discoverable` is derived
// from this at write time — see lib/relay/group-lifecycle.ts.
export const relayGroupJoinPolicy = pgEnum('relay_group_join_policy', [
  'invite_only',
  'open',
]);

export const nostrPubkeySource = pgEnum('nostr_pubkey_source', [
  'issued',
  'byo',
]);

// Ordered by power: owner can transfer or delete the listing, admin can manage
// content and other editors, editor can only edit the listing itself.
export const profileOwnerRole = pgEnum('profile_owner_role', [
  'owner',
  'admin',
  'editor',
]);

/**
 * What a pana expressed about a listing in the directory.
 *
 * 'save' is a private bookmark — "remember this for me". 'recommend' is a
 * public vouch — "I stand behind this". They share a table because they have
 * the same shape and the same uniqueness rule, but they are NOT interchangeable
 * and the query layer treats them differently: recommenders may be listed,
 * savers are only ever counted. See lib/server/profile-signals.ts.
 *
 * Deliberately distinct from social_follows, which is a federated ActivityPub
 * relationship meaning "deliver their posts to me" and can come from a remote
 * server. Saving is local, private, and says nothing about subscription.
 */
export const profileSignalKind = pgEnum('profile_signal_kind', [
  'save',
  'recommend',
]);

/**
 * Who can read a social group's posts and roster.
 *
 * A 'public' group is readable by anyone and its posts are PUBLIC-addressed,
 * so they federate and reach the home timeline through the existing path. A
 * 'private' group is readable only by active members and its posts are never
 * PUBLIC-addressed, which is exactly why this is a stored column rather than
 * something derived from join_policy: every read path has to be able to ask
 * "may this viewer see this at all" without first reasoning about admission.
 *
 * See the private-group leakage risk in docs/GROUPS-ROADMAP.md.
 */
export const socialGroupVisibility = pgEnum('social_group_visibility', [
  'public',
  'private',
]);

/**
 * How a social group admits people.
 *
 * 'open'    — joining takes effect immediately, membership lands 'active'.
 * 'request' — joining creates a 'pending' row an admin or moderator approves.
 * 'invite'  — cannot be joined on request at all; someone has to add you.
 *
 * Deliberately three values where relay_group_join_policy has two. An interest
 * group usually wants "anyone may ask, we decide", which open/invite_only has
 * no way to express.
 */
export const socialGroupJoinPolicy = pgEnum('social_group_join_policy', [
  'open',
  'request',
  'invite',
]);

/**
 * Ordered by power. 'admin' can change group settings, manage roles and delete
 * the group; 'moderator' can approve join requests and remove posts; 'member'
 * can only post and leave.
 */
export const socialGroupRole = pgEnum('social_group_role', [
  'admin',
  'moderator',
  'member',
]);

/**
 * Whether a membership row grants access.
 *
 * Only 'active' authorises reading a private group or posting to any group,
 * and only 'active' rows are counted in social_groups.member_count.
 *
 * 'banned' is retained rather than deleted on purpose: an open group is one
 * click to join, so a removed row would let a banned pana walk straight back
 * in. The row is the enforcement.
 */
export const socialGroupMemberStatus = pgEnum('social_group_member_status', [
  'active',
  'pending',
  'banned',
]);

/**
 * Who may read a recommendation list.
 *
 * - `private`  — the owner and nobody else. The default, because a list with
 *                one entry and a half-written note is a draft, and publishing
 *                on create would push it to the profile page mid-thought.
 * - `unlisted` — reachable by direct URL, excluded from listings and from the
 *                owner's public collection. Same meaning as
 *                `event_visibility.unlisted`, deliberately so: one word should
 *                not mean two things across two features.
 * - `public`   — listed, federated, anyone.
 *
 * ## Why there is no "panas-only"
 *
 * Because it could not be enforced. A followers-only *status* works because
 * visibility there is addressing on a push path — the post is delivered to a
 * follower's inbox and never sent anywhere else. A list is the opposite shape:
 * remote servers GET it. Gating a pull endpoint on "is the fetcher a follower"
 * requires authenticating the fetcher, i.e. signed GETs, which this codebase
 * does not implement (see lib/federation/crypto/sign.ts — signing exists for
 * outbound POSTs only, and inbound signature verification has no replay
 * protection yet).
 *
 * Shipping a `panas_only` value we cannot honour would be worse than not
 * offering it: the owner would believe the list was restricted while every
 * unauthenticated crawler read it. It is also precisely the sort of parallel
 * half-mechanism SOCIAL-ROADMAP Phase 3.5 removed the previous lists feature
 * to avoid. Revisit when signed fetches land.
 */
export const recommendationListVisibility = pgEnum(
  'recommendation_list_visibility',
  ['private', 'unlisted', 'public']
);

// NOTE: Cloudflare-backed live-streaming (stream_status enum + events.cf_stream_*
// columns) was intentionally dropped in the Nostr event-model merge. Placeholder
// only — reintroduce here alongside the events table fields when streaming lands.

// =============================================================================
// Convenience type aliases for enum values
// =============================================================================

export type AccountType = (typeof accountType.enumValues)[number];
export type NotificationActivityType =
  (typeof notificationActivityType.enumValues)[number];
export type NotificationContext =
  (typeof notificationContext.enumValues)[number];
export type NotificationObjectType =
  (typeof notificationObjectType.enumValues)[number];
export type ArticleType = (typeof articleType.enumValues)[number];
export type ArticleStatus = (typeof articleStatus.enumValues)[number];
export type MembershipLevel = (typeof membershipLevel.enumValues)[number];
export type SessionType = (typeof sessionType.enumValues)[number];
export type SessionStatus = (typeof sessionStatus.enumValues)[number];
export type IntakeFormType = (typeof intakeFormType.enumValues)[number];
export type SocialFollowStatus = (typeof socialFollowStatus.enumValues)[number];
export type SocialGroupVisibility =
  (typeof socialGroupVisibility.enumValues)[number];
export type SocialGroupJoinPolicy =
  (typeof socialGroupJoinPolicy.enumValues)[number];
export type SocialGroupRole = (typeof socialGroupRole.enumValues)[number];
export type SocialGroupMemberStatus =
  (typeof socialGroupMemberStatus.enumValues)[number];
export type RecommendationListVisibility =
  (typeof recommendationListVisibility.enumValues)[number];
export type EventStatus = (typeof eventStatus.enumValues)[number];
export type EventVisibility = (typeof eventVisibility.enumValues)[number];
export type EventMode = (typeof eventMode.enumValues)[number];
export type RsvpStatus = (typeof rsvpStatus.enumValues)[number];
export type VenueStatus = (typeof venueStatus.enumValues)[number];
export type ParkingOptions = (typeof parkingOptions.enumValues)[number];
export type RelayReportStatus = (typeof relayReportStatus.enumValues)[number];
export type NostrPubkeySource = (typeof nostrPubkeySource.enumValues)[number];
export type RelayGroupJoinPolicy =
  (typeof relayGroupJoinPolicy.enumValues)[number];
export type VenueType = (typeof venueType.enumValues)[number];
export type VenueEnvironment = (typeof venueEnvironment.enumValues)[number];
export type VenueUsage = (typeof venueUsage.enumValues)[number];
export type AdaAccessibility = (typeof adaAccessibility.enumValues)[number];
export type RentalModel = (typeof rentalModel.enumValues)[number];
export type VenueOwnership = (typeof venueOwnership.enumValues)[number];

// =============================================================================
// Auth Tables (better-auth)
// =============================================================================

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  screenname: text('screenname').unique(),
  lastScreennameChange: timestamp('last_screenname_change', {
    withTimezone: true,
  }),
  accountType: accountType('account_type').notNull().default('personal'),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  alternateEmails: text('alternate_emails')
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  notificationPreferences: jsonb('notification_preferences'),
  // Unused. Present since 0000_initial_schema.sql and never read by anything:
  // locality in the directory is served by the county filter (filterLocations
  // -> profiles.counties) and by distance from shared browser coordinates
  // (geolat/geolng -> calcDistance). A member zip is a coarser proxy for both
  // and would need a lookup table to become either, so the account settings
  // input that used to write this was removed rather than wired up. Kept as a
  // column because existing rows hold real data and dropping it is a migration.
  zipCode: text('zip_code'),
  affiliate: jsonb('affiliate'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const accounts = pgTable(
  'accounts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    // Declared by better-auth's account model and required to exist, but never
    // written: emailAndPassword is not configured in auth.ts, so sign-in is
    // magic-link and OAuth only. See 0034_account_issuer_rollback.
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    // The identity better-auth 1.7.4 looks accounts up by. 1.7.0-1.7.2 keyed on
    // (issuer, accountId) instead; that model was withdrawn, along with the
    // issuer column, in 0034.
    providerAccountUnique: uniqueIndex('accounts_provider_account_unique').on(
      table.providerId,
      table.accountId
    ),
  })
);

export const sessions = pgTable('sessions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

/**
 * Every lock and unlock ever applied to an account.
 *
 * `users.lockedAt` is the current state; this is the history behind it. An
 * unlock clears that column, so without this table a member who has been
 * locked three times looks exactly like one who never has — which is the
 * context the next person needs to judge the fourth report.
 *
 * `actorEmail` sits next to `actorUserId` because the log has to outlive the
 * people in it: an ADMIN_EMAILS founder may have no account at all, and an
 * actor who does may later delete theirs (the FK is SET NULL so this log can
 * never be the reason somebody cannot leave).
 */
export const userLocks = pgTable(
  'user_locks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'lock' | 'unlock'. Constrained in SQL; see 0058. */
    action: text('action').notNull(),
    reason: text('reason').notNull(),
    actorUserId: text('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorEmail: text('actor_email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('user_locks_user_id_created_at_idx').on(
      table.userId,
      table.createdAt.desc()
    ),
  ]
);

export const verification = pgTable('verification_tokens', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// =============================================================================
// Consent Receipts
// =============================================================================
// Phase 3 consent infrastructure. Each receipt records a user's consent to a
// specific document ('terms' | 'privacy') and optionally a module ('articles',
// 'social', etc.). module=null represents top-level terms acceptance (signup).
//
// Lookup pattern: find receipt by (user_id, document, module, major_version).
// If found, consent is current — skip prompt. If not, show gate or notice
// (determined by policy.json consent.type, NOT stored on the receipt).
//
// Receipts are auto-purged annually (cron job, not yet implemented). This
// serves dual purpose: expunging stored IP addresses and triggering annual
// re-consent.

export const consentReceipts = pgTable(
  'consent_receipts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    // No FK to users: consent receipts are a compliance_record and must
    // outlive the account (proof consent existed). A cascade FK would delete
    // them with the user. Kept as a bare id, like deletion_logs.user_id.
    userId: text('user_id').notNull(),
    // 'terms' | 'privacy'
    document: text('document').notNull(),
    // Module ID (e.g. 'articles', 'social') or null for top-level acceptance
    module: text('module'),
    // Full semver string as recorded at time of consent (e.g. '0.1')
    version: text('version').notNull(),
    // Extracted major version for efficient lookup — only major bumps
    // re-trigger consent
    majorVersion: integer('major_version').notNull(),
    ip: text('ip'),
    gpcDetected: boolean('gpc_detected').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    userIdIdx: index('consent_receipts_user_id_idx').on(table.userId),
    lookupIdx: index('consent_receipts_lookup_idx').on(
      table.userId,
      table.document,
      table.module,
      table.majorVersion
    ),
  })
);

// =============================================================================
// Notifications
// =============================================================================

export const notifications = pgTable(
  'notifications',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    type: notificationActivityType('type').notNull(),
    // actor/target/object are polymorphic — target can be a user, article,
    // event, etc., so no FK constraints. Denormalized actor_* and object_*
    // columns below carry display data so stale references don't break the UI.
    actor: text('actor').notNull(),
    target: text('target').notNull(),
    object: text('object'),
    context: notificationContext('context').notNull(),
    actorScreenname: text('actor_screenname'),
    actorName: text('actor_name'),
    objectType: notificationObjectType('object_type'),
    objectTitle: text('object_title'),
    objectUrl: text('object_url'),
    message: text('message'),
    read: boolean('read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    emailSent: boolean('email_sent').notNull().default(false),
    emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
    emailPreferenceKey: text('email_preference_key'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => ({
    targetReadCreatedIdx: index('notifications_target_read_created_idx').on(
      table.target,
      table.read,
      table.createdAt
    ),
    targetContextCreatedIdx: index(
      'notifications_target_context_created_idx'
    ).on(table.target, table.context, table.createdAt),
    expiresAtIdx: index('notifications_expires_at_idx').on(table.expiresAt),
  })
);

// =============================================================================
// Profiles
// =============================================================================

export const profiles = pgTable(
  'profiles',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    // Nullable: profiles can be unclaimed (created before a user attaches via
    // auto-claim) or tombstoned (userId nulled on account deletion to keep the
    // profile for attribution while severing the cascade FK). Postgres treats
    // NULLs as distinct, so the unique constraint still allows many such rows.
    //
    // This is the human's OWN identity profile, and stays 1:1 — it is not the
    // general "who can edit this listing" link. Directory listings created
    // through /form/get-listed leave this NULL permanently and are
    // administered through profileOwners instead, which is what allows one
    // person to run several of them. See drizzle/0035_profile_owners.sql.
    userId: text('user_id')
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The handle, in a namespace shared flat with users.screenname: /p/:handle
    // and acct:handle@domain resolve humans and businesses through the same
    // path, so the two can never hold the same name at once. Uniqueness here is
    // case-insensitive (profiles_screenname_lower_unique); the cross-table
    // check against users + screenname_history lives in lib/screenname.ts.
    //
    // Nullable because a listing has no handle until somebody claims it and
    // picks one. This is what lets a business have a federated actor without
    // being attached to a user — see drizzle/0036_profile_screenname.sql.
    screenname: text('screenname'),
    email: text('email').notNull().unique(),
    /**
     * A personal address that asked to be given this listing, before any
     * account existed to give it to.
     *
     * The public intake form lets a submitter optionally name their own inbox
     * alongside the business one. There is nothing to attach it to at that
     * moment — intake is unauthenticated and the person may have no account —
     * so the intent is parked here. When that address next signs in, the
     * listing is *offered* to them, and a profile_owners row is written only
     * if they confirm it is theirs (lib/server/pending-listing-owner.ts).
     *
     * An offer rather than an automatic grant because this value comes from a
     * public form and is therefore attacker-controlled: anyone can submit a
     * listing naming someone else. Granting silently would hand a stranger's
     * business to whoever was named.
     *
     * Deliberately NOT inside `status`, which carries the rest of the intake
     * record. This is looked up *by value* ("which listings are waiting for
     * this address?") every time the account menu loads, which wants a real
     * index, and it is cleared once answered — a one-line SET here versus a
     * read-modify-write on the JSONB that would race the admin
     * approve/decline path, which rewrites `status` wholesale.
     *
     * Not unique: two people may legitimately name the same personal address
     * on two different listings, and failing the second submission over that
     * would be worse than offering both.
     *
     * Holding this is not proof of anything. It records a request; the magic
     * link and the explicit answer prove control of the inbox, and admin
     * review is what covers whether the business is actually theirs.
     */
    pendingOwnerEmail: text('pending_owner_email'),
    name: text('name').notNull(),
    phoneNumber: text('phone_number'),
    pronouns: text('pronouns'),
    primaryImageId: text('primary_image_id'),
    primaryImageCdn: text('primary_image_cdn'),
    addressName: text('address_name'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    addressLine3: text('address_line3'),
    addressLocality: text('address_locality'),
    addressRegion: text('address_region'),
    addressPostalCode: text('address_postal_code'),
    addressCountry: text('address_country'),
    addressLat: numeric('address_lat', { precision: 10, scale: 7 }),
    addressLng: numeric('address_lng', { precision: 10, scale: 7 }),
    addressGooglePlaceId: text('address_google_place_id'),
    addressHours: text('address_hours'),
    active: boolean('active').notNull().default(false),
    /**
     * When Pana Mia certified this listing, or NULL if it has not been.
     *
     * A timestamp rather than a boolean because the interesting questions are
     * "since when?" and "certify the ones granted before X" — a boolean throws
     * that away and cannot answer either. Set by Pana Mia staff only; nothing
     * in the member-facing app writes this.
     */
    panaCertifiedAt: timestamp('pana_certified_at', { withTimezone: true }),
    /**
     * This business has nowhere to visit — it operates online.
     *
     * Suppresses distance and directions on the public profile. A flag rather
     * than an inference from a missing address, because an absent address
     * already means something else: a storefront mid-onboarding, or one whose
     * address failed to geocode. Those should still read as physical and
     * should start showing distance once the address lands. Set by the owner;
     * see drizzle/0038_profile_online_only.sql.
     */
    onlineOnly: boolean('online_only').notNull().default(false),
    /*
     * Not mapped here on purpose: profiles.search_vector.
     *
     * Migration 0040 adds a GENERATED ALWAYS tsvector column that backs the
     * directory term search. It is deliberately absent from this schema so
     * Drizzle never selects it — the vector is large, useless to the
     * application, and would ride along on every profile read. lib/server/
     * directory.ts queries it through raw SQL instead.
     */
    locallyBased: text('locally_based'),
    membershipLevel: membershipLevel('membership_level')
      .notNull()
      .default('free'),
    // Default Creative Commons license applied when this user composes new
    // Articles (/a) and social timeline posts (/s). Overridable per item.
    defaultCcLicense: ccLicense('default_cc_license')
      .notNull()
      .default('cc-by-4'),
    descriptions: jsonb('descriptions'),
    socials: jsonb('socials'),
    galleryImages: jsonb('gallery_images'),
    categories: jsonb('categories'),
    counties: jsonb('counties'),
    locations: jsonb('locations'),
    geo: jsonb('geo'),
    mentoring: jsonb('mentoring'),
    availability: jsonb('availability'),
    verification: jsonb('verification'),
    roles: jsonb('roles'),
    gentedepana: jsonb('gentedepana'),
    // Connectors programme membership for the human behind this profile.
    // Written only by /api/connectors/join, read by /connectors/hq. NULL means
    // "not a connector", which is the honest answer for almost every row.
    // See drizzle/0055_profile_connector.sql for why this is a blob and not
    // its own table.
    connector: jsonb('connector'),
    status: jsonb('status'),
    administrative: jsonb('administrative'),
    linkedProfiles: jsonb('linked_profiles'),
    whatsappCommunity: boolean('whatsapp_community').notNull().default(false),
    affiliate: text('affiliate'),
    socialEligible: boolean('social_eligible').notNull().default(true),
    socialEligibleAt: timestamp('social_eligible_at', { withTimezone: true }),
    socialIneligibleReason: text('social_ineligible_reason'),
    // Residence — platform eligibility & volunteer coordination
    // neighborhoods: jsonb array of predefined South Florida neighborhood keys
    // (e.g. ["wynwood", "brickell", "las-olas"]). Users may belong to multiple.
    // Future enhancement: point-and-click map picker.
    neighborhoods: jsonb('neighborhoods'),
    // verifiedZipCode: billing zip from GoHighLevel — NOT user-provided.
    // Used to verify South Florida residency for platform eligibility.
    verifiedZipCode: text('verified_zip_code'),
    // GHL (GoHighLevel CRM)
    ghlContactId: text('ghl_contact_id'),
    ghlOptedOut: boolean('ghl_opted_out').notNull().default(false),
    // Stripe
    stripeCustomerId: text('stripe_customer_id'),
    // Nostr identity — hex secp256k1 x-only pubkey (64 chars), unique across
    // all profiles. Nullable: keys are issued/BYO opt-in via the /r flow.
    nostrPubkey: text('nostr_pubkey').unique(),
    nostrPubkeySource: nostrPubkeySource('nostr_pubkey_source'),
  },
  (table) => ({
    activeIdx: index('profiles_active_idx').on(table.active),
    nostrPubkeyIdx: index('profiles_nostr_pubkey_idx').on(table.nostrPubkey),
    // Partial in the migration (WHERE pending_owner_email IS NOT NULL) — the
    // column is null on virtually every row, and this is read every time the
    // account menu loads. Drizzle has no partial-index builder, so the
    // declaration here is the plain form; drizzle/0053 is authoritative.
    pendingOwnerEmailIdx: index('profiles_pending_owner_email_idx').on(
      table.pendingOwnerEmail
    ),
  })
);

// =============================================================================
// Profile owners
// =============================================================================

/**
 * Who is allowed to administer a profile.
 *
 * Separate from profiles.userId, which answers a different question ("whose
 * identity is this?") and remains 1:1. This table answers "who runs this?" and
 * is many-to-many, so one person can run several businesses and a business can
 * have co-owners without sharing a password.
 *
 * Every profile with a userId was backfilled with an 'owner' row, so permission
 * checks can read this table alone rather than branching on which link exists.
 * A business listing is "unclaimed" precisely when it has no rows here.
 */
export const profileOwners = pgTable(
  'profile_owners',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: profileOwnerRole('role').notNull().default('owner'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    profileUserUnique: uniqueIndex('profile_owners_profile_user_unique').on(
      table.profileId,
      table.userId
    ),
    userIdx: index('profile_owners_user_idx').on(table.userId),
    profileIdx: index('profile_owners_profile_idx').on(table.profileId),
  })
);

// =============================================================================
// Profile signals (directory saves and recommendations)
// =============================================================================

/**
 * A pana's saves and recommendations of directory listings.
 *
 * Keyed to userId, not profileId, because this belongs to the *person*, not to
 * whichever profile they are currently acting as. Someone who claims a business
 * on Monday should still have the saves they made on Sunday, and switching hats
 * must not silently re-attribute their recommendations to a business.
 *
 * That choice also makes the product rule enforceable: only a human acting as
 * themselves may save or recommend. A business cannot recommend anyone, because
 * a business is never the subject here — see lib/server/profile-signals.ts.
 */
export const profileSignals = pgTable(
  'profile_signals',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: profileSignalKind('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    // One save and one recommend per person per listing. Saving twice is the
    // same as saving once, so the toggle endpoints can be safely retried.
    profileUserKindUnique: uniqueIndex('profile_signals_profile_user_kind').on(
      table.profileId,
      table.userId,
      table.kind
    ),
    // "How many panas saved this?" — the counts on the profile page.
    profileKindIdx: index('profile_signals_profile_kind_idx').on(
      table.profileId,
      table.kind
    ),
    // "What have I saved?" — the member's own saved-listings view.
    userKindIdx: index('profile_signals_user_kind_idx').on(
      table.userId,
      table.kind
    ),
  })
);

// =============================================================================
// Recommendation lists
// =============================================================================

/**
 * A named, ordered list of directory listings a pana vouches for.
 *
 * The directory can already tell you a cafe exists. It cannot tell you that
 * someone you trust orders the same thing there every Tuesday. That sentence —
 * stored on the *item*, not here — is the feature; this table is the frame
 * around it ("Cafecito crawl", and why those five places belong together).
 *
 * ## Why ownerUserId and not a profile
 *
 * Same reasoning as profile_signals, and deliberately the same key. A list is
 * a recommendation with a frame around it, so it belongs to the *person*, not
 * to whichever profile they happen to be acting as. Keying it to a profile
 * would mean a pana who claims a business on Monday finds Sunday's lists
 * re-attributed to the business, and it would let a business vouch for other
 * businesses — which profile_signals already forbids, in its own words:
 * "A business cannot recommend anyone."
 *
 * The seam this creates, and it is a real one: ActivityPub actors hang off
 * profiles (social_actors.profile_id), not users. `attributedTo` therefore
 * resolves through the owner's own profile's actor, not through this column.
 * See lib/federation/wrappers/recommendation-list.ts.
 *
 * @see docs/FEATURES.md — Lists
 * @see docs/SOCIAL-ROADMAP.md Phase 3.5, which removed the previous lists
 *      feature so that this one could be built on the social layer instead of
 *      beside it.
 */
export const recommendationLists = pgTable(
  'recommendation_lists',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // The framing: why these places belong on one list. Nullable because a
    // title alone is often enough and an empty string is not a better answer.
    blurb: text('blurb'),
    /**
     * Stable path segment, unique per owner.
     *
     * Separate from the id because this appears in the ActivityPub `id` URI,
     * which remote servers store permanently. Renaming a list must not mint a
     * new federated identity, so the slug is assigned once from the first
     * title and never rewritten — the same rule actor usernames follow, and
     * for the same reason.
     */
    slug: text('slug').notNull(),
    visibility: recommendationListVisibility('visibility')
      .notNull()
      .default('private'),
    /**
     * The ActivityPub `id`. Null until the list is first made non-private.
     *
     * Minted after insert (the URI contains the slug and the owner's handle),
     * matching how social_statuses fills `uri` in a second write — see
     * lib/federation/wrappers/status.ts.
     */
    uri: text('uri').unique(),
    // Maintained transactionally by the item writes, so the profile page can
    // render "5 places" without a per-list COUNT.
    itemCount: integer('item_count').notNull().default(0),
    // First time this list became publicly visible. A timestamp rather than a
    // boolean for the same reason profiles.pana_certified_at is one: "since
    // when" is the question that actually gets asked, and it doubles as the
    // AS2 `published` value, which must not move when the list is edited.
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => ({
    // "Show me my lists" and "show me this pana's public lists" are the same
    // query with a different visibility filter.
    ownerVisibilityIdx: index('recommendation_lists_owner_visibility_idx').on(
      table.ownerUserId,
      table.visibility
    ),
    ownerSlugUnique: uniqueIndex('recommendation_lists_owner_slug_unique').on(
      table.ownerUserId,
      table.slug
    ),
  })
);

/**
 * One entry on a list: a business, the owner's note about it, and where it
 * sits in the running order.
 *
 * ## Why profileId is nullable
 *
 * Because the alternatives both corrupt something. `cascade` would let a
 * business deleting its listing silently rewrite a stranger's list — the
 * second stop on "Cafecito crawl" disappears and the author's numbered
 * narrative now says something they never wrote. `restrict` is worse in the
 * other direction: a business could never leave the directory because someone
 * else recommended it, which hands a veto over one account's deletion to an
 * unrelated account.
 *
 * So the target is nulled and the row is kept. `note` and `position` survive
 * untouched, `profileNameAtAdd` supplies a label, and the entry renders as an
 * honest tombstone — the list still reads as the sequence its author wrote,
 * with one stop marked as no longer listed. The author's words are the thing
 * being protected here; the pointer is not.
 */
export const recommendationListItems = pgTable(
  'recommendation_list_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    listId: text('list_id')
      .notNull()
      .references(() => recommendationLists.id, { onDelete: 'cascade' }),
    // Null once the listing is gone. See the docblock above.
    profileId: text('profile_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    // Snapshot taken at add time so a tombstoned entry still has a name to
    // show. Deliberately not kept in sync with the profile: it is the label
    // the author saw when they wrote the note, which is what makes the note
    // make sense.
    profileNameAtAdd: text('profile_name_at_add').notNull(),
    // The point of the entire feature.
    note: text('note').notNull(),
    /**
     * Running order, contiguous from 0, rewritten as a block on reorder.
     *
     * Integer rather than a fractional / lexorank scheme because these lists
     * are a handful of places, not a document outline. At that size rewriting
     * every position inside one transaction is cheap and trivially auditable,
     * while fractional ranks buy an O(1) insert at the cost of precision
     * exhaustion and a rebalancing path that would be exercised approximately
     * never and therefore be wrong when it finally ran.
     *
     * Not unique: a swap would transiently collide and a deferrable constraint
     * is a heavier tool than this needs. Reads order by (position, createdAt)
     * so a duplicate — which should not happen — degrades to a stable order
     * rather than an arbitrary one.
     */
    position: integer('position').notNull(),
  },
  (table) => ({
    // The same business twice on one list is a mistake; the same business on
    // two different lists is the feature working.
    listProfileUnique: uniqueIndex(
      'recommendation_list_items_list_profile_unique'
    ).on(table.listId, table.profileId),
    listPositionIdx: index('recommendation_list_items_list_position_idx').on(
      table.listId,
      table.position
    ),
    // "Which lists is this business on?" — the business's own profile page.
    profileIdIdx: index('recommendation_list_items_profile_id_idx').on(
      table.profileId
    ),
  })
);

// =============================================================================
// Articles
// =============================================================================

export const articles = pgTable(
  'articles',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    excerpt: text('excerpt'),
    coverImage: text('cover_image'),
    coverImageAlt: text('cover_image_alt'),
    articleType: articleType('article_type').notNull(),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    authorId: text('author_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    coAuthors: jsonb('co_authors')
      .notNull()
      .default(sql`'[]'::jsonb`),
    reviewedBy: jsonb('reviewed_by'),
    inReplyTo: text('in_reply_to').references((): AnyPgColumn => articles.id, {
      onDelete: 'set null',
    }),
    status: articleStatus('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: text('deleted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    deletionReason: text('deletion_reason'),
    readingTime: integer('reading_time').notNull().default(1),
    mastodonPostUrl: text('mastodon_post_url'),
    ccLicense: ccLicense('cc_license').notNull().default('cc-by-4'),
    // Set only when the home relay accepted the NIP-23 kind-30023 mirror.
    nostrEventId: text('nostr_event_id'),
  },
  (table) => ({
    statusPublishedIdx: index('articles_status_published_idx').on(
      table.status,
      table.publishedAt
    ),
    authorStatusIdx: index('articles_author_status_idx').on(
      table.authorId,
      table.status
    ),
    inReplyToIdx: index('articles_in_reply_to_idx').on(table.inReplyTo),
    // GIN index for "user X is a co-author" containment queries
    // (co_authors @> '[{"userId":"X"}]'). See migration 0029.
    coAuthorsIdx: index('articles_co_authors_gin_idx').using(
      'gin',
      sql`${table.coAuthors} jsonb_path_ops`
    ),
  })
);

// =============================================================================
// Form Submissions
// =============================================================================

export const contactSubmissions = pgTable(
  'contact_submissions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    name: text('name').notNull(),
    email: text('email').notNull(),
    message: text('message'),
    // What the submission is about, chosen by the sender on /form/contact-us.
    category: contactSubmissionCategory('category')
      .notNull()
      .default('general'),
    // Set only when the form was submitted while signed in. Both are derived
    // server-side from the session, never from the request body. `screenname`
    // is a snapshot: it outlives account deletion and later renames so the
    // admin queue keeps showing who the thread was with.
    userId: text('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    screenname: text('screenname'),
    // Moderation state, mirroring relay_reports: see /admin/contactus.
    status: contactSubmissionStatus('status').notNull().default('open'),
    moderationReason: text('moderation_reason'),
    lastModerationActionAt: timestamp('last_moderation_action_at', {
      withTimezone: true,
    }),
  },
  (table) => ({
    emailIdx: index('contact_submissions_email_idx').on(table.email),
    createdAtIdx: index('contact_submissions_created_at_idx').on(
      table.createdAt
    ),
    statusIdx: index('contact_submissions_status_idx').on(table.status),
    categoryIdx: index('contact_submissions_category_idx').on(table.category),
    userIdIdx: index('contact_submissions_user_id_idx').on(table.userId),
  })
);

export const newsletterSignups = pgTable(
  'newsletter_signups',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    email: text('email').notNull().unique(),
    name: text('name'),
    signupType: text('signup_type'),
    acknowledged: boolean('acknowledged').notNull().default(false),
  },
  (table) => ({
    createdAtIdx: index('newsletter_signups_created_at_idx').on(
      table.createdAt
    ),
  })
);

// =============================================================================
// Email & OAuth Verification
// =============================================================================

export const emailMigrations = pgTable(
  'email_migrations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    oldEmail: text('old_email').notNull(),
    newEmail: text('new_email').notNull(),
    migrationToken: text('migration_token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    userIdIdx: index('email_migrations_user_id_idx').on(table.userId),
    newEmailIdx: index('email_migrations_new_email_idx').on(table.newEmail),
    expiresAtIdx: index('email_migrations_expires_at_idx').on(table.expiresAt),
  })
);

export const oAuthVerifications = pgTable(
  'oauth_verifications',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    email: text('email').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    verificationToken: text('verification_token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    oauthProfile: jsonb('oauth_profile').notNull(),
  },
  (table) => ({
    emailIdx: index('oauth_verifications_email_idx').on(table.email),
    providerAccountIdx: index('oauth_verifications_provider_account_idx').on(
      table.provider,
      table.providerAccountId
    ),
    expiresAtIdx: index('oauth_verifications_expires_at_idx').on(
      table.expiresAt
    ),
  })
);

// =============================================================================
// Analytics & Interactions
// =============================================================================

export const interactions = pgTable(
  'interactions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    email: text('email').notNull(),
    // userId is the preferred join key going forward (email can change).
    // Nullable during transition — backfill from email then make notNull.
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    action: text('action'),
    affiliate: text('affiliate'),
    points: integer('points'),
    metadata: jsonb('metadata'),
  },
  (table) => ({
    emailIdx: index('interactions_email_idx').on(table.email),
    userIdIdx: index('interactions_user_id_idx').on(table.userId),
    createdAtIdx: index('interactions_created_at_idx').on(table.createdAt),
    actionIdx: index('interactions_action_idx').on(table.action),
  })
);

// =============================================================================
// Mentoring
// =============================================================================

export const mentorSessions = pgTable(
  'mentor_sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    mentorEmail: text('mentor_email').notNull(),
    menteeEmail: text('mentee_email').notNull(),
    mentorUserId: text('mentor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    menteeUserId: text('mentee_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    sessionId: text('session_id').notNull().unique(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    duration: integer('duration').notNull().default(60),
    topic: text('topic').notNull(),
    sessionType: sessionType('session_type').notNull(),
    status: sessionStatus('status').notNull().default('pending'),
    notes: text('notes'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: text('cancelled_by'),
    cancelReason: text('cancel_reason'),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    declinedBy: text('declined_by'),
    declineReason: text('decline_reason'),
  },
  (table) => ({
    mentorEmailScheduledIdx: index(
      'mentor_sessions_mentor_email_scheduled_idx'
    ).on(table.mentorEmail, table.scheduledAt),
    menteeEmailScheduledIdx: index(
      'mentor_sessions_mentee_email_scheduled_idx'
    ).on(table.menteeEmail, table.scheduledAt),
    mentorUserIdIdx: index('mentor_sessions_mentor_user_id_idx').on(
      table.mentorUserId
    ),
    menteeUserIdIdx: index('mentor_sessions_mentee_user_id_idx').on(
      table.menteeUserId
    ),
    statusIdx: index('mentor_sessions_status_idx').on(table.status),
    scheduledAtIdx: index('mentor_sessions_scheduled_at_idx').on(
      table.scheduledAt
    ),
  })
);

// =============================================================================
// Intake Forms
// =============================================================================

export const intakeForms = pgTable(
  'intake_forms',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    email: text('email').notNull().unique(),
    formType: intakeFormType('form_type').notNull(),
    name: text('name'),
    complete: boolean('complete').notNull().default(false),
    formData: jsonb('form_data').notNull(),
  },
  (table) => ({
    formTypeIdx: index('intake_forms_form_type_idx').on(table.formType),
    completeIdx: index('intake_forms_complete_idx').on(table.complete),
  })
);

// =============================================================================
// Social / ActivityPub Federation
// =============================================================================

export const socialActors = pgTable(
  'social_actors',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    username: text('username').notNull(),
    domain: text('domain').notNull(),
    /**
     * The ActivityPub actor type -- 'Person', 'Group', 'Service', and so on.
     *
     * Text rather than a pgEnum because this table also holds remote actors,
     * and a remote server may legitimately serve a type this codebase has
     * never heard of. An enum would reject the row at insert and drop the
     * actor entirely, which is a worse outcome than storing a string we do not
     * recognise.
     *
     * The default is 'Person' because that is the literal
     * app/api/federation/actor/[user]/route.ts served before groups existed,
     * so every row that predates this column keeps the exact behaviour it
     * already had.
     */
    type: text('type').notNull().default('Person'),
    profileId: text('profile_id')
      .unique()
      .references(() => profiles.id, { onDelete: 'set null' }),
    uri: text('uri').notNull().unique(),
    inboxUrl: text('inbox_url').notNull(),
    outboxUrl: text('outbox_url').notNull(),
    followersUrl: text('followers_url').notNull(),
    followingUrl: text('following_url').notNull(),
    sharedInboxUrl: text('shared_inbox_url'),
    publicKey: text('public_key').notNull(),
    privateKey: text('private_key'),
    name: text('name'),
    summary: text('summary'),
    iconUrl: text('icon_url'),
    headerUrl: text('header_url'),
    followingCount: integer('following_count').notNull().default(0),
    followersCount: integer('followers_count').notNull().default(0),
    statusCount: integer('status_count').notNull().default(0),
    manuallyApprovesFollowers: boolean('manually_approves_followers')
      .notNull()
      .default(false),
    dmPolicy: socialDmPolicy('dm_policy').notNull().default('everyone'),
  },
  (table) => ({
    usernamedomainUnique: uniqueIndex(
      'social_actors_username_domain_unique'
    ).on(table.username, table.domain),
    domainIdx: index('social_actors_domain_idx').on(table.domain),
  })
);

/**
 * Every column on social_actors that is safe to serialize to a client.
 *
 * This table holds `privateKey`, the key a local actor signs its
 * ActivityPub activities with. Leaking it lets anyone forge posts,
 * follows and deletes as that actor, and remote servers will verify the
 * signatures as genuine, so it must never reach an HTTP response.
 *
 * Relational queries that join the actor onto something public --
 * statuses, timelines, follow lists -- must pass this as `columns`.
 * A bare `with: { actor: true }` selects every column and will hand the
 * signing key to whoever asked.
 *
 * This is an allowlist rather than `{ privateKey: false }` on purpose.
 * Adding a column here is a step someone can forget either way, but
 * forgetting an allowlist entry drops a field from an API response,
 * which is a visible bug. Forgetting to exclude from a denylist
 * publishes a new secret, which is silent. Prefer the loud failure.
 */
export const PUBLIC_ACTOR_COLUMNS = {
  id: true,
  createdAt: true,
  updatedAt: true,
  username: true,
  domain: true,
  type: true,
  profileId: true,
  uri: true,
  inboxUrl: true,
  outboxUrl: true,
  followersUrl: true,
  followingUrl: true,
  sharedInboxUrl: true,
  publicKey: true,
  name: true,
  summary: true,
  iconUrl: true,
  headerUrl: true,
  followingCount: true,
  followersCount: true,
  statusCount: true,
  manuallyApprovesFollowers: true,
  // `dmPolicy` is deliberately absent.
  //
  // Publishing it would let anyone read a preference off a profile, and worse,
  // it makes blocks inferable: a blocked sender sees a policy of `everyone`,
  // is refused anyway, and has their answer. The refusal strings are uniform
  // precisely to stop that inference, and a public policy column would hand it
  // back.
  //
  // The UI need it answers -- "should I show a message button" -- is better
  // served by a viewer-specific boolean computed server side, because that
  // answer already accounts for blocks and so leaks nothing.
} as const;

/**
 * The `type` value that marks a status as a story rather than a post.
 *
 * Stories share `social_statuses` with ordinary notes -- they needed expiry
 * and attachments, and both were already built and proven here. The price of
 * that reuse is that `type` is now load-bearing for visibility: every read
 * path that means "posts" has to exclude this value, or a story surfaces as a
 * permanent post in the feed it was never meant to reach.
 *
 * It is a constant rather than a literal so the exclusions and the writer
 * cannot drift apart by a typo. `'story'` and `'Story'` would both look
 * plausible in review; only one of them hides anything.
 *
 * @see excludeStories() in lib/federation/wrappers/timeline.ts
 */
export const STATUS_TYPE_STORY = 'Story';

export const socialStatuses = pgTable(
  'social_statuses',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    uri: text('uri').notNull().unique(),
    actorId: text('actor_id')
      .notNull()
      .references(() => socialActors.id, { onDelete: 'cascade' }),
    articleId: text('article_id').references(() => articles.id, {
      onDelete: 'cascade',
    }),
    type: text('type').notNull().default('Note'),
    content: text('content'),
    contentWarning: text('content_warning'),
    url: text('url'),
    inReplyToUri: text('in_reply_to_uri'),
    inReplyToId: text('in_reply_to_id').references(
      (): AnyPgColumn => socialStatuses.id,
      {
        onDelete: 'set null',
      }
    ),
    recipientTo: jsonb('recipient_to')
      .notNull()
      .default(sql`'[]'::jsonb`),
    recipientCc: jsonb('recipient_cc')
      .notNull()
      .default(sql`'[]'::jsonb`),
    published: timestamp('published', { withTimezone: true }),
    isDraft: boolean('is_draft').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    location: jsonb('location'),
    repliesCount: integer('replies_count').notNull().default(0),
    likesCount: integer('likes_count').notNull().default(0),
    announcesCount: integer('announces_count').notNull().default(0),
    eventId: text('event_id').references((): AnyPgColumn => events.id, {
      onDelete: 'set null',
    }),
    /**
     * The group this status was posted into, or NULL for an ordinary
     * personal post.
     *
     * This column is an authorization input, not decoration. A status in a
     * private group is readable only by that group's members, so every path
     * that reads social_statuses has to account for it — see
     * `lib/federation/wrappers/group-visibility.ts`, which exists so no call
     * site has to spell the rule itself.
     */
    groupId: text('group_id').references((): AnyPgColumn => socialGroups.id, {
      onDelete: 'cascade',
    }),
    ccLicense: ccLicense('cc_license').notNull().default('cc-by-4'),
  },
  (table) => ({
    actorPublishedIdx: index('social_statuses_actor_published_idx').on(
      table.actorId,
      table.published
    ),
    articleIdIdx: index('social_statuses_article_id_idx').on(table.articleId),
    inReplyToUriIdx: index('social_statuses_in_reply_to_uri_idx').on(
      table.inReplyToUri
    ),
    inReplyToIdIdx: index('social_statuses_in_reply_to_id_idx').on(
      table.inReplyToId
    ),
    eventIdIdx: index('social_statuses_event_id_idx').on(table.eventId),
    groupPublishedIdx: index('social_statuses_group_published_idx').on(
      table.groupId,
      table.published
    ),
  })
);

export const articleAnnouncements = pgTable(
  'article_announcements',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => socialActors.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    statusId: text('status_id')
      .unique()
      .references(() => socialStatuses.id, { onDelete: 'set null' }),
  },
  (table) => ({
    articleAuthorUnique: uniqueIndex(
      'article_announcements_article_author_unique'
    ).on(table.articleId, table.authorId),
    articleIdIdx: index('article_announcements_article_id_idx').on(
      table.articleId
    ),
    authorIdIdx: index('article_announcements_author_id_idx').on(
      table.authorId
    ),
  })
);

export const socialFollows = pgTable(
  'social_follows',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    actorId: text('actor_id')
      .notNull()
      .references(() => socialActors.id, { onDelete: 'cascade' }),
    targetActorId: text('target_actor_id')
      .notNull()
      .references(() => socialActors.id, { onDelete: 'cascade' }),
    uri: text('uri').unique(),
    status: socialFollowStatus('status').notNull().default('pending'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (table) => ({
    actorTargetUnique: uniqueIndex('social_follows_actor_target_unique').on(
      table.actorId,
      table.targetActorId
    ),
    actorIdIdx: index('social_follows_actor_id_idx').on(table.actorId),
    targetActorIdIdx: index('social_follows_target_actor_id_idx').on(
      table.targetActorId
    ),
    statusIdx: index('social_follows_status_idx').on(table.status),
  })
);

/**
 * Block and mute. One row per direction per kind.
 *
 * `block` is safety: it severs follows both ways, stops re-following, and
 * removes each actor from the other's view. `mute` is volume: it changes only
 * what the muting actor sees and leaves every follow intact. Neither is
 * announced to the other party.
 *
 * Enforcement is local only. ActivityPub has a `Block` activity but remote
 * servers may ignore it, and announcing a block leaks it to the blocked
 * instance, so we control what this server shows and delivers and say so in
 * the UI. See docs/SOCIAL-GRAPH.md section B.
 */
export const socialBlocks = pgTable(
  'social_blocks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    // The actor doing the blocking or muting.
    actorId: text('actor_id')
      .notNull()
      .references(() => socialActors.id, { onDelete: 'cascade' }),
    targetActorId: text('target_actor_id')
      .notNull()
      .references(() => socialActors.id, { onDelete: 'cascade' }),
    kind: socialBlockKind('kind').notNull(),
  },
  (table) => ({
    // Blocking somebody you have muted is a real sequence, so the pair is
    // unique per kind rather than per pair.
    actorTargetKindUnique: uniqueIndex(
      'social_blocks_actor_target_kind_unique'
    ).on(table.actorId, table.targetActorId, table.kind),
    // Reads go both ways: "who have I blocked" for my own feeds, and "who has
    // blocked me" for whether I may see them.
    actorIdIdx: index('social_blocks_actor_id_idx').on(table.actorId),
    targetActorIdIdx: index('social_blocks_target_actor_id_idx').on(
      table.targetActorId
    ),
  })
);

/**
 * A request to open a direct-message thread, and the consent that answers it.
 *
 * Exists because the DM gate has to ask "has this recipient agreed to
 * correspond with this sender" and there is no thread table to ask. Deriving
 * the answer from social_statuses would mean scanning direct statuses in both
 * directions, and it still could not represent the two states that matter
 * most: accepted-but-not-yet-replied-to, and deleted-without-replying.
 *
 * Deliberately not a threads table. Threading is a property of the mail UI and
 * can be derived from `in_reply_to_id` when that UI is built; this table holds
 * only the consent decision, which is the part the gate needs and the part
 * that must outlive any individual message. That matters because direct
 * statuses expire -- see DM_EXPIRY_DAYS -- so consent inferred from messages
 * would silently lapse and re-prompt a correspondent you had already accepted.
 *
 * Rows are keyed by recipient-then-sender because every read is "show me my
 * requests" or "may this sender write to me", both of which start from the
 * recipient.
 */
export const socialDmRequests = pgTable(
  'social_dm_requests',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    // The actor whose consent is at stake, and who sees the Requests folder.
    recipientActorId: text('recipient_actor_id')
      .notNull()
      .references(() => socialActors.id, { onDelete: 'cascade' }),
    // The actor asking to open the thread.
    senderActorId: text('sender_actor_id')
      .notNull()
      .references(() => socialActors.id, { onDelete: 'cascade' }),
    state: socialDmRequestState('state').notNull().default('pending'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (table) => ({
    // One decision per pair, in this direction. The mirrored pair is a
    // separate row on purpose: accepting someone's request is not the same as
    // them accepting yours, and collapsing the two would let one person's
    // acceptance open a thread the other never agreed to.
    recipientSenderUnique: uniqueIndex(
      'social_dm_requests_recipient_sender_unique'
    ).on(table.recipientActorId, table.senderActorId),
    // Reads go both ways: the Requests folder lists by recipient, and the gate
    // looks up a specific pair on every direct send.
    recipientActorIdIdx: index('social_dm_requests_recipient_actor_id_idx').on(
      table.recipientActorId
    ),
    senderActorIdIdx: index('social_dm_requests_sender_actor_id_idx').on(
      table.senderActorId
    ),
  })
);

export const socialLikes = pgTable(
  'social_likes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    actorId: text('actor_id')
      .notNull()
      .references(() => socialActors.id, { onDelete: 'cascade' }),
    statusId: text('status_id')
      .notNull()
      .references(() => socialStatuses.id, { onDelete: 'cascade' }),
    uri: text('uri').unique(),
  },
  (table) => ({
    actorStatusUnique: uniqueIndex('social_likes_actor_status_unique').on(
      table.actorId,
      table.statusId
    ),
    actorIdIdx: index('social_likes_actor_id_idx').on(table.actorId),
    statusIdIdx: index('social_likes_status_id_idx').on(table.statusId),
  })
);

/**
 * An interest group panas can join.
 *
 * A group is not a second kind of account bolted on beside actors -- it IS an
 * actor, with its own row in social_actors carrying type='Group', its own
 * handle in the flat screenname namespace, and its own signing keypair. That
 * is what lets a group be followed, mentioned and addressed by the federation
 * code that already exists, instead of needing a parallel delivery path.
 *
 * The group's display name, summary and avatar live on the actor, not here.
 * This table holds only what is true of a group and meaningless for a person.
 *
 * @see docs/GROUPS-ROADMAP.md
 */
export const socialGroups = pgTable('social_groups', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
  /**
   * The actor this group is. Unique because the relationship is one-to-one,
   * and cascading because an actor without its group row is an actor nothing
   * can describe.
   */
  actorId: text('actor_id')
    .notNull()
    .unique()
    .references(() => socialActors.id, { onDelete: 'cascade' }),
  /**
   * Who started it, kept for moderation history. Nullable and 'set null' so
   * deleting the founder's profile does not delete a group other people are
   * still using.
   */
  createdByProfileId: text('created_by_profile_id').references(
    () => profiles.id,
    { onDelete: 'set null' }
  ),
  /**
   * What the group is about, as a `{ topic: true }` flag map rather than an
   * array, so pana_jsonb_flags (migration 0040) can flatten it into a search
   * vector the same way it already does for profile categories. An array would
   * need its own indexing path for no gain.
   */
  topics: jsonb('topics')
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  /**
   * House rules, rendered in order on the group page. A JSONB array rather
   * than a flag map because order carries meaning here -- rules are numbered
   * when displayed -- and rules are prose, not facets, so they are never
   * searched or aggregated.
   */
  rules: jsonb('rules').$type<string[]>().notNull().default([]),
  visibility: socialGroupVisibility('visibility').notNull().default('public'),
  joinPolicy: socialGroupJoinPolicy('join_policy').notNull().default('open'),
  /**
   * Count of 'active' members, denormalised. The feed rail shows this next to
   * the Panas count on every render, and counting social_group_members rows
   * for that would put a query on the hottest path in the app.
   */
  memberCount: integer('member_count').notNull().default(0),
});

/**
 * Who is in a group, and in what capacity.
 *
 * Keyed on actorId rather than profileId on purpose. Membership has to be
 * answerable from an actor alone, because the hot question is "every group
 * this actor belongs to" and it is asked on every timeline fetch -- going
 * through profiles would mean a join on the one query that cannot afford one.
 * It also leaves the door open for a remote actor to join a group without
 * needing a local profile invented for them.
 */
export const socialGroupMembers = pgTable(
  'social_group_members',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    groupId: text('group_id')
      .notNull()
      .references(() => socialGroups.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => socialActors.id, { onDelete: 'cascade' }),
    role: socialGroupRole('role').notNull().default('member'),
    status: socialGroupMemberStatus('status').notNull().default('active'),
    /**
     * When the row became 'active'. Null while a join request is pending, so
     * "member since" never claims someone joined on the day they asked.
     */
    joinedAt: timestamp('joined_at', { withTimezone: true }),
  },
  (table) => ({
    groupActorUnique: uniqueIndex('social_group_members_group_actor_unique').on(
      table.groupId,
      table.actorId
    ),
    actorIdIdx: index('social_group_members_actor_id_idx').on(table.actorId),
    // Composite rather than group_id alone: it serves both "the roster" and
    // "the pending queue", which are the only two ways this is read per group.
    groupStatusIdx: index('social_group_members_group_status_idx').on(
      table.groupId,
      table.status
    ),
  })
);

export const socialAttachments = pgTable(
  'social_attachments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    statusId: text('status_id')
      .notNull()
      .references(() => socialStatuses.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    mediaType: text('media_type'),
    url: text('url').notNull(),
    previewUrl: text('preview_url'),
    remoteUrl: text('remote_url'),
    name: text('name'),
    description: text('description'),
    blurhash: text('blurhash'),
    width: integer('width'),
    height: integer('height'),
    peaks: jsonb('peaks'),
  },
  (table) => ({
    statusIdIdx: index('social_attachments_status_id_idx').on(table.statusId),
  })
);

/**
 * Who has seen which story.
 *
 * Powers two things: the ring on a pana's avatar is "solid" until the viewer
 * has seen everything currently active, and the owner gets a view count on
 * their own story.
 *
 * Only signed-in viewers holding a social actor are recorded. An anonymous
 * visitor can read a story -- the profile page is public -- but there is no
 * stable identity to attribute the view to, and manufacturing one from an IP
 * or a fingerprint to power a decoration would be tracking the privacy policy
 * does not cover. Anonymous reads are simply not counted.
 *
 * Rows die with the story via ON DELETE CASCADE, so purging expired stories
 * takes their view log with them and needs no second pass.
 */
export const socialStoryViews = pgTable(
  'social_story_views',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    statusId: text('status_id')
      .notNull()
      .references(() => socialStatuses.id, { onDelete: 'cascade' }),
    viewerActorId: text('viewer_actor_id')
      .notNull()
      .references(() => socialActors.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    statusViewerUnique: uniqueIndex(
      'social_story_views_status_viewer_unique'
    ).on(table.statusId, table.viewerActorId),
    viewerIdx: index('social_story_views_viewer_idx').on(table.viewerActorId),
  })
);

export const socialTags = pgTable(
  'social_tags',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    statusId: text('status_id')
      .notNull()
      .references(() => socialStatuses.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    name: text('name').notNull(),
    href: text('href'),
  },
  (table) => ({
    statusIdIdx: index('social_tags_status_id_idx').on(table.statusId),
    typeNameIdx: index('social_tags_type_name_idx').on(table.type, table.name),
  })
);

// =============================================================================
// Events
// =============================================================================

export const venues = pgTable(
  'venues',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    address: text('address').notNull(),
    city: text('city').notNull(),
    state: text('state').notNull(),
    country: text('country').notNull().default('US'),
    postalCode: text('postal_code'),
    lat: numeric('lat', { precision: 10, scale: 7 }),
    lng: numeric('lng', { precision: 10, scale: 7 }),
    capacity: integer('capacity'),
    fireCapacity: integer('fire_capacity').notNull(),
    parcelControlNumber: text('parcel_control_number'),
    parcelUnit: text('parcel_unit'),
    venueType: venueType('venue_type'),
    venueEnvironment: venueEnvironment('venue_environment'),
    venueUsage: venueUsage('venue_usage'),
    venueOwnership: venueOwnership('venue_ownership')
      .notNull()
      .default('unknown'),
    adaAccessibility: adaAccessibility('ada_accessibility')
      .notNull()
      .default('unknown'),
    parkingOptions: parkingOptions('parking_options').notNull().default('none'),
    parkingInstructions: text('parking_instructions'),
    hasLiquorLicense: boolean('has_liquor_license').notNull().default(false),
    houseRules: text('house_rules'),
    ownerContact: jsonb('owner_contact'),
    avInfrastructure: jsonb('av_infrastructure')
      .notNull()
      .default(sql`'[]'::jsonb`),
    safety: jsonb('safety'),
    buildingPlansUrl: text('building_plans_url'),
    supportingDocsUrls: jsonb('supporting_docs_urls')
      .notNull()
      .default(sql`'[]'::jsonb`),
    isFree: boolean('is_free').notNull().default(false),
    rentalModel: rentalModel('rental_model'),
    rentalPricing: jsonb('rental_pricing'),
    bookingInstructions: text('booking_instructions'),
    insuranceCoiUrl: text('insurance_coi_url'),
    insuranceCoiExpiresAt: timestamp('insurance_coi_expires_at', {
      withTimezone: true,
    }),
    insuranceNotes: text('insurance_notes'),
    operatorProfileId: text('operator_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    status: venueStatus('status').notNull().default('pending_review'),
    safetyContact: jsonb('safety_contact'),
    accessibilityNotes: text('accessibility_notes'),
    photos: jsonb('photos')
      .notNull()
      .default(sql`'[]'::jsonb`),
    website: text('website'),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedBy: text('suspended_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    suspensionReason: text('suspension_reason'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: text('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    operatorProfileIdIdx: index('venues_operator_profile_id_idx').on(
      table.operatorProfileId
    ),
    statusIdx: index('venues_status_idx').on(table.status),
    cityStateIdx: index('venues_city_state_idx').on(table.city, table.state),
    venueTypeIdx: index('venues_type_idx').on(table.venueType),
    venueIsFreeIdx: index('venues_is_free_idx').on(table.isFree),
  })
);

export const events = pgTable(
  'events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),
    coverImage: text('cover_image'),
    coverImageAlt: text('cover_image_alt'),
    /**
     * Exactly one of hostProfileId / hostGroupId is set, enforced by the
     * `events_single_host` CHECK in 0047. Nullable here because a group can
     * host: see the docblock on hostGroupId for why the group, and not the
     * pana who filled in the form, has to be the host.
     */
    hostProfileId: text('host_profile_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    /**
     * Set when a group hosts instead of a pana.
     *
     * Deliberately not "the group this event is attributed to" alongside a
     * profile host. Account deletion blocks while you host upcoming events and
     * deletes your completed ones, so hanging a group's events off the
     * founder's profile would kill the club's calendar the day they left.
     * Being the host outright is what keeps a group's events the group's.
     */
    hostGroupId: text('host_group_id').references(() => socialGroups.id, {
      onDelete: 'restrict',
    }),
    // Nullable: online-only events have no physical venue.
    venueId: text('venue_id').references(() => venues.id, {
      onDelete: 'restrict',
    }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    timezone: text('timezone').notNull().default('America/New_York'),
    status: eventStatus('status').notNull().default('draft'),
    visibility: eventVisibility('visibility').notNull().default('public'),
    mode: eventMode('mode').notNull().default('offline'),
    attendeeCap: integer('attendee_cap'),
    // Only verified, 'going' RSVPs count. Maintained transactionally by the
    // rsvp routes; the hard cap is min(attendeeCap, venue.fireCapacity).
    attendeeCount: integer('attendee_count').notNull().default(0),
    icalUid: text('ical_uid').notNull().unique(),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    // Set only when the home relay accepted the kind-31923 mirror.
    nostrEventId: text('nostr_event_id'),
    // ---------------------------------------------------------------------
    // Deferred (placeholder) — dropped in the Nostr event-model merge, see
    // docs/EVENTS-ROADMAP.md v2 backlog: age_restriction, photo_policy,
    // dresscode, panamia_co_organizer, tos_accepted_at, cancellation fields,
    // and Cloudflare live-streaming (stream_status, cf_stream_*). Reintroduce
    // as a follow-up migration when those features land.
    // ---------------------------------------------------------------------
  },
  (table) => ({
    hostProfileIdIdx: index('events_host_profile_id_idx').on(
      table.hostProfileId
    ),
    hostGroupIdIdx: index('events_host_group_id_idx').on(table.hostGroupId),
    venueIdIdx: index('events_venue_id_idx').on(table.venueId),
    statusVisibilityIdx: index('events_status_visibility_idx').on(
      table.status,
      table.visibility
    ),
    startsAtIdx: index('events_starts_at_idx').on(table.startsAt),
  })
);

// One row per (event, attendee). Attendees need NO Nostr key and NO account:
// anonymous RSVPs are name+email, verified via a magic link backed by the
// existing verification_tokens table. Logged-in users get profileId set and
// emailVerifiedAt stamped immediately (auth already verified their email).
export const eventAttendees = pgTable(
  'event_attendees',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    // Set for logged-in attendees; null for anonymous email RSVPs.
    profileId: text('profile_id').references(() => profiles.id, {
      onDelete: 'cascade',
    }),
    // Nullable: RSVPs that arrive from Nostr (kind 31925) have no email — they
    // are keyed by nostrPubkey instead. Web RSVPs always set email.
    email: text('email'),
    name: text('name').notNull(),
    status: rsvpStatus('status').notNull(),
    // Null until confirmed. Web: stamped on magic-link click (or immediately
    // for logged-in users). Nostr: stamped on ingest — the event signature IS
    // the verification. Only non-null + status 'going' counts toward capacity.
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    // Inbound two-way sync (phase 2). The signer pubkey of a kind-31925 RSVP
    // ingested from Nostr; identifies the attendee when there's no profile.
    nostrPubkey: text('nostr_pubkey'),
    // created_at of the last kind-31925 we applied — guards against applying a
    // stale RSVP when events arrive out of order (Nostr is replaceable, latest
    // wins). See app/api/internal/relay/rsvp.
    nostrRsvpAt: timestamp('nostr_rsvp_at', { withTimezone: true }),
    // The kind-31925 event id we last ingested (inbound), or — once RSVP→Nostr
    // outbound lands — the id we published. See docs/EVENTS-ROADMAP.md.
    nostrEventId: text('nostr_event_id'),
  },
  (table) => ({
    eventEmailUnique: uniqueIndex('event_attendees_event_email_unique').on(
      table.eventId,
      table.email
    ),
    eventProfileUnique: uniqueIndex('event_attendees_event_profile_unique').on(
      table.eventId,
      table.profileId
    ),
    eventNostrPubkeyUnique: uniqueIndex(
      'event_attendees_event_nostr_pubkey_unique'
    ).on(table.eventId, table.nostrPubkey),
    eventStatusIdx: index('event_attendees_event_status_idx').on(
      table.eventId,
      table.status
    ),
    profileIdIdx: index('event_attendees_profile_id_idx').on(table.profileId),
  })
);

/**
 * "Not for me", kept.
 *
 * The discovery page at `/e` does not just rank events, it states the reason
 * each one is in front of you, and a stated reason has to be arguable or it is
 * decoration. This is the argument back: one row per event a pana has told us
 * not to show them.
 *
 * It exists because the alternative is a lie. Dismissal held in component
 * state hides the card until the next navigation, while the banner underneath
 * it says "fewer from this host" — a claim about the future made by something
 * that forgets on reload. Either the control persists or the copy has to stop
 * promising, and the correction loop is the part of that page worth keeping.
 *
 * `reasonKind` is what the page claimed when the pana disagreed, not a
 * category of dislike. "Shown because your panas are going, and told no" is a
 * different signal from "shown because it matched your tags, and told no", and
 * only the first is evidence about the people rather than the subject. Storing
 * the claim keeps that distinction available to whatever learns from it later;
 * without it every dismissal collapses into an undifferentiated downvote.
 *
 * Profile-scoped rather than user-scoped, matching event_attendees: RSVPs and
 * corrections are both the acting pana's, and joining them later should not
 * need a hop through users.
 */
export const eventDismissals = pgTable(
  'event_dismissals',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /**
     * The lane the card was sitting in when it was dismissed, or null if it
     * was in the unreasoned tail. Free text rather than an enum because the
     * set of reasons is a product decision that will change faster than a
     * migration can follow, and an unrecognised historical value here is
     * perfectly readable — unlike an enum, which would reject the insert and
     * lose the correction entirely.
     */
    reasonKind: text('reason_kind'),
  },
  (table) => ({
    /* One row per pana per event: dismissing twice is the same statement said
       twice, and an undo that had to delete an unknown number of rows would be
       a race waiting to happen. */
    profileEventUnique: uniqueIndex('event_dismissals_profile_event_unique').on(
      table.profileId,
      table.eventId
    ),
    /* The read path is always "everything this pana has hidden", once per page
       render, so the index that matters is on the profile. */
    profileIdIdx: index('event_dismissals_profile_id_idx').on(table.profileId),
  })
);

// =============================================================================
// Screenname History
// =============================================================================

export const screennameHistory = pgTable(
  'screenname_history',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    screenname: text('screenname').notNull().unique(),
    // No FK to users: screenname history is a compliance_record kept for
    // federation 410-Gone continuity, so it must survive account deletion.
    // A cascade FK (the previous definition) silently wiped it on delete,
    // contradicting that intent. Kept as a bare id, like deletion_logs.user_id.
    userId: text('user_id').notNull(),
    redirectTo: text('redirect_to'),
  },
  (table) => ({
    userIdIdx: index('screenname_history_user_id_idx').on(table.userId),
  })
);

// =============================================================================
// Deletion Logs
// =============================================================================

export const deletionLogs = pgTable('deletion_logs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  userId: text('user_id').notNull(),
  email: text('email').notNull(),
  screenname: text('screenname'),
  attributionChoice: text('attribution_choice').notNull(), // 'keep' | 'anonymize'
  archivedContentIds: jsonb('archived_content_ids'), // IDs of content preserved post-archive
  deletedTables: jsonb('deleted_tables'), // map of table name → count of deleted rows
  thirdPartyResults: jsonb('third_party_results'), // map of service → success boolean
  ip: text('ip'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
});

// =============================================================================
// Community Connectors
// =============================================================================

/**
 * What a connector is doing, one row per commitment.
 *
 * These lived inside `profiles.connector` until 0056. They moved because the
 * admin console can now set a task for somebody, and the blob's safety rested
 * entirely on there being exactly one writer per row — the connector
 * themselves. See drizzle/0056_connector_commitments.sql for the whole
 * argument; the short version is that an admin and a member saving seconds
 * apart used to lose one of the two writes silently.
 *
 * A staff-set task and a self-made commitment are the same row. `assignedBy`
 * NULL means the connector wrote it; a value means somebody put it on their
 * board. Progress is the connector's to set either way.
 */
export const connectorCommitments = pgTable(
  'connector_commitments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    what: text('what').notNull(),
    /** Column is `when_text` because WHEN is reserved. Free text by design. */
    when: text('when_text'),
    house: text('house').notNull(),
    progress: text('progress').notNull().default('notSet'),
    /**
     * Rough size, in minutes. NULL means nobody has estimated it.
     *
     * Minutes rather than decimal hours so `SUM()` is exact and the pg driver
     * hands back a number instead of a string; the UI talks in hours and
     * converts at the edge. NULL is a reported state, never folded to zero —
     * see drizzle/0059 for why nothing was backfilled.
     */
    estimatedMinutes: integer('estimated_minutes'),
    /**
     * The public event this commitment staffs, if any.
     *
     * Nullable and `set null` rather than cascading: deleting an event must
     * not delete the record that somebody was asked to work it. See
     * drizzle/0061 for why this is two typed columns instead of one
     * polymorphic pair, and for the CHECK that stops both being set.
     */
    eventId: text('event_id').references(() => events.id, {
      onDelete: 'set null',
    }),
    /** The programme gathering this commitment staffs, if any. */
    connectorEventId: text('connector_event_id').references(
      () => connectorEvents.id,
      { onDelete: 'set null' }
    ),
    /** NULL for self-authored. Set when staff assigned it. */
    assignedBy: text('assigned_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
  },
  (table) => ({
    profileIdIdx: index('connector_commitments_profile_id_idx').on(
      table.profileId,
      table.createdAt
    ),
  })
);

/**
 * Gatherings run by the programme.
 *
 * Deliberately not rows in the public `events` table: that one requires a
 * unique slug, a unique iCal uid and exactly one host profile or group, has
 * no recurrence model, and hangs places off the `venues` table. A weekly pod
 * huddle at "Bryant Park, north side" would have to fabricate four of those
 * five. drizzle/0057_connector_events.sql has the full reasoning.
 *
 * `startsAt` is the next occurrence as a real instant so "upcoming" can be a
 * sort; `cadence` describes the repeat in words rather than expanding it into
 * rows. Rolling it forward is a human action from the console on purpose.
 */
export const connectorEvents = pgTable(
  'connector_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    title: text('title').notNull(),
    details: text('details'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    /**
     * The human phrasing — "Thursdays @ 5p", "4:40–8:30p". Kept alongside
     * `startsAt` rather than instead of it: that sorts, this is what you tell
     * somebody. NULL renders as just the date.
     */
    when: text('when_text'),
    /** Free text. No venue FK — see the table docblock. */
    location: text('location'),
    cadence: text('cadence').notNull().default('once'),
    /** NULL means no cap. */
    volunteersNeeded: integer('volunteers_needed'),
    /** NULL means programme-wide. Scoped by pod because pods are geographic. */
    pod: text('pod'),
    /** Who is running it. A name only — no phone, no email, no FK. */
    lead: text('lead'),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Soft cancel: people who were coming still need to find out it is off. */
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (table) => ({
    startsAtIdx: index('connector_events_starts_at_idx').on(table.startsAt),
  })
);

// =============================================================================
// Relations
// =============================================================================

export const connectorCommitmentsRelations = relations(
  connectorCommitments,
  ({ one }) => ({
    profile: one(profiles, {
      fields: [connectorCommitments.profileId],
      references: [profiles.id],
    }),
  })
);

export const usersRelations = relations(users, ({ one, many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
  notificationsSent: many(notifications, { relationName: 'notificationActor' }),
  notificationsReceived: many(notifications, {
    relationName: 'notificationTarget',
  }),
  articles: many(articles, { relationName: 'articleAuthor' }),
  articlesDeleted: many(articles, { relationName: 'articleDeletedBy' }),
  mentorSessions: many(mentorSessions, { relationName: 'mentorSessions' }),
  menteeSessions: many(mentorSessions, { relationName: 'menteeSessions' }),
  articleAnnouncements: many(articleAnnouncements),
  screennameHistory: many(screennameHistory),
  consentReceipts: many(consentReceipts),
  profilesOwned: many(profileOwners),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const consentReceiptsRelations = relations(
  consentReceipts,
  ({ one }) => ({
    user: one(users, {
      fields: [consentReceipts.userId],
      references: [users.id],
    }),
  })
);

export const verificationRelations = relations(verification, () => ({}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  actorUser: one(users, {
    fields: [notifications.actor],
    references: [users.id],
    relationName: 'notificationActor',
  }),
  targetUser: one(users, {
    fields: [notifications.target],
    references: [users.id],
    relationName: 'notificationTarget',
  }),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
  socialActor: one(socialActors, {
    fields: [profiles.id],
    references: [socialActors.profileId],
  }),
  owners: many(profileOwners),
  signals: many(profileSignals),
  recommendationListEntries: many(recommendationListItems),
  venuesOperated: many(venues),
  eventsHosted: many(events),
  eventAttendeeRows: many(eventAttendees),
}));

export const profileSignalsRelations = relations(profileSignals, ({ one }) => ({
  profile: one(profiles, {
    fields: [profileSignals.profileId],
    references: [profiles.id],
  }),
  user: one(users, {
    fields: [profileSignals.userId],
    references: [users.id],
  }),
}));

export const recommendationListsRelations = relations(
  recommendationLists,
  ({ one, many }) => ({
    owner: one(users, {
      fields: [recommendationLists.ownerUserId],
      references: [users.id],
    }),
    items: many(recommendationListItems),
  })
);

export const recommendationListItemsRelations = relations(
  recommendationListItems,
  ({ one }) => ({
    list: one(recommendationLists, {
      fields: [recommendationListItems.listId],
      references: [recommendationLists.id],
    }),
    profile: one(profiles, {
      fields: [recommendationListItems.profileId],
      references: [profiles.id],
    }),
  })
);

export const profileOwnersRelations = relations(profileOwners, ({ one }) => ({
  profile: one(profiles, {
    fields: [profileOwners.profileId],
    references: [profiles.id],
  }),
  user: one(users, {
    fields: [profileOwners.userId],
    references: [users.id],
  }),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  author: one(users, {
    fields: [articles.authorId],
    references: [users.id],
    relationName: 'articleAuthor',
  }),
  deletedByUser: one(users, {
    fields: [articles.deletedBy],
    references: [users.id],
    relationName: 'articleDeletedBy',
  }),
  parentArticle: one(articles, {
    fields: [articles.inReplyTo],
    references: [articles.id],
    relationName: 'articleReplies',
  }),
  replies: many(articles, { relationName: 'articleReplies' }),
  announcements: many(articleAnnouncements),
  socialAnnouncements: many(socialStatuses),
}));

export const mentorSessionsRelations = relations(mentorSessions, ({ one }) => ({
  mentor: one(users, {
    fields: [mentorSessions.mentorUserId],
    references: [users.id],
    relationName: 'mentorSessions',
  }),
  mentee: one(users, {
    fields: [mentorSessions.menteeUserId],
    references: [users.id],
    relationName: 'menteeSessions',
  }),
}));

export const socialActorsRelations = relations(
  socialActors,
  ({ one, many }) => ({
    profile: one(profiles, {
      fields: [socialActors.profileId],
      references: [profiles.id],
    }),
    statuses: many(socialStatuses),
    outgoingFollows: many(socialFollows, { relationName: 'followActor' }),
    incomingFollows: many(socialFollows, { relationName: 'followTarget' }),
    likes: many(socialLikes),
    announcements: many(articleAnnouncements),
    // The group this actor IS, when type === 'Group'. Null for people.
    group: one(socialGroups, {
      fields: [socialActors.id],
      references: [socialGroups.actorId],
    }),
    // The groups this actor is IN. Unrelated to the above.
    groupMemberships: many(socialGroupMembers),
  })
);

export const socialStatusesRelations = relations(
  socialStatuses,
  ({ one, many }) => ({
    actor: one(socialActors, {
      fields: [socialStatuses.actorId],
      references: [socialActors.id],
    }),
    article: one(articles, {
      fields: [socialStatuses.articleId],
      references: [articles.id],
    }),
    inReplyTo: one(socialStatuses, {
      fields: [socialStatuses.inReplyToId],
      references: [socialStatuses.id],
      relationName: 'statusReplies',
    }),
    replies: many(socialStatuses, { relationName: 'statusReplies' }),
    attachments: many(socialAttachments),
    tags: many(socialTags),
    likes: many(socialLikes),
    storyViews: many(socialStoryViews),
    articleAnnouncement: one(articleAnnouncements, {
      fields: [socialStatuses.id],
      references: [articleAnnouncements.statusId],
    }),
    event: one(events, {
      fields: [socialStatuses.eventId],
      references: [events.id],
    }),
    group: one(socialGroups, {
      fields: [socialStatuses.groupId],
      references: [socialGroups.id],
    }),
  })
);

export const articleAnnouncementsRelations = relations(
  articleAnnouncements,
  ({ one }) => ({
    article: one(articles, {
      fields: [articleAnnouncements.articleId],
      references: [articles.id],
    }),
    author: one(users, {
      fields: [articleAnnouncements.authorId],
      references: [users.id],
    }),
    actor: one(socialActors, {
      fields: [articleAnnouncements.actorId],
      references: [socialActors.id],
    }),
    status: one(socialStatuses, {
      fields: [articleAnnouncements.statusId],
      references: [socialStatuses.id],
    }),
  })
);

export const socialFollowsRelations = relations(socialFollows, ({ one }) => ({
  actor: one(socialActors, {
    fields: [socialFollows.actorId],
    references: [socialActors.id],
    relationName: 'followActor',
  }),
  targetActor: one(socialActors, {
    fields: [socialFollows.targetActorId],
    references: [socialActors.id],
    relationName: 'followTarget',
  }),
}));

export const socialBlocksRelations = relations(socialBlocks, ({ one }) => ({
  actor: one(socialActors, {
    fields: [socialBlocks.actorId],
    references: [socialActors.id],
    relationName: 'blockActor',
  }),
  targetActor: one(socialActors, {
    fields: [socialBlocks.targetActorId],
    references: [socialActors.id],
    relationName: 'blockTarget',
  }),
}));

export const socialLikesRelations = relations(socialLikes, ({ one }) => ({
  actor: one(socialActors, {
    fields: [socialLikes.actorId],
    references: [socialActors.id],
  }),
  status: one(socialStatuses, {
    fields: [socialLikes.statusId],
    references: [socialStatuses.id],
  }),
}));

export const socialGroupsRelations = relations(
  socialGroups,
  ({ one, many }) => ({
    actor: one(socialActors, {
      fields: [socialGroups.actorId],
      references: [socialActors.id],
    }),
    createdByProfile: one(profiles, {
      fields: [socialGroups.createdByProfileId],
      references: [profiles.id],
    }),
    members: many(socialGroupMembers),
  })
);

export const socialGroupMembersRelations = relations(
  socialGroupMembers,
  ({ one }) => ({
    group: one(socialGroups, {
      fields: [socialGroupMembers.groupId],
      references: [socialGroups.id],
    }),
    actor: one(socialActors, {
      fields: [socialGroupMembers.actorId],
      references: [socialActors.id],
    }),
  })
);

export const socialAttachmentsRelations = relations(
  socialAttachments,
  ({ one }) => ({
    status: one(socialStatuses, {
      fields: [socialAttachments.statusId],
      references: [socialStatuses.id],
    }),
  })
);

export const socialStoryViewsRelations = relations(
  socialStoryViews,
  ({ one }) => ({
    status: one(socialStatuses, {
      fields: [socialStoryViews.statusId],
      references: [socialStatuses.id],
    }),
    viewer: one(socialActors, {
      fields: [socialStoryViews.viewerActorId],
      references: [socialActors.id],
    }),
  })
);

export const socialTagsRelations = relations(socialTags, ({ one }) => ({
  status: one(socialStatuses, {
    fields: [socialTags.statusId],
    references: [socialStatuses.id],
  }),
}));

export const venuesRelations = relations(venues, ({ one, many }) => ({
  operator: one(profiles, {
    fields: [venues.operatorProfileId],
    references: [profiles.id],
  }),
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  venue: one(venues, {
    fields: [events.venueId],
    references: [venues.id],
  }),
  host: one(profiles, {
    fields: [events.hostProfileId],
    references: [profiles.id],
  }),
  hostGroup: one(socialGroups, {
    fields: [events.hostGroupId],
    references: [socialGroups.id],
  }),
  attendees: many(eventAttendees),
  socialStatuses: many(socialStatuses),
}));

export const eventAttendeesRelations = relations(eventAttendees, ({ one }) => ({
  event: one(events, {
    fields: [eventAttendees.eventId],
    references: [events.id],
  }),
  profile: one(profiles, {
    fields: [eventAttendees.profileId],
    references: [profiles.id],
  }),
}));

export const eventDismissalsRelations = relations(
  eventDismissals,
  ({ one }) => ({
    event: one(events, {
      fields: [eventDismissals.eventId],
      references: [events.id],
    }),
    profile: one(profiles, {
      fields: [eventDismissals.profileId],
      references: [profiles.id],
    }),
  })
);

export const screennameHistoryRelations = relations(
  screennameHistory,
  ({ one }) => ({
    user: one(users, {
      fields: [screennameHistory.userId],
      references: [users.id],
    }),
  })
);

export const deletionLogsRelations = relations(deletionLogs, () => ({}));

// =============================================================================
// Relay Groups (NIP-29) — panamia is sole source of truth. Read by the relay
// Worker's /api/internal/relay/* endpoints. See docs/RESILIENCE-ROADMAP.md.
// =============================================================================

export const relayGroups = pgTable(
  'relay_groups',
  {
    // NIP-29 group_id — relay-chosen string, used as the "h" tag on group
    // events. Stable for the life of the group; not a UUID.
    groupId: text('group_id').primaryKey(),
    name: text('name').notNull(),
    about: text('about'),
    picture: text('picture'),
    // Discoverable groups have their kind 39000 metadata emitted publicly.
    // Derived from joinPolicy on every write (open => discoverable) so the
    // /r/groups/browse listing and the relay's public metadata agree.
    discoverable: boolean('discoverable').notNull().default(true),
    // Hex pubkey of the member holding creator rights (metadata edits and
    // invites), reassigned to the longest-tenured member when that person
    // leaves. NULL means panamia provisioned the group by hand — which also
    // exempts it from delete-when-empty. Pubkey rather than a profile id so it
    // matches relayGroupMembers and the pubkey-keyed account-deletion sweep.
    createdBy: text('created_by'),
    joinPolicy: relayGroupJoinPolicy('join_policy')
      .notNull()
      .default('invite_only'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    discoverableIdx: index('relay_groups_discoverable_idx').on(
      table.discoverable
    ),
    createdByIdx: index('relay_groups_created_by_idx').on(table.createdBy),
  })
);

// Outstanding invitations to a group. Keyed by users.id, not pubkey: the
// invite is delivered to a Pana account through the notifications table, and
// the invitee may not have enrolled a Nostr key yet when it is sent. Accepting
// requires enrollment; the row is deleted on accept, decline, or expiry.
export const relayGroupInvites = pgTable(
  'relay_group_invites',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    groupId: text('group_id')
      .notNull()
      .references(() => relayGroups.groupId, { onDelete: 'cascade' }),
    invitedUserId: text('invited_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: uniqueIndex('relay_group_invites_pk').on(
      table.groupId,
      table.invitedUserId
    ),
    invitedUserIdx: index('relay_group_invites_invited_user_id_idx').on(
      table.invitedUserId
    ),
    expiresAtIdx: index('relay_group_invites_expires_at_idx').on(
      table.expiresAt
    ),
  })
);

export const relayGroupMembers = pgTable(
  'relay_group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => relayGroups.groupId, { onDelete: 'cascade' }),
    // Hex-encoded secp256k1 x-only pubkey. No FK to profiles yet — the
    // nostr_pubkey linkage is deferred (BYO + issuance flow TBD).
    pubkey: text('pubkey').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    pk: uniqueIndex('relay_group_members_pk').on(table.groupId, table.pubkey),
    pubkeyIdx: index('relay_group_members_pubkey_idx').on(table.pubkey),
  })
);

// Leaves in the 24h debounce grace period (kind 9022 advisory). Maturation is
// mature-on-read via lib/relay/group-maturation.ts, not cron-driven.
export const relayGroupLeavePending = pgTable(
  'relay_group_leave_pending',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => relayGroups.groupId, { onDelete: 'cascade' }),
    pubkey: text('pubkey').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    pk: uniqueIndex('relay_group_leave_pending_pk').on(
      table.groupId,
      table.pubkey
    ),
    requestedAtIdx: index('relay_group_leave_pending_requested_at_idx').on(
      table.requestedAt
    ),
  })
);

// Joins awaiting admin approval (kind 9021 advisory). Row stays until an admin
// approves (insert into relay_group_members + delete here) or denies (delete).
export const relayGroupJoinPending = pgTable(
  'relay_group_join_pending',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => relayGroups.groupId, { onDelete: 'cascade' }),
    pubkey: text('pubkey').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    pk: uniqueIndex('relay_group_join_pending_pk').on(
      table.groupId,
      table.pubkey
    ),
    requestedAtIdx: index('relay_group_join_pending_requested_at_idx').on(
      table.requestedAt
    ),
  })
);

// NIP-56 abuse reports (kind 1984) forwarded from the relay. Accepted from
// anyone — member or not — so no FK from reporter/target pubkeys to profiles.
// report_type is plain text (not an enum): the NIP-56 type set drifts.
export const relayReports = pgTable(
  'relay_reports',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    // The kind 1984 event id on the relay.
    eventId: text('event_id').notNull(),
    // Hex x-only pubkey of the reporter (event.pubkey).
    reporterPubkey: text('reporter_pubkey').notNull(),
    // Reported account (NIP-56 `p` tag) — nullable.
    targetPubkey: text('target_pubkey'),
    // Reported event (NIP-56 `e` tag) — nullable.
    targetEventId: text('target_event_id'),
    reportType: text('report_type'),
    content: text('content').notNull().default(''),
    // Snapshot of the reported event captured by the relay at forward time.
    reportedContent: text('reported_content'),
    reportedKind: integer('reported_kind'),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    status: relayReportStatus('status').notNull().default('open'),
    moderationReason: text('moderation_reason'),
    lastModerationActionAt: timestamp('last_moderation_action_at', {
      withTimezone: true,
    }),
  },
  (table) => ({
    // Dedup for queue readability (NOT an abuse control): collapse repeat
    // reports of the same target+type by the same reporter.
    dedupIdx: uniqueIndex('relay_reports_dedup_idx').on(
      table.reporterPubkey,
      table.targetPubkey,
      table.targetEventId,
      table.reportType
    ),
    statusIdx: index('relay_reports_status_idx').on(table.status),
    receivedAtIdx: index('relay_reports_received_at_idx').on(table.receivedAt),
  })
);

export const relayGroupsRelations = relations(relayGroups, ({ many }) => ({
  members: many(relayGroupMembers),
  leavePending: many(relayGroupLeavePending),
  joinPending: many(relayGroupJoinPending),
}));

export const relayGroupMembersRelations = relations(
  relayGroupMembers,
  ({ one }) => ({
    group: one(relayGroups, {
      fields: [relayGroupMembers.groupId],
      references: [relayGroups.groupId],
    }),
  })
);

// =============================================================================
// Operations
// =============================================================================

/**
 * One row per scheduled-job invocation. Written by lib/jobs/ledger.ts, read by
 * /admin/livesite. See drizzle/0063_job_runs.sql for the reasoning.
 *
 * The row is written when a run *starts* and updated when it ends, so a Worker
 * killed mid-flight leaves `finishedAt` null rather than leaving no trace at
 * all. `ok` is deliberately nullable for the same reason: an unfinished run
 * must never read as a successful one.
 */
export const jobRuns = pgTable(
  'job_runs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    /** Free text, not an enum, so a new job needs no migration. See 0063. */
    job: text('job').notNull(),
    /** The cron expression that fired it, or 'manual'. */
    trigger: text('trigger').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    /** Null means the run never came back. */
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** Null while in flight. */
    ok: boolean('ok'),
    /** The job's own report, verbatim. Shape belongs to the writer. */
    report: jsonb('report'),
    errorCount: integer('error_count').notNull().default(0),
  },
  (table) => [
    index('job_runs_job_started_at_idx').on(table.job, table.startedAt.desc()),
  ]
);

// =============================================================================
// Inferred Types
// =============================================================================

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type ConsentReceipt = typeof consentReceipts.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type ContactSubmission = typeof contactSubmissions.$inferSelect;
export type NewsletterSignup = typeof newsletterSignups.$inferSelect;
export type EmailMigration = typeof emailMigrations.$inferSelect;
export type OAuthVerification = typeof oAuthVerifications.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type MentorSession = typeof mentorSessions.$inferSelect;
export type IntakeForm = typeof intakeForms.$inferSelect;
export type SocialActor = typeof socialActors.$inferSelect;

/**
 * A social actor with the signing key stripped, as returned by any query
 * that selects PUBLIC_ACTOR_COLUMNS. Use this in the return types of
 * anything a client can reach so a full SocialActor cannot be assigned
 * into a public response by mistake.
 *
 * `dmPolicy` is omitted for the same reason it is absent from
 * PUBLIC_ACTOR_COLUMNS: publishing it makes blocks inferable. A blocked
 * sender who sees `everyone` and is refused anyway has learned something the
 * block exists to withhold. This Omit is what makes that decision hold —
 * adding the column to the table alone would have quietly widened every
 * public response, and the type is what caught it.
 */
export type PublicSocialActor = Omit<SocialActor, 'privateKey' | 'dmPolicy'>;

/**
 * Strip the signing key off an actor row.
 *
 * For the paths that cannot use PUBLIC_ACTOR_COLUMNS because they need the
 * whole row first -- creating an actor returns the key it just generated --
 * call this before the value reaches a response.
 */
export function toPublicActor<T extends { privateKey?: string | null }>(
  actor: T
): Omit<T, 'privateKey'> {
  const rest = { ...actor };
  delete (rest as { privateKey?: string | null }).privateKey;
  return rest;
}
export type SocialStatus = typeof socialStatuses.$inferSelect;
export type ArticleAnnouncement = typeof articleAnnouncements.$inferSelect;
export type SocialFollow = typeof socialFollows.$inferSelect;
export type SocialBlock = typeof socialBlocks.$inferSelect;
export type SocialBlockKind = (typeof socialBlockKind.enumValues)[number];
export type SocialGroup = typeof socialGroups.$inferSelect;
export type SocialGroupMember = typeof socialGroupMembers.$inferSelect;
export type SocialLike = typeof socialLikes.$inferSelect;
export type SocialAttachment = typeof socialAttachments.$inferSelect;
export type SocialStoryView = typeof socialStoryViews.$inferSelect;
export type SocialTag = typeof socialTags.$inferSelect;
export type ScreennameHistory = typeof screennameHistory.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EventAttendee = typeof eventAttendees.$inferSelect;
export type DeletionLog = typeof deletionLogs.$inferSelect;
export type RelayGroup = typeof relayGroups.$inferSelect;
export type RelayGroupMember = typeof relayGroupMembers.$inferSelect;
export type RelayGroupLeavePending = typeof relayGroupLeavePending.$inferSelect;
export type RelayGroupJoinPending = typeof relayGroupJoinPending.$inferSelect;
export type RelayReport = typeof relayReports.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;