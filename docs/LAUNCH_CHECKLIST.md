# ComixCatalog — Launch Checklist

**Authority:** This is the *only* current launch checklist. If any other document (spec, audit, agent-prompt file, North Star) implies a different launch scope or gate, this file wins — flag the conflict, don't silently follow the other doc.
**Source:** Gates below are transcribed directly from `reports/ComixCatalog-Formal-Launch-Plan.pdf` ("Formal launch gates," p.8) — that PDF is the signed/dated artifact; this file is the living, checkable version of it.
**Launch window:** ~~August 31 – September 11, 2026~~ — **superseded 2026-09-08.** That window assumed full-time hours; the founder is working this part-time around a separate software job, so there is no fixed launch date right now. Treat the gates below as a quality bar to work through at a sustainable pace, not a countdown. Internal release-candidate target: August 21, 2026 (also passed, same reason).
**Last verified:** 2026-09-13 (3 of 10 gates re-checked this pass — priority coverage, publisher mismatches, valuation labels; the other 7 are still whatever they were on 2026-08-05 or earlier, see each gate's own Last checked line)

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
  - Evidence: **12,011/12,928 issues covered (92.91%) across 202 series**, re-verified live 2026-09-13 via `scripts/generatePriorityCoverTargets.js` (previous reading of 92.59%/9,597 issues was from 2026-08-05, over a month stale). Universe grew by ~3,300 issues since then (more collection/wishlist activity feeding the priority set) and coverage held/improved anyway. 51 series still have at least one gap — see `gap-priority.json` (regenerated same pass).
  - Last checked: 2026-09-13 (live re-run, single pass — prior entry's 3x-reproduction rigor not repeated this time, re-run again if this becomes load-bearing for a go/no-go call)
  - Blocker: none — gate met.

- [ ] **Known publisher mismatches: 0**
  - Owner:
  - Evidence: **Partially re-verified 2026-09-13.** `node scripts/checkCoverIngestHealth.js --mode=mislink` (the automated regression check that runs every cover-ingest cycle) found 0 newly mis-linked volumes — the day-to-day auto-repair mechanism is healthy. That is not the same as zero historical mismatches: the same run surfaced 2,783 volumes still in an unresolved/ambiguous overlap-scoring state (2,533 below the 85% confidence threshold, 21 genuinely too-close-to-call), none of which are *confirmed* wrong so much as *not yet confirmed right*. `reports/canonical-cover-link-repair-*.json` still shows this as an active, ongoing backlog, not a closed one.
  - Last checked: 2026-09-13
  - Blocker: the 2,783-volume ambiguous backlog needs a real closure plan (batch review, better disambiguation heuristics, or an explicit "acceptable residual ambiguity" call) — not just the regression check staying green.

- [ ] **Core workflow success >= 99%** (signup, search, series, issues, library, variants, wantlist, imports, exports, profiles, subscriptions per the plan's "whole-site polish" pass)
  - Owner:
  - Evidence:
  - Last checked:
  - Blocker: no end-to-end test pass recorded yet

- [ ] **API/server error rate < 1%**
  - Owner:
  - Evidence: **Instrumentation now wired (PR agent/monitoring-setup, 2026-09-12)** — confirmed nothing existed before this (no `@sentry/*` packages, no `instrumentation.js`, no Vercel Analytics/Speed Insights, grep came up empty). Added `@sentry/nextjs` with client (`src/instrumentation-client.js`), server (`src/sentry.server.config.js`), and edge (`src/sentry.edge.config.js`) init, wired through `src/instrumentation.js`'s `register()`/`onRequestError`, and `next.config.mjs` wrapped with `withSentryConfig`. Verified locally: dev server boots and serves normally with no `SENTRY_DSN` set (SDK no-ops safely, confirmed via a deliberate thrown error in a temporary test route — the app kept serving subsequent requests with no crash), and `npm run build` compiles cleanly with the Sentry wrapper (a separate, pre-existing `/opengraph-image` build failure is unrelated — sharp/libvips colourspace error in this sandbox, not caused by this change). This only closes the "is anything wired" half of the gate — the actual **<1% rate** cannot be verified until this runs against real production traffic with a real DSN, which requires founder action (see Blocker).
  - Last checked: 2026-09-12 (instrumentation only — no live error-rate data exists yet)
  - Blocker: **instrumentation ready, not yet live.** Founder still needs to: (1) create a Sentry project at sentry.io, (2) set `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` in `.env.local`, as Vercel project env vars, and as GitHub Actions secrets (see `.env.example`), (3) optionally set `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` for source-map upload, (4) optionally enable Sentry's Vercel integration instead of/in addition to the manual DSN (it can auto-provision the env vars — see PR description). Until a real DSN is set, zero events reach Sentry and the <1% figure remains unverified, not "passing."

- [ ] **Payment lifecycle tests: 100%** (checkout, webhook, portal, cancellation, failed-payment, authorization)
  - Owner:
  - Evidence: `docs/stripe-testing-guide.md` exists as a checklist but has not been re-walked and confirmed complete this pass.
  - Last checked:
  - Blocker:

- [x] **Valuations with source labels: 100%**
  - Owner:
  - Evidence: library page verified 2026-08-03 (`src/app/library/page.js:1740-1766` — asking/sold/cover-price, each with a tooltip). **PDF export fixed 2026-09-13** — it computed `value_source` per item but silently dropped eBay comps from both the cover-page caption and the disclaimer, and rendered `ebay-listed` (asking, unconfirmed) values in solid bold identical to a real sale. Fixed: caption now names every source including eBay asking-vs-sold counts, the disclaimer states eBay comps are current asking prices unless noted otherwise, and asking-price rows now render in italic alongside cover-price estimates. Series/issue pages confirmed to not display market value at all — nothing to label there.
  - Last checked: 2026-09-13
  - Blocker: none — gate met.

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
