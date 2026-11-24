import { baseIssueNumber, compareIssueNumbers } from "./coverMatch.js";
import { OWNED_STATUSES } from "./collectionStatus.js";
import { fetchAllPages } from "./supabase/fetchAllPages.js";

export const MIN_RUN_SIZE = 3;
const CHUNK = 500;

function chunks(values) {
  const result = [];
  for (let index = 0; index < values.length; index += CHUNK) result.push(values.slice(index, index + CHUNK));
  return result;
}

export function issueNumbersBySeries(rows) {
  const bySeries = new Map();
  for (const row of rows ?? []) {
    if (row.series_gcd_id == null) continue;
    const number = baseIssueNumber(row.issue_number);
    if (!number) continue;
    if (!bySeries.has(row.series_gcd_id)) bySeries.set(row.series_gcd_id, new Set());
    bySeries.get(row.series_gcd_id).add(number);
  }
  return bySeries;
}

export function buildRunCompletion({ ownedIssueRows, allIssueRows, seriesRows }) {
  const ownedBySeries = issueNumbersBySeries(ownedIssueRows);
  const totalBySeries = issueNumbersBySeries(allIssueRows);
  const seriesByGcdId = new Map((seriesRows ?? []).map((row) => [row.gcd_id, row]));
  const runs = [];

  for (const [seriesGcdId, ownedSet] of ownedBySeries) {
    const totalSet = totalBySeries.get(seriesGcdId);
    const series = seriesByGcdId.get(seriesGcdId);
    if (!series || !totalSet || totalSet.size < MIN_RUN_SIZE) continue;
    const owned = [...ownedSet].filter((number) => totalSet.has(number)).length;
    const missingNumbers = [...totalSet].filter((number) => !ownedSet.has(number)).sort(compareIssueNumbers);
    runs.push({
      series_id: series.id,
      series_gcd_id: seriesGcdId,
      title: series.title,
      publisher: series.resolved_publisher_cached,
      owned,
      total: totalSet.size,
      missing: totalSet.size - owned,
      missing_numbers: missingNumbers,
      pct: Math.round((owned / totalSet.size) * 100),
    });
  }
  return runs.sort((left, right) => right.pct - left.pct || right.owned - left.owned);
}

export async function loadRunCompletion(supabase, userId) {
  const collectionRows = await fetchAllPages(() => supabase.from("user_collections")
    .select("id, gcd_issue_id, status, created_at").eq("user_id", userId));
  const ownedRows = collectionRows.filter((row) => OWNED_STATUSES.includes(row.status));
  // `> 0`, not isInteger: Number(null) is 0, and local-comic rows have no gcd id.
  const issueIds = [...new Set(ownedRows.map((row) => Number(row.gcd_issue_id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!issueIds.length) return { runs: [], ownedRows, collectionRows, ownedIssueRows: [], allIssueRows: [], seriesRows: [] };

  const ownedIssueRows = [];
  for (const group of chunks(issueIds)) {
    ownedIssueRows.push(...await fetchAllPages(() => supabase.from("gcd_issues")
      .select("gcd_id, base_gcd_issue_id, series_gcd_id, issue_number").in("gcd_id", group), "gcd_id"));
  }
  const seriesIds = [...new Set(ownedIssueRows.map((row) => row.series_gcd_id).filter((value) => value != null))];
  const allIssueRows = [];
  const seriesRows = [];
  for (const group of chunks(seriesIds)) {
    const [issues, seriesResult] = await Promise.all([
      fetchAllPages(() => supabase.from("gcd_issues")
        .select("gcd_id, series_gcd_id, issue_number").in("series_gcd_id", group), "gcd_id"),
      supabase.from("series").select("id, gcd_id, title, resolved_publisher_cached, year_start_cached, year_end_cached").in("gcd_id", group),
    ]);
    if (seriesResult.error) throw seriesResult.error;
    allIssueRows.push(...issues);
    seriesRows.push(...(seriesResult.data ?? []));
  }
  return { runs: buildRunCompletion({ ownedIssueRows, allIssueRows, seriesRows }), ownedRows, collectionRows, ownedIssueRows, allIssueRows, seriesRows };
}
