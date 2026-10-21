-- Migration: 0067_community_sms_campaigns
-- Purpose: Persist staff-created community SMS campaigns and each recipient's
--          eligibility and HighLevel submission outcome.
--
-- Ticket: N/A
-- Reversible: Yes
--
-- The campaign row is the admin-facing audit record: who created the send,
-- which platform audience was selected, the exact message, timing, and final
-- totals. Recipient rows make partial failures explicit and retryable without
-- resending to people HighLevel already accepted.
--
-- No phone number or contact name is copied into these tables. The profile
-- foreign key is enough while the account exists and becomes NULL on profile
-- deletion, preserving aggregate campaign history without retaining a deleted
-- member's contact details.
--
-- Rollback:
--   DROP TABLE IF EXISTS "community_sms_recipients";
--   DROP TABLE IF EXISTS "community_sms_campaigns";
-- =============================================================================

CREATE TABLE IF NOT EXISTS "community_sms_campaigns" (
  "id" text PRIMARY KEY,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "request_id" text NOT NULL UNIQUE,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "audience" text NOT NULL,
  "message" text NOT NULL,
  "scheduled_at" timestamp with time zone,
  "status" text DEFAULT 'processing' NOT NULL,
  "candidate_count" integer DEFAULT 0 NOT NULL,
  "eligible_count" integer DEFAULT 0 NOT NULL,
  "excluded_count" integer DEFAULT 0 NOT NULL,
  "sent_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,

  CONSTRAINT "community_sms_campaigns_name_not_blank"
    CHECK (length(btrim("name")) > 0),
  CONSTRAINT "community_sms_campaigns_request_id_not_blank"
    CHECK (length(btrim("request_id")) > 0),
  CONSTRAINT "community_sms_campaigns_message_not_blank"
    CHECK (length(btrim("message")) > 0),
  CONSTRAINT "community_sms_campaigns_status_valid"
    CHECK ("status" IN ('processing', 'completed', 'partial', 'failed')),
  CONSTRAINT "community_sms_campaigns_counts_non_negative"
    CHECK (
      "candidate_count" >= 0 AND
      "eligible_count" >= 0 AND
      "excluded_count" >= 0 AND
      "sent_count" >= 0 AND
      "failed_count" >= 0
    )
);

CREATE INDEX IF NOT EXISTS "community_sms_campaigns_created_at_idx"
  ON "community_sms_campaigns" ("created_at" DESC);

CREATE TABLE IF NOT EXISTS "community_sms_recipients" (
  "id" text PRIMARY KEY,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "campaign_id" text NOT NULL
    REFERENCES "community_sms_campaigns"("id") ON DELETE CASCADE,
  "profile_id" text REFERENCES "profiles"("id") ON DELETE SET NULL,
  "status" text NOT NULL,
  "reason" text,
  "ghl_message_id" text,

  CONSTRAINT "community_sms_recipients_status_valid"
    CHECK ("status" IN ('excluded', 'sent', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "community_sms_recipients_campaign_profile_unique"
  ON "community_sms_recipients" ("campaign_id", "profile_id")
  WHERE "profile_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "community_sms_recipients_campaign_status_idx"
  ON "community_sms_recipients" ("campaign_id", "status");
