// Quick diagnostic for why the backfill matcher is failing.
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 1. How many canonical_covers rows have series_year populated?
const { count: total } = await supabase
  .from("canonical_covers")
  .select("*", { count: "exact", head: true })
  .is("series_gcd_id", null);

const { count: withYear } = await supabase
  .from("canonical_covers")
  .select("*", { count: "exact", head: true })
  .is("series_gcd_id", null)
  .not("series_year", "is", null);

console.log(`canonical_covers w/ null series_gcd_id: ${total}`);
console.log(`  of those, series_year populated:     ${withYear}`);

// 2. Sample 10 rows, show what series matches each finds.
const { data: sample } = await supabase
  .from("canonical_covers")
  .select("id, series_title, series_year")
  .is("series_gcd_id", null)
  .not("series_title", "is", null)
  .limit(10);

console.log("\nSample lookups:");
for (const r of sample) {
  const { data: exact } = await supabase
    .from("series")
    .select("gcd_id, title, year_start_cached")
    .eq("title", r.series_title)
    .not("gcd_id", "is", null)
    .limit(10);
  const { data: ilike } = await supabase
    .from("series")
    .select("gcd_id, title, year_start_cached")
    .ilike("title", r.series_title)
    .not("gcd_id", "is", null)
    .limit(10);
  console.log(`\n  "${r.series_title}" (year=${r.series_year})`);
  console.log(`    exact matches: ${exact.length}`);
  if (exact.length) {
    for (const e of exact.slice(0, 5)) console.log(`      → ${e.gcd_id} | ${e.title} | year=${e.year_start_cached}`);
  }
  if (exact.length === 0) {
    console.log(`    ilike matches: ${ilike.length}`);
    for (const e of ilike.slice(0, 5)) console.log(`      → ${e.gcd_id} | ${e.title} | year=${e.year_start_cached}`);
  }
}
