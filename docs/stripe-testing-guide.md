# Stripe Testing Guide — ComixCatalog Pro

A checklist to verify the Pro membership flow end-to-end before opening signups.
Walk through this in **test mode** first, then repeat for a live-mode sanity check
with one real card.

---

## 0. Prerequisites

Confirm the following BEFORE testing — most "Stripe isn't working" reports are
actually missing config, not broken code.

- [ ] `.env.local` has both **test** and **live** keys, but only one set is
      active in the current environment.
- [ ] Vercel Production env vars match the **live** keys.
- [ ] Vercel Preview env vars match the **test** keys.
- [ ] Stripe Dashboard → **Developers → API keys** shows your `pk_` and `sk_`
      starting with `pk_test_` / `sk_test_` (test mode) or `pk_live_` / `sk_live_`
      (live mode) — whichever you're testing.
- [ ] `STRIPE_PRO_PRICE_ID` is the **monthly $8 recurring** price.
- [ ] `STRIPE_FOUNDING_PRICE_ID` is the $20 founding price (if relevant).
- [ ] Webhook endpoint configured at:
      `https://www.comixcatalog.com/api/stripe/webhook`
- [ ] Webhook is subscribed to **at least** these events:
  - [ ] `checkout.session.completed`
  - [ ] `customer.subscription.created`
  - [ ] `customer.subscription.updated`
  - [ ] `customer.subscription.deleted`
  - [ ] `invoice.paid`
  - [ ] `invoice.payment_failed`
- [ ] `STRIPE_WEBHOOK_SECRET` matches the **signing secret** for the webhook
      endpoint you're testing (test mode and live mode have separate secrets).

> ⚠️ A live-mode `cus_xxx` saved on a profile will fail when the app is
> running in test mode (key mismatch). If you switch modes during testing,
> NULL the `stripe_customer_id` on your test account first.

---

## 1. Local dev setup (test mode)

### 1a. Install the Stripe CLI

Stripe's CLI lets you forward webhook events from Stripe → your local dev server,
so you can test the full lifecycle without a public URL.

- macOS: `brew install stripe/stripe-cli/stripe`
- Windows: `scoop install stripe` or download from https://stripe.com/docs/stripe-cli
- Then: `stripe login` (opens browser, authorize CLI access)

### 1b. Forward webhooks to local

In one terminal:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

The CLI prints a **webhook signing secret** like `whsec_xxx`.

In your `.env.local` set:

```
STRIPE_WEBHOOK_SECRET=whsec_xxx   # the one the CLI just printed
```

Restart `npm run dev` to pick up the new env var.

### 1c. Trigger a checkout flow

1. Open http://localhost:3000 → sign in as a **test user** (not your admin account).
2. Go to **/upgrade**.
3. Click **Upgrade to Pro** (or whatever the CTA is on `/upgrade`).
4. Stripe Checkout opens.
5. Use a Stripe **test card**:
   - **Card number:** `4242 4242 4242 4242`
   - **Expiry:** any future date (`12/34`)
   - **CVC:** any 3 digits (`123`)
   - **ZIP:** any 5 digits (`12345`)
6. Submit.

### 1d. Verify the round-trip

Watch the `stripe listen` terminal — you should see events fire in this order:

```
checkout.session.completed
customer.subscription.created
invoice.paid
```

Each event should hit your local `/api/stripe/webhook` and return HTTP 200.
If you see **400** or **500**, the webhook handler is the bug. Tail the
dev-server console for the stack trace.

Then verify the database side effects:

- [ ] `profiles.is_pro` flipped to `TRUE` for the test user
- [ ] `profiles.stripe_customer_id` populated with `cus_xxx`
- [ ] Browser redirected back to `/upgrade?upgrade=success` (or homepage with
      success banner, depending on your success URL config)
- [ ] Header shows the **PRO** badge next to the username

---

## 2. Production smoke test (live mode, one real card)

Once test mode is clean, do **one** real-card transaction in production to
confirm everything works under live-mode keys + webhook secret.

1. Use a real card with a low balance limit or a privacy.com virtual card you can
   instantly cancel.
2. Use a **dedicated test account** (e.g. `pro-test@comixcatalog.com`), not your
   personal admin account — a live-mode `cus_xxx` will haunt that profile.
3. Walk through `/upgrade` → checkout → success URL.
4. Verify in **Stripe Dashboard (live mode)**:
   - [ ] Customer created with the right email
   - [ ] Subscription active, status `active`
   - [ ] First invoice paid
5. Verify in Supabase:
   - [ ] `is_pro = true`
   - [ ] `stripe_customer_id` set
6. **Immediately refund + cancel** the subscription in the Stripe Dashboard
   so you're not charged again next month.
7. After cancellation, verify the webhook flipped `is_pro = false`.

---

## 3. Edge cases to deliberately test

| Scenario | How to trigger | What you should see |
|---|---|---|
| **Card declined** | Test card `4000 0000 0000 0002` | User stays on `/upgrade?upgrade=cancelled`, no DB change |
| **3DS required** | Test card `4000 0027 6000 3184` | OTP challenge appears; works after entering any code |
| **Insufficient funds** | Test card `4000 0000 0000 9995` | Decline message in Checkout |
| **Subscription cancel** | Stripe Dashboard → cancel sub | Webhook `customer.subscription.deleted` fires → `is_pro = false` |
| **Failed renewal** | Stripe → set test clock forward past renewal with a declining card | Webhook `invoice.payment_failed` → consider grace period vs. immediate downgrade |
| **Already-Pro upgrade** | Pro user clicks Upgrade again | Should detect existing sub and short-circuit (not double-charge) |
| **Anonymous user** | Logged-out user clicks Upgrade | Redirected to signup, not Checkout |

Decline test cards: https://stripe.com/docs/testing#cards-responses

---

## 4. Webhook diagnostic checklist

If `is_pro` isn't flipping after a successful Checkout, it's almost always
the webhook. Walk this list:

- [ ] Stripe Dashboard → Developers → **Webhooks** → click your endpoint
- [ ] **Recent deliveries** tab — did the event arrive at all?
- [ ] If yes, what HTTP code did your endpoint return?
  - **200**: webhook handler ran but didn't update DB. Check handler logic.
  - **400**: signature mismatch. `STRIPE_WEBHOOK_SECRET` is wrong for this mode.
  - **404**: route path is wrong. Confirm `/api/stripe/webhook` is deployed.
  - **500**: handler threw. Check Vercel logs for the stack trace.
- [ ] If no events appear: check the endpoint URL has no typo, and the
      events the endpoint is subscribed to include `checkout.session.completed`.
- [ ] Click **Resend** on a failed event after fixing the issue to verify.

---

## 5. Admin override (no Stripe required)

For comps, founding-collector grants, or test setups, use the admin tool
instead of a fake Stripe transaction:

1. Sign in as the admin account (`ADMIN_ID`).
2. Go to **/admin** (no nav entry — type the URL).
3. Look up the username.
4. Click **Grant Pro** or **Revoke Pro**.

This sets `profiles.is_pro` directly without touching Stripe — useful for
Patreon Founding Collectors and free promo memberships.

---

## 6. Cancellation flow (still TBD)

Pro users should be able to cancel their own subscription from within the app.

- [ ] `/account` has a "Manage subscription" button
- [ ] Button opens Stripe **Customer Portal** session
- [ ] Customer Portal is enabled in Stripe Dashboard → Settings → Billing → Customer Portal
- [ ] Cancellations propagate via webhook → `is_pro = false` after current period ends

(If this UX isn't wired yet, schedule it before any large signup push — angry
users emailing for cancellations is a worse problem than no signups.)

---

## Last word

The single most common cause of "Stripe broke" is **mode mismatch**: a live
Customer ID under a test API key, or vice versa. When in doubt, NULL
`stripe_customer_id` on the affected profile and start the flow fresh.
