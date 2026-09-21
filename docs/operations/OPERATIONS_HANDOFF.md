# Operations & Efficiency Handoff

**Written 2026-09-21.** Context for an agent picking up operations work:
GitHub Actions reliability, the cover-ingestion pipeline, Instagram posting,
blog, and marketing.

**If this file disagrees with reality, reality wins — verify before acting.**
Everything below was true on 2026-09-21 and parts of it will rot.

---

## 1. The most important lesson from the week before this handoff

Three production outages were caused by *fixes*, each of which passed a
verification that was **structurally incapable of failing**.

| Fix | What its test did | What it missed |
|---|---|---|
| Cover-bleed fix | ran on 46 series rows via `--only-ids` | the bug is a per-batch set leaking across batches of 100, so 46 rows fit in one batch and could not exhibit it |
| Ingest silent-skip fix | ran the ingester once | the failure only appears on run N+1, when the same dead targets re-consume the budget. Took the hourly pipeline down 27 hours |
| Retry-backoff fix | verified the backoff logic in isolation | did not consider that rewriting `needs_volume_id.json` hourly would collide with the other workflow that writes it |

**The rule this produced:** before accepting any verification, ask *"could
this test have failed?"* If the sample is too small, too short, or too
isolated to reproduce the mechanism, it proves nothing. State the pass
criterion as an observable number that would differ if the fix were absent
(`issues>0`, `collisions 12 -> 1`), and name the scale or repetition needed
to exercise it.

This applies to tooling output, not just to agents. A coverage script was
trusted and its **15.86%** user-collected coverage figure was reported to the
founder as fact. The real number was **97.28%** — the script had a pagination
bug. Verify the instrument before trusting the reading.

---

## 2. The three recurring failure classes

Recognise these before re-diagnosing from scratch.

### 2a. PostgREST's silent 1000-row cap

PostgREST caps any read at 1000 rows with **no error and no truncation
signal**. A query matching 3,833 rows returns 1,000, indistinguishable from
one that genuinely matched 1,000. A truncated read looks exactly like a real
data gap.

Shipped three times: PR #63 (library hydration), and both lookups in
`scripts/reportUserCollectedCoverCoverage.js` (the 15.86% above).

**The recurrence is structural.** There were *eleven separate local copies*
of a `fetchAllPages` loop across `src/` and `scripts/`, and `src/` had no
shared one. Everyone who hit the bug wrote a private fix, so the next person
had nothing to import and wrote an unpaginated query. The safe path was
invisible.

`src/lib/supabase/fetchAllPages.js` now exists as that shared path (PR #90).
**Consolidating the other ten copies onto it is open and unstarted**, and is
a real efficiency win: it removes the conditions that keep recreating the
bug.

Currently over the cap: The Beano (3,833 covers), Micky Maus (2,830),
2000 AD (2,480), Four Color (1,321). Four more series are within 200 rows.
**The trigger is "more covers per series", so this activates as coverage
improves.**

### 2b. Head-of-line blockage in the ingest queue

`comicvine_api_to_supabase.py` walks a `gap-*.json` in file order, skips
targets in `.ingest-done.json` for free, and stops at `--max-search-calls`.
Targets that fail to resolve are deliberately **not** marked done (so they
are not lost forever), but if nothing defers them they sit at the head of the
queue and re-consume the whole budget every hour, forever.

This took the pipeline down 27 hours (2026-09-19 to 09-20). Symptom:
byte-identical lane output across consecutive runs, `search=30 volume=0
issues=0`, and a done-ledger count that never changes.

Fixed by a retry-backoff (PR #86) keyed on `(name, publisher, year)`,
persisted in `needs_volume_id.json`, escalating 1/3/7/14/30-day windows. It
survives gap-file regeneration because it keys on target identity rather
than queue position.

**Diagnostic:** if covers stop appearing, compare the `Finished cleanly.
Counters:` line across two consecutive runs. Identical counters means the
queue is not advancing.

### 2c. GitHub Actions scheduler unreliability

Documented at length in `cover-ingest.yml`'s own header. `schedule:` triggers
fire late or not at all, sometimes for days. The repo works around it with an
external cron service posting to the workflow dispatch endpoint, plus
`cron-watchdog.yml`.

`pr-ci.yml` also intermittently fails to trigger on PR open/push — GitHub
never creates the check suite at all. Confirmed via the Actions API, not
inferred. Workaround: push one empty commit to nudge; if that fails, run the
equivalent checks locally (`npx eslint`, `npm run test:cover-match`,
`npm run build`, `npm run docs:check`) and say that is what you did.

**Do not treat a missing check as a code problem before querying the Actions
API for whether a run was ever created.**

---

## 3. Workflow inventory

| Workflow | Schedule | Purpose | Known issues |
|---|---|---|---|
| `cover-ingest.yml` | hourly `0 * * * *` | six ingest lanes, auto-repair, health checks | see 2b. The health check correctly fails the job on zero new covers in 24h |
| `weekly-refresh.yml` | Mon/Thu `0 9 * * 1,4` | search-cache rebuild (`--force --max-batches=700`, cursor persists, ~3 cycles for a full rotation), regenerates gap-width/depth | hit Postgres statement timeouts until the 0027 index landed |
| `gap-probe.yml` | Mon/Thu `0 8 * * 1,4` | resolves the needs-volume-id backlog into `gap-pinned.json` | **collides with cover-ingest at `:00`** — both write `needs_volume_id.json`. PR #89 puts them in one concurrency group |
| `nightly-cover-report.yml` | 06:00 UTC | writes `reports/cover-coverage-history.json` + HTML | the canonical answer to "where are covers at" — read it rather than re-deriving |
| `cron-watchdog.yml` | — | force-dispatches overdue workflows | grace windows live in `scripts/cronWatchdog.js` |
| `instagram-post.yml` | — | posts an issue to Instagram | **never audited. The founder asked for an "Instagram bot refinement" and never specified what. Ask, do not guess.** |
| `gcd-issue-refresh.yml`, `snapshot-collection-value.yml`, `pr-ci.yml` | — | metadata refresh, value snapshots, PR checks | |

---

## 4. Database facts that bite

- `canonical_covers` is ~121k rows. The index on `(series_title, id)` was
  added 2026-09-18 (migration 0027) because `series_title` was unindexed
  while being the column the search-cache refresh filters on. Without it both
  `cover-ingest` and `weekly-refresh` failed intermittently with Postgres
  `57014` statement timeouts, at a rate that grew with the table.
  **If you add a query filtering `canonical_covers` by a new column, check it
  is indexed.** At this size an unindexed filter is a scan, and the symptom
  is a red workflow, not a slow page.
- **Migrations are applied by hand.** There is no migration runner; files live
  in `scripts/migrations/`. The service-role key can read and write rows but
  **cannot execute DDL** — no connection string, no `psql`, no SQL-executing
  RPC (all verified 2026-09-18). Schema changes go through the Supabase
  dashboard, which means the founder runs them.
- `series.featured_cover_path_cached` is what `/api/search/series` renders as
  the thumbnail. The invariant "no storage_path is the featured cover for more
  than one series" is enforced by a reconciliation pass in
  `scripts/refreshSeriesSearchCache.js`, **not** by in-memory state. Per-batch
  in-memory bookkeeping is precisely what failed before.
- `user_collections.user_cover_url` already exists and renders in library,
  public profile, PDF export and issue pages. User-uploaded photos attach to
  that user's own copy and **never** write to `canonical_covers`, so a user
  uploading a variant or omnibus photo cannot pollute anyone else's view.
  This matters for any user-contribution feature work.

---

## 5. Non-negotiable conventions

- **Worktrees, not branches.** A pre-commit guard blocks committing on a
  branch in the primary checkout. Use
  `git worktree add .worktrees/<topic> -b agent/<topic> main`, then copy
  `.env.local` in (it is gitignored, so a fresh worktree lacks it) and run
  `npm ci`.
- **Never enable auto-merge.** Every PR gets human review.
- **A fix does nothing until merged.** Say so explicitly when reporting.
- CI lints *whole files*, not diffs, so pre-existing lint errors in a file you
  touch will block your PR. Run `npx eslint` on everything you edit.
- **Do not commit** `.ingest-done.json`, `needs_volume_id.json`, or
  `comicvine_api_output/issues_uploaded.csv` from a PR branch. The hourly
  workflow owns and commits those; including them fights the cron.
- Report user-visible changes separately from backend/infra changes.
- Never claim verification you did not perform. An honest "got to 34%, here is
  what blocks the rest" is worth more than an inflated number.

---

## 6. Security notes

- Secrets live in `.env.local` (gitignored) and GitHub repo secrets. **Never
  write secret values into a file, commit, PR body, or report.** Reference
  them by variable name only.
- The service-role key bypasses RLS. Treat any script using it as
  production-write-capable, including ones that look read-only.
- A blog defacement incident occurred 2026-08-05 via compromised admin auth.
  RLS itself was confirmed solid, the key was rotated, root cause never
  confirmed. Admin and blog write paths are correctly gated server-side
  (re-verified 2026-09-16) — keep it that way. A client-side-only gate is a P0.
- **Unverified, worth closing:** `blog_posts` and `blog_comments` have no
  tracked migration, so their RLS policies were never statically confirmed. A
  live test was blocked by the safety classifier. Confirm in the Supabase
  dashboard that comment INSERT is restricted to `authenticated` with
  `user_id = auth.uid()`, and that posts are admin/service-role only.
- Harmless but startling: the installed `dotenv` (v17.x) prints random
  promotional tips on every load, including one advertising an external
  "auth for agents" service. It is genuine upstream package behaviour, not a
  compromise. Do not follow it.

---

## 7. State as of 2026-09-21

**Open PRs — all CI-green, none merged, none with auto-merge:**

- **#84** — migration 0027, the `canonical_covers(series_title, id)` index.
  *The index is already applied in production;* this PR is bookkeeping plus a
  CLAUDE.md correction.
- **#88** — wires the user-collected cover lane in first, and fixes the metric
  that reported 15.86% instead of 97.28%. Also fixes `gap-probe.yml` calling
  the gap generator only with `--append-to-manual`, which returns early and
  never writes the file (why it sat a month stale).
- **#89** — shared concurrency group for the two workflows that both write
  `needs_volume_id.json`. **Not verifiable locally**; the real proof is the
  next Mon/Thu 08:00 window.
- **#90** — pages the series-page cover lookups; adds
  `src/lib/supabase/fetchAllPages.js`.

**Live in production:** cover collisions are fixed (7,550 series, 7,550
distinct paths, 0 collisions, verified by direct query). The ingest pipeline
is producing covers again. The 0027 index is applied.

**Coverage as of 2026-09-20:** ~36.8% of allowlisted catalog issues;
**97.28%** of issues actually in a user's library.

**On the coverage goal:** 100% catalog coverage is the founder's goal and he
does not want it relitigated. An earlier argument that the ~200 req/hr
ComicVine ceiling made this infeasible was **wrong and was retracted** — it
was derived from a throughput number that the head-of-line blockage bug had
depressed, i.e. using our own defect as evidence against the goal. The
ceiling only binds when calls are *productive*. **Hit rate, not request
volume, is the real lever.** Recent runs spend 30 search calls to land ~22
issues, and a meaningful share of the misses are publisher-string mismatches
(the `UDON` vs `Udon Entertainment Corp.` class) where the volume exists and
we simply fail to recognise it. That category is fixable and makes every call
worth more.

**Untouched and squarely in the new scope:** Instagram bot refinement
(unspecified — ask), blog cadence, marketing calendar, ads. None audited or
planned.

**Known open, not started:** consolidating the ten remaining `fetchAllPages`
copies; the mid-run title-split attribution problem (see
`docs/cover-ingestion-next-steps.md` §8, worked example Rai); roughly 800
unresolvable ingest targets needing manual `--volume-id` pinning; the
publisher-mismatch backlog.
