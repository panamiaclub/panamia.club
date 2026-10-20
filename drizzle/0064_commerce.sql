-- Migration: 0064_commerce
-- Purpose: Persist Stripe-backed shop orders, inventory reservations,
--          subscriptions, fulfillment state, and processed webhook IDs.
-- Ticket: N/A
-- Reversible: Yes
--
-- Products and prices remain authoritative in Stripe. Inventory and
-- fulfillment are operational state owned by this application.

CREATE TYPE "commerce_order_kind" AS ENUM ('merchandise', 'subscription');
CREATE TYPE "commerce_order_status" AS ENUM (
  'pending',
  'paid',
  'payment_failed',
  'refunded',
  'partially_refunded',
  'cancelled'
);
CREATE TYPE "commerce_fulfillment_status" AS ENUM (
  'not_required',
  'unfulfilled',
  'processing',
  'fulfilled',
  'cancelled'
);

CREATE TABLE "commerce_inventory" (
  "stripe_price_id" text PRIMARY KEY,
  "stripe_product_id" text NOT NULL,
  "available_quantity" integer DEFAULT 0 NOT NULL,
  "reserved_quantity" integer DEFAULT 0 NOT NULL,
  "track_inventory" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "commerce_inventory_available_non_negative"
    CHECK ("available_quantity" >= 0),
  CONSTRAINT "commerce_inventory_reserved_non_negative"
    CHECK ("reserved_quantity" >= 0),
  CONSTRAINT "commerce_inventory_reserved_within_available"
    CHECK ("reserved_quantity" <= "available_quantity")
);

CREATE TABLE "commerce_orders" (
  "id" text PRIMARY KEY,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "kind" "commerce_order_kind" NOT NULL,
  "status" "commerce_order_status" DEFAULT 'pending' NOT NULL,
  "fulfillment_status" "commerce_fulfillment_status"
    DEFAULT 'not_required' NOT NULL,
  "email" text,
  "customer_name" text,
  "currency" text DEFAULT 'usd' NOT NULL,
  "subtotal_cents" integer DEFAULT 0 NOT NULL,
  "shipping_cents" integer DEFAULT 0 NOT NULL,
  "tax_cents" integer DEFAULT 0 NOT NULL,
  "discount_cents" integer DEFAULT 0 NOT NULL,
  "total_cents" integer DEFAULT 0 NOT NULL,
  "refunded_cents" integer DEFAULT 0 NOT NULL,
  "stripe_checkout_session_id" text UNIQUE,
  "stripe_payment_intent_id" text,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "shipping_address" jsonb,
  "tracking_number" text,
  "tracking_url" text,
  "fulfilled_at" timestamp with time zone,
  "reservation_expires_at" timestamp with time zone,
  CONSTRAINT "commerce_orders_amounts_non_negative" CHECK (
    "subtotal_cents" >= 0 AND
    "shipping_cents" >= 0 AND
    "tax_cents" >= 0 AND
    "discount_cents" >= 0 AND
    "total_cents" >= 0 AND
    "refunded_cents" >= 0
  )
);

CREATE INDEX "commerce_orders_created_at_idx"
  ON "commerce_orders" ("created_at");
CREATE INDEX "commerce_orders_email_idx"
  ON "commerce_orders" ("email");
CREATE INDEX "commerce_orders_status_idx"
  ON "commerce_orders" ("status", "fulfillment_status");
CREATE INDEX "commerce_orders_stripe_customer_idx"
  ON "commerce_orders" ("stripe_customer_id");

CREATE TABLE "commerce_order_items" (
  "id" text PRIMARY KEY,
  "order_id" text NOT NULL
    REFERENCES "commerce_orders"("id") ON DELETE CASCADE,
  "stripe_product_id" text NOT NULL,
  "stripe_price_id" text NOT NULL,
  "product_name" text NOT NULL,
  "price_name" text,
  "image_url" text,
  "quantity" integer NOT NULL,
  "unit_amount_cents" integer NOT NULL,
  "amount_total_cents" integer NOT NULL,
  "recurring_interval" text,
  CONSTRAINT "commerce_order_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "commerce_order_items_amounts_non_negative" CHECK (
    "unit_amount_cents" >= 0 AND "amount_total_cents" >= 0
  )
);

CREATE INDEX "commerce_order_items_order_id_idx"
  ON "commerce_order_items" ("order_id");

CREATE TABLE "commerce_subscriptions" (
  "id" text PRIMARY KEY,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "email" text NOT NULL,
  "stripe_customer_id" text NOT NULL,
  "stripe_subscription_id" text NOT NULL UNIQUE,
  "stripe_price_id" text,
  "status" text NOT NULL,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "current_period_end" timestamp with time zone
);

CREATE INDEX "commerce_subscriptions_email_idx"
  ON "commerce_subscriptions" ("email");
CREATE INDEX "commerce_subscriptions_customer_idx"
  ON "commerce_subscriptions" ("stripe_customer_id");

CREATE TABLE "stripe_webhook_events" (
  "stripe_event_id" text PRIMARY KEY,
  "event_type" text NOT NULL,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Rollback:
-- DROP TABLE "stripe_webhook_events";
-- DROP TABLE "commerce_subscriptions";
-- DROP TABLE "commerce_order_items";
-- DROP TABLE "commerce_orders";
-- DROP TABLE "commerce_inventory";
-- DROP TYPE "commerce_fulfillment_status";
-- DROP TYPE "commerce_order_status";
-- DROP TYPE "commerce_order_kind";
