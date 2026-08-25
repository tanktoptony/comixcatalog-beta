// Targeted cover-linking repair for FEATURED_SERIES entries that are
// currently failing the full-coverage gate in /api/comics/route.js.
//
// Generalizes the fix applied manually to Excalibur and via
// propagateGcdIdByCvVolume.js: GCD frequently carries MANY distinct series
// entries sharing an identical title (foreign editions, reprints, digest
// collections, unrelated one-shots) — "Ultimate Spider-Man" alone has 30
// separate gcd_series rows under Marvel Comics. propagateGcdIdByCvVolume.js
// only fixes a ComicVine volume whose covers are already SPLIT across
// multiple series_gcd_id values. It can't catch the other failure shape:
// a volume's covers all consistently landing on ONE wrong gcd_id, with the
// real (site-chosen) gcd_id sitting at zero. Confirmed live: Ultimate
// Spider-Man (2024) — 24 real covers for volume 155969 all tagged to
// gcd_id 219616, while the site's actual series (gcd_id 206726, matched via
// the same prefer_year + issue_count_cached tiebreak /api/comics uses) had
// zero.
//
// For each FEATURED_SERIES entry:
//   1. Resolve to the same `series` row /api/comics would pick.
//   2. Find every OTHER gcd_series row sharing the exact same name.
//   3. For each candidate's covers (grouped by comicvine_volume_id), score
//      issue-number overlap against the site's chosen series' real issue
//      list. If a candidate volume clears 85% overlap, relink its covers to
//      the site's series_gcd_id.
//   4. Report, per entry, how many covers got relinked and whether it now
//      passes the full-coverage gate — series still short after relinking
//      have a genuine gap that needs real ComicVine ingest, not relinking.
//
// Usage:
//   node scripts/repairFeaturedSeriesCoverage.js --dry-run
//   node scripts/repairFeaturedSeriesCoverage.js

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { FEATURED_SERIES } from "../src/lib/featuredSeries.js";
import { baseIssueNumber } from "../src/lib/coverMatch.js";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes("--dry-run");
const OVERLAP_THRESHOLD = 0.85;
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

const norm = (v) => String(v ?? "").trim().toLowerCase();

async function resolveSiteSeries(entry, rowsByKey) {
  const key = `${norm(entry.title)}::${norm(entry.publisher)}`;
  const pool = rowsByKey.get(key) ?? [];
  if (pool.length === 0) return null;
  let best = pool[0];
  let bestYearDelta = Infinity;
  let bestIssueCount = -1;
  for (const row of pool) {
    const yearDelta = entry.prefer_year != null && row.year_start_cached != null
      ? Math.abs(row.year_start_cached - entry.prefer_year) : Infinity;
    const issueCount = row.issue_count_cached ?? 0;
    if (yearDelta < bestYearDelta || (yearDelta === bestYearDelta && issueCount > bestIssueCount)) {
      best = row; bestYearDelta = yearDelta; bestIssueCount = issueCount;
    }
  }
  return best;
}

async function run() {
  const titles = [...new Set(FEATURED_SERIES.map((e) => e.title))];
  const rows = await fetchAllPages(() =>
    supabase.from("series").select("id, gcd_id, title, resolved_publisher_cached, year_start_cached, issue_count_cached").in("title", titles)
  );
  const rowsByKey = new Map();
  for (const row of rows) {
    const key = `${norm(row.title)}::${norm(row.resolved_publisher_cached)}`;
    if (!rowsByKey.has(key)) rowsByKey.set(key, []);
    rowsByKey.get(key).push(row);
  }

  let totalRelinked = 0;
  let seriesFixed = 0;
  let seriesStillShort = 0;
  let seriesSkippedNoGcdId = 0;

  for (const entry of FEATURED_SERIES) {
    const siteRow = await resolveSiteSeries(entry, rowsByKey);
    if (!siteRow?.gcd_id) { seriesSkippedNoGcdId++; continue; }
    const targetGcdId = siteRow.gcd_id;

    const realIssues = await fetchAllPages(() =>
      supabase.from("gcd_issues").select("issue_number").eq("series_gcd_id", targetGcdId)
    );
    const realIssueSet = new Set(realIssues.map((i) => baseIssueNumber(i.issue_number)).filter(Boolean));
    if (realIssueSet.size === 0) continue;

    const currentCovers = await fetchAllPages(() =>
      supabase.from("canonical_covers").select("issue_number").eq("series_gcd_id", targetGcdId).not("storage_path", "is", null)
    );
    const alreadyCoveredSet = new Set(currentCovers.map((c) => baseIssueNumber(c.issue_number)).filter(Boolean));
    const missingBefore = [...realIssueSet].filter((n) => !alreadyCoveredSet.has(n)).length;
    if (missingBefore === 0) continue; // already fully covered, not one we need to touch

    // Candidate pool: every OTHER gcd_series row with the exact same name.
    const { data: sameName, error: sameNameErr } = await supabase
      .from("gcd_series").select("gcd_id").eq("name", entry.title).neq("gcd_id", targetGcdId);
    if (sameNameErr) throw sameNameErr;
    const candidateGcdIds = [...new Set((sameName ?? []).map((r) => r.gcd_id))];
    if (candidateGcdIds.length === 0) { if (missingBefore > 0) seriesStillShort++; continue; }

    const candidateCovers = await fetchAllPages(() =>
      supabase.from("canonical_covers").select("id, series_gcd_id, comicvine_volume_id, issue_number")
        .in("series_gcd_id", candidateGcdIds).not("storage_path", "is", null).not("comicvine_volume_id", "is", null)
    );

    const byVolume = new Map();
    for (const c of candidateCovers) {
      const key = c.comicvine_volume_id;
      if (!byVolume.has(key)) byVolume.set(key, []);
      byVolume.get(key).push(c);
    }

    const rowIdsToRelink = [];
    for (const [, volRows] of byVolume) {
      const volIssueNumbers = new Set(volRows.map((r) => baseIssueNumber(r.issue_number)).filter(Boolean));
      if (volIssueNumbers.size === 0) continue;
      let matched = 0;
      for (const n of volIssueNumbers) if (realIssueSet.has(n)) matched++;
      const overlap = matched / volIssueNumbers.size;
      if (overlap >= OVERLAP_THRESHOLD) {
        for (const r of volRows) rowIdsToRelink.push(r.id);
      }
    }

    if (rowIdsToRelink.length === 0) {
      seriesStillShort++;
      continue;
    }

    console.log(`${entry.title} (${entry.publisher}, target gcd_id ${targetGcdId}): relinking ${rowIdsToRelink.length} cover(s) from ${candidateGcdIds.length} candidate series`);
    totalRelinked += rowIdsToRelink.length;
    seriesFixed++;

    if (!DRY_RUN) {
      for (let i = 0; i < rowIdsToRelink.length; i += 500) {
        const chunk = rowIdsToRelink.slice(i, i + 500);
        const { error: updateErr } = await supabase.from("canonical_covers").update({ series_gcd_id: targetGcdId }).in("id", chunk);
        if (updateErr) console.error(`  update failed for a chunk: ${updateErr.message}`);
      }
    }
  }

  console.log(`\n${DRY_RUN ? "[dry-run] " : ""}Done.`);
  console.log(`Series relinked (had a fixable wrong-gcd-id volume): ${seriesFixed}, ${totalRelinked} covers`);
  console.log(`Series still short after relink pass (genuine ComicVine gap, needs real ingest): ${seriesStillShort}`);
  console.log(`Series skipped (no gcd_id, can't verify): ${seriesSkippedNoGcdId}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
