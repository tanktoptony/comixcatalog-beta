import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: s } = await supabase.from("series").select("id, gcd_id, title").eq("id", "168a0f96-1f29-47f2-9135-88c664df60bc").maybeSingle();
console.log("Sandman series row:", s);
