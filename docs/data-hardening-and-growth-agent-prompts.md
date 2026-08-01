# Data Hardening & Growth — Agent Prompts

Companion to `docs/data-hardening-and-growth-spec.md`. Each prompt below is **self-contained** — copy-paste any one into a fresh agent session (Claude Code or Codex) and it has everything needed. Agents are not assumed to have any session history.

**Shared preamble for every prompt** (paste at the top of every session):

> You're working on **ComixCatalog**, a Next.js + Supabase "Discogs for comics" platform. Read `CLAUDE.md` at the repo root first — schema notes, domain vocabulary, engineering reminders, and known data quirks. Then read `docs/data-hardening-and-growth-spec.md` for the broader plan; you're owning one section of that. If your section touches cover/catalog matching, also skim `docs/marketplace-launch-spec.md` §1 — it's the companion problem on the collection side.
>
> Tech stack: Next.js App Router, Supabase (Postgres), Stripe, Python ingestion scripts, Node scripts in `scripts/`. Tailwind for styling. Use the existing dark-navy/gold theme (`src/app/globals.css`).
>
> **Hard rules from CLAUDE.md, don't relearn these the expensive way:**
> - Any Supabase `.select()`/`.in()` that might exceed 1000 rows needs `.range()` pagination in a loop — PostgREST silently caps at 1000.
> - `runWithRetry()` returns `data` directly, not `{data, error}`.
> - `gcd_issue_id` is an integer — coerce explicitly, never rely on implicit casting.
> - Year handling: use `bestYearFor(row)` (publication_date → key_date fallback), never raw `parseYear(publication_date)`.
> - Publisher resolution: prefer `series.resolved_publisher_cached` over re-running `resolvePublisher()`.
> - New Node scripts go in `scripts/`. Python stays for the ingestion pipeline only.
> - `.env.local` holds secrets — never commit it, never print its contents.
>
> When done: run `git status` and `git diff` yourself and verify the change actually does what you claim before reporting done. Commit with a clear message (`area: change summary`) and push to `main`, unless the prompt says otherwise (some workstreams below explicitly require human review before merge — check the "Human review required" flag at the top of each prompt).

---

## §1a — Ingestion-Time `gcd_issue_id` Resolution

> **Human review required before merge: NO** (read-mostly change to ingestion path, additive columns, safe to ship and iterate)
>
> **Goal:** Stop `canonical_covers` rows from being written as pure text matches. Resolve `series_gcd_id` and a new `gcd_issue_id` at ingestion time, before the row is written, using the same logic already proven correct in `scripts/backfillCanonicalCoversGcdId.js`.
>
> **Verified starting state (2026-08-01, re-check before trusting these numbers if it's been a while):** `canonical_covers` has 96,016 rows; 74,810 already have `series_gcd_id` populated via the existing backfill script. Zero rows have an issue-level link — that column doesn't exist yet.
>
> **Steps:**
> 1. Read `scripts/backfillCanonicalCoversGcdId.js` in full — its series-resolution algorithm (exact title → case-insensitive → year±1 disambiguation) is the one to reuse, not reinvent.
> 2. Create `scripts/migrations/0018_canonical_covers_issue_link.sql`:
>    ```sql
>    ALTER TABLE canonical_covers
>      ADD COLUMN gcd_issue_id INTEGER,
>      ADD COLUMN match_confidence TEXT DEFAULT 'unresolved';
>    CREATE INDEX idx_canonical_covers_gcd_issue ON canonical_covers(gcd_issue_id);
>    ```
> 3. Extract the series-resolution logic from `backfillCanonicalCoversGcdId.js` into `src/lib/coverMatch.js` as an exported function (e.g. `resolveSeriesGcdId({ title, year, publisher })`). Keep the original script working by having it import from the new module — don't leave two copies of the same logic.
> 4. Add issue-level resolution to the same module: `resolveGcdIssueId({ seriesGcdId, issueNumber })` — looks up `gcd_issues` by `(series_gcd_id, issue_number)`, normalizing `issue_number` the same way `baseIssueNumber()` does (find that helper — likely in `src/lib/valuation.js` or similar; grep for it). Return both the resolved ID and a confidence tier (`'resolved'` if both series and issue matched cleanly, `'series-only'` if series matched but issue didn't, `'unresolved'` if neither did).
> 5. Wire this into `comicvine_api_to_supabase.py`'s write path — after fetching each issue from ComicVine, call out to the resolution logic (either via a small Node subprocess call, or reimplement the same algorithm in Python — your call, but if you reimplement in Python, add a comment cross-referencing `src/lib/coverMatch.js` so the two don't silently diverge later, and ideally add a test fixture both implementations must pass).
> 6. Write `series_gcd_id`, `gcd_issue_id`, and `match_confidence` on every new row.
>
> **Acceptance criteria:**
> - `python comicvine_api_to_supabase.py --targets <a small test target file covering "Marvel Comics Presents", "X-Force", "Nova"> --dry-run` (or equivalent non-destructive mode — check the script's existing flags) shows resolved IDs in its output, not just text fields.
> - A real (non-dry-run) test ingestion against one of those three volumes produces rows with `match_confidence = 'resolved'`.
> - No regression in ingestion throughput — this must not meaningfully slow down the 6-hourly cron given its `--max-search-calls 180` budget.

---

## §1b — Backfill Sweep

> **Human review required before merge: NO** for the script; **YES** before running `--apply` against production data at scale (dry-run first, review the plan, then apply)
>
> **Goal:** Bring existing `canonical_covers` rows up to the same standard as new ones — populate `gcd_issue_id` (new column from §1a) on all resolvable rows, finish the remaining ~22% of `series_gcd_id` gaps, and fix wrong-series mistags.
>
> **Prereq:** §1a must be merged (needs the `gcd_issue_id` column and `src/lib/coverMatch.js`).
>
> **Steps:**
> 1. Extend `scripts/backfillCanonicalCoversGcdId.js` to also populate `gcd_issue_id` for every row (not just ones missing `series_gcd_id`) — reuse `resolveGcdIssueId()` from `src/lib/coverMatch.js`.
> 2. Run dry-run first, review the stats output (matched / ambiguous / no-match counts).
> 3. Run `--apply`.
> 4. Run `scripts/sweepMistaggedPublishers.js --apply` afterward to catch wrong-series mistags (different failure mode than "no match" — this is "matched, but to the wrong series").
>
> **Acceptance criteria:**
> - Report before/after counts: rows with `series_gcd_id` set, rows with `gcd_issue_id` set, rows still unresolved (with a sample of unresolved titles for human review — some will be genuinely unresolvable, e.g. foreign reprints with no US GCD counterpart, and that's fine).
> - Spot-check: query `canonical_covers` for `series_title = 'Marvel Comics Presents'` — confirm rows now split correctly across the 5 distinct `series_gcd_id` values (3654, 26502, 137838, 183825, 184607) instead of being ambiguous.

---

## §1c — Ambiguous-Title Audit Script

> **Human review required before merge: NO** (read-only script, no DB writes)
>
> **Goal:** Promote today's throwaway debug script into a permanent, reusable audit tool that catches title collisions before they cause a silent mismatch again.
>
> **Steps:**
> 1. Create `scripts/auditCanonicalCoverAmbiguity.js` (Node ESM, follow the style of `scripts/findUncoveredSeries.js` for connection setup and pagination).
> 2. For every distinct `series_title` in `canonical_covers`, count distinct `series.id` values that share that exact title (join via a title lookup against `series`, not just counting within `canonical_covers` itself).
> 3. Where the count > 1, emit a CSV row: `title, series_ids (semicolon-joined), years (semicolon-joined), publishers (semicolon-joined), canonical_covers_row_count, resolved_gcd_issue_id_count, unresolved_count`.
> 4. Print a summary: total ambiguous titles, total affected `canonical_covers` rows, top 10 worst offenders by row count.
> 5. Optionally (not required for v1) wire this as an extra step in `.github/workflows/gap-probe.yml` that posts the summary as a log line — do NOT fail the build on ambiguity found, this is a monitoring signal, not a hard gate.
>
> **Acceptance criteria:**
> - Runs against the full DB in under 2 minutes.
> - Correctly flags "Marvel Comics Presents" (5 distinct series sharing the title) as a top offender when run before §1b's backfill, and shows it resolved (or at least no longer ambiguous in `canonical_covers` row terms) after.

---

## §1d — Bracketed-Variant Issue-Number Policy

> **Human review required before merge: YES** — this is a product/data-modeling decision with a recommended default, not a mechanical fix. Implement the recommendation but flag it clearly in the PR/commit for founder sign-off.
>
> **Goal:** Decide and document how GCD's bracketed issue-number variants (`"500"` vs `"500 [Collector's Set]"`, and the Superman `"1,000,000"` tie-in case) should resolve for cover-matching purposes, then implement that decision consistently.
>
> **Recommended default (from the spec, confirm or override with founder before implementing if you disagree):** Bracketed variants are distinct ingestion/cover targets, but share a base issue for display fallback — if a specific bracket variant has no cover but the base issue number does, show the base issue's cover with a note that it may not be the exact variant, rather than showing nothing.
>
> **Steps:**
> 1. `baseIssueNumber()` is currently duplicated in two places — `src/app/api/series/[id]/route.js` and `scripts/refreshSeriesSearchCache.js` (verified 2026-08-01; another small instance of the exact "same logic reimplemented per call site" problem this whole spec is about). Read both, confirm they're actually identical or note if they've drifted, and extract to one shared home — `src/lib/coverMatch.js` is a reasonable place since bracket-handling is fundamentally a matching concern, though `src/lib/valuation.js` is also defensible if that's more consistent with existing import patterns; pick one, update both call sites to import it.
> 2. In `src/lib/coverMatch.js`, implement the fallback chain: exact issue_number match → same base issue number, any bracket variant → no match. Return which tier hit, so the UI can (later, optional) show "showing a variant cover" messaging.
> 3. Add a code comment at the decision point explaining the policy and why (per this repo's own "comment on non-obvious WHY" convention) — link to this document.
> 4. Test against the real case from this session: Adventures of Superman #500 (multiple 1993 bracket variants) — confirm the resolution behaves per the documented policy, not accidentally.
>
> **Acceptance criteria:**
> - Documented policy exists in code, not just this spec.
> - Adventures of Superman #500/#501 variant issues resolve predictably per the policy when tested manually.

---

## §1e — Read-Path Consolidation

> **Human review required before merge: NO**, but test thoroughly — this touches five live API routes.
>
> **Goal:** Every cover-lookup call site uses the same shared matcher (`src/lib/coverMatch.js`, built out across §1a-§1d) instead of five independently-drifting implementations.
>
> **Prereq:** §1a and §1d should be merged first (need the shared module and its bracket-handling policy in place).
>
> **Files to touch:** `src/app/api/library-hydrate/route.js`, `src/app/api/public-profile/route.js`, `src/app/api/export/pdf/route.js`, `src/app/api/series/[id]/route.js`, `src/app/api/issues/[id]/route.js` — grep each for its current cover-lookup logic first, understand what it does today before replacing it.
>
> **Steps:**
> 1. Add a top-level export to `src/lib/coverMatch.js`: `resolveCoverForIssue({ gcdIssueId, seriesTitle, issueNumber, seriesYear, publisher })` — ID-path first (using `gcd_issue_id` now that §1a/§1b populate it), fuzzy title+year+publisher fallback only when no ID link exists, returns `{ storagePath, matchConfidence }`.
> 2. Replace each of the five call sites' inline matching logic with a call to this function. Preserve existing behavior for the happy path — this is a refactor for correctness/consistency, not a feature change, so don't introduce new UI-visible behavior in this pass.
> 3. Run the app locally (`npm run dev`) and manually verify: a known-good series (e.g. Uncanny X-Men) still shows covers correctly on `/series/[id]`, `/issue/[id]`, `/library`, `/u/[username]`, and in a PDF export.
>
> **Acceptance criteria:**
> - No inline duplicate cover-matching logic remains in any of the five files — all delegate to `coverMatch.js`.
> - Manual smoke test across all five surfaces shows no regression.
> - Bonus: the "Marvel Comics Presents" (and other historically ambiguous titles) now render correctly in the UI, not just in script output.

---

## §2a — Billing Observability (Sentry)

> **Human review required before merge: NO**
>
> **Goal:** Wire Sentry to catch silent billing failures — this is flagged as the single highest-priority item across the whole growth plan.
>
> **Steps:**
> 1. `npm install @sentry/nextjs`, run `npx @sentry/wizard@latest -i nextjs` (creates config files, modifies `next.config.mjs` — review the diff, don't blindly accept everything the wizard changes if it conflicts with existing config).
> 2. Add `SENTRY_DSN` to `.env.local` (you'll need the founder to provide the actual DSN from their Sentry account — if you don't have one, stop here and ask rather than inventing a placeholder that looks real).
> 3. Configure alert-worthy filters: any 5xx from `/api/stripe/*` routes, any webhook signature verification failure, any unhandled error in `/api/library-hydrate` or `/api/public-profile` (the highest-traffic routes).
> 4. Do NOT scrub this blind — verify no PII (emails, auth tokens, Stripe customer IDs) leaks into error payloads. Check Sentry's default `beforeSend` scrubbing is adequate or add explicit scrubbing.
>
> **Acceptance criteria:**
> - A deliberately triggered test error (e.g., a temporary throw in a dev-only code path, removed before commit) shows up in Sentry within a minute.
> - No secrets/PII visible in the captured error payload.

---

## §2b — Funnel Analytics Events

> **Human review required before merge: NO**
>
> **Goal:** GA4 pageview tracking is live (`G-91D5RJ0JN1`, wired in `src/app/layout.js` as of 2026-08-01). Add real funnel events so revenue/growth decisions stop being guesses.
>
> **Steps:**
> 1. Add a small helper, `src/lib/analytics.js`: `trackEvent(name, params)` that calls `window.gtag('event', name, params)` if `gtag` exists (guard for SSR / gtag not loaded).
> 2. Fire these events from the right call sites:
>    - `signup_completed` — in the signup success handler
>    - `first_collection_add` — in the add-to-collection flow, but ONLY the first time for a given user (check if this needs a client-side or server-side "is this their first" check — probably simplest as fire-and-forget on every add, tagged with a count, and let GA4's funnel exploration handle "first occurrence" — don't over-engineer a server-side dedup for this)
>    - `first_grade_set` — GradeEditor save handler
>    - `pdf_export` — PDF export success
>    - `pro_upgrade` — Stripe checkout success redirect handler
> 3. Verify each fires correctly using GA4 DebugView (requires `gtag('config', GA_ID, { debug_mode: true })` temporarily, or the GA Debugger browser extension) before considering this done — don't just assume the code is right.
>
> **Acceptance criteria:**
> - All 5 events visible in GA4 Realtime/DebugView when manually triggering each flow locally against a production build (`npm run build && npm run start`, same as the GA smoke-test pattern already established).

---

## §2d — À La Carte PDF ($5) + Verified Collector Badge ($10)

> **Human review required before merge: YES for going live with real charges** — code and test in Stripe test mode freely; flip to live prices only after founder confirms the price IDs.
>
> **Goal:** Two small one-time-purchase products that reuse existing pipelines, for users who won't commit to a monthly subscription.
>
> **Steps:**
> 1. Founder creates two one-time Price objects in the Stripe dashboard (test mode first) — $5 PDF report, $10 Verified Collector badge. You need the resulting `price_...` IDs; don't invent placeholders, ask if they're not provided.
> 2. Add a `mode` param (or a new route, your call) to the checkout flow supporting Stripe Checkout `mode: "payment"` (one-time) alongside the existing `mode: "subscription"` path in `src/app/api/stripe/checkout/route.js`.
> 3. PDF report: on successful one-time payment, gate a single `/api/export/pdf` call rather than the ongoing `isPro` flag — e.g. a short-lived signed token or a `one_time_purchases` table row consumed on use.
> 4. Verified Collector badge: on successful payment, prompt for a CGC/CBCS cert number, verify against the public cert-lookup pages (`https://www.cgccomics.com/certlookup/<cert>/`, `https://www.cbcscomics.com/certification/<cert>/` — per the existing marketplace-launch-agent-prompts.md §4b spec if that workstream hasn't been built yet, reuse its plan rather than redesigning), stamp `verified_grade_at` on the matching `user_collections` row only if the parsed grade matches.
>
> **Acceptance criteria:**
> - Both flows complete end-to-end in Stripe test mode with test cards.
> - PDF one-time purchase doesn't grant ongoing Pro access — it's scoped to the single report.
> - Badge verification correctly rejects a cert/grade mismatch without charging (or refunds immediately if charge-then-verify is the chosen order — pick one and be consistent, don't leave users charged for a failed verification).

---

## §3a — Programmatic SEO Foundation

> **Human review required before merge: NO** for metadata/sitemap code; this section already has a detailed spec in `docs/marketplace-launch-spec.md` §5b — read that section in full, it's the actual source of truth for this workstream, treat this prompt as a pointer to it.
>
> **Goal:** Execute `docs/marketplace-launch-spec.md` §5b now rather than waiting for marketplace launch. Per-page metadata, sitemap expansion, JSON-LD.
>
> **Prereq — important:** Read `docs/data-hardening-and-growth-spec.md` §1 first. Do not ship JSON-LD `Product` schema with cover images until §1's matching fixes have landed, or you'll be telling Google (and every social-share preview) about wrong covers at scale, which is worse than not having structured data at all.
>
> **Steps:** Follow `docs/marketplace-launch-spec.md` §5b exactly — `generateMetadata` on `/series/[id]`, `/issue/[id]`, `/u/[username]`; sitemap expansion in `app/sitemap.js` (already exists per the route inventory — extend it, don't replace it wholesale, check what it currently covers first); JSON-LD `Product` schema on issue pages.
>
> **Acceptance criteria:** As stated in the original spec section — Lighthouse SEO > 95 on the three core templates, sitemap validates, first indexing within 2 weeks (that last one isn't verifiable same-day, just confirm the sitemap is correctly submitted to Search Console).

---

## §3b — "What's My Collection Worth" Hook Page

> **Human review required before merge: YES** — new user-facing funnel/landing page, founder should see it before it goes live.
>
> **Goal:** A shareable, low-friction landing page that lets an anonymous visitor add a few comics and see an estimated value, funneling into signup.
>
> **Steps:**
> 1. New route `src/app/worth/page.js` (or similar — confirm the path doesn't collide with anything existing).
> 2. Lightweight anonymous flow: let the visitor search and "add" 3-5 comics using localStorage (no auth required), show a running estimated total using the existing `getMarketValuesBulk` logic, then gate further action ("save your collection," "get the full PDF report") behind signup.
> 3. On signup, migrate the localStorage draft into real `user_collections` rows for the new user.
> 4. Make this genuinely shareable — OG image/metadata that shows something compelling (not a generic site preview).
>
> **Acceptance criteria:**
> - A logged-out visitor can add comics and see a value estimate with zero friction.
> - Signing up preserves what they added rather than losing it.
> - Manually verify the OG preview renders well when the URL is pasted into Discord/Slack/iMessage.

---

## §3c — "Most Valuable This Month" Recurring Content

> **Human review required before merge: YES for the workflow's output** — auto-drafted content should never auto-publish without founder review.
>
> **Goal:** A scheduled job that drafts a recurring blog post from real `market_comps` data, for the founder to review and publish — not auto-publish.
>
> **Steps:**
> 1. New script `scripts/generateMonthlyValueRecap.js` — queries `market_comps` for the largest month-over-month median price movements (needs at least 2 data points across time per issue/grade-bucket to compute movement). `market_comps` has 6,054 rows as of 2026-08-01 (no longer empty, contra CLAUDE.md's stale "currently empty" note) — but check the actual `sold_date` spread before trusting it has enough *time-series* depth per issue for a real month-over-month comparison; if most rows cluster in a narrow date range, note that as a blocker rather than shipping a recap with thin/misleading signal.
> 2. Writes a draft row into whatever table backs `/blog` (check `src/app/blog/create/page.js` or the blog API route for the actual schema) with `status = 'draft'` — confirm the blog system actually has a draft/unpublished state; if it doesn't, add one rather than writing directly to a published state.
> 3. New GHA workflow `.github/workflows/monthly-value-recap.yml`, monthly schedule, same pattern as `weekly-refresh.yml`.
>
> **Acceptance criteria:**
> - Running the script produces a sensible draft post (spot-check the content makes sense, not just that it runs without erroring).
> - Nothing publishes without a human clicking publish.

---

## §4a — Minimal UGC Cover Upload

> **Human review required before merge: YES** — new user-facing upload surface, moderation/promotion policy should get a sanity check from the founder before going live.
>
> **Prereq:** §1 (all of it) should be substantially done first — building UGC upload on top of unreliable matching means user-submitted covers inherit the same ambiguity problem instead of avoiding it.
>
> **Goal:** Let users upload a cover photo for issues that don't have one, with automatic promotion to canonical status once enough independent uploads agree — no manual moderation queue required for a solo founder's actual capacity.
>
> **Steps:**
> 1. Migration `scripts/migrations/0019_comic_covers_gcd_link.sql`: add `gcd_issue_id INTEGER` (nullable) to `comic_covers`, mirroring the `comic_id`/`gcd_issue_id` either-or pattern already used in `user_collections`.
> 2. On issue-detail pages (`/issue/[id]`), when `resolveCoverForIssue()` (from §1e) returns no match, show an upload affordance.
> 3. Upload endpoint: store the image in the `comic-covers` bucket, insert a `comic_covers` row with `gcd_issue_id` set, `is_official = false`.
> 4. Promotion rule: when N (start with N=3, make it a named constant so it's easy to tune) distinct users have uploaded for the same `gcd_issue_id` and the images are reasonably consistent (start simple — just count-based promotion for v1, perceptual-hash similarity comparison is a nice-to-have not a blocker), promote the earliest/best one into `canonical_covers` with `source = 'ugc'`, `match_confidence = 'resolved'` (it's ID-linked by construction).
> 5. Basic abuse guard: rate-limit uploads per user per day, obvious-not-a-comic-cover rejection is out of scope for v1 (no image classification) — rely on the multi-user-agreement promotion rule as the quality gate instead.
>
> **Acceptance criteria:**
> - A logged-in user can upload a cover on a coverless issue page.
> - 3 different test accounts uploading for the same issue triggers promotion to `canonical_covers`.
> - A single bad-faith upload alone does NOT get promoted.

---

## §4b — Depth-First Cover Targeting

> **Human review required before merge: NO**
>
> **Goal:** Redirect cover-ingestion effort toward the series collectors actually search for and transact on, not a flat/random walk across all 217k series.
>
> **Steps:**
> 1. Read `scripts/importComichronTop100.js` in full — understand its current scope (currently only feeds the ~79-entry homepage carousel per `src/lib/featuredSeries.js`).
> 2. Extend it (or add a sibling script) to pull a larger ranked list — top 5,000-10,000 series by Comichron sales rank — and feed that into `gap-width.json`/`gap-depth.json` generation (`scripts/generateCoverGapTargets.js`) instead of, or in addition to, its current broader/shallower default targeting.
> 3. Don't break the existing 79-entry featured-carousel use case — this should be additive.
>
> **Acceptance criteria:**
> - `gap-width.json`/`gap-depth.json` generation, when run with the new top-N mode, produces a target list weighted toward high-sales-rank series rather than an unweighted sample.

---

## §4c — Fix `scripts/ingestStatus.js`

> **Human review required before merge: NO** — trivial, low-risk.
>
> **Goal:** Fix the broken count query so there's actual monitoring visibility into ingestion coverage again.
>
> **Steps:**
> 1. Find the `count: "exact", head: true` Supabase query/queries in `scripts/ingestStatus.js` that are returning null/0 (producing the nonsensical "246900%" output found during growth research).
> 2. Debug why — likely a missing `await`, a misplaced `.head(true)` call order, or querying the wrong table/filter combination. Test against the live DB to confirm the fix produces sane numbers (single digit to low-double-digit percentages, not six figures).
>
> **Acceptance criteria:**
> - Running the script produces believable, sane coverage percentages.

---

## §4d — Contributor Recognition

> **Human review required before merge: NO**
>
> **Prereq:** §4a should be live first — no uploads means no leaderboard to show.
>
> **Goal:** Wire the "Database Contributors leaderboard" concept from NORTH_STAR.md into something real.
>
> **Steps:**
> 1. The footer's "Contributor List" link (`src/components/Footer.js`) currently points at `/collectors` — check what that route (`src/app/collectors/page.js`) actually renders today before assuming it's empty; it may already be a basic public-profile directory that just needs a ranking/count added, rather than a page built from scratch.
> 2. Add (or extend) a ranked view: count of accepted `comic_covers` uploads per `uploaded_by`, joined to `profiles` for username/avatar. A basic sortable section on the existing `/collectors` page is sufficient for v1 — no need for time-windowing (monthly leaderboard) or badges yet, that's NORTH_STAR-aspirational scope for later.
>
> **Acceptance criteria:**
> - `/collectors` shows real contributor counts once §4a has any uploads to count, not a 404 or empty stub.

---

## Note: what's deliberately NOT a prompt here

§2c (Patreon → Stripe consolidation) and §2e (Founding Collector fee-lock-in cap) from the spec have no prompt above on purpose. Both require a founder decision or founder-to-customer communication before any code gets written — §2c involves migrating real paying subscribers and needs an actual message drafted and sent, §2e requires deciding the cap mechanism itself. Once those decisions are made, they become short, mechanical follow-up prompts; write those then, not now.

---

## Working with these prompts

- **One agent per prompt.** Different shapes, different scopes — don't paste two into one session.
- **Respect the sequencing in `docs/data-hardening-and-growth-spec.md` §5.** Several of these explicitly depend on earlier ones landing first (most importantly: all of §1 before §3a's JSON-LD work and before §4a's UGC upload).
- **Respect the "Human review required" flags.** Several of these touch money, user-facing surfaces, or founder judgment calls (Founding Collector fee cap, bracket-variant policy, published content) — implement but don't auto-merge/auto-publish those without the founder actually looking.
- **Verify before declaring done.** Check the actual diff and run the acceptance criteria yourself — don't just report "should work."
- **If an agent gets stuck mid-prompt**, fork to a follow-up prompt describing the specific blocker rather than restarting from scratch.
