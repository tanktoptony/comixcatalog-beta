# Engineering workflow — branches, PRs, and the engineering report

**Status:** active
**Last verified:** 2026-08-04

## Why this exists

`docs/2026-08-03-review-and-next-steps.md` documents a real near-miss: two AI coding sessions committed directly to `main` all day under the same git identity, with no PR gate. A push collided with a second session's uncommitted edits to the same files; it recovered cleanly only because `git status` was checked before anything destructive. This doc is the convention adopted afterward to make that less likely, without adding a review bottleneck to a solo-founder repo that otherwise wants to move fast.

## Branch + PR convention (soft, not enforced)

- **Default for anything non-trivial** — more than a one-line fix, or anything touching Stripe, auth, migrations (`scripts/migrations/`), or cover-matching (`src/lib/coverMatch.js`, `catalogLinkMatcher.js`, `titleMatch.js`): branch as `agent/<short-topic>` or `session/<date>-<topic>`, push, open a PR against `main`.
- **Running two or more agents at once (Codex, Claude, etc.) is REQUIRED to use `git worktree`, not just separate branch names.** A branch name alone doesn't isolate anything — two agents checking out different branches in the *same* working directory are still editing the same files on disk and will collide on uncommitted changes (confirmed 2026-08-04: of 4 concurrent Codex tasks, the 2 given their own worktree had zero issues; the 2 sharing the main checkout produced a tangled, hard-to-review working tree before anything was even committed). Set up per task with:
  ```
  git branch agent/<topic> main
  git worktree add .worktrees/<topic> agent/<topic>
  ```
  Then point that agent's terminal/session at `.worktrees/<topic>` as its working directory, not the main repo folder. `.worktrees/` is gitignored. Remove with `git worktree remove .worktrees/<topic>` once its PR has merged.
- `.github/workflows/pr-ci.yml` runs lint (scoped to the PR's changed JS/JSX files only — `npm run lint` unscoped currently fails on ~29 pre-existing repo-wide errors as of 2026-08-04, which would make every PR permanently red), `test:cover-match`, build, and `docs:check` on every PR.
- **Auto-merge:** once you or an agent opens a PR, enable GitHub's auto-merge on it — it lands the moment `pr-ci.yml` passes, no manual click required. This requires two one-time GitHub Settings changes (see below); nothing to configure per-PR beyond checking the auto-merge box.
- **This is a convention, not a gate.** `main` is not branch-protected against direct pushes. For trivial fixes, or whenever speed matters more than the ceremony, pushing straight to `main` is still fine — that was an explicit tradeoff, not an oversight (a hard block was considered and rejected in favor of this).

### One-time GitHub Settings (manual — not scriptable from an agent session)

1. **Settings → General → Pull Requests** — check "Allow auto-merge."
2. **Settings → Branches** — add a rule on `main` with *only* "Require status checks to pass before merging" checked (select the `pr-ci.yml` job — it needs to have run at least once before it's selectable). Leave "Require a pull request before merging" **unchecked** — that's what keeps this a convention rather than a hard block; without this step, GitHub's auto-merge will land a PR the instant it's mergeable, without actually waiting for `pr-ci.yml`.

## Engineering report (on-demand, not a cron)

`npm run report:engineering [-- --since=<window>]` — a lighter, git-native cousin of `reports/ComixCatalog-Daily-Report-2026-08-03.pdf` (that one was written by hand; this one is mechanical, no LLM narrative). Defaults to the last 24 hours; `--since` also accepts a git ref (e.g. `--since=485a23e`) to review a specific range, or a git-log date expression (`--since=48h`, `--since=2026-08-03`).

It does two things, both from `git log` alone — no Supabase queries in this version:

- **Risk-tags every commit** in the window by which paths it touched (critical: Stripe/auth/migrations/workflows; high: cover-matching, ingestion scripts, API routes; medium: everything else under `src/app`/`src/components`; low: docs/public/CSS).
- **Flags concurrent-edit risk**: files touched by 2+ commits within 2 hours of each other. This is a safety net for the *next* incident, not a retroactive detector for 2026-08-03's — that one was a working-tree race resolved before anything was committed, so it left no trace in git log. `git status` before any pull/merge remains the actual mitigation for that class of problem.

Output goes to stdout and to `reports/engineering-report-<date>.md` (gitignored, same as the PDF — a local artifact, not meant to be committed). Run it at the end of a session, or whenever you want a quick read on what just landed before starting something new.
