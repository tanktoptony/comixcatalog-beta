// Which book goes on a founder's wall tile (see foundingShowcase.js). Pure, so
// it can be tested without Next or the database.

const valueOf = (row) => Number(row.market_value ?? row.auto_market_value) || 0;

// rows: one founder's candidate copies. covers: Map gcd_issue_id -> cover.
// Returns the copy to show, or null when none has a cover.
export function pickShowcase(rows, covers) {
  const seen = new Set();
  const ordered = [...(rows ?? [])]
    .filter((row) => row?.gcd_issue_id != null)
    .sort((a, b) => valueOf(b) - valueOf(a)
      || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  for (const row of ordered) {
    const id = Number(row.gcd_issue_id);
    if (seen.has(id)) continue;
    seen.add(id);
    if (covers.get(id)?.storage_path) return row;
  }
  return null;
}
