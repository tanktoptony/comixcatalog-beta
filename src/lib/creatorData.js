import { unstable_cache } from "next/cache";
import { resolveCovers } from "./catalog/covers.js";
import { buildCreatorRuns, buildRoleCounts } from "./creatorPage.js";
import { fetchAllPages } from "./supabase/fetchAllPages.js";
import { getServiceClient } from "./supabase/service.js";

const CREDIT_CAP = 3000;
const IN_CHUNK = 400;

function chunks(values, size = IN_CHUNK) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function selectInChunks(supabase, table, columns, key, values) {
  const rows = [];
  for (const group of chunks(values)) {
    const { data, error } = await supabase.from(table).select(columns).in(key, group);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function yearOf(issue) {
  for (const value of [issue.publication_date, issue.key_date]) {
    const year = Number(String(value ?? "").slice(0, 4));
    if (Number.isInteger(year) && year > 0) return year;
  }
  return null;
}

async function loadCreatorPage(slug) {
  const supabase = getServiceClient();
  const { data: creator, error: creatorError } = await supabase.from("creators")
    .select("id, name, slug").eq("slug", slug).maybeSingle();
  if (creatorError) throw creatorError;
  if (!creator) return null;

  const [{ count, error: countError }, credits] = await Promise.all([
    supabase.from("issue_creators").select("gcd_issue_id", { count: "exact", head: true }).eq("creator_id", creator.id),
    fetchAllPages(
      () => supabase.from("issue_creators").select("gcd_issue_id, role").eq("creator_id", creator.id).order("gcd_issue_id", { ascending: true }),
      "role",
      { maxRows: CREDIT_CAP }
    ),
  ]);
  if (countError) throw countError;

  const issueIds = [...new Set(credits.map((row) => row.gcd_issue_id).filter((id) => id != null))];
  const issues = await selectInChunks(supabase, "gcd_issues", "gcd_id, series_gcd_id, issue_number, title, publication_date, key_date", "gcd_id", issueIds);
  const seriesGcdIds = [...new Set(issues.map((issue) => issue.series_gcd_id).filter((id) => id != null))];
  const series = await selectInChunks(supabase, "series", "id, gcd_id, title, year_start_cached, year_end_cached, resolved_publisher_cached", "gcd_id", seriesGcdIds);
  const keyRows = await selectInChunks(supabase, "key_issues", "gcd_issue_id, reason, tier", "gcd_issue_id", issueIds);
  const issueById = new Map(issues.map((issue) => [String(issue.gcd_id), issue]));
  const seriesByGcdId = new Map(series.map((row) => [String(row.gcd_id), row]));
  const keyIssues = keyRows.map((key) => {
    const issue = issueById.get(String(key.gcd_issue_id));
    const owner = issue && seriesByGcdId.get(String(issue.series_gcd_id));
    if (!issue || !owner) return null;
    return { ...key, issue_number: issue.issue_number, title: issue.title, series_title: owner.title, series_gcd_id: issue.series_gcd_id, year: yearOf(issue), publisher: owner.resolved_publisher_cached };
  }).filter(Boolean);
  const coverInputs = keyIssues.map((issue) => ({ gcd_issue_id: issue.gcd_issue_id, series_gcd_id: issue.series_gcd_id, series_title: issue.series_title, issue_number: issue.issue_number, year: issue.year, publisher: issue.publisher }));
  const covers = await resolveCovers(supabase, coverInputs);
  const coverBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/`;
  for (const issue of keyIssues) {
    const path = covers.get(issue.gcd_issue_id)?.storage_path;
    issue.cover = path ? `${coverBase}${path}` : null;
  }

  const years = issues.map(yearOf).filter(Boolean).sort((a, b) => a - b);
  const roleCounts = buildRoleCounts(credits);
  return {
    ...creator,
    credit_count: count ?? credits.length,
    loaded_credit_count: credits.length,
    capped: Number(count) > credits.length,
    role_counts: roleCounts,
    year_start: years[0] ?? null,
    year_end: years.at(-1) ?? null,
    key_issues: keyIssues.sort((a, b) => Number(a.tier ?? 999) - Number(b.tier ?? 999) || String(a.series_title).localeCompare(String(b.series_title))),
    runs: buildCreatorRuns(credits, issues, series),
  };
}

// Rejected calls are not cached, so database failures never become a day-long empty page.
export const getCreatorPage = unstable_cache(loadCreatorPage, ["page-creator-v1"], { revalidate: 86400 });
