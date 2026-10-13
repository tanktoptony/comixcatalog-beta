import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const query = sb.from("sold_items").select("id", { count: "exact" }).eq("status", "pending_buyer").lt("created_at", cutoff);
const { count, error } = apply
  ? await sb.from("sold_items").update({ status: "expired" }).eq("status", "pending_buyer").lt("created_at", cutoff).select("id", { count: "exact", head: true })
  : await query;
if (error) throw error;
console.log(`${apply ? "Expired" : "Would expire"} ${count ?? 0} pending sale(s).`);
