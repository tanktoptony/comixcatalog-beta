// Grade bucketing + market-value lookup helpers.
//
// The bucket is the lookup key that joins a *user's copy* to *sold comps*.
// Both sides need to agree on the bucket string for the join to work, so this
// logic must be deterministic and never silently change. See
// scripts/migrations/0006_market_comps.sql for the schema this feeds.
//
// Bucket taxonomy (most specific first):
//   "CGC 9.8" / "CGC 9.6" / ...   — exact slabbed grade by recognized company
//   "CBCS 9.8" / "CBCS 9.6" / ... — exact CBCS grade
//   "PGX 9.8" / ...               — exact PGX grade (less respected market-wise)
//   "Slabbed 9.8"                 — fallback aggregate across slab companies
//   "Raw NM" / "Raw VF" / etc.    — labeled raw condition
//   "Raw Ungraded"                — owned, no grade info given
//
// We deliberately bucket CGC SS ("Signature Series") into plain CGC for
// valuation. The signature premium exists but pricing it separately needs a
// signed-by lookup we don't have yet.

const CGC_GRADES = [
  0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5,
  5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0,
  9.2, 9.4, 9.6, 9.8, 10.0,
];

// Map a numeric grade to the nearest valid CGC step. Sellers sometimes list
// "9.7" which doesn't exist on the CGC scale; we round to the nearest valid
// step so it joins to comps cleanly.
export function snapToCgcGrade(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0.5 || n > 10) return null;
  let best = CGC_GRADES[0];
  let bestDelta = Math.abs(n - best);
  for (const g of CGC_GRADES) {
    const d = Math.abs(n - g);
    if (d < bestDelta) {
      best = g;
      bestDelta = d;
    }
  }
  return best;
}

// Normalize a slab company string. "CGC SS" and "CGC Signature Series" both
// roll into "CGC" for valuation purposes (see note above).
export function normalizeSlabCompany(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith("CGC")) return "CGC";
  if (s.startsWith("CBCS")) return "CBCS";
  if (s.startsWith("PGX")) return "PGX";
  return "Slabbed"; // unknown company → generic slab bucket
}

// Normalize a raw condition label into a comp bucket suffix.
// Maps both word forms ("Near Mint") and abbreviated ("NM") to canonical.
const RAW_CONDITION_MAP = new Map([
  ["mint", "M"],
  ["m", "M"],
  ["near mint", "NM"],
  ["nm", "NM"],
  ["very fine", "VF"],
  ["vf", "VF"],
  ["fine", "FN"],
  ["fn", "FN"],
  ["f", "FN"],
  ["very good", "VG"],
  ["vg", "VG"],
  ["good", "GD"],
  ["g", "GD"],
  ["gd", "GD"],
  ["fair", "FA"],
  ["fa", "FA"],
  ["poor", "PR"],
  ["pr", "PR"],
  ["p", "PR"],
]);

export function normalizeRawCondition(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  return RAW_CONDITION_MAP.get(s) ?? null;
}

// Build the canonical bucket string from a user_collections row (or any
// equivalent shape: { grade_numeric, slab_company, condition }).
//
// Returns the most specific bucket the inputs justify. Examples:
//   { grade_numeric: 9.8, slab_company: "CGC" }     → "CGC 9.8"
//   { grade_numeric: 9.6, slab_company: "CBCS" }    → "CBCS 9.6"
//   { grade_numeric: 9.4, slab_company: null }      → "Slabbed 9.4"
//   { condition: "Near Mint" }                       → "Raw NM"
//   { condition: "very good" }                       → "Raw VG"
//   {}                                               → "Raw Ungraded"
export function gradeBucket({ grade_numeric, slab_company, condition } = {}) {
  const slab = normalizeSlabCompany(slab_company);
  const grade = snapToCgcGrade(grade_numeric);

  if (grade != null) {
    const formatted = grade.toFixed(1);
    return slab ? `${slab} ${formatted}` : `Slabbed ${formatted}`;
  }

  const cond = normalizeRawCondition(condition);
  if (cond) return `Raw ${cond}`;

  return "Raw Ungraded";
}

// Sentinel bucket meaning "any raw copy, condition unknown". It is not a
// value that ever appears in market_comps.grade_bucket — callers see it in a
// fallback chain and translate it into an `.in(...)` over RAW_POOL_BUCKETS.
export const RAW_POOL = "Raw (any)";

// Every raw bucket a comp can carry, best to worst. Deliberately excludes
// "Raw Ungraded" (that is the thing we are falling back *from*) and slabbed
// buckets (a slab is a different market; a slabbed 9.8 is worth multiples of
// the same book raw, so pooling the two would be nonsense).
export const RAW_POOL_BUCKETS = [
  "Raw M",
  "Raw NM",
  "Raw VF",
  "Raw FN",
  "Raw VG",
  "Raw GD",
  "Raw FA",
  "Raw PR",
];

export function isRawPool(bucket) {
  return bucket === RAW_POOL;
}

// For the lookup fallback chain: given a primary bucket, what less-specific
// buckets should we try if no comps exist? Order matters — first hit wins.
//
// "CGC 9.8" → ["CGC 9.8", "Slabbed 9.8"]
// "CBCS 9.6" → ["CBCS 9.6", "Slabbed 9.6"]
// "Slabbed 9.4" → ["Slabbed 9.4"]
// "Raw NM" → ["Raw NM"]
// "Raw Ungraded" → ["Raw Ungraded", RAW_POOL]
//
// Only "Raw Ungraded" pools, and the asymmetry is the point. Measured
// 2026-09-24: 627 of 670 owned books bucket as "Raw Ungraded" because nobody
// sets a grade, while only 743 of 6,054 comps carry that bucket — so the
// 1,997 "Raw NM" and 1,438 "Raw VF" comps sitting against those same issues
// were unreachable, and 269 books with comps for their exact issue showed a
// cover-price floor instead.
//
// A bucket with a KNOWN grade never pools. If a book is "Raw GD" and no GD
// comps exist, the honest answer is that we do not know what it is worth —
// pricing it off a pool dominated by NM listings would not be a fallback,
// it would be a wrong number wearing a fallback's clothes.
export function bucketFallbacks(bucket) {
  if (!bucket) return [];
  const cleaned = String(bucket).trim();
  if (!cleaned) return [];

  // Slab + grade form: "CGC 9.8" / "CBCS 9.6" / "PGX 8.5"
  const slabMatch = cleaned.match(/^(CGC|CBCS|PGX)\s+(\d+(?:\.\d+)?)$/);
  if (slabMatch) {
    const grade = slabMatch[2];
    return [cleaned, `Slabbed ${grade}`];
  }

  // Unknown condition: fall back to the pooled raw market.
  if (cleaned === "Raw Ungraded") return [cleaned, RAW_POOL];

  // A known raw grade, or an already-generic slab bucket. No further fallback.
  return [cleaned];
}

// Value to take from the pooled raw comps for a book whose condition nobody
// recorded.
//
// NOT the median, and the reason matters. The comp pool is what people list
// on eBay, and listings skew heavily to the top of the scale — of 6,054 comps
// on 2026-09-24, 1,997 were "Raw NM" and 1,438 "Raw VF" against 123 "Raw GD".
// Taking the median of that pool assumes an unrecorded book is near-mint,
// which is the opposite of what an unrecorded book usually is.
//
// This number feeds the collection total and the insurance/appraisal PDF, so
// erring high is not a neutral mistake — it inflates a figure someone may
// hand to an insurer. The 25th percentile keeps the estimate on the cautious
// side of the pool. It is a judgement call, not a derived constant: change
// RAW_POOL_PERCENTILE if the collector's-eye answer differs.
export const RAW_POOL_PERCENTILE = 0.25;

export function percentile(values, p) {
  const arr = sortedFiniteNumbers(values);
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  const idx = (arr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
}

// Median of a numeric array. Used to roll up the recent-comp window.
// Coerce a list of maybe-numbers into sorted finite numbers.
//
// The obvious `.map(Number).filter(Number.isFinite)` silently keeps null,
// undefined-free empty strings and booleans, because Number(null) is 0 and
// Number("") is 0, and 0 is perfectly finite. On a price list that turns a
// missing sold_price into a $0 sale, which drags a median or percentile down
// without leaving any trace. Found 2026-09-24 by a test that expected a null
// to be dropped and got it counted instead.
function sortedFiniteNumbers(values) {
  const out = [];
  for (const v of values ?? []) {
    if (v === null || v === undefined || v === "" || typeof v === "boolean") continue;
    const n = Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

export function median(values) {
  const arr = sortedFiniteNumbers(values);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}

// Era-based cover-price estimate. Used as a floor fallback when no sold-comp
// data exists for an issue. Returns USD as a number. Rough by design — this
// is "every book gets *some* number" not "this is the true value." For modern
// books it's pretty close (cover prices are standardized); for vintage it's a
// reasonable Marvel/DC-flavored approximation that misses outliers like
// magazine-sized books, treasury editions, and international printings.
export function coverPriceForYear(year) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  if (y < 1962) return 0.10;
  if (y < 1965) return 0.12;
  if (y < 1969) return 0.15;
  if (y < 1971) return 0.20;
  if (y < 1976) return 0.25;
  if (y < 1980) return 0.40;
  if (y < 1984) return 0.60;
  if (y < 1987) return 0.75;
  if (y < 1991) return 1.00;
  if (y < 1996) return 1.50;
  if (y < 2000) return 1.95;
  if (y < 2005) return 2.50;
  if (y < 2010) return 2.99;
  if (y < 2016) return 3.99;
  if (y < 2022) return 4.99;
  return 5.99;
}
