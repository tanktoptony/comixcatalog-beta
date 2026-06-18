import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: arc } = await supabase.from("story_arcs").select("*").limit(1).maybeSingle();
console.log("story_arcs columns:", arc ? Object.keys(arc) : "empty table");
console.log("sample:", arc);

const { data: link } = await supabase.from("story_arc_issues").select("*").limit(1).maybeSingle();
console.log("\nstory_arc_issues columns:", link ? Object.keys(link) : "empty table");
console.log("sample:", link);
