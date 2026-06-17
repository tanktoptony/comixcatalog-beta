import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await supabase.from("canonical_covers").select("series_title, issue_number, series_year, cover_date, storage_path").ilike("series_title", "%bayou billy%");
console.log("canonical_covers matches:", data?.length ?? 0);
for (const r of data ?? []) console.log(`  "${r.series_title}" #${r.issue_number} year=${r.series_year} cd=${r.cover_date} path=${r.storage_path?'Y':'N'}`);
