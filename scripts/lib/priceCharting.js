// PriceCharting comic price guide: parse their rows and link them to GCD issues.
//
// Terms (Brady Haugh, PriceCharting, email 2026-11-10): until ComixCatalog
// makes $1,000/mo in revenue, the Legendary subscription ($50/mo) covers using
// this data in the product, provided every place it shows cites PriceCharting
// with an icon or text linking to that product's page
// (https://www.pricecharting.com/game/<id>, see productUrl below). Past
// $1,000/mo it moves to a commercial agreement. Their docs also require
// purging all API/CSV data if the subscription ends.
//
// Pure functions only, so scripts/fetchPriceCharting.js and the tests share
// them. Relative imports only (plain `node scripts/...` must load this).

// Comic grade for each PriceCharting price key, from the "Key Descriptions"
// table at https://www.pricecharting.com/api-documentation ("Comics: Graded
// 4.0 or 4.5 by a grading company" etc.). The stored keys are grade labels so
// nothing downstream has to know PriceCharting's video-game column names.
export const PC_GRADE_KEYS = Object.freeze({
  "loose-price": "ungraded",
  "condition-9-price": "2.0",
  "condition-13-price": "3.0",
  "cib-price": "4.0",
  "condition-14-price": "5.0",
  "new-price": "6.0",
  "condition-15-price": "7.0",
  "graded-price": "8.0",
  "condition-16-price": "9.0",
  "box-only-price": "9.2",
  "condition-17-price": "9.4",
  "condition-10-price": "9.6",
  "manual-only-price": "9.8",
  "bgs-10-price": "10.0",
});

export const COMIC_CONSOLE_PREFIX = "Comic Books ";

export function productUrl(pcId) {
  return `https://www.pricecharting.com/game/${encodeURIComponent(String(pcId))}`;
}

// CSV cells are dollars ("108.40", sometimes "$1,108.40"); the JSON API sends
// integer pennies. Returns integer cents, or null for blank/zero/garbage.
export function priceToCents(value, { pennies = false } = {}) {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return pennies ? Math.round(value) : Math.round(value * 100);
  }
  const s = String(value).replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return pennies ? Math.round(n) : Math.round(n * 100);
}

export function pricesFromRow(row, opts) {
  const out = {};
  for (const [key, grade] of Object.entries(PC_GRADE_KEYS)) {
    const cents = priceToCents(row?.[key], opts);
    if (cents != null) out[grade] = cents;
  }
  return out;
}

// "Uncanny X-Men [Newsstand] #266 (1990)" in console "Comic Books Uncanny X-Men"
//   -> { seriesName: "Uncanny X-Men", variant: "Newsstand", issueNumber: "266", year: 1990 }
// The series comes from the console name, not the product name: PriceCharting
// sometimes writes the product with a subtitle ("Amazing Spider-Man: Facsimile
// Edition [...]") while the console stays the set name.
const PRODUCT_RE = /^(.*?)\s*(?:\[([^\]]+)\])?\s*#\s*([^\s(]+)\s*(?:\((\d{4})\))?\s*$/;

export function parseProduct({ productName, consoleName, releaseDate } = {}) {
  const consoleStr = String(consoleName ?? "").trim();
  if (!consoleStr.startsWith(COMIC_CONSOLE_PREFIX)) return null;
  const seriesName = consoleStr.slice(COMIC_CONSOLE_PREFIX.length).trim();
  const name = String(productName ?? "").replace(/\s*\[KEY\]\s*$/i, "").trim();
  const m = PRODUCT_RE.exec(name);
  if (!seriesName || !m) return null;
  const variant = m[2] ? m[2].trim() : null;
  const issueNumber = normalizeIssueNumber(m[3]);
  let year = m[4] ? Number(m[4]) : null;
  if (!year && releaseDate) {
    const y = Number(String(releaseDate).slice(0, 4));
    if (y > 1800) year = y;
  }
  if (!issueNumber) return null;
  return { seriesName, seriesNorm: normalizeSeriesName(seriesName), variant, issueNumber, year };
}

export function normalizeIssueNumber(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // "001" -> "1", but keep "0", "1/2", "1.MU", "Annual 1" untouched.
  return /^\d+$/.test(s) ? String(Number(s)) : s;
}

export function normalizeSeriesName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

// The gcd_series.name values to look up for one PriceCharting series. GCD
// files most Marvel/DC runs under "The ..." ("The Uncanny X-Men"), and
// PriceCharting drops it.
export function gcdNameCandidates(seriesName) {
  const s = String(seriesName ?? "").trim();
  if (!s) return [];
  const out = new Set([s]);
  if (/^the\s+/i.test(s)) out.add(s.replace(/^the\s+/i, ""));
  else out.add(`The ${s}`);
  return [...out];
}

function yearOf(issue) {
  for (const v of [issue?.key_date, issue?.publication_date]) {
    const y = Number(String(v ?? "").slice(0, 4));
    if (y > 1800) return y;
  }
  return null;
}

function normVariant(v) {
  return String(v ?? "").toLowerCase().replace(/edition|variant|cover/g, "").replace(/[^a-z0-9]+/g, "");
}

// Decide which GCD issue a parsed product is. `issues` are gcd_issues rows
// ({ gcd_id, series_gcd_id, issue_number, key_date, publication_date,
// variant_of_gcd_id, variant_name }) from every GCD series whose name matched,
// already filtered to the product's issue number.
//
// Conservative on purpose: a wrong link puts a $358 Jewelers price on a $108
// base book, which is worse than showing nothing. So:
//   - year must agree within 1 (PriceCharting dates are the cover month,
//     GCD key_date is the same, but on-sale vs cover can straddle New Year);
//   - an unbracketed product only links to a base issue;
//   - a bracketed product links only to a GCD variant whose name agrees
//     (Newsstand -> "Newsstand", "Newsstand Edition", ...);
//   - more than one equally good candidate means no link.
export function matchProduct(parsed, issues) {
  if (!parsed) return { reason: "unparsed" };
  if (!Array.isArray(issues) || issues.length === 0) return { reason: "no-series-or-issue" };
  const want = normalizeIssueNumber(parsed.issueNumber);
  const sameNumber = issues.filter((i) => normalizeIssueNumber(i.issue_number) === want);
  if (sameNumber.length === 0) return { reason: "no-issue-number" };

  let pool = sameNumber;
  if (parsed.year) {
    const exact = pool.filter((i) => yearOf(i) === parsed.year);
    const near = pool.filter((i) => yearOf(i) != null && Math.abs(yearOf(i) - parsed.year) <= 1);
    pool = exact.length ? exact : near;
    if (pool.length === 0) return { reason: "year-mismatch" };
  }

  let picks;
  if (!parsed.variant) {
    picks = pool.filter((i) => i.variant_of_gcd_id == null);
  } else {
    const want = normVariant(parsed.variant);
    if (!want) return { reason: "variant-unmatched" };
    picks = pool.filter((i) => i.variant_of_gcd_id != null && normVariant(i.variant_name) === want);
    if (picks.length === 0) return { reason: "variant-unmatched" };
  }
  if (picks.length === 0) return { reason: "no-base-issue" };
  if (picks.length > 1) {
    // Two volumes with the same name, number and year (rare, e.g. a reboot
    // in the same year). Leave it unlinked rather than guess.
    return { reason: "ambiguous", candidates: picks.map((i) => i.gcd_id) };
  }
  return { gcd_issue_id: Number(picks[0].gcd_id), method: parsed.variant ? "name-variant" : "name" };
}

// Stable fingerprint of what we store, so a daily run writes only rows whose
// prices or link changed instead of rewriting the whole table.
export function rowHash(row) {
  const prices = Object.keys(row.prices ?? {}).sort().map((k) => `${k}=${row.prices[k]}`).join(",");
  return [row.gcd_issue_id, row.product_name, row.console_name, row.release_date ?? "", row.sales_volume ?? "", prices].join("|");
}
