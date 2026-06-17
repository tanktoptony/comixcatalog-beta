import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: series } = await supabase
  .from("series")
  .select("id, gcd_id, title")
  .eq("id", "d95c4fe2-1dd8-4efd-81f6-0cc4337e0bed")
  .single();
console.log("series:", series);

console.log("\nID-path lookup (series_gcd_id ==", series.gcd_id, "):");
const { data: idMatch } = await supabase
  .from("canonical_covers")
  .select("series_title, series_gcd_id, issue_number, storage_path")
  .eq("series_gcd_id", series.gcd_id)
  .limit(5);
console.log("  found:", idMatch?.length ?? 0);
for (const r of idMatch ?? []) console.log("  ", r);

console.log("\nTitle-path lookup (series_title ==", JSON.stringify(series.title), "):");
const { data: titleMatch } = await supabase
  .from("canonical_covers")
  .select("series_title, series_gcd_id, issue_number, storage_path")
  .eq("series_title", series.title)
  .limit(5);
console.log("  found:", titleMatch?.length ?? 0);

console.log("\nilike lookup for any 'G.I. Joe' '#1':");
const { data: any1 } = await supabase
  .from("canonical_covers")
  .select("series_title, series_gcd_id, issue_number, storage_path")
  .ilike("series_title", "%g.i. joe%real american%")
  .eq("issue_number", "1");
for (const r of any1 ?? []) console.log("  ", r);
