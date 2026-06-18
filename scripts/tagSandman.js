import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase
  .from("canonical_covers")
  .update({ series_gcd_id: 3817 })
  .like("storage_path", "comicvine/the-sandman/vol-4207/%")
  .is("series_gcd_id", null)
  .select("id");
console.log("tagged:", data?.length, "err:", error?.message);
