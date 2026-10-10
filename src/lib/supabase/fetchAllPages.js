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
// Offset paging is fine for small result sets. For deep reads, use
// fetchAllByKeyset: production canonical_covers measurements on 2026-10-06
// rose from 180ms at offset 0 to 3.6s at 10,000 and 8.0s at 30,000, with
// deeper pages hitting Postgres 57014 statement timeout. Keyset pages stay at
// approximately first-page cost.
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
const KEYSET_MAX_ROWS = 200000;

export async function fetchAllPages(build, orderCol = "id", { maxRows = MAX_ROWS } = {}) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const pageSize = Math.min(PAGE, maxRows - rows.length);
    if (pageSize <= 0) break;
    const { data, error } = await build()
      .order(orderCol, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    if (rows.length >= maxRows) {
      console.warn(
        `fetchAllPages: stopped at ${rows.length} rows (maxRows). ` +
          `This query is probably missing a filter.`
      );
      break;
    }
  }
  return rows;
}

// Pages by the last value seen instead of making Postgres walk an ever-deeper
// offset. `keyCol` must be unique and non-null or pages can overlap/skip rows.
// maxRows: a guard against an unfiltered scan. A whole-table read on purpose
// (an audit script) must pass a cap above the table size, or it truncates.
export async function fetchAllByKeyset(build, keyCol = "id", { maxRows = KEYSET_MAX_ROWS } = {}) {
  const rows = [];
  let last;
  while (true) {
    let query = build().order(keyCol, { ascending: true }).limit(PAGE);
    if (last !== undefined) query = query.gt(keyCol, last);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    if (rows.length >= maxRows) {
      console.warn(
        `fetchAllByKeyset: stopped at ${rows.length} rows (KEYSET_MAX_ROWS). ` +
          `This query is probably missing a filter.`
      );
      break;
    }
    last = data.at(-1)[keyCol];
  }
  return rows;
}

// Same contract, but asks for `concurrency` pages at a time instead of one.
// Every page is ~150-200ms of round trip regardless of size, so a 9-page read
// drops from ~1.8s to ~0.5s. It may request up to concurrency-1 empty pages
// past the end; those are cheap. Kept at 4 or fewer: wide parallel reads
// against this database have taken the site down before (2026-10-01).
export async function fetchAllPagesParallel(build, orderCol = "id", concurrency = 4) {
  const rows = [];
  for (let start = 0; ; start += PAGE * concurrency) {
    const pages = await Promise.all(
      Array.from({ length: concurrency }, (_, i) => {
        const from = start + i * PAGE;
        return build().order(orderCol, { ascending: true }).range(from, from + PAGE - 1);
      })
    );
    let done = false;
    for (const { data, error } of pages) {
      if (error) throw error;
      if (done) continue;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) done = true;
    }
    if (done) break;
    if (rows.length >= MAX_ROWS) {
      console.warn(`fetchAllPagesParallel: stopped at ${rows.length} rows (MAX_ROWS). This query is probably missing a filter.`);
      break;
    }
  }
  return rows;
}
