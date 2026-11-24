import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPriceGuide, priceChartingUrl } from "./priceGuide.js";

const ROWS = [
  { pc_id: 2317636, gcd_issue_id: 48391, product_name: "Uncanny X-Men #266 (1990)", sales_volume: 789, prices: { ungraded: 10840, "4.0": 7000, "9.8": 53999 } },
  { pc_id: 3470753, gcd_issue_id: 2357124, product_name: "Uncanny X-Men [Newsstand] #266 (1990)", sales_volume: 120, prices: { ungraded: 16815, "9.8": 192188 } },
];

test("guide is for the edition being viewed, grades in order", () => {
  const g = buildPriceGuide(ROWS, 48391);
  assert.equal(g.pcId, 2317636);
  assert.equal(g.url, "https://www.pricecharting.com/game/2317636");
  assert.equal(g.ungraded, 108.4);
  assert.deepEqual(g.grades.map((x) => [x.grade, x.value]), [["ungraded", 108.4], ["4.0", 70], ["9.8", 539.99]]);
});

test("the newsstand page shows newsstand prices, not the direct edition's", () => {
  assert.equal(buildPriceGuide(ROWS, 2357124).ungraded, 168.15);
});

test("an edition with no PriceCharting row shows no guide rather than borrowing one", () => {
  assert.equal(buildPriceGuide(ROWS, 999), null);
  assert.equal(buildPriceGuide([], 48391), null);
  assert.equal(buildPriceGuide(null, 48391), null);
});

test("two products on one edition: the better-selling one wins", () => {
  const rows = [
    { pc_id: 1, gcd_issue_id: 5, sales_volume: 3, prices: { ungraded: 100 } },
    { pc_id: 2, gcd_issue_id: 5, sales_volume: 50, prices: { ungraded: 900 } },
  ];
  assert.equal(buildPriceGuide(rows, 5).pcId, 2);
});

test("a row with only zero prices is no guide", () => {
  assert.equal(buildPriceGuide([{ pc_id: 1, gcd_issue_id: 5, prices: { ungraded: 0 } }], 5), null);
});

test("citation link format matches PriceCharting's attribution rule", () => {
  assert.equal(priceChartingUrl(6910), "https://www.pricecharting.com/game/6910");
});
