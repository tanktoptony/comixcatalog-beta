import { compareIssueNumbers } from "./coverMatch.js";

export const KEY_TIMELINE_ERAS = [
  { id: "golden", label: "Golden Age", start: -Infinity, end: 1955 },
  { id: "silver", label: "Silver", start: 1956, end: 1969 },
  { id: "bronze", label: "Bronze", start: 1970, end: 1984 },
  { id: "copper", label: "Copper", start: 1985, end: 1991 },
  { id: "modern", label: "Modern", start: 1992, end: Infinity },
];

export function eraForYear(year) {
  if (year == null || year === "") return null;
  const numericYear = Number(year);
  if (!Number.isFinite(numericYear)) return null;
  return KEY_TIMELINE_ERAS.find((era) => numericYear >= era.start && numericYear <= era.end) ?? null;
}

export function xForYear(year, startYear, endYear, width) {
  const start = Number(startYear);
  const end = Number(endYear);
  const trackWidth = Number(width);
  if (![Number(year), start, end, trackWidth].every(Number.isFinite)) return 0;
  if (end <= start) return trackWidth / 2;
  return Math.max(0, Math.min(trackWidth, ((Number(year) - start) / (end - start)) * trackWidth));
}

export function keyCoverWidth(tier) {
  return Number(tier) === 1 ? 64 : 34;
}

export function sortKeyIssues(issues) {
  return [...(issues ?? [])].sort((left, right) =>
    compareIssueNumbers(left.issue_number, right.issue_number)
    || Number(left.gcd_issue_id ?? 0) - Number(right.gcd_issue_id ?? 0)
  );
}

export function packTimelineRows(items, gap = 8) {
  const prioritized = [...(items ?? [])].sort((left, right) =>
    Number(left.tier ?? 2) - Number(right.tier ?? 2)
    || Number(left.x) - Number(right.x)
    || compareIssueNumbers(left.issue_number, right.issue_number)
  );
  const rowEnds = [];

  return prioritized.map((item) => {
    const width = Number(item.width ?? keyCoverWidth(item.tier));
    const start = Number(item.x) - width / 2;
    const end = Number(item.x) + width / 2;
    let row = rowEnds.findIndex((previousEnd) => previousEnd + gap <= start);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = end;
    return { ...item, width, start, end, row };
  });
}
