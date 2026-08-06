# Variant Covers & Collected Editions — Agent Prompts

Companion to `docs/variant-and-collected-editions-spec.md`. Each prompt below is **self-contained** — copy-paste any one into a fresh agent session and it has everything needed. Agents are not assumed to have any session history.

**Shared preamble for every prompt** (paste at the top of every session):

> You're working on **ComixCatalog**, a Next.js + Supabase "Discogs for comics" platform. Read `CLAUDE.md` at the repo root first — schema notes, domain vocabulary, engineering reminders, and known data quirks. Then read `docs/variant-and-collected-editions-spec.md` for the full plan; you're owning one section of that. Read `docs/variant-architecture-context.md` too — it's the research this spec is built on, including the real fixture data (Justice League `gcd_id` 184847, Amazing Spider-Man 2022 `gcd_id` 184161) you should test against.
>
> Tech stack: Next.js App Router, Supabase (Postgres), Python ingestion scripts, Node scripts in `scripts/`. Tailwind for styling.
>
> **Hard rules, don't relearn these the expensive way:**
> - Any Supabase `.select()`/`.in()` that might exceed 1000 rows needs `.range()` pagination in a loop — PostgREST silently caps at 1000.
> - Any multi-page `.range()` query needs an explicit `.order()` — without one, row order (and completeness under concurrent writes) is not guaranteed.
> - `gcd_issue_id` is an integer — coerce explicitly, never rely on implicit casting.
> - Never reintroduce cross-item cover substitution — a missing cover/variant image shows as missing, never another item's art.
> - `.env.local` holds secrets (including `COMICVINE_API_KEY`) — never commit it, never print its contents.
> - ComicVine free tier is ~200 req/hour. Metadata calls (the `issues/` endpoint) count against this; downloading an already-returned image URL does not, but don't assume that generalizes to other ComicVine endpoints.
>
> **Per this repo's soft branch/PR convention** (`docs/operations/engineering-workflow.md`): branch as `agent/<topic>` and open a PR for anything touching migrations or `src/lib/coverMatch.js` — both workstreams below do. If you're running alongside another agent working the other workstream, use `git worktree add .worktrees/<topic> agent/<topic>` — a branch name alone does not isolate a concurrent session from this one.
>
> When done: run `git status` and `git diff` yourself and verify the change actually does what you claim before reporting done. Commit with a clear message and push your branch, opening a PR rather than pushing straight to `main` (per the convention above).

---

## §1a — `cover_variants` Migration

> **Human review required before merge: NO** (new additive table, no existing-data risk)
>
> **Goal:** Create the schema Workstream A needs. This is the first step for everything else in §1 — nothing else in this workstream can start without it.
>
> **Steps:**
> 1. Create `scripts/migrations/0020_cover_variants.sql` — the exact DDL is in `docs/variant-and-collected-editions-spec.md` §1a. Copy it, don't redesign it (the column choices — separate table, `source_image_id` dedup key, denormalized `gcd_issue_id` — are deliberate, reasoning is in that section).
> 2. Confirm migration numbering: check `scripts/migrations/` for the current highest number before naming the file — `0020` was correct as of this spec's writing (2026-08-05) but verify it hasn't moved.
> 3. Apply the migration the same way prior migrations in this repo were applied (check `scripts/migrations/` for a runner script or documented `psql`/Supabase CLI invocation — follow existing convention, don't invent a new apply mechanism).
>
> **Acceptance criteria:**
> - Table exists with the exact column set from the spec.
> - `UNIQUE (source, source_image_id)` constraint verified (attempt a duplicate insert in a scratch test, confirm it's rejected).

---

## §1b — Ingestion-Time Variant Capture

> **Human review required before merge: NO** (additive to the ingestion write path, doesn't change existing `canonical_covers` writes)
>
> **Prereq:** §1a merged.
>
> **Goal:** Stop discarding ComicVine's `associated_images` field. Confirmed live (2026-08-05) that Amazing Spider-Man (2022) #1 — `comicvine_volume_id` 142577, ComicVine issue id 919313 — returns 16 images via this field on the same bulk `issues/?filter=volume:{id}` call the ingester already makes, versus the 1 row `canonical_covers` stores today. Also confirmed: `caption` and `image_tags` are unpopulated/generic (`null` / `"All Images"`) on that fixture — don't build anything that depends on them containing real variant labels; spot-check 2-3 more issues to see if this holds broadly before assuming it's universal, but the picker UI in §1e is designed around labels not existing.
>
> **Steps:**
> 1. In `comicvine_api_to_supabase.py`, find `fetch_issues_for_volume()` (currently ~line 749) and add `associated_images` to its `field_list` string.
> 2. After the existing per-issue write to `canonical_covers` succeeds and you have its row `id`, loop the issue's `associated_images` array. Skip any entry whose `original_url` matches what was already stored as the primary cover (avoid storing the same image twice). For the rest, upsert into `cover_variants` on `(source='comicvine', source_image_id=<associated_images entry's id, as string>)`.
> 3. Reuse the existing image-download-and-store-to-`canonical-covers`-bucket function for each variant image — grep for how the primary cover's `storage_path` gets populated today and call that same path, don't write a second copy of that logic.
> 4. Add a `--max-variant-images-per-issue` flag (default 10) so one outlier issue doesn't dominate a run — verify against real data first whether any issue actually exceeds this before assuming it's needed defensively.
>
> **Acceptance criteria:**
> - A test ingestion run (dry-run first if the script supports it, then a real run against a small target list) against ComicVine volume 142577 (Amazing Spider-Man 2022) produces `cover_variants` rows for issue #1, matching the count found live this session (16, minus however many equal the primary image).
> - Ingestion throughput for volumes with no extra images (the common case) shows no meaningful slowdown — this must not blow the cron's request budget.

---

## §1c — Backfill Existing Volumes

> **Human review required before merge:** NO for the script; **YES** before running the real backfill at scale (dry-run/report first, review the plan, then run for real)
>
> **Prereq:** §1a and §1b merged.
>
> **Goal:** Recover variant images for volumes ingested before §1b shipped, without re-resolving anything already correct in `canonical_covers` — only new `cover_variants` rows get written.
>
> **Steps:**
> 1. First, get the actual number: query distinct `comicvine_volume_id` values in `canonical_covers` (paginate with `.range()` + `.order()`, don't trust a single unpaginated `.select()` — see the 1000-row cap warning above). Report this number before doing anything else; it determines whether this backfill is a 20-minute job or a multi-day one against the 200 req/hour budget.
> 2. Extend `comicvine_api_to_supabase.py` with a backfill mode (or write a thin wrapper script) that iterates those volume IDs, re-calls the volume-issues endpoint with the `associated_images` field (same call as §1b), and writes only `cover_variants` rows — do not touch existing `canonical_covers` rows.
> 3. Run in dry-run/report mode first: how many volumes, estimated request count, estimated new `cover_variants` rows.
> 4. Run for real, rate-limited to the existing budget conventions (`--max-search-calls`, sleep flags — match whatever the primary ingester already uses).
>
> **Acceptance criteria:**
> - Report: volumes processed, `cover_variants` rows created, any volumes that errored (and why — don't silently skip failures).
> - Spot-check: Amazing Spider-Man 2022 volume shows the same variant count found live in this session's investigation.

---

## §1d — `/api/issues/[id]` Variants Field

> **Human review required before merge: NO** (additive response field, existing consumers unaffected)
>
> **Prereq:** §1a merged (schema must exist; can be coded and tested against a manually-inserted test row even before §1b/§1c land real data).
>
> **Goal:** Expose variant covers to the read path without touching how any existing consumer (PDF export, library hydrate) reads this route today.
>
> **Steps:**
> 1. In `src/app/api/issues/[id]/route.js`, after the existing cover resolution (currently ~lines 48-81) determines the `canonical_covers` row for this issue, query `cover_variants` where `canonical_cover_id` matches, ordered by `sort_order`.
> 2. Add a `variants` array to the response payload (near where `cover` is assembled, currently ~line 376): `[{ id, storageUrl, sortOrder }]` — build `storageUrl` the same way the existing `cover` field does (`${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${storage_path}`). Empty array when none exist — never omit the field or return null, so client code has one shape to handle.
>
> **Acceptance criteria:**
> - Response for an issue with variant rows includes a non-empty `variants` array with working image URLs (verify at least one loads).
> - Response for an issue with no variant rows includes `variants: []`, and every other field in the response is byte-for-byte unchanged from before this change (diff the response for a known issue before/after).

---

## §1e — Variant Picker UI

> **Human review required before merge:** YES — this is user-facing, worth a founder look before merge even though it's low-risk technically.
>
> **Prereq:** §1d merged.
>
> **Goal:** Let a user viewing an issue see and select among its variant cover images, and optionally record which one they own.
>
> **Steps:**
> 1. On the issue detail view (find the component currently rendering the single cover for an issue), when `variants.length > 0`, render a thumbnail strip below/beside the primary cover. Label them positionally ("Variant 1," "Variant 2"...) — do **not** fabricate labels like "Cover B" or "1:25 Incentive" since §1b confirmed ComicVine doesn't reliably supply them. If the spot-check in §1b did find real captions on some issues, use those where present and fall back to positional labels where not.
> 2. Clicking a thumbnail swaps which image is the "currently displayed" cover in that view (client-side state, no write needed just to browse).
> 3. If the user is viewing this issue from their own library entry, add a lightweight "this is the printing I own" action that writes to their `user_collections` row: `variant_of_gcd_id` (the issue's `gcd_issue_id`) and a user-typed freeform `variant_label` text field — reuse the existing columns from migration `0010_variant_support.sql`, don't add new ones.
>
> **Acceptance criteria:**
> - Manually verified in a browser against Amazing Spider-Man 2022 #1 (or whichever real issue has variant rows after §1c's backfill) — thumbnails render, clicking swaps the displayed cover, no console errors.
> - The "this is the printing I own" action, tested end to end, updates the correct `user_collections` row and the value persists on reload.

---

## §2b1 — Search Ranking Grouping Fix

> **Human review required before merge: NO** (read-path ranking change, easily verified, no schema risk)
>
> **Goal:** Stop small-issue-count collected-edition series from being silently dropped before search ranking logic ever sees them. No dependency on Workstream A or on §2b2's schema — this can start and ship immediately.
>
> **Verified starting state (2026-08-05):** `src/app/api/search/series/route.js` fetches the top 60 rows by `issue_count_cached` descending (~line 94-95), *then* applies a significance-tier sort (~line 102, ~181) that further deprioritizes low-issue-count rows. A 3-issue series sharing an exact title with a dozen 50-900-issue series of the same name never survives the initial `.limit(60)` cutoff. Confirmed live: there are at least 17 distinct `gcd_series` rows titled exactly "Justice League."
>
> **Steps:**
> 1. Widen the initial candidate fetch (e.g. top 200 by `issue_count_cached` instead of 60 — pick a number that comfortably covers known worst-case title collisions like "Justice League," verify against the real 17-series count).
> 2. Group the widened candidate set by `title_normalized` before applying the existing significance-tier sort and before truncating to the final 60 results.
> 3. Within each group, keep the existing significance-tier logic to pick which member(s) of the group actually surface — this fix is about the group surviving to that logic, not about changing how it ranks within a group.
> 4. Truncate groups (not raw rows) to the final result count.
>
> **Acceptance criteria:**
> - Searching "Justice League" returns a result set that includes the 2022 collected-edition entry (`series.gcd_id` 184847) somewhere in the results — verify by checking the actual response, not just "it doesn't crash."
> - No regression for unambiguous single-series titles — spot-check 3-4 other searches before/after and confirm ordering is unchanged.
> - Response time doesn't meaningfully regress from widening the initial fetch (measure before/after).

---

## §2b2 — `series_relationships` + Candidate-Linking Script

> **Human review required before merge:** YES for the migration and the linking script's write path; the candidate-detection script itself is read-only and safe to merge without review.
>
> **Prereq:** none structurally, but **reuse §2b1's grouping query** rather than writing the same "group by normalized title, different `gcd_id`" logic twice — sequence after §2b1 for that reason even though there's no hard dependency.
>
> **Goal:** Model the parent-ongoing / child-collected-edition relationship GCD's own data doesn't express, using manual confirmation rather than auto-linking on title similarity alone — title similarity is a candidate signal, not proof (some same-title, different-issue-count series pairs are genuinely unrelated one-shots or annuals, not collected editions of each other).
>
> **Steps:**
> 1. Create `scripts/migrations/0021_series_relationships.sql` — DDL is in `docs/variant-and-collected-editions-spec.md` §2b2. Copy it as-is.
> 2. Write `scripts/findCollectedEditionCandidates.js` (read-only) — reuse the grouping query from §2b1. Within each same-title group, flag pairs where one member has ≤10 issues and another has ≥30 as a candidate parent/child pair. Output a CSV: `title, candidate_child_gcd_id, candidate_child_issue_count, candidate_parent_gcd_id, candidate_parent_issue_count, candidate_parent_publisher`.
> 3. Run it, hand the CSV to the founder for review — **do not auto-confirm any pairs**. Some will be correct (Justice League 2022 collected editions → Justice League 2018 ongoing), some won't be (a genuinely standalone mini-series that happens to share a title).
> 4. Write a second small script that takes a founder-reviewed/trimmed CSV (rows the founder kept) and inserts confirmed rows into `series_relationships` with `confidence = 'manual'`.
> 5. On the child series' page (find the series detail component/route), if a `series_relationships` row exists where this series is the child, render "Collects issues [issue_range_note] of [parent title]" linking to the parent. Optional for v1, but low-effort if time allows: on the parent's page, list any known child collected editions.
>
> **Acceptance criteria:**
> - Candidate script run against real data includes the Justice League case (`gcd_id` 184847 as child candidate, `gcd_id` for the 2018 75-issue ongoing as parent candidate) in its output.
> - After founder review and confirmation, `series_relationships` has the Justice League row, and the child series' page renders the "collects issues of..." link correctly.
> - No pairs inserted without explicit founder sign-off on that specific CSV row — this is a hard requirement, not a suggestion; verify the linking script actually reads a reviewed file rather than just re-running detection and inserting everything above some confidence threshold.
