# Documentation index

## Authority order

When documents disagree, resolve in this order:

1. Current code and migrations
2. Verified production data (Supabase — query it, don't assume)
3. [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) — formal launch gates
4. [PROJECT_STATUS.md](PROJECT_STATUS.md) — current engineering status
5. Active implementation specs (below)
6. `north-star/NORTH_STAR.md` — aspirational, product direction, not a status source
7. Historical audits and agent-prompt templates

A document must never claim something is shipped just because an earlier session said so. If in doubt, check the code or query the database.

## Start here

| Question | Document |
|---|---|
| What exists right now? | [PROJECT_STATUS.md](PROJECT_STATUS.md) |
| What's blocking the Aug 31–Sep 11 launch? | [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) |
| Schema, domain vocabulary, engineering gotchas | [CLAUDE.md](../CLAUDE.md) |
| What's the product direction long-term? | [north-star/NORTH_STAR.md](north-star/NORTH_STAR.md) |
| How do branches/PRs work here, how do I get an engineering report? | [operations/engineering-workflow.md](operations/engineering-workflow.md) |

## Active specs

These describe work that's still in progress or planned, each with its own status line — check the doc's own header for current status before trusting anything in the body.

- [data-hardening-and-growth-spec.md](data-hardening-and-growth-spec.md) — cover/publisher matching architecture fix, in progress.
- [variant-architecture-context.md](variant-architecture-context.md) — **planning input, not yet a spec.** Research/context for an upcoming planning session on variant-cover picker UI + collected-editions-as-pseudo-series; read before starting that session.
- [gcd-incremental-sync-plan.md](gcd-incremental-sync-plan.md) — planning stage, blocked on a human-cleared prerequisite before any live request against comics.org.
- [instagram-bot-plan.md](instagram-bot-plan.md) — automation is live (`.github/workflows/instagram-post.yml`); doc may lag the shipped state.
- [stripe-testing-guide.md](stripe-testing-guide.md) — manual QA checklist for the Pro subscription flow. Should be re-walked as part of the "Payment lifecycle tests" launch gate.
- [unify-library-profile.md](unify-library-profile.md) — labeled "design" status as of June 2026; verify against current `/library` and `/u/[username]` code before treating any of it as done.
- [marketplace-launch-spec.md](marketplace-launch-spec.md) — **post-launch scope.** Targets Phase 4 (Nov 2026 per CLAUDE.md). Not a September launch dependency — see LAUNCH_CHECKLIST.md's out-of-scope section.

## Operations

- [operations/engineering-workflow.md](operations/engineering-workflow.md) — branch/PR convention (soft, not enforced), `pr-ci.yml`, and the on-demand `npm run report:engineering` script.

## Session reviews

Dated, point-in-time records — not living status docs (those are PROJECT_STATUS.md / LAUNCH_CHECKLIST.md above) and not specs. Each covers a specific day/session's commits with a review and a next-steps list; superseded by newer reviews, not updated in place.

- [2026-08-03-review-and-next-steps.md](2026-08-03-review-and-next-steps.md) — full-day review across two concurrent AI sessions (14 commits: cover-ingest ledger/matching fixes, Instagram bot fixes, orphaned-series-row fix + backfill, pricing CSS, Absolute-line dedup, docs restructure). Full detail in `reports/ComixCatalog-Daily-Report-2026-08-03.pdf` (local only).

## Agent task templates

Self-contained prompts meant to be pasted into a fresh agent session, not status documents.

- [data-hardening-and-growth-agent-prompts.md](data-hardening-and-growth-agent-prompts.md)
- [marketplace-launch-agent-prompts.md](marketplace-launch-agent-prompts.md) — **known stale detail:** its shared preamble references the repo at `c:\dev\comixcatalog-beta`; the actual working copy is elsewhere. Re-verify paths before handing this to an agent.

## Product direction (aspirational — not status)

- [north-star/NORTH_STAR.md](north-star/NORTH_STAR.md) — modeled on Discogs; design/sitemap standard, not a shipped-feature list.

## Historical / archived

- [../archive/2026-08-repo-cleanup/](../archive/2026-08-repo-cleanup/) — see that folder's README for what was moved and why (nothing deleted, all recoverable via `git log --follow`).

## Formal artifacts

- [../reports/ComixCatalog-Formal-Launch-Plan.pdf](../reports/ComixCatalog-Formal-Launch-Plan.pdf) — the signed/dated launch plan. `LAUNCH_CHECKLIST.md` is its living, checkable Markdown counterpart — update the checklist, don't edit the PDF.

## Update expectations

- Active docs should carry a status/date line at the top. If you materially change one, update that line.
- `PROJECT_STATUS.md` and `LAUNCH_CHECKLIST.md` are the only two documents that should be treated as ground truth for "is it done." Everything else is a plan, a spec, or a historical record.
- Don't let a spec's body text claim a data count or completion state without a date attached — undated claims rot silently.
