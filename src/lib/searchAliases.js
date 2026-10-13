// A Reddit report on 2026-10-13 exposed the gap: searching "Coheed"
// found nothing because the band's comics use The Amory Wars and related
// titles. Keep this small and hand-curated; these are search hints, not data.
export const SEARCH_ALIASES = {
  coheed: ["amorywars", "bagonlineadventures", "goodapolloimburningstariv"],
  coheedandcambria: ["amorywars", "bagonlineadventures", "goodapolloimburningstariv"],
  coheedcambria: ["amorywars", "bagonlineadventures", "goodapolloimburningstariv"],
};

export function aliasTermsFor(normalizedQ) {
  const query = String(normalizedQ ?? "");
  if (!query) return [];

  const terms = new Set();
  for (const [alias, aliasTerms] of Object.entries(SEARCH_ALIASES)) {
    if (query === alias || (query.length >= 5 && alias.startsWith(query))) {
      for (const term of aliasTerms) terms.add(term);
    }
  }
  return [...terms];
}
