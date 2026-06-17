import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: profile } = await supabase
  .from("profiles")
  .select("id, username")
  .eq("username", "treystyles")
  .single();

console.log("user:", profile);

const { data: items } = await supabase
  .from("user_collections")
  .select("id, gcd_issue_id, status")
  .eq("user_id", profile.id);

const gcdIds = items.map((i) => i.gcd_issue_id).filter(Boolean);
const { data: issues } = await supabase
  .from("gcd_issues")
  .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date")
  .in("gcd_id", gcdIds);

const seriesGcdIds = [...new Set(issues.map((i) => i.series_gcd_id))];
const { data: seriesRows } = await supabase
  .from("series")
  .select("gcd_id, title")
  .in("gcd_id", seriesGcdIds);

const seriesMap = Object.fromEntries(seriesRows.map((s) => [s.gcd_id, s.title]));

console.log("\nuser's owned issues:");
for (const i of issues) {
  const title = seriesMap[i.series_gcd_id];
  console.log(`  gcd_issue_id=${i.gcd_id} series_gcd_id=${i.series_gcd_id} title="${title}" #${i.issue_number} pubdate=${i.publication_date} keydate=${i.key_date}`);
}
