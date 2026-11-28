// Fill comic_details for approved member-added books that are not in GCD.
// Dry run by default. Matching is intentionally strict and ambiguous books
// are reported without a guess.
//
//   node scripts/syncComicDetails.js
//   node scripts/syncComicDetails.js --ids=<comic uuid>,<comic uuid>
//   node scripts/syncComicDetails.js --map=<comic uuid>:<ComicVine issue id>
//   node scripts/syncComicDetails.js --max-requests=60
//   node scripts/syncComicDetails.js --apply

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  chooseComicVineIssue,
  chooseComicVineVolume,
  fetchComicVineVolumes,
  shapeComicVineIssue,
} from "./lib/comicDetails.js";
import { describeError } from "./lib/describeError.js";

dotenv.config({ path: ".env.local", quiet: true });

const APPLY = process.argv.includes("--apply");
const MIN_REQUEST_GAP_MS = 1100;
const ISSUE_FIELDS = "id,name,cover_date,store_date,person_credits,character_credits,story_arc_credits,site_detail_url";
const VOLUME_FIELDS = "id,name,start_year,publisher";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function option(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
}

function parseIds(value) {
  if (!value) return [];
  const ids = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (ids.some((id) => !UUID.test(id))) throw new Error("--ids must contain comma-separated comic UUIDs");
  return [...new Set(ids)];
}

function parseMap(value) {
  const map = new Map();
  if (!value) return map;
  for (const entry of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const separator = entry.lastIndexOf(":");
    const comicId = entry.slice(0, separator);
    const issueId = Number(entry.slice(separator + 1));
    if (separator < 0 || !UUID.test(comicId) || !Number.isInteger(issueId) || issueId <= 0) {
      throw new Error("--map must contain comma-separated <comic uuid>:<ComicVine issue id> pairs");
    }
    if (map.has(comicId)) throw new Error(`--map repeats comic ${comicId}`);
    map.set(comicId, issueId);
  }
  return map;
}

const IDS = parseIds(option("ids"));
const PINNED = parseMap(option("map"));
const MAX_REQUESTS = Number(option("max-requests") ?? 60);
if (!Number.isInteger(MAX_REQUESTS) || MAX_REQUESTS < 1) throw new Error("--max-requests must be a positive whole number");

class RequestLimitError extends Error {}

function comicVineClient(apiKey) {
  let requests = 0;
  let lastRequestAt = 0;

  return {
    get count() { return requests; },
    async get(path, params = {}) {
      if (requests >= MAX_REQUESTS) throw new RequestLimitError(`ComicVine request limit ${MAX_REQUESTS} reached`);
      const elapsed = Date.now() - lastRequestAt;
      if (lastRequestAt && elapsed < MIN_REQUEST_GAP_MS) await sleep(MIN_REQUEST_GAP_MS - elapsed);

      const url = new URL(`https://comicvine.gamespot.com/api/${path}/`);
      for (const [key, value] of Object.entries({ api_key: apiKey, format: "json", ...params })) {
        url.searchParams.set(key, String(value));
      }
      lastRequestAt = Date.now();
      requests += 1;
      const response = await fetch(url, { headers: { "User-Agent": "ComixCatalog/1.0" } });
      if (!response.ok) throw new Error(`ComicVine HTTP ${response.status}`);
      const body = await response.json();
      if (body.status_code !== 1) throw new Error(`ComicVine status ${body.status_code}: ${body.error}`);
      return body;
    },
  };
}

function seriesFrom(comic) {
  return Array.isArray(comic.series) ? comic.series[0] : comic.series;
}

async function searchVolumes(cv, comic) {
  return fetchComicVineVolumes(cv, comic.series_title, {
    fieldList: VOLUME_FIELDS,
    maxResultsPerTitle: 500,
  });
}

async function issueInVolume(cv, volumeId, issueNumber) {
  const response = await cv.get("issues", {
    filter: `volume:${volumeId},issue_number:${issueNumber}`,
    field_list: "id,issue_number",
    limit: 100,
  });
  if (Number(response.number_of_total_results) > (response.results?.length ?? 0)) {
    return { match: null, reason: "ComicVine returned only part of the issue-number results" };
  }
  return chooseComicVineIssue(issueNumber, response.results ?? []);
}

async function issueDetails(cv, issueId) {
  const response = await cv.get(`issue/4000-${issueId}`, { field_list: ISSUE_FIELDS });
  if (!response.results || Number(response.results.id) !== Number(issueId)) throw new Error(`ComicVine issue ${issueId} was not returned`);
  return shapeComicVineIssue(response.results);
}

async function findDetails(cv, comic) {
  const pinnedIssueId = PINNED.get(comic.id);
  if (pinnedIssueId) return { details: await issueDetails(cv, pinnedIssueId), path: "pinned issue" };

  let volumeId = Number(seriesFrom(comic)?.comicvine_volume_id) || null;
  let path = "series volume";
  if (!volumeId) {
    const searched = await searchVolumes(cv, comic);
    if (searched.reason) return { details: null, reason: searched.reason };
    const series = seriesFrom(comic);
    const selected = chooseComicVineVolume({
      series_title: comic.series_title ?? series?.title,
      publisher: comic.publisher ?? series?.resolved_publisher_cached,
      start_year: series?.year_start_cached,
    }, searched.candidates);
    if (!selected.match) return { details: null, reason: selected.reason };
    volumeId = Number(selected.match.id);
    path = "matched volume";
  }

  const selectedIssue = await issueInVolume(cv, volumeId, comic.issue_number);
  if (!selectedIssue.match) return { details: null, reason: selectedIssue.reason };
  return { details: await issueDetails(cv, selectedIssue.match.id), path };
}

async function loadComics(supabase) {
  let query = supabase
    .from("comics")
    .select("id,series_title,issue_number,publisher,release_year,variant_name,series_id,gcd_id")
    .eq("review_status", "approved")
    .is("gcd_id", null)
    .order("id")
    .limit(1000);
  if (IDS.length) query = query.in("id", IDS);
  const { data, error } = await query;
  if (error) throw error;

  let detailsQuery = supabase.from("comic_details").select("comic_id").limit(1000);
  if (IDS.length) detailsQuery = detailsQuery.in("comic_id", IDS);
  const existing = await detailsQuery;
  if (existing.error) {
    const missing = ["42P01", "PGRST205"].includes(existing.error.code);
    if (!missing || APPLY) throw existing.error;
    console.warn("comic_details is not available; dry run will treat every selected comic as unsynced");
    return attachSeries(supabase, data ?? []);
  }
  const done = new Set((existing.data ?? []).map((row) => row.comic_id));
  return attachSeries(supabase, (data ?? []).filter((comic) => !done.has(comic.id)));
}

async function attachSeries(supabase, comics) {
  const seriesIds = [...new Set(comics.map((comic) => comic.series_id).filter(Boolean))];
  if (!seriesIds.length) return comics;
  const { data, error } = await supabase
    .from("series")
    .select("id,title,year_start_cached,resolved_publisher_cached,comicvine_volume_id")
    .in("id", seriesIds)
    .limit(1000);
  if (error) throw error;
  const byId = new Map((data ?? []).map((series) => [series.id, series]));
  return comics.map((comic) => ({ ...comic, series: byId.get(comic.series_id) ?? null }));
}

async function main() {
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "COMICVINE_API_KEY"]) {
    if (!process.env[name]) throw new Error(`${name} is required`);
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const cv = comicVineClient(process.env.COMICVINE_API_KEY);
  const comics = await loadComics(supabase);
  const skipped = [];
  let matched = 0;
  let written = 0;

  for (let index = 0; index < comics.length; index += 1) {
    const comic = comics[index];
    try {
      const found = await findDetails(cv, comic);
      if (!found.details) {
        skipped.push({ comic, reason: found.reason });
        continue;
      }
      matched += 1;
      console.log(`${APPLY ? "match" : "[dry run] match"} ${comic.id} ${comic.series_title} #${comic.issue_number ?? "?"} -> ComicVine ${found.details.comicvine_issue_id} (${found.path})`);
      if (APPLY) {
        const { error } = await supabase.from("comic_details").insert({ comic_id: comic.id, ...found.details });
        if (error) {
          skipped.push({ comic, reason: `write failed: ${describeError(error)}` });
        } else {
          written += 1;
        }
      }
    } catch (error) {
      if (error instanceof RequestLimitError) {
        for (const remaining of comics.slice(index)) skipped.push({ comic: remaining, reason: error.message });
        break;
      }
      skipped.push({ comic, reason: describeError(error) });
    }
  }

  if (skipped.length) {
    console.log("\nSkipped, never guessed:");
    for (const { comic, reason } of skipped) console.log(`  ${comic.id}  ${comic.series_title} #${comic.issue_number ?? "?"}: ${reason}`);
  }
  console.log(`\n${APPLY ? `Wrote ${written} of ${matched} matched` : `Dry run matched ${matched}`}; skipped ${skipped.length}; ComicVine requests ${cv.count}/${MAX_REQUESTS}`);
}

main().catch((error) => {
  console.error("syncComicDetails failed:", error);
  process.exitCode = 1;
});
