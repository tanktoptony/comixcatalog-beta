import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Find treystyles' Transformers gcd issues
const { data: p } = await supabase.from("profiles").select("id").eq("username", "treystyles").single();
const { data: items } = await supabase.from("user_collections").select("gcd_issue_id").eq("user_id", p.id);
const ids = items.map(i => i.gcd_issue_id).filter(Boolean);
const { data: issues } = await supabase.from("gcd_issues").select("gcd_id, series_gcd_id, issue_number, publication_date").in("gcd_id", ids);

// Just Transformers
const { data: tfmSeries } = await supabase.from("series").select("gcd_id, title").ilike("title", "%transformers%").not("title", "ilike", "%universe%").not("title", "ilike", "%movie%");
const tfmGcdIds = new Set(tfmSeries.map(s => s.gcd_id));
const tfmIssues = issues.filter(i => tfmGcdIds.has(i.series_gcd_id));
console.log("treystyles' Transformers issues:");
for (const i of tfmIssues) {
  const s = tfmSeries.find(t => t.gcd_id === i.series_gcd_id);
  console.log(`  "${s?.title}" #${i.issue_number} (series_gcd_id=${i.series_gcd_id}) pubdate=${i.publication_date}`);
}

const userSeriesGcds = [...new Set(tfmIssues.map(i => i.series_gcd_id))];
console.log("\nDistinct user-side series_gcd_ids:", userSeriesGcds);

// What canonical_covers exist for #21 of various Transformers volumes
const { data: cc21 } = await supabase.from("canonical_covers").select("series_title, series_gcd_id, series_year, cover_date, storage_path").ilike("series_title", "%transformers%").eq("issue_number", "21").limit(20);
console.log("\ncanonical_covers for any '%transformers%' #21:");
for (const r of cc21 ?? []) console.log(`  "${r.series_title}" series_year=${r.series_year} cd=${r.cover_date} cv_gcd=${r.series_gcd_id} path=${r.storage_path?.slice(0,60)}`);
