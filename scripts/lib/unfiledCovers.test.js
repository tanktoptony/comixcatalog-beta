import { test } from "node:test";
import assert from "node:assert/strict";
import { normNumber, normPublisher, normTitle, planSeries } from "./unfiledCovers.js";

const series = { gcd_id: 203131, name: "Children of the Vault", year: 2023, publisher: "Marvel Comics" };
const issues = [1, 2, 3, 4].map((n) => ({ gcd_id: 100 + n, issue_number: String(n), variant_of_gcd_id: null }));
const vol = (over = {}, nums = ["1", "2", "3", "4"]) => ({
  vol: 152893,
  rows: nums.map((n, i) => ({ id: `c${i}`, series_title: "Children of the Vault ", series_year: 2023, publisher: "Marvel", issue_number: n, ...over })),
});
const tpb = { gcd_id: 209185, name: "Children of the Vault", year: 2023, publisher: "Marvel Comics", us_market: true, numbers: new Set(["1"]) };
const plan = (o = {}) => planSeries({ series, issues, volumes: [vol()], siblings: [tpb], ...o });

test("an exact volume is filed issue by issue, and its own trade doesn't block it", () => {
  assert.deepEqual(plan().links, [1, 2, 3, 4].map((n, i) => ({ id: `c${i}`, series_gcd_id: 203131, gcd_issue_id: 100 + n })));
});

test("variants never take a cover's place", () => {
  const withVariant = [...issues, { gcd_id: 900, issue_number: "1", variant_of_gcd_id: 101 }];
  assert.equal(plan({ issues: withVariant }).links[0].gcd_issue_id, 101);
});

test("a different year, publisher or title is left alone", () => {
  assert.match(plan({ volumes: [vol({ series_year: 2022 })] }).skip, /year or publisher/);
  assert.match(plan({ volumes: [vol({ series_year: null })] }).skip, /year or publisher/);
  assert.match(plan({ volumes: [vol({ publisher: "Panini" })] }).skip, /year or publisher/);
  assert.match(plan({ volumes: [vol({ series_title: "Children of the Vault: Blue" })] }).skip, /no unfiled volume/);
});

test("anything ambiguous is left alone", () => {
  assert.match(plan({ volumes: [vol(), { ...vol(), vol: 2 }] }).skip, /several volumes/);
  assert.match(plan({ volumes: [vol({}, ["1", "1"])] }).skip, /repeated/);
  assert.match(plan({ volumes: [vol({}, ["1", ""])] }).skip, /missing/);
  assert.match(plan({ volumes: [vol({}, ["1", "9"])] }).skip, /no single issue/);
  assert.match(plan({ issues: [...issues, { gcd_id: 500, issue_number: "2", variant_of_gcd_id: null }] }).skip, /no single issue/);
});

test("a partly filed volume and an issue that already has a cover are left alone", () => {
  assert.match(plan({ volumes: [{ ...vol(), partlyFiled: true }] }).skip, /partly filed/);
  assert.match(plan({ covered: new Set([103]) }).skip, /already has a cover/);
  assert.ok(plan({ covered: new Set([999]) }).links);
});

test("a same-named series that could hold the whole run blocks it", () => {
  const rival = { ...tpb, year: 2024, numbers: new Set(["1", "2", "3", "4", "5"]) };
  assert.match(plan({ siblings: [rival] }).skip, /same numbers/);
  assert.ok(plan({ siblings: [{ ...rival, us_market: false }] }).links);
  assert.ok(plan({ siblings: [{ ...rival, publisher: "Panini" }] }).links);
  assert.ok(plan({ siblings: [{ ...rival, year: 2030 }] }).links);
});

test("names are compared without punctuation, 'The' or company suffixes", () => {
  assert.equal(normTitle("The War That Time Forgot"), normTitle("War that Time Forgot"));
  assert.equal(normTitle("Truth: Red, White & Black"), normTitle("Truth: Red, White and Black"));
  assert.equal(normPublisher("IDW Publishing"), normPublisher("IDW"));
  assert.equal(normNumber("22 (647)"), "22");
  assert.equal(normNumber("007"), "7");
  assert.equal(normNumber("0"), "0");
});
