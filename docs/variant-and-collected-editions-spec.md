# Variant Covers & Collected Editions — Implementation Spec

**Companion to:** `docs/variant-architecture-context.md` (the research/context doc this spec resolves), `docs/data-hardening-and-growth-spec.md` §1d (the narrower bracket-suffix precursor this spec supersedes for variant-cover purposes), `CLAUDE.md`.
**Status (2026-08-05):** Working spec. §2b of the context doc's open question is now answered (see §0) — this is no longer blocked on a feasibility unknown, it's an engineering-concrete plan.

---

## 0. What changed since the context doc was written

The context doc flagged one open question that had to be resolved before any schema design: *does ComicVine's issue API expose multiple cover images per issue that the ingester currently discards?*

**Answer: yes, confirmed live against real data.** The Amazing Spider-Man (2022) #1 (`comicvine_volume_id` 142577, `external_issue_id` 919313 — the same fixture the context doc used) returns **16 images** via the `associated_images` field, against the single row `canonical_covers` has for it today. Two things make this cheaper than the context doc feared:

1. **The field is available on the same bulk endpoint the ingester already calls.** `fetch_issues_for_volume()` in `comicvine_api_to_supabase.py` hits `GET /api/issues/?filter=volume:{id}` — confirmed live that adding `associated_images` to that call's existing `field_list` param returns the full image set, no per-issue detail calls needed. **This is a field_list change, not a new request pattern — zero marginal cost against the 200 req/hour budget** for newly-ingested volumes.
2. **Backfilling already-ingested volumes is bounded by volume count, not issue count.** Re-running the volume-issues call (same endpoint, same cost as one ingestion pass) recovers variant images for every issue in that volume at once. This is materially cheaper than the context doc's worst case, which assumed a per-issue-detail-call backfill against ~44,960 resolved issues.

The bad news, also confirmed live: **`caption` and `image_tags` are not useful labels.** All 16 ASM #1 images came back with `caption: null` and `image_tags: "All Images"` — a bucket name, not a variant description ("Cover B," "1:25 Incentive," etc.). Recommend the implementing session spot-check 2-3 more known-variant-heavy issues before treating this as universal, but plan for the common case now: **ComicVine gives real, distinct cover images with no reliable machine-readable variant label.** That shapes the UI (§1 below) — a picker of unlabeled thumbnails, not a labeled dropdown.

This also changes which of the context doc's two data sources is primary. GCD's 71-duplicate-`issue_number`-rows-with-no-distinguishing-text case (ASM #1 (895), context doc §2b) remains genuinely intractable from GCD alone — no text to disambiguate on. But it no longer needs to be solved, because **ComicVine's `associated_images` already gives real pixels for the same issue**, sourced independently of GCD's row-duplication problem entirely. GCD's duplicate rows stay as-is; they're not the variant data source going forward, ComicVine is.

---

## 1. Workstream A — Variant Covers (catalog side)

### 1a. New table: `cover_variants`

**Decision (answers context doc §6 Q3):** a separate table keyed to `canonical_covers`, not a row-shape change to `canonical_covers` itself, and not a repurposing of the existing duplicate-row pattern.

Reasoning: `canonical_covers` today is "one row = the cover for this issue," and every read path (`library-hydrate`, `public-profile`, PDF export, `/api/series/[id]`, `/api/issues/[id]`) assumes exactly that. Changing that cardinality assumption is a five-call-site risk for no benefit. A separate table is strictly additive — existing consumers don't change until they explicitly opt in to reading variants.

It also sidesteps the contamination the context doc flagged in §2b: 168 issues already have 2+ `canonical_covers` rows from **accidental** duplicate-volume-ID ingestion, not real variants. `cover_variants` rows are sourced by ComicVine's own `id` on each `associated_images` entry — real provenance, not a row-count heuristic — so this workstream doesn't inherit that noise and doesn't need to wait on a dedup pass to start. (That dedup pass is still real work; it's just orthogonal to this one, same as the context doc's §5 scoping already implies.)

```sql
-- scripts/migrations/0020_cover_variants.sql
CREATE TABLE cover_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_cover_id UUID NOT NULL REFERENCES canonical_covers(id),
  gcd_issue_id INTEGER,              -- denormalized copy for direct lookup without a join; integer per CLAUDE.md convention
  source TEXT NOT NULL DEFAULT 'comicvine',
  source_image_id TEXT NOT NULL,     -- ComicVine associated_images[].id, as string; dedup/idempotency key
  original_url TEXT NOT NULL,
  storage_path TEXT,                 -- populated once downloaded into the canonical-covers bucket; nullable until then
  caption TEXT,                      -- almost always null per §0 — kept for the rare case it isn't
  image_tags TEXT,                   -- almost always "All Images" per §0 — kept for the rare case it isn't
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_image_id)
);
CREATE INDEX idx_cover_variants_canonical_cover ON cover_variants(canonical_cover_id);
CREATE INDEX idx_cover_variants_gcd_issue ON cover_variants(gcd_issue_id);
```

The primary/first-ingested image an issue already has in `canonical_covers.storage_path` is **not** duplicated into `cover_variants` — it stays the default/cover-thumbnail image, `cover_variants` holds the *additional* ones. A row count of zero in `cover_variants` for a given `canonical_cover_id` means "no known variants," not "no cover."

### 1b. Ingestion-time capture

**File:** `comicvine_api_to_supabase.py`, `fetch_issues_for_volume()` (currently line ~749's `field_list`).

1. Add `associated_images` to the existing `field_list` string — no new request, confirmed in §0.
2. After the existing single-cover write to `canonical_covers` succeeds and its `id` is known, loop `associated_images`, skip the one matching the primary `image.original_url` if present (avoid a redundant duplicate of the cover already stored), and upsert the rest into `cover_variants` on `(source, source_image_id)`.
3. Reuse the existing per-cover download-and-store-to-`canonical-covers`-bucket logic (already written for the primary cover path) for each variant image rather than writing a second copy of that logic.
4. Rate-limit awareness: downloading N extra images per issue multiplies **storage bandwidth and disk**, not ComicVine API request count (the metadata call is one request regardless of image count; each image download is a separate HTTP GET but not a rate-limited ComicVine API endpoint). Still worth a `--max-variant-images-per-issue` cap (suggest starting at 10) so one outlier issue with 40+ images doesn't dominate a run.

### 1c. Backfill for already-ingested volumes

New script, `scripts/backfillCoverVariants.js` (Node) or a `--backfill-variants` mode on the existing Python ingester — implementer's call, but **prefer extending the Python ingester** since the download-and-store logic already lives there and duplicating it in Node re-creates exactly the kind of drift `docs/data-hardening-and-growth-spec.md` was written to eliminate.

- Iterate distinct `comicvine_volume_id` values already present in `canonical_covers` (not distinct issues — confirmed in §0 this is the cheap axis).
- Re-run the volume-issues call with the new `field_list`, write only the `cover_variants` rows (primary `canonical_covers` row already exists, don't touch it).
- Get an actual count of distinct `comicvine_volume_id` values before estimating runtime against the 200 req/hour budget — the context doc's fixture data didn't need this number and it wasn't pulled during this session's investigation; pull it first thing.

### 1d. Read path — `/api/issues/[id]`

**File:** `src/app/api/issues/[id]/route.js` (current cover resolution around line 48-81, response assembly around line 376).

Add an optional `variants` array to the response: `[{ id, storageUrl, sortOrder }]`, empty when none exist. This is additive — existing consumers (PDF export, library hydrate) that don't read the new field are unaffected, directly answering context doc §6 Q5. Only this one route needs the new field for v1; the picker UI (§1e) is the only new consumer.

### 1e. Minimal picker UI

Scope this small for v1, per the founder's original ask ("click an issue, choose the specific printing") — not a full Discogs-style labeled-release picker, since §0 confirmed labels usually don't exist:

- A thumbnail strip/grid on the issue detail view when `variants.length > 0`, unlabeled beyond "Variant 1, 2, 3…" (never fabricate a label like "Cover B" without source data for it — same honesty principle as the missing-cover hard constraint in context doc §2c).
- Selecting a variant updates which image displays; if the user is viewing their own library copy, offer "this is the printing I own" which writes `variant_of_gcd_id` + a user-typed freeform `variant_label` on their `user_collections` row — this is the exact connection the context doc §1 described between the catalog side (this workstream) and the collector's-copy side (already-existing schema, currently an unpopulated forward hook).
- No new table needed for this — reuse `user_collections.variant_of_gcd_id`/`variant_label`, already shipped in migration `0010_variant_support.sql`.

---

## 2. Workstream B — Collected Editions

Kept structurally separate from Workstream A per the context doc's own §3 table — different cardinality, different data source, different UI. Two sub-phases, sequenced independently because B1 is materially lower-risk and ships value (findability) without waiting on B2's schema/judgment work.

### 2b1. Search-ranking fix (ships first, no schema change)

**Problem, confirmed live this session by reading the route:** `src/app/api/search/series/route.js` fetches the top 60 rows by raw `issue_count_cached` descending (line ~94-95) *before* any per-title grouping, then a significance-tier sort further deprioritizes low-issue-count rows (line ~102, ~181). A 3-issue "Justice League" collected-edition series competing against a dozen 50-900-issue "Justice League" volumes never survives the initial cutoff.

**Fix:** group candidate rows by normalized title *before* the `.limit(60)` truncation, not after — fetch a wider candidate pool (e.g. top 200 by `issue_count_cached`), group by `title_normalized`, then apply the existing significance-tier sort *within* each group and truncate groups, not raw rows, to the final 60. This doesn't require knowing which rows are "really" the same underlying work (that's B2) — it just stops one same-titled group's small-issue-count members from being invisible before the ranking logic even sees them.

**File:** `src/app/api/search/series/route.js`. **Acceptance:** searching "Justice League" surfaces the 2022 3-issue collected-edition entry (`gcd_id` 184847) somewhere in results, not silently dropped pre-cutoff. No regression on total result count or existing top-result ordering for unambiguous titles.

### 2b2. `series_relationships` table + manual-confirm linking (larger, judgment-heavy)

**Decision (answers context doc §6 Q2):** model as a new relationship row between two existing `series` rows, not a new first-class entity. A collected edition is still a real `series` with its own issues, publisher, and cover — it doesn't need a different shape, it needs a documented link to the series it's part of.

```sql
-- scripts/migrations/0021_series_relationships.sql
CREATE TABLE series_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_series_id UUID NOT NULL REFERENCES series(id),   -- the ongoing/mainline run
  child_series_id UUID NOT NULL REFERENCES series(id),    -- the collected-edition series
  relationship_type TEXT NOT NULL DEFAULT 'collects',
  issue_range_note TEXT,             -- freeform, e.g. "#59-63" — descriptive only, not a structural FK to specific issues
  confidence TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'heuristic-unconfirmed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_series_id, child_series_id)
);
```

**Do not auto-link with confidence you don't have.** This is the same principle `resolveGcdIssueId()` already applies (return `series-only`/ambiguous rather than guess) and the same principle behind killing cross-item cover substitution. Same-title-different-`gcd_id` grouping (needed for 2b1 anyway) is a real signal for *candidates*, but title similarity alone is not enough to auto-confirm a parent/child link — a false-positive link here misattributes a whole series' issues to the wrong parent, which is a worse user-facing error than the current "unfindable" state.

**Fix, minimal-viable for a solo founder near launch (per your own scoping preference — don't build a full moderation-queue product for this):**
1. A read-only script, `scripts/findCollectedEditionCandidates.js` — for every group of same-normalized-title, different-`gcd_id` series (this reuses the exact grouping query 2b1 needs, don't build it twice), flag groups where at least one member has ≤10 issues and at least one other has ≥30, as candidate parent/child pairs. Output CSV for manual review: `title, candidate_child_gcd_id, candidate_child_issue_count, candidate_parent_gcd_id, candidate_parent_issue_count, candidate_parent_publisher`.
2. Founder reviews the CSV (this is real judgment — GCD's own quirks mean not every small-issue-count same-title series is a collected edition of the large one; some are genuinely unrelated minis, one-shots, or annuals), and a second small script takes a confirmed CSV subset and inserts the `series_relationships` rows.
3. No UI moderation queue for v1 — a CSV-in/CSV-out script pair is enough at current scale (17 "Justice League"-titled series is the largest known collision, not thousands).

**Read-path use (v1 scope, keep small):** on a child series' page, if a `series_relationships` row exists, show a "collects issues #X-Y of [parent series title]" link. That alone solves the practical discoverability problem the context doc's §2a fixture describes — a user landing on the Justice League collected-edition page (however they got there) can navigate to the real ongoing, and vice versa if the parent page surfaces its known collected editions. A bidirectional "browse from parent to all its collected editions" list is a natural follow-on, not required for v1.

---

## 3. Non-negotiables carried forward (context doc §4 — do not relitigate)

- Any multi-page `.range()` query needs an explicit `.order()` — applies to the volume-iteration backfill in §1c and the widened candidate-pool query in §2b1.
- `gcd_issue_id` is an integer — coerce explicitly in `cover_variants` writes.
- Never reintroduce cross-item cover substitution — a variant with no image shows nothing for that slot, never another variant's or issue's art. (Doesn't really arise in this design since `cover_variants` rows only exist when ComicVine actually returned an image, but state it for anyone extending this later.)
- ComicVine free tier ~200 req/hour still applies to §1b's per-volume metadata calls (though not to image downloads themselves) and to any future new-volume discovery; §1c's backfill competes with the existing cover-ingest cron for that budget and should be run as its own bounded job, not folded silently into the weekly cron.
- GCD is metadata source of truth but has known distortions (duplicate series entries, collected-editions-as-pseudo-series) — §2b2 works around this with manual confirmation rather than trusting GCD's structure at face value.

---

## 4. Sequencing

```
1a  cover_variants migration                — do first, nothing else in Workstream A can start without it
1b  ingestion-time capture (field_list add)  — depends on 1a; zero marginal API cost, ship early
1c  backfill for existing volumes            — depends on 1a/1b; get the distinct-volume-count number first,
                                                 size the run against the 200/hr budget before committing to a timeline
1d  /api/issues/[id] variants field          — depends on 1a (needs rows to exist for meaningful testing, but
                                                 can be coded against 1a's schema before 1b/1c finish)
1e  picker UI                                — depends on 1d

2b1 search-ranking grouping fix              — no dependency on anything above; ship independently, it's the
                                                 fastest win in this whole spec and doesn't touch schema
2b2 series_relationships + candidate script  — no hard dependency on Workstream A; can run in parallel with it,
                                                 though it shares its candidate-grouping query with 2b1, so
                                                 sequence 2b1 first and reuse its grouping logic rather than
                                                 writing it twice
```

Workstream A (1a-1e) and Workstream B (2b1-2b2) have no dependency on each other and can run as two fully parallel lanes, including in separate worktrees, per the branch/PR convention in `docs/operations/engineering-workflow.md`.

---

## 5. Out of scope for this pass

- Per-variant valuation (`market_comps` doesn't distinguish variants) — real, later, pricing-pipeline problem not a catalog-modeling one, per context doc §5.
- Marketplace listing-level variant selection — Phase 4.
- Full UGC cover upload — separately scoped in `docs/data-hardening-and-growth-agent-prompts.md` §4a; shares storage/schema patterns with §1 here but is a different feature.
- The systemic duplicate-`series_gcd_id`/duplicate-volume-ingestion sweep (168-row contamination noted in context doc §2b) — already tracked as its own open item; §1a's separate-table design means Workstream A doesn't need to wait on it, but it's still real debt worth closing.
- A general "related series" UI beyond the single parent/child link in §2b2 (e.g., a full timeline/omnibus-tracking feature) — v1 is deliberately minimal.
