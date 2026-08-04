# 2026-08-03 — Engineering Review & Next Steps

**Date:** 2026-08-03 (session ran into early 2026-08-04)
**Scope:** Full review of all 14 commits landed on `main` today across two concurrently-running AI coding sessions, plus a live data snapshot and a prioritized gameplan.
**Full detail:** `reports/ComixCatalog-Daily-Report-2026-08-03.pdf` — commit-by-commit review, verification evidence, live data snapshot. That PDF is local-only (matches the existing `reports/` convention — see `docs/README.md`), not tracked in git. This file is the durable, git-tracked pointer to it plus the actionable next-steps list.

---

## What shipped today (summary)

- Cover-ingest pipeline: fixed a done-ledger bug that made it silently re-process the same ~180 volumes every run instead of advancing; added publisher-name aliasing and TTL-based ledger expiry so ongoing series don't get frozen after one pass.
- Fixed the specific bug behind "Marvel Tales #239+ shows issue #111's cover" — an unordered `.limit(40)` fallback query in `/api/issues/[id]`.
- Instagram bot: fixed two sequential bugs (publish-before-ready timing, a gitignored ledger file blocking its own commit step). First real successful post landed today.
- Fixed the founding-collector counter counting total signups instead of actual claims against the 100 cap.
- Found and fixed a structural gap: new comic releases with covers ingested but no `series` row to display them on. Fixed going forward (`probeNewReleases.js`) and backfilled today's specific 64 orphaned titles (58 series rows created; 6 already resolved naturally by the time the backfill ran).
- (Other session, reviewed not authored) Two pricing/upgrade CSS grid fixes, hid 12 duplicate Absolute-line series rows, established `PROJECT_STATUS.md` + `LAUNCH_CHECKLIST.md` as docs of record, and fixed a GCD-vs-ComicVine punctuation title-matching bug affecting cover visibility.

## Process note

Both sessions committed directly to `main` all day with no PR gate, under the same git identity. This produced one real near-miss (a push rejection that required stashing a third party's in-progress uncommitted work to resolve safely — recovered cleanly, nothing lost, full account in the PDF §5). No launch-blocking gate flipped today; today's work was correctness/reliability underneath the pipeline, not the evidence-gathering `LAUNCH_CHECKLIST.md` itself is asking for.

---

## Gameplan for tomorrow, in priority order

1. **[Process] Establish a lightweight lock or lane convention between concurrent sessions.** Tonight's near-miss worked out only because `git status` got checked before every risky git operation. At minimum, agree a simple signal for which subsystem each session is touching before starting — two sessions independently touched `src/app/api/series/[id]/route.js` the same night.

2. **[Reliability] Find out why the local `ingest-loop.ps1` keeps dying silently.** Second unexplained stall today, no crash log either time. Either wrap it in a proper Windows Scheduled Task with restart-on-failure, or formally demote it to manual/occasional and lean entirely on the GitHub Actions cron (`cover-ingest.yml`), which has been reliable (27/30 recent runs green).

3. **[Cover-ingest] Fix the publisher-filter-zeroes-unique-candidate bug.** Found investigating "DNAgents": `_resolve_series_gcd_id()` found exactly one series-table title match, but the publisher-compatibility post-filter dropped it to zero candidates, leaving `series_gcd_id` null despite an unambiguous title match. Small, contained fix — directly increases the current 82% `series_gcd_id`-linked rate.

4. **[Launch gate] Run the priority-scoped coverage measurement.** `LAUNCH_CHECKLIST.md`'s cover-coverage gate has only global figures on record (44,882/106,983 gcd_issue_id-linked, 87,276/106,983 series_gcd_id-linked — neither scoped to the launch-priority universe). Run `scripts/checkTargetSeriesCoverage.js` (or equivalent) against the actual launch-priority set to get this gate its first real number.

5. **[Marketing] Let the Instagram bot run its scheduled cron unattended for a few days** before trusting it fully — today was the first successful run, triggered manually after two fixes. Watch 2-3 unattended 17:00 UTC runs rather than more manual triggers.

6. **[Data integrity] Investigate the `comics` table discrepancy.** `PROJECT_STATUS.md` flags 755,401 live rows vs. CLAUDE.md's documented ~140 post-dedupe. Doesn't block launch, but a 5,000x unexplained discrepancy in a core table is worth a founder-level look before it's forgotten under newer work.

7. **[Cover-ingest] Decide whether to run `backfillMissingSeriesRows.js` against pre-today history.** It already supports an arbitrary `--since` date; today's run was deliberately scoped to just today's batch. Ingestion has been running since ~April, so the same orphaned-series-row bug likely affected earlier batches too — worth a dry-run review of the full list before deciding whether to run it broadly.

---

*Generated by Claude (Sonnet 5) following a full-day review of git history and live production Supabase data.*
