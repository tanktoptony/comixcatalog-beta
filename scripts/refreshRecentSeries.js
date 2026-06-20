// refreshRecentSeries.js
//
// Targeted cache refresh for series whose canonical_covers were just touched.
// Called at the tail of cover-ingest so freshly-ingested series get their
// featured_cover_path_cached, issue_count_cached, year_start_cached etc.
// updated within hours instead of waiting up to 3 weeks for weekly-refresh
// to rotate around to them.
//
// Usage:
//   node scripts/refreshRecentSeries.js                    # last 24h
//   node scripts/refreshRecentSeries.js --since-hours=6    # custom window
//
// Strategy:
//   1. Find canonical_covers created in last N hours.
//   2. Resolve those to distinct series.id values via two paths:
//      - canonical_covers.series_gcd_id -> series.gcd_id
//      - canonical_covers.comicvine_volume_id -> series.cv_publisher (no FK,
//        fallback via series_title match)
//   3. Spawn refreshSeriesSearchCache.js --force --only-ids=<...> in chunks
//      (500 ids per invocation to keep argv under shell length caps).

import "dotenv/config";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "child_process";

config({ path: ".env.local" });

const hoursArg = process.argv.find((a) => a.startsWith("--since-hours="));
const SINCE_HOURS = hoursArg ? Number(hoursArg.split("=")[1]) : 24;
const CHUNK = 500;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAllPages(builder, pageSize = 1000) {
  let from = 0, all = [];
  for (;;) {
    const { data, error } = await builder.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

(async () => {
  const since = new Date(Date.now() - SINCE_HOURS * 3600 * 1000).toISOString();
  console.log(`Finding canonical_covers created since ${since}…`);

  const recent = await fetchAllPages((from, to) =>
    sb
      .from("canonical_covers")
      .select("series_gcd_id, comicvine_volume_id, series_title")
      .gte("created_at", since)
      .order("id")
  );
  console.log(`  ${recent.length} canonical_covers in window`);

  // Resolve to series.id via gcd bridge first (most reliable).
  const gcdIds = [...new Set(recent.map((r) => r.series_gcd_id).filter(Boolean))];
  const titlesOnly = [...new Set(
    recent.filter((r) => !r.series_gcd_id).map((r) => r.series_title).filter(Boolean)
  )];

  const seriesIds = new Set();

  if (gcdIds.length) {
    for (let i = 0; i < gcdIds.length; i += 500) {
      const chunk = gcdIds.slice(i, i + 500);
      const { data } = await sb.from("series").select("id").in("gcd_id", chunk);
      if (data) for (const r of data) seriesIds.add(r.id);
    }
    console.log(`  ${seriesIds.size} series matched via gcd_id bridge`);
  }

  if (titlesOnly.length) {
    const before = seriesIds.size;
    for (let i = 0; i < titlesOnly.length; i += 200) {
      const chunk = titlesOnly.slice(i, i + 200);
      const { data } = await sb.from("series").select("id").in("title", chunk);
      if (data) for (const r of data) seriesIds.add(r.id);
    }
    console.log(`  +${seriesIds.size - before} series matched via title fallback`);
  }

  const ids = [...seriesIds];
  if (!ids.length) {
    console.log("Nothing to refresh.");
    return;
  }
  console.log(`\nRefreshing ${ids.length} series in chunks of ${CHUNK}…`);

  let chunkN = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    chunkN++;
    const chunk = ids.slice(i, i + CHUNK);
    console.log(`\n--- chunk ${chunkN} (${chunk.length} ids) ---`);
    const res = spawnSync(
      "node",
      ["scripts/refreshSeriesSearchCache.js", "--force", `--only-ids=${chunk.join(",")}`],
      { stdio: "inherit" }
    );
    if (res.status !== 0) {
      console.error(`Chunk ${chunkN} failed with exit ${res.status}. Continuing.`);
    }
  }
  console.log(`\nDone. Refreshed ${ids.length} recently-touched series.`);
})();
