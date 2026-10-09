import { baseIssueNumber } from "../../src/lib/coverMatch.js";

export function indexCanonicalIssues(rows) {
  const bySeries = new Map();
  for (const row of rows) {
    const issue = baseIssueNumber(row.issue_number) ?? String(row.issue_number ?? "").trim();
    if (!issue) continue;
    if (!bySeries.has(row.series_gcd_id)) bySeries.set(row.series_gcd_id, new Map());
    const index = bySeries.get(row.series_gcd_id);
    const current = index.get(issue);
    if (!current || Number(row.gcd_id) < Number(current.gcd_id)) index.set(issue, row);
  }
  return bySeries;
}

export function issueFor(index, seriesGcdId, issueNumber) {
  const issue = baseIssueNumber(issueNumber) ?? String(issueNumber ?? "").trim();
  return index.get(seriesGcdId)?.get(issue) ?? null;
}
