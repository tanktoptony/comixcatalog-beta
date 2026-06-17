import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { count: arcCount } = await supabase.from("story_arcs").select("*", { count: "exact", head: true });
console.log("story_arcs total:", arcCount);

const { data: maxCarnage } = await supabase.from("story_arcs").select("id, name, deck").ilike("name", "%maximum carnage%");
console.log("\nMaximum Carnage arc(s):", maxCarnage);

if (maxCarnage?.[0]) {
  const arcId = maxCarnage[0].id;
  const { data: issues } = await supabase.from("story_arc_issues").select("gcd_issue_id, sequence").eq("story_arc_id", arcId).order("sequence").limit(20);
  console.log(`\nIssues linked to Maximum Carnage (${issues?.length ?? 0}):`);
  for (const i of issues ?? []) console.log("  ", i);
}
