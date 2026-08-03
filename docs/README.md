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

## Active specs

These describe work that's still in progress or planned, each with its own status line — check the doc's own header for current status before trusting anything in the body.

- [data-hardening-and-growth-spec.md](data-hardening-and-growth-spec.md) — cover/publisher matching architecture fix, in progress.
- [gcd-incremental-sync-plan.md](gcd-incremental-sync-plan.md) — planning stage, blocked on a human-cleared prerequisite before any live request against comics.org.
- [instagram-bot-plan.md](instagram-bot-plan.md) — automation is live (`.github/workflows/instagram-post.yml`); doc may lag the shipped state.
- [stripe-testing-guide.md](stripe-testing-guide.md) — manual QA checklist for the Pro subscription flow. Should be re-walked as part of the "Payment lifecycle tests" launch gate.
- [unify-library-profile.md](unify-library-profile.md) — labeled "design" status as of June 2026; verify against current `/library` and `/u/[username]` code before treating any of it as done.
- [marketplace-launch-spec.md](marketplace-launch-spec.md) — **post-launch scope.** Targets Phase 4 (Nov 2026 per CLAUDE.md). Not a September launch dependency — see LAUNCH_CHECKLIST.md's out-of-scope section.

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
