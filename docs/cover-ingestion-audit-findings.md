# Cover Ingestion — Audit Findings

**Companion to:** [docs/cover-ingestion-audit-spec.md](./cover-ingestion-audit-spec.md) (the handoff brief this document verifies against).
**Status (2026-08-09):** Step 1-2 of that brief's §6 task only — re-verification + healthy/broken/unknown audit with evidence. No target architecture, no prompt pack. Those are a separate, later pass.
**Method:** Direct re-verification against live state — `gh run view --log` on real cover-ingest.yml runs, live Supabase queries via the service-role key, and re-reading the actual source (not trusting the prior document's characterizations). Every number below was produced this session, dated 2026-08-09.

---

## 0. Corrections to the discovery doc

Two claims in the handoff brief don't survive verification:

1. **"Done-ledger key has no separator, collision-prone"** — false. `_done_key()` in `comicvine_api_to_supabase.py:459` joins `name`/`publisher`/`year` with a `\x01` (SOH) control character, confirmed both in the source bytes and in the live `.ingest-done.json` file (e.g. `'52\x01DC Comics\x012006'`). It reads as "no separator" only because `\x01` is invisible in a normal file view. Not a real collision risk in practice.

2. **"Leading hypothesis: gap-width.json/gap-depth.json carry stale wrong-publisher tuples from before the 87f1d4b write fix"** — tested directly, does not hold up. Sampled all 1,000 gap-width + gap-depth targets against current `series.cv_publisher`: only 47/1,000 (4.7%) disagree, and the disagreements are mostly imprint-vs-parent-company naming (target says "Gold Key", live series row says "Western Publishing" — Gold Key was a Western Publishing imprint, this is correct, not corruption). The real cause of the 0-upserts pattern is different — see §3.

---

## 1. System map — status with evidence

### Ingestion (write path)

**`comicvine_api_to_supabase.py` — HEALTHY.** Re-read the rate-limit backoff, ambiguous-match refusal, and the `update_series_cv_publisher()` scoping (confirmed it now filters on the matched `gcd_id`, not a bare title `ILIKE`). Matches the doc's own §4 assessment; nothing found to contradict it.

**Done-ledger (`.ingest-done.json`) — key format is fine (see §0); persistence semantics are BROKEN, confirmed, worse than the doc could show.**
- The git-tracked copy (1,240 entries, last touched by a human commit on 2026-08-05) is stale. The live cache-only ledger actually driving the cron was at **2,212 entries** as of the 12:23 UTC run today (`gh run view 31313176017 --log`) — 972 entries ahead of what's in git. This is by design (comment in `cover-ingest.yml` says so) but means nobody reading the repo alone can know the real ledger size.
- **The "completed without crashing ≠ actually succeeded" theory is not just plausible, it's the dominant case.** Sampled 40 real entries from the done-ledger at random and cross-checked each against live `gcd_issues`/`canonical_covers` counts:
  - **29 / 40 (72.5%)** show a real coverage gap versus what's marked done.
  - **5 of those have zero covers uploaded at all** despite having real issues in GCD — `Beetle Bailey` (55 issues, 0 covers), `Deadpool` 2021 (8 issues, 0 covers), `Inhumanity: Superior Spider-Man` (1 issue, 0 covers), `Junk Rabbit` (17 issues, 0 covers), `We Only Find Them When They're Dead` (73 issues, 0 covers).
  - Caveat: partial gaps alone are *expected* under the documented semantics (image download failures and GCD match misses are logged but don't block the done-mark) — that's not new. What's new is the scale: this isn't a rare edge case, it's most of a random sample.

**`needs_volume_id.json` — BROKEN, confirmed with direct evidence (the doc's own open question, now answered).**
- `cover-ingest.yml` caches only `.ingest-done.json` (`path: .ingest-done.json` at line 82). There is no cache step and no git-commit step anywhere in the workflow for `needs_volume_id.json`.
- Checked three separate run logs (Aug 8 18:19, Aug 9 00:46, Aug 9 06:35): every single cycle starts from the same git-committed baseline (745 entries), the width/depth steps append the same ~29 and ~88 entries respectively to reach 748, and by the next cycle it's back to 745. **The growth from every automated run has been thrown away every 6 hours, for as long as this workflow has been running this way.** The only entries that have ever survived are the ones the founder ran locally and committed by hand (Aug 5, Jun 16, Jun 8 — all human narrative commits, not automated).

### Target-list generators

**`generatePriorityCoverTargets.js` — HEALTHY now, confirmed live.** Re-ran it. `Spawn` (1992) no longer appears anywhere in the gap output — the false "69/369 missing" the doc flagged is gone. Code now resolves ID-linked covers via `series_gcd_id` first and only falls back to `series_title` fuzzy matching for older cover rows that predate the ID link (`generatePriorityCoverTargets.js:132-198`). Fresh coverage summary: **9,315/10,078 (92.43%)**. Duplicate-title tie-break fix (3d7b5cf) confirmed present in source.

**`generateFeaturedGapTargets.js`** — tie-break fix confirmed present by code read. Not independently re-run (low blast radius — file currently has 1 target).

**`probeNewReleases.js`** — allowlist fix confirmed. Grepped every `US_PUBLISHER_ALLOWLIST`/`ALLOWLIST` reference in `src/` and `scripts/`: every consumer now imports from `src/lib/publisher.js`. No other hand-copied duplicate found anywhere in the codebase — the doc's "assume it exists in more places" concern is resolved for this specific pattern.

**`findUncoveredSeries.js` and `generateCoverGapTargets.js` — audited per the doc's explicit request, tie-break bug NOT present in either.** `findUncoveredSeries.js` dedupes via `(title, year_start, publisher)` grouping, not a first-of-ambiguous-pool pick. `generateCoverGapTargets.js` queries series directly with an order/limit, no candidate-pool pick logic at all. Also checked other `[0]`-pick sites found via grep (`resolveVolumeIds.js`, `fetchStoryArc.js`, `validateFeaturedSeries.js`) — `resolveVolumeIds.js` sorts by `count_of_issues` descending before picking, a real deterministic heuristic, not the bug.

### Workflows

**`cover-ingest.yml`** — executes cleanly every cycle (confirmed via `gh run list`, all recent runs green, 1-2 min each). But green-and-empty is confirmed directly, not inferred: the last 3 checked runs (00:46, 06:34, 12:23 UTC today) each report **`Upserted 0 issue rows total`** across all 5 gap files. Root cause identified precisely — see §3, and it is not the doc's stale-data hypothesis.

**`gap-probe.yml` / `weekly-refresh.yml`** — not independently re-verified this session (time-boxed to the ingest path); nothing found that contradicts the doc's characterization.

### Coverage-measurement problem

**`scripts/ingestStatus.js` — confirmed still broken, but the failure mode is more specific than the doc captured: it's intermittent, not constant.** Reproduced live in this session: the first run printed the exact nonsense the doc described (`canonical_covers (total): 0`, `added last 24h: 0`, contradicted by its own "most recent covers" list showing real rows). Three immediate re-runs afterward all printed correct numbers (`total: 107,539`). Isolated it to the `Promise.all` of four count-exact/head:true Supabase queries — under concurrent load, one or more occasionally comes back with `count: null` (not an `error`, so nothing surfaces it) and gets silently coerced to `0` via `?? 0`. This matches the "second non-deterministic data-fetch bug, found but not fixed" noted from the 2026-08-05 session — same bug, still live, now reproduced with a clean before/after. **No single run of this script should be trusted without re-running it at least once.**

**§1e read-path consolidation (`resolveCoverForIssue()` / `coverMatch.js`) — confirmed NOT done.** Grepped every route under `src/app/api/` for `coverMatch`/`resolveCoverForIssue`: zero matches. Ten separate API routes each query `canonical_covers` independently: `search/series`, `issues/[id]`, `series/[id]`, `story-arc/[id]`, `public-profile`, `library/catalog-link/search`, `export/pdf`, `search/comics`, `library-hydrate`, `activity`. `coverMatch.js`'s logic is consumed only by one-off repair scripts and mirrored (not imported) in the Python ingester. This is a real, quantified gap, not a guess.

---

## 2. Publisher-write corruption backlog — partially resolved

Re-ran the "corruption fingerprint" (a title-group where every `series` row shares an identical `cv_publisher` despite GCD linking them to different real publishers): **744 groups / 7,448 rows flagged today**, down from the doc's 1,522/10,091 (some resolved by the 110-row repair and/or ordinary data drift since).

Spot-checked samples qualitatively look like real corruption, not coincidence — e.g. "Cobra" rows genuinely linked in GCD to *Egmont Serieförlaget AB*, *Kiddie Kapers Co.*, and *AiT/Planet Lar* are all uniformly stamped `cv_publisher = "IDW Publishing"`; "Zorro" rows linked to *A/S Interpresse*, *Toby Press of Conn. Inc.*, *Claypool Comics/Boffin Books Inc.* are all stamped `"Topps Comics"`.

**Could not reliably quantify "how many of the 7,448 are actually wrong"** — tried exact-string comparison against `gcd_publishers.name` and it's too strict to be useful (0/7,448 "agreed," even for rows that are probably fine, because GCD and ComicVine use different legal-entity-suffix conventions for the same real publisher). A trustworthy split needs the ingester's own `_norm_publisher()`/`PUBLISHER_ALIASES` normalizer, not ad hoc matching. Flagging this as a concrete next step rather than guessing further — this part of the doc's open question remains genuinely open.

---

## 3. New finding: the real reason gap-width/gap-depth produce 0 upserts

The doc's own "leading hypothesis" (stale wrong-publisher data) is refuted in §0. The actual cause, confirmed directly from today's run logs:

**Both files are fully saturated with no room for anything else.** In the checked run: `gap-width.json` (500 targets) = 471 already-done + 29 permanently-ambiguous. `gap-depth.json` (500 targets) = 412 already-done + 88 permanently-ambiguous. That's 500/500 and 500/500 — every single entry in both files is accounted for by one of exactly two states.

"Permanently ambiguous" is the operative phrase: per the ingester's own documented rule, ambiguous ComicVine matches are deliberately never marked done, so they get retried — but nothing ever resolves them (the `needs_volume_id.json` persistence bug in §1 means the review queue evaporates every 6 hours), so the same ~117 targets get rediscovered, re-attempted, and re-fail as ambiguous every single cycle, contributing exactly 0 new covers, forever, by design, until a human manually runs `--volume-id` on each one (the same one-at-a-time fix already applied to Geiger).

The sampled ambiguous titles back this up — `Dick Tracy`, `Tom and Jerry`, `Walt Disney Uncle Scrooge`, `Walter Lantz Woody Woodpecker`, `Turok Son of Stone`, `The Pink Panther`, `The Twilight Zone` — inherently reused/rebooted titles ComicVine itself can't auto-disambiguate. That's correct, intended ingester behavior, not a bug in the matcher.

**Practical implication:** regenerating `gap-width.json`/`gap-depth.json` (the doc's proposed "obvious next step") will not fix the 0-upserts pattern by itself. The bottleneck isn't stale target lists, it's an unreviewed, perpetually-regrown ambiguous-match backlog with no resolution mechanism — which the doc's own §6.3 design task already anticipated needing, now confirmed as the actual root cause rather than a side risk.

---

## 4. Summary table

| Component | Status | Evidence basis |
|---|---|---|
| `comicvine_api_to_supabase.py` core logic | Healthy | Code re-read, matches doc §4 |
| Done-ledger key format | Healthy (doc was wrong) | Raw byte inspection |
| Done-ledger git vs. live state | Misleading but by-design | `gh run log`: 2,212 live vs. 1,240 in git |
| Done-ledger "done ≠ succeeded" | Broken, confirmed at scale | 29/40 sampled entries show real gaps, 5 with zero covers |
| `needs_volume_id.json` persistence | Broken, confirmed | 3 run logs, identical 745-baseline reset every cycle |
| `generatePriorityCoverTargets.js` | Healthy (Spawn bug fixed) | Live re-run, Spawn absent from output |
| `generateFeaturedGapTargets.js` | Healthy (by code read) | Tie-break fix present in source |
| `probeNewReleases.js` allowlist | Healthy, no other duplicates found | Full-codebase grep |
| `findUncoveredSeries.js` | Healthy, no tie-break bug | Code read |
| `generateCoverGapTargets.js` | Healthy, no tie-break bug | Code read |
| `cover-ingest.yml` | Runs clean, produces 0 new covers | 3 live run logs |
| `ingestStatus.js` | Broken, intermittently | Reproduced both failure and success live |
| Read-path consolidation (§1e) | Not done, confirmed | 10 API routes grepped, zero use `coverMatch.js` |
| Publisher-corruption backlog | Partially resolved, ~7,448 rows still flagged | Live fingerprint re-run; wrong/right split still open |
| gap-width/depth 0-upserts cause | Root-caused (not the doc's hypothesis) | Saturation math from live logs + 1,000-target sample |
