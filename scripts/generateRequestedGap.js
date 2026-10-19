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

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const PAGE = 1000;
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
    .select("id, title, issue_number, publisher, year, created_at")
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
      await withRetry(`resolve request ${row.request.id}`, () => supabase
        .from("catalog_requests")
        .update({
          status: "added",
          resolved_gcd_issue_id: row.issue.gcd_id,
          resolved_series_id: row.series.id,
          resolved_at: new Date().toISOString(),
          resolved_note: "auto: cover ingested",
        })
        .eq("id", row.request.id)
        .eq("status", "open"));
      console.log(`Resolved: ${row.request.title} #${row.request.issue_number}`);
    } else {
      console.log(`Would resolve: ${row.request.title} #${row.request.issue_number}`);
    }
  }

  const seen = new Set();
  const targets = requests
    .filter((request) => !resolvedIds.has(request.id))
    .map((request) => requestToIngestTarget(request, matches.get(request.id)))
    .filter((target) => {
      const key = `${target.name}::${target.publisher}::${target.year}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  fs.writeFileSync("gap-requested.json", `${JSON.stringify(targets, null, 2)}\n`, "utf-8");
  console.log(`\nWrote gap-requested.json with ${targets.length} target(s).`);
  if (!args.has("--apply")) console.log("Dry run only. Pass --apply to save automatic resolutions.");
}

main().catch((error) => {
  console.error("generateRequestedGap failed:", error);
  process.exit(1);
});
