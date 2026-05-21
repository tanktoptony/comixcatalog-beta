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

// For the lookup fallback chain: given a primary bucket, what less-specific
// buckets should we try if no comps exist? Order matters — first hit wins.
//
// "CGC 9.8" → ["CGC 9.8", "Slabbed 9.8"]
// "CBCS 9.6" → ["CBCS 9.6", "Slabbed 9.6"]
// "Slabbed 9.4" → ["Slabbed 9.4"]
// "Raw NM" → ["Raw NM"]
// "Raw Ungraded" → ["Raw Ungraded"]
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

  // Already-generic slab or any raw bucket — no further fallback.
  return [cleaned];
}

// Median of a numeric array. Used to roll up the recent-comp window.
export function median(values) {
  const arr = values
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}
