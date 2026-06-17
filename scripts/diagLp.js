import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: s } = await supabase.from("series").select("id, gcd_id, title").eq("id", "cbea991a-9c77-46c8-8ed6-b8254a6c81f1").single();
console.log("series:", s);

const { data: cc } = await supabase.from("canonical_covers").select("series_title, series_gcd_id, issue_number, storage_path").ilike("series_title", "%lethal protector%").limit(20);
console.log("\ncanonical_covers matching 'lethal protector':");
for (const r of cc ?? []) console.log(`  "${r.series_title}" #${r.issue_number} cv_gcd=${r.series_gcd_id} path=${r.storage_path ? 'Y' : 'N'}`);
