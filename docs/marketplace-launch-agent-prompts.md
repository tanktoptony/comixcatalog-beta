# Marketplace Launch — Agent Prompts

Companion to `docs/marketplace-launch-spec.md`. Each prompt below is **self-contained** — copy-paste any of them into a fresh agent session and it has everything needed. Agents are not assumed to have any session history.

**Shared preamble for every prompt** (paste at the top of every agent session):

> You're working on **ComixCatalog**, a Next.js + Supabase "Discogs for comics" platform built in `c:\dev\comixcatalog-beta`. Read `CLAUDE.md` at the repo root for the full project brief — schema notes, domain vocabulary, engineering reminders, and known data quirks. Read `docs/marketplace-launch-spec.md` for the broader plan; you're owning one section of that.
>
> Tech stack: Next.js App Router, Supabase (Postgres), Stripe + Stripe Connect, eBay APIs, sharp/pdf-lib. Tailwind for styling.
> Use the existing dark/gold theme (CSS in `src/app/globals.css`). Match existing component patterns. Don't add new dependencies without justification.
>
> When done, commit + push to `main`. Use clear commit messages: `area: change summary`.

---

## §1a — Collection Drift Audit Script

> **Goal:** Build `scripts/auditCollectionDrift.js`. It walks every `user_collections` row and emits a CSV of quality issues so we can measure how broken the data is before fixing it.
>
> **Files to create:**
> - `scripts/auditCollectionDrift.js` (Node ESM, see existing scripts for style)
> - `comicvine_api_output/drift-audit-<date>.csv` (output target, gitignored)
>
> **Schema to read:** `user_collections` joined to `gcd_issues` (via `gcd_issue_id`) and to `comics` (via `comic_id`). Also `canonical_covers` for cover existence checks, and `series` for publisher resolution.
>
> **Per-row checks** (one CSV row per `user_collections.id`):
> 1. `linked` — has either a non-null `gcd_issue_id` OR a non-null `comic_id` (never both null)
> 2. `has_year` — the linked entity resolves to a non-null year (via `bestYearFor` helper for GCD, `release_year` for local)
> 3. `has_cover` — there's at least one `canonical_covers` row matching the issue (via `series_gcd_id` ID path OR `series_title` title path)
> 4. `has_value` — either user-entered `market_value` OR `getMarketValue()` returns non-null (covers comp-based + cover-price floor)
> 5. `publisher_match` — when the linked GCD record has a publisher, that publisher matches the canonical_covers' publisher (catches the foreign-language-record mistag pattern)
>
> Emit one row per `user_collections.id` with columns: `collection_id, user_id, gcd_issue_id, comic_id, linked, has_year, has_cover, has_value, publisher_match, summary_score (out of 5)`.
> Print summary stats at end: total rows, % with each issue, top-10 worst series by drift count.
>
> **Acceptance criteria:**
> - Runs to completion against current DB
> - CSV opens cleanly in Excel/Numbers
> - Summary stats let us cite "X% of collection rows have a quality issue" in the spec
> - No DB writes (read-only audit)

---

## §1b — Collection Drift Repair Script

> **Goal:** Build `scripts/repairCollectionDrift.js`. Reads the CSV from §1a (or runs the same checks inline) and applies safe automated fixes. Dry-run by default; `--apply` to write.
>
> **Prereq:** §1a must be merged. Also `scripts/auditCatalogLink.js` (existing) and `scripts/sweepMistaggedPublishers.js` (existing) — leverage their logic, don't reimplement.
>
> **Repair strategies (in order, only act on rows that flagged in §1a):**
> 1. **Unlinked rows** (no FK at all): run the same heuristic as `scripts/auditCatalogLink.js` and apply confident matches via `gcd_issue_id`
> 2. **Multi-volume mismatch**: when a cc row is tagged to a foreign-publisher GCD record but a US-major record with the same title exists, retag (see `scripts/sweepMistaggedPublishers.js` for the pattern)
> 3. **Null year**: trigger a CV re-fetch only for the affected volume by appending the missing volume to `gap-manual.json` (the cover-ingest cron handles the rest)
> 4. **No cover**: same — queue the volume in `gap-manual.json` if not already present
>
> Skip rows requiring human judgment (e.g. ambiguous matches with multiple US-major candidates equally close).
>
> **Acceptance criteria:**
> - Dry-run prints a plan with counts per repair strategy
> - `--apply` performs the writes, prints success/fail per row
> - Idempotent: running twice with no DB changes between produces zero writes the second time
> - Post-run: re-running §1a's audit shows a measurable improvement in summary_score

---

## §1c — Onboarding Contract (Reject Unlinked Adds)

> **Goal:** Stop the drift bleeding by preventing new `addToCollection` calls from creating rows that don't resolve to canonical.
>
> **Files to touch:**
> - `src/context/LibraryContext.js` — the `addToCollection` and `addAnotherCopy` functions
> - `src/app/api/library/catalog-link/route.js` — existing catalog-link API (reuse)
> - `src/components/AddToCollectionButton.js` (if it exists; otherwise the callers in `src/app/comic/[id]/page.js` and similar)
>
> **Contract:**
> - When user clicks "Add to Collection" on a comic that has NO `gcd_issue_id` AND no `series_id` link on the local `comics` row, intercept and show a small inline panel: "We don't have this issue in our catalog yet. [Help us add it →] or [Add anyway as a local-only entry]"
> - The "Help us add it" CTA opens the existing `/contribute/add-comic` flow with the comic pre-populated
> - The "Add anyway" CTA still inserts, but flags the row with a (new) `data_quality_score = 0` so it stays out of marketplace flows
>
> **Acceptance criteria:**
> - New adds default to high-quality (linked) — soft-block on unlinked
> - "Add anyway" still works for power users; doesn't break the existing flow
> - Spot-check: 10 fresh adds via the normal search flow all come back with non-null `gcd_issue_id`

---

## §1d — Marketplace Listing Quality Gate (`data_quality_score`)

> **Goal:** Compute a 0-4 `data_quality_score` on every `user_collections` row and require ≥3 before a row can be listed for sale.
>
> **Migration:** Create `scripts/migrations/0011_data_quality_score.sql`. Add:
> ```sql
> ALTER TABLE user_collections
>   ADD COLUMN data_quality_score SMALLINT DEFAULT 0;
> CREATE INDEX idx_user_collections_quality ON user_collections(user_id, data_quality_score);
> ```
>
> **Computation** (in `src/app/api/library-hydrate/route.js` — runs every page load, cheap):
> Score = sum of:
> - +1 if linked to gcd_issue or local comic with series_id
> - +1 if year resolves
> - +1 if cover resolves
> - +1 if value resolves (comp OR cover-price floor counts; user override counts double — score = 4 if user explicitly entered market_value)
>
> Emit in API response; persist back via a debounced background update (don't slow down the response).
>
> **UI surfacing:**
> - Library row gets a small "—" / "•" / "•••" / "•••• Ready to list" indicator
> - Library page filter: "Ready to list" (score ≥ 3)
> - Listing creation flow: if user tries to list a score-<3 item, show what's missing and offer to fix
>
> **Acceptance criteria:**
> - Score computed and persisted within 5 seconds of any user edit affecting an input
> - Library page shows count of "Ready to list" items
> - Trying to list a score-<3 row shows the "what's missing" panel

---

## §2b — Multi-Source Pricing Ladder

> **Goal:** Add Heritage Auctions + MyComicShop as comp sources alongside eBay so `market_comps` is multi-source.
>
> **Existing infrastructure:** `market_comps.source` column already supports arbitrary strings. Use:
> - `source = "ebay"` → Insights API (sold)
> - `source = "ebay-listed"` → Browse API (asking)
> - `source = "heritage"` → Heritage Auctions realized prices
> - `source = "mycomicshop-buy"` → MyComicShop buy-list (becomes our floor)
>
> **Build:**
> - `scripts/fetchHeritageComps.js` — Heritage has public realized-prices pages. Scrape carefully; rate-limit politely (1 req/2s); focus on keys (top 1000 most-collected issues from our user base)
> - `scripts/fetchMyComicShopBuylist.js` — public buy-list pages, same approach
> - Each script stamps the right `source` value and dedups via `(source, external_listing_id)` like the eBay one does
>
> **Median weighting** (in `src/lib/marketValue.js`):
> - Update `getMarketValue` to weight comps by source reliability: heritage > ebay > ebay-listed > mycomicshop-buy
> - When sample sizes are small, prefer the higher-reliability source
>
> **Acceptance criteria:**
> - Spot-check: top 10 keys (Amazing Spider-Man #300, X-Men #94, etc.) all have at least one Heritage comp
> - Median values shift sensibly when a new source is added
> - UI tooltip discloses which source(s) fed the median

---

## §2c — Confidence Scoring on Auto-Values

> **Goal:** Each `auto_market_value` carries a `confidence` field — `high` / `medium` / `low` — surfaced in the UI.
>
> **Rules** (in `src/lib/marketValue.js`):
> - `high` = 3+ sold comps (`source="ebay"` or `"heritage"`) in primary bucket within 90 days
> - `medium` = 3+ comps total (any source) in primary or first-fallback bucket
> - `low` = 1-2 comps OR cover-price floor OR fallback bucket
>
> **UI:**
> - Library / Profile: small colored pill next to the value — green (high), yellow (medium), gray (low)
> - PDF export: confidence dot column or footnote
> - Listing creation: `low`-confidence listings must explicitly acknowledge "asking-price estimate" before publish
>
> **Acceptance criteria:**
> - Existing values get a confidence tier assigned on next library-hydrate call
> - Listings UI requires explicit ack for low-confidence pricing

---

## §2d — Pricing Freshness SLA

> **Goal:** Comps for active listings stay fresh (< 7 days) and comps for owned-but-unlisted issues stay reasonably fresh (< 30 days).
>
> **Cron jobs to add to `.github/workflows/`:**
> 1. `pricing-refresh-listings.yml` — daily — runs `node scripts/fetchEbayComps.js --listings-only --max-age-days=0` for issues with active marketplace listings
> 2. `pricing-refresh-owned.yml` — weekly Sunday — runs the existing fetchEbayComps for all user-owned issues
>
> **Script changes:**
> - Add `--listings-only` flag to `fetchEbayComps.js` to filter the queue to issues currently listed for sale
> - Add "stale" indicator in seller UI when comps for an active listing exceed 7 days
>
> **Acceptance criteria:**
> - Listings never show a stale comp in seller dashboard
> - GHA workflow logs prove daily/weekly cadence

---

## §3a — Stripe Connect Onboarding

> **Goal:** Sellers can onboard to Stripe Connect (Express accounts) and we store their `stripe_account_id`.
>
> **DB migration `0012_stripe_connect.sql`:**
> ```sql
> ALTER TABLE profiles
>   ADD COLUMN stripe_account_id TEXT,
>   ADD COLUMN stripe_account_status TEXT;
> ```
>
> **New API routes:**
> - `POST /api/stripe/connect/onboard` — creates an Express account, returns the Stripe onboarding URL
> - `POST /api/stripe/connect/refresh` — generates a new onboarding link for users mid-onboarding
> - Stripe webhook handler additions: `account.updated` → update `stripe_account_status` (`pending` / `enabled` / `restricted`)
>
> **UI:**
> - `/account/seller` page with "Set up payouts with Stripe" CTA (Pro-only)
> - Status indicator: "Onboarding incomplete" / "Ready to sell" / "Action required"
> - Link to Stripe Express dashboard for completed accounts
>
> **Docs:** Update `docs/stripe-testing-guide.md` with Connect testing notes.
>
> **Acceptance criteria:**
> - One real seller can onboard end-to-end (test mode acceptable for initial QA)
> - Profile shows correct status after each state transition
> - Webhook lifecycle verified via Stripe CLI in dev

---

## §3b — Listing Creation UI

> **Goal:** "List for Sale" flow on owned library items (Pro-only, requires §3a Stripe Connect setup, requires §1d quality gate).
>
> **DB migration `0013_listings.sql`:**
> ```sql
> CREATE TABLE listings (
>   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   user_collections_id UUID REFERENCES user_collections(id) ON DELETE CASCADE,
>   seller_id UUID REFERENCES auth.users(id),
>   price NUMERIC(10,2) NOT NULL,
>   shipping_cost NUMERIC(10,2) DEFAULT 0,
>   condition_assertion TEXT,
>   photos TEXT[],
>   notes TEXT,
>   status TEXT DEFAULT 'draft', -- draft | active | sold | cancelled
>   created_at TIMESTAMPTZ DEFAULT NOW(),
>   listed_at TIMESTAMPTZ,
>   sold_at TIMESTAMPTZ
> );
> CREATE INDEX idx_listings_active ON listings(status) WHERE status = 'active';
> ```
>
> **API:**
> - `POST /api/listings` — create draft → publish (gates: Pro, Connect ready, quality ≥ 3, ≥ 2 photos)
> - `PATCH /api/listings/[id]` — edit draft
> - `DELETE /api/listings/[id]` — cancel
>
> **UI:**
> - "List for Sale" button on each owned library item
> - Multi-step modal: condition photos (Supabase storage `listing-photos` bucket), price (suggest via `auto_market_value` with confidence pill), shipping, notes, review
> - Seller dashboard: list of own listings + status
>
> **Acceptance criteria:**
> - End-to-end: create draft → upload photos → set price → publish
> - All quality gates enforced
> - Listing visible to other users (browse comes in §3c)

---

## §3c — Marketplace Browse + Buy + Payout

> **Goal:** Public marketplace, Stripe Checkout, escrowed funds, ship/receive flow, automatic payout.
>
> **Prereq:** §3a + §3b
>
> **DB migration `0014_orders.sql`:**
> ```sql
> CREATE TABLE orders (
>   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   listing_id UUID REFERENCES listings(id),
>   buyer_id UUID REFERENCES auth.users(id),
>   seller_id UUID REFERENCES auth.users(id),
>   amount_total NUMERIC(10,2),
>   platform_fee NUMERIC(10,2),
>   stripe_payment_intent_id TEXT,
>   stripe_transfer_id TEXT,
>   status TEXT, -- created | paid | shipped | received | disputed | refunded | payout_released
>   shipping_address JSONB,
>   tracking_number TEXT,
>   shipped_at TIMESTAMPTZ,
>   received_at TIMESTAMPTZ,
>   payout_released_at TIMESTAMPTZ,
>   created_at TIMESTAMPTZ DEFAULT NOW()
> );
> ```
>
> **Routes:**
> - `/marketplace` — public listings with filters (publisher, era, grade, slab, price)
> - `/marketplace/listings/[id]` — public listing detail with seller snippet
> - `POST /api/orders/checkout` — creates Stripe Payment Intent with `transfer_data.destination = seller's connected account`, platform_fee_amount = 5-8% of total
> - Stripe webhook: `payment_intent.succeeded` → mark order paid, decrement listing status
> - Seller dashboard: "Mark shipped" action with tracking number entry
> - Buyer dashboard: "Mark received" action (auto-after 7 days if no dispute)
> - Cron: 3 days after received, release payout via `stripe.transfers.create`
>
> **Acceptance criteria:**
> - Real-card test transaction completes end-to-end
> - Funds correctly split: seller gets sale amount minus platform fee, platform retains the fee, Stripe takes processing
> - Buyer / seller both see real-time order status on their respective dashboards

---

## §4a — Seller Reputation

> **Goal:** Star + text review per completed transaction, aggregated to seller profile.
>
> **DB migration `0015_reviews.sql`:**
> ```sql
> CREATE TABLE reviews (
>   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   order_id UUID REFERENCES orders(id) UNIQUE,
>   reviewer_id UUID REFERENCES auth.users(id),
>   subject_id UUID REFERENCES auth.users(id),
>   rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
>   body TEXT,
>   created_at TIMESTAMPTZ DEFAULT NOW()
> );
> ```
>
> Plus computed columns on `profiles`:
> - `seller_rating_avg NUMERIC(3,2)`
> - `seller_rating_count INTEGER`
> Updated via trigger or batch job.
>
> **UI:**
> - "Leave a review" CTA on order detail after `received` state
> - Reputation pill on listing detail + profile header
> - Listings page filter: "Top-rated sellers"
>
> **Anti-abuse:**
> - 3+ negative (≤2 star) reviews in 30 days → automatic listing freeze pending admin review
> - One review per order, reviewer can edit within 7 days then locked
>
> **Acceptance criteria:**
> - Reputation displays on every listing and profile
> - Freeze trigger fires correctly in a simulated bad-actor scenario

---

## §4b — Verified-Grade Badge

> **Goal:** $10 one-time per slab cert. We verify cert against CGC/CBCS public lookup, attach a "Verified Slab" badge.
>
> **CGC lookup pattern:** `https://www.cgccomics.com/certlookup/<cert>/`
> **CBCS lookup pattern:** `https://www.cbcscomics.com/certification/<cert>/`
>
> **Build:**
> - `POST /api/verify-grade` — accepts `collection_id` + `cert_number` + `slab_company`. Fetches the public cert page, parses the grade out, verifies it matches `user_collections.grade_numeric`. If match: stamp `verified_grade_at` on the row, charge $10 via Stripe one-time payment.
> - `verified_grade_at TIMESTAMPTZ` column on `user_collections` (migration 0016)
> - HTML scraping is fragile — keep parsers tiny, test against 5+ real cert numbers per company
>
> **UI:**
> - "Verify slab" CTA on each slabbed item in the library
> - "Verified Slab" badge on listings and library items
> - Marketplace listing filter: "Verified grades only"
>
> **Acceptance criteria:**
> - 5 real CGC certs + 5 real CBCS certs all verify correctly
> - $10 charged via Stripe with a real card test
> - Mismatch flow: if grade doesn't match what's on the cert page, show clear error and don't charge

---

## §4c — Dispute Flow

> **Goal:** Buyer can open a dispute within 14 days of marking received. Admin mediation queue. Refund or relist outcomes.
>
> **DB migration `0017_disputes.sql`:**
> ```sql
> CREATE TABLE disputes (
>   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   order_id UUID REFERENCES orders(id),
>   opened_by UUID REFERENCES auth.users(id),
>   reason TEXT, -- misgrade | not_as_described | item_different | shipping_damage | other
>   description TEXT,
>   evidence_urls TEXT[],
>   status TEXT, -- open | seller_responded | escalated | resolved_refund | resolved_seller
>   resolution_notes TEXT,
>   created_at TIMESTAMPTZ DEFAULT NOW(),
>   resolved_at TIMESTAMPTZ
> );
> ```
>
> **Flow:**
> - Buyer opens dispute on order detail page → form (reason + description + photo evidence)
> - Seller has 48h to respond
> - If no resolution in 5 days → escalate to admin
> - Admin queue at `/admin/disputes` (gated by `ADMIN_ID`)
> - Resolution outcomes: refund full + relist, refund partial, side with seller
> - Stripe refund via `stripe.refunds.create` against the original payment intent
>
> **Acceptance criteria:**
> - End-to-end: simulated dispute → seller response → admin resolution → refund issued
> - Published SLA: disputes resolved within 7 business days
> - Tracking: dispute count visible on seller profile (high count → trust signal degradation)

---

## §4d — Anti-Fraud Baseline

> **Goal:** Soft limits and verification gates that catch the obvious patterns without overburdening legit sellers.
>
> **Rules to implement:**
> 1. New sellers (account < 30 days) capped at **3 active listings** until they've completed 5 successful transactions
> 2. High-value listings ($500+) must have a verified slab (§4b prereq)
> 3. Raw "keys" (predefined keylist of issues) over $300 are blocked entirely — slab required
> 4. Per-IP rate limit on listing creation: 10 / hour
> 5. Velocity check: any account creating > 50 listings in 24h gets flagged for admin review
>
> **Where to enforce:**
> - `POST /api/listings` validation layer (§3b)
> - Add `key_issues` table or constant list — for the "raw keys must be slabbed" rule
>
> **Build:**
> - `src/lib/listingRules.js` — pure functions that take a draft listing + seller profile and return `{ ok, blockers: [...] }`
> - Call from the listing-create API; surface blockers in the UI
> - Admin queue at `/admin/listings/flagged` for velocity-flagged accounts
>
> **Acceptance criteria:**
> - New account tries to list 4 items: 4th is blocked with clear messaging
> - Raw key over $300 blocked with "requires slab" CTA
> - Velocity flag fires on a synthetic 50-listing burst

---

## §5a — Public Profile Performance

> **Goal:** Sub-1.5s LCP on a 100-issue profile. Currently it does 4 hot API calls in serial.
>
> **Investigation:**
> - Use Chrome DevTools Performance + Lighthouse against `/u/<a-real-user>`
> - Identify which API call is slowest; usually `/api/public-profile` is the long pole
>
> **Fixes to consider** (apply only what evidence supports):
> - Parallelize the 4 API calls (Promise.all in the page)
> - Move to streaming RSC where data isn't blocking
> - Cache the public-profile response at the edge (Vercel Data Cache, 60s revalidate)
> - Image lazy-loading + `priority` on the LCP image (the hero avatar)
>
> **Acceptance criteria:**
> - Lighthouse Performance > 90 on /u/<a-100-issue-user>
> - LCP < 1.5s in DevTools throttled to "Fast 3G"
> - No visible regression in data correctness

---

## §5b — SEO Foundation

> **Goal:** Per-page metadata, sitemap, JSON-LD, Search Console connection.
>
> **Per-page metadata (using Next.js `generateMetadata`):**
> - `/series/[id]` — title `<Series Name> — Issues, Variants, Values | ComixCatalog`, description with issue count + era + publisher, OG image = featured cover
> - `/issue/[id]` — title `<Series> #<N> (<Year>) — Cover, Grade, Value`, JSON-LD `Product` schema with offers when listings exist
> - `/u/[username]` — title `<DisplayName>'s Comic Collection`, description with total + dominant publisher, OG image = avatar
>
> **Sitemap (`/app/sitemap.ts`):**
> - All publicly-visible series IDs (217k+ — chunk if needed)
> - All publicly-visible issue IDs (millions — restrict to issues with at least one cover)
> - All public profile URLs
> - Listing detail URLs (active only)
>
> **JSON-LD:**
> - Issue page: `Product` schema
> - Listing page: `Product` + `Offer` with price and availability
> - Profile: `Person` schema (lite)
>
> **Search Console:**
> - Verify ownership via DNS TXT (already wired through Cloudflare)
> - Submit sitemap.xml
>
> **Acceptance criteria:**
> - Lighthouse SEO > 95 on all three core templates
> - Sitemap returns 200 and validates
> - First indexed within 2 weeks

---

## §5c — Marketplace SEO

> **Goal:** Each `/marketplace/listings/[id]` page is rich-snippet eligible and individually indexable.
>
> **Prereq:** §3b + §5b
>
> **Per-listing metadata:**
> - Title: `<Series> #<N> (<Year>) — <Grade> — $<Price> | ComixCatalog Marketplace`
> - Description: condition + grade + seller location
> - OG image: primary listing photo
>
> **JSON-LD `Product` + `Offer`:**
> - `product.image` = listing photos
> - `offers.price` = listing price
> - `offers.priceCurrency` = "USD"
> - `offers.availability` = `InStock` while active, `SoldOut` once sold
> - `offers.seller` = seller's `Person` with rating from §4a
>
> **Sitemap:**
> - Add active listings to sitemap; remove on sold/cancelled
>
> **Acceptance criteria:**
> - Google Rich Results Test passes on a sample listing URL
> - Listing pages individually shareable to socials with proper cards

---

## §6a — End-to-End Smoke Test

> **Goal:** Playwright headless test that exercises the full happy path nightly. Catches regressions before users do.
>
> **Files to create:**
> - `tests/e2e/marketplace-happy-path.spec.ts`
> - `playwright.config.ts`
> - `.github/workflows/e2e.yml` — nightly schedule + on-push for `main`
>
> **Test path:**
> 1. Sign up new user A
> 2. Search for "Amazing Spider-Man"
> 3. Add issue #300 to collection
> 4. Edit grade: CGC 9.6
> 5. Verify `auto_market_value` populates within 10s
> 6. (Skip listing flow until §3b ships — add TODO)
>
> **Once §3b ships, extend:**
> 7. Publish a listing
> 8. Sign up user B
> 9. Buy the listing with Stripe test card 4242 4242 4242 4242
> 10. As A: mark shipped
> 11. As B: mark received
> 12. Verify payout state transition
>
> **Acceptance criteria:**
> - Runs in CI in < 5 min
> - 7-day green streak before marketplace launch
> - Slack/email alert on failure

---

## §6b — Data Integrity Audit

> **Goal:** Pre-launch run of all data-quality scripts. No surprises in production.
>
> **Run sequence:**
> 1. `node scripts/auditCollectionDrift.js` (§1a) — establish baseline
> 2. `node scripts/repairCollectionDrift.js --apply` (§1b) — fix what's fixable
> 3. `node scripts/sweepMistaggedPublishers.js --apply` (existing)
> 4. `node scripts/backfillCanonicalCoversGcdId.js` (existing) — re-tag stragglers
> 5. Trigger cover-ingest GHA workflow to fill any gap-manual queue
> 6. Re-run §1a — confirm improvement
>
> **Acceptance criteria:**
> - < 2% of user_collections rows fail any quality check
> - 90%+ of issues in active marketplace listings have a comp-derived price (post §2b)
> - Spot-check 100 random listings: each has plausible cover, year, publisher, value

---

## §6c — Stripe Live-Mode Test

> **Goal:** Execute the existing `docs/stripe-testing-guide.md` end-to-end in live mode, including Connect onboarding (§3a) and a real-card transaction (§3c).
>
> **Steps:**
> 1. Follow §0-§5 of `docs/stripe-testing-guide.md`
> 2. Add §6+: Connect onboarding for a test seller
> 3. List one item, buy with a real card from a separate account
> 4. Verify webhook lifecycle: payment_intent.succeeded → account.updated → transfer.created (payout)
> 5. Refund the transaction to restore state
>
> **Document:**
> - Capture screenshots of each key state transition
> - Append a "live mode quirks" section to the testing guide
>
> **Acceptance criteria:**
> - One real card transaction completed end-to-end in production
> - Webhook deliveries all 200
> - Refund issued cleanly

---

## §6d — Support Inbox + SLA

> **Goal:** support@ inbox monitored daily, auto-responder set, FAQ documented.
>
> **Setup:**
> - Migrate from `comixcatalog@gmail.com` to `support@comixcatalog.com` via Resend domain (already configured per session memory)
> - Auto-responder: "Thanks for reaching out — we reply within 24 hours" with link to FAQ
> - Forward to founder's personal inbox for now
>
> **FAQ (`docs/faq.md`):**
> Top expected questions:
> 1. How do I add a comic that isn't in your catalog?
> 2. Why is my collection value showing $0? / Why is it estimated?
> 3. How do payouts work for sellers?
> 4. What if my Stripe Connect onboarding gets stuck?
> 5. How do I list an item for sale?
> 6. What's the marketplace fee structure?
> 7. How do I open a dispute?
> 8. Verified-grade badge — what does it cost / what does it do?
> 9. Why is my eBay-asking price different from what I see selling?
> 10. Can I cancel my Pro subscription?
>
> **Acceptance criteria:**
> - support@ alias receives mail; auto-responder fires
> - FAQ linked from the help / footer
> - Founder commits to a 24h response SLA (just a personal commitment for v1)

---

## §7a — Error Monitoring (Sentry)

> **Goal:** Sentry wired to client + server, alerts on the right thresholds.
>
> **Setup:**
> - `npm install @sentry/nextjs`
> - Run `npx @sentry/wizard` — creates `sentry.client.config.ts`, `sentry.server.config.ts`, modifies `next.config.mjs`
> - Add `SENTRY_DSN` env var to Vercel + GHA secrets
> - Filter out: dev environment errors, expected 4xx (auth challenges, etc.)
>
> **Alert thresholds (configure in Sentry dashboard):**
> - Any 5xx > 5/min for 2 min → Slack / email
> - Any payment-flow error (transaction tag) → immediate
> - Any auth error spike → immediate
> - New error fingerprint → daily digest
>
> **Acceptance criteria:**
> - Test alert fires within 1 min of a synthetic error
> - Sourcemaps uploaded so stack traces are useful
> - PII scrubbing verified (no email/auth tokens in payloads)

---

## §7b — Analytics (Plausible or PostHog)

> **Goal:** Lightweight, privacy-respecting analytics with a conversion funnel.
>
> **Recommendation:** Plausible (simpler, cheap, GDPR-safe, no cookie banner needed). PostHog if you want session replays and product analytics later.
>
> **Setup:**
> - Add script to `src/app/layout.js` with the site key
> - Define events:
>   - `signup_completed`
>   - `first_collection_add`
>   - `first_grade_set`
>   - `listing_published`
>   - `purchase_completed`
>   - `pro_upgrade`
> - Each fires from the appropriate route handler / client component
>
> **Dashboard:**
> - Funnel: visit → signup → first_add → first_grade → listing_published → purchase
> - Weekly review (recurring 30-min slot)
>
> **Acceptance criteria:**
> - Funnel renders in the dashboard
> - First-week data collected without legal/privacy concerns

---

## §7c — Cost Monitoring

> **Goal:** Get alerted before hitting plan limits, not after.
>
> **Setup:**
> - Supabase dashboard → Billing → Set alert thresholds at 75% of:
>   - Database size
>   - Storage egress
>   - Auth users
> - Vercel dashboard → Billing → Set alert thresholds at 75% of:
>   - Function execution time
>   - Edge requests
>   - Bandwidth
> - eBay API: monthly cap tracked in `scripts/ingestStatus.js` (existing); add to a daily summary email
> - Stripe: monitor processing fees vs revenue ratio
>
> **Acceptance criteria:**
> - One synthetic threshold breach fires an alert
> - Monthly cost summary email arrives by the 1st of each month

---

## §7d — Incident Playbook

> **Goal:** When something breaks, the founder doesn't have to think — just follow the runbook.
>
> **File to create:** `docs/incidents.md`
>
> **Scenarios to cover, each with: detection, immediate mitigation, root-cause investigation, post-incident steps:**
> 1. Stripe webhook handler 5xx storm
> 2. Supabase outage (read or write)
> 3. eBay API drops connectivity for > 1 hour
> 4. Vercel deployment of bad code reaches production
> 5. DDoS / abnormal traffic spike
> 6. Database key compromise (rotation procedure)
> 7. Cover-ingest cron starts overwriting good data
> 8. Marketplace transaction stuck in `paid` but no payout
>
> **For each scenario:**
> - Detection signal (Sentry alert? user report? Stripe dashboard?)
> - First 5 minutes: stop the bleed
> - Next 30 minutes: assess + comms
> - Next 24 hours: root cause + fix
> - Post-incident: write-up + prevention
>
> **Test the playbook:**
> - Dry-run scenarios 1 + 4 in a Friday afternoon — practice the muscle memory
>
> **Acceptance criteria:**
> - Playbook reviewed and signed off
> - At least 2 scenarios dry-run-tested before marketplace launch
> - Contact list (Stripe support, Supabase support, Vercel support) embedded

---

## Working with these prompts

- **One agent per prompt.** Don't paste two §s into one session; they have different shapes.
- **Tell the agent to commit + push when done.** Otherwise you lose the work.
- **Verify in the working tree before declaring done.** Agent summaries are aspirational; check the diff.
- **If an agent gets stuck mid-prompt**, fork the prompt to a follow-up with the specific blocker, don't restart from scratch.

When all of §1-§7 are complete and acceptance criteria pass, you're ready for **soft launch (Pro users only)** per the spec's sequencing.
