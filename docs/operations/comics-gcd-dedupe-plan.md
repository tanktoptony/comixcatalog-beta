# `comics` GCD-ID dedupe plan

**Status:** completed and post-delete verified
**Verified:** 2026-08-04

## Result

Run `npm run data:plan-comics-gcd-dedupe` to reproduce the read-only plan.
The production run on 2026-08-04 reported:

- 755,161 `comics` rows with a non-null `gcd_id` scanned.
- 755,161 eligible after all identity checks.
- Zero attributed rows (`created_by` set).
- Zero missing `gcd_issues` targets.
- Zero issue-number mismatches.
- Zero missing local-series rows or mismatched `series.gcd_id` bridges.
- Zero `user_collections` references to the eligible rows.
- Zero `comic_covers` rows attached to the eligible rows.

Each eligible row independently agrees on both issue identity and series
identity: `comics.gcd_id = gcd_issues.gcd_id`, normalized issue numbers match,
and the linked local `series.gcd_id = gcd_issues.series_gcd_id`. The planner
also excludes any row with `created_by` set.

## Safety boundary

Dry-run is the default and makes SELECT calls only. Destructive mode requires
both `--apply` and `--confirm=<exact eligible count>`. It repeats the complete
eligibility scan immediately before deletion and aborts if the count changes or
if any rejection, collection reference, or cover attachment appears. Deletion
then runs in bounded, verified, retryable batches.

## Applied result

The guarded apply completed on 2026-08-04 and deleted all 755,161 eligible
legacy rows. The post-delete production audit found:

- 240 `comics` rows remain; 209 have `created_by` set.
- Zero remaining `comics` rows have `gcd_id` set.
- All 228 `user_collections` rows referencing local comics remain unchanged.
- The sampled deleted legacy URL returns 404, while its canonical GCD issue
  remains available.

During manual spot-checking, Green Lantern ComicVine volume 4363 was also found
to have its covers fragmented across incorrect same-title GCD series. The
targeted `repairCanonicalCoverVolumeLinks.js` repair retagged 176 rows to the
verified Green Lantern GCD series 3986 (7 were already correct). Production
coverage improved from 7 to 180 covered issues out of 182; the two uncovered
entries are specially numbered variants.
