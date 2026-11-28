// Match approved member-added comics to GCD with the same matcher used by
// the collection importer. Dry run by default.
//
//   node scripts/matchComicsToGcd.js
//   node scripts/matchComicsToGcd.js --ids=<comic uuid>,<comic uuid>
//   node scripts/matchComicsToGcd.js --apply

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resolveImportRows } from "../src/lib/import/resolveRows.js";
import {
  decideComicGcdMatch,
  importerRowForComic,
} from "./lib/matchComicsToGcd.js";
import { describeError } from "./lib/describeError.js";

dotenv.config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--apply" && !arg.startsWith("--ids="));
if (unknown.length) throw new Error(`Unknown option: ${unknown.join(", ")}`);
if (args.filter((arg) => arg.startsWith("--ids=")).length > 1) throw new Error("Pass --ids only once");
const APPLY = args.includes("--apply");
const idsArg = args.find((arg) => arg.startsWith("--ids="));
const IDS = idsArg
  ? [...new Set(idsArg.slice("--ids=".length).split(",").map((value) => value.trim()).filter(Boolean))]
  : [];
if (idsArg && !IDS.length) throw new Error("--ids requires at least one comic id");

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function queryRows(label, query) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${describeError(error)}`);
  return data ?? [];
}

async function selectInChunks(values, load, size = 100) {
  const unique = [...new Set(values.filter((value) => value != null))];
  const rows = [];
  for (let index = 0; index < unique.length; index += size) {
    rows.push(...await load(unique.slice(index, index + size)));
  }
  return rows;
}

async function pagedRows(label, load) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await queryRows(label, load(from, from + 999));
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function loadComics(supabase) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from("comics")
      .select("id,series_title,issue_number,publisher,release_year,variant_name,review_status,gcd_id")
      .eq("review_status", "approved")
      .is("gcd_id", null)
      .order("id")
      .range(from, from + 999);
    if (IDS.length) query = query.in("id", IDS);
    const page = await queryRows("approved unlinked comics", query);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function resolveComics(supabase, comics) {
  const results = [];
  for (let start = 0; start < comics.length; start += 200) {
    const rows = comics.slice(start, start + 200).map((comic, offset) => importerRowForComic(comic, start + offset));
    results.push(...await resolveImportRows(supabase, rows));
  }
  return results;
}

async function loadEditions(supabase, baseIds) {
  const [bases, families] = await Promise.all([
    selectInChunks(baseIds, (ids) => pagedRows("matched GCD issues", (from, to) => supabase
      .from("gcd_issues")
      .select("gcd_id,series_gcd_id,issue_number,key_date,variant_of_gcd_id,variant_name,base_gcd_issue_id")
      .in("gcd_id", ids)
      .order("gcd_id")
      .range(from, to))),
    selectInChunks(baseIds, (ids) => pagedRows("matched GCD editions", (from, to) => supabase
      .from("gcd_issues")
      .select("gcd_id,series_gcd_id,issue_number,key_date,variant_of_gcd_id,variant_name,base_gcd_issue_id")
      .in("base_gcd_issue_id", ids)
      .order("gcd_id")
      .range(from, to))),
  ]);
  return [...new Map([...bases, ...families].map((row) => [Number(row.gcd_id), row])).values()];
}

function printDecision(decision, seriesById) {
  if (!decision.accepted) {
    console.log(`SKIP comic=${decision.comicId} | book=${decision.book} | reason=${decision.reason}`);
    return;
  }
  const series = seriesById.get(Number(decision.issue.series_gcd_id));
  const seriesName = series?.title ?? "Unknown series";
  const year = series?.year_start_cached ?? (String(decision.issue.key_date ?? "").slice(0, 4) || "unknown");
  console.log(`${APPLY ? "MATCH" : "[dry run] MATCH"} comic=${decision.comicId} | book=${decision.book} | GCD=${decision.gcdIssueId} | series=${seriesName} | year=${year} | number=${decision.issue.issue_number ?? "?"} | edition=${decision.edition}`);
}

async function main() {
  const supabase = client();
  const comics = await loadComics(supabase);
  if (!comics.length) {
    console.log("No approved unlinked comics matched the requested scope.");
    return;
  }

  const resolutions = await resolveComics(supabase, comics);
  const resolutionByIndex = new Map(resolutions.map((result) => [result.i, result]));
  const baseIds = resolutions
    .filter((result) => result.result === "matched")
    .map((result) => Number(result.gcd_issue_id))
    .filter(Number.isInteger);
  const editions = await loadEditions(supabase, baseIds);
  const seriesIds = editions.map((edition) => Number(edition.series_gcd_id)).filter(Number.isInteger);
  const series = await selectInChunks(seriesIds, (ids) => queryRows("matched GCD series", supabase
    .from("series")
    .select("gcd_id,title,year_start_cached")
    .in("gcd_id", ids)
    .limit(1000)));
  const seriesById = new Map(series.map((row) => [Number(row.gcd_id), row]));
  const gcdSeries = await selectInChunks(seriesIds, (ids) => queryRows("matched GCD series publishers", supabase
    .from("gcd_series")
    .select("gcd_id,year_began,publisher_gcd_id")
    .in("gcd_id", ids)
    .limit(1000)));
  const publisherIds = gcdSeries.map((row) => Number(row.publisher_gcd_id)).filter(Number.isInteger);
  const publishers = await selectInChunks(publisherIds, (ids) => queryRows("matched GCD publishers", supabase
    .from("gcd_publishers")
    .select("gcd_id,name")
    .in("gcd_id", ids)
    .limit(1000)));
  const publisherName = new Map(publishers.map((row) => [Number(row.gcd_id), row.name]));
  const gcdSeriesById = new Map(gcdSeries.map((row) => [Number(row.gcd_id), {
    year_began: row.year_began,
    publisher_name: publisherName.get(Number(row.publisher_gcd_id)) ?? null,
  }]));
  const decisions = comics.map((comic, index) => decideComicGcdMatch({
    comic,
    resolution: resolutionByIndex.get(index),
    editions,
    gcdSeriesById,
  }));

  for (const decision of decisions) printDecision(decision, seriesById);
  const accepted = decisions.filter((decision) => decision.accepted);
  if (!APPLY) {
    console.log(`Dry run complete: matched=${accepted.length}, skipped=${decisions.length - accepted.length}`);
    return;
  }

  let changed = 0;
  let refused = 0;
  for (const decision of accepted) {
    const { data, error } = await supabase
      .from("comics")
      .update({ gcd_id: decision.gcdIssueId })
      .eq("id", decision.comicId)
      .eq("review_status", "approved")
      .is("gcd_id", null)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      refused += 1;
      console.log(`REFUSED comic=${decision.comicId} | book=${decision.book} | reason=${error ? describeError(error) : "row changed after matching"}`);
      continue;
    }
    changed += 1;
  }
  console.log(`Apply complete: changed=${changed}, refused=${refused}, skipped=${decisions.length - accepted.length}`);
}

main().catch((error) => {
  console.error("matchComicsToGcd failed:", describeError(error));
  process.exitCode = 1;
});
