// Writes gap-runs.json: partly covered GCD runs whose remaining issue covers
// were never re-queued by the zero-cover or user-collected lanes.
//
// Usage:
//   node scripts/generateRunCompletionGap.js
//   node scripts/generateRunCompletionGap.js --apply
//   node scripts/generateRunCompletionGap.js --limit=1500

import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { describeError } from "./lib/describeError.js";
import { withRetry } from "./lib/withRetry.js";

dotenv.config({ path: ".env.local" });

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  return [key, value ?? true];
}));
const LIMIT = Number(args.limit ?? 1500);
const OUT_PATH = "gap-runs.json";
const PAGE = 1000;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchKeyset(build, key) {
  const rows = [];
  let last = null;
  for (;;) {
    const after = last;
    const page = await withRetry(`${key} page after ${after ?? "start"}`, () => {
      let query = build().order(key).limit(PAGE);
      if (after != null) query = query.gt(key, after);
      return query;
    });
    if (!page.length) break;
    rows.push(...page);
    if (page.length < PAGE) break;
    last = page.at(-1)[key];
  }
  return rows;
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function mostCommon(map) {
  let winner = null;
  let count = -1;
  for (const [value, next] of map) {
    if (next > count) { winner = value; count = next; }
  }
  return winner;
}

async function main() {
  console.log("\n=== generateRunCompletionGap ===\n");
  const covers = await fetchKeyset(() => supabase.from("canonical_covers")
    .select("id, series_gcd_id, issue_number, comicvine_volume_id")
    .not("storage_path", "is", null).not("series_gcd_id", "is", null), "id");

  const coveredNumbers = new Map();
  const volumeCounts = new Map();
  const seriesByVolume = new Map();
  for (const cover of covers) {
    const seriesId = Number(cover.series_gcd_id);
    if (!coveredNumbers.has(seriesId)) coveredNumbers.set(seriesId, new Set());
    if (cover.issue_number != null) coveredNumbers.get(seriesId).add(String(cover.issue_number));
    if (cover.comicvine_volume_id != null) {
      const volumeId = Number(cover.comicvine_volume_id);
      if (!volumeCounts.has(seriesId)) volumeCounts.set(seriesId, new Map());
      increment(volumeCounts.get(seriesId), volumeId);
      if (!seriesByVolume.has(volumeId)) seriesByVolume.set(volumeId, new Set());
      seriesByVolume.get(volumeId).add(seriesId);
    }
  }

  // The lane re-walks one ComicVine volume and links what it finds to this
  // series, so only queue a series when that volume is clearly its own: it
  // supplies at least 80% of the series' covers and no other series has
  // covers from it. Anything murkier (split runs, shared or wrong volumes)
  // belongs to repairAllCoverSeriesLinks.js, not to a blind re-walk.
  function ownVolume(seriesId) {
    const counts = volumeCounts.get(seriesId);
    if (!counts) return null;
    const volumeId = mostCommon(counts);
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    if (counts.get(volumeId) / total < 0.8) return null;
    if (seriesByVolume.get(volumeId)?.size !== 1) return null;
    return volumeId;
  }

  const seriesIds = [...coveredNumbers.keys()];
  const issueCounts = new Map();
  for (let i = 0; i < seriesIds.length; i += 25) {
    const chunk = seriesIds.slice(i, i + 25);
    const issues = await fetchKeyset(() => supabase.from("gcd_issues")
      .select("gcd_id, series_gcd_id").in("series_gcd_id", chunk)
      .is("variant_of_gcd_id", null), "gcd_id");
    for (const issue of issues) increment(issueCounts, Number(issue.series_gcd_id));
  }

  const eligible = seriesIds.map((seriesId) => {
    const covered = coveredNumbers.get(seriesId).size;
    const issues = issueCounts.get(seriesId) ?? 0;
    return { seriesId, covered, issues, missing: issues - covered, volumeId: ownVolume(seriesId) };
  }).filter((row) => row.issues >= 5 && row.covered >= 1 && row.covered / row.issues < 0.90
    && row.volumeId != null);

  const series = new Map();
  for (let i = 0; i < eligible.length; i += 200) {
    const ids = eligible.slice(i, i + 200).map((row) => row.seriesId);
    const rows = await fetchKeyset(() => supabase.from("gcd_series")
      .select("gcd_id, name, year_began, publisher_gcd_id").in("gcd_id", ids), "gcd_id");
    for (const row of rows) series.set(Number(row.gcd_id), row);
  }

  const publisherIds = [...new Set([...series.values()]
    .map((row) => row.publisher_gcd_id).filter((id) => id != null))];
  const publishers = new Map();
  for (let i = 0; i < publisherIds.length; i += 200) {
    const rows = await fetchKeyset(() => supabase.from("gcd_publishers")
      .select("gcd_id, name, country").in("gcd_id", publisherIds.slice(i, i + 200)), "gcd_id");
    for (const row of rows) publishers.set(Number(row.gcd_id), row);
  }

  // US runs only (2026-10-31). The US partial runs were all walked inside
  // the done ledger's 30 days, so the lane skipped them and spent every hour
  // on a 3,458-issue Danish weekly whose date-numbered covers land
  // series-only and can't show on an issue page.
  const usOnly = eligible.filter((row) =>
    publishers.get(series.get(row.seriesId)?.publisher_gcd_id)?.country === "us");
  usOnly.sort((a, b) => b.missing - a.missing);
  const targets = usOnly.slice(0, LIMIT).map((row) => {
    const metadata = series.get(row.seriesId);
    const publisher = publishers.get(metadata?.publisher_gcd_id);
    return {
      name: metadata?.name ?? null,
      publisher: publisher?.name ?? null,
      year: metadata?.year_began ?? null,
      volume_id: row.volumeId,
      series_gcd_id: row.seriesId,
    };
  }).filter((target) => target.name);

  console.log(`${targets.length} partial runs (limit ${LIMIT}).`);
  for (const target of targets.slice(0, 10)) {
    console.log(`  ${target.publisher ?? "?"} (${target.year ?? "?"}) ${target.name}`);
  }
  if (!args.apply) {
    console.log("\nDry run. Pass --apply to write gap-runs.json.");
    return;
  }
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(targets, null, 2)}\n`, "utf-8");
  console.log(`\nWrote ${OUT_PATH} (${targets.length}).`);
}

main().catch((error) => {
  console.error("generateRunCompletionGap failed:", describeError(error));
  process.exit(1);
});
