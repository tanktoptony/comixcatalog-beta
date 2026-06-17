import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const targets = [
  { series_title: "Conan the Barbarian", issue_number: "183" },
  { series_title: "Conan the Barbarian", issue_number: "249" },
  { series_title: "Rom", issue_number: "75" },
  { series_title: "Silver Surfer", issue_number: "50" },
  { series_title: "Teenage Mutant Ninja Turtles", issue_number: "39" },
];

for (const t of targets) {
  const { data } = await supabase
    .from("canonical_covers")
    .select("id, series_title, issue_number, series_year, cover_date, series_gcd_id, storage_path")
    .ilike("series_title", t.series_title)
    .eq("issue_number", t.issue_number);
  console.log(`\n${t.series_title} #${t.issue_number}: ${data?.length ?? 0} canonical_covers row(s)`);
  for (const r of data ?? []) {
    console.log(`  "${r.series_title}" #${r.issue_number} series_year=${r.series_year} cover_date=${r.cover_date} series_gcd_id=${r.series_gcd_id} path=${r.storage_path ? "Y" : "N"}`);
  }
}
