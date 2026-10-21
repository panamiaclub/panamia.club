-- Migration: 0066_shop_settings
-- Purpose: Store the operational settings edited from /admin/shop and used
--          directly by merchandise checkout and notification processing.
-- Ticket: N/A
-- Reversible: Yes

CREATE TABLE "commerce_shop_settings" (
  "id" text PRIMARY KEY DEFAULT 'default',
  "standard_shipping_enabled" boolean DEFAULT true NOT NULL,
  "standard_shipping_cents" integer DEFAULT 500 NOT NULL,
  "standard_shipping_min_days" integer DEFAULT 3 NOT NULL,
  "standard_shipping_max_days" integer DEFAULT 7 NOT NULL,
  "local_pickup_enabled" boolean DEFAULT true NOT NULL,
  "pickup_instructions" text,
  "ghl_sync_enabled" boolean DEFAULT true NOT NULL,
  "customer_email_enabled" boolean DEFAULT true NOT NULL,
  "staff_email_enabled" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "commerce_shop_settings_shipping_non_negative"
    CHECK ("standard_shipping_cents" >= 0),
  CONSTRAINT "commerce_shop_settings_days_valid"
    CHECK (
      "standard_shipping_min_days" >= 0
      AND "standard_shipping_max_days" >= "standard_shipping_min_days"
    )
);

INSERT INTO "commerce_shop_settings" ("id")
VALUES ('default')
ON CONFLICT ("id") DO NOTHING;

-- Rollback:
-- DROP TABLE "commerce_shop_settings";
