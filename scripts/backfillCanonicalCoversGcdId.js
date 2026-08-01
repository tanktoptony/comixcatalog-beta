// Populate canonical_covers.series_gcd_id for existing rows. The shared
// matcher is also used by new-cover ingestion, so the two paths cannot drift.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createCoverMatcher } from "../src/lib/coverMatch.js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { resolveSeriesGcdId } = createCoverMatcher(supabase);
const PAGE = 1000;
const stats = { scanned: 0, matched: 0, noMatch: 0, errors: 0 };

async function pageOfNullRows(fromId) {
  const { data, error } = await supabase
    .from("canonical_covers")
    .select("id, series_title, series_year, publisher")
    .is("series_gcd_id", null)
    .not("series_title", "is", null)
    .gt("id", fromId)
    .order("id")
    .limit(PAGE);
  if (error) throw error;
  return data ?? [];
}

async function processRow(row) {
  stats.scanned++;
  try {
    const gcdId = await resolveSeriesGcdId({
      title: row.series_title,
      year: row.series_year,
      publisher: row.publisher,
    });
    if (gcdId == null) {
      stats.noMatch++;
      return;
    }
    const { error } = await supabase
      .from("canonical_covers")
      .update({ series_gcd_id: Number(gcdId) })
      .eq("id", row.id);
    if (error) throw error;
    stats.matched++;
  } catch (error) {
    console.error("  row error:", row.id, row.series_title, error.message);
    stats.errors++;
  }
}

async function main() {
  console.log("\n=== backfillCanonicalCoversGcdId ===\n");
  const { error: probeError } = await supabase
    .from("canonical_covers")
    .select("series_gcd_id")
    .limit(1);
  if (probeError) throw new Error("Apply migration 0009 before running this script.");

  let fromId = 0;
  let cycle = 0;
  while (true) {
    const rows = await pageOfNullRows(fromId);
    if (rows.length === 0) break;
    cycle++;
    for (const row of rows) await processRow(row);
    fromId = rows.at(-1).id;
    console.log(`cycle ${cycle}: ${JSON.stringify(stats)}`);
  }
  console.log("\nDone.");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error("backfill failed:", error);
  process.exit(1);
});
