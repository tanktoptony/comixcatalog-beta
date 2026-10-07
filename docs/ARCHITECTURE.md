# ComixCatalog: Architecture

**Status:** canonical, describes current state · **Verified against code:** `origin/main` at `040d7d1`, 2026-10-05
**Note:** the slop remediation program ([slop-remediation-spec.md](slop-remediation-spec.md)) will change the cover read path (WS4) and library mutations (WS2). Update this file in those PRs.

## System diagram

```
                       ┌──────────────────────────── Vercel ───────────────────────────┐
 Browser               │  Next.js 16 App Router (React 19, React Compiler)              │
 ─────────             │                                                                │
 Server-rendered pages │  Server pages ── call route handlers in-process (src/lib/      │
 + client components   │                  pageData.js) or Supabase directly             │
                       │  /api/* route handlers ── service-role Supabase client         │
 Supabase JS client ───┼──────────────┐   (bypasses RLS; identity from Bearer token)   │
 (anon key, session in │              │                                                 │
  localStorage)        └──────────────┼─────────────────────────────────────────────────┘
   │  direct reads/writes under RLS   │
   ▼                                  ▼
 ┌──────────────────────── Supabase ─────────────────────────┐
 │ Postgres: catalog mirror (gcd_*), series, canonical_covers,│
 │   user_collections, listings, profiles, …                  │
 │ Triggers: protect_profile_billing, collection sync triggers │
 │   _columns, user_collections_sync_listing                  │
 │ RPC: search_series_by_relevance                            │
 │ Storage: canonical-covers, cover-thumbs, comic-covers,     │
 │   listing-photo-originals, listing-photos                  │
 │ Auth: email/password (Google built, disabled)              │
 └──────────────▲────────────────────────────────────────────┘
                │ service-role key
 ┌──────────────┴──────── GitHub Actions (cron) ─────────────┐
 │ cover-ingest (hourly, Python ComicVine ingester)           │
 │ weekly-refresh, gap-probe, gcd-issue-refresh, gcd-series-  │
 │ format-sync, ebay-comps-refresh, snapshot-collection-value,│
 │ nightly-cover-report, listing-photo-cleanup, instagram-    │
 │ post, newsletter-send (manual), cron-watchdog              │
 │ Bots commit state files (gap-*.json, ledgers) to main      │
 └────────────────────────────────────────────────────────────┘
 External: ComicVine API, comics.org API, eBay Browse API, Stripe, Resend, Instagram Graph, GA4, Sentry
```

## Runtime and framework

- Next.js 16.2 App Router, React 19.2, `reactCompiler: true`. JavaScript only (no TypeScript). `@/` maps to `src/`.
- Hosted on Vercel (project `comixcatalog-beta`). `vercel.json` skips builds via `scripts/vercel-ignore-build.sh` (bot commits that only touch state files don't deploy).
- Sentry (`@sentry/nextjs`) wired; source map upload only when `SENTRY_AUTH_TOKEN` is set.
- GA4 loaded in production only (`src/lib/analytics.js`).
- `sharp` runs server-side for listing photos and the PDF; its Linux binaries are force-included in `next.config.mjs`.

## Frontend structure

- `src/app/`: routes. Heavy pages split into a server `page.js` that prefetches data and a `*Client.js` that takes over (search, series, home).
- `src/components/`: shared UI, flat folder, about 37 components.
- `src/context/`: `AuthContext` (session + profile + `isPro`/`isFounding`), `LibraryContext` (the signed-in user's entire `user_collections`, cached in localStorage, refetched on tab focus), `SearchQueryContext` (header-to-search-page query sharing).
- `src/lib/`: domain helpers. Many have `*.test.js` beside them (Node test runner).
- Styling: one 11.7k-line `src/app/globals.css` of hand-written classes plus Tailwind 4. CLAUDE.md says "Tailwind only"; the code is mostly global CSS classes and some inline styles.

## Backend and API

- All server logic is Next.js route handlers under `src/app/api/`. There is no separate backend service.
- **Identity:** the browser sends `Authorization: Bearer <access_token>` (`src/lib/apiClient.js` `authedFetch`). Routes call `getAuthedUser(req)` (`src/lib/authServer.js`), which validates the token with Supabase Auth. Never trust a `user_id` from a body or query.
- **Data access in routes:** most routes create a service-role client inline (`createClient(URL, SUPABASE_SERVICE_ROLE_KEY)`), so RLS does not protect them. Authorization is whatever the route checks. About 40 files do this; a shared `getServiceClient()` is planned (slop WS3b).
- **Admin:** a single hardcoded `ADMIN_ID` in `src/lib/admin.js`, checked server-side in admin routes and used client-side to show admin UI.
- Server pages sometimes import a route's `GET`/`POST` and call it in-process (`src/lib/pageData.js`, `src/lib/marketplace.js` calling library-hydrate). Changing a route's response shape can break a page that never makes an HTTP call.
- Caching: `unstable_cache` with tags for marketplace listings; CDN cache headers from `src/lib/cdnCache.js` on public catalog reads.

Key routes:

| Route | Job |
|---|---|
| `GET /api/search/series` | Series search: RPC `search_series_by_relevance`, then rank, dedupe by ComicVine volume, diversify |
| `GET /api/search/comics` | Issue-level search |
| `GET /api/series/[id]` | Series + issue list + covers, including "orphan" covers with no GCD issue row |
| `GET /api/issues/[id]` | Issue detail: metadata, cover (tiered match), variants, printings, arcs, market data, prev/next. 968 lines |
| `POST /api/library-hydrate` | Turns a list of `gcd_issue_ids`/`comic_ids` into display data (titles, covers, values) |
| `GET /api/public-profile` | Public profile data, respecting `show_*` flags |
| `/api/listings/*` | Listing edit, sync, photo upload/process/order/delete |
| `/api/stripe/{checkout,portal,webhook}` | Pro subscription billing |
| `/api/export/{csv,pdf,wantlist}`, `/api/csv-import` | Data in and out |
| `/api/founding/status` | Counts and claims founding passes (cap 100) |

## Authentication

- Supabase Auth, email + password. Session lives in **localStorage** (plain `@supabase/supabase-js`, `src/lib/supabase/client.js`), not cookies. Server components cannot see who is signed in; anything user-specific is fetched client-side or through a Bearer-token API call.
- `@supabase/ssr` is installed but only used in `src/lib/auth/postAuthRedirect.js`. A cookie-based SSR migration is deferred, not abandoned.
- Google OAuth (`OAuthButtons`) is built and commented out on `/login` and `/signup` because of a session-persistence race.
- `/access` (beta access code page) sets a cookie nothing checks. There is no middleware.

## Database

Schema lives in Supabase. **The repo does not hold the full schema**: `scripts/migrations/` has 22 files from 0002 to 0032b with gaps, and base tables (`profiles`, `user_collections`, `series`, `gcd_*`, `canonical_covers`, `comics`, `blog_posts`) predate them. Migrations are applied by hand in the Supabase SQL editor; there is no runner, and the service-role key cannot run DDL.

Important tables (full column notes in CLAUDE.md):

| Table | Role | Key |
|---|---|---|
| `gcd_series`, `gcd_issues`, `gcd_publishers` | Raw GCD mirror | `gcd_id` int |
| `series` | App-facing series with cached search fields (`title_normalized`, `issue_count_cached`, `resolved_publisher_cached`, `featured_cover_path_cached`, `comicvine_volume_id`) | `id` uuid, `gcd_id` bridge |
| `publishers` | Canonical publishers | `id` uuid, `gcd_id` bridge |
| `canonical_covers` | One row per ComicVine issue cover | `id` uuid; dedupe on `source_issue_url`; links `series_gcd_id`, `gcd_issue_id` (nullable) |
| `cover_variants` | Extra cover images per canonical cover | `(source, source_image_id)` |
| `comics`, `comic_covers` | User-contributed issues not in GCD | `id` uuid |
| `user_collections` | Every owned/wanted/for-sale copy | `id` uuid; exactly one of `gcd_issue_id` or `comic_id` |
| `listings` (+ view `marketplace_listings`) | One row per listed copy | `id` uuid; `collection_id` FK |
| `listing_photos`, `user_blocks`, `reports` | Marketplace v2 support | |
| `profiles` | Username, visibility flags, `is_pro`, `is_founding_collector`, `stripe_customer_id` | `id` = `auth.users.id` |
| `market_comps` | eBay listing data for valuation | unique `(source, external_listing_id)` |
| `collection_value_history` | Daily per-user value snapshot | unique `(user_id, snapshot_date)` |
| `story_arcs`, `story_arc_issues`, `key_issues`, `issue_printings` | Reference and community data keyed by `gcd_issue_id` | |
| `messages` | DMs, inserted directly from the browser under RLS | |
| `blog_posts`, `blog_comments`, `newsletter_subscribers` | Content and mailing list | |

Triggers that change behavior:

- `enforce_pro_for_grading` was removed by migration 0043; grade, slab, cert, and per-copy photo fields are free for signed-in users.
- `protect_profile_billing_columns` (0032a): only service role may change `is_pro`, `is_founding_collector`, `stripe_customer_id`. 0032b hides `stripe_customer_id` from browsers, so browser code must select explicit `profiles` columns.
- `user_collections_sync_listing` (0031): setting a collection row to `for_sale` creates a listing; changing it away withdraws it. Errors are swallowed so the library never breaks.

Constraint that matters now (confirmed live 2026-10-05, not in any repo migration): a partial unique index on `user_collections (user_id, gcd_issue_id)` means one row per user per GCD issue. Owned and wanted cannot coexist as separate rows, and multiple copies are impossible (see UX_RULES.md).

## Storage and images

| Bucket | Contents | Public |
|---|---|---|
| `canonical-covers` | ComicVine covers, capped at 1600px tall | yes |
| `cover-thumbs` | 400px WebP of each canonical cover at `w400/<path>.webp` | yes |
| `comic-covers` | User covers for local comics; per-copy library photos at `library/<collection_id>.<ext>`; blog images | yes |
| `listing-photo-originals` | Raw seller uploads, deleted after processing | no |
| `listing-photos` | Processed seller photos, WebP, EXIF stripped | yes |

Rules: grids use `coverThumb(url)` (`src/lib/coverThumb.js`); `CoverThumbFallback` in the root layout swaps a missing thumb for the original. Detail pages show originals. No cover means `public/fallback-cover.png` or an empty state, never another issue's cover. Storage size is a real plan limit (it hit 150 GB on a 100 GB plan on 2026-10-01).

## Search

- Series search is server-side: Postgres function `search_series_by_relevance` (migrations 0023/0024/0029) over trigram and btree indexes on `series.title_normalized`, filtered to `US_PUBLISHER_ALLOWLIST`. The route then parses a trailing year or issue number (`src/lib/searchQuery.js`), ranks, collapses GCD fragments that share a `comicvine_volume_id`, and spreads results across titles (`src/lib/searchVariety.js`).
- The header dropdown and `/search` share the query through `SearchQueryContext`. `/search` server-renders its first page.
- Library catalog-link search and the marketplace filter on their own logic (marketplace facets are client-side over all listings).
- **Dead:** `src/lib/search/*` (imports a file that doesn't exist), `src/lib/db.js`, `public/sqlite.worker.js`, `public/sqljs/`, `public/wa-sqlite.wasm`, and deps `sql.js`, `wa-sqlite`, `better-sqlite3`. An old in-browser SQLite search experiment; nothing imports it.

## Catalog and covers

See [CATALOG_DATA.md](CATALOG_DATA.md). In short: GCD supplies series/issue metadata, ComicVine supplies cover images, and the two are joined by best-effort link columns on `canonical_covers`. Cover selection for display is implemented separately in about 15 routes and libs, with the same tier order but not shared code.

## Collection and wishlist

- One table, `user_collections`, with `status` in `owned | wishlist | for_sale`. `for_sale` counts as owned everywhere (`src/lib/collectionStatus.js` `OWNED_STATUSES`).
- The browser writes it directly under RLS through `LibraryContext` (`addToCollection`, `removeFromCollection`, `addAnotherCopy`). Mutations are keyed by `gcd-<id>` or a comic uuid, not by row id.
- Display data comes from `/api/library-hydrate`, not from joins in the browser.
- Valuation: `auto_market_value` on each row, computed by `src/lib/compValue.js` `valueFromComps()` from `market_comps`. User `market_value` overrides it in the UI.

## Marketplace

See [MARKETPLACE.md](MARKETPLACE.md). Listings are created by a trigger from library status changes, read through the `marketplace_listings` view, and cached with tag `listings`. No payments.

## External services

| Service | Use | Constraint |
|---|---|---|
| ComicVine API | Cover images, variant images, new-release probe | Free tier, about 200 requests/hour/resource |
| comics.org REST API | Top-up of `gcd_issues`, series format sync | Undocumented tight rate limit; image host is behind Cloudflare and unusable |
| eBay Browse API | Active listing prices for valuation | Asking prices only; Marketplace Insights (sold) not approved |
| Stripe | Pro subscriptions | Test vs live customer ids are not interchangeable |
| Resend | Newsletter sending (`src/lib/newsletter.js`, `scripts/sendNewsletter.js`) | Auth emails are sent by Supabase Auth; its SMTP setup is not in the repo |
| Instagram Graph API | Hourly auto-post bot | User token expires 2026-12-01 |

## Deployment assumptions

- Vercel builds `main`. PRs get preview deploys. `pr-ci.yml` runs lint (changed files), 24 test scripts, build, the error-handling ratchet, and `docs:check`.
- Auto-merge is off; the founder merges.
- Bots commit state files (`gap-*.json`, `.ingest-done.json`, `needs_volume_id.json`, cursors) to `main` many times a day. Expect `main` to move under you.
- Secrets live in `.env.local` locally, Vercel env vars, and GitHub Actions secrets. A secret missing from Actions breaks every PR's build step.

## Constraints to respect

1. **PostgREST returns at most 1000 rows without saying so.** Use `fetchAllPages` (`src/lib/supabase/fetchAllPages.js`) with a stable sort for any read that might exceed it. This bug has recurred at least five times.
2. Service-role routes bypass RLS. Every new route must do its own authorization.
3. `gcd_issue_id` is an integer. Coerce with `Number()`.
4. `canonical_covers` is about 120k rows; filter only on indexed columns.
5. Schema changes require the founder to run SQL. Code depending on a migration cannot merge first.
6. Bulk DB or storage jobs: one at a time, concurrency 4 or less, off-peak.

## Known technical debt

- No schema baseline in the repo; RLS policies are only partly recorded.
- Cover resolution duplicated across about 15 surfaces (slop WS4).
- Helpers duplicated: `parseYear`/`bestYearFor` (about 19 copies), title normalization (10+), publisher normalization (about 14, JS and Python), `fetchAllPages` (19).
- 55 places in `src/` ignore a Supabase `error` (ratchet in `scripts/.error-handling-baseline.json`).
- Library mutations are keyed by issue, not row; multi-copy is broken.
- `getListings()` loads every listing into memory; fine at beta scale only.
- Auth is localStorage-only; no SSR identity.
- Pipeline state lives in git, so most commits are bots.
- 8 test scripts exist but aren't in CI (`attribution`, `csv-match`, `featured-targets`, `launch-flags`, `post-auth-redirect`, `production-assets`, `share-cards`, `smoke`).
- Dead code: see "Search" above, plus placeholder pages listed in PRODUCT.md.
