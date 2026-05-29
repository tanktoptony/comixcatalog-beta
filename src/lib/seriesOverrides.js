// Curated overrides for the marketable core.
//
// Why this exists: both raw publisher signals are corrupt. `gcd_series.
// publisher_gcd_id` is scrambled (the US Marvel ThunderCats links to a Spanish
// publisher), and `cv_publisher` was mass-stamped by the cover ingest's
// title-only ComicVine match (every "Thundercats" series got "Marvel",
// including the 2024 Dynamite run and foreign reprints). So for the series
// collectors actually search, we pin verified values here instead of trusting
// the firehose.
//
// Keyed by gcd_id. Applied in scripts/refreshSeriesSearchCache.js, overriding
// the computed resolved_publisher_cached / year span before they're written to
// the series cache.
//
// Suppression mechanism: setting `publisher` to a non-US house (e.g.
// "Marvel UK") naturally drops the row from US search via the existing
// US_PUBLISHER_ALLOWLIST filter — correct attribution doubles as suppression,
// no separate flag needed. For a US row you want hidden anyway, use
// `hide: true`.
//
// `// VERIFY` marks a best-guess to confirm.
export const SERIES_OVERRIDES = {
  // ── ThunderCats (proof case) ───────────────────────────────────────────
  3055:   { publisher: "Marvel Comics" },          // 1985–1988 Star/Marvel — the canonical US run
  208797: { publisher: "Dynamite Entertainment" }, // 2024 Dynamite relaunch (was mislabeled Marvel)
  61431:  { publisher: "Marvel UK" },              // 1987–1990 UK weekly — non-US → drops from US search
  10331:  { publisher: "WildStorm" },              // 2002 WildStorm relaunch  // VERIFY
  23875:  { publisher: "WildStorm" },              // 2003–2005 WildStorm       // VERIFY
};

// Look up an override by gcd_id (number or string-safe).
export function getSeriesOverride(gcdId) {
  if (gcdId == null) return null;
  return SERIES_OVERRIDES[Number(gcdId)] ?? null;
}
