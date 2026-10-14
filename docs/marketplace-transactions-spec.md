# Marketplace transactions spec (orders, payments, feedback)

**Status:** approved 2026-10-14. Tony accepted every recommended default (D1 to D20). PRs a to g are built in migrations 0066, 0068, 0070, 0071, 0072, 0073, and 0074; PR h follows.
**Builds on:** [MARKETPLACE.md](MARKETPLACE.md) (current state), [marketplace-v2-build-brief.md](marketplace-v2-build-brief.md) (plan of record; this doc replaces its Phase 4 and the ratings/limits half of Phase 5).
**Model:** Discogs. Every sale is an order for one physical copy, with a strict lifecycle, managed payments, an order thread, two-way feedback and seller standards.

---

## 1. Founder decisions

Answer yes to take the recommended default, or give a different value.

| # | Decision | Recommended default |
|---|---|---|
| D1 | Platform fee | **0% while the beta lasts** (keeps "No fees during the beta" true). Fee is one server constant; after beta, **5% of item + shipping**. You pick the date. |
| D2 | Who pays Stripe processing | **Seller.** Card processing is deducted from the payout and shown line by line. The platform pays the Connect per-account and per-payout fees. |
| D3 | Charge type | **Separate charges and transfers.** We charge the buyer, hold funds on the platform balance, and transfer to the seller when the payout rule says so. This is the only Stripe flow that lets us hold until delivery. Trade-off: the platform is liable for chargebacks, which is why holds exist. |
| D4 | Payout hold | **Established seller:** transfer when the order completes (3 days after delivery). **New seller:** the later of completion and 14 days after payment. |
| D5 | Unpaid order expiry | **30 minutes** (Stripe Checkout's minimum session life). |
| D6 | Auto-delivery | **14 days after `shipped`** if the buyer hasn't confirmed. |
| D7 | Dispute window | Buyer can open a dispute from `shipped` until the order **completes (3 days after delivery)**. Not received or not as described only. |
| D8 | Tracking required | When item + shipping is **$50 or more**. |
| D9 | High-value photos | Front and back photos required for checkout at **$100 or more** (matches the v2 brief). Slabs always need a cert number. |
| D10 | New-seller caps | Until **5 completed orders** with no dispute lost: max **25** checkout-enabled listings, max **$1,000** single price, max **$2,000** in open orders. Admin can promote a seller early. |
| D11 | New-buyer limits | Verified email to buy anything. Accounts under **7 days** old: max **$250** per order, 3 orders per day. |
| D12 | Shipping region | **US only** at launch (Checkout collects US addresses only). |
| D13 | Returns | **Not received / not as described only.** No buyer's-remorse returns. A seller may still agree to one in the thread. |
| D14 | Sales tax | Marketplace facilitator laws can make us collect tax once state thresholds are met. Default: **turn on Stripe Tax threshold monitoring, collect nothing at launch, `tax_cents` exists from day one, and an accountant confirms before live keys.** Stripe Tax collection turns on per state as we register. |
| D15 | 1099-K | **Stripe files and delivers 1099-Ks for Express accounts** once enabled in Connect tax settings. We never collect SSN/EIN. Thresholds follow current IRS rules; accountant confirms. |
| D16 | Who gets checkout first | **Allowlist** (you plus hand-picked sellers) in test mode, then live with the allowlist, then open to anyone who finishes Stripe onboarding. |
| D17 | Unpriced / offer listings | **Buy now only** for priced listings. "Open to offers" stays a DM until structured offers exist. Accepted offers create orders later. |
| D18 | Feedback visibility | **Double-blind:** each side's rating is hidden until both are in or 14 days pass, so nobody retaliates. Window closes 60 days after completion. |
| D19 | Shipping address retention | Visible to the seller from `paid`; **redacted 120 days after completion** (after the chargeback window). |
| D20 | Account deletion | Blocked while an order is open or within 120 days of completion. |

Things Tony has to do outside code (not decisions): enable Connect (Express) in the Stripe dashboard with platform branding, and later register for sales tax where the accountant says.

---

## 2. Scope

**In:** buy now on priced listings, Stripe Connect Express onboarding, checkout, webhooks, payout holds, shipping and tracking, delivery confirmation, order threads, emails, feedback and ratings, disputes, refunds, chargebacks, admin order tools, seller standards, fraud limits, audit log, copy updates.

**Out (unchanged from v2 brief §13):** auctions, lots, international shipping, multi-currency, carrier-API tracking (manual tracking numbers first), structured offers (separate work), cert lookups.

**What stays:** listings remain views of `user_collections` rows (trigger from 0031). Off-platform DM sales and `/purchases/[id]` (0052, 0060) keep working for unpriced books and sellers who don't onboard.

**Reuse:** `sold_items` and `confirm_sale_transfer` (0060) move the copy into the buyer's library on delivery. `requireAdmin` (aal2) gates admin. `messages` + `messageLimits` carry the order thread. Resend helpers send emails. Stripe signature verification follows `src/app/api/stripe/webhook/route.js`.

---

## 3. Order state machine

```
              buyer/seller/system cancel
   created ───────────────┐
      │ system: checkout   │
      │ session created    v
      v               cancelled ──(late payment)──> refunded   [system, auto-refund]
 awaiting_payment ────────┘
      │ stripe: checkout.session.completed, amounts match
      v
    paid ──seller: cancel (full refund)──────────────────────> refunded
      │ seller: mark shipped (+tracking if >= D8)
      v
   shipped ──buyer: dispute──┐
      │ buyer confirms, or   │
      │ system after D6 days │
      v                      v
  delivered ─buyer: dispute─> disputed ──admin: refund / stripe: dispute lost──> refunded
      │ system: D7 window        │
      │ passes, no dispute       └──admin: resolve for seller / stripe: dispute won──> completed
      v
  completed ──stripe: chargeback──> disputed
```

Chargebacks (`charge.dispute.created`) move any of `paid | shipped | delivered | completed` to `disputed`. Admin can refund from any paid state. `refunded` and `cancelled` are terminal except the late-payment edge.

**Allowed transitions** (the only ones the function accepts):

| From | To | Actor | Guard |
|---|---|---|---|
| created | awaiting_payment | system | session id + expiry set |
| created, awaiting_payment | cancelled | buyer, seller, system | releases listing to `active`; expires the Stripe session first |
| awaiting_payment | paid | stripe | session id, order id, amount, currency and mode all match the order |
| cancelled | refunded | stripe | payment landed after cancel: auto full refund, admin flagged |
| paid | shipped | seller | tracking number when total >= D8; carrier from a fixed list |
| paid | refunded | seller, admin | full refund; listing does not reactivate (seller relists by hand) |
| shipped | delivered | buyer, system | system only when `shipped_at + D6` has passed |
| delivered | completed | system | `delivered_at + 3 days` passed, no open dispute |
| shipped, delivered | disputed | buyer | inside D7; reason required |
| paid, shipped, delivered, completed | disputed | stripe | chargeback opened |
| disputed | completed | admin, stripe | resolved for seller / chargeback won |
| disputed, shipped, delivered, completed | refunded | admin, stripe | full or partial (partial keeps status and records `refunded_cents`; a partial on a dispute resolves it to `completed`) |

A seller can never move an order to `delivered` or `completed`. A buyer can never move it to `shipped` or `paid`. Nobody but Stripe moves it to `paid`.

---

## 4. Tables (one migration per PR, numbers assigned when each PR starts)

**`seller_accounts`** (new; not on `profiles`, which is publicly readable)
`user_id` pk → auth.users, `stripe_account_id` text unique, `livemode` bool, `charges_enabled`, `payouts_enabled`, `details_submitted` bool, `requirements_due` jsonb, `tier` text check in (`new`,`established`,`limited`,`suspended`) default `new`, `payouts_frozen` bool default false, `completed_orders` int, `bank_changed_at` timestamptz, `promoted_by` uuid, timestamps. RLS: owner selects own row; no client writes.

**`orders`**
- Parties: `id` uuid pk, `listing_id` → listings `on delete set null`, `buyer_id`, `seller_id` → auth.users `on delete restrict`, `sold_item_id` → sold_items.
- Snapshot at creation (the listing can vanish later): `series_title`, `issue_number`, `release_year`, `publisher`, `variant_label`, `printing_name`, `gcd_issue_id`, `cover_path`, `condition`, `grade_numeric`, `slab_company`, `slab_cert_number`, `restored`, `signed`, `condition_notes`, `photo_keys` jsonb.
- Money, all int cents, all set by the database: `item_cents`, `shipping_cents`, `tax_cents`, `total_cents`, `platform_fee_cents`, `processing_fee_cents`, `seller_net_cents`, `refunded_cents` (check `<= total_cents`), `currency` check = 'usd', `livemode` bool.
- `status` check in the 9 states above.
- Stripe: `stripe_checkout_session_id` unique, `stripe_payment_intent_id` unique, `stripe_charge_id` unique, `stripe_transfer_id` unique, `checkout_expires_at`.
- Shipping: `ship_to` jsonb (from Stripe, never the client), `ship_to_redacted_at`, `tracking_carrier` check in (`usps`,`ups`,`fedex`,`dhl`,`other`), `tracking_number`.
- Timeline: `created_at`, `paid_at`, `shipped_at`, `delivered_at`, `delivered_by` (`buyer`|`system`), `completed_at`, `cancelled_at`, `refunded_at`, `payout_eligible_at`, `transferred_at`.
- Constraints: `buyer_id <> seller_id`; total = item + shipping + tax; seller_net = total − tax − platform_fee − processing_fee; `create unique index orders_one_open_per_listing on orders (listing_id) where status in ('created','awaiting_payment','paid')` (no second sale of a copy, ever, under any race).
- RLS: select where `auth.uid() in (buyer_id, seller_id)`; `ship_to` exposed through a view that returns it only to the seller and only when status >= paid. No insert/update/delete policies.

**`stripe_events`**: `id` text pk (event id), `type`, `livemode`, `account` (connected account id or null), `received_at`, `processed_at`, `attempts` int, `last_error` text. RLS on, no policies.

**`order_refunds`**: `id`, `order_id`, `stripe_refund_id` unique, `amount_cents` > 0, `reason`, `actor_id`, `transfer_reversal_id`, `created_at`.

**`order_disputes`**: `id`, `order_id`, `kind` (`not_received`,`not_as_described`,`chargeback`), `opened_by`, `stripe_dispute_id` unique null, `status` (`open`,`resolved_buyer`,`resolved_seller`,`withdrawn`), `reason_text` ≤ 2000, `resolution_note`, `opened_at`, `resolved_at`. Partial unique index: one open dispute per order. RLS: parties read.

**`order_feedback`**: pk (`order_id`, `author_id`), `subject_id`, `author_role` (`buyer`|`seller`), `rating` smallint in (−1, 0, 1), `comment` ≤ 500, `created_at`, `visible_at`, `removed_at`, `removed_reason`. Insert only via function; no edits by anyone but admin removal. Public read where `visible_at <= now()` and not removed. View `seller_feedback_stats` (positive %, count, last 12 months) counts at most one rating per buyer-seller pair per 30 days.

**`order_email_log`**: unique (`order_id`, `event`, `recipient_id`). Replayed webhooks never send a second email.

**`marketplace_audit_log`**: `id` bigint identity, `at`, `actor_id`, `actor_role` (`buyer`,`seller`,`admin`,`system`,`stripe`), `entity` (`order`,`listing`,`seller`,`refund`,`dispute`,`feedback`), `entity_id`, `action`, `before` jsonb, `after` jsonb, `request_id`, `stripe_event_id`. A trigger rejects update and delete for every role. RLS on, no policies (admin reads through service role).

**Changes to existing tables**
- `messages.order_id` uuid null → orders. Order threads are the dispute record.
- `listings`: no new columns needed for checkout (price, shipping, ships-from exist). Eligibility is computed, not stored.
- `user_collections`: `before delete` / `before update of gcd_issue_id, status` trigger raises while the copy's listing has an open order (stops the cascade from 0031 deleting a listing mid-checkout). `order_transition` sets a transaction-local flag (`set_config('cc.order_tx', ...)`) so its own `paid` step can move the copy out.
- `reports.target_type` gains `order` and `feedback`.

---

## 5. Functions (all `security definer`, `set search_path = public`, execute granted to `service_role` only)

API routes authenticate the user from the verified Supabase JWT, then call these with the service client, passing the actor id. Same pattern as `mark_item_sold` and `confirm_sale_transfer`. No client ever writes to these tables.

- **`order_create(p_buyer, p_listing, p_request_id) returns orders`**
  `select ... for update` on the listing. A `reserved` listing whose open order is past `checkout_expires_at` is released inline (lazy expiry, so a missed cron can't lock inventory). Checks: listing `active` and priced; seller visible, onboarded, `charges_enabled`, tier not `limited`/`suspended`, not frozen; buyer ≠ seller; no block either way; buyer email verified; D9 photo and cert rules; D10 seller caps; D11 buyer caps; order rate limits (§8). Computes every amount from the listing row and server fee constants. Sets listing `reserved` with `reserved_until`. Inserts the order (`created`) and an audit row. The unique index backs the row lock.
- **`order_transition(p_order, p_to, p_actor_id, p_actor_role, p_payload jsonb, p_request_id, p_stripe_event_id)`**
  Locks the order row, looks up `(from, to, role)` in the table from §3, checks the actor is that party (or admin/system/stripe), applies the guard, sets timestamps and side effects, writes the audit row. Repeating a transition already applied (same target, same event id) is a no-op that returns the order, which makes webhook replays safe. Anything else raises with a stable error code the route maps to 404/409.
  Side effects inside the same transaction: `cancelled` → listing back to `active`; `paid` → listing `sold`, `sold_items` row created (`sold_via = 'comixcatalog_order'`, linked to the order), seller's copy leaves their library; `delivered` → `confirm_sale_transfer` puts the copy in the buyer's library; `completed` → bump `seller_accounts.completed_orders`, promote tier when D10 is met; any refund → recompute `refunded_cents`.
- **`order_record_refund(...)`, `order_open_dispute(...)`, `order_resolve_dispute(...)`**: thin wrappers that insert the child row and call `order_transition`.
- **`order_leave_feedback(p_order, p_author, p_rating, p_comment)`**: author must be a party, order `completed`, inside the D18 window, one per side. Sets `visible_at` to now if the other side already left theirs (and flips theirs too), else to `+14 days`.
- **`seller_set_tier`, `seller_freeze_payouts`, `seller_suspend`**: admin only, reason required, audited. Suspend hides listings (RLS on `listings` checks tier) and blocks new orders.
- **`order_sweep()`**: idempotent batch used by the cron route: expire unpaid orders, auto-deliver, complete, mark payout-eligible, redact old addresses.

Mirror the transition table and fee math in `src/lib/orders.js` (pure, unit-tested) so the UI can show what's possible. The database is the authority; the JS copy is display only, and a parity test parses the SQL table to catch drift.

---

## 6. Stripe flow

**Keys and mode.** Marketplace uses its own env vars (`STRIPE_MKT_SECRET_KEY`, `STRIPE_MKT_WEBHOOK_SECRET`, `STRIPE_MKT_CONNECT_WEBHOOK_SECRET`), so it can run in test mode while Collector+ subscriptions stay live. `livemode` is stored on accounts, orders and events; a live event never touches a test order and the reverse. Flag: `MARKETPLACE_CHECKOUT` = `off | allowlist | on`, plus `MARKETPLACE_CHECKOUT_ALLOWLIST` (user ids).

**Onboarding.** `POST /api/sell/stripe/onboard` creates (or reuses) an Express account (`country: US`, `capabilities: transfers`), stores it in `seller_accounts`, returns an Account Link. `/sell/stripe/return` re-fetches the account from Stripe instead of trusting the redirect. `account.updated` keeps flags current. `account.external_account.created|updated` sets `bank_changed_at`, extends any pending payout by 7 days and emails the seller ("Your payout bank changed. If this wasn't you..."). Express dashboard link via `POST /api/sell/stripe/dashboard`.

**Checkout.** `POST /api/orders` with `{ listing_id }` only. Any amount the client sends is ignored. Route: auth, flag check, rate limit, `order_create`, then `stripe.checkout.sessions.create` with line items built from the order row, `payment_method_types: ['card']` (no delayed methods, so "completed" means paid), `shipping_address_collection: { allowed_countries: ['US'] }`, `client_reference_id` and `metadata.order_id`, `payment_intent_data.transfer_group = order_id`, `expires_at` = reservation end, idempotency key `order-session-<order_id>`. Then `order_transition(awaiting_payment)` and redirect. If session creation fails, the order is cancelled and the listing released. The success page shows "Payment processing" until the webhook lands; it never marks anything paid.

**Webhooks.** New route `/api/stripe/marketplace-webhook`, registered twice in Stripe (platform events and Connect events, separate secrets). Steps: verify signature on the raw body (reject missing or bad); check `livemode` matches the env; `insert into stripe_events ... on conflict do nothing`; if the row already has `processed_at`, return 200; run the handler; set `processed_at`; on error record `last_error` and return 500 so Stripe retries. Handlers:
- `checkout.session.completed`: load order by `metadata.order_id`, require `session.id`, `amount_total`, `currency`, `payment_status = 'paid'` to match. Match → `paid` (stores `ship_to`, charge and intent ids). Mismatch → no state change, refund, admin email. Order already `cancelled` → auto-refund (`cancelled → refunded`).
- `checkout.session.expired` → `cancelled` if still `awaiting_payment` (no-op otherwise).
- `charge.refunded` → reconcile `order_refunds` by refund id (covers refunds made in the Stripe dashboard).
- `charge.dispute.created | updated | closed` → upsert `order_disputes` by dispute id; created → `disputed` and freeze any pending transfer; closed won → `completed`; closed lost → `refunded`, reverse the transfer if one was made.
- `account.updated`, `account.external_account.*` → `seller_accounts`.
- `transfer.reversed`, `payout.failed` → audit + admin email.

**Out of order.** Every handler reads current state from our row (and from the Stripe API where a stale payload could mislead, like accounts) and asks the state machine; an event that arrives after a later one becomes a no-op. Disputes are keyed by Stripe id, so a `closed` before `created` still lands right.

**Payouts.** `order_sweep` marks orders payout-eligible per D4. The cron route then calls `stripe.transfers.create({ amount: seller_net_cents, destination, source_transaction: charge_id, transfer_group: order_id })` with idempotency key `transfer-<order_id>`, skipping frozen or suspended sellers and orders with an open dispute. Stripe then pays the seller's bank on their Express schedule.

**Refunds.** Admin or seller cancel → insert `order_refunds` row → `stripe.refunds.create` (idempotency key `refund-<row id>`) → if a transfer exists, `transfers.createReversal` for the seller's share. The DB check `refunded_cents <= total_cents` makes over-refunding impossible.

**Crons.** GitHub Actions (Vercel Hobby crons only run daily): `order-sweep.yml` every 15 minutes calls `POST /api/cron/orders` with `CRON_SECRET`. Lazy expiry in `order_create` plus the `checkout.session.expired` webhook mean a missed run never strands a listing.

---

## 7. Threat model (top 15)

| # | Attack | Control |
|---|---|---|
| 1 | Two buyers check out the same copy at once | Row lock on the listing in `order_create` plus the partial unique index on open orders per listing. Tested with parallel connections. |
| 2 | Client tampers with price, shipping, fee or quantity | Route accepts only `listing_id`; amounts come from the listing row inside the DB function; webhook re-checks `amount_total` against the order. |
| 3 | Seller changes price or condition mid-checkout | Listing edits are draft/active only (existing); order snapshots amounts and condition at creation. |
| 4 | Seller deletes or unlists the book mid-order | New trigger blocks collection delete/status change while an order is open; FK `on delete set null` + snapshot keeps the order readable. |
| 5 | Forged webhook | Signature verified with the endpoint secret on the raw body; no secret configured = 500, never "accept". Test and live mode separated. |
| 6 | Replayed or out-of-order webhook | `stripe_events` insert-or-skip; transitions idempotent; state machine rejects backward moves; disputes upserted by Stripe id. |
| 7 | Payment lands after the reservation expired and the copy resold | Sweep expires the Stripe session before releasing; if payment still lands on a cancelled order, automatic full refund. Unique index prevents two paid orders. |
| 8 | IDOR: reading someone else's order by id | RLS limits select to the two parties; routes query with the user's id in the filter and return 404 for non-parties; `ship_to` only to the seller after payment. |
| 9 | Wrong party moves the order (seller marks delivered, buyer marks shipped) | Transition table keyed by actor role; actor id comes from the verified session, never the body. |
| 10 | Fake tracking or empty box | Tracking required at D8; payout waits for delivery and the dispute window; disputes reviewed with the order thread and photos; new-seller longer hold; repeated "not received" losses suspend the seller. |
| 11 | Buyer refund abuse ("never arrived", "not as described") | Only admin refunds disputed orders; tracking evidence; dispute rate per buyer tracked and shown to admin; buyers with repeated lost-to-seller disputes lose checkout. |
| 12 | Chargeback after delivery (friendly fraud) | Platform carries it under separate charges, so holds cover new sellers; evidence (tracking, thread, delivery confirmation) submitted from admin; transfer reversed when the seller is at fault; Stripe Radar on. |
| 13 | Account takeover used to sell or redirect payouts | Stripe KYC; bank changes come from Stripe and trigger a 7-day extra hold plus an email; admin can freeze payouts; aal2 admin only. |
| 14 | Off-platform payment scam (F&F, Zelle, wire, gift cards) | Message scan for payment terms adds a warning to both parties and an admin flag; listings with checkout say "Pay through ComixCatalog to be covered"; off-platform deals get no dispute help. |
| 15 | Feedback manipulation (sock puppets, retaliation, extortion) | Feedback only from real completed orders; one per side; double-blind; one counted per buyer-seller pair per 30 days; self-dealing (shared card fingerprint between buyer and seller) flagged; report button; admin removal audited. |

Also covered: admin endpoint abuse (all admin actions through `requireAdmin` aal2 and audited functions with a reason), reservation griefing (order rate limits in §8), account deletion to dodge a dispute (D20).

---

## 8. Seller standards and fraud limits

- **Checkout eligibility** (checked in `order_create`, shown in the listing editor): priced; seller onboarded with `charges_enabled`; tier `new` or `established`; slab → cert number; price >= D9 → front and back photos; new-seller caps (D10).
- **Prohibited items** (Terms + listing editor + report reasons): undisclosed reprints or facsimiles sold as originals, counterfeit or tampered slabs and labels, stolen goods, bootlegs, anything not the catalog issue listed. A `listingEdit` keyword check nudges "facsimile", "reprint", "homage" disclosures into the right fields.
- **Order rate limits** (`src/lib/orderLimits.js`, same shape as `messageLimits`): at most 2 unpaid orders open per buyer; 10 orders per day (3 for accounts under 7 days); 3 expired or cancelled unpaid orders in 24 hours → 24-hour checkout cooldown.
- **Off-platform payment terms** (`src/lib/messageContent.js`): Friends and Family, Zelle, Venmo, Cash App, wire, Western Union, crypto, gift cards. On match: send goes through, both parties see a banner, admin flag recorded. Not a block (too many false positives on "I paid with Venmo last time").
- **Feedback-based standing**: below 90% positive over the last 20 ratings, or 2 disputes lost to the buyer in 90 days → `limited` (no new orders) pending admin review.

---

## 9. Order thread, emails, pages

- **Thread:** `/orders/[id]` shows the thread inline. Sends go through `POST /api/messages` with `order_id` (existing limits apply; both parties allowed even across a block for an open order, so a dispute can still be argued). Admin sees it from `/admin/orders/[id]`. System messages post on each transition.
- **Emails** (Resend, via `after()`): order placed (both), paid (both; seller gets "ship by" guidance), shipped (buyer, tracking), delivered (seller), completed + payout scheduled (seller), feedback reminder (both), dispute opened/resolved (both), refund (both), payout frozen (seller). One per `(order, event, recipient)`.
- **Pages:** `/orders` (buying / selling tabs), `/orders/[id]` (receipt), `/sell/payouts` (onboarding status, pending and paid transfers), `/admin/orders` and `/admin/orders/[id]`, feedback on `/u/[username]` and seller rows on issue pages.
- **Design:** dark surfaces (`--cc-bg`, `--cc-surface`, `--cc-surface-2`), gold accent (`--cc-gold`, `--cc-gold-soft`), `var(--font-display)` headings, cover art prominent, works at 360 px, real loading, empty and error states. The receipt page: cover, edition and printing, grade (slab label styling for slabs), price breakdown (item, shipping, tax, total; seller view adds fee, processing, net), and a vertical status timeline. Issue page "For sale" table rows: grade, version, seller (since-date, sales count, % positive), ships from, price, buy button.

---

## 10. Test plan

**Unit (`node --test`, in CI):** fee and net math (rounding, $1 and $100,000 edges, refunds never exceeding total); transition table (every allowed edge passes, every other pair for every role fails); eligibility rules; rate-limit windows; payment-term detector (true and false positives); webhook dispatcher with mocked Stripe (bad signature, wrong mode, duplicate event id, mismatched amount, cancelled order paid late, dispute closed before created).

**Database tests (new, `tests/db/*.test.js`):** a Postgres service container in `pr-ci.yml`, a small fixture schema (stubs for `auth.users`, `auth.uid()`, `auth.role()`, `profiles`, `user_collections`, `listings`, `sold_items`, `messages`) plus the new migrations, driven with `pg`. Required failure-mode cases:
- 20 parallel `order_create` calls on one listing from 20 buyers: exactly one order, 19 clean errors.
- Same webhook event processed twice, and `paid` applied twice: one transition, one audit row, one email log row.
- Events delivered in reverse order (`dispute.closed` then `dispute.created`; `expired` after `completed`).
- Tampered amount: session total ≠ order total → order stays `awaiting_payment`.
- Non-party reads an order by id through RLS (`set role authenticated` + JWT claims): zero rows.
- Seller attempts `delivered` and `completed`; buyer attempts `shipped`: both rejected, no audit row.
- Seller deletes the collection row of a reserved listing: rejected.
- Refunds summing past the total: rejected.
- Audit log update/delete as service role: rejected.

**End-to-end (Stripe test mode):** `scripts/e2e/marketplaceLifecycle.mjs` against a preview deploy with `stripe listen` forwarding: onboard a test Express seller, list, buy with `4242...`, ship, confirm, complete, transfer; then a refund run, a decline (`4000000000000002`), a 3DS card, and a dispute card (`4000000000000259`). Extends `docs/stripe-testing-guide.md`.

Every PR: `npm run lint`, its `node --test` suites, the db tests, pre-push hook green.

---

## 11. Rollout

PRs in order, each with its migration, tests and a `docs/MARKETPLACE.md` status update, each inert until the flag is on:

| PR | Contents | Flag state after merge |
|---|---|---|
| a | `orders`, reservation, `order_transition`, RLS, audit log, collection guard trigger, db test harness. No payments. | off |
| b | `seller_accounts`, Connect onboarding (test), `/sell/payouts`, eligibility rules, tiers | off (onboarding visible to allowlist) |
| c | Checkout, webhook route, `stripe_events`, payout sweep and transfers | allowlist, test mode |
| d | Shipping, tracking, delivery confirmation, order pages, thread, emails | allowlist, test mode |
| e | Feedback, `seller_feedback_stats`, ratings on profiles and issue pages | allowlist, test mode |
| f | Disputes, refunds, chargebacks, `/admin/orders` (aal2) | allowlist, test mode |
| g | Order rate limits, payment-term warnings, new-account limits, standing rules | allowlist, test mode |
| h | Terms, Privacy, `/trust`, `/sell` copy matching exactly what shipped | unchanged |

Then: full e2e run in test mode → accountant check (D14, D15) → live keys with the allowlist → open to all onboarded sellers. Rollback at any point: set `MARKETPLACE_CHECKOUT=off`; open orders keep running through their lifecycle because sweeps and webhooks ignore the flag.

Public copy changes only in PR h and only for what is live. Until then, `/listing`, `/trust` and Terms keep saying no money moves through ComixCatalog.
