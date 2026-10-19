import { parseYear } from "./years.js";

const PUBLISHER_ALIASES = new Map([
  ["marvel", "marvel"],
  ["marvel comics", "marvel"],
  ["dc", "dc"],
  ["dc comics", "dc"],
]);

// Members type volume and imprint tags GCD keeps out of series names
// ("X-Men Vol. 2", "Superboy The New 52"), and "the" comes and goes
// ("Fantastic Four Versus The X-Men" is GCD's "Fantastic Four vs. X-Men").
export function normalizeTitle(value) {
  let title = String(value ?? "").trim().toLowerCase();
  title = title.replace(/\b(vol(ume)?\.?\s*\d+|the new 52|new 52)\b/g, " ");
  title = title.replace(/\bversus\b|\bvs\.?(?=\s|$)/g, " vs ");
  title = title.replace(/&|\band\b/g, " and ");
  title = title.replace(/[^a-z0-9]+/g, " ").replace(/\bthe\b/g, " ");
  return title.trim().replace(/\s+/g, " ");
}

// "DMZ: Random Fire" #27 is DMZ #27: the part before a colon, used only as a
// fallback that can never produce an automatic link.
export function mainTitle(value) {
  const raw = String(value ?? "");
  return raw.includes(":") ? normalizeTitle(raw.split(":")[0]) : null;
}

export function normalizeIssueNumber(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#\s*/, "")
    .replace(/\bannual\s*#?\s*/g, "annual ")
    .replace(/\s+/g, " ");
}

export function normalizePublisher(value) {
  const publisher = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return PUBLISHER_ALIASES.get(publisher) ?? publisher;
}

export function candidateYear(candidate) {
  return parseYear(candidate.publication_date) ?? parseYear(candidate.key_date);
}

function rangeFor(candidate) {
  return {
    start: parseYear(candidate.series_year_start ?? candidate.year_start ?? candidate.series_years),
    end: parseYear(candidate.series_year_end ?? candidate.year_end) ?? parseYear(candidate.series_year_start ?? candidate.year_start ?? candidate.series_years),
  };
}

function yearDistance(bookYear, candidate) {
  if (bookYear == null) return null;
  const { start, end } = rangeFor(candidate);
  if (start != null && end != null) {
    if (bookYear >= start && bookYear <= end) return 0;
    return Math.min(Math.abs(bookYear - start), Math.abs(bookYear - end));
  }
  const issueYear = candidateYear(candidate);
  return issueYear == null ? null : Math.abs(bookYear - issueYear);
}

function preferBaseIssues(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.series_gcd_id}:${normalizeIssueNumber(candidate.issue_number)}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => {
    const bases = group.filter((candidate) => candidate.variant_of_gcd_id == null);
    return bases.length ? bases : group;
  });
}

export function classifyCollectionBook(book, rawCandidates) {
  const title = normalizeTitle(book.series_title ?? book.title);
  const issue = normalizeIssueNumber(book.issue_number);
  const year = parseYear(book.release_year ?? book.year);
  const publisher = normalizePublisher(book.publisher);

  const byNumber = (rawCandidates ?? []).filter((candidate) => normalizeIssueNumber(candidate.issue_number) === issue);
  let candidates = preferBaseIssues(byNumber.filter((candidate) => normalizeTitle(candidate.series_title ?? candidate.title) === title));
  const main = mainTitle(book.series_title ?? book.title);
  const viaMainTitle = candidates.length === 0 && main != null;
  if (viaMainTitle) {
    candidates = preferBaseIssues(byNumber.filter((candidate) => normalizeTitle(candidate.series_title ?? candidate.title) === main));
  }

  if (year != null) {
    const withinRange = candidates.filter((candidate) => yearDistance(year, candidate) === 0);
    const offByOne = candidates.filter((candidate) => yearDistance(year, candidate) === 1);
    candidates = withinRange.length ? withinRange : offByOne;
  }

  if (candidates.length === 0) return { classification: "none", candidates: [] };
  if (candidates.length > 1) return { classification: "ambiguous", candidates };

  const candidate = candidates[0];
  const distance = yearDistance(year, candidate);
  const issueYear = candidateYear(candidate);
  const candidatePublisher = normalizePublisher(candidate.publisher);
  const exact = !viaMainTitle
    && year != null
    && distance === 0
    && issueYear === year
    && publisher !== ""
    && candidatePublisher !== ""
    && publisher === candidatePublisher;
  return { classification: exact ? "exact" : "likely", candidates, candidate };
}

export function findOwnershipCollision(rows, userId, gcdIssueId, collectionId) {
  return (rows ?? []).find((row) => row.user_id === userId
    && Number(row.gcd_issue_id) === Number(gcdIssueId)
    && row.id !== collectionId) ?? null;
}
