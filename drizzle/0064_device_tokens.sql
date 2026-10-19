-- =============================================================================
-- Migration: 0064_device_tokens
-- Purpose: Addresses for push notifications. The notifications table records
--          that something happened; this table is the set of lock screens it
--          can be delivered to. Until now the only delivery channel was
--          opening the site, which means a notification is seen when somebody
--          happens to look rather than when it happens — the difference
--          between a message and a mailbox you have to go and check.
--
--          It is also the clearest native capability the app has that a
--          browser tab does not, which is the answer to App Store guideline
--          4.2 ("minimum functionality"). See docs/MOBILE-ROADMAP.md.
-- Ticket: N/A
-- Reversible: Yes
--
-- Dependencies: users
-- Data Migration: None (new table only)
--
-- Rollback:
--   DROP TABLE IF EXISTS "device_tokens";
--   DROP TYPE IF EXISTS "device_platform";
--
-- UNIQUE (token) is the load-bearing constraint here, and it is a privacy
-- control rather than a tidiness one.
--
-- A push token identifies a device install, not a person. Phones are shared,
-- handed down and sold. If two rows could carry the same token, then signing
-- out and signing in as somebody else would leave the previous row intact, and
-- the next notification for the previous account would arrive on the new
-- owner's lock screen — direct messages included, with sender and preview
-- text. A private-message disclosure to a different human being, caused by a
-- second member signing in on the same handset.
--
-- The unique index makes that unrepresentable: registration upserts on token
-- and overwrites user_id, so a device may belong to a different member
-- tomorrow but only ever to one at a time. See lib/push/tokens.ts.
--
-- Rows are deleted rather than flagged when a token dies. APNs (410) and FCM
-- (UNREGISTERED) both disown a token unambiguously and permanently, so a
-- retained row would be a known-undeliverable address carried through every
-- future send.
--
-- ON DELETE CASCADE because a token is a durable identifier for one person's
-- physical handset, and therefore personal data under every regime that
-- applies here. Cascading means lib/server/delete-account.ts collects these
-- without needing to know the table exists — see docs/PRIVACY-ROADMAP.md.
--
-- last_seen_at exists because an uninstall produces no event anywhere. The app
-- re-registers on each launch, so staleness is the only available signal that
-- an install is gone, and pruning on it is what stops the table growing
-- without bound as devices are replaced.
-- =============================================================================

CREATE TYPE "device_platform" AS ENUM ('ios', 'android');
--> statement-breakpoint

CREATE TABLE "device_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL,
  "platform" "device_platform" NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "device_tokens_token_unique"
  ON "device_tokens" ("token");
--> statement-breakpoint

CREATE INDEX "device_tokens_user_id_idx"
  ON "device_tokens" ("user_id");
