import { compareIssueNumbers } from "./coverMatch.js";
import { eraForYear, KEY_TIMELINE_ERAS } from "./keyTimeline.js";

export function seriesYearLabel(series) {
  const start = Number(series?.year_start);
  const end = Number(series?.year_end);
  if (!Number.isFinite(start)) return "Years unknown";
  if (!Number.isFinite(end) || start === end) return String(start);
  return `${start}-${end}`;
}

export function groupKeysByEra(keys) {
  const groups = new Map(KEY_TIMELINE_ERAS.map((era) => [era.id, { ...era, issues: [] }]));
  const unknown = { id: "unknown", label: "Year unknown", issues: [] };

  for (const issue of keys ?? []) {
    const era = eraForYear(issue.year);
    (era ? groups.get(era.id) : unknown).issues.push(issue);
  }

  const ordered = [...groups.values(), unknown];
  return ordered.filter((group) => group.issues.length > 0);
}

export function buildKeysDescription(series) {
  const keys = series?.key_issues ?? [];
  const majorKeys = keys.filter((issue) => Number(issue.tier) === 1);
  const highlights = majorKeys
    .slice(0, 3)
    .map((issue) => `#${issue.issue_number}: ${issue.reason}`)
    .join("; ");
  const summary = `${keys.length} key issue${keys.length === 1 ? "" : "s"}, ${majorKeys.length} major.`;
  return highlights ? `${summary} Major keys include ${highlights}.` : summary;
}

export function buildChecklistRows(issues, keys) {
  const keyById = new Map(
    (keys ?? []).map((issue) => [`gcd-${issue.gcd_issue_id}`, issue])
  );

  return [...(issues ?? [])]
    .sort((left, right) =>
      compareIssueNumbers(left.issue_number, right.issue_number)
      || String(left.id).localeCompare(String(right.id))
    )
    .map((issue) => ({
      id: String(issue.id),
      issueNumber: issue.issue_number ?? null,
      year: issue.release_year ?? null,
      title: issue.title ?? null,
      keyIssue: keyById.get(String(issue.id)) ?? null,
    }));
}
