import { fetchAllPages } from "./supabase/fetchAllPages.js";

export const EXPORT_IN_CHUNK = 500;

// PostgREST applies its row cap independently to every `.in()` query. Keep
// both the request list and every result page bounded so large exports cannot
// silently lose either requested IDs or duplicate matching rows.
export async function fetchInChunks(ids, build, orderCol = "id") {
  const rows = [];
  for (let i = 0; i < ids.length; i += EXPORT_IN_CHUNK) {
    const chunk = ids.slice(i, i + EXPORT_IN_CHUNK);
    rows.push(...(await fetchAllPages(() => build(chunk), orderCol)));
  }
  return rows;
}

function issueParts(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d+)(.*)$/);
  if (!match) return { numeric: false, number: 0, suffix: text };
  return { numeric: true, number: Number(match[1]), suffix: match[2] };
}

export function compareExportItems(a, b) {
  const title = String(a.title ?? "").localeCompare(String(b.title ?? ""), undefined, {
    sensitivity: "base",
  });
  if (title) return title;

  const aHasYear = a.seriesYear != null && a.seriesYear !== "" && Number.isFinite(Number(a.seriesYear));
  const bHasYear = b.seriesYear != null && b.seriesYear !== "" && Number.isFinite(Number(b.seriesYear));
  const aYear = Number(a.seriesYear);
  const bYear = Number(b.seriesYear);
  if (aHasYear !== bHasYear) return aHasYear ? -1 : 1;
  if (aHasYear && aYear !== bYear) return aYear - bYear;

  const aIssue = issueParts(a.issueNumber);
  const bIssue = issueParts(b.issueNumber);
  if (aIssue.numeric !== bIssue.numeric) return aIssue.numeric ? -1 : 1;
  if (aIssue.numeric && aIssue.number !== bIssue.number) return aIssue.number - bIssue.number;
  const suffix = aIssue.suffix.localeCompare(bIssue.suffix, undefined, {
    sensitivity: "base",
    numeric: true,
  });
  if (suffix) return suffix;

  return Number(a.copy_number ?? 1) - Number(b.copy_number ?? 1);
}
