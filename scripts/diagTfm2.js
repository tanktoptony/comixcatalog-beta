import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: s32544 } = await supabase.from("series").select("*").eq("gcd_id", 32544).maybeSingle();
console.log("series 32544:", s32544);
const { data: gs32544 } = await supabase.from("gcd_series").select("*").eq("gcd_id", 32544).maybeSingle();
console.log("\ngcd_series 32544:", gs32544);

const { data: s2898 } = await supabase.from("series").select("*").eq("gcd_id", 2898).maybeSingle();
console.log("\nseries 2898:", s2898);
const { data: gs2898 } = await supabase.from("gcd_series").select("*").eq("gcd_id", 2898).maybeSingle();
console.log("\ngcd_series 2898:", gs2898);

// How many gcd_issues are under each?
const { count: c1 } = await supabase.from("gcd_issues").select("*", { count: "exact", head: true }).eq("series_gcd_id", 32544);
const { count: c2 } = await supabase.from("gcd_issues").select("*", { count: "exact", head: true }).eq("series_gcd_id", 2898);
console.log(`\nissue counts — 32544: ${c1}  vs 2898: ${c2}`);
