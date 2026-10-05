# Slop remediation plan

**Status:** spec written and approved (`docs/slop-remediation-spec.md`, PR #193); implementation in progress, see the spec's "Progress" section · **Written:** 2026-10-02 · **Source audit:** https://claude.ai/artifact/9JHox5YfrwTWkudikAvUnG (audited `origin/main` at `f546a55`)

This is the input for an agent that will write an implementation spec, have Codex audit it, and then implement it. Everything the spec needs from the audit is restated here, so the artifact link is a reference, not a dependency.

## Goal

Close the gaps the audit found and make the site measurably faster, without a rewrite. When this program is done:

1. No known security hole is open.
2. A user can't lose library data through any button in the UI.
3. Every page picks an issue's cover the same way, from one code path.
4. The schema, RLS and triggers are in the repo.
5. The slowest user-facing endpoints are measurably faster than the baseline taken in WS0.
6. Tests guard the invariants that have broken before.

## Out of scope for this program

Write a short design note (one page each, in `docs/design/`) for each of these. Don't build them yet. Each one touches the data model deeply enough that it deserves its own decision with Tony.

- Splitting wants and owned copies into separate tables (D1 long-term)
- Soft deletes and an order lifecycle independent of library rows (D6)
- A full variant and printing identity model (I3 long-term)
- Types generated from the schema, or a TypeScript migration
- Moving marketplace filtering into SQL

## Ground rules for the spec agent and the implementer

These come from things that have already gone wrong on this repo. Put them in the spec.

- **Use worktrees, not just branches.** Every workstream runs in its own worktree: `git branch agent/<topic> origin/main && git worktree add .worktrees/<topic> agent/<topic>`. A pre-commit hook blocks non-main commits from the primary checkout.
- **Base on `origin/main`.** The local `main` checkout is usually behind.
- **One workstream, one PR.** Keep PRs small enough to review. Turn on auto-merge so `pr-ci.yml` gates them.
- **A PR does nothing until it merges.** Say plainly in every handoff which PRs are open and unmerged.
- **Migrations ship as SQL that Tony runs in the Supabase SQL editor before the PR merges.** Paste the SQL inline in the PR description and in chat. Don't point to a file path. Code that depends on a migration can't merge before the migration is applied.
- **No destructive production deletes from an agent session.** They get blocked. Write the plan, the dry-run output and the SQL, and hand them to Tony.
- **Bulk database or storage jobs:** run one at a time, with concurrency of 4 or less, off-peak. Two at once took the site down for about 15 minutes on 2026-10-01.
- **Verification has to be able to fail.** A test or check counts only if it fails with the fix reverted. Small samples have passed falsely here twice; one of those shipped and took the pipeline down for 27 hours. State the revert check in each PR.
- **PostgREST caps reads at 1000 rows without telling you.** Any read that might pass 1000 rows uses the shared `fetchAllPages`. Throwaway probe scripts must check `error` too.
- **Keep docs in sync in the same PR.** If a PR changes behavior that CLAUDE.md, `docs/PROJECT_STATUS.md` or `docs/operations/OPERATIONS_HANDOFF.md` describes, update those in that PR.
- **No AI attribution.** No "Generated with Claude" line in PR bodies and no `Co-Authored-By` Claude trailer in commits.
- **Keep it solo-founder sized.** No review boards, RFC processes or multi-round ceremony. If Codex proposes process, drop it.

## Codex audit loop

Use the `senior-audit` skill (`~/.claude/skills/senior-audit`), which runs `codex exec review`.

**Spec stage**
1. Write the spec to `docs/slop-remediation-spec.md`.
2. Run `senior-audit spec docs/slop-remediation-spec.md`.
3. Triage each finding as accept, reject or defer, with one line of reasoning each. Record the triage in a "Codex review log" section at the bottom of the spec. Codex is a second opinion; judge each finding on its merits.
4. Revise and re-run. Stop when a round has no accepted Critical or High findings, or after 3 rounds, whichever comes first. If round 3 still has an accepted High, stop and bring it to Tony.
5. Open the spec as a docs-only PR and get Tony's go-ahead before implementing. This is the one approval gate.

**Implementation stage, per workstream PR**
1. Implement in the workstream's worktree.
2. Run `senior-audit` in diff mode against `origin/main`.
3. Fix accepted findings and re-run. Cap at 3 rounds per PR, with the same stop rule as above.
4. Put the triaged Codex findings in the PR description under "Codex review."
5. Merge only after CI passes and any required migration has been applied.

## Workstreams

Ordered by dependency. Severity labels and IDs (S1, D1, I1, ...) match the audit. File and line references are from `f546a55`; re-check them against current `origin/main`.

### WS0: Baseline and safety net (do first)

**Why:** You can't prove "faster" without a before number, and the most important security question can't be answered from the repo.

- **Schema baseline (S2).** Tony runs `supabase db dump --schema public` (or `pg_dump --schema-only`) and the agent commits it as `supabase/migrations/0000_baseline.sql`, with a note that 0002–0031 in `scripts/migrations/` came before it. Also capture RLS policies, triggers and functions. The dump should include them; check that it does. This needs Tony's database password, so the agent prepares the command and Tony runs it.
- **The `profiles` policy check.** Tony runs this and pastes the result back:
  ```sql
  select policyname, cmd, qual, with_check from pg_policies where tablename = 'profiles';
  select privilege_type, column_name from information_schema.column_privileges
   where table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE';
  ```
  If `authenticated` can UPDATE `is_pro`, `is_founding_collector` or `stripe_customer_id`, that becomes a Critical item in WS1. The fix is a column-level REVOKE, or a trigger that rejects changes to those columns unless `current_user = 'service_role'`.
- **Performance baseline script.** Add `scripts/perfBaseline.js`. It calls the main read endpoints N times against a base URL (production by default, or a preview URL) and prints p50 and p95 per endpoint. Cover at least: `/api/issues/[id]` for 3 issues (a modern one, a 1960s one, one with variants), `/api/series/[id]` for a long series (Amazing Spider-Man) and a short one, `/api/search/series` for 3 queries, `/api/library-hydrate` with a 500-ID payload, `/api/public-profile` for a real public user, and `/api/marketplace`. Commit the first run's output as `reports/perf-baseline-2026-10.md`.
- **Speed targets.** The spec proposes targets once the baseline exists. Starting proposal: no measured endpoint above 1.5s at p95, and search p95 under 800ms. Tony confirms or changes them.

**Done when:** the baseline file is merged, the `profiles` answer is recorded in the spec, and the perf numbers are committed.

### WS1: Security fixes (Phase 1, ship within days)

| ID | Severity | Change | Files |
|---|---|---|---|
| S1 | Critical | Escape JSON-LD: `JSON.stringify(x).replace(/</g, "\\u003c")`. Put it in a small helper in `src/lib/` and use it for every `application/ld+json` script. | `src/app/listing/[id]/page.js:63` and any other JSON-LD |
| S2b | Critical if WS0 says so | Stop owners from writing `is_pro`, `is_founding_collector` and `stripe_customer_id` on their own row. | migration |
| S3 | High | `/api/activity`: join `profiles`, exclude `is_public = false` and `show_collection = false`, and exclude wishlist rows when `show_wantlist = false`. Map every status explicitly (`owned` = added, `wishlist` = wishlisted, `for_sale` = listed). | `src/app/api/activity/route.js`, `src/components/ActivityFeed.js:61` |
| S4 | High | `POST /api/comics`: require `getAuthedUser` and take `created_by` from the token. Remove `created_by` from both client forms. | `src/app/api/comics/route.js`, `src/app/contribute/add-comic/page.js:141`, `src/app/library/add/page.js:39` |
| S5a | Medium | `library-hydrate`: reject over 2,000 IDs per request with a 413; the client already batches. | `src/app/api/library-hydrate/route.js` |
| S5b | Low | `catalog-link/search`: stop building the `.or()` string from raw input. Escape `,()%_` or use two queries, and drop the unindexed `title ILIKE` (see WS7). | `src/app/api/library/catalog-link/search/route.js:148` |
| S5c | Low | Delete `src/app/api/wishlist/route.js` and `src/app/api/collections/route.js` (no callers). | |
| S5d | Low | Revoke anon SELECT on `profiles.stripe_customer_id`. Import `ADMIN_ID` from `@/lib/admin` in the blog route. | migration, `src/app/api/blog/route.js:5` |

**Tests (in CI):** the JSON-LD helper escapes `</script>`; the activity mapper excludes private rows and labels `for_sale` correctly (factor the filter and mapping into a tested module); `/api/comics` returns 401 with no token.

**Done when:** all of the above have merged, and a manual check confirms a listing whose notes contain `</script><b>x</b>` renders as literal text.

### WS2: Library mutations are correct (Phase 1)

**D1 short-term fix.** `src/context/LibraryContext.js`:
- `removeFromCollection` takes a row `id` and deletes only that row. The issue and search pages pass the right row: the specific copy, or the wishlist row.
- When a user has several copies, "Remove from Collection" on the issue page asks which copy, or removes only the most recent one. The spec picks one; the most recent copy is fine.
- `addToCollection` handles 0, 1 and many existing rows. If there's already an owned row and the user adds to the wishlist, insert a separate wishlist row instead of flipping the owned row's status. That depends on there being no unique constraint on `(user_id, gcd_issue_id)`, which WS0's baseline will show. If there is one, stop and bring it to Tony.
- The optimistic update stops collapsing every copy of an issue into one row.
- Delete the stale Realtime comments (around lines 215–219).

**D2.** Mutations return `{ ok, error }`. The bulk "add all missing" in `SeriesClient.js` and `arc/[id]/page.js` counts real failures and shows them.

**D3.** Migration: `enforce_pro_for_grading` checks only when a grade or photo field `IS DISTINCT FROM OLD` (always on INSERT).

**Tests:** factor the decision logic (which rows to delete, insert or update for a given action and current rows) into a standalone module, `src/lib/libraryMutations.js`, and test it. At minimum: removing one of 3 copies leaves 2; removing a wishlist entry leaves owned copies alone; adding to the wishlist when you own the book leaves the owned row as it was; adding when 2 copies exist doesn't error. For D3, a SQL test script Tony can run, or a documented manual check with a lapsed test user.

**Done when:** all four mutation tests pass in CI and fail with the old logic.

### WS3: Consolidate shared helpers and stop ignoring errors (Phase 2, mechanical)

Do this before WS4 so the cover resolver is built on one set of helpers.

- **One module each, replacing the copies:**
  - `parseYear` and `bestYearFor`: about 19 and 11 copies.
  - `baseIssueNumber` and issue-number parsing: 6 copies. Its behavior changes in WS5.
  - `normTitle`, `normalizeKey` and their variants: 10+ copies.
  - Publisher normalization: about 14 copies across JS and Python. The Python ingester keeps its own copy, but add a shared fixture file that both the JS and Python tests run against, so they can't drift.
  - `fetchAllPages`: 19 copies. Use `src/lib/supabase/fetchAllPages.js` everywhere in `src/`. Scripts can use a `scripts/lib` re-export if `@/` doesn't resolve there.
- **Shared server Supabase client.** Add one `getServiceClient()` in `src/lib/supabase/` and use it in every API route, instead of each route calling `createClient` itself.
- **Burn down `supabase-query-ignores-error` in `src/`.** 50 sites, listed in `scripts/.error-handling-baseline.json`. On a read error, routes return a real 5xx (or degrade explicitly and log it), not an empty result. Lower the baseline in the same PR. Scripts can wait.
- Delete the library page's shadowing `normalizePublisherName` (`src/app/library/page.js:109`).
- Fix the `rules-of-hooks` lint error in `src/app/blog/create/page.js:62` and the stale "29 lint errors" comment in `pr-ci.yml`.

**Done when:** a grep finds one definition of each helper in `src/`, the ratchet's `src/` count is 0, and the error baseline file has been updated in the same PR.

### WS4: One cover resolver, and repairs that stick (Phase 2 to 3, the core fix)

This is the change that ends the cover-bleed cycle. Do it in two PRs.

**WS4a: one read path (no schema change).**
- Create `src/lib/catalog/covers.js` with `resolveCovers(supabase, issues)`. It takes `{ gcd_issue_id, series_gcd_id, issue_number, year, series_year_span }[]` and returns `Map<gcd_issue_id, { storage_path, source, confidence }>`.
- Lookup precedence, matching the best current behavior:
  1. `canonical_covers.gcd_issue_id = id`
  2. `series_gcd_id` plus the normalized issue number, within the series year span ±1
  3. Title plus issue number, only for covers with no `series_gcd_id`, within ±1 year
  4. Otherwise no cover. Never a wrong-cover fallback; that was killed sitewide by Tony's decision.
- Batch it. One call per page, not one per issue.
- Route every surface through it: the issues, series, library-hydrate, public-profile, activity, search/series, search/comics, story-arc, export/pdf, export/csv, export/wantlist and share-card routes, plus `heroWall`, `homeDispatch`, `featuredSeriesData` and the listing snapshot cover in `src/lib/marketplace.js`. List any surface left out and why.
- Move `src/lib/coverMatch.test.js`'s fixtures onto the new resolver, and add the regression cases: TMNT #2 1984 vs 2011, Nova (1994) #4 vs 2013, Robin (1993) #1, an X-O Manowar volume, and an issue only reachable through tier 3. The repair scripts can keep using `coverMatch.js`, or move to the resolver if that's easy.
- **Parity check before merging.** A script runs the old and new resolvers over a sample and reports every issue whose cover changed. Use a stratified sample of at least 5,000 issues across many series, including long runs and same-titled volumes. A 50-row sample can't exercise the multi-volume cases. Tony reviews the diff list before merge.

**WS4b: store the resolved cover, protect repairs.**
- Migration: `canonical_covers` gets `link_locked boolean not null default false`, and a `link_source` column (`ingest`, `repair_script` or `manual`).
- Ingester: `upsert_cover_row` must not overwrite `series_gcd_id`, `gcd_issue_id` or `match_confidence` on a row where `link_locked` is true. The cleanest way is a `BEFORE UPDATE` trigger that keeps the old link columns when the row is locked, so all 12 writers obey it. Repair scripts set `link_locked = true` and `link_source = 'repair_script'` when they relink.
- Optional, if the WS0 baseline shows cover resolution is a large share of issue and series page time: add `issue_primary_cover(gcd_issue_id primary key, canonical_cover_id, storage_path, resolved_at)`, filled by a nightly job that runs `resolveCovers` over issues with any cover. Pages then read one indexed row. Decide this in the spec from the measurements; it isn't required.

**Tests:** the resolver fixture suite in CI; a test that the lock trigger keeps a locked link when the ingester re-upserts the row (SQL that Tony can run, or a local Supabase run).

**Done when:** a grep finds no `from("canonical_covers")` in `src/app` outside the resolver module; the parity diff has been reviewed; and re-running the ingester over a locked volume leaves its links unchanged.

### WS5: Issue numbers and publishers (Phase 2, the light version of I3/I4)

- Replace `baseIssueNumber` with `parseIssueNumber(s)`, which returns `{ base, suffix, isAnnual, isHalf, raw }`.
  - `1/2` and `½` become base `0.5` with the half flag; they no longer collapse to `1`.
  - `Annual 1` gets the annual flag, so it no longer becomes null.
  - `-1` is kept.
  - `1A` and `1.MU` keep their suffix.
  - The cover key and issue counting use `base + isAnnual + isHalf`, so `1 [Newsstand]` still collapses to `1`.
- **Measure before switching.** Report how many series' `issue_count_cached` values would change. Re-run `refreshSeriesSearchCache.js` with `--only-ids-file` on the affected series, not a full run.
- Publisher: one `normalizePublisher` and one alias table (from WS3), used by search, the library sidebar, CSV import and `/api/comics`.

**Tests:** a table-driven test of `parseIssueNumber` covering every case above.

### WS6: CSV round trip and local comics (Phase 3)

- **D4. Export adds** `gcd_issue_id`, `comic_id`, `variant_label` and `copy_number`. **Import:**
  - Prefers `gcd_issue_id` when it's present.
  - Writes condition, grade, slab, cert, notes, purchase price and market value. These are Pro fields; the import must run as Pro or service role, and respect the D3 trigger.
  - Adds extra copies instead of skipping them.
  - Upgrades a matching wishlist row to owned when the CSV row is owned.
- **D5.** One `createLocalComic()` used by both `/api/comics` and CSV import: dedupe on `title_normalized`, publisher from the shared normalizer, and `comics.publisher` set every time.
- Backfill `comics.publisher` from `series.resolved_publisher_cached` where it's null. That's 150 rows; Tony runs the SQL.

**Tests:** export, then import into an empty test account, then export again gives identical files (excluding timestamps). Run it as a test over the factored mapping functions.

### WS7: Speed (Phase 3, measured against WS0)

Each item has to show a before and after from `scripts/perfBaseline.js`. Drop any item that doesn't move the number.

- **Search.** Make sure every search path filters on `title_normalized` (which has a trigram index). Remove the unindexed `title ILIKE '%q%'` branches. Run `EXPLAIN ANALYZE` on `search_series_by_relevance` and the catalog-link query with a 2- or 3-character term and a common term; Tony runs these in the SQL editor. Add any missing indexes the plans call for.
- **Issue and series routes.** Count the queries per request. The 968-line issues route makes many sequential round trips. Parallelize the independent ones with `Promise.all`, and let the WS4 resolver replace the per-tier cover queries.
- **Library.** The full refetch on every tab focus becomes a throttled refetch (at most once every 60s), or an incremental fetch of rows where `updated_at` is newer than the last fetch, if that column exists. The hydrate cache keys on `(user, issue IDs)`, not on the whole library.
- **Caching.** Check which read routes return CDN cache headers (`src/lib/cdnCache.js`). Catalog-only reads (issue, series, search) should; anything user-specific must not.
- **Marketplace.** `refreshListingSnapshots` currently runs before every uncached read. Move it to the sync endpoint and a scheduled job.

**Done when:** a new perf report is committed next to the baseline and the targets confirmed in WS0 are met, or each miss has an explanation.

### WS8: Pipeline state out of git (Phase 3, optional, Tony decides)

883 of the 1,261 commits since August are bots writing `.ingest-done.json`, the `gap-*.json` files, `needs_volume_id.json` and the cursor files. Move that state into a Supabase table (`pipeline_state(key text primary key, value jsonb, updated_at)`) or into Actions artifacts. Remove `__pycache__/` from the repo and add it to `.gitignore`. This touches every cron workflow, so it's one careful PR, and the ingest health check has to pass for 48 hours afterward.

### WS9: Docs that a new engineer can use (runs throughout, lands last)

- `docs/ARCHITECTURE.md`, one page: how the browser, API routes, Supabase, the ingester, repair scripts and the marketplace trigger fit together, using the "how it should work" picture once WS4 has landed.
- Trim CLAUDE.md to current contracts. Move incident narratives to `docs/history/`. Fix the contradictions the audit found: the eBay Browse text, and the `market_comps` and variant schema notes.
- Delete comments that narrate removed behavior (e.g. LibraryContext's Realtime comments, `library/page.js:1022`'s "impossible").
- Update `docs/README.md`'s index. `npm run docs:check` passes.

## Suggested order and parallelism

```
WS0 ──┬─> WS1 (security) ─────────────────────────────┐
      ├─> WS2 (library mutations) ─────────────────────┤
      └─> WS3 (helpers, errors) ─> WS4a ─> WS4b ─> WS7 ┼─> WS9
                                └─> WS5 ─> WS6 ────────┘
WS8 any time after WS0, if approved.
```

WS1 and WS2 can run in parallel worktrees. WS3 touches many route files, so don't run it at the same time as WS1 or WS2 edits to the same routes; land WS1 first. WS4a depends on WS3.

## Definition of done for the program

- [ ] All WS1 items merged; S1 verified manually on production.
- [ ] Schema baseline in `supabase/migrations/`; the `profiles` question answered and fixed if needed.
- [ ] Library mutation tests in CI and green.
- [ ] One cover resolver; no other `canonical_covers` reads in `src/app`; locked links survive re-ingest.
- [ ] `src/` count of `supabase-query-ignores-error` is 0.
- [ ] The CSV round-trip test passes.
- [ ] The perf report shows the targets met, or explains each miss.
- [ ] ARCHITECTURE.md exists; CLAUDE.md matches the code.
- [ ] Design notes written for the 5 out-of-scope items.
- [ ] Every PR had a Codex review, with its triage recorded.

## What the spec must add

The spec agent turns each workstream into:
- exact files and functions, re-verified on current `origin/main`
- the migration SQL, written out in full
- test names and what each asserts, including how to show the test fails without the fix
- the PR breakdown, aiming for PRs under about 600 changed lines except mechanical ones like WS3
- the rollback plan for each migration
- the items that need Tony (SQL to run, approvals), gathered in one list at the top so he can batch them

---

## Launch prompt (paste into the spec agent)

```
You're writing an implementation spec for ComixCatalog, then running it through Codex review, then implementing it.

Repo: C:\Users\antho\Desktop\comixcatalog-frontend\comixcatalog-frontend (the git repo is this nested folder). The local main checkout is usually behind; base everything on origin/main.

1. Set up your own worktree first:
   git fetch origin
   git branch agent/slop-remediation-spec origin/main
   git worktree add .worktrees/slop-remediation-spec agent/slop-remediation-spec
   Work only inside .worktrees/slop-remediation-spec.

2. Copy the plan into your worktree: copy C:\Users\antho\Desktop\comixcatalog-frontend\comixcatalog-frontend\docs\slop-remediation-plan.md to docs/slop-remediation-plan.md in your worktree. Read it fully, and follow its "Ground rules" and "Codex audit loop" sections exactly. Also read CLAUDE.md and docs/operations/OPERATIONS_HANDOFF.md.

3. Write docs/slop-remediation-spec.md covering every workstream, per the plan's "What the spec must add" section. Re-check every file and line reference against your worktree; the plan's references are from f546a55.

4. Run the senior-audit skill in spec mode on the spec. Triage, revise, and repeat up to 3 rounds, logging every finding and decision in the spec's "Codex review log."

5. Commit the plan and the spec, push, and open a docs-only PR. Put everything Tony needs to do (SQL to run, decisions) at the top of the PR description, with SQL pasted inline. Then stop and wait for Tony's go-ahead before writing any implementation code.

6. Once Tony approves, implement one workstream per PR in its own worktree, in the plan's order. Run senior-audit diff mode before each merge. After each PR, tell Tony which PRs are merged and which are still open.

No AI attribution lines in commits or PRs. Keep process light; this is a solo-founder project.
```
