// Server-side market-value lookup. Reads market_comps with a fallback chain
// against gradeBucket()'s output. Designed to be the single source of truth
// for "what is this copy worth?" — the library page and the PDF generator
// both call through here.
//
// The pure-utility primitives (snapToCgcGrade, gradeBucket, bucketFallbacks,
// median) live in src/lib/valuation.js. This file glues them to Supabase.

import {
  gradeBucket,
  bucketFallbacks,
  median,
  coverPriceForYear,
  isRawPool,
  percentile,
  RAW_POOL_BUCKETS,
  RAW_POOL_PERCENTILE,
} from "@/lib/valuation";

// Tuning knobs. Conservative defaults — we'd rather return null than show
// a wildly noisy median based on one weird sale.
const DEFAULT_WINDOW_DAYS = 90;
const MIN_SAMPLES = 3;
const MAX_SAMPLES_TO_CONSIDER = 50;

// Compute the most credible market value for a single collection item.
//
// Input: a Supabase client (service-role recommended) and the issue/grade
// inputs. Either pass `bucket` directly OR pass `{grade_numeric, slab_company,
// condition}` and we'll compute it.
//
// Returns:
//   {
//     value: number | null,                  -- median of comps, or null
//     sample_size: number,                   -- how many comps fed the median
//     bucket_used: string | null,            -- which bucket actually matched
//     fallback: boolean,                     -- true if a less-specific bucket was used
//     newest_comp_date: string | null,       -- ISO date
//     oldest_comp_date: string | null,
//   }
//
// Callers can decide what to do with low-confidence results (e.g. show a
// "1 sale" disclaimer instead of treating it as gospel).
export async function getMarketValue({
  supabase,
  gcd_issue_id,
  bucket,
  grade_numeric,
  slab_company,
  condition,
  release_year,
  windowDays = DEFAULT_WINDOW_DAYS,
  minSamples = MIN_SAMPLES,
} = {}) {
  if (!supabase) {
    throw new Error("getMarketValue: supabase client is required");
  }
  if (gcd_issue_id == null) {
    return emptyResult();
  }

  const primaryBucket =
    bucket || gradeBucket({ grade_numeric, slab_company, condition });
  const tryBuckets = bucketFallbacks(primaryBucket);

  const sinceIso = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);

  // We try each candidate bucket in order. First one that clears minSamples
  // wins. This is more network calls than a single OR-query but the result
  // is dramatically clearer to reason about — and these queries are tiny.
  for (let i = 0; i < tryBuckets.length; i += 1) {
    const candidate = tryBuckets[i];
    const pooled = isRawPool(candidate);

    // The pooled candidate is a sentinel, never a real grade_bucket value,
    // so it matches with `.in` over every raw bucket instead of `.eq`.
    let query = supabase
      .from("market_comps")
      .select("sold_price, sold_date, source")
      .eq("gcd_issue_id", Number(gcd_issue_id));
    query = pooled
      ? query.in("grade_bucket", RAW_POOL_BUCKETS)
      : query.eq("grade_bucket", candidate);
    const { data, error } = await query
      .gte("sold_date", sinceIso)
      .order("sold_date", { ascending: false })
      .limit(MAX_SAMPLES_TO_CONSIDER);

    if (error) {
      console.error("getMarketValue query failed:", error);
      return emptyResult();
    }

    if ((data?.length ?? 0) >= minSamples) {
      const prices = data.map((r) => Number(r.sold_price));
      // A pooled result describes a book whose condition nobody recorded, so
      // it takes the cautious end of the pool rather than the middle. See
      // RAW_POOL_PERCENTILE in valuation.js for why.
      const value = pooled ? percentile(prices, RAW_POOL_PERCENTILE) : median(prices);
      const dates = data.map((r) => r.sold_date).sort();
      // Dominant underlying source — "ebay" = sold comps (Insights), or
      // "ebay-listed" = active asking prices (Browse, used while Insights
      // access is pending). UI uses this to disclose "sold price" vs
      // "listed price" accurately.
      const sourceCounts = {};
      for (const r of data) {
        const s = r.source || "unknown";
        sourceCounts[s] = (sourceCounts[s] || 0) + 1;
      }
      const dominantSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
      return {
        value: value != null ? roundCurrency(value) : null,
        sample_size: data.length,
        bucket_used: candidate,
        fallback: i > 0,
        // Lets the UI say "condition unknown" rather than presenting a pooled
        // estimate with the same confidence as a same-bucket median.
        condition_unknown: pooled,
        source: "market-comp",
        comp_source: dominantSource,
        newest_comp_date: dates[dates.length - 1] ?? null,
        oldest_comp_date: dates[0] ?? null,
      };
    }
  }

  // No comps cleared minSamples — try cover-price era fallback so every
  // issue gets *some* number. Caller can distinguish this from a real
  // comp-derived value via `source === "cover-price"`.
  const cover = coverPriceForYear(release_year);
  if (cover != null) {
    return {
      value: cover,
      sample_size: 0,
      bucket_used: null,
      fallback: true,
      condition_unknown: false,
      source: "cover-price",
      comp_source: null,
      newest_comp_date: null,
      oldest_comp_date: null,
    };
  }
  return emptyResult();
}

function emptyResult() {
  return {
    value: null,
    sample_size: 0,
    bucket_used: null,
    fallback: false,
    condition_unknown: false,
    source: null,
    comp_source: null,
    newest_comp_date: null,
    oldest_comp_date: null,
  };
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

// Bulk variant for PDF generation, the library page and public profiles.
// Given a list of {collection_id, gcd_issue_id, grade_numeric, slab_company,
// condition} entries, returns a map keyed by collection_id with the same
// shape as getMarketValue's output.
//
// This used to issue one query PER ITEM, eight at a time. That was already
// the dominant cost of a large profile — 326 owned books meant 326 round
// trips and about 6.8s — and adding the pooled-raw fallback made it worse,
// because an ungraded book that misses its exact bucket now tries a second
// one: 571 queries and 9.8s, measured against the largest real collection on
// 2026-09-24. /u/thrice347 took 7.6s to render against 0.9s for a small
// collection, which is long enough for a post-login router.replace() to sit
// there looking like nothing happened.
//
// The old comment said batching "means a big OR filter that's slower than
// the parallel small queries for sane batch sizes". There is a third option
// it missed: fetch every comp for the collection's distinct issues in a
// couple of paginated reads and do the bucket matching in memory. No OR
// filter, no per-item round trip. Two queries instead of 571.
//
// Semantics are deliberately identical to getMarketValue: same 90-day
// window, same minSamples, same most-recent-N cap per bucket, same median
// (or conservative percentile for the pooled bucket), same returned shape.
const ISSUE_CHUNK = 200;
const PAGE = 1000;

export async function getMarketValuesBulk({
  supabase,
  items,
  windowDays = DEFAULT_WINDOW_DAYS,
  minSamples = MIN_SAMPLES,
} = {}) {
  if (!supabase) throw new Error("getMarketValuesBulk: supabase required");
  const list = Array.isArray(items) ? items : [];
  const out = new Map();
  if (list.length === 0) return out;

  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const issueIds = [...new Set(list.map((i) => i?.gcd_issue_id).filter((v) => v != null).map(Number))];

  // Every comp for those issues inside the window. Chunked so the `.in()`
  // list stays reasonable, and paginated inside each chunk because PostgREST
  // silently caps a read at 1000 rows (OPERATIONS_HANDOFF 2a) — a truncated
  // read here would look exactly like "these books have no comps".
  const compsByIssue = new Map();
  for (let c = 0; c < issueIds.length; c += ISSUE_CHUNK) {
    const chunk = issueIds.slice(c, c + ISSUE_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("market_comps")
        .select("gcd_issue_id, grade_bucket, sold_price, sold_date, source")
        .in("gcd_issue_id", chunk)
        .gte("sold_date", sinceIso)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error("getMarketValuesBulk comp fetch failed:", error);
        return fillEmpty(list, out);
      }
      for (const row of data ?? []) {
        const key = Number(row.gcd_issue_id);
        if (!compsByIssue.has(key)) compsByIssue.set(key, []);
        compsByIssue.get(key).push(row);
      }
      if (!data || data.length < PAGE) break;
    }
  }

  for (const item of list) {
    if (!item?.collection_id) continue;
    out.set(item.collection_id, resolveFromComps({ item, compsByIssue, minSamples }));
  }
  return out;
}

function fillEmpty(list, out) {
  for (const item of list) {
    if (item?.collection_id) out.set(item.collection_id, emptyResult());
  }
  return out;
}

// In-memory twin of the query loop in getMarketValue. Kept beside it on
// purpose: if one changes, the other has to, or a collection total stops
// matching the per-book numbers that make it up.
function resolveFromComps({ item, compsByIssue, minSamples }) {
  const rows = compsByIssue.get(Number(item.gcd_issue_id)) ?? [];
  const primaryBucket = gradeBucket({
    grade_numeric: item.grade_numeric,
    slab_company: item.slab_company,
    condition: item.condition,
  });
  const tryBuckets = bucketFallbacks(primaryBucket);

  for (let i = 0; i < tryBuckets.length; i += 1) {
    const candidate = tryBuckets[i];
    const pooled = isRawPool(candidate);
    const matched = rows.filter((r) =>
      pooled ? RAW_POOL_BUCKETS.includes(r.grade_bucket) : r.grade_bucket === candidate
    );
    if (matched.length < minSamples) continue;

    // Newest first, then the same cap the single-item path applies.
    matched.sort((a, b) => String(b.sold_date ?? "").localeCompare(String(a.sold_date ?? "")));
    const window = matched.slice(0, MAX_SAMPLES_TO_CONSIDER);

    const prices = window.map((r) => r.sold_price);
    const value = pooled ? percentile(prices, RAW_POOL_PERCENTILE) : median(prices);
    const dates = window.map((r) => r.sold_date).filter(Boolean).sort();

    const sourceCounts = {};
    for (const r of window) {
      const src = r.source || "unknown";
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    }
    const dominantSource =
      Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";

    return {
      value: value != null ? roundCurrency(value) : null,
      sample_size: window.length,
      bucket_used: candidate,
      fallback: i > 0,
      condition_unknown: pooled,
      source: "market-comp",
      comp_source: dominantSource,
      newest_comp_date: dates[dates.length - 1] ?? null,
      oldest_comp_date: dates[0] ?? null,
    };
  }

  const cover = coverPriceForYear(item.release_year);
  if (cover != null) {
    return {
      value: cover,
      sample_size: 0,
      bucket_used: null,
      fallback: true,
      condition_unknown: false,
      source: "cover-price",
      comp_source: null,
      newest_comp_date: null,
      oldest_comp_date: null,
    };
  }
  return emptyResult();
}
