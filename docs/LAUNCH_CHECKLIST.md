# ComixCatalog — Launch Checklist

**Authority:** This is the *only* current launch checklist. If any other document (spec, audit, agent-prompt file, North Star) implies a different launch scope or gate, this file wins — flag the conflict, don't silently follow the other doc.
**Source:** Gates below are transcribed directly from `reports/ComixCatalog-Formal-Launch-Plan.pdf` ("Formal launch gates," p.8) — that PDF is the signed/dated artifact; this file is the living, checkable version of it.
**Launch window:** August 31 – September 11, 2026. Internal release-candidate target: August 21, 2026.
**Last verified:** 2026-08-03

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

- [ ] **Priority cover coverage >= 90%** (launch-priority universe: user collections, wantlists, featured titles, frequently searched series, current releases, high-value issues — NOT the full raw catalog)
  - Owner:
  - Evidence: **20,242/25,415 issues covered (79.65%) across 169 series**, measured via `scripts/generatePriorityCoverTargets.js` after two fixes today: (1) a cross-volume cover-bleed bug (`src/app/api/issues/[id]/route.js` — a cover with no `series_year` could be matched to any same-titled issue regardless of actual volume; concrete case: Nova (1994) #4 was showing 2013 Marvel NOW! Nova art), which briefly dropped the recorded figure to 68.61%; (2) the measurement script itself only matched covers by exact `series_title` string against GCD's title, never by `series_gcd_id` — so covers already correctly ID-linked were invisible whenever GCD and the stored cover's title disagreed on punctuation (e.g. GCD "G.I. Joe, a Real American Hero" vs. the stored "G.I. Joe: A Real American Hero"). Fixing (2) alone moved the number from 68.61% to 79.65% — G.I. Joe (1982) went from "0/431 covered" to fully resolved, off the gap list entirely. 83 series still need work — biggest real remaining gaps: The Spectacular Spider-Man (1976) 421/649 covered (228 missing), The Amazing Spider-Man (1963) 741/967 (226 missing), X-Men (1991) 136/305 (169 missing), The Uncanny X-Men (1981) 812/978 (166 missing).
  - Last checked: 2026-08-04 (priority-scoped live query, post cover-bleed fix + post measurement-script fix)
  - Blocker: measured coverage (79.65%) is 10.35 points below the 90% gate — much closer than earlier readings today suggested, since a large chunk of the apparent gap was a measurement bug, not missing data. 744 gap-priority targets (as of the pre-fix count; not yet re-measured post-fix) need manual `--volume-id` resolution (ambiguous title/publisher match) — see `needs_volume_id.json`. Also unresolved: no live current-release or search-frequency signal.

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
