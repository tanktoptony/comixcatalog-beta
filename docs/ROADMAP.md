# ComixCatalog: Roadmap

**Status:** canonical, operational · **Written:** 2026-10-05 from repository state
**No dates.** Part-time solo founder. Order is by dependency and risk. Launch gates live in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md); the remediation program's detail lives in [slop-remediation-spec.md](slop-remediation-spec.md) (WS numbers below refer to it).

## NOW: things that make the current product undependable

1. **Escape listing JSON-LD (S1).** Seller notes go unescaped into a `<script>` on `/listing/[id]`. Stored XSS on any priced listing. Smallest, most urgent fix in the repo.
2. **Finish WS1 security.** Activity feed leaks private collections and wantlists (S3). `POST /api/comics` trusts client `created_by` (S4). Hydrate request size cap (S5a). Catalog-link search builds a filter string from raw input (S5b). Billing columns (0032a/b) already landed.
3. **Library mutations (WS2).** Multi-copy approved: drop the one-row-per-issue index, add one-wishlist-row-per-issue, key mutations by row id, return real errors. Fix the grading trigger's service-role bypass (WS2b).
4. **Schema baseline in the repo (WS0 remainder).** Base tables, RLS policies, triggers and functions captured from catalog queries into `docs/schema/`. Every later migration and audit depends on it.
5. **Stale public copy.** `/upgrade` says "sold listings" (data is asking prices) and lists shipped features as "soon"; `/sell` says seller tools are coming while the marketplace is live.

## NEXT: once NOW is stable

1. **Shared helpers and honest errors (WS3).** One `parseYear`/`bestYearFor`, title normalizer, publisher normalizer, `fetchAllPages`, `getServiceClient()`. Burn the 55 ignored-error sites in `src/` to zero.
2. **One cover resolver (WS4a), then link locks (WS4b).** Ends the cycle where repairs get overwritten by the next ingest. Needs a 5,000-issue parity diff reviewed before merge.
3. **Issue-number parsing and publishers (WS5).** `1/2`, `Annual 1`, `-1` stop collapsing.
4. **CSV round trip (WS6).** Export carries ids; import restores grades and copies.
5. **Speed (WS7).** Measure against the WS0 baseline: p95 ≤ 1.5 s per endpoint, search ≤ 0.8 s.
6. **Marketplace Phase 2.** Server-side messaging with limits, blocks and reports; structured offers. Precondition for any money movement.
7. **Wire the 8 orphaned test scripts into `pr-ci.yml`.**
8. **Google sign-in.** Contained fix for the session race, then re-enable the buttons.

## LATER: larger expansions

- **Marketplace Phases 3 to 5:** server-side browse, Stripe Connect checkout (test mode, flagged), ratings, moderation queue. Blocked on the founder's answers to the v2 brief's §12.
- **Cookie-based auth with `@supabase/ssr`.** Lets server components know the user. Deferred on purpose; don't drop it.
- **Sold-comp valuation.** Switch `EBAY_API` to `insights` if eBay approves; otherwise evaluate other sold sources.
- **Wider GCD refresh.** Grow `refreshGcdIssuesFromApi.js` beyond featured series within GCD's rate limit.
- **Design notes (WS9):** separate wants from owned copies, soft deletes and order lifecycle, variant/printing identity, typed schema, SQL marketplace filtering.
- **Docs cleanup (WS9):** trim CLAUDE.md to current contracts, move incident narratives to `docs/history/`.
- Price alerts, value-aware wantlist, "your movers."

## PARKED

Not worth engineering attention now. Revisit only with a founder decision.

- **Pipeline state out of git (WS8).** Founder said not now (2026-10-05).
- **Forum / community** (`/forum`, `/community/guidelines` placeholders).
- **Crate Dig event page.** Built page is in git history; stub is live.
- **`/access` beta gate.** Nothing enforces it.
- **In-browser SQLite search** (`src/lib/search/*`, `src/lib/db.js`, `public/sqljs`, `wa-sqlite`). Dead; candidate for deletion, not revival.
- **GoCollect valuation.** Dead; `scripts/gocollectProbe.js` is residue.
- **Barcode scanning, Vault tier, Patreon tiers, external data API.**
- **`/status` page.** Hardcoded "operational"; replace or remove.
- **Local `scripts/ingest-loop.ps1`.** Manual extra throughput only; GitHub Actions is the durable ingest.
