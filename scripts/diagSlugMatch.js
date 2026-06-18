import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await supabase.from("series").select("id, gcd_id, title, title_normalized, year_start_cached").eq("title_normalized", "spiderman").limit(20);
console.log("series with title_normalized='spiderman':");
for (const r of data ?? []) console.log(`  gcd_id=${r.gcd_id}  title="${r.title}" year_start=${r.year_start_cached}`);

const { data: arcRow } = await supabase.from("story_arc_issues").select("series_title, issue_number, gcd_issue_id, cv_site_url").eq("cv_issue_id", 37374).maybeSingle();
console.log("\nstory_arc_issues row for cv 37374:");
console.log(arcRow);
