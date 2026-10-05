# Agent Guide

Read this before every task in this repo. It's short on purpose.

## Before changing code

1. Read [PRODUCT.md](PRODUCT.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
2. Read the domain doc that applies: [CATALOG_DATA.md](CATALOG_DATA.md), [MARKETPLACE.md](MARKETPLACE.md), [UX_RULES.md](UX_RULES.md). Check [DECISIONS.md](DECISIONS.md) before reversing anything that looks deliberate.
3. Read the files you'll touch, and their callers. Server pages call route handlers in-process; a response-shape change can break a page that never makes an HTTP request.
4. CLAUDE.md has column-level schema notes and gotchas. Where it disagrees with code, code wins.

## Setup

- The git repo is `comixcatalog-frontend/comixcatalog-frontend` (nested). Base work on `origin/main`; local `main` is usually behind and bots push to it hourly.
- Work in your own worktree: `git fetch origin && git worktree add .worktrees/<topic> -b agent/<topic> origin/main`, then copy `.env.local` in and `npm ci`. A branch alone doesn't isolate you from other sessions.
- Don't commit `.ingest-done.json`, `needs_volume_id.json`, `gap-*.json`, cursor files or `comicvine_api_output/` from a PR branch.

## Rules

1. **The repo beats memory and old docs.** Verify a claim in code or data before repeating it.
2. **One system per job.** Don't add a second search path, cover resolver, publisher normalizer, Supabase client or auth flow. Extend the existing one.
3. **Don't change identifiers.** `gcd_id`, `series.id`, `comics.id`, synthetic `cv-`/`cvt-` ids and library keys are in user data, URLs and listings.
4. **Schema changes are SQL the founder runs.** Write the migration into `scripts/migrations/`, paste the SQL inline in the PR and in chat, and don't merge dependent code first. You can't run DDL.
5. **Routes bypass RLS.** Most use the service role. Authenticate with `getAuthedUser(req)` and check ownership yourself. Never trust a user id from the body or query.
6. **Select explicit `profiles` columns.** `select("*")` from a browser fails since 0032b.
7. **Paginate.** PostgREST silently returns 1000 rows max. Use `fetchAllPages` with a stable sort for anything that could exceed it, including throwaway scripts. Check `error` on every query.
8. **Never show a wrong cover, never overclaim.** No borrowed covers; no "sold" for asking prices; no marketplace features that don't exist.
9. **`for_sale` is owned.** Use `OWNED_STATUSES`.
10. **Keep mobile working.** Check phone width for any UI change. Small covers go through `coverThumb()`.
11. **Don't replace working features with placeholders**, and don't delete a route or table because it looks unused without checking callers, cron scripts and the Python ingester.
12. **Fix the bug you were asked to fix.** No broad refactors inside a bug fix.
13. **No destructive production deletes from an agent session.** Write the plan, dry-run output and SQL; the founder runs it. Bulk DB/storage jobs: one at a time, concurrency ≤ 4, off-peak.
14. **No AI attribution** in commits or PR bodies.

## Bug fixes

1. Classify first: **data** (bad rows, wrong links), **ingest/script**, **database** (RLS, trigger, constraint, index), **API** (route logic, truncation), **state** (LibraryContext, cache), or **UI**.
2. Reproduce on the real path: the actual endpoint or query with the real failing record. If a user says it isn't their browser, believe them and check the server.
3. Fix the cause in the layer that owns it.
4. Prove it: the check must fail with the fix reverted. Use a sample big enough to hit the failure (multiple batches, same-titled volumes, more than 1000 rows).
5. If the root cause is specific bad records with a known correct value, fix those records too (via SQL for the founder if it's destructive).

## Features

1. Check PRODUCT.md and ROADMAP.md: is this planned, parked, or needing a founder decision?
2. Find the existing abstraction (context, lib helper, route) and extend it.
3. Pro gating: client hides, server or trigger enforces.
4. Update the affected canonical doc in the same PR.

## Migrations

1. Additive and idempotent (`if not exists`). Include a rollback note.
2. Include RLS policies and grants for any new table or column.
3. Check existing constraints first; several live only in the database, not in the repo.
4. State in the PR: "Run this SQL before merging."

## Refactors

Only when asked or when required by the fix. Follow the slop remediation spec's workstream order. Mechanical PRs stay mechanical; no behavior changes mixed in.

## Catalog and data fixes

1. Dry run first; every repair script takes `--apply`.
2. Check whether the ingest will overwrite your fix on its next run (until link locks exist, it can).
3. Before pinning a ComicVine volume, check no other series holds it.
4. Verify on the page a user sees, not just the row.

## Reporting back

- List user-visible changes separately from backend/infra.
- Say which PRs are open and which are merged. A PR does nothing until it merges.
- Say what you didn't verify.
