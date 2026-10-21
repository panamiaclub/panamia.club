# Shop

The shop at `/shop` is part of this application. Stripe is authoritative for
products, prices, Checkout, subscriptions, refunds, and the Customer Portal.
Postgres is authoritative for inventory reservations, orders, fulfillment,
subscription projections, and processed webhook IDs. GoHighLevel remains an
optional CRM destination.

While the real catalog is being prepared, `SHOP_USE_MOCK_PRODUCTS=1` replaces
the Stripe catalog with a clearly labeled, non-purchasable preview collection.
Set it to `0` or remove it to expose live Stripe products.

## Stripe product setup

Create products and prices in Stripe. Active USD one-time prices appear as
merchandise; active monthly or annual recurring prices appear as memberships.

Supported product metadata:

| Key                    | Meaning                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `slug`                 | Optional stable `/shop/<slug>` path; defaults to product ID    |
| `shop_visible=false`   | Hides the product without deactivating it                      |
| `track_inventory=true` | Requires local inventory and prevents checkout at zero stock   |
| `inventory_quantity`   | Initial quantity imported the first time staff syncs the price |

Product name, description, image, active state, and prices are edited in
Stripe. After adding a physical product, open `/admin/shop`, choose **Sync
Stripe inventory**, and set the available quantity.

## Checkout rules

Merchandise and memberships intentionally use separate carts:

- Merchandise uses Stripe payment mode, collects a US or Puerto Rico shipping
  address, offers the configured shipping rates, and reserves local stock for
  30 minutes.
- Memberships use Stripe subscription mode and allow one plan per checkout.
- Cards and supported wallets are controlled by the Stripe payment-method
  configuration. Apple Pay and Google Pay appear when the customer and browser
  are eligible.

Configure:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

Merchandise Checkout defines two inline options: $5 Standard shipping with a
3–7 business day estimate, and free Local pickup. No reusable Stripe Shipping
Rate IDs are required.

Register `/api/shop/webhook` for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `charge.refunded`

The webhook is idempotent. A failed handler removes its event claim so Stripe
can retry it.

## Operations

`/admin/shop` lets admins synchronize Stripe prices, maintain quantities, view
orders, and record fulfillment and tracking. Refunds stay in the Stripe
Dashboard; `charge.refunded` updates the local order projection.

Successful buyers are optionally upserted into GoHighLevel and tagged:

- `panamia-shop-customer`
- `panamia-shop-subscriber`

If HighLevel is unavailable or unconfigured, checkout and webhook processing
continue and the CRM error is logged.
