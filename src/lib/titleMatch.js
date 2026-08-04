// Shared title-normalization helpers for matching ComicVine-sourced
// `canonical_covers.series_title` against GCD-sourced `series.title`.
// The two sources routinely disagree on punctuation for the exact same
// series — e.g. GCD's "DC Comics: Bombshells" vs ComicVine's "DC Comics
// Bombshells" (no colon) — which silently breaks both the live per-series
// cover lookup (src/app/api/series/[id]/route.js) and the cached-column
// cover matcher (scripts/refreshSeriesSearchCache.js), since both start
// from an exact-string database match. Found 2026-08-03: 90+ freshly
// ingested Bombshells covers were unreachable by either matcher because
// of the missing colon, on top of the already-handled "The X" vs "X"
// leading-article mismatch.
//
// stripPunctuation() is case-preserving — use it to build additional
// exact-match query candidates (the DB still needs a literal string to
// compare against; there's no fuzzy matching at the SQL layer here).
// normTitle() is fully normalized (lowercased, article-stripped) — use it
// as the in-memory comparison/grouping key once rows are fetched.

export function stripPunctuation(title) {
  return String(title ?? "")
    .replace(/[:,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normTitle(value) {
  let s = stripPunctuation(value).toLowerCase();
  if (s.startsWith("the ")) s = s.slice(4);
  return s;
}
