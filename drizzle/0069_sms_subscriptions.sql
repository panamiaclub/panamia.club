-- Migration: 0069_sms_subscriptions
-- Purpose: Store each member's explicit Panamia SMS opt-in, dedicated mobile
--          number, and HighLevel synchronization state.
--
-- Ticket: N/A
-- Reversible: Yes
--
-- Panamia is the source of truth for consent. HighLevel remains the delivery
-- provider and mirrors this state, but a missing or stale CRM record can no
-- longer turn account membership into implied permission to text.
--
-- One current row per profile is enough because every consent-changing action
-- retains its timestamps, disclosure version, source, and originating IP.
-- Profile deletion cascades the row so a deleted account does not leave a
-- phone number behind in an operational table.
--
-- Rollback:
--   DROP TABLE IF EXISTS "sms_subscriptions";
-- =============================================================================

CREATE TABLE IF NOT EXISTS "sms_subscriptions" (
  "profile_id" text PRIMARY KEY
    REFERENCES "profiles"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "phone" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "consent_version" text NOT NULL,
  "consent_source" text NOT NULL,
  "consent_ip" text,
  "consented_at" timestamp with time zone,
  "opted_out_at" timestamp with time zone,
  "synced_at" timestamp with time zone,
  "sync_error" text,

  CONSTRAINT "sms_subscriptions_phone_not_blank"
    CHECK (length(btrim("phone")) > 0),
  CONSTRAINT "sms_subscriptions_status_valid"
    CHECK ("status" IN ('pending', 'active', 'opted_out')),
  CONSTRAINT "sms_subscriptions_consent_version_not_blank"
    CHECK (length(btrim("consent_version")) > 0),
  CONSTRAINT "sms_subscriptions_consent_source_not_blank"
    CHECK (length(btrim("consent_source")) > 0)
);

CREATE INDEX IF NOT EXISTS "sms_subscriptions_retry_idx"
  ON "sms_subscriptions" ("updated_at")
  WHERE "status" = 'pending' OR "sync_error" IS NOT NULL;
