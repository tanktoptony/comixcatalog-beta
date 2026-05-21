# ComixCatalog — Claude Code Project Briefing

> Solo founder project. Built in Chicago. Goal: replace bartending income with recurring revenue by end of summer 2026.
> Tagline: "Built by collectors, for collectors."
> Site: comixcatalog.com | @comixcatalog

---

## The North Star

**ComixCatalog is what Discogs is for music, but for comic books.**

That's the one-sentence product truth. Every feature decision should be evaluated against it. Discogs succeeded by combining a comprehensive community-built database, personal collection management, and a trusted peer-to-peer marketplace into one platform with a strong collector identity. That's exactly what this is — for comics.

When in doubt about scope, priority, or design direction: ask "does Discogs do this, and does it make sense for comics?"

---

## What This App Is

ComixCatalog is an all-encompassing comic book database, collection manager, and marketplace. It serves collectors across the spectrum:

- **Serious collectors** — Track collections with granular specificity: variants, newsstand vs. direct editions, formats, CGC/CBCS slab grades, cert numbers, estimated values
- **Casual collectors** — Find missing issues from runs or story arcs, browse key issues
- **Sellers** — List key issues or newsstand books via an integrated marketplace
- **Everyone** — Know the real-time estimated value of their collection

The app is **stable and content-rich** (217k series, 2.5M issues, year-aware publisher resolution shipped). The current bottleneck is **revenue infrastructure** — Stripe + PDF + valuation pipeline — not core stability.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) |
| Backend / API routes | Python scripts + Next.js API routes |
| Database | Supabase (Postgres) |
| Payments | Stripe + Stripe Connect (marketplace seller payouts) — **not yet wired** |
| Comic metadata | Grand Comics Database (GCD) |
| Cover images | ComicVine API (free tier only — no paid tier appears available; supplemented by GCD covers and future user uploads) |
| Valuation data | **eBay Marketplace Insights API** (sold-comps) — replacing stalled GoCollect integration. Awaiting account approval as of May 21, 2026. CGC pop reports and Heritage Auctions are future supplemental sources. |
| Automation | **GitHub Actions weekly cron** for cache refresh + featured-gap regeneration. Monday 09:00 UTC. Requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` as repo secrets. |
| Styling | Tailwind CSS |
| Config | `next.config.mjs`, `tailwind.config.cjs`, `postcss.config.cjs` |

---

## Project Structure

```
comixcatalog-beta/
├── .claude/                        # Claude Code settings
├── src/                            # Next.js app source (App Router)
├── public/
│   ├── covers/                     # LEGACY — local cover stubs, to be removed. ComicVine/GCD are the cover sources.
│   ├── avatars/                    # LEGACY — placeholder hero avatars, to be replaced with user image upload
│   ├── favicon/
│   ├── icons/
│   ├── img/
│   ├── sqljs/                      # sql.js WASM (SQLite in browser)
│   ├── sqlite.worker.js
│   ├── wa-sqlite.wasm
│   └── fallback-cover.png
├── scripts/                        # Node utility/migration/diagnostic scripts (this is where new work lives)
├── comicvine_api_output/           # Logs + CSVs from ComicVine ingestion
│   ├── ingest_*.log
│   └── issues_uploaded.csv
├── canonical_covers_diagnostic.py  # Cover URL validation tooling
├── comicvine_api_to_supabase.py    # ComicVine → Supabase cover ingestion
├── gcd_scraper_to_supabase.py      # GCD COVERS scraper — NOT a metadata ingester. Targeted backfill that scrapes comics.org HTML for issues already in user_collections that lack a canonical_covers row.
├── generate_comics_seed.py         # Seed data generation
├── series_lookup_diagnostic.py     # Series lookup debugging
├── scrape.py                       # General scraping utility
├── comics_seed.csv                 # Seed data
├── codebase.txt                    # Codebase snapshot (may be stale)
├── .env.local                      # Environment secrets (never commit)
├── jsconfig.json
├── eslint.config.mjs
└── package.json
```

Note: `target_volumes_seed.py` was referenced in older briefings but has been removed.

---

## Data Sources — Critical Context

### GCD (Grand Comics Database)
- **Primary source of truth** for all comic metadata: series, issues, story arcs, variants, publishers
- Tables prefixed `gcd_*` (`gcd_series`, `gcd_issues`, `gcd_publishers`)
- **Important:** `gcd_scraper_to_supabase.py` does NOT populate these tables. It's a *covers* scraper that hits comics.org HTML for issues in user collections. The metadata tables were populated by an earlier ingest (likely from GCD's public Postgres dump) that's no longer in the repo. If you need to refresh `gcd_issues` from source, you'll need to either rebuild that pipeline or download a fresh GCD dump.
- **GCD bulk-dump audit (May 19, 2026):** investigated whether the dump's `gcd_cover` table could 10x our coverage. **DEAD END.** Two reasons: (a) the user's local dump is metadata-only — no cover tables at all; (b) even if we had cover IDs, `files1.comics.org` is fully Cloudflare-walled — every request returns `Cf-Mitigated: challenge` regardless of User-Agent or Referer. This also explains why `gcd_scraper_to_supabase.py` never wrote a row: same Cloudflare wall. Treat that script as dead code pending removal.

### ComicVine
- Used **only for cover images** — not a metadata source
- Ingested via `comicvine_api_to_supabase.py`
- Free tier only: ~200 req/hour, 1 req/sec, ~150k req/month ceiling. **No paid tier appears to exist** since Fandom acquired CBS Interactive's API portfolio.
- This constrains our cover ingestion strategy: pure-ComicVine path can't scale fast. Must combine with GCD covers and user uploads.

### Valuation (eBay sold-comps) — replaces GoCollect
- **GoCollect integration is dead** — they did not respond to outreach. Mentions of GoCollect in older code/comments are aspirational, not active.
- **eBay Browse API was the original plan and DOES NOT WORK** — Browse returns only *active* listings, not sold ones. The right endpoint is **eBay Marketplace Insights API**, which exposes `lastSoldPrice` + sale records but requires application + approval (NOT auto-granted by signup). User is awaiting Insights approval as of May 21, 2026; see [[project-ebay-blocked]] memory file.
- **Pipeline foundation already shipped** (May 20, 2026):
  - `market_comps` table — `scripts/migrations/0006_market_comps.sql` (applied)
  - `src/lib/valuation.js` — `gradeBucket()`, `snapToCgcGrade()`, `bucketFallbacks()`, `median()`
  - `src/lib/marketValue.js` — `getMarketValue()` + `getMarketValuesBulk()` with fallback chain
  - `src/lib/ebayTitleParser.js` — parses listing titles into structured grade/issue/bucket
  - `scripts/fetchEbayComps.js` — full pipeline scaffold; `fetchSoldListings()` is the only stub, ready to receive the real Insights endpoint when approval lands. Test via `--dry-run`.
  - `/api/library-hydrate` + library UI already wired to display `auto_market_value` when comps exist. Renders nothing while table is empty.
- Future supplemental sources: CGC pop reports (slab values), Heritage Auctions API (auction comps for keys), MyComicShop buy-list (floor price).
- **Facebook Marketplace was considered and ruled out** — no API since deprecation, scraping is hostile + TOS-violating, and FB doesn't expose sold prices (only asking prices). Bad signal-to-noise even if scrapable.

---

## Database Schema — Know These Exactly

### Column Names (these have caused bugs — use exact names)
- `grade_numeric` ← NOT `grade_num`
- `slab_company` ← NOT `slab_comp`
- `gcd_issue_id` — **integer** column. Always coerce explicitly via `Number()`, never rely on Postgres implicit string→int casting.

### Two parallel "series" tables — DO NOT confuse
- `series` — **canonical / app-facing**. UUID primary key. Has resolved publisher, cached counts, title_normalized for search. This is what API routes should join.
- `gcd_series` — **raw GCD mirror**. `gcd_id` integer primary key. Holds `name`, `sort_name`, `year_began`, `year_ended`, `publisher_gcd_id`. Currently surfaced for `publisher_gcd_id` (series-level publisher resolution); `sort_name` and `year_ended` are available for future ordering/prune work.

### Backup tables — DO NOT query
- `series_backup`, `series_foreign_prune_backup`, `series_zero_issue_backup` — leftovers from past migrations. Read-only safety nets, not live data.
- `comics_predupe_backup` — snapshot from May 2026 `dedupeComicsByContent.js` run that removed 1.65M legacy GCD-ingest rows from `comics`. Safe to drop after ~30 days clean.

### Tables (Supabase `public` schema)

#### `profiles`
PK `id` (uuid, FK → `auth.users.id`).
Columns: `username`, `is_public`, `created_at`, `avatar_key`, `avatar_url`, `is_founding_collector`, `is_pro`, `stripe_customer_id`.
- `is_pro` is the Stripe-driven flag. Admin is treated as Pro via `ADMIN_ID` short-circuit, NOT this column.
- `stripe_customer_id` is mode-sensitive — a live-mode `cus_…` will fail under a test-mode key (we hit this).

#### `user_collections`
PK `id` (uuid). FKs: `user_id` → `auth.users`, `comic_id` → `comics.id`, plus a non-FK `gcd_issue_id` (int4) link.
Columns: `status`, `condition`, `grade_numeric` (numeric), `slab_company`, `slab_cert_number`, `notes`, `purchase_price` (numeric), `market_value` (numeric), `publisher`, `created_at`, `created_by`, `user_cover_url`, `auto_market_value` (numeric), `auto_market_value_at` (timestamptz), `auto_market_value_n` (int4).
- A row is either-or: `comic_id` set (local comic) OR `gcd_issue_id` set (GCD issue). Never both.
- `status` values seen: `owned`, `wishlist`, `for_sale`.
- `user_cover_url` — user-uploaded photo of their specific copy. Set via GradeEditor. Stored at `library/<collection_id>.<ext>` in `comic-covers` bucket.
- `auto_market_value` — median sold price from `market_comps` for this issue's grade bucket. Phase 2 wired via migration 0006. User-entered `market_value` overrides this in the UI.
- `auto_market_value_n` — sample size that fed the median. Surfaced in the library row tooltip ("auto, 5 sales") so users can judge confidence.

#### `comics` (user/local-contributed comics)
PK `id` (uuid). FKs: `series_id` → `series.id`, `created_by` → `auth.users.id`.
Columns: `series_title`, `issue_number`, `publisher`, `release_year` (int4), `variant_name`, `created_at`, `gcd_id` (int4 — when this user-comic was matched to a GCD issue).
- ~140 actual user-contributed rows. The rest were legacy GCD-ingest duplicates, deduped May 2026 via `scripts/dedupeComicsByContent.js`.

#### `comic_covers` (user-submitted covers for `comics`)
PK `id` (uuid). FK `comic_id` → `comics.id`, `uploaded_by` → `auth.users.id`.
Columns: `image_path` (path inside `comic-covers` storage bucket), `is_official` (bool), `is_primary` (bool), `created_at`.

#### `series` (canonical, app-facing)
PK `id` (uuid). FK `publisher_id` → `publishers.id`. Bridge to GCD via `gcd_id` (int4).
Columns: `title`, `created_at`, `cv_publisher`, `issue_count_cached`, `year_start_cached`, `year_end_cached`, `resolved_publisher_cached`, `featured_cover_path_cached`, `search_refreshed_at`, `title_normalized`.
- The `*_cached` columns are refreshed by `scripts/refreshSeriesSearchCache.js`. **Last full pass (May 21, 2026): 217,663 series; 85.5% have `year_start_cached`, 2.6% have `featured_cover_path_cached`.**
- Year coverage jumped from 79.4% → 85.5% by falling back to `gcd_issues.key_date` when `publication_date` is null. Remaining 14.5% are genuinely undated in GCD.
- Cover-coverage ceiling is the source data. `canonical_covers` is up to ~63k rows (post-May-2026 ingest) but covers concentrate on a small set of distinct titles. Raising coverage means more ComicVine ingest under the 200/hour budget, NOT script changes.
- **Pagination bug fix (May 19, 2026):** the `canonical_covers` fetch inside `processBatch()` was missing `.range()` pagination. PostgREST silently capped responses at 1000 rows per batch, so cover-heavy titles ("The Amazing Spider-Man" alone has 917 rows) got truncated and the matcher saw a partial pool. Bug + fix in [scripts/refreshSeriesSearchCache.js:261-291](scripts/refreshSeriesSearchCache.js#L261-L291). After fix: 2.4% → 2.6%, modest because the truncation wasn't as systematic as feared.
- **Variant dedupe (Phase 1):** `issue_count_cached` collapses `1`, `1 [Newsstand]`, `1 [Variant Cover]` to a single base issue via `baseIssueNumber()`. Proper variant *schema* (variant_of_gcd_id, variant_name, variant_type) deferred until variant ingestion sources are settled.

#### `gcd_series` (raw GCD mirror)
PK `gcd_id` (int4). FK `publisher_gcd_id` → `gcd_publishers.gcd_id`.
Columns: `name`, `sort_name`, `year_began`, `year_ended`.

#### `gcd_issues`
PK `gcd_id` (int4). FK `series_gcd_id` → `series.gcd_id` AND `gcd_series.gcd_id`. Also `publisher_gcd_id` → `gcd_publishers.gcd_id`.
Columns: `issue_number`, `title`, `publication_date`, `key_date`.
- `publication_date` is null on ~65% of rows. `key_date` (GCD's sortable approximation) fills most of that gap — use `bestYearFor(row)` helper, never raw `parseYear(publication_date)`.

#### `gcd_publishers`
PK `gcd_id` (int4). Columns: `name`, `year_began`, `year_ended`.

#### `publishers` (canonical publishers used by `series.publisher_id`)
PK `id` (uuid). Columns: `name`, `created_at`, `gcd_id` (int4 — bridge to `gcd_publishers`).

#### `canonical_covers` (ComicVine + GCD-sourced canonical issue covers)
PK `id` (uuid). Columns: `source`, `source_issue_url`, `external_issue_id`, `series_title`, `issue_title`, `issue_number`, `publisher`, `cover_date`, `in_store_date`, `description`, `original_cover_url`, `storage_path` (inside `canonical-covers` storage bucket), `comicvine_volume_id` (uuid), `series_year` (int4), `created_at`.
- Lookup is by `(series_title, issue_number)` — there's no FK to `series` or `gcd_issues`. Mismatched titles are a real failure mode; the matcher in `/api/series/[id]` applies a year-span tolerance to prevent cross-volume bleed (e.g. 2022 cover landing on 1993 Robin #1).

#### `blog_comments`
PK `id` (uuid). FKs `user_id` → `auth.users.id`, `post_id` → blog posts table.
Columns: `content`, `created_at`.

#### `market_comps` (shipped May 20, 2026 — migration 0006)
PK `id` (uuid). FK: loose `gcd_issue_id` (nullable — eBay titles don't always match a known issue, we still capture the row for review).
Columns: `grade_bucket` (text, NOT NULL — output of `gradeBucket()`), `slab_company`, `grade_numeric` (numeric 3,1), `condition_label`, `sold_price` (numeric 10,2 NOT NULL), `sold_currency` (default 'USD'), `sold_date` (date NOT NULL), `source` (text NOT NULL — 'ebay' / 'heritage' / future), `external_listing_id` (text NOT NULL — dedup key), `listing_url`, `listing_title`, `fetched_at`, `created_at`.
- Unique index on `(source, external_listing_id)` — refetching same eBay listing UPSERTs.
- Hot-path index on `(gcd_issue_id, grade_bucket, sold_date DESC)` for median lookups over last 90 days.
- **Currently empty** — populated by `scripts/fetchEbayComps.js` once eBay Insights API access is approved.

### Storage buckets
- `comic-covers` — user-submitted covers via `comic_covers.image_path`. Also where per-library-item user photos will live (under `library/<collection_id>.<ext>` once the migration lands).
- `canonical-covers` — ComicVine + GCD-sourced covers via `canonical_covers.storage_path`.

### Per-Collection-Item Fields (already in DB, surface in UI)
| Column | Description |
|---|---|
| `condition` | Raw grade label (VF, NM, FN, etc.) |
| `grade_numeric` | CGC/CBCS numeric grade (0.5–10.0) |
| `slab_company` | CGC, CBCS, or PGX |
| `slab_cert_number` | Links to live CGC/CBCS registry lookup |
| `notes` | Freeform per-issue collector notes |
| `purchase_price` | What the user paid (numeric) |
| `market_value` | Self-reported current value (numeric). Phase 2: becomes user override on top of eBay-comp-derived `auto_market_value`. |

---

## Domain Vocabulary

Always use these terms correctly in code, comments, and UI copy:

| Term | Meaning |
|---|---|
| **Key issue** | High-value comic (first appearances, deaths, origins, etc.) |
| **Newsstand** | Barcode variant sold at newsstands; commands different (often higher) value than direct |
| **Direct edition** | Sold through comic shops; the more common variant |
| **Raw** | Ungraded comic, not in a slab |
| **Slabbed** | Professionally graded and sealed by CGC, CBCS, or PGX |
| **Grade** | Numeric (0.5–10.0 CGC scale) or label (VF, NM, GD, etc.) |
| **Slab cert number** | Unique ID linking to CGC/CBCS live population registry |
| **Run** | The complete set of issues in a series |
| **Story arc** | A named multi-issue narrative within a series |
| **Variant** | Alternate cover or print of the same issue number |
| **Pop report / Census** | CGC data showing how many copies graded at each grade level |
| **Comps** | Recently sold comparable listings used to estimate market value |

---

## Subscription Tiers

| Tier | Price | Notes |
|---|---|---|
| **Free** | $0 | Basic collection tracking, search, public profile. No export. |
| **Supporter** (Patreon) | $3/mo | Badge, Discord access, behind-the-scenes updates |
| **Collector Beta** (Patreon) | $8/mo | Early feature access, feature voting, beta previews |
| **Founding Collector** (Patreon) | $20/mo | Limited tier. Permanent badge, name on founders page, roadmap access |
| **Collector Pro** (in-app) | $8/mo | Grading tools, PDF export, unlimited import. *Priced to match Patreon Collector Beta — no cannibalization.* **Phase 2 launch.** |
| **Vault** (in-app) | $18/mo | PDF reports, private sharing link, priority marketplace placement. **Phase 2.** |
| **Verified Collector badge** | $10 one-time | Links CGC registry to profile. Marketplace credential. |

**Marketplace fee:** 5–8% per transaction (Discogs takes 8% for reference)

Patreon Founding Collectors get grandfathered Pro status in-app via `is_founding_collector` short-circuit (planned alongside Stripe wiring).

---

## Feature Roadmap

### Phase 1 — Stabilize ✅ COMPLETE (May 2026)
- [x] Fix `/api/comics/[id]/route.js` (was a React component, not an API handler)
- [x] Fix comic detail page (was fetching 500 records to find one)
- [x] Upgrade SearchPageClient (dynamic publisher filters, skeleton loading)
- [x] Fix column name mismatches (`grade_num` → `grade_numeric`, `slab_comp` → `slab_company`)
- [x] Align `gcd_issue_id` integer handling across LibraryContext
- [x] Surface `gcd_series.publisher_gcd_id` as series-level publisher candidate
- [x] Error boundaries (`app/error.js`, `app/global-error.js`, `app/not-found.js`)
- [x] Profile page Discogs-style overhaul (`/u/[username]`)
- [x] `/search` browse curated featured-series tiles (no more "Untitled #[nn]" garbage)
- [x] `comics` table garbage audit + 1.65M legacy-row dedupe (`scripts/dedupeComicsByContent.js`)
- [x] US-publisher allowlist applied to browse + typed search
- [x] Year-aware publisher resolution (pre-2000 trusts GCD indicia, modern trusts cv) replicated into cache refresh
- [x] Variant-aware issue count dedupe (`baseIssueNumber()` collapses bracketed/slash-year suffixes)
- [x] `key_date` fallback for year coverage — 79.4% → 85.5%
- [x] Cache refresh hardened with retry-on-57014 and cursor persistence (`scripts/.refresh-cursor`)
- [x] North Star alignment audit ([docs/north-star/PHASE1_AUDIT.md](docs/north-star/PHASE1_AUDIT.md))

### Phase 2 — Revenue Engine ← CURRENT PHASE (target: July 2026)

Three parallel tracks. Track C is what unblocks Stripe.

**Track A — Cover Ingestion (unblocks visual quality)**
- [x] GCD bulk dump audit — *dead path, Cloudflare blocks `files1.comics.org`*
- [x] Targeted ComicVine ingest via `gap-targets.json` / `gap-featured.json` — 21k+ covers added May 18-19
- [x] Cache truncation bug fix — coverage measurement is now accurate
- [x] Dual-mode gap generator (`scripts/generateCoverGapTargets.js --mode=depth|width|both`)
- [x] Rate-limit guard on ComicVine ingester (`--max-search-calls`, `--vol-sleep`, `RateLimited` exception)
- [x] Weekly GitHub Actions cache refresh + featured-gap regeneration
- [ ] User-upload UGC flow (Discogs's moat — Phase 3 priority)

**Track B — Valuation Pipeline (unblocks PDF credibility)**
- [x] `market_comps` table + `auto_market_value` columns on `user_collections` (migration 0006)
- [x] `gradeBucket()` + bucketing helpers
- [x] `getMarketValue()` + bulk variant with fallback chain
- [x] eBay listing-title parser (`src/lib/ebayTitleParser.js`)
- [x] `scripts/fetchEbayComps.js` scaffold with `--dry-run` verified end-to-end
- [x] `/api/library-hydrate` + library UI render `auto_market_value` when present
- [ ] Wire real eBay Marketplace Insights API call (blocked on user's account approval)
- [ ] First real backfill run + median calibration

**Track C — Convergence (depends on A and B)**
1. **Grading & Condition UI** — *largely shipped* via `GradeEditor` component. Inline editing on library items, grade badges, slabbed vs raw toggle, user cover photo upload. See [src/components/GradeEditor.js](src/components/GradeEditor.js).
2. **Insurance/Appraisal PDF Report** ← PRIMARY revenue feature. `/api/export/pdf` endpoint exists and is gated behind `isPro`. Layout quality TBD — needs design pass.
3. **Stripe + Pro Tier Launch** — Wired (`isPro` flag, `?upgrade=success/cancelled` banners, `/upgrade` page). Awaiting final polish + launch readiness.

### Homepage Featured Carousel (shipped May 21, 2026)

Curated [src/lib/featuredSeries.js](src/lib/featuredSeries.js) — ~79 entries across four tiers (current heat → recent classics → perennial icons → indie staples). Each entry resolves to an actual `series` row via `(title, publisher, prefer_year)`. `/api/comics` rotates the list weekly with a Mulberry32 PRNG seeded by ISO-week index — same view all week, fresh order every Monday. Tier 1 (current heat: Absolute Batman, Ultimate Spider-Man, etc.) always leads.

To regenerate against current taste: edit `featuredSeries.js` directly. Then run `npm run covers:gap-featured` to find which curated entries lack covers, then a targeted ComicVine ingest fills them in.

### Auth UX (refactored May 21, 2026)

Three bugs fixed:
1. **Initial-session race in AuthContext** — `useEffect` now explicitly calls `supabase.auth.getSession()` on mount and feeds the result through the same `applySession()` handler the listener uses. Previously relied solely on `onAuthStateChange` firing INITIAL_SESSION, which dropped silently in certain timing scenarios.
2. **Dropdown identity always visible** — UserMenu now falls through to `user.email` if no profile.username exists. The bare "Account" fallback string is unreachable.
3. **Switch Account affordance** — new button between "Manage Pro" and "Sign out" that signs out and lands directly on `/login` via `window.location.href` (avoiding the `router.replace("/")` race that would otherwise send users to homepage).

### Phase 3 — Daily Engagement (target: Sept 2026)
- Portfolio value tracking with over-time charts (Phase 2's `market_comps` snapshots feed this directly)
- Want list price alerts (email/push when threshold crossed)
- Collection intelligence ("You own 11 of 15 Uncanny X-Men key issues — here are the 4 you're missing")
- Run completion percentage / gamification
- Duplicate detection
- Proper variant schema (variant_of_gcd_id, variant_name, variant_type) once a paid variant data source is established

### Phase 4 — Marketplace Soft Launch (target: Nov 2026)
- Pro users only initially
- Verified grade badges on listings
- Seller reputation scores
- Stripe Connect for payouts
- In-app buyer/seller messaging (revival of the wallpapered-over inbox feature)

### Phase 5 — Scale (2027+)
- Open marketplace to all verified users
- CGC census/population data integration
- React Native mobile app
- PR push: comic news sites, YouTube collectors, CGC forums

---

## Strategic Posture

- **The dataset is the moat, not a product.** External API access is not a revenue track. GCD's CC BY-SA license, ComicVine's TOS, and eBay's redistribution prohibition all make a paid-API offering legally untenable. The combined dataset is most valuable as the exclusive foundation under ComixCatalog itself — same posture as Discogs.
- **Partnerships over API sales.** Trade data access for distribution (LCS POS integrations, grader partnerships, insurance/appraisal channel deals).
- **Cover coverage compounds via UGC.** Long-term, user uploads will dwarf any API-sourced cover library. Build that flow well in Phase 3.

---

## Engineering Reminders

- **API routes must be API routes.** Don't let Next.js page/component patterns bleed into `/api/` handlers — this has burned us before.
- **Never fetch more records than needed.** The 500-record-to-find-one bug is fixed — don't reintroduce patterns like it.
- **PostgREST 1000-row cap is silent.** Any `.in()` or `.select()` without `.range()` will silently cap at 1000 rows. This bit us twice (`diagnoseIssuesData.js` and the cache-refresh canonical_covers fetch). Always paginate with `.range(from, from + PAGE - 1)` in a loop when you might exceed 1000 rows.
- **`runWithRetry()` returns `data` directly, NOT `{data, error}`.** Destructuring it as `{data, error} = await runWithRetry(...)` silently produces undefined and breaks downstream — that's how the pagination fix was botched the first time. See [scripts/refreshSeriesSearchCache.js:40-68](scripts/refreshSeriesSearchCache.js#L40-L68).
- **Year handling:** use `bestYearFor(row)` (publication_date → key_date fallback), never raw `parseYear(publication_date)`.
- **Publisher resolution:** prefer `series.resolved_publisher_cached` (year-aware, audited) over re-running `resolvePublisher()` on request. Re-resolving introduces the "1984 TMNT shows IDW" regression. Only re-resolve as a fallback when the cached value is null.
- **Issue dedupe:** use `baseIssueNumber()` to collapse variant suffixes when counting issues. Don't double-count `1`, `1 [Newsstand]`, `1 [Variant Cover]`.
- **`gcd_issue_id` is an integer.** Treat it consistently everywhere — no implicit string coercion.
- **Cover image priority:** `canonical_covers.storage_path` → `public/fallback-cover.png`. The `public/covers/` local stubs are legacy and should be removed — do not add to them.
- **User avatars:** The `public/avatars/` hero image set is legacy. The target is user-uploaded profile photos. Do not build new features that depend on the static avatar set.
- **`gcd_scraper_to_supabase.py` does NOT ingest GCD metadata.** It's a covers scraper hitting comics.org HTML. If you need to rebuild `gcd_issues` from source, that pipeline is not in the repo and must be rebuilt from a fresh GCD Postgres dump.
- **GoCollect is dead.** Do not write new code against any GoCollect endpoint. Valuation goes through eBay Browse API.
- **No external API as a product.** Internal use only. Don't build endpoint surfaces designed for third-party developer consumption.
- **Tailwind only** for styling. Config is in `tailwind.config.cjs`. No inline styles for layout.
- **`.env.local`** holds all secrets (Supabase, ComicVine, Stripe, eBay). Never commit it.
- **GitHub Actions secrets** mirror `.env.local` for the weekly cron — `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` only. Workflow file: [.github/workflows/weekly-refresh.yml](.github/workflows/weekly-refresh.yml).
- **Python scripts in root** are data pipeline tools (ingestion, seeding, diagnostics) — not part of the Next.js app runtime. New scripts go in `scripts/` (Node).
- **`codebase.txt`** is a snapshot that may be stale — don't treat it as ground truth.
- **npm scripts for cover ops:** `covers:gap-featured` (curated gap list), `covers:gap-both` (depth + width modes), `covers:refresh-cache` (full --force refresh), `covers:refresh-cache-test` (single-batch smoke test), `covers:weekly` (refresh + gap regen). Python ingest stays manual (rate-limit risk).
- **eBay parser uses relative imports**, not `@/` aliases — `src/lib/ebayTitleParser.js` imports from `./valuation.js` so it works from raw Node scripts like `scripts/fetchEbayComps.js`. Don't switch it to `@/lib/valuation`; that path only resolves under Next.js.

---

## What Success Looks Like

A user can:
1. Search for any comic series or issue
2. Add it to their collection with grade, condition, variant type, and notes
3. See their total collection's estimated value, automatically derived from recent sold comps
4. Generate a PDF report suitable for insurance or estate planning
5. List books for sale and complete transactions with other collectors
6. Get alerted when a want-list issue drops to their target price
7. See what key issues they're missing from a run they're building
