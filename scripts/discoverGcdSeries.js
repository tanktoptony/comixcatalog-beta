// Updated 2026-11-01: every run first probes the GCD series ids just past the
// newest one we have (probeNewestSeries), so a new series no longer waits up
// to a month for the alphabetical 234k-series walk to reach its name.
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { resolvePublisher } from "../src/lib/publisher.js";
import { isUsMarketSeries } from "../src/lib/usMarket.js";
import { cachedIssueCount, gcdIdFromUrl, provisionalIssueRows, qualifiesForCatalogImport } from "./lib/gcdSeriesImport.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CURSOR_FILE = path.resolve(__dirname, "../gcd-series-discovery-cursor.json");
const PUBLISHER_CURSOR_FILE = path.resolve(__dirname, "../gcd-publisher-sync-cursor.json");
const SLEEP_MS = 2000;
const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
  const [key, value] = arg.slice(2).split("=");
  return [key, value ?? true];
}));
const MAX_PAGES = args["max-pages"] === undefined ? Infinity : Number(args["max-pages"]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class RateLimited extends Error {}

function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

function writeCursor(cursor) {
  fs.writeFileSync(CURSOR_FILE, `${JSON.stringify(cursor, null, 2)}\n`);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "ComixCatalog gcd-series-discovery; contact via repo" } });
  if (response.status === 429) throw new RateLimited(`GCD rate limited series discovery. Retry-After: ${response.headers.get("retry-after") ?? "unknown"}s`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

async function publishersById(ids) {
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from("gcd_publishers").select("gcd_id, name, country").in("gcd_id", ids).order("gcd_id", { ascending: true }).range(0, 999);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [Number(row.gcd_id), row]));
}

async function upsertAppSeries(row, publisher, issueRows) {
  const gcdId = gcdIdFromUrl(row.api_url, "series");
  const resolvedPublisher = resolvePublisher({ cv: null, candidates: [publisher.name], seriesTitle: row.name });
  const values = {
    gcd_id: gcdId,
    title: row.name,
    issue_count_cached: cachedIssueCount(issueRows),
    year_start_cached: row.year_began || null,
    year_end_cached: row.year_ended || row.year_began || null,
    resolved_publisher_cached: resolvedPublisher,
    us_market: isUsMarketSeries({ publisherCountry: publisher.country, gcdPublisherName: publisher.name, resolvedPublisher }),
    search_refreshed_at: null,
  };
  const { data: existing, error: findError } = await supabase.from("series").select("id").eq("gcd_id", gcdId).maybeSingle();
  if (findError) throw findError;
  const { error } = existing
    ? await supabase.from("series").update(values).eq("id", existing.id)
    : await supabase.from("series").insert(values);
  if (error) throw error;
}

async function importPageRows(rows) {
  const ids = rows.map((row) => gcdIdFromUrl(row.api_url, "series")).filter(Boolean);
  const { data: localRows, error: localError } = await supabase.from("gcd_series").select("gcd_id").in("gcd_id", ids).order("gcd_id", { ascending: true }).range(0, 999);
  if (localError) throw localError;
  const localIds = new Set((localRows ?? []).map((row) => Number(row.gcd_id)));
  const missing = rows.filter((row) => !localIds.has(gcdIdFromUrl(row.api_url, "series")));
  const eligible = missing.filter(qualifiesForCatalogImport);
  const publisherIds = [...new Set(eligible.map((row) => gcdIdFromUrl(row.publisher, "publisher")).filter(Boolean))];
  const publishers = await publishersById(publisherIds);

  for (const row of eligible) {
    const gcdId = gcdIdFromUrl(row.api_url, "series");
    const publisherGcdId = gcdIdFromUrl(row.publisher, "publisher");
    const publisher = publishers.get(publisherGcdId);
    if (!publisher) {
      console.warn(`Skipping series ${gcdId}: gcd_publishers has no row for publisher ${publisherGcdId}.`);
      continue;
    }
    const issues = provisionalIssueRows(row);
    const gcdSeriesValues = {
      gcd_id: gcdId,
      name: row.name,
      sort_name: row.sort_name || row.name,
      year_began: row.year_began || null,
      year_ended: row.year_ended || null,
      publisher_gcd_id: publisherGcdId,
      publishing_format: row.publishing_format || null,
      binding: row.binding || null,
    };
    const { data: updated, error: updateError } = await supabase.from("gcd_series")
      .update(gcdSeriesValues).eq("gcd_id", gcdId).select("gcd_id");
    if (updateError) throw updateError;
    if (!updated?.length) {
      const { error: insertError } = await supabase.from("gcd_series").insert(gcdSeriesValues);
      if (insertError) throw insertError;
    }
    if (issues.length) {
      const { error: issuesError } = await supabase.from("gcd_issues").upsert(issues, { onConflict: "gcd_id" });
      if (issuesError) throw issuesError;
    }
    await upsertAppSeries(row, publisher, issues);
  }
  return { missing: missing.length, eligible: eligible.length };
}

// Newest series by id. GCD's /api/series/ list is sorted by name and takes
// no ordering or name filter (checked 2026-11-01), so the page walk reaches a
// new series only when the alphabet does. New series get sequential ids, so
// each run fetches the unknown ids just past the newest one we have (ids
// already in gcd_series cost no request). A trailing run of 404s means we
// are at GCD's frontier: the cursor stays on the first missing id and the
// frontier is checked again after FRONTIER_WAIT_MS, with one look-ahead id so
// a block of deleted ids cannot stall the probe.
const PROBE_START = 241227; // one past the 2026-10-10 dump's highest series id
const PROBE_PER_RUN = Number(args.probe ?? 6);
const FRONTIER_STREAK = 3;
const FRONTIER_WAIT_MS = 6 * 60 * 60 * 1000;

async function seriesJsonOrNull(id) {
  const response = await fetch(`https://www.comics.org/api/series/${id}/?format=json`, { headers: { Accept: "application/json", "User-Agent": "ComixCatalog gcd-series-discovery; contact via repo" } });
  if (response.status === 429) throw new RateLimited(`GCD rate limited series discovery. Retry-After: ${response.headers.get("retry-after") ?? "unknown"}s`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for series ${id}`);
  return response.json();
}

async function probeNewestSeries(cursor) {
  if (cursor.probe_frontier_at && Date.now() - Date.parse(cursor.probe_frontier_at) < FRONTIER_WAIT_MS) {
    console.log(`Newest-id probe: at GCD's frontier (${cursor.probe_next_id}) since ${cursor.probe_frontier_at}; next check later.`);
    return;
  }
  let id = Number(cursor.probe_next_id || PROBE_START);
  const { data, error } = await supabase.from("gcd_series").select("gcd_id").gte("gcd_id", id).order("gcd_id", { ascending: true }).range(0, 999);
  if (error) throw error;
  const known = new Set((data ?? []).map((row) => Number(row.gcd_id)));
  let fetched = 0;
  let imported = 0;
  let streakStart = null;
  while (fetched < PROBE_PER_RUN) {
    if (known.has(id)) { streakStart = null; id += 1; continue; }
    const json = await seriesJsonOrNull(id);
    fetched += 1;
    if (json) {
      const counts = await importPageRows([json]);
      imported += counts.eligible;
      streakStart = null;
    } else if (streakStart == null) {
      streakStart = id;
    }
    id += 1;
    await sleep(SLEEP_MS);
  }
  let atFrontier = streakStart != null && id - streakStart >= FRONTIER_STREAK;
  if (atFrontier) {
    // Look ahead once: a hit past the streak means a block of deleted ids,
    // not the frontier, so the probe jumps past it.
    const ahead = id + PROBE_PER_RUN * 2;
    if (!known.has(ahead) && await seriesJsonOrNull(ahead)) {
      atFrontier = false;
      streakStart = null;
      id = ahead;
    }
  }
  cursor.probe_next_id = atFrontier ? streakStart : id;
  cursor.probe_frontier_at = atFrontier ? new Date().toISOString() : null;
  writeCursor(cursor);
  console.log(`Newest-id probe: ${fetched} fetched, ${imported} imported, next id ${cursor.probe_next_id}${atFrontier ? " (frontier)" : ""}.`);
}

async function main() {
  if (MAX_PAGES !== Infinity && (!Number.isInteger(MAX_PAGES) || MAX_PAGES < 1)) throw new Error("--max-pages must be a positive integer");
  const publisherCursor = readJson(PUBLISHER_CURSOR_FILE, {});
  if (!publisherCursor.completed_at) {
    console.log("Publisher pass is not complete; series discovery will wait.");
    return;
  }
  const cursor = readJson(CURSOR_FILE, { next_page: 1, started_at: null, completed_at: null });
  await probeNewestSeries(cursor);
  if (cursor.completed_at) {
    console.log(`Series discovery completed ${cursor.completed_at}; newest-id probe finished.`);
    return;
  }
  cursor.started_at ||= new Date().toISOString();
  let page = Number(cursor.next_page || 1);
  let pagesProcessed = 0;
  while (pagesProcessed < MAX_PAGES) {
    const json = await fetchJson(`https://www.comics.org/api/series/?format=json&page=${page}`);
    const counts = await importPageRows(json.results ?? []);
    cursor.next_page = page + 1;
    writeCursor(cursor);
    pagesProcessed += 1;
    console.log(`Series page ${page}: ${json.results?.length ?? 0} seen, ${counts.missing} locally missing, ${counts.eligible} imported`);
    if (!json.next) {
      cursor.completed_at = new Date().toISOString();
      cursor.next_page = 1;
      writeCursor(cursor);
      console.log(`Series discovery complete after page ${page}.`);
      break;
    }
    page += 1;
    await sleep(SLEEP_MS);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = error instanceof RateLimited ? 3 : 1;
});
