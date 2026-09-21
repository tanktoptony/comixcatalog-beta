// PostgREST silently caps any read at 1000 rows. It does not error and it
// does not signal truncation, so an unpaginated query that matches 3,000 rows
// returns 1,000 and looks exactly like a query that matched 1,000. A
// truncated read is indistinguishable from a real data gap, which is what
// makes this bug class expensive: it produces confidently wrong numbers.
//
// It has already shipped three times here:
//   - PR #63, library hydration: full-collection batches over canonical_covers
//   - scripts/reportUserCollectedCoverCoverage.js (2026-09-20): reported
//     15.86% user-collected cover coverage when the real figure was 97.28%,
//     because it saw 2,000 of 13,473 covers. That wrong number then drove a
//     whole task's premise before anyone checked it.
//
// Copies of this loop already exist in scripts/lib/coverageMetrics.js,
// scripts/auditForeignDuplicateSeries.js and
// scripts/backfillSeriesComicvineVolumeId.js. This is the src/ counterpart,
// which previously had none at all — which is precisely why the API routes
// under src/app/api were the ones still truncating.
//
// Usage — pass a THUNK that rebuilds the query, not a built query, since a
// PostgREST builder can only be awaited once:
//
//   const rows = await fetchAllPages(() =>
//     supabase.from("canonical_covers").select("...").eq("series_gcd_id", id)
//   );
//
// `orderCol` must be a stable, unique column or pages can overlap/skip rows.
// Defaults to "id".

const PAGE = 1000;

// Guard against an unbounded scan if a caller points this at a huge table
// with no filter. 50k rows is far above any legitimate per-series or
// per-user result set here and still well under gcd_issues' ~2.4M.
const MAX_ROWS = 50000;

export async function fetchAllPages(build, orderCol = "id") {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build()
      .order(orderCol, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    if (rows.length >= MAX_ROWS) {
      console.warn(
        `fetchAllPages: stopped at ${rows.length} rows (MAX_ROWS). ` +
          `This query is probably missing a filter.`
      );
      break;
    }
  }
  return rows;
}
