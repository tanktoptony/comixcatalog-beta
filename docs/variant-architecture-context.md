# Variant Covers & Collected Editions — Planning Context

**Status (2026-08-05):** Research/context document, NOT a finished implementation plan. This is the briefing for an upcoming planning session with another agent — it exists to make sure that session starts from verified ground truth instead of re-deriving it. Expect the planning session to produce the actual spec (workstreams, sequencing, acceptance criteria), following the pattern already established in `docs/data-hardening-and-growth-spec.md` + `docs/data-hardening-and-growth-agent-prompts.md`.

**Read first:** `docs/data-hardening-and-growth-spec.md` §1d ("GCD bracketed-variant issue-number policy") is a narrower, already-scoped precursor to this problem — it decided how bracket-suffix issue numbers should resolve for *cover matching*. This document is the fuller problem: a real user-facing variant *picker* UI, plus a second, structurally identical problem (collected editions modeled as pseudo-series) discovered the same night. Also read `CLAUDE.md`'s "Two parallel 'series' tables" and `canonical_covers` schema sections, and `docs/north-star/NORTH_STAR.md` if the "Discogs for comics" framing needs restating.

---

## 0. Why this exists

Two problems surfaced in the same session (2026-08-04/05), while chasing the priority-cover-coverage launch gate, that turn out to be the same underlying gap:

1. **Variant covers.** The founder wants to click an issue and choose the specific printing (newsstand, direct, "Cover B," 1:25 incentive, etc.) via an image picker. Today there is no concept of "these N cover images are the same issue, different prints" anywhere in the schema — `canonical_covers` is a flat table keyed loosely by `(series_title, issue_number)`.
2. **Collected editions modeled as pseudo-series.** While ingesting "Justice League" (2022), it turned out GCD catalogs the 3 collected-edition volumes of 3 story arcs from the mainline 2018 ongoing as their *own* 3-issue series entry, identically titled "Justice League." It's nearly impossible to find via search (see `reports/priority-cover-coverage-2026-08-05.md` and the search-ranking investigation the same night) because it competes on equal footing with the 75-issue mainline book it's actually a part of.

Both are instances of: **one logical comic-book "thing" (an issue with variant prints; a story arc with a periodical run and a collected edition) is represented as multiple flat, unrelated catalog rows, with nothing modeling the relationship between them.** Discogs solves the structurally identical problem (one abstract release, many concrete pressings) with a Master/Release hierarchy — see the conversation this doc grew out of for that framing. This doc's job is to hand the planning session accurate current-state facts, not to prescribe the schema.

---

## 1. Already-built infrastructure — do not re-derive or duplicate this

This is further along than a from-scratch problem. Real, working pieces already exist:

- **`src/lib/coverMatch.js`** — shared matching module (built per `docs/data-hardening-and-growth-spec.md` §1a/§1e). Exports `resolveGcdIssueId({ seriesGcdId, issueNumber })`, `resolveCoverLink(...)`, `resolveSeriesGcdId(...)`. Notably, `resolveGcdIssueId` **already has a primitive form of variant-collapse logic**: when multiple `gcd_issues` rows share an issue number, if they're identical in every other tracked field it treats them as one issue and picks the stable lowest ID; if they genuinely differ, it returns `matchConfidence: "series-only"` (ambiguous) rather than guessing. Any variant-picker design should extend this function's ambiguity handling, not replace it.
- **`canonical_covers` schema** already has `gcd_issue_id` (int, nullable) and `match_confidence` (text) columns (migration `0018_canonical_covers_issue_link.sql`), plus `series_gcd_id`, `comicvine_volume_id`, `series_year`. Full current column list, verified live: `id, source, source_issue_url, external_issue_id, series_title, issue_title, issue_number, publisher, cover_date, in_store_date, description, original_cover_url, storage_path, created_at, comicvine_volume_id, series_year, series_gcd_id, gcd_issue_id, match_confidence`.
- **`user_collections`** already has `variant_label` (freeform text, user-typed — "Newsstand," "Cover B," "1:25 Incentive"), `copy_number` (multi-copy tracking), and `variant_of_gcd_id` (migration `0010_variant_support.sql`) — but per that migration's own comment, `variant_of_gcd_id` is an unpopulated **forward hook**: "Populated by future variant-ingest pipeline (Phase 3)." This is the collector's-own-copy side of variants (what did *I* buy), completely separate from the catalog side (what variants *exist* to choose from) that this doc is about. Don't conflate the two — a real variant-picker feature would let a user pick from catalog variants and *then* that selection could populate `variant_of_gcd_id`/`variant_label` on their `user_collections` row.
- **`CLAUDE.md`** already lists proper variant schema as a named, deferred Phase 3 roadmap item: *"Proper variant schema (variant_of_gcd_id, variant_name, variant_type) once a paid variant data source is established."* That "paid variant data source" framing may be stale — see §3 below, it might not need to be paid at all.

---

## 2. Concrete fixture cases (real, verified, use these to test any design)

### 2a. The collected-edition problem
- **Justice League (2022), `series.gcd_id` 184847.** GCD's entry has exactly 3 "issues" (issue_number "1"/"2"/"3", titled "Prisms," "United Order," "Leagues of Chaos"). These are collected editions of story arcs from issues #59-63, #64-68, #72-75 of the mainline "Justice League" (2018) ongoing (`gcd_id`-equivalent ComicVine volume 111428, 75 issues). ComicVine independently catalogs each collection as its own one-shot volume (143057, 151414, 151413) rather than one 3-issue volume. Full resolution trail in `reports/priority-cover-coverage-2026-08-05.md`.
- Search ranking makes this nearly unfindable today: `src/app/api/search/series/route.js` fetches only the top 60 rows by raw `issue_count_cached` (descending) *before* any per-title grouping/dedup happens, then a "significance tier" further deprioritizes low-issue-count rows. A 3-issue series sharing an exact title with a dozen 50-900-issue "Justice League" volumes gets cut before a user ever sees a result. Confirmed by reading the route in full this session — not a guess.
- There are at least 17 distinct `gcd_series` rows literally titled "Justice League" alone (spanning 1987-2025), before counting spinoffs ("Justice League Dark," "Justice League International," etc.) that also substring-match a "Justice League" search.

### 2b. The variant-cover problem — and a real open technical question it surfaces
- **The Amazing Spider-Man (2022), `series.gcd_id` 184161.** `gcd_issues` has issue_number `"1 (895)"` appearing as **71 separate rows** — GCD cataloging every retailer/incentive/exclusive variant cover printing of issue #1 as its own row, all sharing the exact same issue_number string (no bracket suffix distinguishing them, unlike the pattern §1d of the growth spec already handles). Later issues in the same series *do* show the bracket-suffix pattern in other places (e.g. `"17"` appears both bare and as `"17 (911)"`).
- Meanwhile `canonical_covers` (ComicVine-sourced) has exactly **one** row for issue "1" in this series — one `storage_path`, no variant rows at all. Verified live this session, not assumed.
- **Open question that should be resolved before any schema design, not during it:** does ComicVine's issue API actually expose multiple cover images per issue (an `associated_images`/variants field or similar) that today's ingester (`comicvine_api_to_supabase.py`, `fetch_issues_for_volume()`) simply isn't requesting/parsing? If yes, real variant covers may already be sitting in ComicVine's API, un-ingested — a much cheaper fix (read a field, backfill) than sourcing new data. If no, GCD's 71-duplicate-issue_number rows are the only signal, but for this specific case they carry **no distinguishing text at all** in our mirror (`gcd_issues` only has `issue_number, title, publication_date, key_date` per `CLAUDE.md`, and `title` is null on most rows) — meaning the bracket-suffix cases (Superman #500 "[Collector's Set]", etc.) are the *tractable* subset of this problem, and bare-duplicate cases like ASM #1 (895) may not be solvable from data we already have at all. **Recommend this API investigation happen as the very first step of the planning session, before committing to a schema**, since it changes the entire feasibility picture.
- **Existing duplicate-row noise, already found:** querying `canonical_covers` grouped by `gcd_issue_id`, 168 of ~44,960 resolved issues already have 2+ cover rows. Sampled 3 — all were the *same* single cover art ingested twice from two *different* ComicVine volume IDs for the same series (e.g. Uncanny X-Men issue #1 has rows from both `vol-43785` and `vol-71565`), not genuine variant art. **Any variant-picker UI must not treat "multiple canonical_covers rows per gcd_issue_id" as inherently meaningful today — that signal is currently contaminated with accidental duplicate-ingestion noise, and needs a dedup/provenance pass regardless of what the variant schema ends up looking like.**

### 2c. Related, already-fixed bugs this session that constrain the design (don't reintroduce these mechanisms)
Four distinct "why don't this issue's covers show up" mechanisms are now on record — a variant/collected-edition schema will interact with all of them, so the planning session should read the specifics in `reports/priority-cover-coverage-2026-08-05.md` and the memory files it links:
1. Pagination bug (no `ORDER BY` on multi-page `.range()` queries under concurrent writes) — fixed 2026-08-05.
2. Duplicate-`series_gcd_id` GCD entries (two different real-world GCD series rows, same title) — the Superman mislink case, fixed 2026-08-05; systemic sweep still open.
3. ComicVine volume-splitting one continuous run across multiple volume IDs — the Thor #407-490 case.
4. GCD modeling a collected edition as its own pseudo-series — the Justice League case (§2a above), the newest addition to this list.

**Hard constraint carried forward from an explicit founder decision (2026-08-04):** the "borrow a representative cover from elsewhere in the same volume" fallback was killed sitewide because it produced confidently-wrong covers. Whatever a variant picker does when a specific variant has no image, it must show an honest "no cover for this variant" state, never substitute a different variant's or a different issue's art silently.

---

## 3. Two structurally distinct sub-problems — don't design one schema that conflates them

| | Variant covers | Collected editions |
|---|---|---|
| **What it models** | Same issue number, different print/cover art | Different issue numbers (a whole separate mini-run), same story content as part of a larger work |
| **Cardinality** | One issue → N cover images | One "collection" series → maps to a *range* of issues in a different series |
| **Existing schema hook** | `user_collections.variant_of_gcd_id`/`variant_label` (collector's-copy side only; catalog side doesn't exist) | None — GCD's own two-series-for-one-story-arc pattern is invisible to us today |
| **Data source status** | Unclear — see §2b's open API question | GCD already encodes this correctly (via each series' own issue list); we just don't model the *link* between the two GCD series |
| **Discogs analogy** | Multiple pressings of the same release | Compilation/reissue linked back to its Master |

They may end up sharing a general "related series/issue" relationship primitive at the schema level (both are fundamentally "this catalog row is a variant/alternate form of that catalog row"), but the matching logic, ingestion source, and UI are different enough that the planning session should treat them as two workstreams from the start, not one.

---

## 4. Non-negotiables for the planning session

- **PostgREST silently caps any unpaginated response at 1000 rows** — any new query design must paginate with `.range()` in a loop.
- **Any multi-page `.range()` query must have an explicit `.order()`** — the 2026-08-05 bug (see §2c.1) proved Postgres/PostgREST give no row-order guarantee across pages without one, and it silently drops rows under concurrent writes.
- **Never reintroduce cross-item cover substitution** (§2c, hard constraint) — a missing variant image shows as missing, never as a different variant's or issue's art.
- **`gcd_issue_id` is an integer** — coerce explicitly, per existing `CLAUDE.md` guidance; this has caused bugs before.
- **ComicVine free tier: ~200 req/hour** — any new ingestion work (e.g., pulling a hypothetical `associated_images` field) competes with the existing cover-ingest cron for that budget.
- **GCD is the metadata source of truth but has known distortions**: duplicate/fragment series entries per real-world title (§2c.2), foreign-market editions mislabeled with US publisher names (the Superman case), and now collected-editions-as-pseudo-series (§2a). Any design that trusts GCD's series/issue structure at face value will inherit these; the planning session should decide how much of the "sweep and correct GCD distortions" work is a prerequisite vs. handled case-by-case as found.

---

## 5. Explicitly out of scope for this planning pass

- Full UGC cover upload (already separately scoped in `docs/data-hardening-and-growth-agent-prompts.md` §4a) — that's a different feature (users contribute missing covers) from this one (users choose among existing catalog variants), though they'll likely share storage/schema patterns.
- Marketplace/listing implications of variants (e.g., a seller specifying which variant they're listing) — Phase 4, not now.
- Per-variant valuation (`market_comps` doesn't distinguish variants today) — real and eventually necessary, but a separate pricing-pipeline problem, not a catalog-modeling one.
- The systemic structural cover-link repair (duplicate `series_gcd_id` sweep, §2c.2) — already tracked as its own open item on the launch checklist; this doc's scope is additive to it, not a redo of it.

---

## 6. Suggested first questions for the planning session

Not answers — these are the decisions the planning session exists to make, listed so it doesn't waste time rediscovering that they're open:

1. Resolve §2b's ComicVine API question first — it determines whether variant covers are an ingestion-backfill problem or a genuinely-unsolved-data problem for most modern variant-heavy series.
2. Does "collected edition" get modeled as a new relationship type between two `series` rows (parent ongoing ↔ child collection), or as a new first-class entity distinct from `series` entirely?
3. Does a `canonical_covers` variant need its own row shape change (e.g., a `variant_type`/`variant_label`/`is_primary` set of columns), or a separate `cover_variants` table keyed to a base `canonical_covers` or `gcd_issues` row?
4. How does the existing `resolveGcdIssueId` ambiguity-collapse logic (§1) get extended rather than replaced once "these rows are genuinely different variants, not duplicates" becomes a real, intended case instead of an error state?
5. What does the image-picker UI need at read time — does `/api/issues/[id]` need a new "variants" array in its response shape, and does that break any existing consumer (PDF export, library hydrate, public profile) that assumes one cover per issue?
