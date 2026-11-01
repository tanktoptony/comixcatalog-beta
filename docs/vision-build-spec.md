# ComixCatalog vision build spec (Discogs depth)

**Status:** approved 2026-10-14 (Tony accepted D1 to D5 as written); revised after adversarial review (Codex, 2026-10-14; 21 of 24 findings accepted, see §9). **Mockup:** "ComixCatalog: The Discogs Vision" canvas (5 boards: Your shelf, Issue page, Series run, Creator, Scan to shelf).
**Owner:** Tony. **Builders:** Codex in worktrees; Claude scopes, reviews, merges.

## 0. Goal, non-goals, and the rule

Goal: issue pages read like a Discogs release, creators like a Discogs discography, and a signed-in home page gives collectors a reason to come back every Wednesday. Built on data we own (GCD dump, our collections, our listings), in three releases.

Non-goals: marketplace payments/orders (separate spec, `docs/marketplace-transactions-spec.md`), community data edits, comic ratings, international editions as first-class, issue-page sitemap work (tracked separately; this build changes no indexed URL until that work lands).

**The rule:** a page never shows a number or label we can't back with data. Placeholders in the mockup become real data or are removed. Asking prices are labeled as asking prices.

## 1. Ground truth (verified 2026-10-14)

Production facts below were measured with read-only queries on 2026-10-14; rerun the counts before each gate.

| Mockup element | Current state | Gap |
|---|---|---|
| Issue identifiers | `gcd_issue_details` (0047): on_sale/price/pages/editing. Barcode, isbn, notes, frequency, indicia publisher, variant_name come from **unmerged #300** (`scripts/importGcdDump.js`, migration file `0060_gcd_dump_import.sql`, applied in prod 2026-10-13; main already has a different `0060_sale_transfers.sql`) | Merge #300 safely (§2), complete the import |
| Contents + per-story credits | `gcd_stories`, `issue_creators`, `creators` exist; rich issue page in **unmerged #301** | Merge #301 after the full import |
| Reprinted in | `issue_reprints` from #300; 1,639 rows in prod (test load only) | Full import |
| Key badge | `key_issues` (0026): one issue id + free-text reason/character | Issue-level badge only (§4.1) |
| Editions (direct/newsstand) | Variant issues are separate `gcd_issues` rows (ASM #300: 44451 direct, 1266237 newsstand) but **nothing links variant to base**; #300 does not import `variant_of_id` | Edition ingestion (§3.1) |
| Have / want / for sale | Derivable; `marketplace_listings` view (0031) already applies the public-listing predicate | Precomputed counts with consent rules (§3.2) |
| Values | `auto_market_value` from eBay asking prices; sold API not approved | Label honestly; no low/median/high, no movers |
| Run page | Run completion groups by `series_gcd_id`; series redesign on local branch `feat/series-page-redesign` (push before use) | Run = one GCD series (§4.2) |
| Creator discography | Creator page from `issue_creators`; `series_creators` from #300 (149 rows in prod) | Full import |
| Pull list / new this week | No series follows; new-issue probe reads ComicVine `store_date` but writes only cover data | Release calendar with provenance (§3.3) |
| Scan edition detection | `issue_printings` UPCs attach to a `gcd_issue_id`; `upc_main` strips the supplement and is not unique | Ambiguous matches go to Review (§4.5) |

## 2. Release 0: make the data trustworthy (no new UI)

1. **#300 migration file:** rename to `0060b_gcd_dump_import.sql` with a header "APPLIED IN PROD 2026-10-13. Never re-run. Kept as the record of the schema change." Add a read-only `scripts/checkGcdDumpSchema.sql` that reports whether every column, index, table and constraint from it exists; Tony runs it once and pastes the result into the PR. Do not edit the statements to make them replayable.
2. **Import safety:** the importer deletes each batch's stories/credits/reprints before rewriting them, so a killed run (00:29 on 10-14) can leave issues with no credits until rerun. Before the full run: pause the hourly "GCD issue creator-credit sync" workflow (two writers on the same tables), run the import off-peak as the only bulk job, then resume the workflow. Change the importer so each batch's delete + insert happens in one transaction (an RPC that takes the batch payload) or write-new-then-delete-stale by id, so an interruption never leaves a hole.
3. **Gates, measured not eyeballed:** after the run, counts of `creators`, `series_creators`, `issue_reprints`, `gcd_stories`, `issue_creators` against the dump's US subset (script prints both); zero mirrored US issues with stories in the dump but none in prod; 5 named issues checked live. Record the dump date in a `catalog_imports` row (source, dump_date, finished_at, counts).
4. Merge #300, then #301 once the gate passes.
5. **#317 (search rank)** is independent: its backfill reads reprint counts straight from the dump (`gcd_reprint`), not from `issue_reprints`. Rerun the backfill whenever a new dump is loaded; record the dump date with it.

## 3. Data model

### 3.1 Editions
- Importer phase `editions`: for every mirrored US issue, import `gcd_issue.variant_of_id` and `variant_name` into `gcd_issues.variant_of_gcd_id` and `gcd_issues.variant_name`, plus a materialized `gcd_issues.base_gcd_issue_id` (not null; equals `gcd_id` for bases).
- Resolution rules: follow `variant_of_id` to a row with no parent (cap 5 hops); a cycle or a parent missing from our mirror (foreign or deleted) makes the row its own base and is logged in a `catalog_import_issues` report with the reason. Print coverage counts (bases, variants resolved, orphans, cycles).
- **Policy by table:** `user_collections`, `listings`, `issue_printings`, `market_comps`, canonical covers keep the exact edition id they have (never rewritten). Work-level grouping (run completion, have/want, versions table, key badges) joins through `base_gcd_issue_id`. `key_issues` stays on whatever id it has; display looks it up by base id.
- Existing `user_collections.variant_of_gcd_id` hook stays unused; do not repurpose it.

### 3.2 Counts (have / want / for sale)
- Two tables, never summed together: `issue_base_stats(base_gcd_issue_id pk, have, want, for_sale, updated_at)` and `issue_edition_stats(edition_gcd_issue_id pk, base_gcd_issue_id, have, want, for_sale, updated_at)`.
- **Have** = distinct users with an owned or for_sale row; **want** = distinct users with a wishlist row and no owned row for that base; multiple copies count once.
- **Consent:** have counts only users with `profiles.is_public = true and show_collection is not false`; want additionally needs `show_wantlist is not false`; for_sale counts rows of the `marketplace_listings` view (already public-only). Show counts only when ≥ 3; otherwise show nothing (not "0").
- **Refresh:** no triggers on `user_collections` in this build (hot table, IO risk). A nightly job recomputes all stats with set-based SQL in keyset chunks off-peak; the issue page shows "updated daily". Revisit incremental refresh only if members ask for live counts.

### 3.3 Release calendar (needed before any pull list)
- `release_calendar(id, source, source_issue_id, gcd_issue_id null, release_date, confidence, fetched_at)`: ComicVine `store_date` and GCD `on_sale_date` stored side by side with provenance; resolution to `gcd_issue_id` reuses the new-issue matcher. Monitor coverage for 3 Wednesdays (share of the week's releases with a resolved gcd id) before building the pull list UI. If coverage is under 80%, the pull list does not ship.

**Status (2026-11):** Pull list v1 shipped on the owner's 2026-10-27 approval, ahead of the three-week calendar gate. It lists issues as they land in the catalog from `canonical_covers.in_store_date`; production measurement found about 90% of new releases attached to series already present in the catalog. Exact upcoming days remain out of scope, so upcoming issues are shown by month only.

### 3.4 Values
- Out of this build: value movers, low/median/high, "cost to finish". Shown instead: the existing estimate labeled "Estimated from current asking prices", with the sample size. Revisit when sold comps exist (eBay Marketplace Insights or a licensed source), stored as dated observations by base issue, grade bucket and source.

## 4. Pages

Every page ships branded (dark surfaces, gold accent, display font, cover art prominent, 360px, real empty/loading/error states), with failure-mode tests, lint, `next build`, and screenshots at 1440 and 390.

### 4.1 Issue page (Release 1)
- **URL contract:** `/issue/<base>` is the page. `?edition=<variant>` selects an edition and is a real URL (router navigation, server-rendered for that edition, back button and sharing work). Canonical is always `/issue/<base>` with no query. `/issue/<variant>` 308-redirects to `/issue/<base>?edition=<variant>`, tested for redirect chains. No sitemap change in this build.
- **Caching:** split public catalog data (cached per base issue, invalidated by imports/cover changes/edition changes through `revalidateTag('issue:<base>')`) from viewer state (fetched only when signed in) and stats (daily). Remove the unconditional `cache: "no-store"` refetch on load.
- **Sections:** hero, identifiers (for the selected edition), right rail (estimate labeled as asking prices, counts when ≥ 3, CTAs), Versions table (base + variants with name, on-sale date, price, barcode; reissues listed separately as "Reprinted as" from `issue_reprints`), Contents with per-story credits, Characters as plain text from story data (no per-character "1st appearance" tags), key badge from `key_issues` at issue level only, Reprinted in (US first), For sale (rows from `marketplace_listings`), GCD attribution + "indexed" state.
- **Covers:** the cover follows the edition only when a verified edition cover exists; otherwise the base cover with the edition named in text. Personal photos (`user_cover_url`) never define an edition.

### 4.2 Series run page (Release 2)
- A run is one GCD series. "Other volumes" is a separate list (same normalized title, ordered by `reprint_count`), never part of the completion denominator.
- Your run card: owned of N (by base issue), wanted count. Gaps: count of missing base issues with at least one priced listing in `marketplace_listings`, linking to them. No cost total.
- Issue grid grouped by decade, with collector era names shown as UI labels (documented boundaries, from `key_date` year; issues without a year go in "Undated").

### 4.3 Creator page (Release 2)
- Discography from `series_creators` after the full import; role filter; keys = this creator's issues present in `key_issues`; owned/for-sale per run only for the signed-in viewer. Requires the creator duplicate cleanup and junk-name removal first.

### 4.4 Your shelf home (Release 3, signed-in only)
- Value (labeled estimate) + books/keys/runs complete; Finish a run (runs ≥ 60% complete with at least one listed gap); collector activity (existing feed); pull list only after §3.3's coverage gate.

### 4.5 Scan to shelf (Release 3)
- A full UPC (with supplement) that maps to exactly one accepted printing on one edition auto-selects that edition. A main-code-only match, or more than one candidate, goes to Review with candidates listed. Never auto-label "newsstand".

## 5. Decisions for Tony (answered 2026-10-14: all recommended defaults)
- D1 Values: label "Estimated from current asking prices", hide ranges and movers until sold data exists.
- D2 Edition URLs: `/issue/<base>?edition=<id>`, variants 308 there, canonical = base.
- D3 Counts: consent rules in §3.2, shown only at ≥ 3, updated daily.
- D4 Signed-in home becomes Your shelf in Release 3.
- D5 Pull list ships only after the release calendar hits 80% coverage for 3 straight weeks.

## 6. Disk IO budget (hard constraint)
No page view aggregates `user_collections`, `issue_reprints` or `listings` live; stats are nightly set-based jobs; every new query names its index in the migration; one bulk job at a time, off-peak, concurrency ≤ 2; crawler traffic hits cached public data only. Each PR states queries per page view and indexes used.

## 7. Releases
| Release | Contents | Realistic time (part-time, Codex building) |
|---|---|---|
| 0 | §2: schema check, transactional import fix, full import with gates, merge #300/#301, #317 | 3-5 days, mostly waiting on off-peak runs |
| 1 | Editions ingestion (§3.1) + issue page (§4.1) with versions table, URL contract, caching split | 1.5-2 weeks |
| 2 | Nightly counts (§3.2), run page (§4.2), creator discography (§4.3) | 2 weeks |
| 3 | Release calendar (§3.3, starts monitoring during Release 1), Your shelf (§4.4), scan editions (§4.5) | 2 weeks after the calendar gate |

Total: about 6 weeks for the full vision, Release 1 visible in about 2.5 weeks. Values stay labeled estimates until sold data exists.

## 8. Risks still open
- Edition coverage: GCD variant data for older issues is incomplete; the versions table shows what GCD has and says so.
- Release dates: if ComicVine/GCD lag, the pull list stays off (D5).
- Small community: counts under 3 hide most issues today; that's honest, and the section appears as membership grows.
- Importer change (§2.2) touches a script that already ran once against prod; it gets its own review.

## 9. Adversarial review log (2026-10-14)
Codex reviewed the first draft with read access to the repo and unmerged branches. Accepted: unsafe migration renumbering (handled as a never-re-run record + schema check instead of a reconciliation migration), missing variant ingestion, base-id resolution and per-table policy, contradictory stats key, copy-vs-collector counting, privacy flags, missing release-date source, importer delete-before-insert holes, missing queue design (replaced by nightly set-based jobs), movers and cost-to-finish cut, URL/edition contract, caching vs client no-store refetch, run = one series, UPC ambiguity, edition covers, per-character first-appearance tags, sitemap scope, era labels as UI, measured gates, unrealistic 3-week estimate. Rejected: "#317 depends on the partial reprint import" (its backfill reads the dump directly); "`marketplace_listings` does not exist" (it is the public-listing view in 0031).
