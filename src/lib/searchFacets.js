export const FORMAT_FACETS = [
  { key: "issues", label: "Single issues" },
  { key: "tpb", label: "Trade paperbacks" },
  { key: "hc", label: "Hardcovers" },
  { key: "omnibus", label: "Omnibus & Compendium" },
  { key: "other", label: "Graphic novels & other" },
  { key: "specials", label: "One-shots & specials" },
];

const HARDCOVERS = new Set(["hc", "deluxe", "absolute", "library edition", "artist's edition"]);
const OMNIBUS = new Set(["omnibus", "compendium"]);
const OTHER = new Set(["graphic novel", "collected"]);

export function formatKeyOfLabel(label) {
  const value = String(label ?? "").trim().toLowerCase();
  if (value === "tpb") return "tpb";
  if (HARDCOVERS.has(value)) return "hc";
  if (OMNIBUS.has(value)) return "omnibus";
  if (value === "specials") return "specials";
  if (OTHER.has(value) || value) return "other";
  return null;
}

function rowFormat(row) {
  return row?.format_collected ? formatKeyOfLabel(row.format_tag) ?? "other" : "issues";
}

export function workFormats(row) {
  const formats = new Map();
  const add = (key, count) => formats.set(key, (formats.get(key) ?? 0) + Math.max(1, Number(count) || 0));
  add(rowFormat(row), row?.issue_count);
  for (const group of row?.editions?.groups ?? []) {
    const key = formatKeyOfLabel(group?.label);
    if (key) add(key, group?.books);
  }
  return formats;
}

function validYear(value) {
  const year = Math.trunc(Number(value));
  return Number.isFinite(year) && year >= 1800 && year <= 2100 ? year : null;
}

function decadesOfWork(row) {
  const start = validYear(row?.year_start);
  if (start == null) return [];
  const end = validYear(row?.year_end) ?? start;
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  const decades = [];
  for (let year = Math.floor(low / 10) * 10; year <= high; year += 10) decades.push(`${year}s`);
  return decades;
}

function decadesOfIssue(row) {
  const year = validYear(row?.year);
  return year == null ? [] : [`${Math.floor(year / 10) * 10}s`];
}

function publisherName(row, work) {
  const raw = work ? row?.publisher?.name : row?.publisher;
  const name = String(raw ?? "").trim();
  return !name || name.toLowerCase() === "unknown publisher" ? null : name;
}

function publisherKey(row, work) {
  return publisherName(row, work)?.toLowerCase() ?? null;
}

function matches(row, work, selected, skip = null) {
  if (skip !== "formats" && selected.formats.size) {
    const keys = work ? workFormats(row).keys() : ["issues"];
    if (![...keys].some((key) => selected.formats.has(key))) return false;
  }
  if (skip !== "decades" && selected.decades.size) {
    const decades = work ? decadesOfWork(row) : decadesOfIssue(row);
    if (!decades.some((key) => selected.decades.has(key))) return false;
  }
  if (skip !== "publishers" && selected.publishers.size) {
    const key = publisherKey(row, work);
    if (!key || !selected.publishers.has(key)) return false;
  }
  return true;
}

export function filterResults({ works = [], issues = [], selected }) {
  const formatFiltered = selected.formats.size > 0;
  return {
    works: works.filter((row) => matches(row, true, selected)).map((row) => ({
      ...row,
      visibleGroups: (row?.editions?.groups ?? []).filter((group) =>
        !formatFiltered || selected.formats.has(formatKeyOfLabel(group?.label))
      ),
      showRun: !formatFiltered || selected.formats.has("issues"),
    })),
    issues: issues.filter((row) => matches(row, false, selected)),
  };
}

function option(key, label, count, on) {
  return { key, label, count, on };
}

export function buildFacets({ works = [], issues = [], selected }) {
  const formatCounts = new Map();
  for (const row of works) {
    if (!matches(row, true, selected, "formats")) continue;
    for (const [key, books] of workFormats(row)) formatCounts.set(key, (formatCounts.get(key) ?? 0) + books);
  }
  for (const row of issues) {
    if (matches(row, false, selected, "formats")) formatCounts.set("issues", (formatCounts.get("issues") ?? 0) + 1);
  }

  const decadeCounts = new Map();
  for (const [rows, work] of [[works, true], [issues, false]]) {
    for (const row of rows) {
      if (!matches(row, work, selected, "decades")) continue;
      for (const key of work ? decadesOfWork(row) : decadesOfIssue(row)) {
        decadeCounts.set(key, (decadeCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const publisherCounts = new Map();
  const publisherLabels = new Map();
  for (const [rows, work] of [[works, true], [issues, false]]) {
    for (const row of rows) {
      if (!matches(row, work, selected, "publishers")) continue;
      const key = publisherKey(row, work);
      if (!key) continue;
      publisherCounts.set(key, (publisherCounts.get(key) ?? 0) + 1);
      if (!publisherLabels.has(key)) publisherLabels.set(key, publisherName(row, work));
    }
  }

  const keep = (count, on) => count > 0 || on;
  const formats = FORMAT_FACETS.map(({ key, label }) => option(key, label, formatCounts.get(key) ?? 0, selected.formats.has(key)))
    .filter((entry) => keep(entry.count, entry.on));
  const decades = [...new Set([...decadeCounts.keys(), ...selected.decades])]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => option(key, key, decadeCounts.get(key) ?? 0, selected.decades.has(key)))
    .filter((entry) => keep(entry.count, entry.on));
  const publisherEntries = [...new Set([...publisherCounts.keys(), ...selected.publishers])]
    .map((key) => option(key, publisherLabels.get(key) ?? key, publisherCounts.get(key) ?? 0, selected.publishers.has(key)))
    .filter((entry) => keep(entry.count, entry.on))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const publishers = publisherEntries.filter((entry, index) => index < 12 || entry.on);
  return { formats, decades, publishers };
}
