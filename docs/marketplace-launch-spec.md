# Marketplace Launch Spec — ComixCatalog

**Target window:** Phase 4 (target Nov 2026 per CLAUDE.md). Pro-users-only soft launch first; full open marketplace later.
**Author:** Working spec — revise as priorities shift.
**Status (2026-06-29):** Pre-marketplace stabilization. Collection-data integrity and pricing pipeline are the load-bearing items.

---

## 0. The North Star Filter

Every line item below should answer **yes** to one of these:

1. Does this make the buyer trust a listing? (correct cover, correct grade, accurate price)
2. Does this make the seller trust the platform? (predictable payout, fair fees, low fraud)
3. Does this make a casual user become a paid user? (Pro tier value, conversion paths)

If none, deprioritize.

---

## 1. Collection ↔ Canonical Reconciliation *(THE persistent problem)*

### The problem in one sentence

When a user adds a comic to their collection, we currently let it drift away from our canonical data — wrong year, missing cover, no value, mismatched publisher. Some of this is upstream data quality (GCD has 200k+ series, our mirror is partial). Some of it is our linking logic giving up too easily. Either way, a marketplace listing built on a fuzzy match is worthless.

### Symptoms we've debugged this session
- **Unknown year** on tons of issues even when `gcd_issues.publication_date` exists (resolved partly; key_date fallback in place)
- **Missing covers** despite canonical_covers rows existing (resolved partly; ID-path lookup added to library-hydrate, public-profile, issues API, PDF route)
- **COLLECTION VALUE = "—"** on profiles (this session — public-profile route doesn't yet call `getMarketValuesBulk`)
- **Multi-volume series ambiguity** — Marvel Tales / Witchblade / Thief of Thieves: cover is tagged to a foreign-publisher GCD record, lookup misses
- **Variant collapse** — user's #1 (Newsstand) and #1 (Direct) shown as one row (resolved — migration 0010 + multi-copy support)

### What "reconciled" means (definition of done)

For every `user_collections` row:
1. `gcd_issue_id` IS NOT NULL, OR `comic_id` IS NOT NULL (never both null after onboarding)
2. The linked `gcd_issue` or `comic` resolves to a **non-null year, publisher, and at least one cover candidate**
3. `auto_market_value` populates (or explicit `value_source = "no-data"`)
4. Variant + copy_number fields preserved through every UI surface

### Workstreams

**1a. Audit script — drift detection (1-2 days)**
- New script: `scripts/auditCollectionDrift.js`
- For each user with > 0 collections, emit a CSV row per item flagging:
  - `linked` (boolean)
  - `has_year` (boolean)
  - `has_cover` (boolean)
  - `has_value` (boolean)
  - `gcd_issue_or_comic_publisher_matches_series_publisher` (boolean)
- Pipe the worst offenders into `scripts/repairCollectionDrift.js`

**1b. Repair script — automated fixes (2 days)**
- For unlinked rows (only `series_title`+`issue_number` text, no FK): run the existing catalog-link audit (`scripts/auditCatalogLink.js`) heuristics and apply confident matches
- For multi-volume ambiguity: prefer the GCD record whose publisher_gcd_id is in the US-major whitelist (extend `scripts/sweepMistaggedPublishers.js`)
- For null years: backfill from CV via the ingester (already does this for new ingests)
- For null cover candidates: queue the volume in `gap-manual.json`

**1c. Onboarding contract (1 day)**
- When user adds an issue via `addToCollection`, require either a `gcd_issue_id` OR a freshly-created `comics` row with a confirmed `series_id` link
- Reject the add (with a "this issue isn't in our catalog yet — contribute it?" CTA) if neither resolves
- This stops the bleeding for new adds; the audit+repair handles legacy

**1d. Marketplace listing gate (½ day)**
- A `user_collections` row cannot be listed for sale unless `data_quality_score >= 3 of 4` (linked, year, cover, value)
- Listings missing the score get a "Improve listing quality" CTA before they can publish
- Compute `data_quality_score` in `library-hydrate` and surface in the UI

### Acceptance criteria
- Run the audit; <2% of user_collections rows fail any of the 4 checks
- Random spot-check of 50 listings: each shows a credible cover, correct year, correct publisher
- A new "for sale" listing flow REQUIRES quality threshold before publish

---

## 2. Pricing Pipeline Maturity

### Current state
- ✅ Cover-price era heuristic (instant floor on every issue)
- ✅ market_comps table populated by Browse API (asking prices, not sold)
- ⏳ eBay Insights API (sold comps) — pending production access approval
- ❌ No multi-source ladder yet (Heritage, MyComicShop, CGC pop reports)

### Workstreams

**2a. Production Insights unlock (waiting on eBay)**
- Email already drafted in your queue; if no response in 14 days re-ping
- When approved: `EBAY_API=insights` in env, re-run `fetchEbayComps.js --max-age-days=0` to refresh all 318 issues with sold-comp medians (asking → sold price drop in UI labels too)

**2b. Multi-source ladder (3-5 days, post-Insights)**
- `scripts/fetchHeritageComps.js` — public realized prices, focus on keys (signal: auction premium for high grades)
- `scripts/fetchMyComicShopBuylist.js` — public buy-list, becomes our floor
- Median across sources weighted by sample size and recency
- `market_comps.source` field already exists — just keep stamping it

**2c. Confidence scoring (1 day)**
- For each `auto_market_value` calculation, emit a confidence level: `high` (3+ sold comps in primary bucket), `medium` (3+ asking comps), `low` (1-2 comps or cover floor)
- UI shows confidence pill next to price
- Marketplace listings with `medium`/`low` confidence get an "asking price" disclaimer to buyers

**2d. Freshness SLA (½ day)**
- Daily cron refreshes comps for any issue currently listed for sale (high priority)
- Weekly cron refreshes comps for user-owned issues (lower priority)
- Stale comps (>30 days) surface a "refresh" indicator in the seller UI

### Acceptance criteria
- 90%+ of marketplace listings show a comp-derived price (not just cover floor)
- Median listing price is within 30% of the eBay sold median for the same SKU at launch QA time

---

## 3. Marketplace Mechanics (Stripe Connect)

### Current state
- ✅ Stripe Pro subscription wired (in-app billing flow)
- ❌ Stripe Connect for seller payouts — not started
- ❌ Listing creation UI — not started
- ❌ Order flow (buyer checkout, escrow, ship confirmation, payout release) — not started

### Workstreams

**3a. Stripe Connect onboarding (3-5 days)**
- Express accounts (Stripe-hosted onboarding, lowest friction)
- KYC handled by Stripe; we just store `stripe_account_id` on profiles
- Express dashboard for sellers to see payouts (Stripe-hosted; no UI work for us)
- Document: `docs/stripe-connect-onboarding.md` walkthrough for first sellers

**3b. Listing creation UI (3 days)**
- "List for Sale" button on owned library items (Pro-only)
- Form: condition assertion (must already have grade signal), price, shipping cost, photos required (min 2), notes
- Auto-suggest price from `auto_market_value` with confidence pill
- Listing fee model: 5-8% per sale (Discogs reference), platform fee + Stripe fees combined

**3c. Marketplace browse + buy (5 days)**
- New `/marketplace` route with filters (publisher, era, grade, slab, price)
- Detail page per listing with seller profile snippet, condition photos, grade verification badge
- Add-to-cart → Stripe Checkout → escrowed funds → ship confirmation (manual seller mark) → buyer "received" mark → auto-payout
- Hold funds for 3-5 days post-buyer-received to allow disputes

**3d. Listing quality enforcement (½ day, depends on §1d)**
- Listing creation blocked unless `data_quality_score >= 3`
- Photos required (min 1 front, 1 back)
- Slab listings must have cert number entered

### Acceptance criteria
- Internal end-to-end test: create listing → buy → ship → mark received → payout — all the way through with a real card
- Seller dashboard shows expected vs actual payout amounts
- Fee disclosure clear at every step

---

## 4. Trust & Safety

### Workstreams

**4a. Seller reputation (2 days)**
- After each completed transaction, buyer can leave a star + text review
- Aggregate reputation surfaces on listing pages and profile
- 3+ negative reviews in 30 days = automatic listing freeze pending review

**4b. Verified-grade badge ($10 one-time per cert)**
- User submits slab cert number
- We verify against CGC/CBCS live registry (their lookup pages have stable URLs)
- Badge: "Verified Slab" next to the grade in the listing
- Per CLAUDE.md, the $10 one-time is the monetization for this

**4c. Dispute flow (2 days)**
- Buyer can open a dispute within 14 days of "received"
- Common reasons: misgrade, condition not as described, item different from listing photos
- Mediation queue for admin; refund-and-relist option

**4d. Anti-fraud baseline (1 day)**
- Throttle: new sellers capped at 3 active listings until first 5 transactions complete
- High-value listings ($500+) require slab + verified grade
- ToS: no raw "keys" over $300 without slab (avoids the "I shipped a copy with hidden damage" problem)

### Acceptance criteria
- Reputation visible on every listing
- Dispute SLA published (e.g. "resolved within 7 business days")
- Verified-grade flow tested with real CGC/CBCS cert numbers

---

## 5. Performance, SEO, Search

### Workstreams

**5a. Public profile performance (1 day)**
- Currently /u/<username> hits 4 hot APIs in serial (profile, public-profile data, activity, hydrate). Parallelize, then move to streamed RSC where possible.
- Target: < 1.5s LCP on a 100-issue profile

**5b. SEO foundation (2 days, currently in backlog)**
- Per-page metadata on `/series/[id]`, `/issue/[id]`, `/u/[username]` (title, description, OG tags, JSON-LD `Product` schema for issues)
- Sitemap expansion: every public series + every public profile
- Search Console connection + sitemap submission
- 3-5 cornerstone blog posts to anchor inbound traffic ("How to grade your collection", "Insurance reports for collectors", "Why newsstand variants matter")

**5c. Marketplace SEO (1 day)**
- `/marketplace/listings/[id]` with full structured data (`Product`, `Offer`, `AggregateRating`)
- Sitemap entries for every active listing
- Image alt text from issue title + grade

### Acceptance criteria
- Lighthouse score > 90 on all three core templates (profile, library, marketplace listing)
- Sitemap indexed by Google within 2 weeks
- First organic search traffic > 50 unique visitors/day by month 1 post-launch

---

## 6. Pre-Launch QA

### Workstreams

**6a. End-to-end smoke test script (1 day)**
- Headless playwright covering: signup → add 10 issues → grade them → publish 1 listing → buy as another user → ship → receive → payout
- Runs in CI on every push
- Document: `docs/qa-smoke-test.md`

**6b. Data integrity audit (½ day)**
- Pre-launch run of `scripts/auditCollectionDrift.js` across ALL users
- Pre-launch run of `scripts/sweepMistaggedPublishers.js`
- Pre-launch backfill ingest cycle for any series with > 50% missing covers

**6c. Stripe live-mode test (½ day, follow `docs/stripe-testing-guide.md`)**
- One real transaction with low-balance card to confirm full webhook lifecycle in production keys

**6d. Support inbox + SLA (½ day)**
- comixcatalog@gmail.com (or migrate to support@comixcatalog.com via Resend) checked daily
- Auto-responder with 24h SLA promise
- FAQ doc covering top 10 expected questions

### Acceptance criteria
- All smoke tests passing for 7 consecutive days
- Drift audit shows < 2% of rows with quality issues
- One full real-card transaction completed in production

---

## 7. Day-1 Ops & Monitoring

### Workstreams

**7a. Error monitoring (1 day)**
- Wire Sentry (or similar) to client + server
- Alert thresholds: any 5xx > 5/min, any payment-flow error, any auth error spike
- On-call: just you for the first 90 days; expand if traffic warrants

**7b. Analytics (½ day, currently in backlog)**
- Plausible or PostHog (privacy-respecting, GDPR-safe)
- Conversion funnel: visit → signup → first-add → first-grade → first-listing → first-sale
- Weekly review cadence

**7c. Cost monitoring (½ day)**
- Supabase usage dashboard alerts at 75% of plan limit
- Vercel function execution alerts
- eBay API call counter

**7d. Incident playbook (½ day)**
- `docs/incidents.md`: what to do if Stripe webhooks 500, what to do if Supabase is down, what to do if eBay drops connectivity, how to rotate keys
- Test the playbook by simulating each scenario in dev

### Acceptance criteria
- < 5 minutes from incident to alert
- < 30 minutes from alert to "someone is working on it" comms post
- Backup-and-restore of the Supabase DB tested at least once

---

## Pre-Launch Sequencing (calendar view)

Approximate ordering. Items can overlap; the dependency graph is rough.

```
Month 1  [§1 reconcile audit + repair] → [§1 onboarding contract]
                                       ↘ [§2c confidence scoring]
Month 2  [§2a Insights flip, when approved] → [§2b multi-source ladder]
         [§3a Stripe Connect]            ↘ [§3b listing creation]
Month 3  [§3c marketplace browse + buy]  → [§3d listing quality gates]
         [§4a reputation]
Month 4  [§4b verified-grade] → [§4c dispute flow] → [§4d anti-fraud]
         [§5a perf]            → [§5b SEO]         → [§5c marketplace SEO]
Month 5  [§6 QA + smoke tests + audit]
         [§7 monitoring + analytics + incident playbook]
Month 6  [SOFT LAUNCH — Pro users only]
         [Open marketplace gate per cohort]
```

---

## Out of Scope for v1

These are explicitly NOT in the launch spec. They'd be tempting to add, but adding them delays the launch we actually want.

- Mobile native app (PWA-first; native in 2027)
- International marketplace (US-only at launch; Stripe handles the currency boundary)
- Auction-style listings (fixed-price only; auctions in v2)
- Trade-in / bundle deals (single-item listings only)
- Subscriptions to specific sellers (not a marketplace pattern we need)
- Forum / community features (Discord covers this until v2)

---

## The Daily Question

"Did today's work make a buyer trust a listing more, make a seller trust the platform more, or make a free user closer to paid?"

If no, why are we doing it?
