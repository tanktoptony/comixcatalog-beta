# Slop remediation spec

**Status:** In progress, updated 2026-10-05 evening. WS0 through WS3 done. WS4 (cover resolver) next. See "Progress" below · **Written:** 2026-10-04 · **Input:** `docs/slop-remediation-plan.md` · **Verified against:** `origin/main` at `5b9647f` (the plan's references were from `f546a55`)

This turns the plan into files, functions, SQL, tests and PRs. The plan's goal, out-of-scope list and ground rules still apply as written. This file only adds detail and records where the plan was wrong or out of date.

---

## Tony's list (batch these)

Everything that needs you, in the order it blocks work. Items 2 and 3 are done (results below); item 1, the schema dump, is deferred.

**Before WS0 can finish**

1. **Run the schema dump** from a terminal in the repo (needs the DB password from Supabase → Project Settings → Database):
   ```
   npx supabase db dump --db-url "postgresql://postgres.[project-ref]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres" --schema public -f docs/schema/baseline-2026-10.sql
   ```
   If the CLI gives you trouble, `pg_dump --schema-only --schema=public --no-owner` against the same URL works too. Commit nothing; tell the agent the file is there.
2. **Run these read-only queries** in the SQL editor and paste the output back:
   ```sql
   -- Q1: can a signed-in user write their own billing flags?
   select policyname, cmd, roles, qual, with_check
     from pg_policies where tablename = 'profiles';
   select grantee, privilege_type, column_name
     from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and grantee in ('anon', 'authenticated')
      and column_name in ('is_pro', 'is_founding_collector', 'stripe_customer_id')
    order by 1, 2, 3;

   -- Q2: constraints on user_collections (decides WS2's design)
   select conname, pg_get_constraintdef(oid)
     from pg_constraint
    where conrelid = 'public.user_collections'::regclass;
   select indexname, indexdef from pg_indexes
    where schemaname = 'public' and tablename = 'user_collections';

   -- Q3: how many users already have the shapes WS2 has to handle
   select count(*) filter (where n > 1) as issues_with_multiple_rows,
          count(*) filter (where n > 1 and has_wish and has_owned) as owned_and_wished
     from (select user_id, gcd_issue_id, count(*) n,
                  bool_or(status = 'wishlist') has_wish,
                  bool_or(status in ('owned','for_sale')) has_owned
             from public.user_collections
            where gcd_issue_id is not null
            group by 1, 2) t;
   -- Q3b: duplicate wishlist rows that would block WS2's unique index
   select user_id, gcd_issue_id, count(*)
     from public.user_collections
    where status = 'wishlist' and gcd_issue_id is not null
    group by 1, 2 having count(*) > 1;

   -- Q4: copy columns exist (WS2 and WS6 rely on them)
   select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'user_collections'
      and column_name in ('copy_number', 'variant_label');

   -- Q5: WS6 backfill size
   select count(*) from public.comics where publisher is null;
   ```
3. **Decisions** (one word each is fine):
   - **D-a. Auto-merge.** The plan says turn it on; `docs/operations/OPERATIONS_HANDOFF.md` §5 says never. This spec assumes **no auto-merge**: the agent opens the PR, CI runs, you merge. Say so if you want the other way.
   - **D-b. Remove with several copies.** On the issue page, "Remove from Collection" when you own 3 copies removes **the most recently added copy only** and the button label says "Remove 1 copy (3 owned)". The library page already removes a specific row. OK?
   - **D-c. Speed targets.** Proposed: every measured endpoint p95 ≤ 1.5 s, search p95 ≤ 800 ms. Confirm once the baseline is in, or change.
   - **D-d. WS8** (pipeline state out of git): go or skip for now. This spec writes it up but nobody builds it without a yes.
   - **D-e. `issue_primary_cover` table** (optional part of WS4b): the spec decides from WS0's numbers. Default is **don't build it**.

**Later, per PR** (each one is also at the top of its PR):

| When | What |
|---|---|
| ~~Before WS1b merges~~ | ~~Run migration 0032 (profiles billing columns)~~ Done 2026-10-05 |
| ~~Before WS2a merges~~ | ~~Run migration 0036 (one wishlist row per issue)~~ Done 2026-10-05 |
| ~~Before WS2b merges~~ | ~~Run migration 0034 (grading trigger fix)~~ Done 2026-10-05 |
| Before WS4b merges | Run migration 0035 (cover link lock) |
| WS4a review | Read the parity diff list and say go |
| WS5 | Approve the `issue_count_cached` change list before the targeted refresh runs |
| WS6 | Run the `comics.publisher` backfill |
| WS7 | Run the `EXPLAIN ANALYZE` queries and paste plans back |

---

## WS0 results and decisions (2026-10-05)

**Query results** (Tony ran the combined read-only query; full output in PR #197's description):
- **Q1, Critical, confirmed.** `profiles` has `Users can update own profile` (`auth.uid() = id`, no column limit) and `Users can insert own profile`, and both `anon` and `authenticated` hold INSERT/UPDATE/SELECT on `is_pro`, `is_founding_collector` and `stripe_customer_id`. Any signed-in user could set their own `is_pro`. `Public profiles are viewable` exposes `stripe_customer_id` on every public profile. All 30 `is_pro` rows were checked: all comped, none with a Stripe id, so no sign of abuse. Fixed by 0032a/0032b in PR #197, ahead of the rest of WS1.
- **Q2: one row per GCD issue is enforced.** `user_collections_user_gcd_issue_unique` is a partial unique index on `(user_id, gcd_issue_id) WHERE gcd_issue_id IS NOT NULL`. `(user_id, comic_id)` is unique twice over (`unique_user_comic` and `user_collections_user_id_comic_id_key`, identical). `user_collections_one_target_check` enforces the comic-or-GCD rule. So `addAnotherCopy` has always failed with 23505 (logged, not shown), and nobody has multiple copies.
- **Q3:** 0 issues with multiple rows, 0 duplicate wishlist pairs.
- **Q4:** `copy_number` and `variant_label` exist.
- **Q5:** 150 `comics` rows with null publisher (matches the plan).
- **Schema dump: deferred.** Tony signs in to Supabase with GitHub/Google and has no database password handy; nothing blocking needs the dump. A baseline will be built from SQL-editor catalog queries later in WS0 instead.
- **Spec correction:** `src/context/AuthContext.js` read `profiles` with `select("*")` from the browser, so 0032b (hide `stripe_customer_id`) must run after that change deploys. The spec's earlier "no browser code selects *" claim was wrong.

**Decisions**
- D-a: **no auto-merge.** Claude asks, Tony merges.
- **Multiple copies: build it now** (Tony, 2026-10-05). WS2 changes accordingly: a migration drops `user_collections_user_gcd_issue_unique` and adds 0036's one-wishlist-per-issue index plus an equivalent partial unique index so a user can't have two *wishlist* rows; owned/for_sale copies become unlimited. Remove-from-issue-page behavior (D-b) still defaults to "newest copy". The WS2 PR rewrites that section before implementation; the duplicate `(user_id, comic_id)` index is dropped in the same migration.
- D-c: targets confirmed: p95 ≤ 1.5 s per endpoint, search ≤ 0.8 s.
- D-d: **WS8 not now.**

**Speed baseline (2026-10-05):** `reports/perf-baseline-2026-10.md`, two warm 20-run passes against production. Meets target: issue, series, library load, marketplace, and the "batman" and "sandman" searches. Misses: **public profile** (p50 ~1.6s, p95 ~2.1s) and **short search queries** ("x-o" p95 1.2–2.8s against 0.8s). WS7 starts with those two and drops items that don't move a number. Cold starts aren't counted (a cold pass was 2–18s); `--cold` measures them.

## Progress (updated 2026-10-05, evening)

Every merged item below was checked after deploy where it could be: SQL steps confirmed by a query Tony ran, live behaviour by smoke tests or a manual check.

| Workstream | Item | PR | State |
|---|---|---|---|
| WS0 | Decisions + Q1–Q5 | #197, this spec | **Done** |
| WS0 | Speed baseline (`npm run perf:baseline`) | #203 | **Merged.** Misses: public profile, short search queries |
| WS0 | Schema dump | none | Deferred (no DB password handy) |
| WS1 | S1 JSON-LD escaping | #202 | **Merged**, as `safeJsonLd()` |
| WS1 | S2b profiles billing lock (0032a/0032b) | #197 | **Merged**, SQL verified (`true \| true`), anon read of Stripe id blocked |
| WS1 | S3 activity privacy, S4 comic-add auth, S5a hydrate cap + client batching, S5b catalog-link filter, S5d ADMIN_ID | #206 | **Merged**, three live smoke tests passed after deploy |
| WS1 | S5c dead routes, lint/comment fixes | #192 (Codex) | **Merged** |
| WS2 | D1 multiple copies per issue, D2 real bulk-add failures, D3 grading trigger fix (0034 + 0036) | #209 | **Merged**, SQL verified (`true × 3`), Tony confirmed live |
| Other | Header avatar no longer flashes the CC badge | #201 | **Merged** |
| WS3 | PR 3a: one copy of each helper (32 copies removed); slow `gcd_issues` ordering fixed (~3s → ~0.2s per page); CSV export no longer truncates at 1,000 | #212 | **Merged** |
| WS3 | PR 3b: one shared service-role client (40 files) | #215 | **Merged** |
| WS3 | PR 3c: database errors stop reading as "no data" (46 sites in `src/`: 502 when the page can't be right, `degraded: true` + no CDN cache when the data is extra); public profiles past 1,000 books stop truncating; search survives a failed grouping lookup | #219 | **Merged**, Codex reviewed (3 rounds); live check after deploy: series, issue and search pages respond normally. Error ratchet 101 → 55, zero left in `src/` |
| WS3 follow-up | Broad searches ("batman") never grouped volumes: the volume lookup sent up to 1,000 UUIDs in one URL and the API rejected it (works ≤300, fails ≥500). The error was silent until #219 flagged it as `degraded`. Now chunked at 200 | this PR | Open |
| WS7 | Public profile speed | #196 | Partial: library load 11.3s → 1.7s for a 214-book collection. Profile p95 still over target |
| WS4–WS6, WS9 | | none | Not started. WS8 skipped (D-d) |

**Audit scorecard** (21 findings in the 2026-10-02 audit): 8 fixed, 4 partly fixed, 9 not started (D6 and P5 deferred on purpose). Every security finding is closed. The cover findings (I1, I2) and variant parsing (I3) are untouched and are what WS4–WS5 fix.

**How the work is split now:** Codex CLI writes the implementation from a written prompt; Claude scopes it, reviews the diff, fixes what it finds, commits, runs the Codex review and opens the PR. Tony merges every PR.

**Outside this program:** eBay Marketplace Insights (sold prices) was requested through eBay's Application Growth Check on 2026-10-05, ref 261005-000064. When it's granted, set the `EBAY_API` repo variable to `insights`; no code change needed.

**Migration numbers moved.** `0033` was taken on 2026-10-05 by `0033_market_comps_per_issue_unique.sql` (PR #199, eBay comps keyed per issue). This program's migrations are numbered: grading trigger fix **0034**, multiple copies + one-wishlist-per-issue **0036** (both applied 2026-10-05; the files were first committed as 0033 and 0035 in #209 and renamed here), cover link lock **0035** (WS4b, not written yet). Two other files share **0037** (`0037_after_publisher_sync_backfill.sql`, `0037_gcd_publishers_country_us_market.sql`, from another session); left alone here. The next free number is **0039**. Check `scripts/migrations/` before writing any migration.

## What changed since the plan was written

Checked on `5b9647f`. Corrections the implementer should trust over the plan:

- **PR #192 (Codex, merged 2026-10-03) already did:** deleted `src/app/api/wishlist/route.js` and `src/app/api/collections/route.js` (S5c), fixed the `rules-of-hooks` error in `src/app/blog/create/page.js` and the stale lint comment in `pr-ci.yml` (WS3), deleted `__pycache__/` and confirmed it's in `.gitignore` (WS8), and rewrote the stale Realtime comment in `LibraryContext.js` and the "impossible" comment at `src/app/library/page.js:1022` (WS9). Those items are dropped below.
- **The grading trigger's service-role bypass has never worked.** `enforce_pro_for_grading()` (`scripts/migrations/0008_pro_grading_trigger.sql`) is `SECURITY DEFINER`. Inside a security-definer function `current_user` is the function's owner, not the caller, so `current_user = 'service_role'` is always false. Service-role writes that set a grade for a non-Pro user (CSV import for a lapsed account, admin tools) fail today. The plan's S2b proposal used the same check. This spec uses `auth.role()`, which reads the request's JWT role claim and is correct in both kinds of function.
- **`addToCollection` errors outright with 2+ rows.** It looks up the existing row with `.maybeSingle()` (`src/context/LibraryContext.js:248-253`), which returns an error when more than one row matches. A user who used "Add another copy" can never change that issue's status again, and the error is only logged. This is part of D1.
- **Local comics probably have a unique constraint.** The local-comic branch upserts with `onConflict: "user_id,comic_id"` (`LibraryContext.js:286`), which only works if a unique constraint on `(user_id, comic_id)` exists. If Q2 confirms it, local comics can't hold an owned row and a wishlist row at once, and WS2 treats them as one row per comic (see WS2).
- **`supabase-query-ignores-error` in `src/` is 55, not 50** (`scripts/.error-handling-baseline.json`, updated 2026-09-24).
- **CSV and wantlist export don't read covers.** Drop them from WS4's surface list. The CSV export does have an unpaginated `gcd_issues .in("gcd_id", …)` (`src/app/api/export/csv/route.js` ~line 114) that truncates past 1,000 GCD-linked books; it moves to `fetchAllPages` in WS3.
- **The schema dump goes in `docs/schema/`, not `supabase/migrations/0000_baseline.sql`** as the plan said (Codex round 3: the CLI would treat it as a migration).
- **The library client does not batch hydrate requests**, contrary to the plan's S5a note. See WS1.
- **`refreshListingSnapshots` already runs from `POST /api/listings/sync`** and from `getListings()` (`src/lib/marketplace.js:133`) on every uncached read. WS7 removes only the second call.
- **The tab-focus refetch already exists** (`LibraryContext.js:177-185`), replacing Realtime on 2026-10-01. WS7 throttles it.
- **12 cover writers** remain outside the ingester; see WS4b. Three of them use `createCoverMatcher` from `src/lib/coverMatch.js`.

---

## Ground rules (copied from the plan, with one change)

- Every workstream runs in its own worktree: `git fetch origin && git branch agent/<topic> origin/main && git worktree add .worktrees/<topic> agent/<topic>`, then copy `.env.local` in and `npm ci`.
- Base on `origin/main`, never local `main`.
- One workstream, one PR, under ~600 changed lines except mechanical PRs (WS3).
- **No auto-merge** (pending D-a). CI must pass, then Tony merges.
- A PR does nothing until it merges. Every handoff lists open and merged PRs.
- Migrations are SQL Tony runs in the Supabase SQL editor **before** the PR merges, pasted inline in the PR body and in chat. Each file also lands in `scripts/migrations/` for the record.
- No destructive production deletes from an agent session. Write the plan, dry-run output and SQL; Tony runs it.
- Bulk DB or storage jobs: one at a time, concurrency ≤ 4, off-peak (after 04:00 UTC, not at `:00` when the hourly ingest fires).
- **Every test must fail with the fix reverted.** Each PR states its revert check: "reverted X, ran `npm run test:Y`, saw N failures."
- Any read that can exceed 1,000 rows uses `fetchAllPages` with a unique sort column. Probe scripts check `error`.
- Docs that describe changed behavior (CLAUDE.md, `docs/PROJECT_STATUS.md`, `OPERATIONS_HANDOFF.md`) change in the same PR.
- No AI attribution in commits or PR bodies.
- No ceremony. Codex findings that propose process get dropped.
- New tests are added as `npm run test:<name>` and to `pr-ci.yml` in the same PR, or they don't count.

---

## WS0: Baseline and safety net

**PR 0 · `agent/ws0-baseline` · ~350 lines + the dump**

**Files**
- `docs/schema/baseline-2026-10.sql`: Tony's dump, committed as-is. **Not** under `supabase/migrations/`: the Supabase CLI treats every file there as a migration, and a future `db push` or local reset would try to apply the whole schema. Header comment added by the agent: "Schema dump of production taken 2026-10-xx. `scripts/migrations/0002`–`0031` predate it and are reflected here. New migrations go in `scripts/migrations/` as before; this file is a reference snapshot, never applied." **Check before committing:** `grep -c "CREATE POLICY"` and `grep -c "CREATE TRIGGER"` are > 0, `grep -cE "CREATE (OR REPLACE )?FUNCTION"` is > 0 (plain `pg_dump` writes `CREATE FUNCTION`), and `enforce_pro_for_grading`, `user_collections_sync_listing` and the `listings` policies each appear by name. If any is missing the dump flags were wrong; redo it.
- `scripts/perfBaseline.js`: new.
- `reports/perf-baseline-2026-10.md`: first run's output.
- `package.json`: `"perf:baseline": "node scripts/perfBaseline.js"`.
- This spec: a "WS0 results" section recording Q1–Q5 answers.

**`scripts/perfBaseline.js`**
- Args: `--base=https://comixcatalog.com` (default), `--runs=20`, `--out=<path>`, `--warm` (one discarded request per endpoint first).
- Endpoint list lives in a `CASES` array at the top so later runs are identical. Fixed IDs chosen once, at write time, by querying production and hard-coded with a comment saying what each is:
  - `/api/issues/gcd-<id>`: a 2020s issue, a 1960s issue, an issue with `cover_variants` rows
  - `/api/series/<uuid>`: Amazing Spider-Man (1963), a series with < 20 issues
  - `/api/search/series?q=`: `batman`, `x-o`, `sandman`
  - `/api/library-hydrate` POST with 500 real `gcd_issue_ids` (from a public library, IDs hard-coded)
  - `/api/public-profile?username=<a real public user>`
  - `/api/marketplace`
- Sends `Cache-Control: no-cache` and a cache-busting `?_pb=<run>` query param so the CDN isn't measured, and records `x-vercel-cache` per response so a cached hit is visible in the output.
- Runs requests **sequentially** (never parallel; this is production).
- Prints a markdown table: endpoint, label, n, p50, p95, max, error count, cache-hit count. Non-2xx counts as an error and is shown, not dropped.
- **Revert check:** none needed (it's an instrument), but the PR shows two back-to-back runs to prove the numbers are stable within ~20%. If they aren't, raise `--runs` until they are and say what N was needed.

**Done when:** the dump is merged and passes the grep check, Q1–Q5 are recorded in this spec, the perf report is committed, and Tony has answered D-c.

---

## WS1: Security fixes

Two PRs so the code half isn't blocked on a migration.

### PR 1a · `agent/ws1-security-code` · ~350 lines

**S1 (Critical): JSON-LD escaping**: DONE in PR #202 as `safeJsonLd()`. Skip this item; the description below is kept for the record.
- New `src/lib/jsonLd.js`:
  ```js
  // Serialize for <script type="application/ld+json">. JSON.stringify leaves
  // "</script>" intact, so user text (listing notes) could close the tag.
  export function jsonLdString(value) {
    return JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/ /g, "\\u2028")
      .replace(/ /g, "\\u2029");
  }
  ```
- `src/app/listing/[id]/page.js:63`: `__html: jsonLdString(jsonLd)`. This is the only `ld+json` in `src/` today (grep). Add a CI grep so a new one can't skip the helper: a step in `pr-ci.yml` that fails if `grep -rn 'ld+json' src | grep -v jsonLdString` finds anything.
- Test `src/lib/jsonLd.test.js` (`npm run test:json-ld`):
  - `jsonLdString({ n: "</script><b>x</b>" })` contains no `<` or `>`, and `JSON.parse` of the output round-trips to the original object.
  - U+2028 is escaped.
  - Revert check: swap the helper body for `JSON.stringify(value)` and the first case fails.
- Manual check after deploy: a test listing with notes `</script><b>x</b>` renders literal text and the page source shows `</script`.

**S3 (High): activity feed leaks private libraries**
- New `src/lib/activityFeed.js`, pure:
  - `ACTIVITY_VERB = { owned: "added", wishlist: "wishlisted", for_sale: "listed" }`. Unknown status → row dropped.
  - `filterVisibleActivity(rows, profilesById)`: drop rows whose profile is missing, has no `username`, `is_public === false`, or `show_collection === false`; drop `wishlist` rows when `show_wantlist === false`; drop `for_sale` rows when `show_for_sale === false`. (Those three `show_*` columns are the ones the marketplace view already reads; WS0's dump confirms their names. If any is missing, treat it as `true`, matching `marketplace_listings`.)
- `src/app/api/activity/route.js`:
  - Fetch `profiles` with `id, username, is_public, show_collection, show_wantlist, show_for_sale`.
  - Because filtering can drop rows, read the latest **100** `user_collections` rows (not 20), filter, then take 20. This keeps the feed full without a SQL join (`user_collections.user_id` references `auth.users`, not `profiles`, so PostgREST can't embed it).
  - Add `verb` to each row from `ACTIVITY_VERB`.
  - Return 5xx on any lookup error instead of logging and continuing.
- `src/components/ActivityFeed.js:61`: use `a.verb` instead of the owned/else ternary.
- Test `src/lib/activityFeed.test.js` (`npm run test:activity-feed`): private profile dropped; `show_collection=false` dropped; wishlist row dropped when `show_wantlist=false` but that user's owned row kept; `for_sale` maps to "listed"; profile with no username dropped. Revert check: make `filterVisibleActivity` return its input and 4 cases fail.

**S4 (High): `POST /api/comics` trusts `created_by`**
- `src/app/api/comics/route.js` `POST`: first line `const user = await getAuthedUser(req); if (!user) return 401`. `created_by = user.id`. Remove `created_by` from both shapes in `readSubmission` (lines ~113, ~123).
- `src/app/contribute/add-comic/page.js:141` and `src/app/library/add/page.js:39`: delete the `created_by` append and switch `fetch("/api/comics", …)` to `authedFetch` from `@/lib/apiClient`.
- Test: `tests/comicsAuth.test.js` (`npm run test:comics-auth`) imports the route's `POST` and calls it with a `Request` that has no `Authorization` header; asserts 401 and that no Supabase call was made (the test stubs `createClient` via a module-level injectable, or more simply asserts the 401 comes before `readSubmission`). Revert check: remove the guard, test fails. If importing the route in plain `node --test` is blocked by the `@/` alias, factor the guard into `src/lib/requireUser.js` (`requireUser(req) → { user } | { response }`) and test that instead, using it in the route.

**S5a (Medium): hydrate size cap**
- **The plan's premise is wrong: the client does not batch.** `src/app/library/page.js:786` sends every missing key in one request, so a cap alone would break first load for any library over the limit. Same PR:
  - `src/app/library/page.js` (~770–800): split `missingKeys` into chunks of 1,000 and fetch them **sequentially** (not in parallel; each request is heavy), merging results as they arrive so the page fills progressively.
  - `src/app/api/library-hydrate/route.js` after parsing (~line 67): if `comicIds.length + gcdIds.length > 2000` return 413 `{ error: "Too many ids; send at most 2000 per request" }`. The cap is 2× the client chunk so a future client change has headroom.
  - Check other callers first (`grep -rn "library-hydrate" src`); on `5b9647f` the library page is the only one. `src/lib/marketplace.js`'s snapshot refresh reuses hydrate logic: confirm whether it calls the route over HTTP and with how many ids.
  - Test: the chunking helper (`chunk(arr, n)`, in `src/lib/` if one doesn't exist) is covered; manual check on a preview with a test library of > 1,000 GCD rows (seeded by a script, deleted after) shows every cover and value.

**S5b (Low): catalog-link search builds `.or()` from raw input**
- `src/app/api/library/catalog-link/search/route.js:148`: replace `.or(\`title.ilike.%${q}%,title_normalized.ilike.%${qNorm}%\`)` with `.ilike("title_normalized", \`%${escapeLike(qNorm)}%\`)`, where `escapeLike` escapes `\`, `%` and `_`. `qNorm` is already normalized, so commas and parentheses don't survive normalization; add an assertion test anyway. This also drops the unindexed `title ILIKE` (WS7's search item).
- Put `escapeLike` in `src/lib/searchQuery.js` (already tested by `test:search-query`) and add cases: `%`, `_`, `a,b)` → no PostgREST filter syntax survives.

**S5d (Low, code half):** `src/app/api/blog/route.js:5` → `import { ADMIN_ID } from "@/lib/admin";`.

### PR 1b · `agent/ws1-security-sql` · migration + ~40 lines

**S2b + S5d: migration `scripts/migrations/0032_profiles_billing_columns.sql`**

Severity is **Critical if Q1 shows `authenticated` has UPDATE on those columns, or an UPDATE policy without a column restriction** (Supabase's default grants table-wide UPDATE, so this is the likely result). The trigger below is safe to apply either way.

```sql
-- 0032_profiles_billing_columns.sql
-- Owners must not be able to grant themselves Pro or change their Stripe id.
-- A trigger rather than column REVOKEs: Supabase grants table-level UPDATE to
-- authenticated, and a column REVOKE does nothing while a table grant exists.
-- SECURITY INVOKER on purpose: current_user is then the real caller.

begin;

create or replace function public.protect_profile_billing_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Server writes: the service role (Stripe webhook, admin toggle) and the
  -- postgres owner (SQL editor, the new-user trigger on auth.users).
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.is_pro, false)
       or coalesce(new.is_founding_collector, false)
       or new.stripe_customer_id is not null then
      raise exception 'billing columns are server-managed' using errcode = '42501';
    end if;
  elsif new.is_pro is distinct from old.is_pro
     or new.is_founding_collector is distinct from old.is_founding_collector
     or new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception 'billing columns are server-managed' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_billing_columns_trg on public.profiles;
create trigger protect_profile_billing_columns_trg
  before insert or update on public.profiles
  for each row execute function public.protect_profile_billing_columns();

-- S5d: nobody but the server reads stripe_customer_id. The admin page gets
-- it through /api/admin/toggle-pro (service role), so clients don't need it.
-- Column REVOKE needs the table-level SELECT replaced by a column list.
-- <COLUMN LIST> is every profiles column except stripe_customer_id, filled
-- in from docs/schema/baseline-2026-10.sql when this PR is written. Do not guess it.
revoke select on public.profiles from anon, authenticated;
grant select (<COLUMN LIST>) on public.profiles to anon, authenticated;

commit;
```

- Before writing `<COLUMN LIST>`: grep `src/` for every `from("profiles").select(` and confirm none of them is `select("*")` or names `stripe_customer_id` from a browser client. Today none do (checked on `5b9647f`). A `select("*")` from a browser would start failing with 42501 after this, so the PR re-runs that grep.
- **Rollback:**
  ```sql
  drop trigger if exists protect_profile_billing_columns_trg on public.profiles;
  drop function if exists public.protect_profile_billing_columns();
  grant select on public.profiles to anon, authenticated;
  ```
- **Verification Tony runs after applying** (in the SQL editor, impersonating a user; these must fail with 42501, and a username change must succeed):
  ```sql
  begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '<a test user uuid>', 'role', 'authenticated')::text, true);
  update public.profiles set is_pro = true where id = '<a test user uuid>';  -- expect ERROR 42501
  rollback;

  begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '<a test user uuid>', 'role', 'authenticated')::text, true);
  update public.profiles set username = username where id = '<a test user uuid>';  -- expect UPDATE 1
  rollback;

  begin;
  set local role anon;
  select stripe_customer_id from public.profiles limit 1;  -- expect ERROR permission denied
  rollback;
  ```
  The revert check is the same script run before the migration: the first update succeeds and the anon select returns rows.
- Also confirm after deploy: a Stripe test checkout still flips `is_pro` (webhook uses the service role), and the admin toggle still works.

**Done when:** 1a and 1b are merged, 0032 is applied, the three verification statements behave as stated, and the `</script>` listing check passes on production.

---

## WS2: Library mutations are correct

Depends on Q2 and Q3. **If Q2 shows a unique constraint on `(user_id, gcd_issue_id)`, stop and bring it to Tony**: the plan's "separate wishlist row" design can't work and needs a decision.

### Design

Rows are copies. One `user_collections` row = one physical copy (`owned` / `for_sale`) or one want (`wishlist`). For a GCD issue a user can have any number of copy rows and at most one wishlist row.

**Local comics (`comic_id`)**: if Q2 confirms a unique `(user_id, comic_id)` constraint, they stay one row per comic: add flips status, remove deletes that row. That's today's behavior and nothing in the UI offers extra copies of a local comic. Converting local comics to the copy model needs the constraint dropped; that waits for the D1 long-term design note.

**New module `src/lib/libraryMutations.js`** (pure, no Supabase):

```js
// rows: this user's user_collections rows for ONE issue key.
// Returns { inserts: [row], updates: [{ id, patch }], deletes: [id] }.
export function planAdd(rows, { status, key })
export function planRemove(rows, { rowId, scope })   // scope: "copy" | "wishlist" | "latest-copy"
export function pickRowToRemove(rows, scope)          // used by the issue/search pages
```

Rules for `planAdd(rows, { status })` on a GCD issue:
| Existing rows | Adding `owned` | Adding `wishlist` |
|---|---|---|
| none | insert owned | insert wishlist |
| wishlist only | update that row to owned (the want is fulfilled) | no-op |
| ≥1 copy, no wishlist | no-op (use "Add another copy" for more) | insert a wishlist row; copies untouched |
| ≥1 copy + wishlist | delete the wishlist row | no-op |

Rules for `planRemove`:
- `scope: "copy", rowId`: delete exactly that row. Error if `rowId` isn't in `rows`.
- `scope: "latest-copy"`: delete the `owned`/`for_sale` row with the latest `created_at` (ties broken by `id`). A `for_sale` copy is only picked if there's no `owned` copy, so the button doesn't silently pull a listing.
- `scope: "wishlist"`: delete the wishlist row only.

### PR 2a · `agent/ws2-library-mutations` · ~450 lines + migration 0036

**The one-wishlist rule lives in Postgres**, not only in `planAdd`: two tabs (or a double-click) can both see "no wishlist row" and both insert. Migration `scripts/migrations/0036_one_wishlist_row_per_issue.sql`:

```sql
-- 0036_one_wishlist_row_per_issue.sql
-- Run Q3b first. If it returns rows, run the dedupe below, then this.
create unique index concurrently if not exists user_collections_one_wishlist_per_issue
  on public.user_collections (user_id, gcd_issue_id)
  where status = 'wishlist' and gcd_issue_id is not null;
```
- `concurrently` can't run inside a transaction; run it on its own in the SQL editor. If it fails partway it leaves an `INVALID` index: `drop index concurrently user_collections_one_wishlist_per_issue;` and re-run.
- Dedupe (only if Q3b found rows; keeps the oldest wishlist row, which has no Pro fields worth keeping since wishlist rows don't carry grades). Agent writes the dry-run list; Tony runs the delete:
  ```sql
  -- dry run: rows that would be deleted
  select id, user_id, gcd_issue_id, created_at from (
    select id, user_id, gcd_issue_id, created_at,
           row_number() over (partition by user_id, gcd_issue_id order by created_at, id) rn
      from public.user_collections
     where status = 'wishlist' and gcd_issue_id is not null) t
   where rn > 1;
  -- apply
  delete from public.user_collections where id in (
    select id from (
      select id, row_number() over (partition by user_id, gcd_issue_id order by created_at, id) rn
        from public.user_collections
       where status = 'wishlist' and gcd_issue_id is not null) t
     where rn > 1);
  ```
- Rollback: `drop index concurrently if exists public.user_collections_one_wishlist_per_issue;`
- **Owned adds racing** (double-click, two tabs both adding an issue you don't own yet) could insert two owned rows, since owned copies can't have a unique index. Handled in the client, not the DB: `LibraryContext` keeps an in-flight `Set` of issue keys and ignores an add/remove for a key that's already in flight, and the button is disabled while its call runs. That covers double-clicks. Two tabs adding the same issue at the same moment remain possible; the result is a visible extra copy the user can remove from the library, not data loss, so an RPC/advisory-lock isn't worth it now. Test case 7: `planAdd` isn't re-entered for a key while a call is pending (tested through a small `withKeyLock(key, fn)` helper in `libraryMutations.js`).
- Code: a wishlist insert that fails with `23505` (unique violation) is treated as success (someone else already added it) and followed by a background refresh. Same for an owned-row update that races a delete: `0 rows updated` → refresh, not an error.
- Revert check (Tony, after applying): inserting a second wishlist row for the same user and issue in a `begin … rollback` block errors with 23505.

- `src/context/LibraryContext.js`
  - `addToCollection(inputId, status)`: read existing rows with `.select("id, status, created_at")` (no `.maybeSingle()`), call `planAdd`, apply the plan. Returns `{ ok: true } | { ok: false, error }`.
  - Optimistic update: apply the same plan to local state (temp ids for inserts) instead of `prev.filter((c) => makeLibraryKey(c) !== libraryKey)` (line ~239), which currently collapses every copy into one row.
  - `removeFromCollection(inputId, { rowId, scope = "latest-copy" } = {})`: when `rowId` is given, delete `.eq("id", rowId).eq("user_id", user.id)`; otherwise compute from `planRemove`. Optimistic update removes only that row. Returns `{ ok, error }`.
  - `addAnotherCopy`: check `error` on the copy-number read (currently ignored, line ~387) and return `{ ok, error }`.
- `src/app/issue/[id]/page.js` (~lines 385–423): owned state's remove button calls `removeFromCollection(libraryId, { scope: "latest-copy" })` with the label from D-b; wishlist remove calls `{ scope: "wishlist" }`. When a call returns `ok: false`, show the existing inline error style instead of failing silently.
- `src/app/search/SearchPageClient.js` (~578, ~587): same two scopes.
- `src/app/comic/[id]/page.js` (~174, ~179): local comic, one row; pass `{ scope: "wishlist" }` / `{ scope: "latest-copy" }` anyway so the API is uniform.
- `src/app/library/page.js:485`: already removes a specific item; pass `{ rowId: item.id }` so it deletes that row and no other copy.
- **D2:** `src/app/series/[id]/SeriesClient.js` (~181) and `src/app/arc/[id]/page.js` (~124) count `result.ok === false` as a failure (the current `try/catch` never fires because `addToCollection` doesn't throw). Show "Added N, M failed" when M > 0.

**Tests** `src/lib/libraryMutations.test.js` (`npm run test:library-mutations`, added to `pr-ci.yml`):
1. `planRemove` on 3 copies with `scope: "copy", rowId: <middle>` deletes only that id → 2 left.
2. `planRemove` with `scope: "wishlist"` on 2 copies + 1 wishlist deletes only the wishlist id.
3. `planAdd(wishlist)` on 1 owned copy → one insert with status wishlist, zero updates.
4. `planAdd(owned)` on 2 copies → empty plan (no error).
5. `planAdd(owned)` on wishlist only → one update to owned.
6. `planRemove("latest-copy")` picks the latest `created_at`, and prefers `owned` over `for_sale`.

**Revert check:** a file `src/lib/libraryMutations.legacy.js` is **not** added. Instead the PR description shows the result of temporarily replacing `planAdd`/`planRemove` with the old logic (key-level delete; status flip on first row) and running the suite: cases 1, 2, 3 and 4 fail. That's the "fails with the old logic" proof the plan asks for.

**Manual check** on a preview deploy with a test account: own 3 copies of one issue, remove one from the issue page, library shows 2; own 1 + add to wantlist, both appear; delete the test account afterward (per the QA rule) and confirm with a query.

### PR 2b · `agent/ws2-grading-trigger` · migration only

**D3 + the service-role bug: `scripts/migrations/0034_pro_grading_trigger_fix.sql`**

```sql
-- 0034_pro_grading_trigger_fix.sql
-- Two fixes to enforce_pro_for_grading():
-- 1. The service-role bypass compared current_user, which inside a
--    SECURITY DEFINER function is the owner, never 'service_role'. Use the
--    request's JWT role instead.
-- 2. A lapsed Pro user with a grade on file couldn't change anything on that
--    row (status, notes, price) because the check fired on any non-null
--    gated field. Now it fires only when a gated field is set or changed.

begin;

create or replace function public.enforce_pro_for_grading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_pro_user boolean;
  is_founding boolean;
  touches_gated boolean;
begin
  -- Server writes through PostgREST carry a service_role JWT.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  -- Direct SQL-editor maintenance: logged in as postgres with no JWT claims.
  -- (current_user can't be used: in a SECURITY DEFINER function it's always
  -- the owner. A test that does `set local role authenticated` and sets
  -- claims does NOT take this branch, so the checks below still run.)
  if session_user in ('postgres', 'supabase_admin')
     and nullif(current_setting('request.jwt.claims', true), '') is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    touches_gated := new.grade_numeric is not null
                  or new.slab_company is not null
                  or new.slab_cert_number is not null
                  or new.user_cover_url is not null;
  else
    -- Setting to null (clearing) is always allowed.
    touches_gated := (new.grade_numeric is distinct from old.grade_numeric and new.grade_numeric is not null)
                  or (new.slab_company is distinct from old.slab_company and new.slab_company is not null)
                  or (new.slab_cert_number is distinct from old.slab_cert_number and new.slab_cert_number is not null)
                  or (new.user_cover_url is distinct from old.user_cover_url and new.user_cover_url is not null);
  end if;

  if not touches_gated then
    return new;
  end if;

  select coalesce(is_pro, false), coalesce(is_founding_collector, false)
    into is_pro_user, is_founding
    from public.profiles
   where id = new.user_id;

  if not (coalesce(is_pro_user, false) or coalesce(is_founding, false)) then
    raise exception 'Pro tier required to set grade, slab, cert, or per-book photo fields'
      using errcode = '42501', hint = 'Upgrade to Collector Pro at /upgrade';
  end if;

  return new;
end;
$$;

commit;
```

(The trigger binding from 0008 stays; `create or replace` rebinds it.)

- **Rollback:** re-run `scripts/migrations/0008_pro_grading_trigger.sql`.
- **Verification SQL** Tony runs after applying, against a free test account `<free uuid>` with an owned row `<row id>` that has `grade_numeric` set (set it first as postgres):
  ```sql
  -- setup, run on its own in a fresh SQL-editor query (no claims set): takes the postgres bypass
  update public.user_collections set grade_numeric = 9.4 where id = '<row id>';

  begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','<free uuid>','role','authenticated')::text, true);
  update public.user_collections set notes = 'x' where id = '<row id>';           -- expect UPDATE 1 (was ERROR before 0034)
  update public.user_collections set grade_numeric = 9.6 where id = '<row id>';   -- expect ERROR 42501
  update public.user_collections set grade_numeric = null where id = '<row id>';  -- expect UPDATE 1
  rollback;

  begin;
  set local role service_role;
  select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  update public.user_collections set grade_numeric = 9.6 where id = '<row id>';   -- expect UPDATE 1 (was ERROR before 0034)
  rollback;
  ```
  Revert check: the same script before applying shows the first and last statements erroring. Clean up the setup grade afterward.

**Done when:** 2a merged with its suite in CI, 0034 applied, verification output pasted into the PR.

---

## WS3: Shared helpers and honest errors

Mechanical and large. Lands after WS1a (it touches the same routes). Split so each PR is reviewable by grep:

### PR 3a · `agent/ws3-helpers` · large, mechanical

One module each. Every copy in `src/` goes; `scripts/` copies move where the import resolves without `@/` (scripts import with relative paths, e.g. `../src/lib/...js`, as `refreshGcdIssuesFromApi.js` already does).

| Helper | Canonical home | `src/` copies to delete (on `5b9647f`) |
|---|---|---|
| `parseYear`, `bestYearFor` | new `src/lib/years.js` | admin/production-assets/resolve, export/csv, export/pdf, export/wantlist, issues/[id], library/catalog-link/search, library-hydrate, public-profile, search/comics, series/[id], story-arc/[id], shareCards/loadCollection, catalogLinkMatcher (re-export) |
| `fetchAllPages` | `src/lib/supabase/fetchAllPages.js` | catalog/lookup, comics, library/run-completion, library-hydrate, public-profile (nested), featuredSeriesData (nested), shareCards/loadCollection |
| `normTitle` | `src/lib/titleMatch.js` | library/catalog-link/search, library/page.js:1040 (nested), catalogLinkMatcher (re-export) |
| `baseIssueNumber` | `src/lib/coverMatch.js` for now (moves in WS5) | issues/[id], series/[id] |
| publisher normalization | `src/lib/publisher.js` (`normalizePublisherName`) | library/page.js:109 (shadowing copy), CollectionInsightSidebar.js:24, coverMatch.js:23 (re-export the one in publisher.js) |
| `normalizeKey` | stays in `src/lib/csvImport/matchRow.js` (one copy) | none |

- **Behavior differences between copies must be checked, not assumed.** Before deleting each copy, diff it against the canonical one. Where they differ (e.g. a `parseYear` that accepts numbers vs one that doesn't), the canonical version takes the most permissive correct behavior and a test case pins it. List every difference found in the PR body.
- `fetchAllPages` copies that order by something other than `id` (e.g. `gcd_id`) pass that column as `orderCol`. The `comics` route's `gcd_issues` read orders by `gcd_id` on purpose (OPERATIONS_HANDOFF §9 item 4); keep it.
- The CSV export's unpaginated `gcd_issues` and `series` `.in()` reads (`src/app/api/export/csv/route.js` ~114–126) move to `fetchAllPages` with `.in()` chunked at 500 ids per request (URL length).
- **Shared fixture for publishers:** `tests/fixtures/publisher-aliases.json` (`[{ raw, expected }]`, ~40 cases incl. `Udon Entertainment Corp.` → `UDON`). `src/lib/publisher.test.js` runs it against JS; `tests/test_publisher_fixture.py` runs it against the ingester's normalizer. Add both to CI (`pr-ci.yml` gets a `python -m pytest tests/test_publisher_fixture.py` step; `actions/setup-python` if not already present).
- **Test:** `src/lib/years.test.js` table-driven over every input shape the deleted copies handled.
- **Done check:** `grep -rnE "(function|const) (parseYear|bestYearFor|fetchAllPages|normTitle)\b" src` returns exactly one definition each.

### PR 3b · `agent/ws3-service-client` · mechanical

- `src/lib/supabase/service.js`: `export function getServiceClient()` returning a module-scoped singleton built from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, with `auth: { persistSession: false }`. Throws a clear error if the key is missing.
- Replace the ~32 `createClient(..., SERVICE_ROLE_KEY)` calls in `src/app/api/**`. Anon-key clients (`getAuthedUser`, the blog route's `getAnonClient`) stay as they are.
- **Done check:** `grep -rn "SUPABASE_SERVICE_ROLE_KEY" src/app` is empty.

### PR 3c · `agent/ws3-error-burndown`

- The 55 `src/` hits in `scripts/.error-handling-baseline.json`. Each read whose `error` is ignored either returns `NextResponse.json({ error }, { status: 502 })` (upstream failure) or, where a partial page is genuinely better (a missing cover lookup on an otherwise complete issue page), logs with `console.error` **and** sets a `degraded: true` flag in the response. The PR lists which sites got which treatment.
- Lower the baseline file in the same PR (`npm run audit:errors -- --update` or however the script writes it; check). `src/` count goes to 0.
- **Revert check:** `npm run audit:errors` fails if one fix is reverted (the ratchet already enforces this).

**Done when:** all three merged; greps clean; baseline `src/` count is 0.

---

## WS4: One cover resolver

### PR 4a · `agent/ws4a-cover-resolver`

**`src/lib/catalog/covers.js`**

```js
// issues: [{ gcd_issue_id, series_gcd_id, series_title, issue_number, year,
//            series_year_start, series_year_end }]
// Returns Map<gcd_issue_id, { storage_path, source, tier, canonical_cover_id }>
export async function resolveCovers(supabase, issues)
// Pure half, for tests: given the issues and the candidate rows, decide.
export function pickCovers(issues, candidateRows)
```

Precedence (per issue, first hit wins):
1. `canonical_covers.gcd_issue_id = issue.gcd_issue_id`, `storage_path` not null. If several, prefer the one whose `series_gcd_id` matches, then oldest `created_at`, then `id`.
2. `canonical_covers.series_gcd_id = issue.series_gcd_id` and `issueKey(cover.issue_number) === issueKey(issue.issue_number)`, and `cover.series_year` (when present) within `[series_year_start - 1, series_year_end + 1]`.
3. `cover.series_gcd_id IS NULL` and `cover.series_title` is **exactly** one of `titleVariants(issue.series_title)` (the same literal strings the query fetches with `.in("series_title", …)`; `titleVariants` is case-preserving and only adds article and `:`/`,` variants, so the predicate must not promise anything looser than the query can return) and same `issueKey`, and `cover.series_year` within ±1 of `issue.year` (or the series span when the issue year is null). **Tier 3 never matches when the issue's series has any tier-2 covers**, so an untagged cover can't override a correctly tagged sibling.
4. No cover. Never a different issue's cover.

`issueKey` is `baseIssueNumber` now and becomes `parseIssueNumber(...).key` in WS5.

**Batching:** three lookups per call (one per tier), not one per issue: by `gcd_issue_id`; by `series_gcd_id`; by `series_title` (title variants) with `series_gcd_id is null`. Each `.in()` list is chunked at 500 values, and each chunk goes through `fetchAllPages`, so the real HTTP request count is `Σ over tiers of ceil(distinct values / 500) × result pages`. For an issue page that's 3 requests. For a 1,000-id library-hydrate chunk it's typically 2 + 1–2 + 1–2 (series and titles are far fewer than issues), plus extra pages only for series with > 1,000 covers (The Beano etc.). Chunks within a tier run sequentially; the three tiers run in `Promise.all`, except tier 3 is skipped for issues already resolved by tiers 1–2 and so runs after them. The perf PR measures this, not the "3 queries" shorthand. All three filter columns are indexed (`gcd_issue_id` 0018, `series_gcd_id` 0009, `(series_title, id)` 0027).

**Surfaces routed through it** (the 17 `src/` files reading `canonical_covers` on `5b9647f`):
- In scope: `api/issues/[id]` (5 reads; variant covers from `cover_variants` stay as-is, keyed off the resolved primary), `api/series/[id]` (3), `api/library-hydrate` (3), `api/public-profile` (3), `api/activity` (1), `api/search/comics` (1), `api/story-arc/[id]` (1), `api/export/pdf` (2), `lib/shareCards/loadCollection` (1), `lib/heroWall` (1), `lib/homeDispatch` (3), `lib/featuredSeriesData` (1). The marketplace snapshot cover (`src/lib/marketplace.js`) gets its cover from library-hydrate's output, so it follows automatically; the PR confirms that.
- Left out, with reasons:
  - `api/search/series` (2): reads `series.featured_cover_path_cached` and falls back to a series-level cover pick, not an issue cover. Different question ("a cover for this series"); stays.
  - `api/library/catalog-link/search` (2): shows candidate covers for a user choosing a link; it deliberately shows covers that aren't linked yet.
  - `api/admin/production-assets/*` (3): admin tool that browses raw rows.
  - `lib/supabase/fetchAllPages.js`: a comment, not a read.
- So the done-check is: `grep -rn 'from("canonical_covers")' src/app src/lib | grep -v -e catalog/covers.js -e search/series -e catalog-link -e production-assets -e fetchAllPages.js` returns nothing. The plan's "none in `src/app` outside the resolver" is adjusted to this list.

**Tests** `src/lib/catalog/covers.test.js` (`npm run test:covers`, in CI), all over `pickCovers` with fixture rows:
- Move the existing `src/lib/coverMatch.test.js` cases that cover lookup behavior.
- TMNT #2: 1984 Mirage issue gets the 1984 cover, not the 2011 IDW cover tagged to another `series_gcd_id`.
- Nova (1994) #4 vs Nova (2013) #4: each gets its own.
- Robin (1993) #1: an untagged 2022 "Robin" #1 cover is rejected by tier 3's year window.
- X-O Manowar: four same-titled volumes, each issue #1 gets its own volume's cover.
- An issue whose only cover is untagged (tier 3) resolves.
- An issue whose series has tier-2 covers but not this issue number, plus an untagged same-title cover: resolves to **none** (rule above).
- Revert check: replace `pickCovers` with a title + issue-number match (the old fallback) and at least TMNT, Nova and X-O fail.

**Parity script** `scripts/coverResolverParity.js`:
- Stratified sample, ≥ 5,000 issues: every issue of the 30 series with the most covers, every issue of 50 random same-title clusters (titles with ≥ 3 `series` rows), plus 2,000 random issues that have any cover. Seeded so it's repeatable.
- For each issue, old path = what `/api/issues/[id]` returns today (call the production endpoint, sequential, ≤ 4 rps, off-peak), new path = `resolveCovers`.
- Output `reports/cover-resolver-parity-<date>.md`: counts (same / gained / lost / changed), then every non-"same" row with series, issue, old path, new path and tier. Tony reviews this before merge. "Lost" rows each need a reason in the PR.
- Verification the script can fail: it's run once against a deliberately broken resolver (tier 2 disabled) and must report a large "lost" count. That run's summary line goes in the PR.

**Expected size:** likely > 600 lines because 12 surfaces change. If so, split into 4a-1 (module + tests + parity script + issues/series routes) and 4a-2 (the rest).

### PR 4b · `agent/ws4b-cover-lock`

**Migration `scripts/migrations/0035_canonical_covers_link_lock.sql`**

```sql
-- 0035_canonical_covers_link_lock.sql
-- Repairs to a cover's issue/series link kept getting undone by the next
-- ingest upsert. A locked row keeps its link columns unless the writer
-- deliberately re-stamps link_locked_at, which only repair tools do.

begin;

alter table public.canonical_covers
  add column if not exists link_locked boolean not null default false,
  add column if not exists link_locked_at timestamptz,
  add column if not exists link_source text
    check (link_source in ('ingest', 'repair_script', 'manual'));

create or replace function public.keep_locked_cover_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.link_locked
     and new.link_locked_at is not distinct from old.link_locked_at then
    new.series_gcd_id    := old.series_gcd_id;
    new.gcd_issue_id     := old.gcd_issue_id;
    new.match_confidence := old.match_confidence;
    new.link_locked      := old.link_locked;
    new.link_source      := old.link_source;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_locked_cover_link_trg on public.canonical_covers;
create trigger keep_locked_cover_link_trg
  before update on public.canonical_covers
  for each row execute function public.keep_locked_cover_link();

commit;
```

- The ingester's upsert (`upsert_cover_row`, `comicvine_api_to_supabase.py:1389`, `on_conflict=source_issue_url`, `merge-duplicates`) becomes `INSERT … ON CONFLICT DO UPDATE`, which fires the `BEFORE UPDATE` trigger, so it obeys the lock without code changes. It never sends `link_locked_at`.
- **Unlock** = `update canonical_covers set link_locked = false, link_locked_at = now() where …` (re-stamping is what lets the change through).
- Confirm `match_confidence` exists in the WS0 dump; drop that line if it doesn't.
- **Writers** that relink (they set `link_locked = true, link_locked_at = now(), link_source = 'repair_script'` on every relink): `repairAllCoverSeriesLinks.js`, `repairCanonicalCoverLinks.js`, `repairCanonicalCoverVolumeLinks.js`, `repairFeaturedSeriesCoverage.js`, `splitVolumeCoversByIssueRange.js`, `resolveAmbiguousPins.js`, `propagateGcdIdByCvVolume.js`, `linkUntaggedCoversFromUserGaps.js`, `backfillCanonicalCoversGcdId.js`. Bulk backfills that fill **null** links (not overriding a repair) don't lock. The PR lists each writer and which it is.
- **Rollback:**
  ```sql
  drop trigger if exists keep_locked_cover_link_trg on public.canonical_covers;
  drop function if exists public.keep_locked_cover_link();
  alter table public.canonical_covers
    drop column if exists link_source,
    drop column if exists link_locked_at,
    drop column if exists link_locked;
  ```
- **Verification Tony runs** (on one real row `<id>`, inside a transaction so nothing sticks):
  ```sql
  begin;
  update public.canonical_covers set link_locked = true, link_locked_at = now(), link_source = 'manual' where id = '<id>';
  update public.canonical_covers set gcd_issue_id = -1, series_gcd_id = -1 where id = '<id>';  -- simulates the ingester
  select gcd_issue_id, series_gcd_id from public.canonical_covers where id = '<id>';           -- expect the ORIGINAL values
  update public.canonical_covers set gcd_issue_id = -1, link_locked_at = now() where id = '<id>';
  select gcd_issue_id from public.canonical_covers where id = '<id>';                            -- expect -1
  rollback;
  ```
  Revert check: the same script without the trigger shows -1 after the second statement.
- **End-to-end check** (the plan's "done when"): after merge, pick one volume a repair script locked, note its link values, force one ingest run on that volume (`--volume-id`), and confirm by query that the links are unchanged.
- **`issue_primary_cover` (D-e):** not built unless WS0 shows cover resolution is more than ~30% of the issue or series route's p95. With WS4a's 3 batched queries it's unlikely to be.
- **Load:** adding three columns with constant defaults is metadata-only on Postgres 11+, no table rewrite. Still apply off-peak.

**Done when:** 4a merged after Tony read the parity list; 0035 applied with its check pasted; the end-to-end re-ingest check passed.

---

## WS5: Issue numbers and publishers

### PR 5 · `agent/ws5-issue-numbers`

- New `src/lib/issueNumber.js`:
  ```js
  // Returns { base, suffix, isAnnual, isHalf, raw, key }
  // key = `${isAnnual ? "A" : ""}${isHalf ? "H" : ""}${base}` — what covers and counts group on.
  export function parseIssueNumber(s)
  ```
- Cases (table-driven test `src/lib/issueNumber.test.js`, `npm run test:issue-number`):
  | input | base | suffix | isAnnual | isHalf | key |
  |---|---|---|---|---|---|
  | `1` | 1 | `` | f | f | `1` |
  | `1 [Newsstand]` | 1 | `` | f | f | `1` |
  | `1 [Variant Cover]` | 1 | `` | f | f | `1` |
  | `1/2` | 0.5 | `` | f | t | `H0.5` |
  | `½` | 0.5 | `` | f | t | `H0.5` |
  | `Annual 1` | 1 | `` | t | f | `A1` |
  | `-1` | -1 | `` | f | f | `-1` |
  | `0` | 0 | `` | f | f | `0` |
  | `1A` | 1 | `A` | f | f | `1` |
  | `1.MU` | 1 | `.MU` | f | f | `1` |
  | `12/1987` (slash-year) | 12 | `` | f | f | `12` |
  | `` / null | null | | | | `null` |
  Revert check: run the same table through today's `baseIssueNumber`; `1/2`, `½`, `Annual 1` and `-1` fail.
- Replace `baseIssueNumber` in `src/lib/coverMatch.js`, the resolver, `scripts/refreshSeriesSearchCache.js` and the 3 script copies with `parseIssueNumber(s).key`.
- **Measure before switching:** `scripts/measureIssueKeyChange.js` walks every series' `gcd_issues` (paginated, keyset on `gcd_id`), computes each issue's old key (`baseIssueNumber`) and new key (`parseIssueNumber().key`), and writes `reports/issue-key-change-<date>.json` listing every `series.id` where **any issue's key changed** (not only where the distinct count changed: `{1/2, 2}` goes from `{1, 2}` to `{H0.5, 2}` with the same count, and cover matching still changes). For each series it records old count, new count and the changed issues, plus a summary. Tony approves the list; then `node scripts/refreshSeriesSearchCache.js --only-ids-file=<that list>` runs off-peak. No full refresh.
- **Publishers:** `normalizePublisherName` from `src/lib/publisher.js` (made canonical in WS3) is used by search, the library sidebar, CSV import (`src/app/api/csv-import/route.js` ~210) and `/api/comics`. Alias table lives in `publisher.js`, with the shared fixture from WS3.

---

## WS6: CSV round trip and local comics

### PR 6 · `agent/ws6-csv-roundtrip`

- **Factor first:** `src/lib/csvExport.js` (`rowsToCsvRecords(rows, meta)`) and `src/lib/csvImport/planImport.js` (`planImport(records, existingRows, catalogMatches) → { inserts, updates, skips }`). Routes become thin wrappers.
- **Export** adds columns `gcd_issue_id`, `comic_id`, `variant_label`, `copy_number` (and already-exported grade fields stay).
- **Import** (`src/app/api/csv-import/route.js`):
  - Uses `gcd_issue_id` when present and valid, skipping title matching.
  - Writes `condition`, `grade_numeric`, `slab_company`, `slab_cert_number`, `notes`, `purchase_price`, `market_value`. The route already uses the service role; after 0034 the trigger's bypass actually works. Gated fields are only written when the importing user is Pro/Founding (checked in the route), so a free user's import can't smuggle grades in through the service role.
  - Extra copies become extra rows (`copy_number` from the file, or next free).
  - Owned CSV row + existing wishlist row for that issue → wishlist row upgraded to owned (same rule as `planAdd`, reused from `libraryMutations.js`).
- **D5:** `src/lib/createLocalComic.js`, `createLocalComic(supabase, { title, issue_number, publisher, release_year, variant_name, created_by })`: dedupes on `series.title_normalized` (the logic already in `/api/comics` POST, moved), normalizes publisher via `normalizePublisherName`, always sets `comics.publisher`. Used by `/api/comics` and CSV import.
- **Backfill SQL** for Tony (count from Q5; the plan said ~150):
  ```sql
  -- dry run
  select count(*) from public.comics c join public.series s on s.id = c.series_id
   where c.publisher is null and s.resolved_publisher_cached is not null;
  -- apply
  update public.comics c set publisher = s.resolved_publisher_cached
    from public.series s
   where s.id = c.series_id and c.publisher is null and s.resolved_publisher_cached is not null;
  ```
  Rollback: not needed for a null → value fill, but the dry-run select with `c.id` listed goes in the PR so it's reversible by id.
- **Test** `src/lib/csvRoundTrip.test.js` (`npm run test:csv-roundtrip`): fixture library (owned ×2 copies of one issue, a wishlist, a graded slab, a local comic, a for_sale copy) → `rowsToCsvRecords` → serialize → parse → `planImport` against an empty account → apply to an in-memory store → export again. The two CSVs are identical except `created_at`. Revert check: drop `copy_number` from export and the test fails (the second copy collapses).

---

## WS7: Speed

Each item ships only with a before/after from `npm run perf:baseline` in its PR. An item that doesn't move its number is reverted, not merged. Order by expected payoff:

1. **Marketplace** (`agent/ws7-marketplace`): remove `await refreshListingSnapshots({ sb })` from `getListings()` (`src/lib/marketplace.js:133`). Add `.github/workflows/listing-snapshots.yml` running `scripts/refreshListingSnapshots.js` every 15 minutes (`*/15`, offset off `:00`: `7,22,37,52 * * * *`). `POST /api/listings/sync` keeps refreshing the seller's own listings on toggle, so a new listing still gets its cover immediately.
2. **Issue and series routes** (`agent/ws7-issue-series`): count round trips per request with a temporary `x-query-count` header in a preview deploy (not shipped). Group the independent reads in `src/app/api/issues/[id]/route.js` into `Promise.all` stages. The WS4 resolver already cut the cover tiers to 3 batched queries. Report queries/request before and after.
3. **Search** (`agent/ws7-search`): confirm every search path filters on `title_normalized` (S5b already removed catalog-link's `title ILIKE`). Tony runs:
   ```sql
   -- signature from 0029: (normalized_term text, allowed_publishers text[], result_limit int default 400)
   -- <ALLOWLIST> = the array /api/search/series actually passes; the PR pastes it in.
   explain (analyze, buffers) select * from public.search_series_by_relevance('xo', <ALLOWLIST>, 400);
   explain (analyze, buffers) select * from public.search_series_by_relevance('batman', <ALLOWLIST>, 400);
   explain (analyze, buffers) select id from public.series where title_normalized ilike '%xo%' limit 20;
   ``` Indexes are added only where a plan shows a seq scan on `series` or `canonical_covers`, as a numbered migration with `create index concurrently` (outside a transaction) and a `drop index concurrently` rollback.
4. **Library** (`agent/ws7-library`): throttle the visibility refetch (`LibraryContext.js:177`) to at most once per 60 s. Full refetch only, no delta sync: an `updated_at > lastFetchedAt` fetch would need a verified update trigger on that column and a server-side cursor, and a stale library is worse than a slightly slower one. Revisit only if the throttled full refetch still shows up in the perf numbers. Hydrate cache keys on a hash of the sorted requested IDs, not the whole library.
5. **CDN headers** (`agent/ws7-cdn`): `issues/[id]` and `story-arc/[id]` get `CDN_CACHE_SHORT` on success when the route reads no viewer state (confirm: no `Authorization` read). Never on `library-hydrate`, `public-profile` (respects privacy toggles; short CDN caching would show a just-privated library), `activity`, or anything with `getAuthedUser`.

**Done when:** `reports/perf-after-2026-xx.md` is committed next to the baseline with the same `CASES`, and each target is met or the miss has a written reason.

---

## WS8: Pipeline state out of git (only on D-d = go)

`__pycache__` is already done (#192). The rest:
- Table:
  ```sql
  create table if not exists public.pipeline_state (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now()
  );
  alter table public.pipeline_state enable row level security;
  revoke all on public.pipeline_state from anon, authenticated;
  ```
  Rollback: `drop table public.pipeline_state;` (after restoring the files from git history).
- `scripts/lib/pipelineState.js` (`read(key)`, `write(key, value)`) and the Python equivalent. Keys: `ingest-done`, `needs-volume-id`, `gap-<name>`, `refresh-cursor`, `gcd-refresh-cursor`, `instagram-last-post-date`.
- Every workflow that commits these files stops committing them. One PR, landed on a Tuesday or Wednesday (not a Mon/Thu refresh day), then `cron-watchdog` and the ingest health check must stay green for 48 hours. A one-time `scripts/seedPipelineState.js` copies the current files into the table first.
- Not started without a yes.

---

## WS9: Docs (runs throughout, lands last)

- `docs/ARCHITECTURE.md`, one page, after WS4: browser → API routes → Supabase (RLS, triggers: `enforce_pro_for_grading`, `protect_profile_billing_columns`, `user_collections_sync_listing`, `keep_locked_cover_link`) ← ingester / repair scripts / cron workflows; one cover resolver; marketplace listings via trigger.
- CLAUDE.md: trim to current contracts, move incident narratives (the long dated paragraphs under `series`, cover ops, auth UX) to `docs/history/`. Fix: "Valuation goes through eBay Browse API" (Engineering Reminders) contradicts the eBay section; `market_comps` "Phase 2" notes; the variant-schema line under `series` that predates `cover_variants`; the cover-image-priority line should name the resolver.
- `docs/README.md` index updated; `npm run docs:check` passes.
- Design notes in `docs/design/` for the 5 out-of-scope items (one page each).

---

## PR sequence

```
PR0 (WS0) ─┬─ PR1a ── PR1b(0032)
           ├─ PR2a(0036) ── PR2b(0034)
           └─ (after PR1a) PR3a ─ PR3b ─ PR3c ─ PR4a ─ PR4b(0035) ─ PR7.*
                                      └─ PR5 ─ PR6
PR8 any time after PR0, if D-d = go.   PR9 last.
```

WS1 and WS2 run in parallel worktrees. WS3 waits for PR1a (same routes). PR2a and PR3a both touch `LibraryContext.js` and `library/page.js`; whichever lands second rebases.

## Per-PR Codex loop

1. Implement in the worktree. 2. `senior-audit` diff mode against `origin/main`. 3. Fix accepted findings, re-run, max 3 rounds; stop on a round with no accepted Critical/High. 4. Triaged findings go in the PR body under "Codex review". 5. Tony merges after CI passes and any migration is applied.

---

## Codex review log

Pre-review self-check (before round 1): found that `library/page.js` doesn't batch hydrate requests (the plan said it did), so S5a now ships client chunking with the cap. Fixed the `search_series_by_relevance` argument list against migration 0029.

### Round 1 (2026-10-04)

| # | Sev | Finding | Decision | Reason |
|---|---|---|---|---|
| 1 | High | One-wishlist-row rule only enforced client-side; two tabs can both insert | **Accept** | Real race, and `scope: "wishlist"` depends on it. Added migration 0036 (partial unique index, `concurrently`), Q3b dedupe check, 23505 treated as success |
| 2 | High | WS5 picks refresh targets by distinct-key *count*; same-size key-set changes are missed | **Accept** | `{1/2, 2}` example is correct. Now flags any series where any issue's key changes |
| 3 | Medium | "3 queries per call" ignores `.in()` chunking and pagination | **Accept** | Wording was wrong; spelled out the real request count and tier ordering. No scope change: the perf PR measures it |

### Round 2 (2026-10-04)

| # | Sev | Finding | Decision | Reason |
|---|---|---|---|---|
| 1 | High | Concurrent owned adds can insert two owned rows | **Accept as Medium** | Real, but the outcome is a visible, removable extra copy, not data loss, and the same race exists today. Added a per-key in-flight guard + disabled button (covers double-click). Rejected the atomic RPC / lock: disproportionate for a rare two-tab race |
| 2 | High | Tier-3 predicate (`normTitle` equality) is looser than what the `.in("series_title", titleVariants())` query can fetch | **Accept** | Verified in `src/lib/titleMatch.js`: variants are exact, case-preserving. Predicate now means exact membership in `titleVariants`, matching today's behavior. A normalized-title column on `canonical_covers` would be broader but is a new index + backfill; not needed for parity |
| 3 | Medium | 0034 has no owner bypass, so its own setup step fails as `postgres` | **Accept** | Correct. Added a bypass keyed on `session_user` + absent JWT claims (not `current_user`, which is always the owner in a SECURITY DEFINER function); tests that set claims still hit the checks |

### Round 3 (2026-10-04, final round)

| # | Sev | Finding | Decision | Reason |
|---|---|---|---|---|
| 1 | High | A full schema dump in `supabase/migrations/` would be applied as a migration by the Supabase CLI | **Accept** | Correct, and the plan had the same path. Moved to `docs/schema/baseline-2026-10.sql` |
| 2 | Medium | Dump check greps `CREATE OR REPLACE FUNCTION`; plain `pg_dump` emits `CREATE FUNCTION` | **Accept** | Correct. Check now accepts both and looks for named functions |
| 3 | High | Delta library fetch assumes `updated_at` is bumped on every update, plus client-clock cursor skew | **Accept** | Unverified assumption that could serve a stale library. Dropped the delta option; WS7 throttles the full refetch only. Q4 no longer asks about `updated_at` |

**Stop rule:** round 3 had two accepted Highs. Both were fixed in this revision by narrowing scope (a file path; removing an optional optimization), not by adding design, so no accepted High is left open. Not re-run, since the plan caps the loop at 3 rounds. Tony should know round 3 still found Highs; the stop rule says to bring that to him, and the PR description does.
