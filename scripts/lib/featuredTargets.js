// The two pure decisions inside the GCD issue refresh: which series row a
// featured entry resolves to, and which series a given run spends its tiny
// GCD request budget on.
//
// They live here rather than in refreshGcdIssuesFromApi.js because that file
// builds a Supabase client at module scope, so importing it from a test needs
// live credentials. Both of these got a defect shipped past them (see below),
// so both need to be testable without a database.

// Resolve one featured entry to the candidate series row whose start year
// sits closest to its prefer_year.
//
// Worth stating what this does NOT do: when two candidates tie on year, the
// first one wins. That is only deterministic if the caller hands over the
// candidates in a stable order - which is exactly what an unpaginated,
// unordered PostgREST read does not do. Measured 2026-09-23, 10 of the 79
// featured entries were equal-year ties decided purely by row order.
export function pickBestCandidate(entry, candidates) {
  if (!candidates || candidates.length === 0) return null;
  let best = candidates[0];
  let bestDelta = Infinity;
  for (const c of candidates) {
    const delta = entry.prefer_year != null && c.year_start_cached != null
      ? Math.abs(c.year_start_cached - entry.prefer_year) : Infinity;
    if (delta < bestDelta) { best = c; bestDelta = delta; }
  }
  return best;
}

// Start just after the last series the previous run attempted, wrapping at
// the end of the list.
//
// A run gets roughly 29 GCD requests before the 429 and the featured list is
// 78 series, so one run can never reach the end. Walking a fixed order meant
// every weekly run re-walked the same front of the list and the tail was
// never refreshed at all - four consecutive runs stopped inside the first
// four series. If the cursor id is no longer in the list, the featured list
// changed underneath us and starting from the top is the safe answer.
export function rotate(ids, lastGcdId) {
  const i = lastGcdId == null ? -1 : ids.indexOf(lastGcdId);
  if (i < 0) return ids;
  return [...ids.slice(i + 1), ...ids.slice(0, i + 1)];
}

// The cursor is a committed file, so a corrupt or absent one must not take
// the run down: there is always a correct fallback (start at the top). These
// take the path and an fs so a test can exercise them without a live run -
// proving the cursor round-trips would otherwise cost an hour of GCD's
// rate-limit penalty.
export function readCursor(file, fs) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const id = Number(parsed.lastGcdId);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function writeCursor(file, fs, lastGcdId) {
  fs.writeFileSync(
    file,
    `${JSON.stringify({ updated: new Date().toISOString(), lastGcdId }, null, 2)}\n`
  );
}
