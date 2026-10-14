// One entry point for the series search RPC.
//
// search_series_by_relevance_v2 (migration 0064) replaced v1 (0041, dropped in
// 0065) on 2026-10-13. v1 seq-scanned all ~209k series rows on every broad
// search (EXPLAIN on "batman": 7.1 s quiet, 40-55 s under load); v2 looks
// titles up through the trigram indexes and returns the same rows in the same
// order (verified on live data). Keep callers on this helper so the RPC name
// lives in one place.

export const SEARCH_SERIES_RPC = "search_series_by_relevance_v2";

export function searchSeriesRpc(supabase, params) {
  return supabase.rpc(SEARCH_SERIES_RPC, params);
}
