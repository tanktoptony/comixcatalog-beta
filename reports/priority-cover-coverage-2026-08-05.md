# Priority cover coverage — 2026-08-05

## Result

**8,686 / 9,485 issues covered (91.58%)** across **170 distinct GCD series**, measured via `scripts/generatePriorityCoverTargets.js`. This is the first reading that clears the launch checklist's 90% gate, and the first reading this week verified stable — identical across 3 consecutive reruns with zero code changes in between.

## Bug #2, root-caused and fixed

Carried over from last night's session (see prior memory/notes): the same script had returned two different answers on back-to-back runs with no code change — 85.34% then 81.29%, a 390-issue swing. One concrete case (Superman 1993, `gcd_id` 28776) showed the script's own `coversById` fetch returning only 9 of 34 real `canonical_covers` rows that undisputedly belonged to that series.

**Root cause:** every multi-page query in the script's pagination helpers (`all()` / `chunks()`) called Supabase's `.range(from, from + PAGE - 1)` with no `.order()` clause. Postgres and PostgREST make no row-order guarantee for a query with no `ORDER BY` — including across separate page requests that look like "the same query" repeated with a different offset. Under concurrent writes (a live ComicVine ingest was writing new `canonical_covers` rows into the same table at the time), the physical row order backing an unordered scan can shift between one page request and the next, so OFFSET-based pagination silently skips or duplicates rows. This also explains why an isolated repro with a synthetic id list (no concurrent writes happening) failed to reproduce it the first time it was investigated.

**Fix:** every paginated query now sorts by its table's primary key before paginating — `id` for `canonical_covers`, `comics`, `series`, `market_comps`; `gcd_id` for `gcd_issues` (which has no separate `id` column). Verified by rerunning the full script 3 times consecutively post-fix: all three runs produced the exact same `8,686/9,485` result.

## Honesty note: measurement fixes vs. real ingest

Not all of this week's percentage movement is new covers landing. Three distinct things happened between 2026-08-01 and tonight:

1. **2026-08-01:** first real priority-scoped reading, 67.49% (17,035/25,241 issues, 166 series).
2. **2026-08-04:** two measurement bugs fixed same day — a cross-volume cover-bleed bug (briefly *dropping* the reading to 68.61% as false-positive matches were removed) and a missed-ID-linked-covers bug (raising it to 79.65% once covers already correctly linked by `series_gcd_id` stopped being invisible to title-only matching).
3. **2026-08-05 (last night):** a denominator bug found — `gcd_issues` logs every variant/reprint/foreign edition as its own row sharing one issue number, inflating the "missing" count 8-9x for variant-heavy modern runs. Dedup fix dropped the true denominator from 25,415 to 9,618 and raised the reading to 85.34% in one run — before bug #2 (this doc) was found and the number was flagged unreliable.
4. **2026-08-05 (tonight):** bug #2 fixed, denominator now 9,485 (live collection/wantlist activity moves this day to day), coverage 91.58%, verified stable.

So: roughly 12 of the ~24-point gain from 67.49% to 91.58% this week is the denominator/measurement corrections described above, not new ComicVine ingest. The remaining gain reflects real ingest activity plus previously-invisible ID-linked covers becoming visible to the counter. Real new-cover-row ingest volume for the same period is tracked independently in `canonical_covers.created_at` (this past week: +9,062 rows added 2026-08-03 through 2026-08-05, vs. +2,430 the week before) — see tonight's report artifact for the full trend.

## Reproduction notes

Run date: 2026-08-05 (America/Chicago). Inputs are live tables (`user_collections`, `comics`, `series`, `gcd_issues`, `canonical_covers`, `market_comps`) plus the committed `src/lib/featuredSeries.js` list. Because inputs are live, later reruns may differ slightly on denominator (collection/wantlist changes) — the numerator/denominator pair should now be internally consistent and reproducible for a given moment in time, which was not true before this fix. 51 series still show at least one gap; see `gap-priority.json`.
