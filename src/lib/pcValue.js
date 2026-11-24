// What one copy is worth by PriceCharting's guide (pricecharting_prices,
// migration 0105). PriceCharting values come from sold listings, so where a
// book has a guide row it outranks our eBay asking-price comps; the comp
// chain in compValue.js stays as the fallback for books it doesn't cover.
//
// Rules:
//   - Slabbed copy (grade + slab company): the guide price at that grade.
//     A half grade PriceCharting doesn't list (6.5) sits on the straight line
//     between its neighbours (6.0 and 7.0). Outside the listed range: no
//     guide value, the comp chain decides.
//   - Raw copy: the ungraded price, capped at the graded price for the
//     copy's condition when one is recorded. A raw Good copy of a key is
//     worth less than the average raw copy, and never more than a slabbed
//     2.0. Raw grades below the lowest listed grade are capped at that
//     lowest grade's price.
//   - A raw copy with a condition also carries graded_at, the guide price of
//     a graded copy at that condition, when it is more than the copy's value.
//     It is shown beside the value and never counted: an ungraded book isn't
//     worth a slab's price, but picking Near Mint should visibly say something
//     (a member set NM on Saga #1 and nothing changed, 2026-11-21).
//   - A numeric grade with no slab company is treated as a raw copy at that
//     grade: we can't tell a self-graded book from a slab missing its label.
//
// Every place one of these values shows must cite PriceCharting with a link
// to `url` (their terms, 2026-11-10). Relative imports only, so plain
// `node scripts/...` can load it.

import { pickGuideRow, priceChartingUrl } from "./priceGuide.js";
import { snapToCgcGrade, normalizeRawCondition } from "./valuation.js";

const GRADED_KEYS = ["2.0", "3.0", "4.0", "5.0", "6.0", "7.0", "8.0", "9.0", "9.2", "9.4", "9.6", "9.8", "10.0"];

// Raw condition labels on the CGC scale, at the grade each label names.
const RAW_LABEL_GRADE = { M: 9.8, NM: 9.4, VF: 8.0, FN: 6.0, VG: 4.0, GD: 2.0, FA: 1.0, PR: 0.5 };

function cents(prices, key) {
  const n = Number(prices?.[key]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function gradedPoints(prices) {
  return GRADED_KEYS.map((k) => [Number(k), cents(prices, k)]).filter((p) => p[1] != null);
}

// Guide price in cents at a CGC grade, or null outside the listed range.
export function gradedCents(prices, grade) {
  const g = snapToCgcGrade(grade);
  if (g == null) return null;
  const points = gradedPoints(prices);
  const exact = points.find((p) => p[0] === g);
  if (exact) return exact[1];
  let lower = null;
  let upper = null;
  for (const p of points) {
    if (p[0] < g) lower = p;
    else if (p[0] > g && !upper) upper = p;
  }
  if (!lower || !upper) return null;
  return lower[1] + ((upper[1] - lower[1]) * (g - lower[0])) / (upper[0] - lower[0]);
}

function rawCapCents(prices, grade) {
  const inRange = gradedCents(prices, grade);
  if (inRange != null) return inRange;
  const points = gradedPoints(prices);
  if (points.length && snapToCgcGrade(grade) < points[0][0]) return points[0][1];
  return null;
}

function hasSlab(item) {
  return String(item?.slab_company ?? "").trim() !== "";
}

// row: one pricecharting_prices row. item: { grade_numeric, slab_company,
// condition }. Returns a value in the shape marketValue.js returns, or null
// when the guide can't price this copy.
export function pcValueForCopy(row, item = {}) {
  const prices = row?.prices;
  if (!prices || typeof prices !== "object") return null;
  const numeric = snapToCgcGrade(item.grade_numeric);
  let valueCents = null;
  let gradeUsed = null;
  let conditionUnknown = false;
  let gradedAt = null;

  if (numeric != null && hasSlab(item)) {
    valueCents = gradedCents(prices, numeric);
    gradeUsed = numeric.toFixed(1);
  } else {
    const ungraded = cents(prices, "ungraded");
    if (ungraded == null) return null;
    const label = normalizeRawCondition(item.condition);
    const rawGrade = numeric ?? (label ? RAW_LABEL_GRADE[label] : null);
    const cap = rawGrade != null ? rawCapCents(prices, rawGrade) : null;
    valueCents = cap != null ? Math.min(ungraded, cap) : ungraded;
    gradeUsed = "ungraded";
    conditionUnknown = rawGrade == null;
    const atGrade = rawGrade != null ? gradedCents(prices, rawGrade) : null;
    if (atGrade != null && atGrade > valueCents) {
      gradedAt = { grade: rawGrade.toFixed(1), value: Math.round(atGrade) / 100 };
    }
  }
  if (valueCents == null || !(valueCents > 0)) return null;

  return {
    value: Math.round(valueCents) / 100,
    sample_size: Number(row.sales_volume) || 0,
    bucket_used: null,
    fallback: false,
    condition_unknown: conditionUnknown,
    source: "pricecharting",
    comp_source: null,
    newest_comp_date: null,
    oldest_comp_date: null,
    pc_id: Number(row.pc_id),
    url: priceChartingUrl(row.pc_id),
    grade_used: gradeUsed,
    graded_at: gradedAt,
  };
}

// rowsByIssue: Map gcd_issue_id -> pricecharting_prices rows. Prices the copy
// from its own edition, or, for a variant with no guide row of its own, from
// the regular cover's (flagged regular_cover, like the comp chain does).
export function pcValueForIssue(rowsByIssue, item, variantOfGcdId = null) {
  return pcValueForEdition(rowsByIssue, item?.gcd_issue_id, item) ?? pcValueForRegularCover(rowsByIssue, item, variantOfGcdId);
}

function pcValueForEdition(rowsByIssue, editionId, item) {
  const row = pickGuideRow(rowsByIssue.get(Number(editionId)) ?? [], editionId);
  return row ? pcValueForCopy(row, item) : null;
}

export function pcValueForRegularCover(rowsByIssue, item, variantOfGcdId) {
  if (variantOfGcdId == null) return null;
  const value = pcValueForEdition(rowsByIssue, variantOfGcdId, item);
  return value ? { ...value, regular_cover: true } : null;
}

// Every pricecharting_prices row for these issues, as a Map keyed by
// gcd_issue_id. Paginated (PostgREST caps a read at 1000 rows). Returns
// { rowsByIssue, error }; a failed read leaves the comp chain to value
// everything rather than failing the page.
export async function loadPriceChartingRows(supabase, issueIds, { chunk = 200 } = {}) {
  const ids = [...new Set((issueIds ?? []).map(Number).filter(Number.isFinite))];
  const rowsByIssue = new Map();
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("pricecharting_prices")
        .select("pc_id, gcd_issue_id, prices, sales_volume")
        .in("gcd_issue_id", slice)
        .order("pc_id", { ascending: true })
        .range(from, from + 999);
      if (error) return { rowsByIssue, error };
      for (const row of data ?? []) {
        const key = Number(row.gcd_issue_id);
        if (!rowsByIssue.has(key)) rowsByIssue.set(key, []);
        rowsByIssue.get(key).push(row);
      }
      if (!data || data.length < 1000) break;
    }
  }
  return { rowsByIssue, error: null };
}
