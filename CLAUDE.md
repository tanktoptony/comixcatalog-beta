# ComixCatalog — Claude Code Project Briefing

> Solo founder project, part-time around a separate day job as of 2026-09-08. Built in Chicago. Goal: replace bartending income with recurring revenue. No fixed date — see `docs/LAUNCH_CHECKLIST.md`'s header; the "end of summer 2026" target here assumed full-time hours that aren't the current reality.
> Tagline: "Built by collectors, for collectors."
> Site: comixcatalog.com | @comixcatalog

---

## The North Star

**ComixCatalog is a Discogs body wearing comic-shop clothes.** (Reframed 2026-09-13 — full reasoning in `docs/north-star/NORTH_STAR.md` §1/§1.2, don't duplicate it here, just don't contradict it.)

The architecture is still Discogs: a comprehensive community-built database, personal collection management, and a trusted peer-to-peer marketplace, one platform, strong collector identity. When in doubt about whether a **capability** belongs, ask "does Discogs do this, and does it make sense for comics?"

But that comparison is retired as the *external* pitch — "catalog + tracker + future marketplace, kind of like Discogs" makes a new visitor translate before they care. Externally this is **"the comic shop that belongs to you"** — Collect / Discover / Connect, not catalog / track / marketplace. How a shipped capability gets *named and explained* (copy, onboarding, empty states, notifications) runs through the comic-shop test, not the Discogs one. Two different questions — see NORTH_STAR.md §1.2 before writing user-facing copy.

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
| Automation | **`cover-ingest.yml` runs hourly** (real ComicVine ingest). **`weekly-refresh.yml` + `gap-probe.yml` run Mon+Thu 08:00/09:00 UTC** (changed from Monday-only 2026-09-12 — once-a-week gap-list regen was getting fully consumed by the hourly ingest in ~4 days, causing a recurring multi-day stall). `cron-watchdog.yml` force-triggers either if its last success exceeds a 5-day grace window. Requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` as repo secrets. |
| Styling | Tailwind CSS |
| Config | `next.config.mjs`, `tailwind.config.cjs`, `postcss.config.cjs` |

### Cover scanning

`POST /api/cover-scan` accepts an authenticated, client-resized cover image and uses `claude-opus-5-5` to extract visible catalog metadata. It requires the server-only `ANTHROPIC_API_KEY`. Daily limits are 10 for regular members and 100 for `profiles.is_pro` members (the fixed admin ID also receives the Pro limit), measured per UTC day. `PATCH /api/cover-scan` records the issue chosen from a scan result.

Scan records live in `cover_scans`. Original photos are retained in the private `cover-scans` storage bucket at `<user_id>/<scan_id>.jpg`; service role writes, and owners may read their own objects. Migration: `scripts/migrations/0040_cover_scans.sql`.

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
- **Important:** `gcd_scraper_to_supabase.py` does NOT populate these tables. It's a *covers* scraper that hits comics.org HTML for issues in user collections. The metadata tables came from an old GCD dump and can lack entire series. `scripts/importGcdSeries.js --gcd-ids=...` imports a known missing series and its issue details. `gcd-publisher-sync.yml` follows a completed publisher pass with a cursor-based walk of GCD's series list, adding eligible English-language US and Canadian gaps without per-series requests. `gcd-issue-refresh.yml` tops up issue details for active catalog targets every 3 hours.
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
  - `src/lib/compMatch.js` — `compMatchesIssue()` / `filterCompsForIssue()`: decides whether a listing title is this exact issue (same series, in-range year, a plain copy, not a reprint/facsimile/later printing/signed/variant/lot). Applied at write time in the fetch script and again at read time, so rows stored before it existed stop counting too. Tests: `npm run test:comp-match`.
  - `src/lib/compValue.js` — `valueFromComps()`: the one valuation implementation (filter → bucket chain → low-grade slab proxy for ungraded books → cover-price floor from 1990 on only; pre-1990 books with no clean comps show no value).
  - `src/lib/marketValue.js` — `getMarketValuesBulk()` loads comps + issue/series metadata and calls `valueFromComps()`; `getMarketValue()` is a one-item wrapper.
  - `src/lib/ebayTitleParser.js` — parses listing titles into structured grade/issue/bucket
  - `scripts/fetchEbayComps.js` — live daily job (Browse API, asking prices). Pre-2000 issues get a second search with the year appended, merged on listing id.
  - `/api/library-hydrate` + library UI already wired to display `auto_market_value` when comps exist. Renders nothing while table is empty.
- Future supplemental sources: CGC pop reports (slab values), Heritage Auctions API (auction comps for keys), MyComicShop buy-list (floor price).
- **Facebook Marketplace was considered and ruled out** — no API since deprecation, scraping is hostile + TOS-violating, and FB doesn't expose sold prices (only asking prices). Bad signal-to-noise even if scrapable.

---

## Cover Coverage — Canonical Metric

**When asked "where are covers at?" — don't re-derive this from scratch or eyeball two unrelated raw counts.** Read `reports/cover-coverage-history.json` (latest entry + trend vs. the prior row) and, if the user wants the last day/two's activity too, glance at `reports/covers-latest.html` or recent `canonical_covers` inserts. Both are regenerated nightly (06:00 UTC, `.github/workflows/nightly-cover-report.yml` → `scripts/generateNightlyCoverReport.js`) and committed to the repo, so this should almost never require a fresh DB query. If the history file looks stale (>2 days old), run `node scripts/reportCatalogCoverage.js` for a live number.

**The one number that matters is allowlisted-corpus coverage** — covered issues ÷ every issue from a real, commercially-released US-market series (~45 publishers in `US_PUBLISHER_ALLOWLIST`, variant-deduped), computed in `scripts/lib/coverageMetrics.js`. Baseline as of 2026-08-28: **87,799 / 255,070 covered (34.42%)**, 167,271 issues remaining, 3,218 of 47,236 allowlisted series have at least one cover.

Two other numbers exist and are both traps if used alone:
- **Raw** (`canonical_covers` rows ÷ all 2.4M `gcd_issues`): denominator is mostly foreign reprints/licensed editions/GCD ephemera nobody will ever search for. Always looks catastrophically low (~4.6%) — not actionable, don't lead with it.
- **Total covers vs. total series** (e.g. "109k covers, 207k series, so ~100k to go"): **this comparison is invalid** — one is per-issue, the other is per-series, and a series can have anywhere from 1 to 900+ issues. This exact mistake happened live on 2026-08-28; don't repeat it.

Don't confuse this with the separate "launch-gate priority" coverage number sometimes seen in scripts (covers ÷ issues tied to real user collections/wishlists/featured picks) — that one's denominator is small and cherry-picked, always looks great, and says nothing about the other ~44k untouched series.

At current ComicVine free-tier ingest pace (hourly cron, rate-limited), closing the ~167k-issue gap is a multi-month project, not a sprint — see `reports/cover-coverage-history.json`'s day-over-day `allowlistedCoveragePct` delta for the actual real-world pace rather than guessing.

---

## Database Schema — Know These Exactly

### Column Names (these have caused bugs — use exact names)
- `grade_numeric` ← NOT `grade_num`
- `slab_company` ← NOT `slab_comp`
- `gcd_issue_id` — **integer** column. Always coerce explicitly via `Number()`, never rely on Postgres implicit string→int casting.

### Two parallel "series" tables — DO NOT confuse
- `series` — **canonical / app-facing**. UUID primary key. Has resolved publisher, cached counts, title_normalized for search. This is what API routes should join.
- `gcd_series` — **raw GCD mirror**. `gcd_id` integer primary key. Holds `name`, `sort_name`, `year_began`, `year_ended`, `publisher_gcd_id`, and (migration 0028, 2026-09-21) `publishing_format`, `binding`, `format_notes`, `format_synced_at`, filled incrementally from GCD's API by `scripts/syncGcdSeriesFormat.js`. `src/lib/seriesFormat.js` turns those into "is this a collected edition"; null format = not synced = treated as not collected. Currently surfaced for `publisher_gcd_id` (series-level publisher resolution); `sort_name` and `year_ended` are available for future ordering/prune work.

### Backup tables — DO NOT query
- `series_backup`, `series_foreign_prune_backup`, `series_zero_issue_backup` — leftovers from past migrations. Read-only safety nets, not live data.
- `comics_predupe_backup` — snapshot from May 2026 `dedupeComicsByContent.js` run that removed 1.65M legacy GCD-ingest rows from `comics`. Safe to drop after ~30 days clean.

### Tables (Supabase `public` schema)

#### `profiles`
PK `id` (uuid, FK → `auth.users.id`).
Columns: `username`, `is_public`, `created_at`, `avatar_key`, `avatar_url`, `is_founding_collector`, `is_pro`, `stripe_customer_id`.
- `is_pro` is the Stripe-driven flag. Admin is treated as Pro via `ADMIN_ID` short-circuit, NOT this column.
- `stripe_customer_id` is mode-sensitive — a live-mode `cus_…` will fail under a test-mode key (we hit this).
- **`is_pro`, `is_founding_collector` and `stripe_customer_id` are server-only (migration 0032a/0032b, 2026-10-05).** A trigger rejects any change to them unless the caller is the service role or postgres, because the "Users can update own profile" policy has no column limit and owners could otherwise grant themselves Pro. Browsers can't read `stripe_customer_id` at all, so client code must select explicit columns from `profiles`, never `select("*")`. A new `profiles` column needs adding to 0032b's grant list or browsers can't read it.

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
Columns: `title`, `created_at`, `cv_publisher`, `issue_count_cached`, `year_start_cached`, `year_end_cached`, `resolved_publisher_cached`, `featured_cover_path_cached`, `search_refreshed_at`, `title_normalized`, `comicvine_volume_id` (migration 0022).
- The `*_cached` columns are refreshed by `scripts/refreshSeriesSearchCache.js`. **Last full pass (May 21, 2026): 217,663 series; 85.5% have `year_start_cached`, 2.6% have `featured_cover_path_cached`.**
- Year coverage jumped from 79.4% → 85.5% by falling back to `gcd_issues.key_date` when `publication_date` is null. Remaining 14.5% are genuinely undated in GCD.
- Cover-coverage ceiling is the source data. `canonical_covers` is ~119.6k rows (verified live 2026-09-18; the older "~63k" figure was a May-2026 reading) but covers concentrate on a small set of distinct titles. Raising coverage means more ComicVine ingest under the 200/hour budget, NOT script changes.
- **Pagination bug fix (May 19, 2026):** the `canonical_covers` fetch inside `processBatch()` was missing `.range()` pagination. PostgREST silently capped responses at 1000 rows per batch, so cover-heavy titles ("The Amazing Spider-Man" alone has 917 rows) got truncated and the matcher saw a partial pool. Bug + fix in [scripts/refreshSeriesSearchCache.js:261-291](scripts/refreshSeriesSearchCache.js#L261-L291). After fix: 2.4% → 2.6%, modest because the truncation wasn't as systematic as feared.
- **`featured_cover_path_cached` is unique per series row. Do not reintroduce title-string pooling (Sept 20, 2026).** The featured-cover candidate pool used to be a raw `.in("series_title", …)` match, so every same-titled volume competed for the same covers. Live measurement before the fix: 1,461 storage_paths were cached on more than one series row, covering 5,365 of the 9,074 rows that had a cover at all (worst: 32 rows on one Tarzan cover, 29 Batman, 12 X-O Manowar). The pool is now scoped by attribution — Tier 1 `canonical_covers.series_gcd_id == series.gcd_id`, Tier 2 `canonical_covers.comicvine_volume_id == series.comicvine_volume_id`, Tier 3 title match restricted to covers whose `series_gcd_id IS NULL`. Tiers 1/2 are volume-exact so they carry no year threshold; Tier 3 keeps ±10 years. After: 7,550 series, 7,550 distinct paths, zero duplicates.
- **The invariant is enforced by `reconcileDuplicateFeaturedCovers()`, not by in-memory state.** An earlier attempt hardened the per-title `claimed` set inside `processBatch()` into a hard exclusion and still shipped the 12-way X-O Manowar collision, because that set only spans one batch of 100 and `--force` orders by UUID — same-title siblings scatter across ~2,000 batches. The reconciliation pass reads the whole table's final committed state, picks one winner per contested path, and nulls the rest. It runs after every pass and standalone via `--reconcile-only`. A partial unique index was rejected: per-row UPDATEs would fail mid-run and leave rows at their **stale** value rather than null.
- **Verify matcher changes with `--only-ids-file=<path>`, not `--only-ids=`.** The previous fix passed verification on 46 rows via `--only-ids`, which fit in a single batch and so could not exercise the cross-batch bug it was meant to fix. `--only-ids-file` chunks an arbitrarily long id list across batches; ~14k series is the population with any cover data at all, and runs in ~100 minutes vs ~6h for the full 207k pass.
- **Variant dedupe (Phase 1):** `issue_count_cached` collapses `1`, `1 [Newsstand]`, `1 [Variant Cover]` to a single base issue via `baseIssueNumber()`. Proper variant *schema* (variant_of_gcd_id, variant_name, variant_type) deferred until variant ingestion sources are settled.
- **Series search migration 0038:** `search_series_by_relevance` accepts lowercase words with spaces, derives the compact form internally, matches exact/prefix/substring first, then all significant words in any order, and only uses pg_trgm typo matching when those tiers return fewer than 20 rows. Stopwords are `a`, `an`, `and`, `of`, and `the`. Both search routes retry the legacy compact RPC input when the spaced call returns no rows, so ordinary searches keep working during deployment. Apply 0038 before relying on missing-word or typo behavior.

#### `gcd_series` (raw GCD mirror)
PK `gcd_id` (int4). FK `publisher_gcd_id` → `gcd_publishers.gcd_id`.
Columns: `name`, `sort_name`, `year_began`, `year_ended`.
- `scripts/discoverGcdSeries.js` creates missing mirror and app rows directly from 50-row GCD list pages. It also creates provisional `gcd_issues` rows from `active_issues` and `issue_descriptors`; dates and titles stay null until an issue-detail refresh. The search cache falls back to `gcd_series.year_began/year_ended` when those dates are null.

#### `gcd_issues`
PK `gcd_id` (int4). FK `series_gcd_id` → `series.gcd_id` AND `gcd_series.gcd_id`. Also `publisher_gcd_id` → `gcd_publishers.gcd_id`.
Columns: `issue_number`, `title`, `publication_date`, `key_date`.
- `publication_date` is null on ~65% of rows. `key_date` (GCD's sortable approximation) fills most of that gap — use `bestYearFor(row)` helper, never raw `parseYear(publication_date)`.

#### `gcd_publishers`
PK `gcd_id` (int4). Columns: `name`, `country`, `year_began`, `year_ended`, `synced_at`. `scripts/syncGcdPublishers.js` incrementally mirrors the live GCD publisher API with a committed page cursor. Publisher IDs must come from each API row's `api_url`; never infer them from page position.

`series.us_market` is true when the linked GCD series publisher is US or Canada, except the explicit French-Canadian reprint-house exclusions in `src/lib/usMarket.js`, or when `resolved_publisher_cached` remains in `US_PUBLISHER_ALLOWLIST`. Search uses `us_market OR allowlist`, so the allowlist remains a compatibility path and existing visible series do not disappear.

#### `publishers` (canonical publishers used by `series.publisher_id`)
PK `id` (uuid). Columns: `name`, `created_at`, `gcd_id` (int4 — bridge to `gcd_publishers`).

#### `canonical_covers` (ComicVine + GCD-sourced canonical issue covers)
PK `id` (uuid). Columns: `source`, `source_issue_url`, `external_issue_id`, `series_title`, `issue_title`, `issue_number`, `publisher`, `cover_date`, `in_store_date`, `description`, `original_cover_url`, `storage_path` (inside `canonical-covers` storage bucket), `comicvine_volume_id` (uuid), `series_year` (int4), `created_at`.
- Indexes: `series_gcd_id` (migration 0009), `gcd_issue_id` (0018), and `(series_title, id)` (**0027, applied 2026-09-18**). That last one exists because `series_title` was unindexed while being the column `refreshSeriesSearchCache.js` filters on, which made `cover-ingest.yml` and `weekly-refresh.yml` fail intermittently with Postgres `57014` statement timeouts as the table grew. Composite rather than `series_title` alone so the query's `ORDER BY id` is served by the index instead of sorting matched rows. **If you add a query that filters `canonical_covers` by a new column, check it's indexed** — at this table size an unindexed filter is a scan, and the symptom shows up as a red workflow, not a slow page.
- Lookup is by `(series_title, issue_number)` — there's no FK to `series` or `gcd_issues`. Mismatched titles are a real failure mode; the matcher in `/api/series/[id]` applies a year-span tolerance to prevent cross-volume bleed (e.g. 2022 cover landing on 1993 Robin #1).

#### `cover_variants` (shipped 2026-08-05 — migration `0020_cover_variants.sql`)
PK `id` (uuid). FK `canonical_cover_id` → `canonical_covers.id`, loose `gcd_issue_id` (nullable, same reasoning as `market_comps`).
Columns: `source` ('comicvine'), `source_image_id`, `original_url`, `storage_path`, `caption`, `image_tags`, `sort_order`, `created_at`.
- Populated by `comicvine_api_to_supabase.py` from ComicVine's `associated_images` field on the same bulk issue-list call the ingester already makes — no extra API cost. Read by `src/app/api/issues/[id]/route.js`.
- **`caption`/`image_tags` are not reliable variant labels** — ComicVine returns `caption: null` and a bucket-name `image_tags: "All Images"` for most issues. Any variant-picker UI needs to work as a grid of unlabeled thumbnails, not a labeled dropdown. See `docs/variant-and-collected-editions-spec.md`.
- This corrects the roadmap below, which still listed proper variant schema as deferred/future work as of this writing — the schema and ingestion-time population are done; a user-facing variant picker UI is the remaining piece.

#### `blog_comments`
PK `id` (uuid). FKs `user_id` → `auth.users.id`, `post_id` → blog posts table.
Columns: `content`, `created_at`.

#### `market_comps` (shipped May 20, 2026 — migration 0006)
PK `id` (uuid). FK: loose `gcd_issue_id` (nullable — eBay titles don't always match a known issue, we still capture the row for review).
Columns: `grade_bucket` (text, NOT NULL — output of `gradeBucket()`), `slab_company`, `grade_numeric` (numeric 3,1), `condition_label`, `sold_price` (numeric 10,2 NOT NULL), `sold_currency` (default 'USD'), `sold_date` (date NOT NULL), `source` (text NOT NULL — 'ebay' / 'heritage' / future), `external_listing_id` (text NOT NULL — dedup key), `listing_url`, `listing_title`, `fetched_at`, `created_at`.
- Unique index on `(source, external_listing_id, gcd_issue_id)` (migration 0033, 2026-10-05; was `(source, external_listing_id)`). Refetching the same listing for the same issue UPSERTs; the same listing can be a comp for two issues (near-duplicate GCD series), which the old key bounced between them.
- Hot-path index on `(gcd_issue_id, grade_bucket, sold_date DESC)` for median lookups over last 90 days.
- **No longer empty, but not real sold comps yet** (corrected 2026-08-29 — this doc previously said "currently empty," which was stale). Live count: 6,054 rows as of this writing, 100% `source = 'ebay-listed'` — active ASKING prices via eBay's Browse API (the interim fallback `getMarketValue()` already anticipated, see its comment on `comp_source`), not sold prices from the still-pending Insights API. Treat `auto_market_value` derived from these as a real-but-weaker signal (a listing price, not a confirmed sale) until `source = 'ebay'` rows actually land.

#### `collection_value_history` (shipped 2026-08-29 — migration 0025)
PK `id` (uuid). FK `user_id` → `auth.users.id`.
Columns: `snapshot_date` (date), `total_value` (numeric 12,2), `owned_count` (int4), `created_at`.
- Unique on `(user_id, snapshot_date)` — one row per user per calendar day, upserted by `scripts/snapshotCollectionValue.js` on a 6-hour schedule (`.github/workflows/snapshot-collection-value.yml`). Re-running the same day just keeps that day's row current.
- Values come from `valueFromComps()` in `src/lib/compValue.js`, the same function `src/lib/marketValue.js` uses, imported by relative path. There is no second copy to keep in sync.
- RLS: owner-only `SELECT` for now. Written only via the service-role key (bypasses RLS), so no write policy needed.
- Feeds the Pro value-over-time chart on `/library` (`src/components/ValueHistoryChart.js`, shipped 2026-10-02; helpers + tests in `src/lib/valueHistory.js`). The chart reads rows client-side under the owner-only RLS policy and ends the line on the live library value. Free accounts see a Collector Pro pitch instead. Snapshots include books listed for sale (`OWNED_STATUSES`). The table has to run for a while before that graph is worth showing; there's no way to backfill history, so this started running before the UI that will consume it.

#### `listings` + `marketplace_listings` view (Marketplace v2 Phase 0, migration 0031)
One row per listed copy. FKs `seller_id` → `auth.users`, `collection_id` → `user_collections` (cascade); `gcd_issue_id` required. Status `draft|active|reserved|sold|withdrawn|removed`; partial unique index allows one draft/active/reserved listing per collection row, so unlist/relist keeps withdrawn history.
- Snapshot columns (`series_title`, `issue_number`, `release_year`, `publisher`, `variant_label`, `cover_path`) mean browse never hydrates. The `user_collections_sync_listing` trigger creates/withdraws listings when the library flips `status` to/from `for_sale` (and keeps grade fields in step), filling the snapshot from SQL. `refreshListingSnapshots()` in `src/lib/marketplace.js` then sets the cover + master publisher (cover matching only exists in JS) and stamps `snapshot_refreshed_at`. It runs from `POST /api/listings/sync` (the library calls it after a sale toggle) and before every uncached marketplace read.
- The trigger swallows its own errors (logs a warning) so a marketplace bug can never block a library edit. Reserved listings are left alone by the trigger.
- RLS: public select of active/reserved listings from public sellers (`username` set, `is_public`/`show_for_sale` not false); sellers see their own. **No write policies**: only the trigger and the service role write.
- `marketplace_listings` view = active listings from visible sellers + `seller_username` + the copy's `market_value`/`auto_market_value`. `getListings()`/`getListingsForIssue()` read it, cached under tag `listings` (`revalidateListings()` expires it).
- `/marketplace` UI (`src/components/MarketplaceBrowser.js`) is Discogs-style: a landing page of shelves (just listed, most wanted = listed issues on the most wantlists, most valuable, publishers, top sellers) and, once you search or filter, a facet sidebar with live counts + one-row-per-copy list + 25-per-page pagination. All state is in the URL. Filtering/sorting runs client-side over `getListings()` via pure helpers in `src/lib/marketplaceFacets.js` (tested); fine at beta scale, moves to SQL in Phase 3.
- Sellers edit price/shipping/offers/condition notes/restored/signed via `PATCH /api/listings/[id]` (owner + draft/active only; rules in `src/lib/listingEdit.js`, tested), from the library's "Set price" / "Listed at $X" button (`src/components/ListingEditor.js`).
- Also in 0031, unused until later phases: `listing_photos`, `user_blocks` (users manage their own), `reports` (read own; filed via a server route in Phase 2). Plan: `docs/marketplace-v2-build-brief.md`.

### Storage buckets
- `comic-covers` — user-submitted covers via `comic_covers.image_path`. Also where per-library-item user photos will live (under `library/<collection_id>.<ext>` once the migration lands).
- `canonical-covers` — ComicVine + GCD-sourced covers via `canonical_covers.storage_path`. Never draw them into grids (use `cover-thumbs`). Stored originals are capped at 1600 px tall: the ingester's `shrink_cover_bytes` re-encodes anything over 1 MB on upload, and `scripts/shrinkCoverStorage.js` did the same to the existing bucket on 2026-10-01 (it was 150 GB on a 100 GB plan) after deleting 23k files nothing referenced. Supabase file storage is the plan limit to watch; check it on the org Usage page.
- `cover-thumbs` (public, added 2026-10-01) — 400px WebP of each canonical cover at `w400/<storage_path>.webp`, one-year cache. Any grid, search result, shelf or carousel must wrap its cover URL in `coverThumb()` (`src/lib/coverThumb.js`); `CoverThumbFallback` (mounted in the root layout) swaps a missing thumb back to the original. The ingester writes a thumb with every new cover; `scripts/buildCoverThumbs.js` backfills. Detail pages (issue, comic) still show originals.

- `listing-photo-originals` (private, added 2026-10-02) and `listing-photos` (public, WebP only). Seller photos of an exact copy: the browser uploads to originals through a one-time signed URL (`POST /api/listings/photos/upload-url`), then `POST /api/listings/photos/process` re-encodes with sharp (EXIF rotation applied, ALL metadata incl. GPS dropped, 1600px long edge WebP q80 + 400px thumb) to `l/<owner>/<collection_id>/<photo_id>[.thumb].webp` (never reused, one-year cache) and deletes the original. Rows in `listing_photos` key on `collection_id` (photos belong to the copy). Caps: 10 per copy, 200 per user, 50 per day, 15 MB per upload (`src/lib/listingPhotos.js`). Buckets created by `scripts/createListingPhotoBuckets.js`. HEIC isn't decodable by sharp; iPhone browsers convert to JPEG on upload. `listing-photo-cleanup.yml` runs `scripts/cleanupListingPhotos.js --apply` nightly (07:30 UTC): deletes originals older than 24h and public files no `listing_photos` row references (deleted collection rows cascade the rows, not the files) after a 1h grace. Rules in `scripts/lib/photoCleanupPlan.js` (tested).

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
- [x] North Star alignment audit ([archive/2026-08-repo-cleanup/PHASE1_AUDIT.md](archive/2026-08-repo-cleanup/PHASE1_AUDIT.md) — archived 2026-08-03, Phase 1 is complete so this is a historical record, not a live checklist)

### Phase 2 — Revenue Engine ← CURRENT PHASE (no fixed target date — see header note above)

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

### Phase 3 — Daily Engagement (sequenced after Phase 2, no fixed date)
- Portfolio value tracking with over-time charts (Phase 2's `market_comps` snapshots feed this directly)
- Want list price alerts (email/push when threshold crossed)
- Collection intelligence ("You own 11 of 15 Uncanny X-Men key issues — here are the 4 you're missing")
- Run completion percentage / gamification
- Duplicate detection
- ~~Proper variant schema~~ — **shipped 2026-08-05**, see `cover_variants` table above. Remaining work is a user-facing variant-picker UI (grid of unlabeled thumbnails, per `docs/variant-and-collected-editions-spec.md`), not the schema/ingestion.

### Phase 4 — Marketplace Soft Launch (sequenced after Phase 3, no fixed date)
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

- **Activity and comic-add security:** `/api/activity` reads with the service role, so `src/lib/activityFeed.js` is the only privacy gate for the homepage feed; `POST /api/comics` derives `created_by` from the bearer token, never the form.
- **API routes must be API routes.** Don't let Next.js page/component patterns bleed into `/api/` handlers — this has burned us before.
- **Never fetch more records than needed.** The 500-record-to-find-one bug is fixed — don't reintroduce patterns like it.
- **PostgREST 1000-row cap is silent.** Any `.in()` or `.select()` without `.range()` will silently cap at 1000 rows. This bit us twice (`diagnoseIssuesData.js` and the cache-refresh canonical_covers fetch). Always paginate with `.range(from, from + PAGE - 1)` in a loop when you might exceed 1000 rows.
- **`runWithRetry()` returns `data` directly, NOT `{data, error}`.** Destructuring it as `{data, error} = await runWithRetry(...)` silently produces undefined and breaks downstream — that's how the pagination fix was botched the first time. See [scripts/refreshSeriesSearchCache.js:40-68](scripts/refreshSeriesSearchCache.js#L40-L68).
- **Year handling:** use `bestYearFor(row)` (publication_date → key_date fallback), never raw `parseYear(publication_date)`.
- **Publisher resolution:** prefer `series.resolved_publisher_cached` (year-aware, audited) over re-running `resolvePublisher()` on request. Re-resolving introduces the "1984 TMNT shows IDW" regression. Only re-resolve as a fallback when the cached value is null.
- **Issue dedupe:** use `baseIssueNumber()` to collapse variant suffixes when counting issues. Don't double-count `1`, `1 [Newsstand]`, `1 [Variant Cover]`.
- **`gcd_issue_id` is an integer.** Treat it consistently everywhere — no implicit string coercion.
- **Issue covers:** use `src/lib/catalog/covers.js` `resolveCovers()`; tiers are exact `gcd_issue_id`, then volume-exact `series_gcd_id` + base issue number, then untagged exact title variant + base issue number within the year guard. New code must not query `canonical_covers` directly for an issue cover.
- **User avatars:** The `public/avatars/` hero image set is legacy. The target is user-uploaded profile photos. Do not build new features that depend on the static avatar set.
- **`gcd_scraper_to_supabase.py` does NOT ingest GCD metadata.** It's a covers scraper hitting comics.org HTML. If you need to rebuild `gcd_issues` from source, that pipeline is not in the repo and must be rebuilt from a fresh GCD Postgres dump.
- **GoCollect is dead.** Do not write new code against any GoCollect endpoint. Valuation goes through eBay Browse API.
- **No external API as a product.** Internal use only. Don't build endpoint surfaces designed for third-party developer consumption.
- **Tailwind only** for styling. Config is in `tailwind.config.cjs`. No inline styles for layout.
- **`.env.local`** holds all secrets (Supabase, ComicVine, Stripe, eBay). Never commit it.
- **GitHub Actions secrets** mirror `.env.local` for scheduled jobs. `weekly-refresh.yml` uses `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; `gcd-issue-refresh.yml` also uses `COMICVINE_API_KEY` to identify recent-release series.
- **Python scripts in root** are data pipeline tools (ingestion, seeding, diagnostics) — not part of the Next.js app runtime. New scripts go in `scripts/` (Node).
- **`codebase.txt`** is a snapshot that may be stale — don't treat it as ground truth.
- **npm scripts for cover ops:** `covers:gap-featured` (curated gap list), `covers:gap-both` (depth + width modes), `covers:resolve-pins` (walks `needs_volume_id.json` for single-candidate ComicVine mismatches and pins `series.comicvine_volume_id`), `covers:refresh-cache` (full --force refresh), `covers:refresh-cache-test` (single-batch smoke test), `covers:weekly` (refresh + gap regen). The actual ComicVine ingest (`comicvine_api_to_supabase.py`) is automated via `.github/workflows/cover-ingest.yml` (hourly as of 2026-08-27, up from a once-a-week burst — see that file's header for why; GitHub's own schedule trigger has proven unreliable for it across 3 separate recurrences, so treat it as best-effort and check `gh run list --workflow=cover-ingest.yml` for the actual fired cadence rather than trusting the cron declaration alone) — `gap-priority.json`/`gap-featured.json` refresh via `weekly-refresh.yml`, `gap-width.json`/`gap-depth.json` also refresh there (fixed 2026-08-26 — they'd gone stale for 11 weeks with nothing regenerating them, the main reason coverage flatlined), and `gap-manual.json`/`gap-pinned.json` refresh via `gap-probe.yml`. **Retry backoff (added 2026-09-20):** targets the ingester can't resolve are kept out of `.ingest-done.json` on purpose so they stay retryable, but each `needs_volume_id.json` record now also carries `attempts`/`last_attempt_at`/`retry_after` and is skipped before a search call while inside its cooldown (1 → 3 → 7 → 14 → 30 days). Without it the unresolvable targets sat at the head of the queue and ate the entire per-lane `--max-search-calls` budget every hour — that's what killed the pipeline for ~26 hours on 2026-09-19 (three runs in a row reporting `search=30 volume=0 issues=0`). State is keyed on (name, publisher, year) in the backlog file, so it survives `gap-*.json` regeneration. `--ignore-backoff` forces a full re-attempt.
- **Cron watchdog (added 2026-08-31):** `.github/workflows/cron-watchdog.yml` runs every 6 hours and force-triggers `weekly-refresh.yml` / `gap-probe.yml` via `scripts/cronWatchdog.js` if either's last successful run is older than its expected weekly cadence + a 1-day grace window. Exists because the schedule-trigger reliability problem above hit those two workflows on 2026-08-31 — a full week went by with no run, the gap target lists went stale/exhausted, and every hourly `cover-ingest.yml` run correctly failed its stall health check (0 new covers) for the whole day. Rather than re-discovering this per workflow (Instagram got its own hourly-cron-plus-guard fix earlier; cover-ingest got hourly-instead-of-weekly), this centralizes detection for any workflow added to `WATCHED` in the script. `checkCoverIngestHealth.js`'s stall failure is doing its job correctly when this happens — the fix is to unstick the upstream gap regeneration, not to loosen the health check.
- **Recent-release cover latency:** `probeNewReleases.js` compares normalized issue numbers for both new and already-covered ComicVine volumes. A missing recent issue is queued in `gap-manual.json`, and that target is removed from `.ingest-done.json` so the next hourly manual lane processes it. Newly written done entries store the latest cover/store date. Volumes active within 60 days use a 7-day TTL; older, legacy, and field-less entries keep the 30-day TTL. Failed image attempts use the existing retry-backoff, including explicit-volume targets, so an issue with no ComicVine image does not loop hourly.
- **PostgREST's 1000-row cap bit `generateCoverGapTargets.js` too (2026-08-26)** — raising `--limit` past 1000 silently did nothing without `.range()` pagination, discovered when a "5000 limit" run only ever wrote 1000 rows. Same fix as `refreshSeriesSearchCache.js`: paginate in 1000-row pages, don't trust `.limit()` alone above that threshold.
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
