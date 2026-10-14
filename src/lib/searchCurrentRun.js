// Classic run first, current run second. Reprint ranking puts the run
// collectors mean on top ("batman" -> Batman 1940), but reprints pile up over
// decades, so the book on the shelf this week would sink to the bottom. When
// the top result is an exact title match, move the newest still-running
// exact match up to second place.
export function pinCurrentRun(rows, isExactMatch, currentYear = new Date().getUTCFullYear()) {
  if (!Array.isArray(rows) || rows.length < 3 || !isExactMatch(rows[0])) return rows;
  let pick = -1;
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!isExactMatch(row)) continue;
    const end = Number(row.year_end_cached);
    const ongoing = !end || end >= currentYear - 1;
    if (!ongoing) continue;
    if (pick === -1 || Number(row.year_start_cached) > Number(rows[pick].year_start_cached)) pick = i;
  }
  if (pick === -1) return rows;
  // Already second or the current run is the one on top: leave it.
  const second = rows[1];
  const secondEnd = Number(second?.year_end_cached);
  if (isExactMatch(second) && (!secondEnd || secondEnd >= currentYear - 1)
    && Number(second.year_start_cached) >= Number(rows[pick].year_start_cached)) return rows;
  const out = rows.slice();
  const [current] = out.splice(pick, 1);
  out.splice(1, 0, current);
  return out;
}
