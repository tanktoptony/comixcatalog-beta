import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// CV volume 3138 = Marvel 1982 G.I. Joe ARAH. Marvel series.gcd_id = 2652.
const { data, error } = await supabase
  .from("canonical_covers")
  .update({ series_gcd_id: 2652 })
  .like("storage_path", "comicvine/g-i-joe-a-real-american-hero/vol-3138/%")
  .is("series_gcd_id", null)
  .select("id");
console.log("rows tagged:", data?.length, "err:", error?.message);
