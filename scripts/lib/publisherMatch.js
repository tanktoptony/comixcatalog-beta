const TRAILING_WORDS = new Set([
  "comics", "comic", "publishing", "publications", "entertainment", "inc",
  "group", "studios", "press", "books",
]);

const ALIASES = new Map([
  ["national periodical", "dc"],
  ["national periodical publications", "dc"],
  ["atlas", "marvel"],
  ["gold key", "western"],
  ["dell", "western"],
]);

export function normalizePublisher(value) {
  const words = String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/^the\s+/, "").split(/\s+/).filter(Boolean);
  while (words.length && TRAILING_WORDS.has(words.at(-1))) words.pop();
  const normalized = words.join(" ");
  return ALIASES.get(normalized) ?? normalized;
}

// Exact match after normalization only. A prefix rule would make "Marvel"
// match "Marvel UK" and "Dark Horse" match "Dark Horse Deutschland", which
// are the foreign editions this tiebreak exists to tell apart.
export function publisherMatches(cvPublisher, gcdPublisherName) {
  const cv = normalizePublisher(cvPublisher);
  const gcd = normalizePublisher(gcdPublisherName);
  if (!cv || !gcd) return false;
  return cv === gcd;
}

export function normalizeSeriesName(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/^the\s+/, "");
}

export function chooseSkippedCandidate({ skipReason, volumeTitle, volumePublisher, startYear,
  candidates, overlapThreshold = 0.85, minMargin = 0.15 }) {
  if (skipReason === "ambiguous") {
    const matching = candidates
      .filter((candidate) => candidate.overlap >= overlapThreshold)
      .filter((candidate) => publisherMatches(volumePublisher, candidate.publisherName))
      .sort((a, b) => b.overlap - a.overlap);
    if (matching.length === 1
      || (matching.length > 1 && matching[0].overlap - matching[1].overlap >= minMargin)) {
      return { winner: matching[0], reason: "publisher tiebreak" };
    }
  }

  if (skipReason === "no_candidate" || skipReason === "same_start_year") {
    const title = normalizeSeriesName(volumeTitle);
    const matching = candidates.filter((candidate) =>
      normalizeSeriesName(candidate.name) === title
      && publisherMatches(volumePublisher, candidate.publisherName)
      && startYear != null && candidate.yearBegan != null
      && Math.abs(Number(candidate.yearBegan) - Number(startYear)) <= 1
      && candidate.overlap >= 0.60
    );
    if (matching.length === 1) return { winner: matching[0], reason: "title+publisher+year" };
  }
  return null;
}
