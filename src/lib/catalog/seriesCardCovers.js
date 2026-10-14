import { resolveSeriesCovers } from "./covers.js";

// Search result cards read each series' cover from series.card_cover_path
// (migration 0067) instead of re-resolving it on every search. Measured live
// 2026-10-14: resolveSeriesCovers took 8-11 s of a 17 s first "batman" search,
// mostly series with no covered issue at all, whose every issue was walked
// each time. Those are stored too: checked with a null path means "no cover".
//
// The stored value is the same resolver's answer, computed from the series
// row as it is in the database. Triggers in 0067 clear it when covers, issues,
// the series row or its GCD format change; a pick is saved only if its row
// was not invalidated while it was being computed (version check).
//
// If the RPCs are missing (code deployed before the migration) or fail, this
// falls back to resolving every series, which is what search did before.

export const CLAIM_CARD_COVERS_RPC = "claim_series_card_covers";
export const SAVE_CARD_COVERS_RPC = "save_series_card_covers";

const CLAIM_CHUNK = 200;

async function claimCardCovers(supabase, ids) {
  const rows = [];
  for (let index = 0; index < ids.length; index += CLAIM_CHUNK) {
    const { data, error } = await supabase.rpc(CLAIM_CARD_COVERS_RPC, { p_ids: ids.slice(index, index + CLAIM_CHUNK) });
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

export async function resolveSeriesCardCovers(supabase, seriesRows, { save = true, resolve = resolveSeriesCovers } = {}) {
  const series = (seriesRows ?? []).filter((row) => row?.id != null && row?.gcd_id != null);
  if (!series.length) return new Map();

  let stored;
  try {
    stored = await claimCardCovers(supabase, [...new Set(series.map((row) => row.id))]);
  } catch (error) {
    console.error("series card covers unavailable, resolving directly:", error?.code, error?.message);
    return resolve(supabase, series);
  }

  const covers = new Map();
  const storedById = new Map(stored.map((row) => [row.id, row]));
  const misses = [];
  for (const row of series) {
    const entry = storedById.get(row.id);
    if (!entry || entry.gcd_id == null) continue;
    if (entry.card_cover_checked) {
      if (entry.card_cover_path) covers.set(row.id, { storage_path: entry.card_cover_path, source: "card_cover" });
    } else {
      misses.push(entry);
    }
  }
  if (!misses.length) return covers;

  const resolved = await resolve(supabase, misses);
  for (const [id, cover] of resolved) covers.set(id, cover);

  if (save) {
    const picks = misses.map((entry) => ({
      id: entry.id,
      version: entry.card_cover_version,
      path: resolved.get(entry.id)?.storage_path ?? null,
    }));
    const { error } = await supabase.rpc(SAVE_CARD_COVERS_RPC, { p_picks: picks });
    if (error) console.error("saving series card covers failed:", error.code, error.message);
  }
  return covers;
}
