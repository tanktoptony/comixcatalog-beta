# ComixCatalog: Catalog Data

**Status:** canonical · **Verified against code:** `origin/main` at `040d7d1`, 2026-10-05
**Deeper history:** [operations/OPERATIONS_HANDOFF.md](operations/OPERATIONS_HANDOFF.md) (failure classes, workflow inventory), CLAUDE.md (column-level schema notes). Counts below are approximate; query production for exact numbers.

## Sources

| Source | Supplies | How it arrives |
|---|---|---|
| Grand Comics Database (GCD) | Series, issues, publishers, dates, series format | One-time bulk dump (date unknown, pipeline not in repo), then per-series top-ups from the comics.org REST API (`scripts/refreshGcdIssuesFromApi.js`, daily, featured series only) and format sync (`scripts/syncGcdSeriesFormat.js`) |
| ComicVine | Cover images, variant cover images, ComicVine volume ids, new-release discovery | `comicvine_api_to_supabase.py`, hourly in `cover-ingest.yml`; `scripts/probeNewReleases.js` |
| eBay Browse API | Active listing prices | `scripts/fetchEbayComps.js`, daily |
| Curated in repo | Featured series, key issues, publisher/year overrides | `src/lib/featuredSeries.js`, `key_issues` seed, `src/lib/seriesOverrides.js` |
| Users | Local comics, cover photos of their copy, printings (UPC) | `comics`, `user_collections.user_cover_url`, `issue_printings` |

GCD cover images are not used: `files1.comics.org` is behind Cloudflare and blocks scripted access.

## Identifiers

| Id | Where | Notes |
|---|---|---|
| `gcd_issues.gcd_id` (int) | The canonical issue id | Used as `user_collections.gcd_issue_id`, `listings.gcd_issue_id`, `/issue/<gcd_id>`. Always an integer |
| `gcd_series.gcd_id` (int) | Raw GCD series | `series.gcd_id` bridges to it; `canonical_covers.series_gcd_id` links covers |
| `series.id` (uuid) | App-facing series | `/series/<uuid>`. Some series rows have no `gcd_id` (ComicVine-only new series) |
| `comics.id` (uuid) | User-contributed issue | `/comic/<uuid>`, `user_collections.comic_id` |
| `canonical_covers.id` (uuid) | One ComicVine issue cover | Natural key `source_issue_url` (ingester upserts on it) |
| `comicvine_volume_id` | On `series` and `canonical_covers` | Strong "same real run" signal. 616 volumes are pinned by 2+ series rows; check before pinning |
| `cv-<series_gcd_id>-<issue>` | Synthetic issue id | An issue that has a linked cover but no `gcd_issues` row yet (GCD mirror behind) |
| `cvt-<series title>-<issue>` | Synthetic issue id | An issue on a series with no GCD row at all; matched by title |
| Library key `gcd-<id>` or `<comic uuid>` | `LibraryContext` | How the browser refers to an issue in the collection |

Don't change or reassign any of these without a migration plan. `gcd_id` values are referenced from user data, listings, URLs and the sitemap.

## Relationships

```
gcd_publishers ─< gcd_series ─< gcd_issues >─ (gcd_id) ─< user_collections >─ listings
                     │                │                         │
                 series.gcd_id        └── key_issues, story_arc_issues, issue_printings, market_comps
                     │
series (uuid) ── publishers
   │
   ├─ comicvine_volume_id ─┐
   │                       ▼
   └─ gcd_id ◄── canonical_covers.series_gcd_id
                 canonical_covers.gcd_issue_id ──► gcd_issues.gcd_id   (nullable, best-effort)
                 canonical_covers ─< cover_variants

comics (user-added) ─< comic_covers;  comics ─< user_collections.comic_id
```

There is no foreign key from `canonical_covers` to `gcd_issues` or `series`. Links are columns filled by the ingester and repair scripts.

## Series, issues and variants

- An **issue** is a `gcd_issues` row. Variant suffixes in `issue_number` (`1 [Newsstand]`, `1 [Variant Cover]`) are collapsed by `baseIssueNumber()` for counting and cover matching. That helper mishandles `1/2`, `Annual 1`, `-1` (fix planned, slop WS5).
- **Variant covers** are `cover_variants` rows hung off a canonical cover. Captions and tags are unreliable, so they display as an unlabeled grid. A collector picks "this one is mine" and the choice is saved to their `user_cover_url`.
- **Printings** (newsstand, 2nd print, Cover B) as community data: `issue_printings`, keyed by `gcd_issue_id`, with UPC. Deliberately not a column on `gcd_issues`.
- **Collected editions** (TPB, HC) are separate GCD series. `gcd_series.publishing_format`/`binding` drive `isCollectedEdition()` (`src/lib/seriesFormat.js`). Collected editions only take covers through the id path, never by title, so a TPB #1 can't show the monthly #1's cover.

## Publisher normalization

- Both raw publisher signals are unreliable: `gcd_series.publisher_gcd_id` has wrong links, and `series.cv_publisher` was once stamped by title-only matches.
- `resolvePublisher()` (`src/lib/publisher.js`) is year-aware: pre-2000 trusts GCD indicia, modern trusts ComicVine.
- The result is cached as `series.resolved_publisher_cached` by `scripts/refreshSeriesSearchCache.js`. **Read the cached value**; re-resolving on request reintroduces bugs like "1984 TMNT shows IDW."
- `SERIES_OVERRIDES` (`src/lib/seriesOverrides.js`, keyed by `gcd_id`) pins publisher and years for important series, and can hide a row.
- `US_PUBLISHER_ALLOWLIST` (about 45 publishers) filters search and browse. Setting a non-US publisher in an override doubles as suppression.
- Display labels go through `normalizePublisherLabel()`. About 7 other publisher normalizers exist in scripts and Python (consolidation planned, slop WS3).

## Covers: from ComicVine to the page

1. **Pick targets.** Gap generators write target lists: `gap-user-collected.json` (books users own), `gap-priority.json`, `gap-featured.json`, `gap-width.json`/`gap-depth.json`, `gap-manual.json` (new releases), `gap-pinned.json`. Regenerated by `weekly-refresh.yml` (Mon/Thu) and `gap-probe.yml` (daily).
2. **Ingest.** `cover-ingest.yml` runs hourly. For each target the Python ingester searches ComicVine for the volume (or uses a pinned `series.comicvine_volume_id`), fetches its issues, downloads each cover (shrinking anything over 1 MB), uploads it to `canonical-covers`, writes a 400px thumb to `cover-thumbs`, and upserts `canonical_covers` on `source_issue_url`. Variant images from the same response go to `cover_variants`.
3. **Link.** The ingester resolves `series_gcd_id` (pin, else title + year + publisher match) and `gcd_issue_id` (series + normalized issue number), with a `match_confidence`. Ambiguous volumes go to `needs_volume_id.json` with retry backoff (1, 3, 7, 14, 30 days) instead of being guessed.
4. **Cache.** `refreshSeriesSearchCache.js` recomputes `issue_count_cached`, year span, `resolved_publisher_cached` and `featured_cover_path_cached`. A reconciliation pass guarantees no storage path is the featured cover of two series.
5. **Display.** Each route picks a cover with the same tier order:
   1. `canonical_covers.gcd_issue_id` = the issue (where used)
   2. `series_gcd_id` + issue number, cover's `series_year` within the series span ±1
   3. title variants + issue number, same year guard, skipped for collected editions
   4. nothing. **Never borrow another issue's cover.** Founder decision, applied sitewide.

   This logic is duplicated per route (issues, series, library-hydrate, public-profile, search, story-arc, activity, export/pdf, share cards, home, marketplace snapshots). A single resolver is planned (slop WS4a).
6. **Measure.** `nightly-cover-report.yml` writes `reports/cover-coverage-history.json`. The meaningful number is allowlisted-corpus coverage (`scripts/lib/coverageMetrics.js`), about 34% of roughly 255k issues as of late August. Don't compare cover count to series count.

## How an issue becomes visible

- **Catalog issue:** exists in `gcd_issues` → its series has a `series` row with `gcd_id` → `refreshSeriesSearchCache` has set `title_normalized`, `issue_count_cached > 0`, `year_start_cached`, and an allowlisted `resolved_publisher_cached` → it appears in search. The issue page works for any `gcd_id` even if search filters the series out.
- **New release ahead of GCD:** `probeNewReleases.js` finds it on ComicVine, creates a minimal `series` row if needed, queues the volume, the ingester stores covers. The issue shows as `cv-…` or `cvt-…` until `gcd_issues` catches up.
- **User-added comic:** `/contribute/add-comic` or `/library/add` checks the catalog first (`/api/catalog/lookup`), then `POST /api/comics` creates a `comics` row. Pro users can later link it to a GCD issue (`/api/library/catalog-link`).

## Duplicate prevention

| Data | Mechanism |
|---|---|
| Canonical covers | Upsert on `source_issue_url` |
| Variant covers | Upsert on `(source, source_image_id)` |
| Featured series cover | Reconciliation pass in `refreshSeriesSearchCache.js` |
| Search results | Collapse rows sharing `comicvine_volume_id`; year/publisher fingerprint |
| Collection rows | Partial unique `(user_id, gcd_issue_id)`; unique `(user_id, comic_id)` (twice, duplicate index) |
| Listings | One draft/active/reserved listing per `collection_id` |
| Market comps | Unique `(source, external_listing_id)` |
| Local comics | Catalog lookup before submit; no DB constraint on title + issue |
| Ingest work | `.ingest-done.json` ledger, committed by the workflow |

## Missing data behavior

- No cover: fallback image or empty tile. Honest blank beats a wrong cover.
- No year: `bestYearFor()` uses `publication_date`, then `key_date`. About 14% of series have no year at all.
- No GCD issue row for a covered issue: synthetic `cv-` id on the series page.
- No value: nothing shown. Pre-1990 books with no clean comps get no value; from 1990 on, cover price is a floor.

## Fragile areas

1. **Cover linking.** At least five distinct mechanisms have put the wrong cover on an issue or left a real one unlinked: duplicate GCD ids, ComicVine splitting one run across two volumes, duplicate-titled GCD series, trade collections matched as monthly runs, title-pool collisions. Repair scripts fix links, then a later ingest can overwrite them (link lock planned, slop WS4b).
2. **PostgREST 1000-row cap.** Silent truncation has broken the search cache, gap generators, GCD refresh, library hydrate and the repair script. Any new read over 1000 rows needs `fetchAllPages`.
3. **GCD mirror staleness.** Only featured series get issue top-ups. Ongoing series fall behind; orphan covers pile up as `cv-` issues.
4. **Shared volume pins.** A pin overrides title matching. Pinning a volume another series already holds moves covers between series.
5. **Ingest head-of-line blocking.** Unresolvable targets used to eat each run's search budget (pipeline down 26 hours on 2026-09-19). Backoff fixed it; watch `checkCoverIngestHealth.js`.
6. **Actions scheduler.** GitHub skips scheduled runs. `cron-watchdog.yml` re-triggers stale workflows.
7. **Two Python/JS matchers.** `src/lib/coverMatch.js` and the Python ingester must agree; `scripts/fixtures/cover-match-cases.json` is the shared fixture.
8. **Valuation inputs.** `market_comps` holds asking prices (`source = 'ebay-listed'`). Title-to-issue matching (`src/lib/compMatch.js`) decides what counts; loose matches inflate values.
