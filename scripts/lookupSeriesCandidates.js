// Read-only lookup: given a list of series-title search terms, find matching
// `series` rows and report current cover coverage for each, so ambiguous
// titles (multiple volumes/years) can be disambiguated by a human before
// queuing anything into gap-manual.json.
//
// Usage:
//   node scripts/lookupSeriesCandidates.js "West Coast Avengers" "Nova" ...

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const terms = process.argv.slice(2);
if (terms.length === 0) {
  console.error('Usage: node scripts/lookupSeriesCandidates.js "Series Name" ["Another Series"] ...');
  process.exit(1);
}

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

async function paginate(builderFn) {
  const out = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await builderFn().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function run() {
  for (const term of terms) {
    console.log(`\n${"=".repeat(70)}\nSearch: "${term}"\n${"=".repeat(70)}`);

    const { data: matches, error } = await supabase
      .from("series")
      .select("id, gcd_id, title, resolved_publisher_cached, year_start_cached, year_end_cached, issue_count_cached, featured_cover_path_cached")
      .ilike("title", `%${term}%`)
      .order("year_start_cached", { ascending: true, nullsFirst: false })
      .limit(25);

    if (error) {
      console.error("  query error:", error.message);
      continue;
    }
    if (!matches || matches.length === 0) {
      console.log("  no matches in `series` table");
      continue;
    }

    for (const s of matches) {
      // Count canonical_covers rows for this exact title (rough coverage signal).
      const ccRows = await paginate(() =>
        supabase
          .from("canonical_covers")
          .select("issue_number")
          .eq("series_title", s.title)
          .not("storage_path", "is", null)
      );
      const distinctCovered = new Set(ccRows.map((r) => norm(r.issue_number))).size;

      const yr = s.year_start_cached
        ? s.year_start_cached === s.year_end_cached
          ? `${s.year_start_cached}`
          : `${s.year_start_cached}–${s.year_end_cached ?? "?"}`
        : "year unknown";

      console.log(
        `  [gcd_id ${s.gcd_id ?? "—"}] "${s.title}" (${yr}) — ${s.resolved_publisher_cached ?? "publisher unknown"}\n` +
        `      issues: ${s.issue_count_cached ?? "?"} cached | covers found: ${distinctCovered} distinct issue numbers | featured cover: ${s.featured_cover_path_cached ? "yes" : "no"}`
      );
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
