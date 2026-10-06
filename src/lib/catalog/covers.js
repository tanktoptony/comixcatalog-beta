import { baseIssueNumber } from "../coverMatch.js";
import { fetchAllByKeyset } from "../supabase/fetchAllPages.js";
import { titleVariants } from "../titleMatch.js";

const CHUNK_SIZE = 500;
const PICK_COLUMNS = [
  "id",
  "gcd_issue_id",
  "series_gcd_id",
  "series_title",
  "issue_number",
  "series_year",
  "cover_date",
  "publisher",
  "storage_path",
  "created_at",
].join(", ");
const SERIES_COLUMNS = PICK_COLUMNS;

function chunks(values) {
  const out = [];
  for (let index = 0; index < values.length; index += CHUNK_SIZE) {
    out.push(values.slice(index, index + CHUNK_SIZE));
  }
  return out;
}

function yearOf(value) {
  const match = String(value ?? "").match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : null;
}

function inWindow(value, start, end, nullAllowed = false) {
  if (start == null || end == null) return true;
  if (value == null) return nullAllowed;
  const year = Number(value);
  return year >= Number(start) - 1 && year <= Number(end) + 1;
}

function rankRows(rows, issue, tier) {
  return [...rows].sort((left, right) => {
    if (tier === 1) {
      const leftSeries = left.series_gcd_id === issue.series_gcd_id ? 0 : 1;
      const rightSeries = right.series_gcd_id === issue.series_gcd_id ? 0 : 1;
      if (leftSeries !== rightSeries) return leftSeries - rightSeries;
      const created = String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""));
      if (created) return created;
      return String(left.id).localeCompare(String(right.id), undefined, { numeric: true });
    }
    const target = issue.year;
    if (target != null) {
      const leftYear = yearOf(left.cover_date) ?? Number(left.series_year ?? 0);
      const rightYear = yearOf(right.cover_date) ?? Number(right.series_year ?? 0);
      const distance = Math.abs(leftYear - target) - Math.abs(rightYear - target);
      if (distance) return distance;
    }
    return String(left.id).localeCompare(String(right.id), undefined, { numeric: true });
  });
}

function result(row, tier, source) {
  return {
    storage_path: row.storage_path,
    source,
    tier,
    canonical_cover_id: row.id,
    publisher: row.publisher,
    cover_date: row.cover_date,
    series_year: row.series_year,
  };
}

export function pickCovers(issues, candidateRows) {
  const rows = (candidateRows ?? []).filter((row) => row?.storage_path);
  const resolved = new Map();
  const seriesWithCovers = new Set(rows
    .filter((row) => row.series_gcd_id != null)
    .map((row) => String(row.series_gcd_id)));

  for (const issue of issues ?? []) {
    const key = baseIssueNumber(issue.issue_number);
    if (!key) continue;

    const tier1 = rows.filter((row) =>
      row.gcd_issue_id != null && String(row.gcd_issue_id) === String(issue.gcd_issue_id)
    );
    if (tier1.length) {
      resolved.set(issue.gcd_issue_id, result(rankRows(tier1, issue, 1)[0], 1, "gcd_issue_id"));
      continue;
    }

    const tier2 = rows.filter((row) =>
      issue.series_gcd_id != null
      && String(row.series_gcd_id) === String(issue.series_gcd_id)
      && baseIssueNumber(row.issue_number) === key
      && inWindow(row.series_year, issue.series_year_start, issue.series_year_end, true)
    );
    if (tier2.length) {
      resolved.set(issue.gcd_issue_id, result(rankRows(tier2, issue, 2)[0], 2, "series_gcd_id"));
      continue;
    }

    if (issue.series_gcd_id != null && seriesWithCovers.has(String(issue.series_gcd_id))) continue;
    const variants = new Set(titleVariants(issue.series_title));
    const windowStart = issue.year ?? issue.series_year_start;
    const windowEnd = issue.year ?? issue.series_year_end;
    const tier3 = rows.filter((row) =>
      row.series_gcd_id == null
      && variants.has(row.series_title)
      && baseIssueNumber(row.issue_number) === key
      && row.series_year != null
      && inWindow(row.series_year, windowStart, windowEnd)
    );
    if (tier3.length) {
      resolved.set(issue.gcd_issue_id, result(rankRows(tier3, issue, 3)[0], 3, "series_title"));
    }
  }
  return resolved;
}

async function fetchChunks(values, build) {
  const rows = [];
  for (const group of chunks(values)) {
    rows.push(...await fetchAllByKeyset(() => build(group), "id"));
  }
  return rows;
}

export async function fetchSeriesCoverRows(supabase, { seriesGcdIds = [], seriesTitles = [] }) {
  const ids = [...new Set(seriesGcdIds.filter((value) => value != null))];
  const titles = [...new Set(seriesTitles.flatMap(titleVariants).filter(Boolean))];
  const [idRows, titleRows] = await Promise.all([
    fetchChunks(ids, (group) => supabase.from("canonical_covers")
      .select(SERIES_COLUMNS).in("series_gcd_id", group).not("storage_path", "is", null)),
    fetchChunks(titles, (group) => supabase.from("canonical_covers")
      .select(SERIES_COLUMNS).in("series_title", group).is("series_gcd_id", null)
      .not("storage_path", "is", null)),
  ]);
  return [...idRows, ...titleRows];
}

export async function resolveCovers(supabase, issues) {
  const usable = (issues ?? []).filter((issue) => issue?.gcd_issue_id != null);
  if (!usable.length) return new Map();

  const gcdIds = [...new Set(usable.map((issue) => issue.gcd_issue_id))];
  const seriesIds = [...new Set(usable.map((issue) => issue.series_gcd_id).filter((value) => value != null))];
  const [tier1Rows, tier2Rows] = await Promise.all([
    fetchChunks(gcdIds, (group) => supabase.from("canonical_covers")
      .select(PICK_COLUMNS).in("gcd_issue_id", group).not("storage_path", "is", null)),
    fetchChunks(seriesIds, (group) => supabase.from("canonical_covers")
      .select(PICK_COLUMNS).in("series_gcd_id", group).not("storage_path", "is", null)),
  ]);

  const early = pickCovers(usable, [...tier1Rows, ...tier2Rows]);
  const unresolved = usable.filter((issue) => !early.has(issue.gcd_issue_id));
  const blockedSeries = new Set(tier2Rows.map((row) => String(row.series_gcd_id)));
  const tier3Issues = unresolved.filter((issue) =>
    issue.series_title
    && (issue.series_gcd_id == null || !blockedSeries.has(String(issue.series_gcd_id)))
  );
  if (!tier3Issues.length) return early;

  const titles = [...new Set(tier3Issues.flatMap((issue) => titleVariants(issue.series_title)))];
  const tier3Rows = await fetchChunks(titles, (group) => supabase.from("canonical_covers")
    .select(PICK_COLUMNS).in("series_title", group).is("series_gcd_id", null)
    .not("storage_path", "is", null));
  return pickCovers(usable, [...tier1Rows, ...tier2Rows, ...tier3Rows]);
}
