-- Migration: 0075_billing_customers
-- Purpose: Preserve verified billing ownership across email changes and guest gifts.
-- Ticket: N/A
-- Reversible: Yes. Drop only the new billing_customers table.
-- Rollback: DROP TABLE IF EXISTS billing_customers;

CREATE TABLE IF NOT EXISTS "billing_customers" (
  "stripe_customer_id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_customers_user_idx"
  ON "billing_customers" ("user_id");
--> statement-breakpoint

-- Conflicting legacy links must not arbitrarily transfer billing ownership.
INSERT INTO "billing_customers" ("stripe_customer_id", "user_id")
SELECT "stripe_customer_id", min("user_id")
FROM (
  SELECT "stripe_customer_id", "user_id" FROM "profiles"
  WHERE "stripe_customer_id" IS NOT NULL AND "user_id" IS NOT NULL
  UNION
  SELECT "stripe_customer_id", "user_id" FROM "commerce_subscriptions"
  WHERE "user_id" IS NOT NULL
) AS legacy
GROUP BY "stripe_customer_id"
HAVING count(DISTINCT "user_id") = 1
ON CONFLICT ("stripe_customer_id") DO NOTHING;
--> statement-breakpoint

ALTER TABLE "billing_customers" ENABLE ROW LEVEL SECURITY;
