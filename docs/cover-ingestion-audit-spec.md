# Cover Ingestion — Audit & Target-Architecture Brief

**Companion to:** [docs/data-hardening-and-growth-spec.md](./data-hardening-and-growth-spec.md) §1 (same root problem class, written 2026-08-01 — read that first, this document extends it, doesn't replace it), [docs/data-hardening-and-growth-agent-prompts.md](./data-hardening-and-growth-agent-prompts.md) (the prompt-pack format to match — see "Your task" below).
**Status (2026-08-09):** Discovery only. Nothing in this document has been designed into a fix yet, except the four specific bugs listed in §2 (already shipped — see commits). This is a handoff, not a plan.

---

## 0. Why this document exists

A session on 2026-08-08/09 went digging into "why does the cover-ingest cron keep succeeding while accomplishing nothing" and found four distinct, real, shippable bugs — all fixed and pushed (commits below). But the deeper we went, the clearer it became that these four are symptoms of a system with no single reliable source of truth for "is this issue covered," running on a cadence (every 6 hours) that doesn't match how comics actually release (weekly, Wednesdays), on top of a done-ledger whose semantics were never fully verified. The founder's own words: *"we should only be ingesting once a week on wednesdays or whatever aligns with new releases, not desperately clawing to get basic fucking series covers into the database."*

That's the real ask. This document is the discovery-context handoff for the agent who will audit the full current state and design the target architecture — not a prescription for what to build.

---

## 1. System map — everything that constitutes "cover ingestion" today

### Ingestion (write path)
- **`comicvine_api_to_supabase.py`** (repo root) — the actual ComicVine → Supabase ingester. Takes a `--targets <file>.json` list of `{name, publisher, year}`, resolves each to a ComicVine volume (`find_volume()`), fetches its issues, matches each against `gcd_issues` (via logic mirroring `src/lib/coverMatch.js` — see §3), uploads cover images to the `canonical-covers` storage bucket, upserts `canonical_covers` rows.
- **Done-ledger**: `.ingest-done.json` (repo root, git-tracked but the *live* copy is persisted across runs via GitHub Actions `actions/cache`, keyed `ingest-done-${{ github.run_id }}` with `restore-keys: ingest-done-` — so it never resets, only grows). Keyed by `` `${name}${publisher}${year}` `` (string concatenation, **no separator** — collision-prone, not yet audited for actual collisions). A target is marked done the moment its full issue loop completes **without a crash or rate-limit** — this does not verify that individual issue uploads within that loop succeeded (image download failures, GCD match misses, etc. are logged but don't block the done-mark). `DONE_TTL_DAYS = 30` before a done entry is rechecked. Ambiguous-match failures are deliberately *not* marked done (so they're retried); true not-found failures *are*.
- **`needs_volume_id.json`** (repo root, git-tracked) — accumulates every target that hit an ambiguous ComicVine match (multiple candidates, couldn't auto-disambiguate). **745 entries as of this morning, 748 by the end of today's run.** Nothing currently reviews, resolves, or prunes this file. Worth checking whether `cover-ingest.yml` (which grows it) actually commits it back at all — a quick read of that workflow shows no git-commit step for this specific file, only for the cache-persisted `.ingest-done.json` (which isn't committed either — it's cache-only). **Open question for the audit: is `needs_volume_id.json`'s growth even surviving between runs, or is most of it lost when the ephemeral runner is destroyed?**

### Target-list generators (what feeds the ingester)
Five `gap-*.json` files, each produced by a different script, each consumed by `comicvine_api_to_supabase.py --targets <file>` in sequence inside `cover-ingest.yml`:

| File | Generator | Source of targets |
|---|---|---|
| `gap-priority.json` | `scripts/generatePriorityCoverTargets.js` | User collections/wishlist, high-value `market_comps`, `FEATURED_SERIES` current-heat/featured tiers — the "live launch-gate universe" |
| `gap-featured.json` | `scripts/generateFeaturedGapTargets.js` | `FEATURED_SERIES` entries with zero cover at all (not "missing some," just "missing the featured_cover_path_cached") |
| `gap-manual.json` | Auto-appended by `scripts/probeNewReleases.js` (last-14-days ComicVine releases) and `scripts/generateUserCollectedGap.js` (user-collected series lacking coverage), via `gap-probe.yml` |
| `gap-width.json` | `scripts/generateCoverGapTargets.js --mode=width` | Broad catalog — new series, shallow |
| `gap-depth.json` | `scripts/generateCoverGapTargets.js --mode=depth` | Broad catalog — existing series, fill remaining issues |

### Workflows
- **`.github/workflows/cover-ingest.yml`** — cron `0 */6 * * *` (every 6 hours, 4x/day). Walks all 5 `gap-*.json` files through the Python ingester sequentially, `--max-search-calls 180` each (ComicVine's cap is ~200/hr). `continue-on-error: true` per step.
- **`.github/workflows/gap-probe.yml`** — weekly, Monday 08:00 UTC. Runs `probeNewReleases.js` + `generateUserCollectedGap.js`, commits `gap-manual.json` if changed.
- **`.github/workflows/weekly-refresh.yml`** — weekly, Monday 09:00 UTC. Runs `scripts/refreshSeriesSearchCache.js --force` (recomputes `series.*_cached` columns including `resolved_publisher_cached` and `featured_cover_path_cached`), then regenerates `gap-priority.json` + `gap-featured.json`, commits if changed.

### The coverage-measurement problem (this is the crux)
There are at least **three different join keys** in play across the system, not unified:
1. `comicvine_volume_id` (exact) — used by `--skip-existing` in the Python ingester (`fetch_existing_storage_paths()`).
2. `gcd_issue_id` / `series_gcd_id` + `match_confidence` (exact-ish, resolved at write time per `data-hardening-and-growth-spec.md` §1a) — live in `canonical_covers`, populated by the ingester (confirmed today via live output: `confidence=resolved` / `confidence=series-only` / `confidence=unresolved`), and by `src/lib/coverMatch.js` (exists, 2026-08-01) for read paths that have been migrated to it.
3. Fuzzy `(series_title, issue_number, year±1 tolerance)` text matching — still used by `scripts/generatePriorityCoverTargets.js` (and presumably `generateCoverGapTargets.js`/`findUncoveredSeries.js` — **not yet checked**) to compute "N of M issues covered" for the gap-target generators.

These three disagree. **Confirmed today**, not theoretical: `generatePriorityCoverTargets.js` reported *Spawn* (1992, Image) as 69 of 369 issues missing. A live re-ingest with `--ignore-done` showed ComicVine's actual volume has 377 issues, and **all 377 already have covers** per the exact `comicvine_volume_id` check. The "69 missing" was a measurement artifact, not a real gap.

This is not a new discovery — `docs/data-hardening-and-growth-spec.md` §4c already flagged `scripts/ingestStatus.js` as having exactly this class of bug ("count query returning null/0, producing a nonsense '246900%' readout") on 2026-08-01, tagged as a "genuinely 10-minute fix." **Re-ran it today, still broken, now worse:**
```
canonical_covers (total):        0
  added last 24h:                 0
series (total in catalog):       0
series with >=1 canonical cover: 2,919  (291900.00%)
```
`canonical_covers` does not have 0 rows (it has well over 100k) and definitely had new rows added in the last 24h (this session added several). The monitoring script itself is unreliable across multiple metrics, not just the percentage one. **No coverage number anywhere in this system should currently be trusted without independent verification.**

---

## 2. Today's fixes (shipped, verified, not the whole story)

Commits, newest first, on `main`:
- `3d7b5cf` — Geiger force-resolved via explicit `--volume-id` (confirmed correct against our own DB's issue count), plus the same duplicate-title tie-break bug fixed in `generatePriorityCoverTargets.js` and `generateFeaturedGapTargets.js`.
- `dff1f3d` — unrelated Instagram work, also fixed `scripts/probeNewReleases.js`'s stale hand-copied publisher allowlist (see below).
- `65b15b5` — targeted repair of 110 rows where `series.resolved_publisher_cached`/`cv_publisher` was a **chronologically impossible** value (e.g. "Dynamite Entertainment," founded 2004, on a row dated 1969).
- `87f1d4b` — the actual write-side fix: `update_series_cv_publisher()` in `comicvine_api_to_supabase.py` used to `PATCH series WHERE title ILIKE <name>` with **no year/gcd_id scoping** — ingesting any one ComicVine volume blasted its publisher onto **every other `series` row sharing that literal title**, across eras/countries/publishers. GCD routinely has several rows per title (foreign licensed editions, stalled duplicate indexer entries, reprints). Now scoped to the specific matched `gcd_id`.

**Confirmed blast radius of the bug in `87f1d4b`:** 1,522 distinct titles / 10,091 `series` rows showed the corruption fingerprint (a multi-row title group where every row shares an identical `cv_publisher`, despite GCD linking them to different real publishers). **Only 110 of those 10,091 rows were repaired** — the subset where the wrong value was *provably* impossible (publisher founded after the row's year). A broader repair (trust GCD's `publisher_gcd_id → gcd_publishers.name` indicia for the rest) was attempted and **rejected** after a dry-run showed it would relabel 1,264 genuinely-Marvel rows to "Sociedad Editora América, S. A.," 929 DC rows to "Close-Up Inc.," etc. — **our local GCD publisher-ID mirror is itself unreliable at scale**, a separate, deeper data-quality problem that was never diagnosed further. This is a real open gap: ~9,981 rows are still sitting there, flagged, unrepaired, cause unconfirmed for most of them.

**Also found, not yet acted on:** the duplicate-title tie-break bug (picking `pool[0]` on an unresolved year-tie, no deterministic fallback) was found and fixed in three separate places today (`/api/comics/route.js`, `generatePriorityCoverTargets.js`, `generateFeaturedGapTargets.js`) — three different hand-rolled copies of similar resolution logic, not a shared function. Given it was independently copy-pasted at least three times, **assume it exists in more places until checked** (`findUncoveredSeries.js` and `generateCoverGapTargets.js` were not audited for this pattern).

**Also found:** `scripts/probeNewReleases.js` maintained its own hand-copied ~15-entry publisher allowlist, completely separate from the canonical ~40-entry `US_PUBLISHER_ALLOWLIST` in `src/lib/publisher.js`. It had drifted stale — real publishers (Titan Comics, Ahoy Comics, Antarctic Press, Vertigo, WildStorm, Fantagraphics, VIZ Media, Charlton, ~15 others) were being wrongly rejected as "not allowlisted." Fixed to import the canonical resolver. This is the **second** instance found today of hand-copied logic silently drifting out of sync with a canonical source — worth treating as a pattern to search for explicitly, not a one-off.

**End-of-day empirical result (production run #225, this morning):** all 5 gap-file lanes processed. Every fresh (not-already-done) attempt failed to produce a single new cover:
- `gap-priority.json` (48 targets): 0 fresh, all already-done.
- `gap-featured.json` (1 target): 0 fresh, already-done.
- `gap-manual.json` (470 targets): 0 fresh, all already-done.
- `gap-width.json` (500 targets): 29 fresh attempts → **29 landed in `needs_volume_id.json`, 0 matched.**
- `gap-depth.json` (500 targets): 88 fresh attempts → **88 landed in `needs_volume_id.json`, 0 matched.**

Total issue rows upserted across the entire run: **0.** `gap-width.json`/`gap-depth.json` were never regenerated after the corruption repair (they're a stale snapshot, last touched well before today's fixes), so they likely still carry `(title, wrong-publisher, year)` tuples baked in from before the write-side fix landed. That's the leading hypothesis, **not yet confirmed** — regenerating them and re-testing is an obvious next step nobody has done yet.

---

## 3. Relationship to `docs/data-hardening-and-growth-spec.md` §1

That spec (2026-08-01) already diagnosed the broader architectural problem — text-based matching with no reliable ID link, half a dozen independently-implemented read paths. **Partially shipped since then:**
- `src/lib/coverMatch.js` exists (created 2026-08-01).
- `gcd_issue_id` + `match_confidence` resolution is live in the ingester (confirmed today via real output).
- `scripts/ingestStatus.js` exists (created 2026-08-04) but per §1 above, is still producing nonsense numbers — the "genuinely 10-minute fix" flagged in that spec's §4c does not appear to have actually been done, or regressed since.

**Not confirmed either way, needs the audit:** whether §1e (read-path consolidation — `library-hydrate`, `public-profile`, PDF export, issues API, series API all importing `resolveCoverForIssue()` from the shared helper instead of reimplementing matching) actually landed, and whether the gap-target generators (`generatePriorityCoverTargets.js` etc.) were ever migrated to use the reliable ID-based join instead of fuzzy text matching — the Spawn discrepancy strongly suggests they were not.

**Today's findings are a different, additional layer on top of that spec** — the spec is about *read-path* matching reliability; today's four bugs are mostly about *write-path* corruption (blast-write) and *generator-side* determinism (tie-breaks, stale allowlists). Both need fixing; neither substitutes for the other.

---

## 4. What's confirmed healthy — don't re-litigate

- The Python ingester's core search/match/upload logic, 420 rate-limit backoff (escalating retries, correctly distinguishes a transient velocity blip from a genuinely exhausted hourly window), and its refusal to guess on ambiguous matches are all sound. Geiger's original "volume not found" was **correct behavior** for a genuinely ambiguous case — it just needed one human decision (`--volume-id`), not a code fix.
- The publisher-gate logic (`_norm_publisher`, `_publisher_aliases_match`, `PUBLISHER_ALIASES`) in the ingester is well-reasoned and has already prevented real false-positive risk (its own comments document specific prior incidents it guards against).
- `scripts/repairSeriesPublishersWithCv.js` (pre-existing, reviewed, year-aware publisher repair tool) is safe and correctly designed for the threat model it targets (stale GCD indicia losing to clean modern `cv_publisher` data, e.g. TMNT Mirage→IDW) — it just wasn't built for the *opposite* threat model (today's blast-write bug), which is why it couldn't fix what today's session found.
- All 5 GitHub Actions workflows execute without crashing. **Important caveat for the audit:** green ≠ productive. That conflation — reading a clean CI run as evidence of progress — is itself one of the day's core lessons and should inform how the audit reports status (report actual upsert/coverage numbers, not just exit codes).

---

## 5. Founder's stated target direction (verbatim intent, not yet designed)

> "We should only be ingesting once a week on Wednesdays or whatever aligns with new releases, not desperately clawing to get basic series covers into the database."

Read literally, this means: move off the every-6-hours cron entirely, toward a deliberate weekly pass timed to US new-release day (Wednesday), with enough budget in one sitting to make real, measurable progress rather than four small fragmented attempts a day that mostly re-walk an already-done ledger. This has a real engineering justification beyond just "less noise": ComicVine's cap is ~200 requests/hour regardless of how it's spent, and a continuous-trickle cadence spends a meaningful fraction of each window's budget just walking past the done-ledger before reaching anything new, on a schedule that has no relationship to when new content actually exists.

This is **direction, not a spec** — the audit should treat it as the goal to design toward, not a prescription for exactly how (e.g., whether "weekly" means one long GHA job with a much larger budget, several chained jobs, or something else is an open design question).

---

## 6. Your task

You're the agent picking this up. Your job, in order:

1. **Verify, don't inherit.** Every number in this document is dated 2026-08-09 or earlier. Re-check anything you're about to design around — the ledger count, the `needs_volume_id.json` size, whether `gap-width.json`/`gap-depth.json` regeneration actually fixes the 100%-failure pattern, whether §1e of the data-hardening spec is actually done. Don't assume this document is still accurate by the time you read it.
2. **Audit the full current state** of every piece in §1 — mark each script/workflow/file as healthy, broken, or unknown, with evidence (not vibes) for each call. Specifically resolve the open questions raised above: how many of the ~9,981 still-unrepaired corrupted rows are actually wrong (vs. coincidentally uniform-but-correct); whether the done-ledger's "completed without crashing ≠ actually succeeded" semantics are causing real, confirmed stuck-incomplete series (Spawn wasn't one — find one that is, or rule the theory out); whether `needs_volume_id.json`'s growth is actually persisting between runs; whether the tie-break and stale-allowlist-duplication patterns exist anywhere else in the codebase.
3. **Design the target architecture** — a single trustworthy source of truth for "is this issue covered" (resolving the three-join-key disagreement in §1), a coherent weekly-Wednesday-aligned cadence per §5, and a plan for the `needs_volume_id.json` backlog (review/resolve mechanism, not just indefinite accumulation).
4. **Produce the companion prompt pack** — `docs/cover-ingestion-agent-prompts.md`, matching the exact format already established in `docs/data-hardening-and-growth-agent-prompts.md` (shared preamble, one section per workstream, "Human review required: Y/N" flag per prompt, verified-starting-state notes, self-contained enough that a fresh agent with no session history can execute any single prompt).

### Conventions to follow (already established in this repo)
- Branch/PR workflow exists (soft convention — direct pushes to `main` are allowed but `pr-ci.yml` gates auto-merge when a PR is opened). If you spawn concurrent agents to execute pieces of the eventual prompt pack, give each one `git worktree add`, not just a branch name — a branch alone doesn't isolate a concurrent session.
- New Node scripts go in `scripts/`; Python stays ingestion-only, at the repo root.
- Read `CLAUDE.md` at the repo root before touching anything — schema notes, the exact-column-name gotchas (`grade_numeric` not `grade_num`, etc.), the PostgREST 1000-row pagination trap, and `runWithRetry()`'s return-shape gotcha have all bitten this codebase before.
