// Binds the privacy framework to the database schema.
//
// policy.json describes what we collect; this file asserts that description
// against the actual Drizzle tables. Historically nothing connected the two, so
// design drift went unnoticed in both directions — categories documenting
// dropped tables (event_photos, srt_keys) and tables holding personal data with
// no category at all (the relay tables). See docs/PRIVACY-ROADMAP.md.
//
// Two guarantees, at two layers:
//
//  - Compile time: `inventory` is Record<TableExport, Classification>, where
//    TableExport is every table exported from lib/schema. Adding a table to the
//    schema without an entry here is a compile error — the decision lands when
//    the table is written, which is when the author knows the answer.
//
//  - Run time: category NAMES cannot be checked at compile time — they widen to
//    `string` coming through the policy.json import — so validateInventory()
//    checks that every referenced category exists and that every category is
//    either table-backed or declared storage-free. scripts/check-data-inventory.ts
//    runs it in pre-commit.
//
// Granularity is table-level, not column-level: `profiles` backs six categories,
// so this catches "table undocumented" but not "new personal column added to an
// already-classified table". Column-level is a heavier v2.

import * as schema from '@/lib/schema';
import { PgTable } from 'drizzle-orm/pg-core';
import { allCategories } from './privacy-policy';

// A table that stores no personal data (group config, join tables of opaque
// ids, etc.). A positive assertion a reviewer can challenge — there is no
// "classify later" escape hatch, so an unclassified new table simply does not
// compile. Either name its categories or assert it holds none.
export const NOT_PERSONAL_DATA = Symbol('not-personal-data');

type CategoryName = (typeof allCategories)[number]['name'];

type Classification = CategoryName[] | typeof NOT_PERSONAL_DATA;

// Every key of the schema module whose value is a Drizzle table. Enums,
// relations, and type aliases are excluded by the `extends PgTable` test.
type TableExport = {
  [K in keyof typeof schema]: (typeof schema)[K] extends PgTable ? K : never;
}[keyof typeof schema];

// The map. Exhaustive over TableExport — a missing table will not compile.
//
// Categories that are NOT backed by any of our tables — because the data lives
// on a third party (analytics -> Cloudflare, oauth via provider), on servers we
// do not operate (nostr_published_events -> relay D1), or nowhere durable
// (mentoring realtime, in-person, peer-observed) — are declared in
// STORAGE_FREE_CATEGORIES below rather than pinned to a row here.
export const inventory: Record<TableExport, Classification> = {
  // --- Auth / account ---
  users: ['account'],
  accounts: ['account', 'oauth_identity', 'oauth_tokens'],
  sessions: ['account'],
  // A staff record *about* an account: who locked or unlocked it, when, and
  // the written reason. Classified under 'account' because it is wholly about
  // one member's access to their own account — but note it holds two people,
  // the subject and the acting admin, and the admin's email is kept
  // deliberately so the entry survives them deleting their own account.
  //
  // It is not exported to the subject on request without redaction: the reason
  // text may quote a third party's report, and handing over the moderator's
  // identity verbatim is how a lock becomes a reprisal. There is no
  // subject-access export in the product yet; this note is here so that
  // whoever writes one does not discover the problem by shipping it.
  userLocks: ['account'],
  verification: ['verification_tokens'],
  oAuthVerifications: ['verification_tokens'],

  // --- Profile (one wide table backing several categories) ---
  profiles: [
    'profile',
    'mentoring_profile',
    'nostr_identity',
    'payments', // stripe_customer_id
    'crm', // ghl_contact_id
    'visible_profile_info',
  ],
  // Which listings a person administers. Opaque ids only, but the association
  // itself is personal data — it says which businesses this human runs — so it
  // is classified rather than waved through as a join table. Cascades on user
  // delete, so it leaves with the account.
  profileOwners: ['account'],
  // Which listings a person saved or recommended. Opaque ids only, but this is
  // a record of a named human's opinions and interests in the directory — a
  // recommendation is published under their name, and the saved list is a map
  // of what they care about. Classified as profile data rather than dismissed
  // as a join table. Cascades on user delete, so it leaves with the account.
  profileSignals: ['profile', 'visible_profile_info'],

  // --- Recommendation lists ---
  // A named list of businesses a pana vouches for. The owner's own words in
  // the title and blurb, published under their name, so this is their personal
  // expression rather than a join table of opaque ids — the same call
  // profileSignals makes, one step further along: a recommendation carries no
  // text, a list carries an argument for why these places belong together.
  // Federated as an ActivityPub Collection, hence the third category.
  recommendationLists: [
    'profile',
    'visible_profile_info',
    'activitypub_federated_content',
  ],
  // The per-entry note is the single most personal thing in this feature — it
  // is a named human saying, in their own voice, what they order and when.
  // NOT_PERSONAL_DATA would be plainly wrong here even though the row is
  // mostly foreign keys.
  recommendationListItems: [
    'profile',
    'visible_profile_info',
    'activitypub_federated_content',
  ],

  // --- Notifications / preferences ---
  notifications: ['notifications'],

  // --- Onboarding ---
  intakeForms: ['intake'],

  // --- Mentoring (realtime session data is temporary/peer, not stored here) ---
  mentorSessions: ['session_notes'],

  // --- Articles ---
  articles: ['articles', 'article_reviews', 'co_author_content'],

  // --- Social / ActivityPub ---
  socialActors: ['activitypub_federated_content', 'visible_profile_info'],
  socialStatuses: ['social_posts', 'activitypub_federated_content'],
  socialFollows: ['social_graph'],
  // Who someone has blocked or muted. Social graph data, but the most
  // sensitive kind we hold: a block list is a list of people someone needed to
  // get away from, which can be a record of harassment, an ex, or a former
  // employer. It is never shown to the blocked party and never federated, and
  // a data export hands the subject their own list -- not the inverse list of
  // who blocked them, which is other people's data about their own safety.
  socialBlocks: ['social_graph'],
  // Who has asked to open a DM thread with whom, and whether it was accepted.
  // Social graph data of the same shape as a follow, but it additionally
  // records attempted contact that the recipient has not answered — so the
  // pending rows are a list of people who wrote to someone who did not write
  // back. Never shown to the sender (that is the point of the hold: being told
  // "your message is waiting in Requests" discloses the recipient's settings),
  // and never federated. A data export hands the subject the requests they
  // sent and the requests they received, both being records of their own
  // correspondence.
  socialDmRequests: ['social_graph'],
  socialLikes: ['social_graph'],
  // Group configuration is not personal data, but created_by_profile_id is —
  // it records which human started a given group, the same kind of association
  // profileOwners is classified for. Hence a category rather than
  // NOT_PERSONAL_DATA, which is what relayGroups could claim because it holds
  // no link back to a person.
  socialGroups: ['social_graph'],
  // Which groups a pana belongs to, and in what role. Opaque ids, but the
  // association is a map of someone's interests and affiliations.
  socialGroupMembers: ['social_graph'],
  socialAttachments: ['uploads', 'social_posts'],
  // Who watched whose story. An interaction record between two actors, same
  // shape as a like, and surfaced to the story's author as a viewer list --
  // so it is personal data about the viewer, not just the author.
  socialStoryViews: ['social_graph'],
  socialTags: ['social_posts'],
  articleAnnouncements: ['activitypub_federated_content'],

  // --- Events ---
  venues: ['events'],
  events: ['events'],
  eventAttendees: ['rsvps', 'event_attendance_info'],
  // What a pana has hidden from their own event recommendations, and which
  // reason the page had given for showing it. Classified under its own
  // category rather than folded into `rsvps`, which is the nearest existing
  // fit and would have been wrong in the one way that matters: every other
  // events category is shared with organizers, and a dismissal is seen by
  // nobody but its author. Telling a member in the privacy centre that their
  // "not for me" taps go to hosts would be worse than not listing them.
  eventDismissals: ['event_preferences'],

  // --- Community Connectors (the volunteer programme) ---
  // What a connector said they would do, plus anything staff put on their
  // board. Member-provided free text tied to a profile, removed with the
  // account — the same shape as the other small member datasets, so it sits
  // under that category rather than inventing one for a single table.
  connectorCommitments: ['other_member_data'],
  // Programme logistics: a title, a time, a place, and a pod. No member is
  // named as an attendee — attendance is not recorded — but `lead` holds the
  // name of whoever is running the gathering, which is organiser data in the
  // same sense the public events table holds it. Deliberately a name and
  // nothing else: no phone, no email, no FK.
  connectorEvents: ['events'],

  // --- Relay / Nostr ---
  relayGroups: NOT_PERSONAL_DATA, // group metadata only; no member PII
  relayGroupMembers: ['relay_group_membership'],
  relayGroupJoinPending: ['relay_pending_requests'],
  relayGroupLeavePending: ['relay_pending_requests'],
  relayGroupInvites: ['relay_group_invites'],
  relayReports: ['relay_abuse_reports'],

  // --- Commerce ---
  commerceInventory: NOT_PERSONAL_DATA,
  commerceOrders: ['payments'],
  commerceOrderItems: ['payments'],
  commerceSubscriptions: ['payments'],
  stripeWebhookEvents: NOT_PERSONAL_DATA,

  // --- Compliance records (retained after account deletion by design) ---
  consentReceipts: ['consent_receipts'],
  deletionLogs: ['deletion_audit'],
  screennameHistory: ['screenname_redirects'],

  // --- Other deletable member data ---
  emailMigrations: ['verification_tokens'], // tokenized email-change, temporary
  contactSubmissions: ['contact_inquiries'],
  newsletterSignups: ['other_member_data'],
  interactions: ['other_member_data'],

  // --- Operations ---
  // Scheduled-job telemetry: which job, when it started and finished, whether
  // it worked, and how many things it moved. No member is named, no row here
  // is about a person, and nothing is written from a request -- only from the
  // cron handler in worker/index.ts.
  //
  // The assertion is about the `report` column rather than the table shape,
  // because `report` is free-form jsonb and is therefore the only way a member
  // could ever get in here. Today its sole writer is PurgeReport, which is
  // four counts and a list of error strings. Two of those strings can carry
  // something that is not a plain count, and both are worth naming rather than
  // waving through:
  //
  //   - "R2 delete failed for story <id>" embeds a status id. It names nobody,
  //     and it points at an *expired* story that the job is in the middle of
  //     deleting, so the pointer usually outlives its target by one run. It is
  //     still a reference to one member's content while it lasts.
  //   - "notification cleanup failed: <message>" passes a driver error through
  //     verbatim, and a Postgres constraint violation will happily quote the
  //     offending value back at you.
  //
  // Neither is personal data in any ordinary reading, and 30-day retention is
  // enforced by the ledger itself (lib/jobs/ledger.ts). But the classification
  // holds only as long as writers treat `report` as telemetry, so: do not put
  // member content, emails, or free-text written by a human into it. A job that
  // needs to record who something happened to wants its own table and its own
  // entry above, not a corner of this one.
  jobRuns: NOT_PERSONAL_DATA,
};

// Categories with no backing row in `inventory`, by design. Kept explicit so
// the reverse check (every category is either table-backed or declared here)
// can tell "storage-free" apart from "forgotten".
export const STORAGE_FREE_CATEGORIES: CategoryName[] = [
  // Temporary — Durable Object / in-memory, never Postgres
  'signaling',
  'whiteboard',
  'session_chat',
  'session_streams',
  // Peer — seen by participants, not retained by us
  'webrtc_streams',
  'whiteboard_content',
  'seen_chat_messages',
  'in_person_exchanges',
  // External — a third party or an open network holds it, not our DB
  'analytics', // Cloudflare
  'nostr_published_events', // relay D1 + open Nostr network, out of scope here
];

// ---------------------------------------------------------------------------
// Runtime validation
// ---------------------------------------------------------------------------

export interface InventoryIssue {
  kind:
    | 'unknown_category' // a table references a category name that does not exist
    | 'uncovered_category'; // a category is neither table-backed nor storage-free
  detail: string;
}

const CATEGORY_NAMES = new Set(allCategories.map((c) => c.name));

/**
 * Cross-checks the inventory against policy.json. Returns every issue found;
 * an empty array means the framework and the schema agree. Intended to run in a
 * test / pre-commit check, not at request time.
 */
export function validateInventory(): InventoryIssue[] {
  const issues: InventoryIssue[] = [];
  const covered = new Set<string>(STORAGE_FREE_CATEGORIES);

  for (const [table, classification] of Object.entries(inventory)) {
    if (classification === NOT_PERSONAL_DATA) continue;
    for (const cat of classification) {
      if (!CATEGORY_NAMES.has(cat)) {
        issues.push({
          kind: 'unknown_category',
          detail: `${table} -> "${cat}" is not a category in policy.json`,
        });
      }
      covered.add(cat);
    }
  }

  for (const cat of CATEGORY_NAMES) {
    if (!covered.has(cat)) {
      issues.push({
        kind: 'uncovered_category',
        detail: `category "${cat}" is neither backed by a table nor declared storage-free`,
      });
    }
  }

  return issues;
}
