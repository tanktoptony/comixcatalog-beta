import { baseIssueNumber } from "../../src/lib/coverMatch.js";

export const OUTCOMES = {
  selectedSuggestion: "matched_selected_suggestion",
  corrected: "matched_different_issue",
  abandoned: "matched_abandoned",
  noMatch: "no_match_or_not_a_comic",
  notInCatalog: "not_in_catalog",
  error: "error",
  capped: "capped",
};

export function classifyScanOutcome(row) {
  if (row.outcome === "error") return OUTCOMES.error;
  if (row.outcome === "capped") return OUTCOMES.capped;
  if (row.outcome === "not_in_catalog") return OUTCOMES.notInCatalog;
  if (row.outcome === "not_a_comic") return OUTCOMES.noMatch;
  if (row.outcome !== "matched") return "unknown";
  if (row.chosen_gcd_issue_id == null) return OUTCOMES.abandoned;
  const suggested = Number(row.candidates?.[0]?.gcd_issue_id);
  return suggested === Number(row.chosen_gcd_issue_id) ? OUTCOMES.selectedSuggestion : OUTCOMES.corrected;
}

const normalizedTitle = (value) => String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function classifyCorrection(suggested, chosen) {
  if (!suggested || !chosen) return "unknown";
  if (Number(suggested.series_gcd_id) === Number(chosen.series_gcd_id)) {
    return baseIssueNumber(suggested.issue_number) === baseIssueNumber(chosen.issue_number)
      ? "variant_or_printing_same_issue"
      : "same_series_different_issue_number";
  }
  if (normalizedTitle(suggested.series_title) === normalizedTitle(chosen.series_title)) {
    return "same_title_different_volume_or_year";
  }
  return "totally_different";
}
