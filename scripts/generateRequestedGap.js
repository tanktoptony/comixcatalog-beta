import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  requestToIngestTarget,
  selectSeriesMatch,
  shouldAutoResolveRequest,
  titleLookupKeys,
} from "../src/lib/catalogRequests.js";
import { resolveCovers } from "../src/lib/catalog/covers.js";
import { withRetry } from "./lib/withRetry.js";
import { notifyRequestDone, refreshReviewQueue } from "../src/lib/reviewQueueNotify.js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const PAGE = 1000;
const CHUNK = 200;
// Linked requests keep their series in this lane for this long while the
// book still has no cover.
const LINKED_DAYS = 120;
const args = new Set(process.argv.slice(2));

async function paginate(label, builder) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = await withRetry(`${label} page ${from}`, () => builder().range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function main() {
  console.log("\n=== generateRequestedGap ===\n");
  const requests = await paginate("catalog requests", () => supabase
    .from("catalog_requests")
    .select("id, user_id, title, issue_number, publisher, year, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true }));
  console.log(`Open requests: ${requests.length}`);

  const titleKeys = [...new Set(requests.flatMap((request) => titleLookupKeys(request.title)))];
  const seriesRows = [];
  for (let index = 0; index < titleKeys.length; index += 100) {
    const group = titleKeys.slice(index, index + 100);
    const rows = await withRetry(`series group ${index}`, () => supabase
      .from("series")
      .select("id, gcd_id, title, year_start_cached, year_end_cached, resolved_publisher_cached, title_normalized")
      .in("title_normalized", group)
      .not("gcd_id", "is", null));
    seriesRows.push(...rows);
  }

  const matches = new Map();
  for (const request of requests) {
    matches.set(request.id, selectSeriesMatch(request, seriesRows));
  }

  const issueInputs = [];
  for (const request of requests) {
    const series = matches.get(request.id);
    if (!series || !request.issue_number) continue;
    const issues = await withRetry(`issue for request ${request.id}`, () => supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date")
      .eq("series_gcd_id", series.gcd_id)
      .eq("issue_number", request.issue_number)
      .limit(1));
    if (!issues[0]) continue;
    issueInputs.push({
      request,
      series,
      issue: issues[0],
      coverInput: {
        gcd_issue_id: issues[0].gcd_id,
        series_gcd_id: issues[0].series_gcd_id,
        series_title: series.title,
        issue_number: issues[0].issue_number,
        year: request.year,
        series_year_start: series.year_start_cached,
        series_year_end: series.year_end_cached,
        publisher: series.resolved_publisher_cached,
      },
    });
  }

  const covers = await resolveCovers(supabase, issueInputs.map((row) => row.coverInput));
  const resolvedIds = new Set();
  for (const row of issueInputs) {
    const cover = covers.get(row.issue.gcd_id);
    if (!shouldAutoResolveRequest(row.issue, cover)) continue;
    resolvedIds.add(row.request.id);
    if (args.has("--apply")) {
      const resolved = await withRetry(`resolve request ${row.request.id}`, () => supabase
        .from("catalog_requests")
        .update({
          status: "added",
          resolved_gcd_issue_id: row.issue.gcd_id,
          resolved_series_id: row.series.id,
          resolved_at: new Date().toISOString(),
          resolved_note: "auto: cover ingested",
        })
        .eq("id", row.request.id)
        .eq("status", "open")
        .select("id"));
      if (resolved?.length) await notifyRequestDone(supabase, row.request, row.issue.gcd_id);
      console.log(`Resolved: ${row.request.title} #${row.request.issue_number}`);
    } else {
      console.log(`Would resolve: ${row.request.title} #${row.request.issue_number}`);
    }
  }

  const linkedTargets = await uncoveredLinkedTargets();
  console.log(`Linked requests still without a cover: ${linkedTargets.length}`);

  const seen = new Set();
  const targets = [
    ...linkedTargets,
    ...requests
      .filter((request) => !resolvedIds.has(request.id))
      .map((request) => requestToIngestTarget(request, matches.get(request.id))),
  ]
    .filter((target) => {
      const key = `${target.name}::${target.publisher}::${target.year}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  fs.writeFileSync("gap-requested.json", `${JSON.stringify(targets, null, 2)}\n`, "utf-8");
  console.log(`\nWrote gap-requested.json with ${targets.length} target(s).`);
  if (args.has("--apply") && resolvedIds.size) await refreshReviewQueue(supabase);
  if (!args.has("--apply")) console.log("Dry run only. Pass --apply to save automatic resolutions.");
}

// Requests already linked to a catalog issue (by Tony or this script) whose
// book still has no cover. Their series go in under the catalog's own name,
// year and publisher: the requester's typed title ("Peter Parker, The
// Spectacular Spider-Man", 1984) never matched on ComicVine, which is why
// such requests sat in this lane for weeks without a cover.
async function uncoveredLinkedTargets() {
  const since = new Date(Date.now() - LINKED_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const linked = await paginate("linked requests", () => supabase
    .from("catalog_requests")
    .select("id, resolved_gcd_issue_id")
    .in("status", ["added", "already_there"])
    .not("resolved_gcd_issue_id", "is", null)
    .gte("resolved_at", since)
    .order("id", { ascending: true }));
  const issueIds = [...new Set(linked.map((row) => Number(row.resolved_gcd_issue_id)).filter(Number.isInteger))];
  const issues = [];
  for (let index = 0; index < issueIds.length; index += CHUNK) {
    issues.push(...await withRetry(`linked issues ${index}`, () => supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id, issue_number")
      .in("gcd_id", issueIds.slice(index, index + CHUNK))));
  }
  const seriesGcdIds = [...new Set(issues.map((issue) => issue.series_gcd_id).filter(Boolean))];
  const seriesRows = [];
  for (let index = 0; index < seriesGcdIds.length; index += CHUNK) {
    seriesRows.push(...await withRetry(`linked series ${index}`, () => supabase
      .from("series")
      .select("gcd_id, title, year_start_cached, year_end_cached, resolved_publisher_cached")
      .in("gcd_id", seriesGcdIds.slice(index, index + CHUNK))));
  }
  const seriesByGcd = new Map(seriesRows.map((row) => [row.gcd_id, row]));
  const withSeries = issues.filter((issue) => seriesByGcd.has(issue.series_gcd_id));
  const covers = await resolveCovers(supabase, withSeries.map((issue) => {
    const series = seriesByGcd.get(issue.series_gcd_id);
    return {
      gcd_issue_id: issue.gcd_id,
      series_gcd_id: issue.series_gcd_id,
      series_title: series.title,
      issue_number: issue.issue_number,
      series_year_start: series.year_start_cached,
      series_year_end: series.year_end_cached,
      publisher: series.resolved_publisher_cached,
    };
  }));
  return withSeries
    .filter((issue) => !covers.get(issue.gcd_id))
    .map((issue) => {
      const series = seriesByGcd.get(issue.series_gcd_id);
      return { name: series.title, publisher: series.resolved_publisher_cached ?? null, year: series.year_start_cached ?? null };
    });
}

main().catch((error) => {
  console.error("generateRequestedGap failed:", error);
  process.exit(1);
});
