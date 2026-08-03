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
  - Evidence: formal plan (2026-08-01) scored "Cover ingestion and linking" at 88% overall readiness. Live-queried 2026-08-03: 44,882/106,983 (42%) of `canonical_covers` have `gcd_issue_id`, 87,276/106,983 (82%) have `series_gcd_id`. These are global figures, not scoped to the launch-priority universe — someone needs to run the priority-scoped measurement `scripts/checkTargetSeriesCoverage.js` (or equivalent) against just that universe to get a real number against this gate.
  - Last checked: 2026-08-03 (global figures only)
  - Blocker: no priority-scoped measurement on record

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
