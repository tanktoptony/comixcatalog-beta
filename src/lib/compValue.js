// What is one copy worth, given every comp row filed under its issue?
//
// The single implementation behind src/lib/marketValue.js (library, public
// profile, PDF export) and scripts/snapshotCollectionValue.js (value
// history). The snapshot script used to carry its own copy of this logic,
// kept in step by a comment asking it to be; now both call this. Relative
// imports only, so plain `node scripts/...` can load it.
//
// Steps:
//   1. Drop comps whose listing title is a different book
//      (src/lib/compMatch.js).
//   2. Walk the bucket fallback chain from valuation.js. First bucket with
//      minSamples comps wins: median for a known grade, the cautious
//      percentile for the pooled raw bucket.
//   3. Pooled raw with too few raw comps: add slabbed comps graded 6.0 or
//      lower. A collector who never recorded a grade most likely has a
//      mid-to-low copy, and for Silver Age keys the low slabs are often the
//      only clean comps eBay returns for the exact book.
//   4. Nothing cleared: cover price, but only from 1990 on. Before that the
//      era floor ($0.12 for 1964) reads as a valuation and is off by orders
//      of magnitude, so the book shows no value rather than a wrong one.

import {
  gradeBucket,
  bucketFallbacks,
  median,
  coverPriceForYear,
  isRawPool,
  percentile,
  RAW_POOL_BUCKETS,
  RAW_POOL_PERCENTILE,
} from "./valuation.js";
import { filterCompsForIssue } from "./compMatch.js";

export const MIN_SAMPLES = 3;
export const MAX_SAMPLES_TO_CONSIDER = 50;
const LOW_GRADE_PROXY_MAX = 6.0;
const COVER_PRICE_FLOOR_FROM_YEAR = 1990;

export function emptyValue() {
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

function summarize(window, value, extra) {
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
    source: "market-comp",
    // "ebay" = sold comps (Insights), "ebay-listed" = active asking prices
    // (Browse). The UI uses this to say "sold" vs "listed" accurately.
    comp_source: dominantSource,
    newest_comp_date: dates[dates.length - 1] ?? null,
    oldest_comp_date: dates[0] ?? null,
    ...extra,
  };
}

function newestFirst(rows) {
  return [...rows]
    .sort((a, b) => String(b.sold_date ?? "").localeCompare(String(a.sold_date ?? "")))
    .slice(0, MAX_SAMPLES_TO_CONSIDER);
}

// comps:  market_comps rows for this issue, already limited to the date window.
//         Needs grade_bucket, grade_numeric, sold_price, sold_date, source,
//         listing_title.
// item:   { grade_numeric, slab_company, condition }
// issue:  { seriesTitle, issueYear, seriesStartYear }. issueYear also picks
//         the cover-price floor.
export function valueFromComps({ comps, item = {}, issue = {}, minSamples = MIN_SAMPLES } = {}) {
  const rows = filterCompsForIssue(comps, issue);
  const tryBuckets = bucketFallbacks(
    gradeBucket({
      grade_numeric: item.grade_numeric,
      slab_company: item.slab_company,
      condition: item.condition,
    })
  );

  for (let i = 0; i < tryBuckets.length; i += 1) {
    const candidate = tryBuckets[i];
    const pooled = isRawPool(candidate);
    let matched = rows.filter((r) =>
      pooled ? RAW_POOL_BUCKETS.includes(r.grade_bucket) : r.grade_bucket === candidate
    );
    let lowGradeProxy = false;
    if (pooled && matched.length < minSamples) {
      const lowSlabs = rows.filter(
        (r) =>
          !String(r.grade_bucket ?? "").startsWith("Raw") &&
          r.grade_numeric != null &&
          Number(r.grade_numeric) <= LOW_GRADE_PROXY_MAX
      );
      if (lowSlabs.length > 0) {
        matched = [...matched, ...lowSlabs];
        lowGradeProxy = true;
      }
    }
    if (matched.length < minSamples) continue;

    const window = newestFirst(matched);
    const prices = window.map((r) => r.sold_price);
    const value = pooled ? percentile(prices, RAW_POOL_PERCENTILE) : median(prices);
    return summarize(window, value, {
      bucket_used: candidate,
      fallback: i > 0,
      // Lets the UI say "condition unknown" rather than presenting a pooled
      // estimate with the same confidence as a same-bucket median.
      condition_unknown: pooled,
      low_grade_proxy: lowGradeProxy,
    });
  }

  const year = Number(issue.issueYear);
  if (Number.isFinite(year) && year >= COVER_PRICE_FLOOR_FROM_YEAR) {
    const cover = coverPriceForYear(year);
    if (cover != null) {
      return {
        ...emptyValue(),
        value: cover,
        fallback: true,
        source: "cover-price",
      };
    }
  }
  return emptyValue();
}

// gcd_issues.publication_date is null on most rows; key_date is GCD's
// sortable fallback ("1963-11-00").
export function issueYearFrom(row) {
  for (const v of [row?.key_date, row?.publication_date]) {
    const m = String(v ?? "").match(/\b(18|19|20)\d{2}\b/);
    if (m) return Number(m[0]);
  }
  return null;
}
