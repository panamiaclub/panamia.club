# Payments Roadmap

How artists get paid for platform-allowed services on panamia.club, and how
Pana MIA sustains itself from that activity without becoming a bank.

This is a policy document. It records decisions, the reasoning behind them, and
the risks they create. Implementation detail — current code state, data model,
platform constraints, protocol mechanics — is collected in
[Technical notes](#technical-notes) at the end, so the policy reads without it.

**Scope.** Paid services rendered by one member to another: a booked mentoring
session today, workshops, commissions, and paid events later. Donations to Pana
MIA itself are a separate, already-shipped flow and appear here only where the
two interact.

**Greenfield.** No production payment data exists, no prior sessions need
backfilling, and no member has ever been charged. Every rename, schema shape,
and policy decision below is free to make correctly the first time. That will
not be true again.

> **Not legal or tax advice.** The statutory and regulatory citations below
> exist so that counsel and the organization's accountant have something
> concrete to react to — not as a substitute for that review. Several touch
> areas that have moved repeatedly in recent years; confirm currency before
> relying on any of them.

---

## Design principle: two payment methods, one service

A service offering can be settled by either of two payment methods. They are
not two implementations of one thing. They differ in who holds the money, what
happens when something goes wrong, who reports the income, and what the
organization is allowed to charge.

|                     | **Card payments** (Stripe)                 | **Lightning payments** (zaps)            |
| ------------------- | ------------------------------------------ | ---------------------------------------- |
| Currency            | US dollars                                 | Bitcoin, over the Lightning network      |
| Intermediary        | Stripe                                     | None — payer's wallet to artist's wallet |
| Pana MIA fee        | Yes                                        | **None, by design**                      |
| Who holds the funds | Stripe; Pana MIA is merchant of record     | Nobody — Pana MIA never touches them     |
| Reversible          | Yes — refunds and disputes                 | **No — irreversible**                    |
| Payment record      | Authoritative, held by Pana MIA            | Partial, observed only                   |
| Income reporting    | Stripe files the tax form                  | Nobody reports; artist's own obligation  |
| Artist onboarding   | Stripe identity verification, bank details | Obtain a wallet, paste its address       |

**The invariant that keeps this tractable: Pana MIA never holds member funds.**
With card payments, Stripe is the regulated intermediary. With Lightning
payments, Pana MIA is not in the payment path at all.

Lightning payments carry no Pana MIA fee. That is a deliberate choice rather
than an unfinished feature: a percentage cannot be enforced on a zap without
holding the money first, and the consequences of holding it are worse than the
forgone revenue. It does create a structural incentive problem, which is the
single most important thing in this document — see
[Risk 1](#risk-1-fee-avoidance).

### Why Pana MIA does not issue `member@panamia.club` Lightning Addresses

Pana MIA already runs the community relay, serves Nostr identity lookups at
`panamia.club`, and walks members through Nostr onboarding. It feels natural
that Lightning Addresses would be the next thing served from the same place.

**The resemblance is misleading.** The two lookups share a `user@domain` shape
and live in adjacent locations on the server, and share nothing else:

- **Nostr identity (NIP-05)** returns a _name-to-public-key mapping_. It is an
  assertion about who someone is. No money exists anywhere in the flow.
- **A Lightning Address (LUD-16)** returns _a way to generate an invoice_.
  Whoever operates that endpoint decides which wallet gets paid.

Hosting the first creates no technical or legal momentum toward the second.
Serving identity is free. Serving invoices is a financial-services decision.

Two real options:

|                            | **Artist brings their own** | **Pana MIA issues and holds**                 |
| -------------------------- | --------------------------- | --------------------------------------------- |
| Address shown              | `alice@getalby.com`         | `alice@panamia.club`                           |
| Who generates the invoice  | artist's wallet provider    | **Pana MIA**                                  |
| Who receives the bitcoin   | artist                      | **Pana MIA**                                  |
| Is this money transmission | no                          | **yes**                                       |
| Solves wallet onboarding   | no                          | yes                                           |
| Platform fee possible      | no                          | yes                                           |
| Ongoing operations         | none                        | a payment node, liquidity, a hot wallet, 24/7 |

A third arrangement is technically possible and not worth pursuing: hosting
`alice@panamia.club` as a pass-through to the artist's real address without ever
holding funds. The protocols force such a pass-through to be almost entirely
transparent, so it buys the appearance of a unified identity and no actual
control, while making panamia.club a point of failure in a payment path it does
not operate. Mechanics in [Note 4](#note-4-lightning-address-mechanics).

**Issuing and holding is money transmission.** Receiving funds from a payer in
order to pass them to a payee is the definition, and the crypto-specific
overlays are settled enough to plan against:

- **Federal.** Registration as a _money services business_ (MSB) with the
  Financial Crimes Enforcement Network (FinCEN), the Treasury bureau that
  administers anti-money-laundering rules. FinCEN's 2019 guidance on
  convertible virtual currency treats wallet providers that control customer
  funds as money transmitters.
- **Florida.** Pana MIA is Florida-based. Money services businesses are
  licensed under Florida Statutes chapter 560 through the Office of Financial
  Regulation; virtual currency was brought into those definitions by a 2022
  amendment. Expect a surety bond, a minimum net worth requirement, and
  background checks on principals.
- **Compliance program.** An anti-money-laundering (AML) program,
  know-your-customer (KYC) identity verification on members, suspicious
  activity report (SAR) filing, sanctions screening against Office of Foreign
  Assets Control (OFAC) lists, and recordkeeping.
- **Tax.** Pana MIA would likely become the entity that must file income
  reports on members' earnings — see [Tax posture](#tax-and-reporting-posture).
- **Operations.** Hot wallet security, payment channel liquidity management, an
  always-on node that cannot run on the current platform, and the fact that a
  security breach means member funds are gone and owed.

For an organization of this size, that is a decision to become a financial
services company, not a feature to add. It stays closed absent deliberate,
counsel-led intent.

**Decision: artists bring their own Lightning Address, and Pana MIA guides
them to one.**

The real friction is not pasting an address — it is that the artist must first
obtain a wallet that supports Lightning Addresses at all, and taking custody is
not the cheapest way to solve that. Recommend two or three providers, deep-link
the signup, verify the address works when it is saved, and re-check it
periodically. That captures most of the onboarding benefit at none of the
exposure.

---

## Pricing policy

An artist states the take-home they want for a session and chooses which
payment methods they accept: **card only**, **Lightning only**, **both**, or
**free** (neither, no price). The platform derives one advertised price from
that.

### Per session, not per hour

The advertised figure becomes a **session rate**, where a session is a
platform-defined unit of roughly sixty minutes, rather than an hourly rate. The
booking record already carries a duration defaulting to sixty minutes; keep
that as the canonical session length and stop letting it vary per booking, so
price and duration cannot disagree. Rename scope is in
[Note 5](#note-5-session-rate-rename-scope).

### The artist sets take-home; the platform derives the price

The artist enters **the dollar amount they want in their pocket for a
session**. The platform grosses that up and publishes one advertised price,
identical for both payment methods.

Letting artists set a different advertised price per method is not an option.
An artist nets less on a card payment (platform fee plus card processing) than
on a Lightning payment (no fee), so a higher card price would be a card
surcharge — and **Pana MIA is the merchant of record on card payments**, so
card network surcharge rules and state surcharge restrictions would bind Pana
MIA rather than the artist who set the number. It would also put the platform
fee on the buyer's checkout screen as a line item, which is
[Risk 1](#risk-1-fee-avoidance) at the worst possible moment.

**Derivation.** Gross up for the _most expensive method the artist accepts_, so
the stated take-home is a floor honored whichever way the buyer pays:

| Methods accepted                 | Advertised price                                          |
| -------------------------------- | --------------------------------------------------------- |
| Card (with or without Lightning) | take-home grossed up for platform fee and card processing |
| Lightning only                   | take-home                                                 |
| Neither (free)                   | no price                                                  |

Round the result **up** to a presentable figure; rounding down breaks the
take-home floor. Store the artist's stated take-home as the canonical number
and the derived price alongside it, so a later change to the fee is a
deliberate re-derivation rather than an ambiguity.

**A consequence worth stating plainly:** an artist who accepts both methods
nets exactly their target on card payments and _more_ than their target on
Lightning payments. The artist's edit screen should show both figures rather
than hide the difference. That is honest, and it puts the pressure described in
Risk 1 where it belongs — visible to the artist. It is not a pricing bug to be
fixed. It is the economics, and the answer is Risk 1's, not the price model's.

### Price is locked at confirmation

When the artist confirms a booking, the price is fixed and recorded: the dollar
amount, the payment method, and the timestamp. For Lightning payments, the
bitcoin amount and the exchange rate used are recorded at the same moment.

**Dollars are the unit of account; the bitcoin amount is computed once, at
confirmation.** The buyer owes the amount quoted then, and **the artist bears
any exchange rate movement** between confirmation and payment. The dollar
figure is always stored alongside the bitcoin figure, so a record can be
reconstructed in dollars later.

---

## Card payments — Stripe Connect

### Artists get Stripe-managed accounts

Stripe hosts the onboarding, collects the artist's tax identification and bank
details, verifies identity, and — the part that carries real weight — issues
the artist's income tax forms. Pana MIA never stores a member's Social Security
or employer identification number, and artists get a Stripe-hosted earnings
dashboard that nobody here has to build.

The alternatives are worse in both directions: a lighter integration gives away
too much control over the buyer relationship, and a heavier one puts identity
verification, dispute handling, and tax reporting back on Pana MIA.

### Money moves when the session does

The money follows the booking's existing lifecycle rather than settling all at
once when the card clears:

| Booking event         | What happens to the money                           |
| --------------------- | --------------------------------------------------- |
| Booked                | Charged and held by Pana MIA's Stripe account       |
| Confirmed             | Price locked; funds still held                      |
| Completed             | Paid out to the artist, less the platform fee       |
| Cancelled or declined | Refunded to the buyer; **the artist is never paid** |

The alternative — splitting the payment the instant the card clears — pays the
artist before the session happens, which breaks on every cancellation and
no-show. Holding until completion also means the platform fee is arithmetic
applied at payout, so it can vary by artist status or promotion without
touching checkout.

**Accepted trade-off:** Pana MIA is the merchant of record. Pana MIA absorbs
chargebacks, and the buyer's card statement shows Pana MIA rather than the
artist. For a platform that curates which services may be listed, that is the
coherent posture — but see [Risk 6](#risk-6-chargeback-exposure).

---

## Lightning payments — zaps

### Artists bring their own address

A single profile field — the artist's Lightning Address — published alongside
their existing Nostr identity makes them payable by every Nostr client in
existence. Pana MIA takes nothing, holds nothing, generates no invoices, and
has no money transmission exposure.

Pair it with the guided provider onboarding described above: verify the address
works when it is saved, and re-check periodically, because the platform cannot
otherwise tell that an address has gone dead.

### Payment is due on completion, not at booking

Because Lightning payments cannot be reversed, a booking settled this way
inverts the usual order. A prepaid zap for a session that later gets cancelled
has no remedy inside the platform.

The flow: the session is booked unpaid, the price is locked at confirmation in
both dollars and bitcoin, the session happens, and only then is the buyer shown
the artist's address and the amount owed. The booking is marked settled when a
matching payment receipt is observed on the community relay, or manually by the
artist.

That last clause is deliberately weak, and has to be: **Pana MIA cannot verify
a payment it did not handle.** The record of a Lightning-settled service is
advisory, and every part of the product needs to treat it that way.

### Observed payment history — scope it carefully, or not at all

Nostr payment receipts arriving at the community relay could be indexed to give
artists an earnings view and Pana MIA aggregate analytics, without touching any
money. It is also the most legally exposed _optional_ thing in this document,
for reasons that are not obvious — see
[Risk 5](#risk-5-observed-payment-history-is-a-liability) and the tax section.

Short version: those receipts are already public. The receipts are not the
sensitive part. **The correlation is.** A table linking a member's platform
account to their Nostr public key to the amounts they were paid is an artifact
that does not exist until Pana MIA builds it, it works against the
correlation-resistance goals in the Resilience roadmap, and it is reachable by
subpoena.

If it is built at all: visible only to the artist it concerns, opt-in, no
cross-member aggregate view, short retention, and labeled everywhere as "zaps
seen on the Pana MIA relay" rather than "earnings." If the actual motivation is
platform analytics, totals that carry no member identity satisfy that at none
of the cost.

### Why there is no Pana MIA fee on Lightning payments

The Nostr protocol does define payment splits, but they are honored by the
_sending_ app. An app that ignores a split sends the whole amount to the
artist, and nothing rejects that payment. A fee cannot be built on a split that
any wallet is free to skip. The only way to enforce one is to receive the money
first, which is the custodial path closed above.

**Deferred, not rejected:** an emerging Nostr standard lets a platform request
payment from a member's _own_ wallet under a spending limit they grant — no
custody, no held funds, and it works for paying members as well as charging
them. If Lightning payments ever need to be richer than "paste an address,"
that is what to evaluate, not a custodial service.

---

## Organizational status

Pana MIA Club is a 501(c)(3) public charity — employer identification number
(EIN) 92-3838133, classified under Internal Revenue Code section
170(b)(1)(A)(vi). That is the _publicly supported_ charity classification, and
it is load-bearing for everything below that touches revenue.

### The public support test, not the tax bill, is the sharp edge

A 170(b)(1)(A)(vi) organization has to keep passing a public support test:
broadly, that enough of its total support comes from the general public rather
than from a narrow set of sources, measured over a rolling multi-year window.
Fee revenue lands differently depending on a single determination:

- **If the fee is related program service revenue** — substantially related to
  the charitable purpose — receipts from it are generally excluded from the
  support calculation altogether. Neutral: it neither helps nor hurts the
  classification.
- **If it is unrelated business income**, the net enters the _denominator_ of
  the support fraction. It adds nothing to public support while diluting the
  percentage, so a growing unrelated revenue stream can erode the ratio and,
  past a threshold, threaten reclassification as a private foundation.

The second outcome is materially worse than owing unrelated business income tax
(UBIT) on the money. UBIT is a tax bill. Reclassification changes what the
organization is, and unwinding it is slow.

The determination is a facts-and-circumstances question, and there is a genuine
argument for "related" if sustaining local artists' livelihoods is the
charitable purpose. It needs a written opinion from an accountant or
exempt-organizations counsel rather than an assumption, and it should be
obtained **before money starts moving** — not discovered at the next Form 990.

### Unrelated: the donation page

With 501(c)(3) status confirmed, the donation page carrying no
tax-deductibility language and no EIN is a gap worth closing independently of
this roadmap. Donors generally want both.

---

## Tax and reporting posture

The question this section answers: _does an observed record of Lightning
payments create an obligation to the IRS, or expose the organization to one?_

**Filing obligations: no. Compulsory process: yes.** Those are different
exposures and worth keeping apart.

### Forms Pana MIA would have to file: none, for Lightning payments

- **Form 1099-K** is filed by a payment settlement entity. For an organization
  in the middle of a payment network, the operative test is whether it has the
  _contractual obligation to pay_ the person receiving the money. When the
  artist brings their own address, bitcoin moves payer-to-artist and Pana MIA
  has no such obligation, so no 1099-K.
  Under the custodial arrangement closed above, Pana MIA very likely _would_
  become a third-party settlement organization with exactly this filing
  obligation — an under-appreciated additional cost of that path.
- **Form 1099-NEC** is filed by whoever pays for services in the course of a
  trade or business. Pana MIA is not the payer. A member paying for personal
  mentoring is generally not acting in a trade or business either.
- **Card payments.** Stripe is the settlement entity and files the 1099-K. Pana
  MIA does not.

No information return is triggered by keeping the record.

### Compulsory process it would answer: yes, specifically

- **Internal Revenue Code section 7602** gives the IRS broad authority to
  summons "books, papers, records, or other data" relevant to determining a tax
  liability.
- **Section 7609(f) — the "John Doe" summons** — is the mechanism actually used
  against cryptocurrency intermediaries: Coinbase in 2016, and later Kraken and
  Circle. It names no taxpayer; it describes a class of them. A table linking
  platform identities to Nostr public keys to payment amounts is squarely the
  kind of record these have sought.
- **An ordinary third-party summons** naming a specific member.
- **State revenue agencies**, and ordinary **civil subpoena** — creditors,
  dissolution proceedings, any litigation where a member's income is at issue.

Building that record therefore creates a compliance artifact and a
deanonymization vector that would not otherwise exist, in exchange for a
convenience feature. That trade may still be worth making. It should be made
knowingly.

### What members owe

Pana MIA files nothing for Lightning payments, but the product must not imply
that nothing is owed.

- **Cryptocurrency received for services is ordinary income at fair market
  value on the day it is received** — IRS Notice 2014-21 and Revenue Ruling
  2019-24. This is not a "may be taxable" situation. It is income.
- **Large-payment reporting.** A 2021 statute extended the existing
  $10,000-cash reporting rule to digital assets received in a trade or
  business. Treasury suspended that requirement pending regulations in
  Announcement 2024-4. Unsettled — note it, do not design around it, and build
  nothing that resembles helping members stay under a threshold.

### What the terms of service should say

The terms already have a payments section and a mentoring section scaffolded
with item lists and unwritten bodies; the payments list already promises a
refund policy and seven-year record retention, and the mentoring list already
promises rate expectations and a cancellation policy. That is where this goes.

State plainly: Pana MIA issues no tax form for Lightning payments;
cryptocurrency received for services is generally ordinary income at fair
market value when received under existing IRS guidance; members should consult
a tax professional.

**Avoid "may be considered taxable."** The hedge reads as reassurance, and
understating a known position in the terms is its own small risk.

---

## Sequencing

**Phase 0 — Session rate rename.** Land the per-session semantics before any
price appears next to a pay button. Greenfield, no data migration.

**Phase 1 — Lightning payments, minimum.** The Lightning Address profile field,
published with the member's Nostr identity and preserved across key rotation,
plus guided provider onboarding and address verification. Small, independent,
no custody.

**Phase 2 — Stripe artist onboarding.** Connected accounts and identity
verification, behind an admin flag. This is the long pole: identity
verification has real-world latency, and several artists should be through it
before anything depends on it.

**Phase 3 — Service offerings.** Pricing moves out of the profile blob into a
first-class record with per-method acceptance. **Risk 1 must be answered before
this ships.**

**Phase 4 — Charge at booking.** The payment ledger, the hold on Pana MIA's
Stripe account, and the confirmation price lock. **Blocked on
[Risk 11](#risk-11-account-deletion-versus-financial-retention) and
[Risk 14](#risk-14-revenue-classification-and-the-public-support-test).**

**Phase 5 — Pay out on completion.** Refund paths for cancellations and
declines. Last and easiest once the ledger exists.

**Phase 6 — Observed Lightning history.** Optional, and only after the scoping
decision in Risk 5 is made explicitly.

---

## Risks

### Risk 1. Fee avoidance

**The most important item in this document.**

Both methods settle the same service, and only one carries a fee. Every
rational artist therefore steers buyers to Lightning — "book here, but pay me
this other way." Pana MIA's revenue tends toward zero while it continues to
bear the cost of the booking system, the disputes, the compliance, and the
support load.

This is not hypothetical or slow-acting. It is the predictable equilibrium, and
it arrives as soon as artists notice. Deriving the advertised price from
take-home makes it arrive sooner, because the artist's edit screen now states
the gap in dollars.

**The decision this forces.** This section is not advisory. Before both methods
can be enabled on a single offering, someone has to answer _what the card
payment fee buys_. If the answer is nothing, the fee is fiction and artists
will route around it. Two viable answers, not mutually exclusive:

- **Differentiate by value.** Dispute protection, a guaranteed refund on
  cancellation, verified completion history, calendar and reminder
  infrastructure, tax forms, and the buyer trust that a stranger's Lightning
  Address cannot offer. The fee then buys something Lightning structurally
  cannot. This is the version to aim for.
- **Restrict by price.** Above some amount, card payment is required; Lightning
  stays for tips and lower-value services. Enforceable in the data model, but
  arbitrary-feeling and easy to route around off-platform.

**One option considered and rejected: fund the gap from donations.** An earlier
draft listed this as accepting the shortfall as subsidy — treat
Lightning-settled services as a community good underwritten by contributions,
and stop modeling the forgone fee as lost revenue. It is off the table. Using
contributed funds to underwrite individual members' commercial transactions is
private benefit, and it misapplies donor intent regardless of how the
accounting is presented. Donations stay donations — designated as general
support or directed to specific projects — and are never backfill for a forgone
fee. See [Organizational status](#organizational-status).

**Decision point: Phase 3**, when the two acceptance settings first become
independently settable. Not Phase 4 — by the time money moves, the answer needs
to already be in the product.

### Risk 2. Custody drift

The no-custody invariant holds only as long as nobody implements an
obvious-seeming convenience. Each of these quietly breaks it: holding bitcoin
"just until the session completes"; issuing `member@panamia.club` addresses
backed by a Pana MIA wallet; an internal balance members accrue and withdraw;
splitting a payment on the server.

Any of them makes Pana MIA a money transmitter and a custodian of member funds,
with federal registration, Florida licensing, a compliance program, and a hot
wallet to secure. Treat the invariant as architectural, and route any proposal
that touches it through counsel before it reaches a sprint.

### Risk 3. Lightning payments cannot be reversed

Bookings can be cancelled, declined, or no-showed. Card payments can be
refunded in all three cases. Lightning payments cannot be clawed back by
anyone, ever.

Settling on completion rather than at booking removes most of this, but the
residual case — the session happens and the buyer is dissatisfied — has no
recourse. State it plainly in the interface at the moment of payment and in the
mentoring terms, not buried. Pana MIA cannot adjudicate a dispute over a
payment it did not handle and cannot see.

### Risk 4. Exchange rate drift

Resolved by policy: dollars are the unit of account, the bitcoin amount is
computed once at confirmation, and the artist bears the movement between
confirmation and payment.

Residual: the movement is unbounded. A session confirmed a month out during a
volatile week can settle well away from the artist's intended price. Consider
capping how long a Lightning-settled booking can sit between confirmation and
payment, or re-quoting past a threshold — and if re-quoting, say so at
confirmation rather than surprising the buyer later. Always store the dollar
figure alongside the bitcoin figure; a record with only bitcoin cannot be
reconstructed.

### Risk 5. Observed payment history is a liability

Observed receipts are partial evidence, not a ledger: incomplete, unverifiable
as complete, and absent entirely when a sending app publishes no receipt or the
artist's wallet provider emits none.

Do not build reputation scores, "verified earnings" badges, tax documents, or
dispute adjudication on top of them.

The larger issue is that the record is **discoverable**. The receipts
themselves are already public; the sensitive artifact is the correlation
between platform identity, public key, and amount, which exists only because
Pana MIA created it. That is exactly the record a John Doe summons has
historically sought from cryptocurrency intermediaries, and it is equally
reachable by civil subpoena. It also cuts against the correlation-resistance
posture the Resilience roadmap treats as a design goal.

If built: artist-private, opt-in, no cross-member aggregate, short retention,
and labeled as observed rather than authoritative. If the only real driver is
platform analytics, totals carrying no member identity have none of this cost.

### Risk 6. Chargeback exposure

Holding funds and paying out later means Pana MIA is the merchant of record. If
a buyer disputes a charge weeks after the artist has been paid, Pana MIA
absorbs the loss on money it has already sent onward — the classic marketplace
loss vector, and the mechanism behind most marketplace fraud.

Design these in from the start rather than retrofitting them: a delay between
session completion and payout; a held reserve on new or high-dispute artists;
per-artist dispute-rate monitoring with automatic suspension; and a ceiling on
offering price until an artist has a settled history.

### Risk 7. Stripe onboarding drop-off

Identity verification has real abandonment. Some artists will not finish it,
and some will decline to give a payment processor their Social Security number
at all.

Two consequences: the interface must check onboarding status so a card booking
is never offered for an artist who cannot receive one, and Lightning becomes
the natural escape hatch for everyone who opts out — feeding directly back into
[Risk 1](#risk-1-fee-avoidance).

### Risk 8. Tax reporting asymmetry

Card payment income is reported to the IRS by Stripe. Lightning income is
reported by nobody. The platform must not give tax advice, but must equally not
imply through interface design or silence that Lightning income is untaxed. See
[what the terms should say](#what-the-terms-of-service-should-say).

### Risk 9. Facilitation posture on Lightning payments

Passively hosting an address field is a different posture from advertising a
priced service, quoting an amount, and presenting a payment step for it. The
second looks more like facilitating a transaction, even with no funds touched
and no fee taken. Lightning is permissionless, so the counterparty can be
anyone, anywhere, with no sanctions screening in the path.

Exposure is plausibly low, but the difference between a profile field (Phase 1)
and a checkout step (Phase 4) is exactly the kind of thing worth a legal read
before it ships rather than after.

### Risk 10. Free-tier erosion

Community planning sessions are documented as always free, and free-mentor
filtering already exists in discovery. Payment methods create steady pressure
to price what is currently free, and a validation gap could attach a price to a
session type that must not have one.

Enforce free-by-type in the data model, not only in the interface, so no code
path can attach a payment to a session type declared free.

### Risk 11. Account deletion versus financial retention

The account deletion flow currently cancels subscriptions and **deletes the
member's Stripe customer record outright**. Greenfield means nothing is at risk
today — but the code is already written, and once payments exist it destroys
records needed for tax, audit, and dispute defense. An artist account with
payout history cannot be discarded the way a donor record can.

The data inventory already has a category for compliance records retained after
account deletion by design; payment records belong there, and the terms already
promise seven-year retention. The deletion flow, the pre-deletion disclosure,
and the privacy documentation all need updating **before Phase 4**. This is a
conflict between two already-shipped positions, not a new feature. Detail in
[Note 3](#note-3-platform-constraints).

### Risk 12. Platform runtime constraints

The deployment environment is unforgiving of chatty third-party calls inside a
request, and webhook handlers must tolerate being delivered the same event
twice without paying anyone twice. Neither is exotic, but both are the kind of
thing that produces a money bug rather than a rendering bug. Specifics in
[Note 3](#note-3-platform-constraints).

### Risk 13. Lightning Address drift

A Lightning payment is addressed to whatever the member published, in a record
only that member can sign. Key rotation already ships. If a rotation republishes
the member's identity without the Lightning Address, the artist silently
becomes unpayable; if their wallet provider lapses, payments fail or misroute
with no signal to the platform.

Include the address in the rotation path, verify it on save, and re-check
periodically. The platform cannot detect a misrouted payment — only an
unreachable address.

### Risk 14. Revenue classification and the public support test

Taking a fee on member-to-member commercial transactions raises questions for a
501(c)(3) public charity that do not arise for a commercial marketplace. The
mechanics are under [Organizational status](#organizational-status); the risk
is:

- **Classification erosion.** If the fee is unrelated business income rather
  than related program service revenue, it dilutes the public support fraction
  as it grows. The failure mode is not a tax bill — it is reclassification as a
  private foundation.
- **Private benefit.** Helping individual members earn is generally fine when
  it serves the charitable class broadly; it becomes a problem when contributed
  funds subsidize it, which is why Risk 1's donation-subsidy option is
  rejected.
- **Accounting separation.** Donation revenue and service fee revenue need
  clean separation from the start. Donation records should not commingle with
  the payment ledger, and Form 990 will want them distinguishable.

**Get the determination in writing before Phase 4.** It sets the fee ceiling: a
"related" opinion makes fee growth harmless to the classification, an
"unrelated" one makes fee revenue something to cap and monitor against the
support ratio rather than maximize.

---

## Open questions

1. **Is fee revenue related or unrelated** to the charitable purpose? Needs a
   written opinion from an accountant or exempt-organizations counsel. Gates
   Risk 14 and sets the ceiling on the fee rate.
2. **What is the fee rate**, and does it vary by member verification status or
   offering type? Constrained by question 1.
3. **Is observed Lightning history worth building at all**, given Risk 5?
   Decide before Phase 6 rather than during it.
4. **Is there a price above which card payment is required?** This is Risk 1's
   second answer and needs a number or an explicit no.
5. **How long may a confirmed Lightning booking wait** before payment, per
   Risk 4?
6. **Which wallet providers should onboarding recommend**, and are any of them
   stable enough to name in the interface?

---

## Technical notes

Implementation detail, separated so the policy above reads without it.

### Note 1. Current implementation status

**Shipped**

- Stripe SDK (`stripe@22.6.0`) and `STRIPE_SECRET_KEY` in `lib/env.config.ts`
- Donation checkout — `app/api/create-checkout-session/route.ts`, settling to
  Pana MIA's own account
- Stripe subscription-to-CRM relay in
  `external/panamia-next-crm-bridge/src/handlers/webhook-stripe.ts`, with
  hand-rolled WebCrypto signature verification
- `profiles.stripeCustomerId`, consumed by the account-deletion flow
- `mentorSessions` (`lib/schema/index.ts:854`) — the full booking state
  machine: `pending → confirmed → completed / cancelled / declined`, both party
  user IDs, `duration` (integer, default 60), session type
- `profiles.mentoring.hourlyRate` — displayed at
  `app/p/[user]/_components/mentoring-section.tsx:29`, decorative only
- Free-mentor filtering — `app/api/mentoring/discover/route.ts:46`,
  `lib/server/directory.ts:124`
- Terms module scaffolding — `app/legal/terms/module-content.tsx`, `payments`
  at :120 and `mentoring` at :67, both with item lists and `placeholder` bodies
- Nostr identity — `profiles.nostrPubkey`, NIP-05 at
  `app/.well-known/nostr.json`, key rotation at `app/api/relay/rotate`

**Not yet built**

- Any link between a booking and a payment. `mentorSessions` has no money
  column; `hourlyRate` is never charged.
- Stripe Connect — no connected accounts, no onboarding, no transfers
- A Stripe webhook route in `app/api` (only the CRM bridge has one)
- A payment ledger of any kind
- The `lud16` field. `lib/nostr/relay-identity-events.ts:34` builds kind 0
  content as `name` / `display_name` / `nip05` / `about` / `picture` only —
  **no Pana MIA artist is payable over Lightning today**, by any client.
- Payment receipt indexing. `lib/nostr/kinds.ts:35-36` knows kinds 9734/9735 by
  name for the abuse-report interface; nothing consumes them.
- Service offerings as a first-class model — pricing lives in profile `jsonb`
- Written payments and mentoring terms (both bodies are placeholders)

### Note 2. Data model

**`connect_accounts`** — `userId`, `stripeAccountId`, `chargesEnabled`,
`payoutsEnabled`, `onboardingCompletedAt`, `detailsSubmittedAt`.

The two booleans gate whether an artist may accept card payments at all. Sync
them from `account.updated` webhooks rather than calling Stripe during page
render; see Note 3.

**`service_offerings`** — `profileId`, `kind` (pgEnum: `mentoring`,
`workshop`, `commission`, …), `takeHomeCents` (artist input, canonical),
`sessionRateCents` (derived, cached for display and search), `acceptsStripe`,
`acceptsZaps`, `active`.

Generalizing beyond mentoring now, while nothing depends on it, avoids a
migration later. The fee percentage and card processing constants used in the
derivation belong in a hardcoded constant rather than environment config, per
the project's standing preference against new environment variables.

**`payments`** — append-only ledger: `offeringId`, `sessionId`,
`payerUserId`, `payeeUserId`, `method` (`stripe` | `zap`), `grossCents`,
`feeCents`, `netCents`, `stripePaymentIntentId`, `stripeTransferId`,
`stripeRefundId`, `status`, timestamps.

Stripe is the source of truth for money; this table is the source of truth for
history. Dashboards, earnings views, dispute research, and revenue reporting
become local SQL instead of paginated Stripe API calls — which matters more
here than usual given the pooling constraints in Note 3.

**Confirmation quote columns on `mentorSessions`** — `quotedAmountCents`,
`quotedMethod`, `quotedAt`, plus `quotedSats`, `fxRate`, `fxSource` for
Lightning. Plus `paymentId` as a nullable foreign key, so free sessions keep
working exactly as they do today and paid sessions are the same row with a
payment attached.

### Note 3. Platform constraints

Cloudflare Workers, with a `max:1` Hyperdrive connection pool.

1. **Webhook signature verification must use the async API**
   (`stripe.webhooks.constructEventAsync`). The synchronous variant needs
   Node's synchronous crypto and throws under Workers. The CRM bridge sidesteps
   this by hand-rolling WebCrypto verification; in the main app, use the SDK's
   async method.
2. **Verify the Stripe SDK's HTTP client resolves under the Vinext Workers
   build.** Recent `stripe-node` auto-detects the fetch client and the donation
   route configures none — but that route may never have been exercised on the
   deployed worker. Fallback is `httpClient: Stripe.createFetchHttpClient()`.
   Confirm before building on it.
3. **Idempotency key on every payout**, derived from the session id. Webhook
   redelivery is routine, and paying an artist twice is the one bug here that
   costs real money with no automatic remedy. Ledger writes should key on the
   Stripe object id rather than assuming at-most-once delivery.
4. **Webhook events to handle**: `account.updated`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `transfer.*`, `charge.dispute.created`.
5. **Never call Stripe during page render.** A `max:1` pool plus a chatty
   third-party call inside a request is precisely the shape that caused the
   better-auth join hang. Keep Stripe state denormalized locally and refresh it
   from webhooks.
6. **Account deletion** — `lib/server/delete-account.ts:713-726` deletes the
   Stripe customer; the pre-deletion disclosure is at
   `app/api/account/delete-preflight/route.ts:190`; the retained-records
   category is at `lib/legal/data-inventory.ts:105`. See Risk 11.

### Note 4. Lightning Address mechanics

Why a non-custodial pass-through at `panamia.club` buys nothing:

- The LNURL `metadata` string is hashed into the invoice's `description_hash`,
  so a pass-through must forward the upstream metadata verbatim or wallets
  reject the invoice as mismatched.
- NIP-57 requires the `nostrPubkey` in the LNURL response to be the service
  that signs the payment receipt, which must also be forwarded — so receipts
  are signed by the upstream provider, not by Pana MIA.

The result is an almost entirely transparent proxy: the address members publish
reads `alice@panamia.club`, and Pana MIA controls nothing about the payment
while becoming a dependency in its path.

**Insertion point for the artist's own address:** add
`profiles.lightningAddress` and thread it into `buildMetadataContent` in
`lib/nostr/relay-identity-events.ts:34`, which currently emits only `name`,
`display_name`, `nip05`, `about`, and `picture`. The same function is the
rotation re-seed path referenced in Risk 13.

### Note 5. Session rate rename scope

`profiles.mentoring.hourlyRate` becomes `sessionRate` across 13 call sites:
`lib/interfaces.ts:86`, `lib/validations/mentoring-profile.ts:13`,
`lib/profile.ts:79`, `lib/server/directory.ts:116,208`,
`app/api/mentoring/discover/route.ts:46`,
`app/api/mentoring/profile/route.ts:24,56`, `app/m/profile/page.tsx:81`,
`app/m/profile/edit/page.tsx:33`,
`app/m/profile/edit/_components/profile-form.tsx:47,259,265`,
`app/m/discover/_components/mentor-card.tsx:17,40`, and
`app/p/[user]/_components/mentoring-section.tsx:14,29`.

The field moves to `service_offerings` at Phase 3 regardless, so the near-term
rename exists only to stop `/hour` appearing in the interface before pricing
goes live. Cheap now, greenfield.
