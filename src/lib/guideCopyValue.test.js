import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPriceGuide } from "./priceGuide.js";
import { copyGradeLabel, guideCopyValue } from "./guideCopyValue.js";
import { pcValueForCopy } from "./pcValue.js";

// X-Men #24 (1991) as stored, in cents.
const row = {
  pc_id: 1,
  gcd_issue_id: 53652,
  product_name: "X-Men #24",
  sales_volume: 9,
  prices: { ungraded: 2995, "2.0": 1200, "6.0": 4999, "8.0": 6000, "9.4": 9100 },
};
const guide = buildPriceGuide([row], 53652);

test("the issue page and the library agree for every condition", () => {
  for (const condition of ["Near Mint", "Very Fine", "Fine", "Good", "Poor", "Mint", "", null]) {
    const here = guideCopyValue(guide, { condition });
    const there = pcValueForCopy(row, { condition });
    assert.equal(here?.value ?? null, there?.value ?? null, String(condition));
    assert.deepEqual(here?.graded_at ?? null, there?.graded_at ?? null, String(condition));
  }
  assert.deepEqual(guideCopyValue(guide, { condition: "Near Mint" }), {
    value: 29.95,
    graded: false,
    graded_at: { grade: "9.4", value: 91 },
    mine: false,
  });
  assert.equal(guideCopyValue(guide, { condition: "Good" }).value, 12);
});

test("a slab uses its grade, and the collector's own value wins", () => {
  assert.equal(guideCopyValue(guide, { grade_numeric: 9.4, slab_company: "CGC" }).value, 91);
  assert.deepEqual(guideCopyValue(guide, { condition: "Good", market_value: "45" }), {
    value: 45,
    graded: false,
    graded_at: null,
    mine: true,
  });
});

test("no guide or no copy gives nothing", () => {
  assert.equal(guideCopyValue(null, { condition: "Good" }), null);
  assert.equal(guideCopyValue(guide, null), null);
});

test("grade labels", () => {
  assert.equal(copyGradeLabel({ condition: "Near Mint" }), "Near Mint");
  assert.equal(copyGradeLabel({ slab_company: "CGC", grade_numeric: 9.8 }), "CGC 9.8");
  assert.equal(copyGradeLabel({ grade_numeric: "9.4" }), "9.4, raw");
  assert.equal(copyGradeLabel({ condition: "" }), null);
});
