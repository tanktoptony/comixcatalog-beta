import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(dirname, "../.env.local") });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: rowCount, error } = await supabase.rpc("refresh_issue_base_stats");
  if (error) throw error;
  const labels = [["have", "have"], ["want", "want"], ["for_sale", "for sale"]];
  const counts = {};
  for (const [column, label] of labels) {
    const { count, error: countError } = await supabase.from("issue_base_stats")
      .select("base_gcd_issue_id", { count: "exact", head: true }).gte(column, 3);
    if (countError) throw countError;
    counts[label] = count ?? 0;
  }
  console.log(`Refreshed ${rowCount ?? 0} issue bases.`);
  console.log(`Visible at 3+: have=${counts.have}, want=${counts.want}, for sale=${counts["for sale"]}`);
}

run().catch((error) => {
  console.error("Issue stats refresh failed:", error);
  process.exit(1);
});
