# Priority cover coverage — 2026-08-04

## Result

After the priority repair pass, the measurable launch-priority universe is **18,182 / 25,391 issues covered (71.61%)** across **168 distinct GCD series**. The gate requires at least 90%, so it is not met.

The table below is the pre-repair baseline captured earlier the same day; live collection activity subsequently moved the denominator from 25,241 to 25,391 issues and the universe from 166 to 168 series.

| Priority source | Distinct series | Covered issues | Total issues | Coverage |
| --- | ---: | ---: | ---: | ---: |
| User collections (owned and for-sale) | 87 | 10,144 | 14,303 | 70.92% |
| Wantlists (`user_collections.status = 'wishlist'`) | 3 | 460 | 468 | 98.29% |
| Curated featured list | 79 | 6,889 | 10,937 | 62.99% |
| Current-heat featured tier | 15 | 743 | 870 | 85.40% |
| High-value signal | 59 | 7,781 | 9,908 | 78.53% |
| De-duplicated union | 166 | 17,035 | 25,241 | 67.49% |

Category rows overlap. Only the de-duplicated union is the gate numerator and denominator.

## Repair pass

`scripts/generatePriorityCoverTargets.js` regenerated the same measurable universe at 17,165/25,391 (67.60%) and produced 106 series targets. `comicvine_api_to_supabase.py --targets gap-priority.json --skip-existing` then processed 97 volumes, skipped nine ledger-complete targets, upserted 413 cover rows, and left three ambiguous targets for manual volume selection. The post-run generator measured 18,182/25,391 (71.61%), a gain of 1,017 covered GCD issue rows or 4.01 percentage points. Shared issue numbers and GCD variants allow one new canonical cover to satisfy more than one denominator row.

The reduced live queue contains 98 series. It is committed as `gap-priority.json`, runs before generic queues in `.github/workflows/cover-ingest.yml`, and is regenerated weekly by `.github/workflows/weekly-refresh.yml`.

## Universe derivation

The query was read-only against live Supabase on 2026-08-04.

- Collections and wantlists came from all 681 live `user_collections` rows. GCD-linked rows were mapped through `gcd_issues.series_gcd_id`; local `comic_id` rows were mapped through `comics.gcd_id -> gcd_issues.series_gcd_id` or `comics.series_id -> series.gcd_id`. This resolved 87 non-wishlist series and 3 wishlist series. There were 228 collection rows that could not be mapped to a GCD series (212 non-wishlist and 16 wishlist), so they cannot enter an issue-level GCD denominator.
- Featured titles came from all 79 entries in `src/lib/featuredSeries.js`, using the same exact title/publisher and nearest-`prefer_year` selection used by `scripts/generateFeaturedGapTargets.js`. All 79 resolved to a live GCD-backed `series` row. Its 15 tier-1 entries are also the repository's explicit “current heat” set.
- High-value series were those containing either a `user_collections` issue with `market_value` or `auto_market_value` at least $100, or a `market_comps` issue with `sold_price` at least $100. The live query found 632 qualifying comp rows and 59 distinct series after hydration. The $100 cutoff is explicit here so this category is falsifiable; the checklist does not otherwise define “high-value.”
- A second current-release probe queried `gcd_issues` for `publication_date` from 2026-07-21 through 2026-08-04, with null publication dates falling back to `key_date`, matching the 14-day window used by `scripts/probeNewReleases.js`. It returned zero issues because the live GCD mirror has no dated records in that window. Consequently, current releases are represented only by the curated current-heat tier in this measurement.
- Frequently searched series could not be added honestly: the application persists no search log or search-event table. Search requests go directly to the API, while browser analytics sends to Google Analytics; the local environment has a measurement ID but no Analytics Data API credentials/export. This measurement must be rerun once series-level search telemetry is queryable.

After de-duplication, the five resolvable sources produced 166 series. All 166 had live `series` rows and at least one `gcd_issues` row, yielding 25,241 distinct issue rows.

## Coverage rule

Coverage uses the logic from `scripts/checkTargetSeriesCoverage.js`, not structural-link percentages:

1. Match `canonical_covers.series_title` to the selected `series.title`.
2. Require normalized publishers to match (removing company suffixes such as “Comics”, “Publishing”, “Inc.”, and punctuation).
3. Match normalized issue numbers.
4. Require `canonical_covers.series_year`, or the year parsed from `cover_date`, to be within ±1 year of the issue's `publication_date`; fall back to `series.year_start_cached` when the issue has no publication year.
5. Count each GCD issue once. A priority series appearing in more than one source is counted once in the union.

The query loaded 25,241 `gcd_issues` rows and 19,663 candidate `canonical_covers` rows, with explicit pagination to avoid PostgREST's 1,000-row response cap.

## Reproduction notes

Run date: 2026-08-04 (America/Chicago). Inputs are live tables (`user_collections`, `comics`, `series`, `gcd_issues`, `canonical_covers`, and `market_comps`) plus the committed `src/lib/featuredSeries.js` list. Because the inputs are live, later reruns may differ; retain the date, thresholds, current-release window, matching rule, and unresolved-row counts when comparing results.
