import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log("=== series table ===");
const { data: s1 } = await supabase.from("series").select("id, title, year_start_cached, resolved_publisher_cached").ilike("title", "%skating%");
console.log(s1);

console.log("\n=== gcd_series table ===");
const { data: s2 } = await supabase.from("gcd_series").select("gcd_id, name, year_began").ilike("name", "%skating%");
console.log(s2);

console.log("\n=== canonical_covers ===");
const { data: s3 } = await supabase.from("canonical_covers").select("series_title, issue_number, storage_path").ilike("series_title", "%skating%");
console.log(s3);

console.log("\n=== broader: amazing spider-man PSA-ish ===");
const { data: s4 } = await supabase.from("gcd_series").select("gcd_id, name, year_began").ilike("name", "%amazing spider%").eq("year_began", 1990);
console.log(s4?.slice(0, 10));
