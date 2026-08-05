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

## Additional fix found while triaging the ingest queue

After the pagination fix above, a routine check of why `gap-priority.json`'s ambiguous entries ("Superman," "Justice League") were failing ComicVine auto-resolution turned up a real, separate bug: `Superman` (1993, `gcd_id` 28776) is not the real DC ongoing at all — GCD carries at least three distinct series entries all titled plain "Superman" starting 1993 (German/Carlsen Verlag, Spanish/Ediciones Zinco, and this one), and this one's `resolved_publisher_cached` was incorrectly cached as "DC Comics" despite its own GCD publisher record disagreeing. Exactly one real `user_collections` row referenced it (issue #78, added 2026-06-22). The real DC "Superman" vol. 2 (1987–2006, `gcd_id` 3386) already exists in our data with a matching issue #78 (June 1993, Death of Superman era) and zero other references — a near-certain match. Re-linked that row to the correct series and corrected the mislabeled publisher cache to match GCD's own record ("Crusade Comics," pre-2000 GCD-indicia-trust policy). Confirmed via `resolveVolumeIds.js` independently resolving the corrected "Superman (1987)" target to ComicVine volume 3816 — the same volume ID already behind this series' cached featured cover image, a second independent confirmation.

Effect: coverage moved from 91.58% (8,686/9,485) to 92.56% (8,883/9,597) — the false "Superman 90/119 missing" became a true "Superman (1987) 5/231 missing."

A second series, `Justice League` (2022, `gcd_id` 184847), showed the same auto-resolver failure but for a different reason: it turned out not to be a periodical series at all. GCD's entry has exactly 3 "issues" titled "Prisms," "United Order," and "Leagues of Chaos" — these are the **collected editions** of 3 story arcs from the main "Justice League" (2018) ongoing (issues #59-63, #64-68, #72-75 respectively), not monthly issues. ComicVine catalogs each collection as its own one-shot volume (143057, 151414, 151413) rather than one 3-issue volume, so title search kept falling back to the unrelated 75-issue ongoing. Confirmed via ComicVine issue search for each arc name, cross-checked against GCD's own cover dates (July 2022, Nov 2022/Jan 2023, May 2023 — all within tolerance of GCD's July 2022, "2022 [January 2023]," and July 2023 records). Manually fetched and ingested the 3 real collected-edition covers by ComicVine issue ID, matched to the correct `gcd_issue_id` for each. This is a fourth distinct "covers exist but don't show" mechanism beyond the three already logged in project memory (pagination/no-ORDER-BY, duplicate-GCD-series-id, ComicVine volume-splitting) — here it's GCD modeling collected editions as their own numbered series while ComicVine catalogs each collection as an independent one-shot volume.

Final: **92.59% (8,886/9,597)**, 50 series still with a gap (down from 51).

A real ComicVine ingest run (`comicvine_api_to_supabase.py --targets`) against the other 50 (non-Justice-League) targets in the queue added **zero new cover rows** — every one of those targets was already fully ingested under its resolved volume ID. That's consistent with the original denominator-bug pattern: some of the remaining "missing" issue counts in `gap-priority.json` may reflect issues that don't actually exist in ComicVine's data for these volumes (annuals, alternate numbering, etc.), not real ingest gaps — worth a per-series look before assuming more ComicVine budget will close them.

## Reproduction notes

Run date: 2026-08-05 (America/Chicago). Inputs are live tables (`user_collections`, `comics`, `series`, `gcd_issues`, `canonical_covers`, `market_comps`) plus the committed `src/lib/featuredSeries.js` list. Because inputs are live, later reruns may differ slightly on denominator (collection/wantlist changes) — the numerator/denominator pair should now be internally consistent and reproducible for a given moment in time, which was not true before this fix. 51 series still show at least one gap; see `gap-priority.json`.
