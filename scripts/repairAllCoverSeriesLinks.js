// Catalog-wide generalization of propagateGcdIdByCvVolume.js (fixes volumes
// already split across multiple series_gcd_id values) and
// repairFeaturedSeriesCoverage.js (fixes volumes entirely on ONE wrong
// gcd_id, scoped to the 79 curated FEATURED_SERIES). This runs the same
// issue-overlap scoring against every ComicVine volume in canonical_covers,
// not just featured picks or already-visibly-conflicted ones.
//
// Root cause (see docs/cover-ingestion-audit-findings.md and project memory
// for the full incident list, 2026-08-25): GCD carries many distinct series
// entries sharing an identical title — foreign reprints, book-club editions,
// unrelated one-shots ("Ultimate Spider-Man" alone has 30 gcd_series rows
// under Marvel). Title-only resolution during ingest can land on a
// different one of those entries each run even though ComicVine's own
// volume match stays correct and consistent.
//
// Two-pass approach for efficiency across ~107k+ covers:
//   Pass 1 (cheap): for every volume, check whether its EXISTING tag(s)
//     already resolve cleanly (single consistent series_gcd_id, >=85%
//     overlap against that gcd_id's real gcd_issues). Skip — no work needed.
//   Pass 2 (only for volumes that fail pass 1): expand the candidate pool
//     to EVERY gcd_series row sharing the volume's series_title, not just
//     gcd_ids already tagged somewhere in the volume, then score all of them.
//
// Usage:
//   node scripts/repairAllCoverSeriesLinks.js --dry-run
//   node scripts/repairAllCoverSeriesLinks.js

import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { baseIssueNumber } from "../src/lib/coverMatch.js";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes("--dry-run");
// --plan-json=<path>: write the full relink plan (every volume, its current
// gcd_id(s), the winner, overlap, runner-up and row ids) so a human can audit
// what would move before it moves. Added 2026-09-21 when the first
// full-data dry run proposed ~6,600 rows and the "Top 20" summary was not
// enough to judge them.
const PLAN_JSON = (process.argv.find((a) => a.startsWith("--plan-json=")) ?? "").split("=")[1] || null;
const OVERLAP_THRESHOLD = 0.85;
const MIN_MARGIN = 0.15;
// Year gate (added 2026-09-21). Overlap is computed on issue NUMBERS only, so
// a 2020 volume numbered #1-50 overlaps a 1988 run numbered #1-189 at 100%
// and can beat the correct 2020 series on margin alone. The first full-data
// dry run (after the fetchIssueSets pagination fix) proposed 199 relinks; a
// year audit found 27 of them (1,037 covers) landing on a run whose
// publication years don't even intersect the covers' (Titans 2023 -> a
// 2008 series, Dick Tracy 2024 -> 1951, Star Wars 2015 -> the 1977 run).
// Rule: the candidate series must have been in publication when the volume
// started. `began - YEAR_PAD <= volumeStart <= ended`. The pad only covers
// off-by-one dating on the start side; there is deliberately no pad on the
// end side, because the second audit showed runs that ended the year before
// a volume began (Transformers 2019-2022 for a 2023 volume, X-O Manowar
// 2012-2016 for a 2017 volume) slipping through a symmetric pad and
// displacing links that were already correct. Volumes or series with no
// year data are not gated (same behaviour as before).
const YEAR_PAD = 1;
const PAGE = 1000;

// Two paging modes.
// - keyCol given: keyset paging (`WHERE keyCol > last ORDER BY keyCol LIMIT
//   1000`). Every page costs the same. Use for the big whole-table walks;
//   the select must include keyCol and the caller must not add .order().
// - no keyCol: offset paging via .range(). Fine for a few pages, but on a
//   122k-row walk page 100 measured 8.2s on 2026-09-22 (offset makes
//   Postgres scan and discard everything before it) and tripped the
//   statement timeout in the hourly health check. Keyset walked the same
//   table at 1.1s worst page.
async function fetchAllPages(build, keyCol) {
  const rows = [];
  if (keyCol) {
    let last = null;
    for (;;) {
      let query = build().order(keyCol, { ascending: true }).limit(PAGE);
      if (last != null) query = query.gt(keyCol, last);
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE) break;
      last = data[data.length - 1][keyCol];
    }
    return rows;
  }
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// THIRD BUG, FOUND LIVE 2026-09-21: this was one unpaginated .in() over 500
// series at a time, so PostgREST handed back at most 1000 gcd_issues rows
// per chunk with no error and (with no ORDER BY) no guarantee which 1000.
// 500 series hold far more than 1000 issues, so most candidates' issue
// sets came back partial or missing entirely, and *which* ones depended on
// the rest of the chunk. Reproduced against production: a chunk holding
// both GCD 614 (Superboy 1949) and 4973 (Superboy 1994) returned 171 of
// 614's issues and zero of 4973's. That is why the hourly Auto-repair
// step relinked two Superboy volumes to 4973 at "100% overlap, no
// runner-up" and the health check 47 seconds later relinked them to 614 at
// "100% overlap, no runner-up": each pass saw only one of the two. The
// 15-point ambiguity guard cannot fire on a candidate it never loaded. It
// also means the "no candidate cleared 85%" skip count has been inflated
// by candidates whose issue lists were simply never read.
// Fix: page every chunk to completion with a stable order, same as the
// two fetches above.
//
// Ordering matters for more than determinism. The first version of this
// fix ordered by gcd_id (the primary key) in 100-series chunks and the
// health check hit Postgres 57014 (statement timeout) on its first hourly
// run: with an IN filter plus ORDER BY the PK, the planner can walk the PK
// index and filter, which at deep offsets scans millions of rows. Measured
// on a real 100-series chunk: worst page 4.5s ordered by gcd_id vs 0.85s
// ordered by (series_gcd_id, gcd_id), and 0.16s with 25-series chunks.
// series_gcd_id is the filtered column, so leading the sort with it keeps
// the planner on that index.
async function fetchIssueSets(gcdIds) {
  const map = new Map();
  const ids = [...new Set(gcdIds)].filter((v) => v != null);
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    const data = await fetchAllPages(() =>
      supabase.from("gcd_issues").select("series_gcd_id, issue_number").in("series_gcd_id", chunk)
        .order("series_gcd_id").order("gcd_id")
    );
    for (const row of data) {
      const key = row.series_gcd_id;
      const base = baseIssueNumber(row.issue_number);
      if (base == null) continue;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(base);
    }
  }
  return map;
}

// The volume's start year: the most common series_year on its rows (that
// column carries the ComicVine volume's start year), falling back to the
// earliest cover_date year. Null when nothing usable is present.
function volumeStartYear(rows) {
  const counts = new Map();
  let earliestCover = null;
  for (const r of rows) {
    const sy = Number(r.series_year);
    if (sy > 1800 && sy < 2200) counts.set(sy, (counts.get(sy) ?? 0) + 1);
    const cy = Number(String(r.cover_date ?? "").slice(0, 4));
    if (cy > 1800 && cy < 2200 && (earliestCover == null || cy < earliestCover)) earliestCover = cy;
  }
  if (counts.size) return [...counts].sort((a, b) => b[1] - a[1])[0][0];
  return earliestCover;
}

function yearsCompatible(volStart, series) {
  if (!volStart || !series || !series.began) return true; // no data, no gate
  return volStart >= series.began - YEAR_PAD && volStart <= (series.ended ?? 9999);
}

function overlapOf(volumeIssueNumbers, candidateIssueSet) {
  if (!candidateIssueSet || candidateIssueSet.size === 0) return 0;
  let matched = 0;
  for (const n of volumeIssueNumbers) if (candidateIssueSet.has(n)) matched++;
  return matched / volumeIssueNumbers.size;
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null, bestCount = -1;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return best;
}

// BUG FOUND AND FIXED LIVE 2026-08-27: the first version of this function
// built a naive `Map<volume, gcd_id>` — when more than one `series` row
// pins the SAME comicvine_volume_id to DIFFERENT gcd_ids (a pre-existing
// duplicate-series data problem: 448 distinct volumes confirmed to have
// genuinely conflicting pins, e.g. ComicVine volume 796 "Batman" 1940 had
// TWELVE different series rows each pinned to a different gcd_id), the
// LAST row the DB happened to return silently won — non-deterministic
// between runs, since no ORDER BY made that order stable. That bad
// assumption already got applied for real once (30,454 rows, including
// Batman, Spider-Man, Superman) before this was caught, live, by the
// smoke test suite immediately after — see scripts/resolveAmbiguousPins.js
// for the year-cross-referenced remediation of that damage.
//
// Fix: a pin is only trustworthy when it's UNIQUE. A volume with multiple
// DISTINCT candidate gcd_ids is excluded from this map entirely and falls
// through to the overlap-scoring logic below instead — the same safety net
// this script already relied on before pins existed at all.
//
// SECOND BUG FOUND LIVE 2026-08-28, same run as the fix above: this fetch
// had no .order() on it, unlike the canonical_covers fetch in run() below.
// fetchAllPages() paginates with .range(from, from+999) — without a stable
// sort, Postgres doesn't guarantee those page boundaries stay put while the
// `series` table is being concurrently written to (new series rows land
// continuously from live ingest and backfill scripts). A row landing on
// the wrong side of a shifting page boundary gets silently skipped, which
// can make a genuinely ambiguous volume look unambiguous for one run and
// correctly ambiguous the next — this is what caused the same title
// (Fightin' Army) to resolve to two different gcd_ids in back-to-back
// invocations minutes apart. Ordering by id makes pagination deterministic
// regardless of concurrent writes elsewhere in the table.
async function fetchPinnedGcdIdByVolume() {
  const rows = await fetchAllPages(() =>
    supabase.from("series").select("id, comicvine_volume_id, gcd_id")
      .not("comicvine_volume_id", "is", null).not("gcd_id", "is", null),
  "id");
  const candidatesByVolume = new Map();
  for (const row of rows) {
    if (!candidatesByVolume.has(row.comicvine_volume_id)) {
      candidatesByVolume.set(row.comicvine_volume_id, new Set());
    }
    candidatesByVolume.get(row.comicvine_volume_id).add(row.gcd_id);
  }
  const map = new Map();
  let ambiguousSkipped = 0;
  for (const [volume, gcdIds] of candidatesByVolume) {
    if (gcdIds.size === 1) {
      map.set(volume, [...gcdIds][0]);
    } else {
      ambiguousSkipped++;
    }
  }
  console.log(`  (${ambiguousSkipped} volume(s) have conflicting pins across multiple series rows — excluded, falls through to overlap-scoring)`);
  return map;
}

async function run() {
  console.log("Loading all covers with a comicvine_volume_id...");
  const covers = await fetchAllPages(() =>
    supabase.from("canonical_covers").select("id, comicvine_volume_id, series_gcd_id, issue_number, series_title, series_year, cover_date")
      .not("comicvine_volume_id", "is", null).not("storage_path", "is", null),
  "id");
  console.log(`Covers loaded: ${covers.length}`);

  const byVolume = new Map();
  for (const c of covers) {
    if (!byVolume.has(c.comicvine_volume_id)) byVolume.set(c.comicvine_volume_id, []);
    byVolume.get(c.comicvine_volume_id).push(c);
  }
  console.log(`Distinct ComicVine volumes: ${byVolume.size}`);

  // A confirmed series.comicvine_volume_id pin is a STRONGER signal than
  // issue overlap — it's a human/prior-repair-verified "this exact ComicVine
  // volume is this exact GCD series," and comicvine_api_to_supabase.py
  // already treats it as authoritative (_lookup_gcd_id_by_pinned_volume,
  // checked before its own fuzzy title fallback). This script didn't know
  // about pins at all until 2026-08-27, when Absolute Batman's real,
  // pin-correct link (series_gcd_id 226633 — GCD's own metadata for it only
  // ever synced issue #1, so its overlap against the volume's 23 real covers
  // was a mere 4%) got silently overridden by an UNPINNED duplicate-title
  // GCD entry (216143, 11 issues, 48% overlap — still under the 85%
  // threshold, but the highest-scoring wrong answer available once 226633's
  // own low overlap put it in "needs resolution" in the first place). A pin
  // now short-circuits both the overlap-based "already clean" check AND the
  // candidate-scoring loop below — it wins regardless of overlap, full stop.
  console.log("Loading confirmed series.comicvine_volume_id pins...");
  const pinnedGcdIdByVolume = await fetchPinnedGcdIdByVolume();
  console.log(`Pinned volumes: ${pinnedGcdIdByVolume.size}`);

  // Pass 1: cheap check against currently-existing tags only.
  const existingTagIds = [...new Set(covers.map((c) => c.series_gcd_id).filter((v) => v != null))];
  console.log(`Distinct series_gcd_id values currently in use: ${existingTagIds.length}`);
  const issueSets = await fetchIssueSets(existingTagIds);

  const needsResolution = [];
  let alreadyClean = 0;
  let pinnedRelinks = 0;
  let pinnedRelinkRows = 0;
  const plan = [];
  for (const [volume, rows] of byVolume) {
    const volIssueNumbers = new Set(rows.map((r) => baseIssueNumber(r.issue_number)).filter(Boolean));
    if (volIssueNumbers.size === 0) continue;

    const pinnedGcdId = pinnedGcdIdByVolume.get(volume);
    if (pinnedGcdId != null) {
      const rowsToFix = rows.filter((r) => r.series_gcd_id !== pinnedGcdId);
      if (rowsToFix.length > 0) {
        pinnedRelinks++;
        pinnedRelinkRows += rowsToFix.length;
        plan.push({
          volume,
          title: mode(rows.map((r) => r.series_title)),
          winner: pinnedGcdId,
          overlap: null, // pin-driven, not overlap-scored
          rowIds: rowsToFix.map((r) => r.id),
        });
      } else {
        alreadyClean++;
      }
      continue;
    }

    const distinctTags = new Set(rows.map((r) => r.series_gcd_id).filter((v) => v != null));
    if (distinctTags.size === 1) {
      const [onlyTag] = distinctTags;
      const allTagged = rows.every((r) => r.series_gcd_id === onlyTag);
      if (allTagged && overlapOf(volIssueNumbers, issueSets.get(onlyTag)) >= OVERLAP_THRESHOLD) {
        alreadyClean++;
        continue;
      }
    }
    needsResolution.push({ volume, rows, volIssueNumbers, title: mode(rows.map((r) => r.series_title)), startYear: volumeStartYear(rows) });
  }
  console.log(`Already clean (skip): ${alreadyClean}`);
  console.log(`Pin-driven relinks: ${pinnedRelinks} volumes, ${pinnedRelinkRows} rows`);
  console.log(`Needs resolution (unpinned, overlap-scored): ${needsResolution.length}`);

  // Pass 2: expand candidates via gcd_series title match for volumes that
  // didn't resolve cleanly against their existing tag(s).
  const titles = [...new Set(needsResolution.map((v) => v.title).filter(Boolean))];
  console.log(`Distinct series_title values needing candidate expansion: ${titles.length}`);

  const candidatesByTitle = new Map();
  const seriesYears = new Map(); // gcd_id -> { began, ended }
  for (let i = 0; i < titles.length; i += 200) {
    const chunk = titles.slice(i, i + 200);
    // Paged: 200 common titles can match well over 1000 gcd_series rows.
    const data = await fetchAllPages(() =>
      supabase.from("gcd_series").select("gcd_id, name, year_began, year_ended").in("name", chunk).order("name").order("gcd_id")
    );
    for (const row of data) {
      if (!candidatesByTitle.has(row.name)) candidatesByTitle.set(row.name, []);
      candidatesByTitle.get(row.name).push(row.gcd_id);
      seriesYears.set(row.gcd_id, { began: row.year_began, ended: row.year_ended });
    }
  }
  // Existing-tag candidates were not part of the title lookup; fetch their years too.
  const untimedIds = [...new Set(needsResolution.flatMap((v) => v.rows.map((r) => r.series_gcd_id)))].filter((id) => id != null && !seriesYears.has(id));
  for (let i = 0; i < untimedIds.length; i += 200) {
    const data = await fetchAllPages(() =>
      supabase.from("gcd_series").select("gcd_id, year_began, year_ended").in("gcd_id", untimedIds.slice(i, i + 200)).order("gcd_id")
    );
    for (const row of data) seriesYears.set(row.gcd_id, { began: row.year_began, ended: row.year_ended });
  }

  const newCandidateIds = new Set();
  for (const v of needsResolution) {
    for (const gcdId of candidatesByTitle.get(v.title) ?? []) {
      if (!issueSets.has(gcdId)) newCandidateIds.add(gcdId);
    }
  }
  console.log(`New candidate gcd_ids to fetch issue lists for: ${newCandidateIds.size}`);
  const newIssueSets = await fetchIssueSets([...newCandidateIds]);
  for (const [k, v] of newIssueSets) issueSets.set(k, v);

  // Score every needs-resolution volume against ALL candidates (existing
  // tags + title-expansion pool). `plan` already holds pin-driven relinks
  // from the loop above — this appends the overlap-scored ones to the same
  // array so the summary and apply step below cover both in one pass.
  let resolved = 0, skippedNoCandidate = 0, skippedAmbiguous = 0, skippedSameYear = 0, yearGated = 0, totalRowsToUpdate = pinnedRelinkRows;
  for (const v of needsResolution) {
    const candidateIds = new Set([
      ...v.rows.map((r) => r.series_gcd_id).filter((x) => x != null),
      ...(candidatesByTitle.get(v.title) ?? []),
    ]);
    let best = null, second = null;
    for (const gcdId of candidateIds) {
      if (!yearsCompatible(v.startYear, seriesYears.get(gcdId))) { yearGated++; continue; }
      const overlap = overlapOf(v.volIssueNumbers, issueSets.get(gcdId));
      if (!best || overlap > best.overlap) { second = best; best = { gcdId, overlap }; }
      else if (!second || overlap > second.overlap) { second = { gcdId, overlap }; }
    }
    if (!best || best.overlap < OVERLAP_THRESHOLD) { skippedNoCandidate++; continue; }
    if (second && best.overlap - second.overlap < MIN_MARGIN) { skippedAmbiguous++; continue; }
    // If some candidate began the same year this volume started and it is
    // not the winner, do not move. The GCD mirror is thin on recent series,
    // so a brand-new run can score under 85% simply because its issues are
    // not indexed yet, and an older same-titled run then wins on numbers
    // (Avengers 2023 -> Avengers 2019-2024 in the 2026-09-21 audit).
    // Leaving the volume alone is the safe failure; a later mirror refresh
    // resolves it.
    if (v.startYear) {
      const sameYearOther = [...candidateIds].some(
        (gcdId) => gcdId !== best.gcdId && seriesYears.get(gcdId)?.began === v.startYear
      );
      if (sameYearOther && seriesYears.get(best.gcdId)?.began !== v.startYear) { skippedSameYear++; continue; }
    }

    const rowsToFix = v.rows.filter((r) => r.series_gcd_id !== best.gcdId);
    if (rowsToFix.length === 0) continue;
    resolved++;
    totalRowsToUpdate += rowsToFix.length;
    plan.push({
      volume: v.volume, title: v.title, winner: best.gcdId, overlap: best.overlap,
      runnerUp: second ? { gcdId: second.gcdId, overlap: second.overlap } : null,
      currentGcdIds: [...new Set(rowsToFix.map((r) => r.series_gcd_id))],
      rowIds: rowsToFix.map((r) => r.id),
    });
  }

  console.log(
    `\nResolved: ${pinnedRelinks} volume(s) pin-driven (${pinnedRelinkRows} rows) + ` +
      `${resolved} volume(s) overlap-driven (${totalRowsToUpdate - pinnedRelinkRows} rows) = ` +
      `${totalRowsToUpdate} total rows to relink`
  );
  console.log(`Skipped — no candidate cleared ${OVERLAP_THRESHOLD * 100}% overlap: ${skippedNoCandidate}`);
  console.log(`Skipped — ambiguous (winner/runner-up within ${MIN_MARGIN * 100} points): ${skippedAmbiguous}`);
  console.log(`Candidates excluded by the year gate (series not in publication at the volume's start year): ${yearGated}`);
  console.log(`Skipped — a same-start-year series exists but did not win (GCD mirror likely thin): ${skippedSameYear}`);
  // Single machine-parseable line for checkCoverIngestHealth.js --mode=mislink
  // to regex out — added 2026-08-27 alongside the pin-priority feature above,
  // since that change also reworded the human-readable summary this used to
  // scrape directly. Keep this line's format stable even if the prose above
  // changes again.
  console.log(`TOTAL_RESOLVED_VOLUMES: ${pinnedRelinks + resolved}`);

  if (plan.length > 0) {
    console.log("\nTop 20 by rows affected:");
    for (const p of plan.sort((a, b) => b.rowIds.length - a.rowIds.length).slice(0, 20)) {
      const scoreLabel = p.overlap == null ? "pinned" : `overlap ${(p.overlap * 100).toFixed(0)}%`;
      console.log(`  ${p.title} -> series_gcd_id ${p.winner} (${scoreLabel}), ${p.rowIds.length} row(s)`);
    }
  }

  if (PLAN_JSON) {
    fs.writeFileSync(PLAN_JSON, JSON.stringify(plan, null, 2));
    console.log(`Plan written to ${PLAN_JSON} (${plan.length} volumes)`);
  }
  if (DRY_RUN) {
    console.log("\n[dry-run] No writes performed.");
    return;
  }

  console.log("\nApplying...");
  let totalUpdated = 0;
  for (const p of plan) {
    for (let i = 0; i < p.rowIds.length; i += 500) {
      const chunk = p.rowIds.slice(i, i + 500);
      const { data, error } = await supabase.from("canonical_covers").update({ series_gcd_id: p.winner }).in("id", chunk).select("id");
      if (error) { console.error(`volume=${p.volume} error:`, error.message); continue; }
      totalUpdated += data?.length ?? 0;
    }
  }
  console.log(`\nDone. Rows updated: ${totalUpdated}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
