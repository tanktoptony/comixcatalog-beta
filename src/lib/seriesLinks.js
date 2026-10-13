function relatedSeries(row, currentGcdId) {
  return Number(row.from_gcd_id) === Number(currentGcdId)
    ? row.to_series
    : row.from_series;
}

// Convert database rows into rendering-neutral display lines. Keeping this
// pure makes direction, precedence, and missing-link behavior testable without
// React or Supabase.
export function seriesLinkDisplayLines(rows, currentGcdId) {
  if (currentGcdId == null) return [];

  const preferred = new Map();
  for (const row of rows ?? []) {
    const from = Number(row.from_gcd_id);
    const to = Number(row.to_gcd_id);
    if (from !== Number(currentGcdId) && to !== Number(currentGcdId)) continue;
    const key = `${from}:${to}:${row.kind}`;
    const existing = preferred.get(key);
    if (!existing || (row.source === "curated" && existing.source !== "curated")) {
      preferred.set(key, row);
    }
  }

  return [...preferred.values()].flatMap((row) => {
    const other = relatedSeries(row, currentGcdId);
    if (!other?.title || !other?.id) return [];
    let label;
    // collected_in points from the single issues to the collection, so the
    // collection page reads it the other way round.
    if (row.kind === "collected_in") label = Number(row.from_gcd_id) === Number(currentGcdId) ? "Collected in" : "Collects";
    else if (Number(row.from_gcd_id) === Number(currentGcdId)) label = "Continues in";
    else label = "Continued from";
    return [{
      label,
      title: other.title,
      href: `/series/${other.id}`,
      year: other.year_start_cached ?? null,
      note: row.source === "curated" ? row.note ?? null : null,
      kind: row.kind,
    }];
  });
}
