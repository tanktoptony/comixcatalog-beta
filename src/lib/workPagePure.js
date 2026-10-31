import { compareIssueNumbers } from "./coverMatch.js";

export function specialBookLabel(seriesTitle, workTitle) {
  const full = String(seriesTitle ?? "").trim();
  const prefix = String(workTitle ?? "").trim();
  if (!full || !prefix) return full;
  if (full.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return full;
  return full.slice(prefix.length).replace(/^[\s:;,.\-–—+]+/, "").trim() || full;
}

export function editionBookLabel({ role, seriesTitle, workTitle, issueNumber, seriesBookCount }) {
  if (role === "special") return specialBookLabel(seriesTitle, workTitle);
  return seriesBookCount > 1 && String(issueNumber ?? "").trim()
    ? `Vol. ${String(issueNumber).trim()}`
    : seriesTitle;
}

export function compareEditionBooks(left, right) {
  const yearDelta = (Number(left.series_year) || Number.MAX_SAFE_INTEGER)
    - (Number(right.series_year) || Number.MAX_SAFE_INTEGER);
  return yearDelta || compareIssueNumbers(left.issue_number, right.issue_number);
}
