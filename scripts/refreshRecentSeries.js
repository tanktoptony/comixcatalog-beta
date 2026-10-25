// refreshRecentSeries.js
//
// Targeted cache refresh for series whose canonical_covers were just added.
// Runs at the tail of cover-ingest so a freshly covered series shows its cover
// on series cards (search, carousels, series lists) within the hour instead of
// waiting up to 3 weeks for weekly-refresh to rotate around to it.
//
// Usage:
//   node scripts/refreshRecentSeries.js                    # last 24h
//   node scripts/refreshRecentSeries.js --since-hours=2    # custom window
//
// Strategy:
//   1. Find canonical_covers created in the last N hours.
//   2. Map their series_gcd_id to series.id. Covers with no series_gcd_id are
//      skipped: a title match would refresh every same-titled series (hundreds
//      of "Batman" rows), and the mislink repair attributes them later.
//   3. Run refreshSeriesSearchCache.js --force --skip-reconcile over the ids
//      (the duplicate-cover reconcile scans every series; weekly-refresh runs it).
//
// 2026-10-25: rewritten. The old local fetchAllPages took a query builder but
// was handed a function, so the script threw on its first read and was never
// wired into any workflow.

import "dotenv/config";
import { config } from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import { fetchAllPages } from "../src/lib/supabase/fetchAllPages.js";

config({ path: ".env.local" });

const hoursArg = process.argv.find((a) => a.startsWith("--since-hours="));
const SINCE_HOURS = hoursArg ? Number(hoursArg.split("=")[1]) : 24;
const IN_CHUNK = 500;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const since = new Date(Date.now() - SINCE_HOURS * 3600 * 1000).toISOString();
  console.log(`Finding canonical_covers created since ${since}…`);

  const recent = await fetchAllPages(() =>
    sb
      .from("canonical_covers")
      .select("id, series_gcd_id")
      .gte("created_at", since)
      .not("series_gcd_id", "is", null)
  );
  const gcdIds = [...new Set(recent.map((r) => r.series_gcd_id))];
  console.log(`  ${recent.length} new covers across ${gcdIds.length} GCD series`);

  const ids = [];
  for (let i = 0; i < gcdIds.length; i += IN_CHUNK) {
    const { data, error } = await sb.from("series").select("id").in("gcd_id", gcdIds.slice(i, i + IN_CHUNK));
    if (error) throw error;
    ids.push(...(data ?? []).map((r) => r.id));
  }
  if (!ids.length) {
    console.log("Nothing to refresh.");
    return;
  }

  const idsFile = path.join(os.tmpdir(), `recent-series-${process.pid}.txt`);
  fs.writeFileSync(idsFile, ids.join("\n"));
  console.log(`Refreshing ${ids.length} series…`);
  const res = spawnSync(
    process.execPath,
    ["scripts/refreshSeriesSearchCache.js", "--force", "--skip-reconcile", `--only-ids-file=${idsFile}`],
    { stdio: "inherit" }
  );
  fs.rmSync(idsFile, { force: true });
  if (res.status !== 0) throw new Error(`refreshSeriesSearchCache exited ${res.status}`);
  console.log(`\nDone. Refreshed ${ids.length} recently covered series.`);
}

main().catch((error) => {
  console.error("refreshRecentSeries failed:", error?.message || error);
  process.exit(1);
});
