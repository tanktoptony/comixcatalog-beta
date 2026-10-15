# Production hardening plan

**Status:** H1 to H5 done 2026-10-15 (#339 to #342). Open: H6 restore drill, H7 library undo, D1 PITR decision.
**Owner:** Tony. **Builders:** Codex (jobs marked Codex), Claude (scoping, review, migrations, config, merges).
**Source:** a "before your vibe-coded app touches a paying customer" checklist, checked against prod on 2026-10-15. ComixCatalog takes real payments soon (marketplace checkout is live in test mode for an allowlist), so this is the bar for go-live.

## Where we stand (verified 2026-10-15)

| Area | State |
|---|---|
| Row-level security | On for all 58 public tables. |
| Nightly backups | Daily physical backups complete. Point-in-time recovery (PITR) is **off**. A restore has **never** been tested. |
| Password reset | Links expire after 1 h and work once (Supabase). |
| MFA | TOTP on; admin uses it. |
| Passwords | App forms require 10 characters (`src/lib/passwordPolicy.js`), but Supabase's server minimum is **6**, so a direct API call skips the form rule. Leaked-password check (HIBP) off. |
| Sessions | Never time out (`sessions_timebox` = 0, `sessions_inactivity_timeout` = 0). No "your password changed" email (`mailer_notifications_password_changed_enabled` = false). |
| Founding pass | One pass per account, gated by our confirm link (0061). `+tag` addresses and Gmail dots let one inbox confirm many accounts, so one person can claim every remaining pass. `src/lib/disposableEmail.js` checks only the domain. |
| Downtime | No alert. The DB was down ~11 PM to 6:30 AM CT on 10-14/15, found only because Tony couldn't log in. |
| Admin-key routes | 79 files under `src/app/api` use the service-role key, which bypasses RLS. Each one must check ownership itself; nobody has audited them as a set. |
| Migrations | Forward-only, applied by hand. Duplicate numbers already exist (0037, 0067, 0068). The 10-05 Disk IO outage came from a migration rewriting `series` and building indexes. |
| Deletes | Hard deletes everywhere; a removed library book is gone. |

Out of scope on purpose: SSO, SAML, SCIM, tenant isolation, deeper roles, "log in as this user". Those serve B2B sales; ComixCatalog is a consumer site.

## Checklist

| ID | Job | Who | Size | Order |
|---|---|---|---|---|
| H1 | Down alert: `/api/health` + 10-minute check that emails Tony | Codex | S | **Done 2026-10-15 (#339)** |
| H2 | Auth settings: server password min 10, HIBP, password-changed emails, session inactivity timeout | Claude | XS | **Done 2026-10-15** |
| H3 | One founding pass per inbox (normalize `+tags` and Gmail dots), plus "Sign out of all devices" on /account | Codex + migration | S | **Done 2026-10-15 (#342, 0076 applied)** |
| H4 | Migration safety check in CI | Codex | S | **Done 2026-10-15 (#340)** |
| H5 | Admin-key route audit, then fixes | Codex (audit) → Codex (fixes) | M | **Done 2026-10-15 (#341): no findings, no Phase B** |
| H6 | Restore drill + runbook | Claude + Tony | S | 5 |
| H7 | Undo for library removals (soft delete) | Codex + migration | M | Later |
| D1 | Decide on PITR (paid add-on) | Tony | n/a | At marketplace go-live |

Mark each row done here, with the PR number, when it merges.

## How to run a Codex job

Every job gets its own worktree and branch. Never use a `node_modules` junction: `git worktree remove` follows it and deletes the real folder.

```bash
cd C:/Users/antho/Desktop/comixcatalog-frontend/comixcatalog-frontend
git fetch origin
git worktree add ../ccf-h1-uptime -b agent/h1-uptime origin/main
cd ../ccf-h1-uptime && npm ci
codex exec -s workspace-write "Read docs/production-hardening-plan.md and docs/AGENT_GUIDE.md. Do job H1 only, exactly as its brief says. Stop when its acceptance list passes."
```

Rules for every job:
- Read `docs/AGENT_GUIDE.md` first. Branded UI only (`docs/UX_RULES.md`); no unstyled screens.
- New migration: take the next free number per `docs/operations/engineering-workflow.md`. Start the file with a `-- Rollback:` comment block that says how to undo it. Codex writes it; Claude applies it via the Management API before merge.
- Every fix ships with a test that **fails on the old code** (the failure mode), not just a happy-path test.
- `npm run lint`, unit tests, `npm run test:db` (when SQL changes), and `next build` pass in CI. A local Windows `next build` failure on `/opengraph-image` is a known unrelated issue; CI on Linux is the real check.
- The error-handling ratchet rejects a bare `catch {}`; add a why-comment.
- PR body: what changed, how it was tested, the SQL inline if any. No marketing words.

---

## H1. Down alert (Codex)

**Goal:** Tony gets an email within ~15 minutes when the site or database stops answering, and one more when it recovers. No repeat spam while it stays down.

**Context:**
- GitHub's `schedule:` trigger has silently skipped runs on this repo before. `scripts/cronWatchdog.js` re-fires overdue workflows (`WATCHED` list), and `.github/workflows/cron-watchdog.yml` runs it every 6 h.
- Email goes out through Resend. Workflows already use `secrets.RESEND_API_KEY` and `secrets.REPORTS_NOTIFY_EMAIL` (see `marketplace-sweep.yml`). Resend does not depend on our DB, so it works during a DB outage.

**Do:**
1. `src/app/api/health/route.js`: `dynamic = "force-dynamic"`, no caching. Run one tiny indexed read (`series`, `select id limit 1`) with a 5 s abort. Return `200 {ok:true, db_ms}` or `503 {ok:false}`. Expose no error text, keys or hostnames.
2. `scripts/uptimeCheck.js`:
   - Fetch `https://www.comixcatalog.com/api/health` (8 s timeout, one retry after 20 s). Also fetch `https://www.comixcatalog.com/` and expect a 200.
   - Read the previous run's conclusion via the GitHub API (`actions/workflows/uptime-check.yml/runs?per_page=2`).
   - Email only on a state change: up→down sends "ComixCatalog is DOWN" with the failing check and timings; down→up sends "Recovered" with the outage length. While it stays down, send one reminder every 6 h, worked out from run timestamps.
   - Exit non-zero when down, so the run's conclusion is the state.
3. `.github/workflows/uptime-check.yml`: cron `*/10 * * * *` + `workflow_dispatch`, `timeout-minutes: 3`, sparse checkout of the script only, env `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `REPORTS_NOTIFY_EMAIL`, `GITHUB_TOKEN`.
4. Add `uptime-check.yml` to `WATCHED` in `scripts/cronWatchdog.js`, with a cadence of 10 min and a 30 min grace.

**Don't:** add a status page, store state in the DB, or alert on a single slow response.

**Acceptance:**
- Unit tests for the state machine (up→up silent, up→down email, down→down silent until 6 h, down→up recovery email) with faked fetch and GitHub API.
- Failure-mode test: point the script at an unreachable URL and assert a non-zero exit and a built "DOWN" email.
- After merge, Claude triggers `workflow_dispatch` once against a bad URL override (`UPTIME_URL` env, test only) and confirms the email arrives, then once against prod and confirms no email.

## H2. Auth settings (Claude, Management API)

Claude applies these with `PATCH /v1/projects/{ref}/config/auth`, records before and after here, and tests a signup and a password change on `test_tony`.

| Setting | Now | Target | Why |
|---|---|---|---|
| `password_min_length` | 6 | 10 | Match `MIN_LENGTH` in `src/lib/passwordPolicy.js`, so the API enforces what the form does |
| `password_hibp_enabled` | false | true | Reject known-leaked passwords. Needs a paid plan; skip if refused and note it |
| `mailer_notifications_password_changed_enabled` | false | true | Tells the owner if someone else changed it. The template already exists |
| `mailer_notifications_mfa_factor_enrolled_enabled` / `_unenrolled_enabled` | false | true | Same, for MFA changes |
| `sessions_inactivity_timeout` | 0 | 30 days | Abandoned sessions die. Paid-plan feature; skip if refused |

Existing users are unaffected until they next change their password.

**Done 2026-10-15.** All five applied. `sessions_inactivity_timeout` is in hours, so 720 = 30 days (2592000 was refused, max 8760). Verified on prod: a signup with an 8-character password returns `weak_password` ("at least 10 characters"), and a 12-character leaked password returns `weak_password` with reason `pwned`. Neither created an account.

## H3. One founding pass per inbox + sign out everywhere (Codex, migration)

**Goal:** a founding pass can't be farmed with `you+1@gmail.com`, `you+2@gmail.com`, `y.o.u@gmail.com` and so on. Members can kill every session they have.

**Context:** `scripts/migrations/0061_founding_claims.sql` (`claim_founding_pass`, `founding_claim_tokens`), `src/app/api/founding/status/route.js` (sends the confirm link; calls `isDisposableEmail`), `src/app/api/founding/confirm/route.js` (claims).

**Do:**
1. `src/lib/normalizeEmail.js`: lowercase, trim, drop everything from the first `+` in the local part (all domains), and for `gmail.com` / `googlemail.com` remove dots and map to `gmail.com`. Export the shared test vectors.
2. Migration: `public.normalize_email(text) returns text` (immutable, same rules), and in `claim_founding_pass` refuse when another `is_founding_collector` profile's `auth.users.email` normalizes to the same value as the claimant's. Keep the function signature and return type unchanged (return `claimed=false, already=false`). Keep the advisory lock.
3. `founding/status` route: run the same check before sending the confirm email, and show "This inbox already holds a founding pass" in the existing founding UI style.
4. Read-only report, no data change: list any current founders who share a normalized inbox. Claude runs it and shows Tony. Nobody loses a pass without his call.
5. `/account`: a "Sign out of all devices" button that calls `supabase.auth.signOut({ scope: "global" })` behind a confirm step, styled like the rest of the account page.

**Acceptance:**
- JS tests and SQL tests (`tests/db`) use the same vectors and agree.
- Failure-mode DB test: founder A claims, then account B with `a+x@gmail.com` and `a.x` variants is refused, and the cap count is unchanged.
- The race test from 0061 still passes.

## H4. Migration safety check in CI (Codex)

**Goal:** stop the two migration mistakes that already happened: duplicate numbers, and table rewrites or blocking index builds on big tables.

**Do:** `scripts/checkMigrations.js`, run in `pr-ci.yml` on changed files under `scripts/migrations/` only:
1. Fail on a new file whose number is already used. Allowlist the historical duplicates 0037, 0067, 0068 (and any others found) with a comment.
2. Fail when a new file has `create index` without `concurrently`, or `alter table ... alter column ... type`, on a large table: `series`, `gcd_series`, `gcd_issues`, `gcd_stories`, `issue_creators`, `user_collections`, `canonical_covers`, `listings`. An explicit `-- migration-check: allow <reason>` line overrides it.
3. Fail when a new file has no `-- Rollback:` block.

**Acceptance:** fixture tests for each rule (pass and fail cases). The check runs green against every existing file, thanks to the allowlist.

## H5. Admin-key route audit (Codex, read-only first)

**Goal:** prove no signed-in user can read or change someone else's data by changing an id, through the 79 route files that use the service-role key.

**Phase A (read-only):** write `docs/audits/2026-10-service-role-routes.md` with one row per route and method: who may call it, how the caller is identified (bearer token → `auth.getUser`), whether every id from the request is checked against the caller, input validation, and a verdict (`ok`, `finding`, `public by design`). Do marketplace, orders, listings, library, inbox, account and admin first. Don't change code in this phase.

**Phase B (fixes):** one PR per finding cluster. Each fix has a DB or route test where user A sends user B's id and gets 403 or 404, and the test fails on the old code. Claude reviews every Phase B PR, since it touches auth and money.

## H6. Restore drill (Claude + Tony)

**Goal:** know the backup actually restores, and how long it takes.

1. Tony starts "Restore to a new project" from the latest daily backup in the Supabase dashboard. It creates a temporary billable project.
2. Claude compares row counts for `profiles`, `user_collections`, `listings`, `orders`, `series`, `gcd_issues` against prod and times the restore.
3. Claude writes `docs/operations/restore-runbook.md`: steps, time taken, what was checked, and how to repoint the app if it were real.
4. Tony deletes the temporary project.

## H7. Undo for library removals (later, Codex + migration)

Removing a book from the library moves the row to `user_collections_removed` with `removed_at`. An "Undo" toast appears for 10 s, a "Recently removed" list on /library keeps rows for 30 days, and a nightly job purges older ones. The listing cascade guard from the marketplace spec must still hold. Scope this separately before building.

## D1. PITR decision (Tony, at marketplace go-live)

PITR lets the DB roll back to any minute instead of the last nightly backup. It's a paid add-on with a compute minimum, so check current pricing in the dashboard. Recommendation: turn it on the day real money starts moving, not before.
