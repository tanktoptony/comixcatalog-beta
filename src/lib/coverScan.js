import { baseIssueNumber, normalizeTitle, publishersCompatible } from "./coverMatch.js";

export const COVER_SCAN_MODEL = "claude-opus-5-5";
export function coverScanConfigStatus(env = process.env) {
  return env.ANTHROPIC_API_KEY ? null : { status: 503, error: "Cover scanning is temporarily unavailable." };
}
export function coverScanModelFailure() {
  return { status: 502, outcome: "error", error: "We could not read that cover. Please try another photo." };
}
export const COVER_SCAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    series_title: { type: "string" }, issue_number: { type: "string" },
    publisher: { type: "string" }, cover_year: { type: ["integer", "null"] },
    cover_month: { type: ["integer", "null"] },
    cover_price: { type: ["string", "null"] },
    edition_clues: { type: "array", items: { type: "string" } },
    other_text: { type: "string" }, is_comic_cover: { type: "boolean" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["series_title", "issue_number", "publisher", "cover_year", "cover_month", "cover_price", "edition_clues", "other_text", "is_comic_cover", "confidence"],
};

export function parseCoverExtraction(message) {
  if (message?.stop_reason === "refusal") throw new Error("The cover could not be read safely.");
  if (message?.stop_reason === "max_tokens") throw new Error("The cover response was incomplete.");
  const text = message?.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("The cover response was empty.");
  const value = JSON.parse(text);
  for (const key of COVER_SCAN_SCHEMA.required) if (!(key in value)) throw new Error(`Missing extracted field: ${key}`);
  if (!["low", "medium", "high"].includes(value.confidence) || typeof value.is_comic_cover !== "boolean") throw new Error("Invalid cover response.");
  // The API's structured outputs reject minimum/maximum on integers (a live
  // scan 400'd on it 2026-10-06), so range checks live here instead. An
  // out-of-range month or year is a misread, not a reason to fail the scan.
  if (!(Number.isInteger(value.cover_month) && value.cover_month >= 1 && value.cover_month <= 12)) value.cover_month = null;
  if (!(Number.isInteger(value.cover_year) && value.cover_year >= 1930 && value.cover_year <= new Date().getFullYear() + 1)) value.cover_year = null;
  return value;
}

export function scanLimit(isPro) { return isPro ? 100 : 10; }
export function capStatus(used, isPro) {
  const limit = scanLimit(isPro);
  return { allowed: used < limit, used, limit, remaining: Math.max(0, limit - used) };
}

function yearOf(row) {
  const match = String(row.key_date ?? row.publication_date ?? "").match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : null;
}
function editionScore(issueNumber, clues = []) {
  const haystack = String(issueNumber ?? "").toLowerCase();
  return clues.reduce((score, clue) => score + (haystack.includes(String(clue).toLowerCase()) ? 15 : 0), 0);
}

export function rankCoverCandidates(extracted, seriesRows, issueRows) {
  const base = baseIssueNumber(extracted.issue_number);
  return issueRows
    .filter((issue) => base && baseIssueNumber(issue.issue_number) === base)
    .map((issue) => {
      const series = seriesRows.find((row) => Number(row.gcd_id) === Number(issue.series_gcd_id));
      if (!series) return null;
      const titleExact = normalizeTitle(series.title) === normalizeTitle(extracted.series_title);
      const inSpan = extracted.cover_year != null && Number(series.year_start_cached) <= extracted.cover_year && Number(series.year_end_cached ?? 9999) >= extracted.cover_year;
      const publisher = extracted.publisher && publishersCompatible(extracted.publisher, series.resolved_publisher_cached);
      const issueYear = yearOf(issue);
      const yearDelta = extracted.cover_year != null && issueYear != null ? Math.abs(extracted.cover_year - issueYear) : 99;
      return { issue, series, score: (titleExact ? 100 : 0) + (inSpan ? 45 : 0) + (publisher ? 35 : 0) + Math.max(0, 20 - yearDelta * 5) + editionScore(issue.issue_number, extracted.edition_clues) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || Number(a.issue.gcd_id) - Number(b.issue.gcd_id));
}
