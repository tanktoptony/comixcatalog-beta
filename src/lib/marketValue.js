// Server-side market-value lookup. Reads market_comps with a fallback chain
// against gradeBucket()'s output. Designed to be the single source of truth
// for "what is this copy worth?" — the library page and the PDF generator
// both call through here.
//
// The pure-utility primitives (snapToCgcGrade, gradeBucket, bucketFallbacks,
// median) live in src/lib/valuation.js. This file glues them to Supabase.

import { gradeBucket, bucketFallbacks, median } from "@/lib/valuation";

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
    const { data, error } = await supabase
      .from("market_comps")
      .select("sold_price, sold_date")
      .eq("gcd_issue_id", Number(gcd_issue_id))
      .eq("grade_bucket", candidate)
      .gte("sold_date", sinceIso)
      .order("sold_date", { ascending: false })
      .limit(MAX_SAMPLES_TO_CONSIDER);

    if (error) {
      console.error("getMarketValue query failed:", error);
      return emptyResult();
    }

    if ((data?.length ?? 0) >= minSamples) {
      const prices = data.map((r) => Number(r.sold_price));
      const value = median(prices);
      const dates = data.map((r) => r.sold_date).sort();
      return {
        value: value != null ? roundCurrency(value) : null,
        sample_size: data.length,
        bucket_used: candidate,
        fallback: i > 0,
        newest_comp_date: dates[dates.length - 1] ?? null,
        oldest_comp_date: dates[0] ?? null,
      };
    }
  }

  return emptyResult();
}

function emptyResult() {
  return {
    value: null,
    sample_size: 0,
    bucket_used: null,
    fallback: false,
    newest_comp_date: null,
    oldest_comp_date: null,
  };
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

// Bulk variant for PDF generation and the library page hydration.
// Given a list of {collection_id, gcd_issue_id, grade_numeric, slab_company,
// condition} entries, returns a map keyed by collection_id with the same
// shape as getMarketValue's output. Issues the queries in parallel but capped.
//
// We don't currently batch-query by (issue_id, bucket) tuples because doing
// it correctly in PostgREST means a big OR filter that's slower than the
// parallel small queries below for sane batch sizes.
export async function getMarketValuesBulk({
  supabase,
  items,
  concurrency = 8,
  windowDays = DEFAULT_WINDOW_DAYS,
  minSamples = MIN_SAMPLES,
} = {}) {
  if (!supabase) throw new Error("getMarketValuesBulk: supabase required");
  const list = Array.isArray(items) ? items : [];
  const out = new Map();

  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i++;
      const item = list[idx];
      if (!item?.collection_id) continue;
      try {
        const result = await getMarketValue({
          supabase,
          gcd_issue_id: item.gcd_issue_id,
          grade_numeric: item.grade_numeric,
          slab_company: item.slab_company,
          condition: item.condition,
          windowDays,
          minSamples,
        });
        out.set(item.collection_id, result);
      } catch (err) {
        console.error(
          `getMarketValuesBulk: item ${item.collection_id} failed:`,
          err
        );
        out.set(item.collection_id, emptyResult());
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, list.length) }, worker);
  await Promise.all(workers);
  return out;
}
