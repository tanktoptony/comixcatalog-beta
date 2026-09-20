// scripts/reportUserCollectedCoverCoverage.js
//
// Reports what share of the issues real users have in their libraries
// actually have a cover. This is the user-facing coverage number, as
// opposed to generatePriorityCoverTargets.js's series-level metric.
//
// Pagination (fixed 2026-09-20): the two canonical_covers lookups below
// used chunks(seriesIds) WITHOUT .range() pagination, so PostgREST's
// default 1000-row cap silently truncated each chunk. With 173
// user-collected series that meant the script saw 2,000 of 13,473 real
// covers and reported coveragePercent 15.86 — the truncation ratio, not
// the coverage. Verified by counting the same queries paginated vs not,
// and spot-checked per series: The New Warriors (42 owned issues),
// Amazing Spider-Man (38) and Silver Surfer (38) were each reported as
// 100% missing while every one of those owned issues had a cover linked
// by series_gcd_id. Same 1000-row cap that caused the /library
// hydration bug fixed in PR #63 — any .in() over canonical_covers needs
// pages(), not a bare select.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAGE = 1000;
const norm = (value) => String(value ?? "").trim().toLowerCase();

async function pages(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

const chunks = (values, size = 100) => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));

async function main() {
  const collections = await pages(() => sb.from("user_collections").select("gcd_issue_id").not("gcd_issue_id", "is", null).order("gcd_issue_id"));
  const issueIds = [...new Set(collections.map((row) => Number(row.gcd_issue_id)).filter(Number.isInteger))];
  const issues = [];
  for (const chunk of chunks(issueIds)) {
    const { data, error } = await sb.from("gcd_issues").select("gcd_id,series_gcd_id,issue_number").in("gcd_id", chunk);
    if (error) throw error;
    issues.push(...(data ?? []));
  }
  const seriesIds = [...new Set(issues.map((issue) => issue.series_gcd_id).filter(Boolean))];
  const series = [];
  for (const chunk of chunks(seriesIds)) {
    const { data, error } = await sb.from("series").select("gcd_id,title").in("gcd_id", chunk);
    if (error) throw error;
    series.push(...(data ?? []));
  }
  const titleBySeries = new Map(series.map((row) => [Number(row.gcd_id), norm(row.title)]));
  const linkedCovers = new Set();
  const exactIssueCovers = new Set();
  const titleCovers = new Set();
  for (const chunk of chunks(seriesIds)) {
    const data = await pages(() => sb.from("canonical_covers").select("id,gcd_issue_id,series_gcd_id,series_title,issue_number,storage_path").in("series_gcd_id", chunk).not("storage_path", "is", null).order("id"));
    for (const cover of data ?? []) {
      linkedCovers.add(`${Number(cover.series_gcd_id)}|${norm(cover.issue_number)}`);
      if (cover.gcd_issue_id != null) exactIssueCovers.add(Number(cover.gcd_issue_id));
      titleCovers.add(`${norm(cover.series_title)}|${norm(cover.issue_number)}`);
    }
  }
  const seriesTitles = [...new Set(series.map((row) => row.title).filter(Boolean))];
  for (const chunk of chunks(seriesTitles)) {
    const data = await pages(() => sb.from("canonical_covers").select("id,series_title,issue_number,storage_path").in("series_title", chunk).not("storage_path", "is", null).order("id"));
    for (const cover of data ?? []) titleCovers.add(`${norm(cover.series_title)}|${norm(cover.issue_number)}`);
  }
  // Match what src/app/api/library-hydrate/route.js actually renders from:
  // the ID path (canonical_covers.series_gcd_id == gcd_issues.series_gcd_id,
  // keyed by issue_number) first, series_title as the fallback. The
  // series_gcd_id|issue_number key was already being built here as
  // `linkedCovers` but only fed a diagnostic stat, never the coverage set —
  // so an issue whose cover the library displays via the ID path still
  // counted as missing unless canonical_covers.gcd_issue_id happened to be
  // backfilled. That undercounted by 34 issues on 2026-09-20.
  const coveredById = issues.filter((issue) => exactIssueCovers.has(Number(issue.gcd_id)));
  const coveredBySeriesLink = issues.filter((issue) => linkedCovers.has(`${Number(issue.series_gcd_id)}|${norm(issue.issue_number)}`));
  const coveredByTitle = issues.filter((issue) => titleCovers.has(`${titleBySeries.get(Number(issue.series_gcd_id))}|${norm(issue.issue_number)}`));
  const covered = new Set([...coveredById, ...coveredBySeriesLink, ...coveredByTitle].map((issue) => Number(issue.gcd_id)));
  const missingBySeries = new Map();
  for (const issue of issues) {
    if (!covered.has(Number(issue.gcd_id))) {
      const key = titleBySeries.get(Number(issue.series_gcd_id)) || `gcd:${issue.series_gcd_id}`;
      missingBySeries.set(key, (missingBySeries.get(key) || 0) + 1);
    }
  }
  console.log(JSON.stringify({
    distinctUserCollectedIssues: issues.length,
    coveredBySeriesIdOrTitle: covered.size,
    missingPrimaryCoverIssues: issues.length - covered.size,
    coveragePercent: issues.length ? Number((covered.size * 100 / issues.length).toFixed(2)) : 0,
    coveredByExactIssueId: coveredById.length,
    coveredBySeriesGcdIdLink: coveredBySeriesLink.length,
    coveredOnlyByTitleFallback: coveredByTitle.filter((issue) => !linkedCovers.has(`${Number(issue.series_gcd_id)}|${norm(issue.issue_number)}`)).length,
    topMissingSeries: [...missingBySeries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([title, missing]) => ({ title, missing })),
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
