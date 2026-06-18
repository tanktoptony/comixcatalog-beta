import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// What canonical_covers rows exist for Spider-Man Unlimited #1?
console.log("=== canonical_covers for Spider-Man Unlimited #1 ===");
const { data: r1 } = await supabase
  .from("canonical_covers")
  .select("series_title, issue_number, series_year, cover_date, storage_path")
  .ilike("series_title", "%spider-man unlimited%")
  .eq("issue_number", "1");
for (const r of r1 ?? []) console.log(`  "${r.series_title}" #${r.issue_number} year=${r.series_year} cd=${r.cover_date} path=${r.storage_path}`);

console.log("\n=== canonical_covers for Amazing Spider-Man #378 ===");
const { data: r2 } = await supabase
  .from("canonical_covers")
  .select("series_title, issue_number, series_year, cover_date, storage_path")
  .ilike("series_title", "%amazing spider%")
  .eq("issue_number", "378");
for (const r of r2 ?? []) console.log(`  "${r.series_title}" #${r.issue_number} year=${r.series_year} cd=${r.cover_date} path=${r.storage_path}`);

console.log("\n=== canonical_covers for Spectacular Spider-Man #201 ===");
const { data: r3 } = await supabase
  .from("canonical_covers")
  .select("series_title, issue_number, series_year, cover_date, storage_path")
  .ilike("series_title", "%spectacular spider%")
  .eq("issue_number", "201");
for (const r of r3 ?? []) console.log(`  "${r.series_title}" #${r.issue_number} year=${r.series_year} cd=${r.cover_date} path=${r.storage_path}`);
