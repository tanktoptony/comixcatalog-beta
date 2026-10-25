// generateNewReleaseGap.js
//
// Builds gap-new-releases.json: volumes with an issue on sale in the last few
// weeks that the site still shows without a cover. Runs at the start of every
// hourly cover ingest, ahead of its own lane.
//
// Why a separate lane (2026-10-24): probeNewReleases.js only appends to
// gap-manual.json, which had 1,183 targets. A volume already in that file
// (Radiant Black, queued months earlier) stays where it was, ~220 pending
// targets deep, and the manual lane gets through a handful per hour. On top
// of that, ComicVine's store_date listing undercounts the week. 41 of 87
// recent US volumes had no cover for the newest issue.
//
// Two sources, merged per volume:
//   1. GCD: gcd_issues.key_date in the last 28 days, plus month-only cover
//      dates ('YYYY-MM-00') for this month and the next two. Each issue is
//      checked with resolveCovers(), the same resolver the issue page uses.
//   2. ComicVine: issues with a store_date in the last 14 days whose volume
//      lacks that issue in canonical_covers. Only volumes the daily probe
//      already put in gap-manual.json are used, for their checked publisher.
//
// A volume the lane processed in the last 6 hours (24 for month-only dates)
// is held back; older done-ledger keys are expired so the lane retries.
//
// Usage:
//   node scripts/generateNewReleaseGap.js            # dry run, prints targets
//   node scripts/generateNewReleaseGap.js --apply    # writes the file + ledger
//   node scripts/generateNewReleaseGap.js --no-cv    # GCD source only

import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { baseIssueNumber } from "../src/lib/coverMatch.js";
import { resolveCovers } from "../src/lib/catalog/covers.js";
import { isCollectedEdition } from "../src/lib/seriesFormat.js";
import { fetchAllPages } from "../src/lib/supabase/fetchAllPages.js";
import { looksCollectedTitle } from "./lib/collectedTitle.js";
import { fetchRecentComicVineIssues } from "./lib/cvRecentReleases.js";
import {
  PRIORITY,
  applyRetryThrottle,
  classifyKeyDate,
  isUsSeries,
  mergeTargets,
  pickVolumeId,
  releaseWindow,
} from "./lib/newReleaseTargets.js";
import { withRetry } from "./lib/withRetry.js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const OUT_PATH = "gap-new-releases.json";
const DONE_PATH = ".ingest-done.json";
const MANUAL_PATH = "gap-manual.json";
const CV_DAYS = 14;
const IN_CHUNK = 200;

function chunks(values, size = IN_CHUNK) {
  const out = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}

// withRetry wants a { data, error } thunk; fetchAllPages returns rows and throws.
function pages(label, build, orderCol) {
  return withRetry(label, async () => {
    try {
      return { data: await fetchAllPages(build, orderCol), error: null };
    } catch (error) {
      return { data: null, error };
    }
  });
}

async function fetchIn(label, values, build, orderCol) {
  const rows = [];
  for (const group of chunks(values)) rows.push(...await pages(label, () => build(group), orderCol));
  return rows;
}

function readJson(path, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

// Same layout as _save_done() in the ingester (json.dumps of a dict sorted at
// the top level only, ", " and ": " separators, one line), so expiring keys
// doesn't reformat the file.
function pyJsonDumps(value, sortKeys = true) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (sortKeys) keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((key) => `${JSON.stringify(key)}: ${pyJsonDumps(value[key], false)}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}

async function gcdTargets(window, today) {
  const dated = await pages("gcd_issues dated", () => supabase
    .from("gcd_issues")
    .select("gcd_id, series_gcd_id, issue_number, key_date")
    .gte("key_date", window.since)
    .lte("key_date", window.through)
    .is("variant_of_gcd_id", null), "gcd_id");
  const monthOnly = await pages("gcd_issues month-only", () => supabase
    .from("gcd_issues")
    .select("gcd_id, series_gcd_id, issue_number, key_date")
    .in("key_date", window.monthKeys)
    .is("variant_of_gcd_id", null), "gcd_id");
  const issues = [...dated, ...monthOnly].filter((issue) => classifyKeyDate(issue.key_date, window));
  console.log(`GCD: ${dated.length} dated + ${monthOnly.length} month-only issue rows in the window.`);

  const seriesGcdIds = [...new Set(issues.map((issue) => Number(issue.series_gcd_id)).filter(Boolean))];
  const seriesRows = await fetchIn("series", seriesGcdIds, (group) => supabase
    .from("series")
    .select("id, gcd_id, title, year_start_cached, resolved_publisher_cached, comicvine_volume_id, us_market")
    .in("gcd_id", group), "id");
  const seriesByGcdId = new Map(seriesRows.map((row) => [Number(row.gcd_id), row]));
  const formatRows = await fetchIn("gcd_series formats", seriesGcdIds, (group) => supabase
    .from("gcd_series")
    .select("gcd_id, publishing_format, binding")
    .in("gcd_id", group), "gcd_id");
  const formatByGcdId = new Map(formatRows.map((row) => [Number(row.gcd_id), row]));

  // Monthly books only. Trades and omnibuses sit under the same title as the
  // run they reprint, and each costs a title search that rarely lands.
  const thisYear = today.getUTCFullYear();
  const usIssues = issues.filter((issue) => {
    const series = seriesByGcdId.get(Number(issue.series_gcd_id));
    return isUsSeries(series)
      && !looksCollectedTitle(series.title)
      && !isCollectedEdition(formatByGcdId.get(Number(issue.series_gcd_id)));
  });
  const covers = await resolveCovers(supabase, usIssues.map((issue) => {
    const series = seriesByGcdId.get(Number(issue.series_gcd_id));
    return {
      gcd_issue_id: issue.gcd_id,
      series_gcd_id: issue.series_gcd_id,
      series_title: series.title,
      issue_number: issue.issue_number,
      year: thisYear,
      series_year_start: series.year_start_cached,
      series_year_end: thisYear,
    };
  }));
  const missing = usIssues.filter((issue) => !covers.has(issue.gcd_id) && baseIssueNumber(issue.issue_number));
  console.log(`GCD: ${usIssues.length} US issues, ${missing.length} without a cover.`);

  const missingSeriesIds = [...new Set(missing.map((issue) => Number(issue.series_gcd_id)))];
  const coverRows = await fetchIn("canonical_covers volumes", missingSeriesIds, (group) => supabase
    .from("canonical_covers")
    .select("id, series_gcd_id, comicvine_volume_id")
    .in("series_gcd_id", group)
    .not("comicvine_volume_id", "is", null), "id");
  const coverRowsBySeries = new Map();
  for (const row of coverRows) {
    const key = Number(row.series_gcd_id);
    if (!coverRowsBySeries.has(key)) coverRowsBySeries.set(key, []);
    coverRowsBySeries.get(key).push(row);
  }

  return missing.map((issue) => {
    const series = seriesByGcdId.get(Number(issue.series_gcd_id));
    const kind = classifyKeyDate(issue.key_date, window);
    return {
      name: series.title,
      publisher: series.resolved_publisher_cached,
      year: series.year_start_cached,
      volume_id: pickVolumeId(coverRowsBySeries.get(Number(series.gcd_id)), series.comicvine_volume_id),
      series_gcd_id: Number(series.gcd_id),
      priority: kind === "dated" ? PRIORITY.dated : PRIORITY.month,
      newest_release: issue.key_date,
      missing: [issue.issue_number],
      source: "gcd",
    };
  });
}

async function comicVineTargets(today) {
  const apiKey = process.env.COMICVINE_API_KEY;
  if (!apiKey || args.has("--no-cv")) {
    console.log("ComicVine source skipped.");
    return [];
  }
  const since = new Date(today.getTime() - CV_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let recent;
  try {
    recent = await fetchRecentComicVineIssues({ apiKey, sinceDate: since });
  } catch (error) {
    // The GCD source still stands on its own; a ComicVine outage must not
    // empty the lane.
    console.warn(`::warning::ComicVine recent-issue fetch failed (${error.message}); GCD source only this run.`);
    return [];
  }

  const manualByVolume = new Map(readJson(MANUAL_PATH, [])
    .filter((entry) => entry?.volume_id && entry?.publisher && !looksCollectedTitle(entry.name))
    .map((entry) => [Number(entry.volume_id), entry]));
  const byVolume = new Map();
  for (const issue of recent) {
    const volumeId = Number(issue.volume?.id);
    const entry = manualByVolume.get(volumeId);
    if (!entry) continue;
    if (!byVolume.has(volumeId)) byVolume.set(volumeId, { entry, issues: [] });
    byVolume.get(volumeId).issues.push(issue);
  }

  const volumeIds = [...byVolume.keys()];
  const coverRows = await fetchIn("canonical_covers by volume", volumeIds, (group) => supabase
    .from("canonical_covers")
    .select("id, comicvine_volume_id, issue_number")
    .in("comicvine_volume_id", group)
    .not("storage_path", "is", null), "id");
  const covered = new Set(coverRows.map((row) => `${Number(row.comicvine_volume_id)}:${baseIssueNumber(row.issue_number)}`));

  const targets = [];
  for (const [volumeId, { entry, issues }] of byVolume) {
    const missing = issues.filter((issue) => {
      const base = baseIssueNumber(issue.issue_number);
      return base && !covered.has(`${volumeId}:${base}`);
    });
    if (!missing.length) continue;
    targets.push({
      name: entry.name,
      publisher: entry.publisher,
      year: entry.year ?? null,
      volume_id: volumeId,
      series_gcd_id: null,
      priority: PRIORITY.comicvine,
      newest_release: missing.map((issue) => issue.store_date).sort().at(-1),
      missing: missing.map((issue) => String(issue.issue_number)),
      source: "comicvine",
    });
  }
  console.log(`ComicVine: ${recent.length} recent issues, ${targets.length} queued volume(s) still missing a cover.`);
  return targets;
}

async function main() {
  console.log("\n=== generateNewReleaseGap ===\n");
  const today = new Date();
  const window = releaseWindow(today);
  console.log(`Window: key_date ${window.since}..${window.through}, cover months ${window.monthKeys.join(", ")}`);

  const merged = mergeTargets([...await gcdTargets(window, today), ...await comicVineTargets(today)]);
  const done = readJson(DONE_PATH, {});
  const { due, waiting, expireKeys } = applyRetryThrottle(merged, Array.isArray(done) ? {} : done, today);

  for (const target of due) {
    console.log(`  queue  [${target.priority}] ${target.name} (${target.publisher}, ${target.year}) vol ${target.volume_id ?? "search"} #${target.missing.join(", #")} (${target.newest_release})`);
  }
  for (const target of waiting) {
    console.log(`  wait   ${target.name} (${target.year}) #${target.missing.join(", #")}: tried within the retry window`);
  }
  console.log(`\n${due.length} volume(s) queued, ${waiting.length} waiting on a recent attempt, ${expireKeys.length} done-ledger key(s) to expire.`);

  if (!APPLY) {
    console.log("Dry run. Pass --apply to write gap-new-releases.json and the ledger.");
    return;
  }
  const output = due.map(({ name, publisher, year, volume_id, series_gcd_id, newest_release, missing }) => ({
    name, publisher, year, volume_id, series_gcd_id, newest_release, missing,
  }));
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
  if (expireKeys.length && !Array.isArray(done)) {
    for (const key of expireKeys) delete done[key];
    fs.writeFileSync(DONE_PATH, pyJsonDumps(done), "utf-8");
  }
  console.log(`Wrote ${OUT_PATH} (${output.length}).`);
}

main().catch((error) => {
  console.error("generateNewReleaseGap failed:", error);
  process.exit(1);
});
