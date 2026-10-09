import { baseIssueNumber, compareIssueNumbers, publishersCompatible } from "../coverMatch.js";
import { isCollectedEdition } from "../seriesFormat.js";
import { fetchAllByKeyset } from "../supabase/fetchAllPages.js";
import { normTitle, titleVariants } from "../titleMatch.js";

const CHUNK_SIZE = 500;
const TIER3_ISSUE_BATCH_SIZE = 100;
const TIER3_FILTER_LIMIT = 300;
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

function tier3Batches(issues) {
  const batches = [];
  let batch = [];
  let titles = new Set();
  let numbers = new Set();

  for (const issue of issues) {
    const issueTitles = titleVariants(issue.series_title).filter(Boolean);
    const issueNumbers = [issue.issue_number, baseIssueNumber(issue.issue_number)]
      .filter((value) => value != null && value !== "");
    const nextTitles = new Set([...titles, ...issueTitles]);
    const nextNumbers = new Set([...numbers, ...issueNumbers]);
    if (batch.length && (
      batch.length >= TIER3_ISSUE_BATCH_SIZE
      || nextTitles.size > TIER3_FILTER_LIMIT
      || nextNumbers.size > TIER3_FILTER_LIMIT
    )) {
      batches.push({ titles: [...titles], numbers: [...numbers] });
      batch = [];
      titles = new Set();
      numbers = new Set();
    }
    batch.push(issue);
    issueTitles.forEach((title) => titles.add(title));
    issueNumbers.forEach((number) => numbers.add(number));
  }
  if (batch.length) batches.push({ titles: [...titles], numbers: [...numbers] });
  return batches;
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

function compactTitle(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function knownPublisher(value) {
  const publisher = String(value ?? "").trim();
  return publisher && publisher.toLowerCase() !== "unknown publisher" ? publisher : null;
}

function seriesFormat(seriesFormats, seriesGcdId) {
  return seriesFormats.get(String(seriesGcdId)) ?? seriesFormats.get(seriesGcdId) ?? {};
}

function siblingCandidates(issue, rows, seriesFormats) {
  const key = baseIssueNumber(issue?.issue_number);
  const issueYear = issue?.year ?? issue?.series_year_start;
  if (!key || issueYear == null) return [];
  const titles = new Set(titleVariants(issue.series_title).map(normTitle).filter(Boolean));
  return (rows ?? []).filter((row) => {
    if (!row?.storage_path || row.series_gcd_id == null) return false;
    if (String(row.series_gcd_id) === String(issue.series_gcd_id)) return false;
    if (seriesFormats) {
      const issueCollected = isCollectedEdition(seriesFormat(seriesFormats, issue.series_gcd_id));
      const rowCollected = isCollectedEdition(seriesFormat(seriesFormats, row.series_gcd_id));
      if (issueCollected !== rowCollected) return false;
    }
    if (!titles.has(normTitle(row.series_title))) return false;
    if (baseIssueNumber(row.issue_number) !== key) return false;
    const candidateYear = yearOf(row.cover_date) ?? (row.series_year == null ? null : Number(row.series_year));
    if (candidateYear == null || Math.abs(candidateYear - Number(issueYear)) > 1) return false;
    const issuePublisher = knownPublisher(issue.publisher);
    const rowPublisher = knownPublisher(row.publisher);
    return !issuePublisher || !rowPublisher || publishersCompatible(issuePublisher, rowPublisher);
  });
}

export function pickUniqueSiblingCover(issue, rows, seriesFormats) {
  const candidates = siblingCandidates(issue, rows, seriesFormats);
  const unique = [...new Map(candidates.map((row) => [String(row.id ?? row.storage_path), row])).values()];
  return unique.length === 1 ? result(unique[0], 4, "sibling") : null;
}

export function pickCovers(issues, candidateRows, seriesFormats) {
  const rows = (candidateRows ?? []).filter((row) => row?.storage_path);
  const resolved = new Map();
  const seriesWithCovers = new Set(rows
    .filter((row) => row.series_gcd_id != null)
    .map((row) => String(row.series_gcd_id)));

  for (const issue of issues ?? []) {
    const key = baseIssueNumber(issue.issue_number);
    if (!key) continue;

    // The year check applies here too. Some gcd_issue_id links in the table
    // come from mis-pinned volumes (parity run 2026-10-06: Transformers
    // Universe 1986 linked to The Transformers 1984 covers, Teen Titans
    // 2014-16 to the 2011 volume, Wildcats 1999-2001 to the 2006 volume).
    const tier1 = rows.filter((row) =>
      row.gcd_issue_id != null && String(row.gcd_issue_id) === String(issue.gcd_issue_id)
      && inWindow(row.series_year, issue.series_year_start, issue.series_year_end, true)
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

    const sibling = pickUniqueSiblingCover(issue, rows, seriesFormats);
    if (sibling) {
      resolved.set(issue.gcd_issue_id, sibling);
      continue;
    }

    if (issue.series_gcd_id != null && seriesWithCovers.has(String(issue.series_gcd_id))) continue;
    const variants = new Set(titleVariants(issue.series_title));
    // An untagged cover's series_year is its volume's START year, so it is
    // compared with the series span (+-1), as the old pages did. The issue's
    // own year is only a fallback when the span is unknown; using it first
    // rejected every issue more than a year past the volume start.
    const windowStart = issue.series_year_start ?? issue.year;
    const windowEnd = issue.series_year_end ?? issue.year;
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

async function fetchSeriesFormats(supabase, seriesGcdIds) {
  const formats = new Map();
  const ids = [...new Set(seriesGcdIds.filter((value) => value != null))];
  for (const group of chunks(ids)) {
    const { data, error } = await supabase.from("gcd_series")
      .select("gcd_id, publishing_format, binding").in("gcd_id", group);
    if (error) throw error;
    for (const row of data ?? []) formats.set(String(row.gcd_id), row);
  }
  return formats;
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
  for (const [issueId, cover] of early) {
    if (cover.source === "sibling") early.delete(issueId);
  }
  const unresolved = usable.filter((issue) => !early.has(issue.gcd_issue_id));
  const tier3Issues = unresolved.filter((issue) => issue.series_title);
  if (!tier3Issues.length) return early;

  const tier3Rows = [];
  for (const batch of tier3Batches(tier3Issues)) {
    // This prefilter only removes rows whose raw number equals neither the
    // issue's raw number nor its base key; the old pages matched exact raw numbers.
    tier3Rows.push(...await fetchAllByKeyset(() => supabase.from("canonical_covers")
      .select(PICK_COLUMNS).in("series_title", batch.titles)
      .in("issue_number", batch.numbers)
      .not("storage_path", "is", null), "id"));
  }
  const normalizedTitles = [...new Set(tier3Issues.map((issue) => compactTitle(issue.series_title)).filter(Boolean))];
  const siblingSeriesIds = [];
  for (const group of chunks(normalizedTitles)) {
    siblingSeriesIds.push(...await fetchAllByKeyset(() => supabase.from("series")
      .select("id, gcd_id").in("title_normalized", group).not("gcd_id", "is", null), "id"));
  }
  const siblingIds = [...new Set(siblingSeriesIds.map((row) => row.gcd_id).filter((id) => id != null))];
  const siblingNumbers = [...new Set(tier3Issues.flatMap((issue) =>
    [issue.issue_number, baseIssueNumber(issue.issue_number)]
  ).filter(Boolean))];
  for (const idGroup of chunks(siblingIds)) {
    for (const numberGroup of chunks(siblingNumbers)) {
      tier3Rows.push(...await fetchAllByKeyset(() => supabase.from("canonical_covers")
        .select(PICK_COLUMNS).in("series_gcd_id", idGroup).in("issue_number", numberGroup)
        .not("storage_path", "is", null), "id"));
    }
  }
  const rows = [...tier1Rows, ...tier2Rows, ...tier3Rows];
  const provisional = pickCovers(usable, rows);
  const siblingRows = tier3Issues.flatMap((issue) => siblingCandidates(issue, rows));
  if (!siblingRows.length) return provisional;

  // Format metadata is only needed when the otherwise-valid fallback would
  // cross GCD series. Missing or unsynced rows remain non-collected by the
  // shared series-format contract.
  const formatSeriesIds = [
    ...usable.map((issue) => issue.series_gcd_id),
    ...siblingRows.map((row) => row.series_gcd_id),
  ];
  const seriesFormats = await fetchSeriesFormats(supabase, formatSeriesIds);
  return pickCovers(usable, rows, seriesFormats);
}

export async function resolveSeriesCovers(supabase, seriesRows) {
  const series = (seriesRows ?? []).filter((row) => row?.gcd_id != null);
  if (!series.length) return new Map();
  const byGcdId = new Map(series.map((row) => [String(row.gcd_id), row]));
  const ids = series.map((row) => row.gcd_id);
  const issueRows = [];
  for (const group of chunks(ids)) {
    issueRows.push(...await fetchAllByKeyset(() => supabase.from("gcd_issues")
      .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date")
      .in("series_gcd_id", group), "gcd_id"));
  }
  const issues = issueRows.map((issue) => {
    const owner = byGcdId.get(String(issue.series_gcd_id));
    return {
      gcd_issue_id: issue.gcd_id,
      series_gcd_id: issue.series_gcd_id,
      series_title: owner.title,
      issue_number: issue.issue_number,
      year: yearOf(issue.key_date) ?? yearOf(issue.publication_date),
      series_year_start: owner.year_start_cached,
      series_year_end: owner.year_end_cached,
      publisher: owner.resolved_publisher_cached,
    };
  });
  const covers = await resolveCovers(supabase, issues);
  const picked = new Map();
  for (const owner of series) {
    const covered = issues.filter((issue) =>
      String(issue.series_gcd_id) === String(owner.gcd_id) && covers.has(issue.gcd_issue_id)
    ).sort((left, right) => {
      const leftOne = baseIssueNumber(left.issue_number) === "1" ? 0 : 1;
      const rightOne = baseIssueNumber(right.issue_number) === "1" ? 0 : 1;
      return leftOne - rightOne || compareIssueNumbers(left.issue_number, right.issue_number);
    });
    if (covered.length) picked.set(owner.id, covers.get(covered[0].gcd_issue_id));
  }
  return picked;
}
