# ComixCatalog — Claude Code Project Briefing

> Solo founder project. Built in Chicago. Goal: replace bartending income with recurring revenue by end of summer 2025.
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

The app is **near launch**. Prioritize stability, correctness, and shipping over architectural perfection.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) |
| Backend / API routes | Python scripts + Next.js API routes |
| Database | Supabase (Postgres) |
| Payments | Stripe + Stripe Connect (marketplace seller payouts) |
| Comic metadata | Grand Comics Database (GCD) |
| Cover images | ComicVine API |
| Valuation data | GOCollect (integration in progress) |
| Styling | Tailwind CSS |
| Config | `next.config.mjs`, `tailwind.config.cjs`, `postcss.config.cjs` |

---

## Project Structure

```
comixcatalog-beta/
├── .claude/                        # Claude Code settings
├── src/                            # Next.js app source (App Router)
├── public/
│   ├── covers/                     # LEGACY — local cover stubs, to be removed. ComicVine is the cover source.
│   ├── avatars/                    # LEGACY — placeholder hero avatars, to be replaced with user image upload
│   ├── favicon/
│   ├── icons/
│   ├── img/
│   ├── sqljs/                      # sql.js WASM (SQLite in browser)
│   ├── sqlite.worker.js
│   ├── wa-sqlite.wasm
│   └── fallback-cover.png
├── scripts/                        # Utility/migration scripts
├── comicvine_api_output/           # Logs + CSVs from ComicVine ingestion
│   ├── ingest_*.log
│   └── issues_uploaded.csv
├── canonical_covers_diagnostic.py  # Cover URL validation tooling
├── comicvine_api_to_supabase.py    # ComicVine → Supabase ingestion
├── gcd_scraper_to_supabase.py      # GCD → Supabase ingestion
├── generate_comics_seed.py         # Seed data generation
├── target_volumes_seed.py          # Volume/series seed targets
├── series_lookup_diagnostic.py     # Series lookup debugging
├── scrape.py                       # General scraping utility
├── comics_seed.csv                 # Seed data
├── codebase.txt                    # Codebase snapshot (may be stale)
├── .env.local                      # Environment secrets (never commit)
├── jsconfig.json
├── eslint.config.mjs
└── package.json
```

---

## Data Sources — Critical Context

### GCD (Grand Comics Database)
- **Primary source of truth** for all comic metadata: series, issues, story arcs, variants, publishers
- Ingested via `gcd_scraper_to_supabase.py`
- Tables are prefixed `gcd_*`

### ComicVine
- Used **only for cover images** — not a metadata source
- Ingested via `comicvine_api_to_supabase.py`
- Output logs in `comicvine_api_output/`

### GOCollect
- Target source for **valuation and pricing data**
- Integration is **in progress / not fully established** — treat as aspirational
- eBay sold listings are the current fallback for pricing estimates

---

## Database Schema — Know These Exactly

### Column Names (these have caused bugs — use exact names)
- `grade_numeric` ← NOT `grade_num`
- `slab_company` ← NOT `slab_comp`
- `gcd_issue_id` — **integer** column. Always coerce explicitly via `Number()`, never rely on Postgres implicit string→int casting.

### Two parallel "series" tables — DO NOT confuse
- `series` — **canonical / app-facing**. UUID primary key. Has resolved publisher, cached counts, title_normalized for search. This is what API routes should join.
- `gcd_series` — **raw GCD mirror**. `gcd_id` integer primary key. Holds `name`, `sort_name`, `year_began`, `year_ended`, `publisher_gcd_id`. Currently *never queried* by the app — surface it when you need GCD-native metadata that didn't make it onto the canonical `series` row (e.g. sort_name, year_ended for prune logic).

### Backup tables — DO NOT query
- `series_backup`, `series_foreign_prune_backup`, `series_zero_issue_backup` — leftovers from past migrations. Read-only safety nets, not live data.

### Tables (Supabase `public` schema)

#### `profiles`
PK `id` (uuid, FK → `auth.users.id`).
Columns: `username`, `is_public`, `created_at`, `avatar_key`, `avatar_url`, `is_founding_collector`, `is_pro`, `stripe_customer_id`.
- `is_pro` is the Stripe-driven flag. Admin is treated as Pro via `ADMIN_ID` short-circuit, NOT this column.
- `stripe_customer_id` is mode-sensitive — a live-mode `cus_…` will fail under a test-mode key (we hit this).

#### `user_collections`
PK `id` (uuid). FKs: `user_id` → `auth.users`, `comic_id` → `comics.id`, plus a non-FK `gcd_issue_id` (int4) link.
Columns: `status`, `condition`, `grade_numeric` (numeric), `slab_company`, `slab_cert_number`, `notes`, `purchase_price` (numeric), `market_value` (numeric), `publisher`, `created_at`, `created_by`.
- A row is either-or: `comic_id` set (local comic) OR `gcd_issue_id` set (GCD issue). Never both.
- `status` values seen: `owned`, `wishlist`, `for_sale`.
- **No `user_cover_url` column yet** — needs migration before per-book user-uploaded photos work end-to-end.

#### `comics` (user/local-contributed comics)
PK `id` (uuid). FKs: `series_id` → `series.id`, `created_by` → `auth.users.id`.
Columns: `series_title`, `issue_number`, `publisher`, `release_year` (int4), `variant_name`, `created_at`, `gcd_id` (int4 — when this user-comic was matched to a GCD issue).

#### `comic_covers` (user-submitted covers for `comics`)
PK `id` (uuid). FK `comic_id` → `comics.id`, `uploaded_by` → `auth.users.id`.
Columns: `image_path` (path inside `comic-covers` storage bucket), `is_official` (bool), `is_primary` (bool), `created_at`.

#### `series` (canonical, app-facing)
PK `id` (uuid). FK `publisher_id` → `publishers.id`. Bridge to GCD via `gcd_id` (int4).
Columns: `title`, `created_at`, `cv_publisher`, `issue_count_cached`, `year_start_cached`, `year_end_cached`, `resolved_publisher_cached`, `featured_cover_path_cached`, `search_refreshed_at`, `title_normalized`.
- The `*_cached` columns are refreshed by `scripts/refreshSeriesSearchCache.js`. Last full pass: **217,663 series; 79.4% have `year_start_cached`, 1.5% have `featured_cover_path_cached`**.
- Cover-coverage ceiling is `canonical_covers` itself: only **319 distinct `series_title` values**, matching ~3,866 series rows (1.8% theoretical max). The join logic in the cache refresh is correct — raising coverage means ingesting more ComicVine covers via `comicvine_api_to_supabase.py`, not script changes. Diagnostic: `node scripts/diagnoseCoverCoverage.js`.

#### `gcd_series` (raw GCD mirror — currently unqueried)
PK `gcd_id` (int4). FK `publisher_gcd_id` → `gcd_publishers.gcd_id`.
Columns: `name`, `sort_name`, `year_began`, `year_ended`.

#### `gcd_issues`
PK `gcd_id` (int4). FK `series_gcd_id` → `series.gcd_id` AND `gcd_series.gcd_id`. Also `publisher_gcd_id` → `gcd_publishers.gcd_id`.
Columns: `issue_number`, `title`, `publication_date`, `key_date`.

#### `gcd_publishers`
PK `gcd_id` (int4). Columns: `name`, `year_began`, `year_ended`.

#### `publishers` (canonical publishers used by `series.publisher_id`)
PK `id` (uuid). Columns: `name`, `created_at`, `gcd_id` (int4 — bridge to `gcd_publishers`).

#### `canonical_covers` (ComicVine-sourced canonical issue covers)
PK `id` (uuid). Columns: `source`, `source_issue_url`, `external_issue_id`, `series_title`, `issue_title`, `issue_number`, `publisher`, `cover_date`, `in_store_date`, `description`, `original_cover_url`, `storage_path` (inside `canonical-covers` storage bucket), `comicvine_volume_id` (uuid), `series_year` (int4), `created_at`.
- Lookup is by `(series_title, issue_number)` — there's no FK to `series` or `gcd_issues`. Mismatched titles are a real failure mode.

#### `blog_comments`
PK `id` (uuid). FKs `user_id` → `auth.users.id`, `post_id` → blog posts table.
Columns: `content`, `created_at`.

### Storage buckets
- `comic-covers` — user-submitted covers via `comic_covers.image_path`. Also where per-library-item user photos will live (under `library/<collection_id>.<ext>` once the migration lands).
- `canonical-covers` — ComicVine-sourced covers via `canonical_covers.storage_path`.

### Per-Collection-Item Fields (already in DB, surface in UI)
| Column | Description |
|---|---|
| `condition` | Raw grade label (VF, NM, FN, etc.) |
| `grade_numeric` | CGC/CBCS numeric grade (0.5–10.0) |
| `slab_company` | CGC, CBCS, or PGX |
| `slab_cert_number` | Links to live CGC/CBCS registry lookup |
| `notes` | Freeform per-issue collector notes |
| `purchase_price` | What the user paid (numeric) |
| `market_value` | Self-reported current value (numeric, automated in Phase 3) |

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

---

## Subscription Tiers

| Tier | Price | Notes |
|---|---|---|
| **Free** | $0 | Basic collection tracking, search, public profile. No export. |
| **Supporter** | $3/mo | Badge, Discord access, behind-the-scenes updates |
| **Collector Beta** | $8/mo | Early feature access, feature voting, beta previews |
| **Founding Collector** | $20/mo | Limited tier. Permanent badge, name on founders page, roadmap access |
| **Collector Pro** | $8/mo | Grading tools, PDF export, unlimited import *(Phase 2 launch — priced to match Patreon Collector Beta tier)* |
| **Vault** | $18/mo | PDF reports, private sharing link, priority marketplace placement *(Phase 2)* |
| **Verified Collector badge** | $10 one-time | Links CGC registry to profile. Marketplace credential. |

**Marketplace fee:** 5–8% per transaction (Discogs takes 8% for reference)

---

## Feature Roadmap

### Phase 1 — Stabilize (target: May 2) ← CURRENT PHASE
- [x] Fix `/api/comics/[id]/route.js` (was a React component, not an API handler)
- [x] Fix comic detail page (was fetching 500 records to find one)
- [x] Upgrade SearchPageClient (dynamic publisher filters, skeleton loading)
- [x] Fix column name mismatches (`grade_num` → `grade_numeric`, `slab_comp` → `slab_company`)
- [x] Align `gcd_issue_id` integer handling across LibraryContext (LibraryContext clean; fixed implicit string→int casting in `/api/issues/[id]` and `/api/comics/[id]`)
- [x] Surface `gcd_series` table — `publisher_gcd_id` now feeds `resolvePublisher` candidates in `/api/series/[id]`, `/api/issues/[id]`, and `/api/comics/[id]` as a series-level fallback (preferred over per-issue indicia publishers). Remaining candidate uses (sort_name for ordering, year_ended for prune logic) deferred — surface as needed.
- [x] Add error boundaries to prevent full-page crashes (`app/error.js`, `app/global-error.js`, `app/not-found.js`)
- [ ] Test collection add/remove flows end-to-end with real data
- [x] **Profile page overhaul (Discogs-style v1)** — `/u/[username]` rebuilt with: hero (avatar, badges row including Pro + Founding Collector, real "Collector since" join date), headline stats strip (Owned / Wantlist / For Sale / Collection Value / Slabbed), tabbed body (Owned / Wantlist / For Sale / Activity) via `src/components/ProfileTabs.js`, sidebar with About / Top Publishers / Get Started panels. Activity tab pulls from collection.created_at. **Future work:** follow/follower counts, run-completion stats (Phase 3), and verified-collector badge wiring.

### Phase 2 — Revenue Engine (target: May 30)
1. **Grading & Condition UI** — inline editing on library items, grade badges on cards, slabbed vs raw toggle
2. **Insurance/Appraisal PDF Report** ← PRIMARY revenue feature. Itemized with cover thumbnails, total value, date-stamped. Gated behind Pro. No other comic platform does this well.
3. **Stripe + Pro Tier Launch** — Collector Pro ($8/mo) and Vault ($18/mo)

### Phase 3 — Daily Engagement (target: June 30)
- Portfolio value tracking with over-time charts
- Want list price alerts (email/push when threshold crossed)
- Collection intelligence ("You own 11 of 15 Uncanny X-Men key issues — here are the 4 you're missing")
- Run completion percentage / gamification
- Duplicate detection

### Phase 4 — Marketplace Soft Launch (target: July 31)
- Pro users only initially
- Verified grade badges on listings
- Seller reputation scores
- Stripe Connect for payouts
- In-app buyer/seller messaging

### Phase 5 — Scale (August+)
- Open marketplace to all verified users
- CGC census/population data integration
- React Native mobile app
- PR push: comic news sites, YouTube collectors, CGC forums

---

## Engineering Reminders

- **API routes must be API routes.** Don't let Next.js page/component patterns bleed into `/api/` handlers — this has burned us before.
- **Never fetch more records than needed.** The 500-record-to-find-one bug is fixed — don't reintroduce patterns like it.
- **`gcd_series` is underutilized.** When building series-level features, check if this table should be joined in.
- **`gcd_issue_id` is an integer.** Treat it consistently everywhere — no implicit string coercion.
- **Cover image priority:** ComicVine URL → `public/fallback-cover.png`. The `public/covers/` local stubs are legacy and should be removed — do not add to them or build logic that depends on them.
- **User avatars:** The `public/avatars/` hero image set is legacy. The target is user-uploaded profile photos (via Supabase Storage or similar). Do not build new features that depend on the static avatar set.
- **Tailwind only** for styling. Config is in `tailwind.config.cjs`. No inline styles for layout.
- **`.env.local`** holds all secrets (Supabase, ComicVine, Stripe, GOCollect). Never commit it.
- **Python scripts in root** are data pipeline tools (ingestion, seeding, diagnostics) — not part of the Next.js app runtime.
- **`codebase.txt`** is a snapshot that may be stale — don't treat it as ground truth.

---

## What Success Looks Like

A user can:
1. Search for any comic series or issue
2. Add it to their collection with grade, condition, variant type, and notes
3. See their total collection's estimated value
4. Generate a PDF report suitable for insurance or estate planning
5. List books for sale and complete transactions with other collectors
6. Get alerted when a want-list issue drops to their target price
7. See what key issues they're missing from a run they're building
