import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const gcdIds = [1939, 2516, 3433, 13912];
const { data } = await supabase.from("series").select("gcd_id, title").in("gcd_id", gcdIds);
for (const r of data) console.log(`gcd_id=${r.gcd_id} title=${JSON.stringify(r.title)}`);
