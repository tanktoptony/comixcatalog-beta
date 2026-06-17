// For each comicvine_volume_id where at least ONE canonical_covers row has
// series_gcd_id set, propagate that series_gcd_id to every other row sharing
// the same comicvine_volume_id. Massive coverage gain — one tagged row in a
// 300-issue volume backfills 299 more.
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PAGE = 1000;
async function fetchAllPages(buildQuery) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

console.log("Loading all tagged rows with comicvine_volume_id...");
const tagged = await fetchAllPages(() =>
  supabase
    .from("canonical_covers")
    .select("comicvine_volume_id, series_gcd_id")
    .not("series_gcd_id", "is", null)
    .not("comicvine_volume_id", "is", null)
    .order("id")
);
console.log(`Tagged rows: ${tagged.length}`);

// Build vol -> series_gcd_id map. If a vol has conflicting gcd_ids, pick the
// most common (mode).
const counts = new Map();
for (const r of tagged) {
  const k = `${r.comicvine_volume_id}::${r.series_gcd_id}`;
  counts.set(k, (counts.get(k) ?? 0) + 1);
}
const volToGcd = new Map();
const volToCount = new Map();
for (const [k, c] of counts) {
  const [vol, gcd] = k.split("::");
  if (!volToCount.has(vol) || c > volToCount.get(vol)) {
    volToGcd.set(vol, Number(gcd));
    volToCount.set(vol, c);
  }
}
console.log(`Distinct CV volumes with at least one tagged row: ${volToGcd.size}`);

console.log("\nApplying propagation in batches of 500 vols...");
let totalUpdated = 0;
const vols = [...volToGcd.keys()];
for (let i = 0; i < vols.length; i += 500) {
  const batch = vols.slice(i, i + 500);
  for (const vol of batch) {
    const gcd = volToGcd.get(vol);
    const { data, error } = await supabase
      .from("canonical_covers")
      .update({ series_gcd_id: gcd })
      .eq("comicvine_volume_id", vol)
      .is("series_gcd_id", null)
      .select("id");
    if (error) {
      console.error(`vol=${vol} error:`, error.message);
      continue;
    }
    totalUpdated += data?.length ?? 0;
  }
  console.log(`  batch ${i / 500 + 1}/${Math.ceil(vols.length / 500)} done, running total: ${totalUpdated}`);
}

console.log(`\nDone. Rows updated: ${totalUpdated}`);
