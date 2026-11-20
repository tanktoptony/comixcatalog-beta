// Which books go on a founder's wall tile and pass (see foundingShowcase.js).
// Pure, so it can be tested without Next or the database.

const valueOf = (row) => Number(row.market_value ?? row.auto_market_value) || 0;

// rows: one founder's candidate copies. covers: Map gcd_issue_id -> cover.
// Returns up to `limit` copies with a cover, most valuable first (newest
// first among equal values), one per issue.
export function pickShowcaseList(rows, covers, limit = 1) {
  const seen = new Set();
  const out = [];
  const ordered = [...(rows ?? [])]
    .filter((row) => row?.gcd_issue_id != null)
    .sort((a, b) => valueOf(b) - valueOf(a)
      || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  for (const row of ordered) {
    if (out.length >= limit) break;
    const id = Number(row.gcd_issue_id);
    if (seen.has(id)) continue;
    seen.add(id);
    if (covers.get(id)?.storage_path) out.push(row);
  }
  return out;
}

// The one copy for a wall tile, or null when none has a cover.
export function pickShowcase(rows, covers) {
  return pickShowcaseList(rows, covers, 1)[0] ?? null;
}

// Fills a cover mosaic of `size` cells: the founder's own covers first, in
// order, then `fallback` covers, then repeats from the start. Empty when
// there is nothing to show.
export function fillMosaic(own, fallback, size) {
  const pool = [...new Set([...(own ?? []), ...(fallback ?? [])].filter(Boolean))];
  if (!pool.length) return [];
  return Array.from({ length: size }, (_, i) => pool[i % pool.length]);
}
