# `comics` GCD-ID dedupe plan

**Status:** dry-run verified; no deletion authorized or performed  
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

The planner contains no apply mode and makes SELECT calls only. A destructive
phase should be a separate reviewed change. It can delete the verified set
without collection rewiring or cover preservation, but it must repeat the same
eligibility checks immediately before deletion and abort if any rejection,
collection reference, or cover attachment appears.
