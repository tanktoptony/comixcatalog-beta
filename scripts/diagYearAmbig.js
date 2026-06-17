import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Sample 5 rows from the unresolved bucket
console.log("=== Sample 5 unresolved rows ===");
const { data: sample } = await supabase
  .from("canonical_covers")
  .select("id, series_title, issue_number, series_year, cover_date, comicvine_volume_id, storage_path")
  .is("series_gcd_id", null)
  .not("series_title", "is", null)
  .limit(5);
for (const r of sample ?? []) {
  console.log(`  "${r.series_title}" #${r.issue_number} series_year=${r.series_year} cover_date=${r.cover_date} cv_vol=${r.comicvine_volume_id} path=${r.storage_path?.slice(0, 80)}`);
}

// 2. How many unresolved rows have a comicvine_volume_id (uuid) set
const { count: total } = await supabase.from("canonical_covers").select("*", { count: "exact", head: true }).is("series_gcd_id", null);
const { count: withCvVol } = await supabase.from("canonical_covers").select("*", { count: "exact", head: true }).is("series_gcd_id", null).not("comicvine_volume_id", "is", null);
console.log(`\n=== Unresolved rows with comicvine_volume_id: ${withCvVol}/${total} ===`);

// 3. How many unresolved rows have a vol-XXX in their storage_path
const { data: pathSample } = await supabase
  .from("canonical_covers")
  .select("storage_path")
  .is("series_gcd_id", null)
  .not("storage_path", "is", null)
  .limit(20);
let withVolN = 0;
for (const r of pathSample ?? []) {
  if (/\/vol-\d+\//.test(r.storage_path ?? "")) withVolN++;
}
console.log(`Sample of 20 unresolved rows: ${withVolN} have vol-N in storage_path`);

// 4. Propagation test: for a CV volume where SOME rows have series_gcd_id, are there other rows without?
console.log("\n=== Propagation potential ===");
// Try grouping by path prefix as the volume identifier
const { data: tagged } = await supabase
  .from("canonical_covers")
  .select("storage_path, series_gcd_id")
  .not("series_gcd_id", "is", null)
  .not("storage_path", "is", null)
  .limit(500);
const volToGcdId = new Map();
for (const r of tagged ?? []) {
  const m = (r.storage_path ?? "").match(/\/vol-(\d+)\//);
  if (m) {
    if (!volToGcdId.has(m[1])) volToGcdId.set(m[1], r.series_gcd_id);
  }
}
console.log(`From 500 tagged rows: ${volToGcdId.size} distinct CV volume IDs identified`);
console.log(`Sample: vol-${[...volToGcdId.entries()][0]?.[0]} → series_gcd_id=${[...volToGcdId.entries()][0]?.[1]}`);
