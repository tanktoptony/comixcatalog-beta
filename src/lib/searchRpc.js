// One entry point for the series search RPC.
//
// search_series_by_relevance_v2 (migration 0064) returns the same rows in the
// same order as search_series_by_relevance (0041), verified on live data
// 2026-10-13, but looks titles up through the trigram indexes instead of
// reading all ~209k series rows (EXPLAIN on "batman": Seq Scan, 7.1 s). It
// falls back to v1 only when v2 doesn't exist, so a database without 0064
// keeps working. Any other error is returned as-is: retrying a timeout on v1
// would only double the wait.

export const SEARCH_SERIES_RPC = "search_series_by_relevance_v2";
export const SEARCH_SERIES_RPC_V1 = "search_series_by_relevance";

// PGRST202: PostgREST can't find the function. 42883: Postgres "function does
// not exist".
export function isMissingFunctionError(error) {
  return Boolean(error) && (error.code === "PGRST202" || error.code === "42883");
}

export async function searchSeriesRpc(supabase, params) {
  const result = await supabase.rpc(SEARCH_SERIES_RPC, params);
  if (isMissingFunctionError(result.error)) {
    return supabase.rpc(SEARCH_SERIES_RPC_V1, params);
  }
  return result;
}
