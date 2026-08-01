# Data Hardening & Growth — Implementation Spec

**Companion to:** [docs/marketplace-launch-spec.md](./marketplace-launch-spec.md) (collection-side drift), [docs/north-star/NORTH_STAR.md](./north-star/NORTH_STAR.md), and the strategic plan artifact from 2026-08-01 (Revenue / Marketing / Cover-Completion research).
**Status (2026-08-01):** Working spec — the covers requested from a physical back-issue stack this session (Night Thrasher, Thunderstrike, X-Force/Spider-Man Sabotage, a handful of 1993 Superman variant issues) are queued in `gap-manual.json` and will land via the normal cron. This spec is the *next* phase: fix the class of bug that made those gaps possible, then execute the three growth pillars.

---

## 0. Why this spec exists

Today's session hit a live, small-scale instance of the exact problem this doc is about: a quick lookup script queried `canonical_covers` by `series_title` alone and silently summed covers across five *different* GCD series that all happen to be titled "Marvel Comics Presents" (1988, 2007, 2019, plus two undated records) — reporting "175 covers found" for all five, when only one of them actually has any. That's not a one-off script bug. It's the same failure mode already on record in `marketplace-launch-spec.md` §1 ("Multi-volume series ambiguity — Marvel Tales / Witchblade / Thief of Thieves: cover is tagged to a foreign-publisher GCD record") and in the Adventures of Superman #500/#501 1993 variant-cover mismatches surfaced this session. Three symptoms, one root cause: **`canonical_covers` has no reliable structural link to the series/issue it belongs to** — matching happens by text (`series_title`, `issue_number`, loose year tolerance) at read time, in half a dozen different call sites, each with slightly different tolerance logic.

**The fix is architectural, not another patch script.** Move the match from "text lookup at read time, everywhere" to "resolved link at write time, once" — and give every read path a single shared helper instead of six ad-hoc implementations.

### The daily question for this phase

*"Does this change make a cover match its actual issue with certainty, or does it add another place where a fuzzy match can be wrong?"* If a workstream doesn't reduce ambiguity, it doesn't belong in this phase — leave it for the pillar work in §2-§4.

---

## 1. Cover & Catalog Data Hardening

### 1a. Ingestion-time `gcd_issue_id` resolution (the real fix)

**Current reality, verified live (2026-08-01):** `canonical_covers` already has a `series_gcd_id` column — **74,810 of 96,016 rows (78%) have it populated**, via `scripts/backfillCanonicalCoversGcdId.js` (exact-title match → case-insensitive fallback → year±1 disambiguation). That script is real and working, not a stub. What's missing is two things: (1) the remaining 22% of rows, and (2) an **issue-level** link — there is no `gcd_issue_id` column at all today, so even a row with `series_gcd_id` set still requires a text match on `issue_number` to find the specific issue. That gap is exactly how the "Marvel Comics Presents" collision happened this session — a debug script matched on `series_title` alone, ignoring `series_gcd_id` entirely, because *using* the ID column isn't yet the only path through the code.

**Fix:** At ingestion time, after fetching a ComicVine volume's issues, resolve each one against `gcd_issues` **before** writing the cover row:
1. Resolve `series_gcd_id` the same way `backfillCanonicalCoversGcdId.js` already does (reuse that logic, don't reimplement it) — via the volume's ComicVine bridge if `series` carries one, else `(title, year_start_cached, resolved_publisher_cached)` with year tolerance.
2. Once `series_gcd_id` is known, look up the specific `gcd_issues` row by `(series_gcd_id, issue_number)` — normalize `issue_number` the same way `baseIssueNumber()` does, so `"500"` and `"500 [Collector's Set]"` resolve predictably (see 1d for when they should and shouldn't collapse).
3. Add a new `gcd_issue_id` column via migration and write it alongside `series_gcd_id` at ingestion time. Also add `match_confidence TEXT` (`'resolved'` / `'series-only'` / `'title-only'` / `'unresolved'`) so downstream consumers can tell a solid match from a guess — today there's no way to distinguish a confidently-resolved row from a lucky text match.

**Files:** `comicvine_api_to_supabase.py` (ingestion), new migration `scripts/migrations/0018_canonical_covers_issue_link.sql`.

**Acceptance criteria:**
- New ingestion runs write `gcd_issue_id` + `match_confidence` on every row.
- Re-running the ingester against a volume that previously produced a title-only match (spot-check the 5 "Marvel Comics Presents" series records from this session) now resolves each to the correct `gcd_issue_id` with `match_confidence = 'resolved'`.

### 1b. Backfill sweep for existing rows

**Problem:** ~21,200 rows still lack `series_gcd_id`, and all ~96,016 rows lack the new issue-level `gcd_issue_id` regardless of ingestion-date.

**Fix:** Extract the matching logic already proven in `scripts/backfillCanonicalCoversGcdId.js` into a shared module (`src/lib/coverMatch.js`) so the ingester (Python) and any future Node callers don't drift into two different algorithms over time. Extend the backfill script to also populate the new `gcd_issue_id` column for every row (not just the ones missing `series_gcd_id` — even resolved rows need the new issue-level link added). Follow with `scripts/sweepMistaggedPublishers.js --apply` to catch rows that resolve to a *wrong* series (foreign-publisher mistags) rather than *no* series.

**Files:** `scripts/backfillCanonicalCoversGcdId.js`, `scripts/sweepMistaggedPublishers.js`, new `src/lib/coverMatch.js`.

**Acceptance criteria:**
- `series_gcd_id` populated on effectively all rows with a resolvable series (report the residual unresolvable count, don't silently drop it).
- `gcd_issue_id` populated on all rows with a resolvable issue.
- Run `scripts/auditCanonicalCoverAmbiguity.js` (1c) before and after — ambiguous-title count drops to near zero.
- Spot-check the 5 "Marvel Comics Presents" series records from this session now resolve individually instead of sharing one inflated count.

### 1c. Ambiguous-title audit (formalize today's debug script)

**Problem:** No standing tool catches "multiple `series` rows share this exact title" before it causes a silent mismatch. Today's `scripts/lookupSeriesCandidates.js` was a one-off debug script for exactly this, written ad hoc mid-session.

**Fix:** Promote it into a real audit script: `scripts/auditCanonicalCoverAmbiguity.js` — for every distinct `series_title` value in `canonical_covers`, count how many *distinct* `series.id` rows share that exact title. Where count > 1, emit a CSV: `title, series_ids[], years[], publishers[], canonical_covers_row_count, resolved_gcd_issue_id_count`. This becomes the standing regression check — run it in CI-adjacent fashion (weekly, alongside the existing `gap-probe.yml` cadence) so title collisions get caught going forward, not just once.

**Files:** `scripts/auditCanonicalCoverAmbiguity.js` (new, read-only), optionally wire into `.github/workflows/gap-probe.yml` as an additional step that posts a summary rather than failing the build.

**Acceptance criteria:**
- Script runs against full DB in under 2 minutes.
- Output count of ambiguous titles is trending down release over release, not static.

### 1d. GCD bracketed-variant issue-number policy — pick one, document it

**Problem:** GCD represents same-issue variant printings as separate `gcd_issues` rows with a bracketed suffix on `issue_number` (`"500"`, `"500 [Collector's Set]"`, `"501 [Collector's Edition]"`) or, in the Superman #1,000,000 case, an entirely different numbering convention for a crossover tie-in. `baseIssueNumber()` already collapses these for *counting* purposes (issue_count_cached), but it's undocumented whether cover-matching should treat them as the same target issue (one cover serves all variants) or genuinely distinct targets (each variant needs its own cover).

**Fix:** This is a decision, not just code. Recommendation: **treat bracketed variants as distinct ingestion targets but same base issue for display purposes** — i.e., `canonical_covers` can hold multiple rows per base issue number (one per bracket variant), and the read path picks the best available (prefer an exact bracket match, fall back to the base issue's other variant if the specific one is missing) rather than either merging them into one blurry match or treating a missing "[Collector's Set]" cover as "issue #500 has no cover" when a plain "#500" cover exists. Document this policy at the top of `baseIssueNumber()` and `coverMatch.js` so it isn't relitigated per-caller.

**Files:** `baseIssueNumber()` is currently duplicated in `src/app/api/series/[id]/route.js` and `scripts/refreshSeriesSearchCache.js` (verified 2026-08-01 — another small case of the exact problem this doc is about) — consolidate into `src/lib/coverMatch.js` (new, shared) as part of this workstream.

**Acceptance criteria:**
- Adventures of Superman #500 and its variants each resolve predictably (documented behavior, not accidental).
- A code comment at the decision point explains the *why*, per this repo's own commenting convention.

### 1e. Read-path consolidation

**Problem:** CLAUDE.md already lists at least four call sites with independently-implemented cover lookup: `library-hydrate`, `public-profile`, the issues API, and the PDF export route ("two-path canonical cover lookup (id+title) and cover-price floor fallback"). Each is a chance for the tolerance logic to drift out of sync — which is exactly how the original bugs got in.

**Fix:** Extract `src/lib/coverMatch.js` — one function, `resolveCoverForIssue(gcdIssueId, { titleFallback })`, ID-path first (now reliable per 1a/1b), fuzzy title+year+publisher fallback only when no ID link exists yet, matching `match_confidence`. All four call sites (and `/api/series/[id]`'s year-span-tolerance matcher) import this instead of reimplementing it.

**Files:** `src/lib/coverMatch.js` (new), `src/app/api/library-hydrate/route.js`, `src/app/api/public-profile/route.js`, `src/app/api/export/pdf/route.js`, `src/app/api/series/[id]/route.js`, `src/app/api/issues/[id]/route.js`.

**Acceptance criteria:**
- All five call sites import the shared helper; no inline duplicate matching logic remains.
- Existing behavior doesn't regress — run against the same 5 test series from 1b before/after and diff the output.

---

## 2. Revenue Pillar — implementation workstreams

*(Strategy already set in the 2026-08-01 plan artifact; this section makes it engineering-concrete. Sequence after §1 lands — billing correctness doesn't depend on cover correctness, so these two tracks can actually run in parallel if resourced separately.)*

### 2a. Billing observability
Wire Sentry (`npm install @sentry/nextjs`, `npx @sentry/wizard`) to both client and server. Alert thresholds: any 5xx on `/api/stripe/*` immediately, any webhook signature failure immediately, new error fingerprint daily digest. This is the one workstream in this whole doc with a "just do it, no design decision needed" character — highest leverage, lowest risk.

### 2b. Funnel analytics
GA4 (`G-91D5RJ0JN1`) is now wired for pageviews as of this session (`src/app/layout.js`). Extend with real funnel events — `signup_completed`, `first_collection_add`, `first_grade_set`, `pdf_export`, `pro_upgrade` — fired from the relevant route handlers/client components via `gtag('event', ...)`. Without this, every recommendation in §2c-§2e is a guess.

### 2c. Patreon → Stripe consolidation
Audit current Patreon subscriber list, draft the grandfathered-price migration email, build a one-time admin script to bulk-set `is_founding_collector`/`is_pro` for migrated users. This one has a real customer-communication component — flag for founder review before executing, not a pure Codex task.

### 2d. À la carte PDF ($5) + Verified Collector badge ($10)
Both reuse existing pipelines (`/api/export/pdf`, Stripe one-time Checkout mode instead of subscription mode). New price IDs in Stripe dashboard (manual, not code), new `POST /api/stripe/checkout-onetime` route or a mode param on the existing route, gate check updated to accept "purchased this report" as an alternative to `isPro`.

### 2e. Founding Collector fee-lock-in cap
Decide the actual cap (percentage discount vs. volume cap vs. time-boxed) — founder decision, not an engineering one. Once decided, encode as a constant/config the eventual Stripe Connect fee-calculation logic reads from (§3c of `marketplace-launch-spec.md`), so it's not re-litigated when marketplace fees actually get built.

---

## 3. Marketing Pillar — implementation workstreams

*(Community/outreach items from the growth research — CGC Forums presence, Facebook groups, Discord seeding, C2E2 — are founder-personal-action items, not engineering work. Not included here; keep them on a separate personal checklist. What follows is the code/content side only.)*

### 3a. Programmatic SEO foundation
Already scoped in detail in `docs/marketplace-launch-spec.md` §5b (per-page `generateMetadata`, sitemap expansion, JSON-LD). Execute that section now rather than waiting for marketplace launch — the SEO value doesn't depend on the marketplace existing. Depends on §1 of this doc: a JSON-LD `Product` schema with a wrong cover image is worse than none.

### 3b. "What's my collection worth" hook page
A standalone, shareable landing page (`/worth` or similar) that walks an anonymous visitor through adding a few issues and seeing an estimated value, funneling into signup. Reuses `getMarketValuesBulk` and the existing add-to-collection flow; new lightweight anonymous-session handling (localStorage draft collection before signup gate).

### 3c. "Most Valuable This Month" recurring content
Auto-generated from `market_comps` — a scheduled script (weekly or monthly GHA workflow, same pattern as `weekly-refresh.yml`) that queries the top N price movers and writes a draft blog post via the existing `blog` content table, for the founder to review and publish rather than auto-publishing untouched.

---

## 4. Cover-Completion Pillar — implementation workstreams

*(Depends on §1 — do not build UGC upload on top of unreliable matching, or user-submitted covers inherit the same ambiguity problem instead of fixing it.)*

### 4a. Minimal UGC cover upload
- Migration: add `gcd_issue_id UUID` (nullable) to `comic_covers`, mirroring the `comic_id`/`gcd_issue_id` either-or pattern already used in `user_collections`.
- Upload affordance on any issue-detail page where `resolveCoverForIssue()` (from §1e) returns no match.
- Promotion rule: N independent user uploads agreeing (perceptual-hash or simple manual-review queue for a solo founder's actual moderation capacity) promotes into `canonical_covers` with `source = 'ugc'`, `match_confidence = 'resolved'` (it's now ID-linked by construction, unlike the legacy title-only rows).

### 4b. Depth-first targeting
Extend `scripts/importComichronTop100.js` beyond its current 79-entry homepage-carousel use case to drive `gap-width.json`/`gap-depth.json` generation for the top 5,000-10,000 series by Comichron sales rank, rather than the current broader/shallower default.

### 4c. Quick fix: `scripts/ingestStatus.js`
The count-query bug found during the growth research (`count: "exact", head: true` returning null/0, producing a nonsense "246900%" readout) — this is genuinely a 10-minute fix and restores the only monitoring visibility into ingestion coverage. Do this first, trivially, regardless of sequencing above.

### 4d. Contributor recognition
Wire the "Database Contributors leaderboard" that currently exists only as a footer link with no backing query — a simple ranked view over `comic_covers.uploaded_by` counts (once 4a ships) is enough for v1; no need for the full NORTH_STAR-aspirational forum/groups infrastructure around it yet.

---

## 5. Sequencing

```
Immediate, no dependency:
  §4c  ingestStatus.js fix (10 min)
  §2a  Sentry wiring
  §2b  GA funnel events

Phase 1 — Data hardening (do this before UGC or SEO structured data):
  §1a → §1b → §1c → §1d → §1e

Phase 2 — parallel tracks once §1 lands:
  Revenue:   §2c → §2d → §2e
  Marketing: §3a → §3b → §3c
  Data:      §4a → §4b → §4d
```

Community/outreach (CGC Forums, Facebook groups, Discord, C2E2 or its nearest current equivalent) runs in parallel the whole time — it's the founder's own time, not engineering capacity, and doesn't block or get blocked by anything above.

---

## Out of scope for this phase

- Stripe Connect / marketplace mechanics — still correctly sequenced per `marketplace-launch-spec.md`, months out, not pulled forward.
- True variant *identity* schema (`variant_of_gcd_id` linking) — still blocked on a real variant data source per migration 0010's own comment; §1d's bracket-handling is a matching-policy fix, not a full variant schema.
- Multi-source pricing ladder (Heritage, MyComicShop) — still gated on eBay Insights approval status per the existing spec.
