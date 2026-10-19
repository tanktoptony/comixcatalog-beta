import { normalizeTitle, publishersCompatible } from "./coverMatch.js";

const SOURCES = new Set(["scan", "barcode", "search", "no_results", "direct"]);

function optionalText(value, maxLength, label) {
  const text = String(value ?? "").trim();
  if (!text) return { ok: true, value: null };
  if (text.length > maxLength) {
    return { ok: false, error: `${label} must be ${maxLength} characters or fewer.` };
  }
  return { ok: true, value: text };
}

export function normalizeRequestInput(raw = {}) {
  const title = String(raw.title ?? "").trim();
  if (!title) return { ok: false, error: "Enter the book title." };
  if (title.length > 200) return { ok: false, error: "Title must be 200 characters or fewer." };

  const fields = [
    ["issue_number", 20, "Issue number"],
    ["publisher", 120, "Publisher"],
    ["notes", 1000, "Notes"],
    ["barcode", 20, "Barcode"],
    ["search_term", 200, "Search term"],
  ];
  const value = { title };
  for (const [key, limit, label] of fields) {
    const result = optionalText(raw[key], limit, label);
    if (!result.ok) return result;
    value[key] = result.value;
  }

  const source = String(raw.source ?? "direct").trim();
  if (!SOURCES.has(source)) return { ok: false, error: "Choose a valid request source." };
  value.source = source;

  const yearText = String(raw.year ?? "").trim();
  if (!yearText) {
    value.year = null;
  } else if (!/^\d{4}$/.test(yearText) || Number(yearText) < 1890 || Number(yearText) > 2100) {
    return { ok: false, error: "Year must be between 1890 and 2100." };
  } else {
    value.year = Number(yearText);
  }

  return { ok: true, value };
}

export function requestDedupeKey({ title, issue_number }) {
  return `${normalizeTitle(title)}::${String(issue_number ?? "").trim().toLowerCase()}`;
}

export function selectSeriesMatch(request, candidates = []) {
  const matching = candidates.filter((series) => normalizeTitle(series.title) === normalizeTitle(request.title));
  const publisherMatches = request.publisher
    ? matching.filter((series) => publishersCompatible(request.publisher, series.resolved_publisher_cached))
    : matching;
  const pool = publisherMatches.length ? publisherMatches : matching;
  if (request.year == null) return pool[0] ?? null;
  // A requested year must fall inside the run (a year of slack each side for
  // cover dates). No fallback to another volume: a 2026 #1 that is missing
  // must not resolve to, or send the ingester after, the 1939 #1.
  const yearMatches = pool.filter((series) => {
    const start = Number(series.year_start_cached);
    const end = Number(series.year_end_cached ?? series.year_start_cached);
    return Number.isFinite(start) && start - 1 <= request.year && request.year <= end + 1;
  });
  return yearMatches[0] ?? null;
}

// Keys to look a requested title up by in series.title_normalized, which is
// lower(title) with everything but letters and digits removed. People drop or
// add a leading "The" ("X-Men" for "The X-Men"), so try both.
export function titleLookupKeys(title) {
  const key = String(title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key) return [];
  return [...new Set([key, key.startsWith("the") ? key.slice(3) : `the${key}`].filter(Boolean))];
}

export function shouldAutoResolveRequest(issue, cover) {
  return Boolean(issue?.gcd_id && cover?.storage_path);
}

export function requestToIngestTarget(request, seriesMatch) {
  return {
    name: seriesMatch?.title || request.title,
    publisher: seriesMatch?.resolved_publisher_cached || request.publisher || null,
    year: seriesMatch?.year_start_cached ?? request.year ?? null,
  };
}
