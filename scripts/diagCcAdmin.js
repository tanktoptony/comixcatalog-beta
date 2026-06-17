import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: p } = await supabase.from("profiles").select("id").eq("username", "cc_admin").single();
const { data: items } = await supabase
  .from("user_collections")
  .select("id, gcd_issue_id, comic_id, user_cover_url, comics(series_title, issue_number)")
  .eq("user_id", p.id);

const gcdLinked = items.filter(i => i.gcd_issue_id);
const localLinked = items.filter(i => i.comic_id && !i.gcd_issue_id);
console.log(`total: ${items.length}  gcd-linked: ${gcdLinked.length}  local-linked: ${localLinked.length}`);

console.log("\nLOCAL-linked (these bypass canonical_covers ID join):");
for (const i of localLinked.slice(0, 30)) {
  console.log(`  "${i.comics?.series_title}" #${i.comics?.issue_number}  user_cover=${i.user_cover_url ? 'Y':'N'}`);
}
