import { test } from "node:test";
import assert from "node:assert/strict";
import { isLaterPrinting, valueCopy } from "./copyValue.js";

// TMNT #2 (1984): the regular cover has a guide row, the second printing
// (gcd 2120826) doesn't, and its comp pool is first-printing slabs. This is
// the copy that showed $500 on 2026-11-20.
const BASE = 245470;
const SECOND = 2120826;
const guideRows = new Map([[BASE, [{ pc_id: 2398704, gcd_issue_id: BASE, sales_volume: 50, prices: { ungraded: 16571, "8.0": 30000 } }]]]);
const firstPrintSlabs = [3300, 2800, 1430, 1399.99].map((price, i) => ({
  gcd_issue_id: SECOND,
  grade_bucket: i < 3 ? "CGC 9.8" : "CGC 9.6",
  grade_numeric: i < 3 ? 9.8 : 9.6,
  sold_price: price,
  sold_date: "2026-11-18",
  source: "ebay-listed",
  listing_title: "Teenage Mutant Ninja Turtles #2 1st Printing CGC 9.8 1984",
}));
const issue = { seriesTitle: "Teenage Mutant Ninja Turtles", issueYear: 1984, seriesStartYear: 1984 };

test("later printings are recognised from GCD's variant name", () => {
  for (const name of ["Second Printing", "2nd Printing", "Third Print", "4th printing", "Reprint", "Facsimile Edition", "Second Edition"]) {
    assert.equal(isLaterPrinting(name), true, name);
  }
  for (const name of [null, "", "Newsstand", "Direct", "Variant Cover", "Cover B", "1:25 Incentive", "First Printing"]) {
    assert.equal(isLaterPrinting(name), false, String(name));
  }
});

test("a second printing never borrows the first printing's guide or comps", () => {
  const { value } = valueCopy({
    item: { gcd_issue_id: SECOND },
    issueRow: { variant_of_gcd_id: BASE, variant_name: "Second Printing" },
    issue,
    guideRows,
    comps: firstPrintSlabs,
    regularComps: firstPrintSlabs,
  });
  // Pre-1990 with nothing of its own: no value rather than a wrong one.
  assert.equal(value.value, null);
});

test("a variant cover still borrows the regular cover's guide price", () => {
  const { value } = valueCopy({
    item: { gcd_issue_id: SECOND },
    issueRow: { variant_of_gcd_id: BASE, variant_name: "Newsstand" },
    issue,
    guideRows,
    comps: [],
  });
  assert.equal(value.value, 165.71);
  assert.equal(value.regular_cover, true);
});

test("a variant with no guide anywhere asks for the regular cover's comps, then uses them", () => {
  const noGuide = new Map();
  const rawComps = [12, 14, 16].map((price) => ({
    gcd_issue_id: BASE,
    grade_bucket: "Raw VF",
    grade_numeric: null,
    sold_price: price,
    sold_date: "2026-11-18",
    source: "ebay-listed",
    listing_title: "Teenage Mutant Ninja Turtles #2 1984 Mirage",
  }));
  const args = {
    item: { gcd_issue_id: SECOND, condition: "Very Fine" },
    issueRow: { variant_of_gcd_id: BASE, variant_name: "Newsstand" },
    issue,
    guideRows: noGuide,
    comps: [],
  };
  const first = valueCopy(args);
  assert.equal(first.needsRegularComps, true);
  const second = valueCopy({ ...args, regularComps: rawComps });
  assert.equal(second.needsRegularComps, false);
  assert.equal(second.value.value, 14);
  assert.equal(second.value.regular_cover, true);
});

test("an edition's own guide row always wins", () => {
  const own = new Map([[SECOND, [{ pc_id: 1, gcd_issue_id: SECOND, sales_volume: 3, prices: { ungraded: 3500 } }]]]);
  const { value } = valueCopy({
    item: { gcd_issue_id: SECOND },
    issueRow: { variant_of_gcd_id: BASE, variant_name: "Second Printing" },
    issue,
    guideRows: own,
    comps: firstPrintSlabs,
  });
  assert.equal(value.value, 35);
});
