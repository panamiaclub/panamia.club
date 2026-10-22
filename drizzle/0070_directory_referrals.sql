-- Migration: 0070_directory_referrals
-- Purpose: Give signed-in members stable referral links and independently
--          record account, directory, and Community Connector conversions.
-- Ticket: N/A
-- Reversible: Yes
--
-- Dependencies: users, profiles
-- Data Migration: None
--
-- Rollback:
--   DROP TABLE IF EXISTS "referral_events";
--   DROP TABLE IF EXISTS "referral_attributions";
--   DROP TABLE IF EXISTS "referral_codes";
-- =============================================================================

CREATE TABLE "referral_codes" (
  "code" text PRIMARY KEY,
  "user_id" text NOT NULL
    REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "referral_codes_user_id_unique" UNIQUE ("user_id"),
  CONSTRAINT "referral_codes_code_not_blank"
    CHECK (length(btrim("code")) > 0)
);

CREATE TABLE "referral_attributions" (
  "id" text PRIMARY KEY,
  "referral_code" text NOT NULL
    REFERENCES "referral_codes"("code") ON DELETE CASCADE,
  "referrer_user_id" text NOT NULL
    REFERENCES "users"("id") ON DELETE CASCADE,
  "referred_user_id" text
    REFERENCES "users"("id") ON DELETE CASCADE,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "attached_at" timestamp with time zone,

  CONSTRAINT "referral_attributions_referred_user_unique"
    UNIQUE ("referred_user_id")
);

CREATE INDEX "referral_attributions_referrer_idx"
  ON "referral_attributions" ("referrer_user_id", "first_seen_at" DESC);

CREATE TABLE "referral_events" (
  "id" text PRIMARY KEY,
  "attribution_id" text NOT NULL
    REFERENCES "referral_attributions"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "referred_user_id" text
    REFERENCES "users"("id") ON DELETE CASCADE,
  "profile_id" text
    REFERENCES "profiles"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "referral_events_attribution_type_unique"
    UNIQUE ("attribution_id", "event_type"),
  CONSTRAINT "referral_events_type_valid"
    CHECK ("event_type" IN (
      'account_created',
      'directory_submitted',
      'connector_active'
    ))
);

CREATE INDEX "referral_events_type_created_at_idx"
  ON "referral_events" ("event_type", "created_at" DESC);
