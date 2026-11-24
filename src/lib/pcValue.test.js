import { test } from "node:test";
import assert from "node:assert/strict";
import { gradedCents, pcValueForCopy, pcValueForIssue, loadPriceChartingRows } from "./pcValue.js";

// Uncanny X-Men #266 (1990), PriceCharting 2317636, prices in cents.
const UXM = {
  pc_id: 2317636,
  gcd_issue_id: 48391,
  sales_volume: 789,
  prices: { ungraded: 10840, "2.0": 3000, "4.0": 7000, "6.0": 9500, "7.0": 11500, "9.8": 53999 },
};

test("a slab gets the guide price at its grade, linked to the product", () => {
  const v = pcValueForCopy(UXM, { grade_numeric: 9.8, slab_company: "CGC" });
  assert.equal(v.value, 539.99);
  assert.equal(v.source, "pricecharting");
  assert.equal(v.grade_used, "9.8");
  assert.equal(v.url, "https://www.pricecharting.com/game/2317636");
});

test("a half grade sits between its neighbours", () => {
  assert.equal(gradedCents(UXM.prices, 6.5), 10500);
  assert.equal(pcValueForCopy(UXM, { grade_numeric: 6.5, slab_company: "CBCS" }).value, 105);
});

test("a slab outside the listed grades gets no guide value", () => {
  assert.equal(pcValueForCopy(UXM, { grade_numeric: 1.0, slab_company: "CGC" }), null);
  assert.equal(pcValueForCopy(UXM, { grade_numeric: 10, slab_company: "CGC" }), null);
});

test("a raw copy with no grade gets the ungraded price", () => {
  const v = pcValueForCopy(UXM, {});
  assert.equal(v.value, 108.4);
  assert.equal(v.grade_used, "ungraded");
  assert.equal(v.condition_unknown, true);
});

test("a raw copy in low condition is capped at the slab price for that grade", () => {
  assert.equal(pcValueForCopy(UXM, { condition: "Good" }).value, 30);
  assert.equal(pcValueForCopy(UXM, { condition: "VG" }).value, 70);
  // Poor sits below the lowest listed grade: capped at 2.0's price.
  assert.equal(pcValueForCopy(UXM, { condition: "Poor" }).value, 30);
});

test("a raw copy in high condition never beats the ungraded price", () => {
  assert.equal(pcValueForCopy(UXM, { condition: "Near Mint" }).value, 108.4);
});

test("a raw copy shows the graded price at its condition, without counting it", () => {
  // Saga #1 (2012): ungraded $122.75, graded 9.4 $150.00, graded 8.0 $104.10.
  const SAGA = { pc_id: 2402989, sales_volume: 122, prices: { ungraded: 12275, "2.0": 4700, "8.0": 10410, "9.4": 15000 } };
  const nm = pcValueForCopy(SAGA, { condition: "Near Mint" });
  assert.equal(nm.value, 122.75);
  assert.deepEqual(nm.graded_at, { grade: "9.4", value: 150 });
  // Capped at the graded price already, so there is nothing more to say.
  const vf = pcValueForCopy(SAGA, { condition: "Very Fine" });
  assert.equal(vf.value, 104.1);
  assert.equal(vf.graded_at, null);
  // No condition, a condition below the listed grades, and a slab.
  assert.equal(pcValueForCopy(SAGA, {}).graded_at, null);
  assert.equal(pcValueForCopy(SAGA, { condition: "Poor" }).graded_at, null);
  assert.equal(pcValueForCopy(SAGA, { grade_numeric: 9.4, slab_company: "CGC" }).graded_at, null);
});

test("a numeric grade with no slab company is valued as raw at that grade", () => {
  assert.equal(pcValueForCopy(UXM, { grade_numeric: 4.0 }).value, 70);
  assert.equal(pcValueForCopy(UXM, { grade_numeric: 9.8 }).value, 108.4);
});

test("a raw copy with no ungraded price gets no guide value", () => {
  assert.equal(pcValueForCopy({ ...UXM, prices: { "9.8": 50000 } }, {}), null);
  assert.equal(pcValueForCopy({ ...UXM, prices: null }, {}), null);
});

test("a variant with no row of its own uses the regular cover's, flagged", () => {
  const rows = new Map([[48391, [UXM]]]);
  assert.equal(pcValueForIssue(rows, { gcd_issue_id: 48391 }).regular_cover, undefined);
  const v = pcValueForIssue(rows, { gcd_issue_id: 999 }, 48391);
  assert.equal(v.value, 108.4);
  assert.equal(v.regular_cover, true);
  assert.equal(pcValueForIssue(rows, { gcd_issue_id: 999 }), null);
});

test("a newsstand copy uses its own row, not the direct edition's", () => {
  const NEWS = { pc_id: 3470753, gcd_issue_id: 2357124, sales_volume: 120, prices: { ungraded: 16815 } };
  const rows = new Map([[48391, [UXM]], [2357124, [NEWS]]]);
  assert.equal(pcValueForIssue(rows, { gcd_issue_id: 2357124 }, 48391).value, 168.15);
});

test("the loader pages past 1000 rows and groups by issue", async () => {
  const all = Array.from({ length: 1500 }, (_, i) => ({ pc_id: i, gcd_issue_id: i % 2 ? 1 : 2, prices: {}, sales_volume: 0 }));
  const fake = {
    from: () => {
      let range = [0, 0];
      const q = {
        select: () => q,
        in: () => q,
        order: () => q,
        range: (a, b) => { range = [a, b]; return q; },
        then: (resolve) => resolve({ data: all.slice(range[0], range[1] + 1), error: null }),
      };
      return q;
    },
  };
  const { rowsByIssue, error } = await loadPriceChartingRows(fake, [1, 2]);
  assert.equal(error, null);
  assert.equal(rowsByIssue.get(1).length + rowsByIssue.get(2).length, 1500);
});
