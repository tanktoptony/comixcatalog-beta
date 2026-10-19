import { compareIssueNumbers } from "./coverMatch.js";
import { eraForYear } from "./keyTimeline.js";
import { isCollectedEdition } from "./seriesFormat.js";

export function ageSpanLabel(startYear, endYear) {
  const start = eraForYear(startYear);
  const end = eraForYear(endYear ?? startYear);
  if (!start && !end) return null;
  if (!start) return end.label;
  if (!end || start.id === end.id) return start.label;
  return `${start.label} → ${end.label}`;
}

export function filterSeriesVolumes(rows, current, limit = 6) {
  const title = String(current?.title ?? "").trim().toLocaleLowerCase();
  const publisher = String(current?.publisher ?? "").trim().toLocaleLowerCase();
  const eligible = [...(rows ?? [])]
    .filter((row) => String(row.title ?? "").trim().toLocaleLowerCase() === title)
    .filter((row) => String(row.resolved_publisher_cached ?? "").trim().toLocaleLowerCase() === publisher)
    .filter((row) => row.us_market === true)
    .filter((row) => Number(row.issue_count_cached) >= 5)
    .filter((row) => !isCollectedEdition(row.format ?? row))
    .sort((a, b) => Number(a.year_start_cached ?? Infinity) - Number(b.year_start_cached ?? Infinity));
  const selected = eligible.slice(0, limit);
  const currentRow = eligible.find((row) => String(row.id) === String(current?.id));
  if (currentRow && !selected.some((row) => row.id === currentRow.id)) {
    selected[selected.length - 1] = currentRow;
    selected.sort((a, b) => Number(a.year_start_cached ?? Infinity) - Number(b.year_start_cached ?? Infinity));
  }
  return selected;
}

export function heroKeyCovers(keyIssues, featuredCover) {
  const seen = new Set([featuredCover].filter(Boolean));
  return [...(keyIssues ?? [])]
    .filter((issue) => issue?.cover && !seen.has(issue.cover))
    .sort((a, b) => Number(a.tier ?? 2) - Number(b.tier ?? 2)
      || compareIssueNumbers(a.issue_number, b.issue_number))
    .filter((issue) => {
      if (seen.has(issue.cover)) return false;
      seen.add(issue.cover);
      return true;
    })
    .slice(0, 2)
    .map((issue) => issue.cover);
}
