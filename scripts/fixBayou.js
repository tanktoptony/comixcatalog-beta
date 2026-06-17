import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from("canonical_covers").update({ series_gcd_id: 11926 }).eq("series_title", "Adventures of Bayou Billy").select("id");
console.log("updated rows:", data?.length, "error:", error?.message);
