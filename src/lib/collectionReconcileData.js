// Candidate lookup for collection reconciliation, shared by the library
// review route and scripts/reconcileCollections.js.
//
// Series first, then issue numbers inside those series. Looking issues up by
// number alone ("#1") matches hundreds of thousands of gcd_issues rows; the
// series search goes through the trigram indexes the site search uses
// (search_series_by_relevance_v2), and the issue query is bounded by a
// handful of series ids.
import { searchSeriesRpc } from "./searchRpc.js";
import { US_PUBLISHER_ALLOWLIST } from "./publisher.js";
import { normalizeIssueNumber, normalizeTitle } from "./collectionReconcile.js";

const SERIES_PER_TITLE = 40;

// Same cleanup the classifier compares with, so search and match agree.
export function searchTerm(title) {
  return normalizeTitle(title);
}

async function searchSeries(supabase, term) {
  if (!term) return [];
  const { data, error } = await searchSeriesRpc(supabase, {
    normalized_term: term,
    allowed_publishers: US_PUBLISHER_ALLOWLIST,
    result_limit: SERIES_PER_TITLE,
  });
  if (error) throw new Error(`series search: ${error.message}`);
  return (data ?? []).filter((row) => row.gcd_id != null);
}

// Full title first; if nothing matches, the main title before a colon
// ("DMZ: Random Fire" is DMZ #27). Anything found this way still has to pass
// classifyCollectionBook, and a looser hit is at best "likely" (member asked).
async function seriesForTitle(supabase, title) {
  const found = await searchSeries(supabase, searchTerm(title));
  if (found.length || !String(title).includes(":")) return found;
  return searchSeries(supabase, searchTerm(String(title).split(":")[0]));
}

// Returns Map<comic id, candidate[]>, candidates shaped for classifyCollectionBook.
export async function loadReconcileCandidates(supabase, comics) {
  const byComic = new Map();
  const seriesCache = new Map();
  for (const comic of comics ?? []) {
    const rawNumber = String(comic.issue_number ?? "").trim();
    if (!comic.series_title || !rawNumber) {
      byComic.set(comic.id, []);
      continue;
    }
    const titleKey = searchTerm(comic.series_title);
    if (!seriesCache.has(titleKey)) seriesCache.set(titleKey, await seriesForTitle(supabase, comic.series_title));
    const series = seriesCache.get(titleKey);
    if (!series.length) {
      byComic.set(comic.id, []);
      continue;
    }
    const seriesById = new Map(series.map((row) => [Number(row.gcd_id), row]));
    const numbers = [...new Set([rawNumber, normalizeIssueNumber(rawNumber)])];
    const { data: issues, error } = await supabase.from("gcd_issues")
      .select("gcd_id,series_gcd_id,issue_number,key_date,publication_date,variant_of_gcd_id")
      .in("series_gcd_id", [...seriesById.keys()])
      .in("issue_number", numbers)
      .limit(200);
    if (error) throw new Error(`issues: ${error.message}`);
    byComic.set(comic.id, (issues ?? []).map((issue) => {
      const owner = seriesById.get(Number(issue.series_gcd_id)) ?? {};
      return {
        ...issue,
        series_title: owner.title,
        series_year_start: owner.year_start_cached,
        series_year_end: owner.year_end_cached,
        publisher: owner.resolved_publisher_cached,
      };
    }));
  }
  return byComic;
}
