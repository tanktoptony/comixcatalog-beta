// One-time (and safely re-runnable) backfill for series.comicvine_volume_id
// — see scripts/migrations/0022_series_comicvine_volume_id.sql for why this
// column exists. Run this AFTER applying that migration, and after any bulk
// cover-relink pass (repairAllCoverSeriesLinks.js etc.) so the pin reflects
// clean data, not whatever was tagged before the relink.
//
// For each series with a gcd_id, look at its own canonical_covers rows: if
// they agree on a single comicvine_volume_id (or one volume clearly
// dominates), pin it. Series with no covers yet, or with covers split
// across genuinely different volumes with no clear majority, are left null
// — nothing to pin confidently yet.
//
// Usage:
//   node scripts/backfillSeriesComicvineVolumeId.js --dry-run
//   node scripts/backfillSeriesComicvineVolumeId.js

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes("--dry-run");
const MIN_MAJORITY = 0.9; // dominant volume must account for >=90% of the series' covers
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

async function run() {
  console.log("Loading series with a gcd_id...");
  const series = await fetchAllPages(() =>
    supabase.from("series").select("id, gcd_id, comicvine_volume_id").not("gcd_id", "is", null).order("id")
  );
  console.log(`Series with gcd_id: ${series.length}`);

  console.log("Loading all covers with series_gcd_id + comicvine_volume_id...");
  const covers = await fetchAllPages(() =>
    supabase.from("canonical_covers").select("series_gcd_id, comicvine_volume_id")
      .not("series_gcd_id", "is", null).not("comicvine_volume_id", "is", null).order("id")
  );
  console.log(`Covers loaded: ${covers.length}`);

  const volumesByGcdId = new Map();
  for (const c of covers) {
    if (!volumesByGcdId.has(c.series_gcd_id)) volumesByGcdId.set(c.series_gcd_id, new Map());
    const counts = volumesByGcdId.get(c.series_gcd_id);
    counts.set(c.comicvine_volume_id, (counts.get(c.comicvine_volume_id) ?? 0) + 1);
  }

  let toPin = 0, alreadyCorrect = 0, noCovers = 0, noMajority = 0, updates = [];
  for (const s of series) {
    const counts = volumesByGcdId.get(s.gcd_id);
    if (!counts || counts.size === 0) { noCovers++; continue; }
    let total = 0;
    for (const c of counts.values()) total += c;
    let bestVol = null, bestCount = -1;
    for (const [vol, c] of counts) if (c > bestCount) { bestVol = vol; bestCount = c; }
    if (bestCount / total < MIN_MAJORITY) { noMajority++; continue; }
    if (s.comicvine_volume_id === bestVol) { alreadyCorrect++; continue; }
    toPin++;
    updates.push({ id: s.id, gcd_id: s.gcd_id, volume: bestVol });
  }

  console.log(`\nWill pin: ${toPin}`);
  console.log(`Already correctly pinned: ${alreadyCorrect}`);
  console.log(`No covers yet (nothing to pin): ${noCovers}`);
  console.log(`Covers exist but no clear majority volume (>=${MIN_MAJORITY * 100}%): ${noMajority}`);

  if (DRY_RUN) {
    console.log("\n[dry-run] No writes performed.");
    return;
  }

  console.log("\nApplying...");
  let updated = 0;
  for (const u of updates) {
    const { error } = await supabase.from("series").update({ comicvine_volume_id: u.volume }).eq("id", u.id);
    if (error) { console.error(`series ${u.id} (gcd_id ${u.gcd_id}) failed:`, error.message); continue; }
    updated++;
  }
  console.log(`\nDone. Series pinned: ${updated}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
