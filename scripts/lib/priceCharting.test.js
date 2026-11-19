import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseProduct,
  matchProduct,
  priceToCents,
  pricesFromRow,
  gcdNameCandidates,
  normalizeSeriesName,
  rowHash,
  productUrl,
} from "./priceCharting.js";

// Real GCD rows for Uncanny X-Men #266 (1990): base 48391 (Direct) and the
// Newsstand variant 2357124, plus a decoy #266 from another volume and year.
const UXM_266 = [
  { gcd_id: 48391, series_gcd_id: 2605, issue_number: "266", key_date: "1990-08-00", variant_of_gcd_id: null, variant_name: "Direct" },
  { gcd_id: 2357124, series_gcd_id: 2605, issue_number: "266", key_date: "1990-08-00", variant_of_gcd_id: 48391, variant_name: "Newsstand" },
  { gcd_id: 999, series_gcd_id: 7777, issue_number: "266", key_date: "2031-01-00", variant_of_gcd_id: null, variant_name: null },
];

test("parses the base product name PriceCharting uses", () => {
  assert.deepEqual(
    parseProduct({ productName: "Uncanny X-Men #266 (1990)", consoleName: "Comic Books Uncanny X-Men" }),
    { seriesName: "Uncanny X-Men", seriesNorm: "uncannyxmen", variant: null, issueNumber: "266", year: 1990 }
  );
});

test("parses a bracketed variant and a trailing [KEY] tag", () => {
  const p = parseProduct({ productName: "Uncanny X-Men [Newsstand] #266 (1990) [KEY]", consoleName: "Comic Books Uncanny X-Men" });
  assert.equal(p.variant, "Newsstand");
  assert.equal(p.issueNumber, "266");
});

test("ignores trading-card sets that share a comic's name", () => {
  assert.equal(parseProduct({ productName: "Uncanny X-Men 266 #CMR-3", consoleName: "Marvel 2020 Upper Deck Ages Copper Metal Relics" }), null);
});

test("falls back to release-date year when the name has none", () => {
  const p = parseProduct({ productName: "Saga #1", consoleName: "Comic Books Saga", releaseDate: "2012-03-14" });
  assert.equal(p.year, 2012);
});

test("base product links to the base issue, not the newsstand or another volume", () => {
  const p = parseProduct({ productName: "Uncanny X-Men #266 (1990)", consoleName: "Comic Books Uncanny X-Men" });
  assert.deepEqual(matchProduct(p, UXM_266), { gcd_issue_id: 48391, method: "name" });
});

test("newsstand product links to the GCD newsstand variant", () => {
  const p = parseProduct({ productName: "Uncanny X-Men [Newsstand] #266 (1990)", consoleName: "Comic Books Uncanny X-Men" });
  assert.deepEqual(matchProduct(p, UXM_266), { gcd_issue_id: 2357124, method: "name-variant" });
});

test("a variant GCD doesn't have stays unlinked instead of taking the base price", () => {
  const p = parseProduct({ productName: "Uncanny X-Men [Jewelers] #266 (1990)", consoleName: "Comic Books Uncanny X-Men" });
  assert.equal(matchProduct(p, UXM_266).reason, "variant-unmatched");
});

test("a year more than one off is not the same book", () => {
  const p = parseProduct({ productName: "Uncanny X-Men #266 (1995)", consoleName: "Comic Books Uncanny X-Men" });
  assert.equal(matchProduct(p, UXM_266).reason, "year-mismatch");
});

test("two base issues with the same number and year are ambiguous", () => {
  const p = parseProduct({ productName: "Batman #1 (2016)", consoleName: "Comic Books Batman" });
  const issues = [
    { gcd_id: 1, issue_number: "1", key_date: "2016-08-00", variant_of_gcd_id: null },
    { gcd_id: 2, issue_number: "1", key_date: "2016-06-00", variant_of_gcd_id: null },
  ];
  assert.equal(matchProduct(p, issues).reason, "ambiguous");
});

test("leading zeros in issue numbers still match", () => {
  const p = parseProduct({ productName: "Spawn #001 (1992)", consoleName: "Comic Books Spawn" });
  const issues = [{ gcd_id: 5, issue_number: "1", key_date: "1992-05-00", variant_of_gcd_id: null }];
  assert.deepEqual(matchProduct(p, issues), { gcd_issue_id: 5, method: "name" });
});

test("CSV dollars and API pennies both become cents; blanks and zero are dropped", () => {
  assert.equal(priceToCents("108.40"), 10840);
  assert.equal(priceToCents("$1,108.40"), 110840);
  assert.equal(priceToCents(10840, { pennies: true }), 10840);
  assert.equal(priceToCents(""), null);
  assert.equal(priceToCents("0.00"), null);
});

test("price columns map to comic grades per PriceCharting's key table", () => {
  const prices = pricesFromRow({ "loose-price": "108.40", "cib-price": "70.00", "manual-only-price": "539.99", "condition-17-price": "201.86", "retail-loose-buy": "50" });
  assert.deepEqual(prices, { ungraded: 10840, "4.0": 7000, "9.8": 53999, "9.4": 20186 });
});

test("GCD name candidates add or drop a leading The", () => {
  assert.deepEqual(gcdNameCandidates("Uncanny X-Men"), ["Uncanny X-Men", "The Uncanny X-Men"]);
  assert.deepEqual(gcdNameCandidates("The Walking Dead"), ["The Walking Dead", "Walking Dead"]);
  assert.equal(normalizeSeriesName("The Amazing Spider-Man"), normalizeSeriesName("Amazing Spider-Man"));
});

test("row hash changes when a price changes and not otherwise", () => {
  const a = { gcd_issue_id: 1, product_name: "X", console_name: "Y", prices: { ungraded: 100, "9.8": 500 } };
  const b = { ...a, prices: { "9.8": 500, ungraded: 100 } };
  const c = { ...a, prices: { ungraded: 101, "9.8": 500 } };
  assert.equal(rowHash(a), rowHash(b));
  assert.notEqual(rowHash(a), rowHash(c));
});

test("product link points at PriceCharting's product page", () => {
  assert.equal(productUrl(2317636), "https://www.pricecharting.com/game/2317636");
});
