# ComixCatalog — Launch Checklist

**Authority:** This is the *only* current launch checklist. If any other document (spec, audit, agent-prompt file, North Star) implies a different launch scope or gate, this file wins — flag the conflict, don't silently follow the other doc.
**Source:** Gates below are transcribed directly from `reports/ComixCatalog-Formal-Launch-Plan.pdf` ("Formal launch gates," p.8) — that PDF is the signed/dated artifact; this file is the living, checkable version of it.
**Launch window:** August 31 – September 11, 2026. Internal release-candidate target: August 21, 2026.
**Last verified:** 2026-08-05

Every item needs Owner / Evidence / Last checked / Blocker filled in before it can flip to done. An unchecked box with no evidence line is not "probably fine" — it's unknown.

---

## Formal launch gates (from the signed plan, p.8)

- [ ] **Open P0 defects: 0**
  - Owner:
  - Evidence:
  - Last checked:
  - Blocker:

- [ ] **Open P1 defects: 0**
  - Owner:
  - Evidence:
  - Last checked:
  - Blocker:

- [x] **Priority cover coverage >= 90%** (launch-priority universe: user collections, wantlists, featured titles, frequently searched series, current releases, high-value issues — NOT the full raw catalog)
  - Owner:
  - Evidence: **8,883/9,597 issues covered (92.56%) across 170 series**, measured via `scripts/generatePriorityCoverTargets.js` after fixing a second measurement bug tonight (2026-08-05): every multi-page `.range()` query in the script's pagination helper had no `.order()` clause, so Postgres/PostgREST gave no row-order guarantee across page requests — under concurrent writes (a live ingest running at the same time) this silently skipped rows between pages, producing different totals on identical back-to-back runs (85.34% then 81.29% the same night, before the fix). Fix: every paginated query now orders by its primary key (`id`, or `gcd_id` for `gcd_issues`). Verified deterministic across 3 consecutive reruns post-fix. Also found and fixed tonight: one real `user_collections` row (issue "Superman #78") was linked to a mislabeled duplicate GCD series entry (`gcd_id` 28776, incorrectly cached as "DC Comics") instead of the real DC Superman vol. 2 run (`gcd_id` 3386) — re-linking it moved the reading from 91.58% to 92.56% and turned a false "90/119 missing" into a true "5/231 missing." 51 series still have at least one gap — see `gap-priority.json`. One series (Justice League, 2022, `gcd_id` 184847 — a 3-issue mini, not the mainline ongoing) is deliberately held out of ingest pending correct-volume research; ComicVine's auto-resolver keeps falling back to the wrong 75-issue ongoing for it.
  - Last checked: 2026-08-05 (priority-scoped live query, post pagination-order fix + Superman re-link, reproduced 3x)
  - Blocker: none — gate met. Residual honesty note: some of this week's percentage movement is measurement-accuracy and data-correctness work (a smaller, correct denominator; fixing undercounting; fixing one mislinked series), not solely new covers ingested — a full real ComicVine ingest pass against the 50 non-held targets this session added **zero new rows** (all already covered), meaning the remaining gaps in those series may not exist in ComicVine's data at all, same pattern as the original denominator bug. See `reports/priority-cover-coverage-2026-08-05.md` for the full breakdown. Still unresolved: no live current-release or search-frequency signal feeding the priority universe.

- [ ] **Known publisher mismatches: 0**
  - Owner:
  - Evidence: `reports/canonical-cover-link-repair-*.json` shows repeated repair runs through 2026-08-02 — repair is active/ongoing, not yet at a documented zero-mismatch state.
  - Last checked:
  - Blocker:

- [ ] **Core workflow success >= 99%** (signup, search, series, issues, library, variants, wantlist, imports, exports, profiles, subscriptions per the plan's "whole-site polish" pass)
  - Owner:
  - Evidence:
  - Last checked:
  - Blocker: no end-to-end test pass recorded yet

- [ ] **API/server error rate < 1%**
  - Owner:
  - Evidence:
  - Last checked:
  - Blocker: no monitoring/alerting dashboard confirmed wired (Sentry or equivalent — status unknown, not verified this pass)

- [ ] **Payment lifecycle tests: 100%** (checkout, webhook, portal, cancellation, failed-payment, authorization)
  - Owner:
  - Evidence: `docs/stripe-testing-guide.md` exists as a checklist but has not been re-walked and confirmed complete this pass.
  - Last checked:
  - Blocker:

- [ ] **Valuations with source labels: 100%**
  - Owner:
  - Evidence: verified 2026-08-03 — `src/app/library/page.js:1740-1766` already distinguishes `"asking, N listings"` (eBay Browse, asking price) from `"auto, N sales"` (would-be sold comps) from `"cover price"` (era-based fallback), each with an explanatory tooltip. This is the one launch-gate item with strong code-level evidence already in hand. Still needs a check that every other display surface (PDF export, series/issue pages, if they show valuation) does the same.
  - Last checked: 2026-08-03 (library page only)
  - Blocker: PDF export and any other valuation display surfaces not yet checked

- [ ] **Backup and recovery test: Passed**
  - Owner:
  - Evidence:
  - Last checked:
  - Blocker: no backup/recovery test on record

- [ ] **Marketing calendar: 30 days ready**
  - Owner:
  - Evidence: `docs/instagram-bot-plan.md` covers the Instagram automation track. No 30-day multi-channel calendar confirmed scheduled.
  - Last checked:
  - Blocker:

---

## Three-track program (from the formal plan, p.3) — status pointer only

Full detail lives in `docs/PROJECT_STATUS.md` §4. Quick pointer so this checklist doesn't duplicate that doc:

- **Track A (covers/data integrity):** structural-link repair in progress, not yet at zero-mismatch.
- **Track B (valuation):** Browse-API asking-price pipeline live and correctly labeled (see gate above); true sold-comp data still blocked on eBay Insights approval.
- **Track C (revenue convergence):** Stripe + PDF wired; formal plan scored this track's readiness at 78% (PDF/subscription) and overall revenue-engine readiness at 75% as of 2026-08-01.

## Explicitly out of scope for this launch (per the formal plan, p.5)

- Marketplace transaction fees / peer-to-peer selling — deferred to post-launch.
- Premium "Vault" tier — deferred until PDF/private-sharing differentiation is proven.
- Advertising spend during initial trust-building phase.
- 90% coverage of the *entire* raw catalog (vs. the launch-priority universe) — explicitly called a multi-month program, not a launch blocker.

If any spec under `docs/` (marketplace-launch-spec.md, the Vault tier, etc.) reads as though it's in scope for September, it isn't — that document is describing a later phase.
