// Server-side market-value lookup. Loads market_comps plus the issue and
// series metadata the comp filter needs, then hands each copy to
// valueFromComps() in src/lib/compValue.js, which owns the actual valuation
// rules. The library page, public profiles and the PDF export all call
// through here; scripts/snapshotCollectionValue.js calls valueFromComps
// directly, so the two cannot drift.

import { valueFromComps, emptyValue, issueYearFrom, MIN_SAMPLES } from "@/lib/compValue";

const DEFAULT_WINDOW_DAYS = 90;

// Single-copy convenience over the bulk path. Same return shape:
//   { value, sample_size, bucket_used, fallback, condition_unknown,
//     low_grade_proxy, source, comp_source, newest_comp_date, oldest_comp_date }
export async function getMarketValue({ supabase, gcd_issue_id, grade_numeric, slab_company, condition, release_year, windowDays, minSamples } = {}) {
  if (!supabase) throw new Error("getMarketValue: supabase client is required");
  const map = await getMarketValuesBulk({
    supabase,
    items: [{ collection_id: "single", gcd_issue_id, grade_numeric, slab_company, condition, release_year }],
    windowDays,
    minSamples,
  });
  return map.get("single") ?? emptyValue();
}

// Bulk variant for PDF generation, the library page and public profiles.
// Given a list of {collection_id, gcd_issue_id, grade_numeric, slab_company,
// condition, release_year} entries, returns a map keyed by collection_id.
//
// This used to issue one query PER ITEM, eight at a time. That was already
// the dominant cost of a large profile — 326 owned books meant 326 round
// trips and about 6.8s — and adding the pooled-raw fallback made it worse,
// because an ungraded book that misses its exact bucket now tries a second
// one: 571 queries and 9.8s, measured against the largest real collection on
// 2026-09-24. Now it fetches every comp for the collection's distinct issues
// in a couple of paginated reads and does the matching in memory.
const ISSUE_CHUNK = 200;
// Comps per issue run into the dozens, so 200 issues per read meant ~11
// offset pages read one after another, each re-sorting the whole match set
// (16 s for a 383-book library, measured 2026-10-14). 25 issues usually fit
// one page; three such reads run at once. Each issue's comps still arrive in
// id order, which is all valueFromComps sees.
const COMP_ISSUE_CHUNK = 25;
const COMP_CONCURRENCY = 3;

async function mapLimit(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}

function chunked(values, size) {
  const out = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}
const PAGE = 1000;

// PostgREST silently caps a read at 1000 rows (OPERATIONS_HANDOFF 2a); a
// truncated read here would look exactly like "these books have no comps".
async function readAll(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { rows, error: null };
  }
}

export async function getMarketValuesBulk({
  supabase,
  items,
  windowDays = DEFAULT_WINDOW_DAYS,
  minSamples = MIN_SAMPLES,
  throwOnReadError = false,
} = {}) {
  if (!supabase) throw new Error("getMarketValuesBulk: supabase required");
  const list = Array.isArray(items) ? items : [];
  const out = new Map();
  if (list.length === 0) return out;

  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const issueIds = [...new Set(list.map((i) => i?.gcd_issue_id).filter((v) => v != null).map(Number))];

  const compsByIssue = new Map();
  const issueById = new Map();
  // Comps and issue metadata are independent reads; run them together.
  const [compReads, issueReads] = await Promise.all([
    mapLimit(chunked(issueIds, COMP_ISSUE_CHUNK), COMP_CONCURRENCY, (chunk) => readAll(() =>
      supabase
        .from("market_comps")
        .select("gcd_issue_id, grade_bucket, grade_numeric, sold_price, sold_date, source, listing_title")
        .in("gcd_issue_id", chunk)
        .gte("sold_date", sinceIso)
        .order("id", { ascending: true })
    )),
    mapLimit(chunked(issueIds, ISSUE_CHUNK), 1, (chunk) => readAll(() =>
      supabase
        .from("gcd_issues")
        .select("gcd_id, series_gcd_id, key_date, publication_date")
        .in("gcd_id", chunk)
        .order("gcd_id", { ascending: true })
    )),
  ]);
  for (const comps of compReads) {
    if (comps.error) {
      console.error("getMarketValuesBulk comp fetch failed:", comps.error);
      if (throwOnReadError) throw comps.error;
      return fillEmpty(list, out);
    }
    for (const row of comps.rows) {
      const key = Number(row.gcd_issue_id);
      if (!compsByIssue.has(key)) compsByIssue.set(key, []);
      compsByIssue.get(key).push(row);
    }
  }
  for (const issues of issueReads) {
    if (issues.error) {
      console.error("getMarketValuesBulk issue fetch failed:", issues.error);
      if (throwOnReadError) throw issues.error;
      return fillEmpty(list, out);
    }
    for (const row of issues.rows) issueById.set(Number(row.gcd_id), row);
  }

  const seriesIds = [...new Set([...issueById.values()].map((r) => r.series_gcd_id).filter((v) => v != null))];
  const seriesById = new Map();
  for (let c = 0; c < seriesIds.length; c += ISSUE_CHUNK) {
    const chunk = seriesIds.slice(c, c + ISSUE_CHUNK);
    const series = await readAll(() =>
      supabase
        .from("series")
        .select("id, gcd_id, title, year_start_cached")
        .in("gcd_id", chunk)
        .order("id", { ascending: true })
    );
    if (series.error) {
      console.error("getMarketValuesBulk series fetch failed:", series.error);
      if (throwOnReadError) throw series.error;
      return fillEmpty(list, out);
    }
    for (const row of series.rows) seriesById.set(Number(row.gcd_id), row);
  }

  for (const item of list) {
    if (!item?.collection_id) continue;
    const issueRow = issueById.get(Number(item.gcd_issue_id));
    const seriesRow = issueRow ? seriesById.get(Number(issueRow.series_gcd_id)) : null;
    out.set(
      item.collection_id,
      valueFromComps({
        comps: compsByIssue.get(Number(item.gcd_issue_id)) ?? [],
        item,
        issue: {
          seriesTitle: seriesRow?.title ?? null,
          issueYear: issueYearFrom(issueRow) ?? item.release_year ?? null,
          seriesStartYear: seriesRow?.year_start_cached ?? null,
        },
        minSamples,
      })
    );
  }
  return out;
}

function fillEmpty(list, out) {
  for (const item of list) {
    if (item?.collection_id) out.set(item.collection_id, emptyValue());
  }
  return out;
}
