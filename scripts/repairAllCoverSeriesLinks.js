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

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { baseIssueNumber } from "../src/lib/coverMatch.js";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes("--dry-run");
const OVERLAP_THRESHOLD = 0.85;
const MIN_MARGIN = 0.15;
const PAGE = 1000;

async function fetchAllPages(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function fetchIssueSets(gcdIds) {
  const map = new Map();
  const ids = [...new Set(gcdIds)].filter((v) => v != null);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data, error } = await supabase.from("gcd_issues").select("series_gcd_id, issue_number").in("series_gcd_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const key = row.series_gcd_id;
      const base = baseIssueNumber(row.issue_number);
      if (base == null) continue;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(base);
    }
  }
  return map;
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

async function run() {
  console.log("Loading all covers with a comicvine_volume_id...");
  const covers = await fetchAllPages(() =>
    supabase.from("canonical_covers").select("id, comicvine_volume_id, series_gcd_id, issue_number, series_title")
      .not("comicvine_volume_id", "is", null).not("storage_path", "is", null).order("id")
  );
  console.log(`Covers loaded: ${covers.length}`);

  const byVolume = new Map();
  for (const c of covers) {
    if (!byVolume.has(c.comicvine_volume_id)) byVolume.set(c.comicvine_volume_id, []);
    byVolume.get(c.comicvine_volume_id).push(c);
  }
  console.log(`Distinct ComicVine volumes: ${byVolume.size}`);

  // Pass 1: cheap check against currently-existing tags only.
  const existingTagIds = [...new Set(covers.map((c) => c.series_gcd_id).filter((v) => v != null))];
  console.log(`Distinct series_gcd_id values currently in use: ${existingTagIds.length}`);
  const issueSets = await fetchIssueSets(existingTagIds);

  const needsResolution = [];
  let alreadyClean = 0;
  for (const [volume, rows] of byVolume) {
    const volIssueNumbers = new Set(rows.map((r) => baseIssueNumber(r.issue_number)).filter(Boolean));
    if (volIssueNumbers.size === 0) continue;
    const distinctTags = new Set(rows.map((r) => r.series_gcd_id).filter((v) => v != null));
    if (distinctTags.size === 1) {
      const [onlyTag] = distinctTags;
      const allTagged = rows.every((r) => r.series_gcd_id === onlyTag);
      if (allTagged && overlapOf(volIssueNumbers, issueSets.get(onlyTag)) >= OVERLAP_THRESHOLD) {
        alreadyClean++;
        continue;
      }
    }
    needsResolution.push({ volume, rows, volIssueNumbers, title: mode(rows.map((r) => r.series_title)) });
  }
  console.log(`Already clean (skip): ${alreadyClean}`);
  console.log(`Needs resolution: ${needsResolution.length}`);

  // Pass 2: expand candidates via gcd_series title match for volumes that
  // didn't resolve cleanly against their existing tag(s).
  const titles = [...new Set(needsResolution.map((v) => v.title).filter(Boolean))];
  console.log(`Distinct series_title values needing candidate expansion: ${titles.length}`);

  const candidatesByTitle = new Map();
  for (let i = 0; i < titles.length; i += 200) {
    const chunk = titles.slice(i, i + 200);
    const { data, error } = await supabase.from("gcd_series").select("gcd_id, name").in("name", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      if (!candidatesByTitle.has(row.name)) candidatesByTitle.set(row.name, []);
      candidatesByTitle.get(row.name).push(row.gcd_id);
    }
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
  // tags + title-expansion pool).
  let resolved = 0, skippedNoCandidate = 0, skippedAmbiguous = 0, totalRowsToUpdate = 0;
  const plan = [];
  for (const v of needsResolution) {
    const candidateIds = new Set([
      ...v.rows.map((r) => r.series_gcd_id).filter((x) => x != null),
      ...(candidatesByTitle.get(v.title) ?? []),
    ]);
    let best = null, second = null;
    for (const gcdId of candidateIds) {
      const overlap = overlapOf(v.volIssueNumbers, issueSets.get(gcdId));
      if (!best || overlap > best.overlap) { second = best; best = { gcdId, overlap }; }
      else if (!second || overlap > second.overlap) { second = { gcdId, overlap }; }
    }
    if (!best || best.overlap < OVERLAP_THRESHOLD) { skippedNoCandidate++; continue; }
    if (second && best.overlap - second.overlap < MIN_MARGIN) { skippedAmbiguous++; continue; }

    const rowsToFix = v.rows.filter((r) => r.series_gcd_id !== best.gcdId);
    if (rowsToFix.length === 0) continue;
    resolved++;
    totalRowsToUpdate += rowsToFix.length;
    plan.push({ volume: v.volume, title: v.title, winner: best.gcdId, overlap: best.overlap, rowIds: rowsToFix.map((r) => r.id) });
  }

  console.log(`\nResolved (unambiguous winner): ${resolved} volumes, ${totalRowsToUpdate} rows to relink`);
  console.log(`Skipped — no candidate cleared ${OVERLAP_THRESHOLD * 100}% overlap: ${skippedNoCandidate}`);
  console.log(`Skipped — ambiguous (winner/runner-up within ${MIN_MARGIN * 100} points): ${skippedAmbiguous}`);

  if (plan.length > 0) {
    console.log("\nTop 20 by rows affected:");
    for (const p of plan.sort((a, b) => b.rowIds.length - a.rowIds.length).slice(0, 20)) {
      console.log(`  ${p.title} -> series_gcd_id ${p.winner} (overlap ${(p.overlap * 100).toFixed(0)}%), ${p.rowIds.length} row(s)`);
    }
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
