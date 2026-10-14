import { SEARCH_CACHE_REVALIDATE_SECONDS } from "./searchCache.js";

// Each search term's full ranked result, stored in search_term_cache
// (migration 0068) instead of Next's unstable_cache. Measured 2026-10-14: the
// unstable_cache entries did not survive (a term warmed an hour earlier was
// recomputed in the request, no deploy in between), and a recompute is the
// series RPC at 0.3-7 s under load.
//
//   row fresh (< 10 min)  -> served
//   row stale             -> served now, refreshed in the background
//   no row                -> computed in the request, saved afterwards
//   table unreadable      -> the caller's fallback (the old unstable_cache)
//
// compute() returns the result; a result with degraded: true is returned but
// never stored, the same contract as before.

export const TERM_CACHE_TABLE = "search_term_cache";

// schedule is Next's after() in the routes, so background work outlives the
// response on Vercel. Outside a request it throws, and the work runs detached.
function runAfter(schedule, work) {
  const guarded = () => work().catch((error) => console.error("search term cache background work failed:", error));
  try {
    if (!schedule) throw new Error("no scheduler");
    schedule(guarded);
  } catch {
    guarded();
  }
}

async function save(supabase, kind, key, result) {
  const { error } = await supabase.rpc("save_search_term", { p_kind: kind, p_key: key, p_payload: result });
  if (error) throw error;
}

export async function cachedSearchTerm(supabase, { kind, key, compute, fallback, schedule = null, now = Date.now }) {
  let row;
  try {
    const { data, error } = await supabase.from(TERM_CACHE_TABLE)
      .select("payload, computed_at").eq("kind", kind).eq("cache_key", key).maybeSingle();
    if (error) throw error;
    row = data;
  } catch (error) {
    console.error("search term cache unavailable, using fallback:", error?.code, error?.message);
    return { result: await fallback(), state: "fallback" };
  }

  if (row) {
    const ageSeconds = (now() - Date.parse(row.computed_at)) / 1000;
    if (!(ageSeconds > SEARCH_CACHE_REVALIDATE_SECONDS)) return { result: row.payload, state: "hit" };
    runAfter(schedule, async () => {
      const { data: claimed, error } = await supabase.rpc("claim_search_term_refresh", { p_kind: kind, p_key: key });
      if (error) throw error;
      if (!claimed) return;
      const fresh = await compute();
      if (!fresh?.degraded) await save(supabase, kind, key, fresh);
    });
    return { result: row.payload, state: "stale" };
  }

  const result = await compute();
  if (!result?.degraded) runAfter(schedule, () => save(supabase, kind, key, result));
  return { result, state: "miss" };
}
