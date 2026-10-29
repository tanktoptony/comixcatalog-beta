// Finds ComicVine volumes for GCD trade runs linked to catalog works. A wrong
// pin sends every downstream cover and issue lookup to the wrong run, so each
// candidate must agree on title, publisher, year, collected-edition evidence,
// and a reasonable issue count before this script will consider it.
//
// Dry-run is the default. Pass --apply to pin matches, update gap-pinned.json,
// and checkpoint trade-volume-ledger.json after every searched title.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { formatTag } from "../src/lib/seriesFormat.js";
import { normalizeWorkTitle } from "./lib/seriesEditions.js";
import { matchTradeVolumes } from "./lib/tradeVolumeMatch.js";
import { withRetry } from "./lib/withRetry.js";

const PAGE_SIZE = 1000;
const IN_SIZE = 300;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const ROOT = path.resolve(import.meta.dirname, "..");
const LEDGER_PATH = path.join(ROOT, "trade-volume-ledger.json");
const GAP_PINNED_PATH = path.join(ROOT, "gap-pinned.json");

function option(name, fallback) {
  const value = process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  return value == null ? fallback : value;
}

function chunks(rows, size = IN_SIZE) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
}

function loadJson(filePath, fallback) {
  return existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : fallback;
}

function saveJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function paged(label, build) {
  const all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = await withRetry(`${label} page ${from / PAGE_SIZE + 1}`, () => build().range(from, from + PAGE_SIZE - 1));
    all.push(...(rows ?? []));
    if (!rows || rows.length < PAGE_SIZE) break;
  }
  return all;
}

async function byIds(label, ids, build) {
  const all = [];
  for (const batch of chunks([...new Set(ids)])) {
    if (!batch.length) continue;
    for (let from = 0; ; from += PAGE_SIZE) {
      const rows = await withRetry(`${label} through ${batch.at(-1)}, page ${from / PAGE_SIZE + 1}`, () =>
        build(batch).range(from, from + PAGE_SIZE - 1));
      all.push(...(rows ?? []));
      if (!rows || rows.length < PAGE_SIZE) break;
    }
  }
  return all;
}

async function loadTargets(supabase) {
  const links = await paged("collected edition links", () => supabase
    .from("series_editions")
    .select("edition_gcd_id,work_gcd_id")
    .eq("role", "collected")
    .order("edition_gcd_id", { ascending: true }));
  const editionIds = links.map((row) => Number(row.edition_gcd_id));
  const series = await byIds("edition series", editionIds, (batch) => supabase
    .from("series")
    .select("id,gcd_id,title,year_start_cached,issue_count_cached,resolved_publisher_cached,comicvine_volume_id,us_market")
    .in("gcd_id", batch));
  const eligible = series.filter((row) => row.comicvine_volume_id == null && row.us_market === true);
  const covers = await byIds("edition covers", eligible.map((row) => row.gcd_id), (batch) => supabase
    .from("canonical_covers")
    .select("series_gcd_id")
    .in("series_gcd_id", batch));
  const covered = new Set(covers.map((row) => Number(row.series_gcd_id)));
  const formats = await byIds("edition formats", eligible.map((row) => row.gcd_id), (batch) => supabase
    .from("gcd_series")
    .select("gcd_id,name,publishing_format,binding")
    .in("gcd_id", batch));
  const formatById = new Map(formats.map((row) => [Number(row.gcd_id), row]));
  const workByEdition = new Map(links.map((row) => [Number(row.edition_gcd_id), Number(row.work_gcd_id)]));
  const workIds = [...new Set(eligible.map((row) => workByEdition.get(Number(row.gcd_id))).filter(Boolean))];
  const works = await byIds("edition works", workIds, (batch) => supabase
    .from("series")
    .select("gcd_id,reprint_count")
    .in("gcd_id", batch));
  const priorityByWork = new Map(works.map((row) => [Number(row.gcd_id), Number(row.reprint_count ?? 0)]));

  return eligible.filter((row) => !covered.has(Number(row.gcd_id))).map((row) => ({
    id: row.id,
    gcd_id: Number(row.gcd_id),
    title: row.title,
    publisher: row.resolved_publisher_cached,
    year_start: row.year_start_cached == null ? null : Number(row.year_start_cached),
    issue_count: Number(row.issue_count_cached ?? 0),
    tag: formatTag(formatById.get(Number(row.gcd_id))),
    priority: priorityByWork.get(workByEdition.get(Number(row.gcd_id))) ?? 0,
  }));
}

async function loadPinnedVolumeIds(supabase) {
  const rows = await paged("pinned volumes", () => supabase
    .from("series")
    .select("comicvine_volume_id")
    .not("comicvine_volume_id", "is", null)
    .order("id", { ascending: true }));
  return new Set(rows.map((row) => Number(row.comicvine_volume_id)));
}

function orderedGroups(targets) {
  const byTitle = new Map();
  for (const target of targets) {
    const key = normalizeWorkTitle(target.title);
    const rows = byTitle.get(key) ?? [];
    rows.push(target);
    byTitle.set(key, rows);
  }
  return [...byTitle].map(([key, editions]) => ({ key, editions, priority: Math.max(...editions.map((row) => row.priority)) }))
    .sort((a, b) => b.priority - a.priority || b.editions.length - a.editions.length || a.editions[0].title.localeCompare(b.editions[0].title));
}

async function fetchCandidates(title, apiKey) {
  const url = new URL("https://comicvine.gamespot.com/api/volumes/");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("filter", `name:${title}`);
  url.searchParams.set("field_list", "id,name,start_year,count_of_issues,publisher,description,deck");
  url.searchParams.set("limit", "100");
  const response = await fetch(url, { headers: { "User-Agent": "ComixCatalog trade volume matcher" } });
  if (response.status === 420 || response.status === 429) return { stop: `ComicVine HTTP ${response.status}` };
  if (!response.ok) throw new Error(`ComicVine HTTP ${response.status}: ${response.statusText}`);
  const body = await response.json();
  if (body.status_code !== 1) return { stop: `ComicVine status ${body.status_code}: ${body.error ?? "unknown error"}` };
  return { candidates: body.results ?? [] };
}

async function main() {
  dotenv.config({ path: path.join(ROOT, ".env.local") });
  const apply = process.argv.includes("--apply");
  const maxCalls = Number(option("--max-calls", 150));
  const sleepSeconds = Number(option("--sleep", 18));
  const outPath = option("--out", null);
  if (!Number.isInteger(maxCalls) || maxCalls < 0) throw new Error("--max-calls must be a non-negative integer");
  if (!Number.isFinite(sleepSeconds) || sleepSeconds < 0) throw new Error("--sleep must be a non-negative number");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.COMICVINE_API_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and COMICVINE_API_KEY are required");
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const targets = await loadTargets(supabase);
  const pinnedVolumeIds = await loadPinnedVolumeIds(supabase);
  const ledger = loadJson(LEDGER_PATH, {});
  const gapPinned = loadJson(GAP_PINNED_PATH, []);
  const gapIds = new Set(gapPinned.map((row) => Number(row.volume_id)));
  const review = [];
  const skippedTotals = {};
  let calls = 0;
  let groupsChecked = 0;
  let matched = 0;
  let stopped = null;
  let groupsSinceGapWrite = 0;

  console.log(`Mode: ${apply ? "apply" : "dry-run"}; eligible editions: ${targets.length}`);
  for (const group of orderedGroups(targets)) {
    const checkedAt = Date.parse(ledger[group.key]?.checked_at ?? "");
    if (Number.isFinite(checkedAt) && Date.now() - checkedAt < THIRTY_DAYS) continue;
    if (calls >= maxCalls) break;
    if (calls > 0 && sleepSeconds > 0) await new Promise((resolve) => setTimeout(resolve, sleepSeconds * 1000));
    const response = await fetchCandidates(group.editions[0].title, process.env.COMICVINE_API_KEY);
    calls += 1;
    if (response.stop) {
      stopped = response.stop;
      break;
    }
    const result = matchTradeVolumes({ editions: group.editions, candidates: response.candidates, pinnedVolumeIds });
    console.log(`\n${group.editions[0].title}`);
    for (const match of result.matches) {
      console.log(`  ${match.gcd_id} -> ${match.volume_id} (${match.score}, ${match.reasons.join(", ")})`);
    }
    for (const skip of result.skipped) {
      console.log(`  ${skip.gcd_id} skipped: ${skip.reason}`);
      skippedTotals[skip.reason] = (skippedTotals[skip.reason] ?? 0) + 1;
    }
    const byGcd = new Map(group.editions.map((row) => [row.gcd_id, row]));
    const appliedMatches = [];
    for (const match of result.matches) {
      const edition = byGcd.get(match.gcd_id);
      if (apply) {
        const updated = await withRetry(`pin series ${edition.gcd_id}`, () => supabase
          .from("series")
          .update({ comicvine_volume_id: match.volume_id })
          .eq("id", edition.id)
          .is("comicvine_volume_id", null)
          .select("id"));
        if (!updated?.length) {
          console.log(`  ${edition.gcd_id} skipped: changed before update`);
          skippedTotals.pinned = (skippedTotals.pinned ?? 0) + 1;
          continue;
        }
        if (!gapIds.has(match.volume_id)) {
          gapPinned.push({ name: edition.title, publisher: edition.publisher, year: edition.year_start, volume_id: match.volume_id });
          gapIds.add(match.volume_id);
        }
      }
      pinnedVolumeIds.add(match.volume_id);
      appliedMatches.push(match);
      matched += 1;
    }
    groupsChecked += 1;
    groupsSinceGapWrite += 1;
    review.push({
      title: group.editions[0].title,
      normalized_title: group.key,
      matches: appliedMatches.map((row) => {
        const edition = byGcd.get(row.gcd_id);
        const volume = response.candidates.find((candidate) => candidate.id === row.volume_id);
        const lead = String(volume?.deck || volume?.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        return {
          ...row,
          title: edition?.title,
          edition: `${edition?.title} (${edition?.publisher}, ${edition?.year_start}, ${edition?.issue_count} iss, ${edition?.tag})`,
          volume: `${volume?.name} (${volume?.publisher?.name}, ${volume?.start_year}, ${volume?.count_of_issues} iss): ${lead.slice(0, 120)}`,
        };
      }),
      skipped: result.skipped.map((row) => ({ ...row, title: byGcd.get(row.gcd_id)?.title })),
    });
    if (apply) {
      ledger[group.key] = { checked_at: new Date().toISOString(), matched: appliedMatches.length, skipped: result.skipped.length };
      saveJson(LEDGER_PATH, ledger);
      if (groupsSinceGapWrite >= 25) {
        saveJson(GAP_PINNED_PATH, gapPinned);
        groupsSinceGapWrite = 0;
      }
    }
  }
  if (apply) saveJson(GAP_PINNED_PATH, gapPinned);
  if (outPath) saveJson(path.resolve(outPath), review);
  console.log(`\nGroups checked: ${groupsChecked}; calls used: ${calls}; matched: ${matched}`);
  console.log(`Skipped: ${Object.entries(skippedTotals).map(([reason, count]) => `${reason}=${count}`).join(", ") || "none"}`);
  if (stopped) console.log(`Stopped cleanly: ${stopped}`);
  if (!apply) console.log("[dry-run] No database, ledger, or gap-pinned writes performed.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
