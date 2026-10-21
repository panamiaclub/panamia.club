-- Migration: 0065_seed_shop_inventory
-- Purpose: Seed the first two live physical Stripe prices with their current
--          inventory so the catalog can launch without an out-of-stock gap.
-- Ticket: N/A
-- Reversible: Yes

INSERT INTO "commerce_inventory" (
  "stripe_price_id",
  "stripe_product_id",
  "available_quantity",
  "reserved_quantity",
  "track_inventory"
) VALUES
  (
    'price_1ShY5BFQMrF4loNwq6mMqTBm',
    'prod_Teroyqw4c8FaTJ',
    5,
    0,
    true
  ),
  (
    'price_1ShY2lFQMrF4loNwAuVtkml8',
    'prod_TermlOljzg0xxQ',
    5,
    0,
    true
  )
ON CONFLICT ("stripe_price_id") DO NOTHING;

-- Rollback:
-- DELETE FROM "commerce_inventory"
-- WHERE "stripe_price_id" IN (
--   'price_1ShY5BFQMrF4loNwq6mMqTBm',
--   'price_1ShY2lFQMrF4loNwAuVtkml8'
-- );
