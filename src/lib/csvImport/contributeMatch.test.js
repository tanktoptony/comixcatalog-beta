// The duplicate check that /contribute/add-comic and /api/comics now run.
//
// These cases are the live catalog, not invented shapes. Measured 2026-09-24
// against production: ten series are titled exactly "Rai", all Valiant, and
// two of them start in 2014. That is the input that broke every previous
// attempt at this, so it is the input the tests use.

import test from "node:test";
import assert from "node:assert/strict";
import { normalizeKey, chooseSeries, matchIssue, publisherMatches } from "./matchRow.js";

// The ten real "Rai" rows, as the catalog holds them.
const RAI_VOLUMES = [
  { id: "a", gcd_id: 4493, title: "Rai", year_start_cached: 1992, issue_count_cached: 9, resolved_publisher_cached: "Valiant Comics" },
  { id: "b", gcd_id: 31216, title: "Rai", year_start_cached: 1993, issue_count_cached: 15, resolved_publisher_cached: "Valiant Comics" },
  { id: "c", gcd_id: 60935, title: "Rai", year_start_cached: 1994, issue_count_cached: 10, resolved_publisher_cached: "Valiant Comics" },
  { id: "d", gcd_id: 167547, title: "Rai", year_start_cached: 2006, issue_count_cached: 1, resolved_publisher_cached: "Valiant Comics" },
  { id: "e", gcd_id: 80415, title: "Rai", year_start_cached: 2014, issue_count_cached: 16, resolved_publisher_cached: "Valiant Comics" },
  { id: "f", gcd_id: 114649, title: "Rai", year_start_cached: 2014, issue_count_cached: 4, resolved_publisher_cached: "Valiant Comics" },
  { id: "g", gcd_id: 114440, title: "Rai", year_start_cached: 2017, issue_count_cached: 1, resolved_publisher_cached: "Valiant Comics" },
  { id: "h", gcd_id: 152850, title: "Rai", year_start_cached: 2019, issue_count_cached: 10, resolved_publisher_cached: "Valiant Comics" },
  { id: "i", gcd_id: 164011, title: "Rai", year_start_cached: 2020, issue_count_cached: 1, resolved_publisher_cached: "Valiant Comics" },
  { id: "j", gcd_id: 196470, title: "Rai", year_start_cached: 2021, issue_count_cached: 1, resolved_publisher_cached: "Valiant Comics" },
];

// Rai (1994) really does start at issue 24 — GCD splits the original run
// three ways and this is the third piece, sold on eBay as "The New Rai".
const RAI_1994_ISSUES = ["24", "25", "26", "27", "28", "29", "30", "31", "32", "33"].map(
  (n, i) => ({ gcd_id: 55613 + i, series_gcd_id: 60935, issue_number: n })
);

test("the old exact-title lookup is not what decides a match", () => {
  // normalizeKey is what both the form and the API key on. If this ever
  // reduces to something a user could not type, the check goes silent.
  assert.equal(normalizeKey("Rai"), "rai");
  assert.equal(normalizeKey("  RAI  "), "rai");
  assert.equal(normalizeKey("Rai and the Future Force"), "raiandthefutureforce");
});

test("a bare title with ten volumes refuses to guess", () => {
  const result = chooseSeries(RAI_VOLUMES, {});
  assert.equal(result.status, "ambiguous");
  assert.equal(result.candidates.length, 10);
});

test("a year picks the exact volume, which is the whole point", () => {
  const result = chooseSeries(RAI_VOLUMES, { releaseYear: 1994 });
  assert.equal(result.status, "matched");
  assert.equal(result.series.gcd_id, 60935);
});

test("two volumes sharing a year stay ambiguous rather than picking the bigger one", () => {
  // 2014 has both the 16-issue run and a 4-issue one. Silently taking the
  // fuller series would file the book in a run the collector does not own.
  const result = chooseSeries(RAI_VOLUMES, { releaseYear: 2014 });
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.candidates.map((s) => s.gcd_id).sort((a, b) => a - b), [80415, 114649]);
});

test("publisher cannot break a tie when every volume shares one", () => {
  // All ten Rai rows are Valiant, so the publisher signal is worthless here
  // and must not be mistaken for a decision.
  const result = chooseSeries(RAI_VOLUMES, { publisher: "Valiant Comics" });
  assert.equal(result.status, "ambiguous");
  assert.equal(result.candidates.length, 10);
});

test("publisher spelling differences still count as the same publisher", () => {
  // The catalog says "Valiant Comics". The publishers table has "Valiant"
  // and "Valiant Entertainment LLC" but NOT "Valiant Comics" — which is why
  // the old code invented a new publisher row every time.
  assert.ok(publisherMatches("Valiant Comics", "Valiant"));
  assert.ok(publisherMatches("Valiant", "Valiant Comics"));
  assert.ok(publisherMatches("Marvel Comics Group", "Marvel"));
  assert.ok(!publisherMatches("Valiant Comics", "Marvel"));
});

test("the eBay listing's issue resolves to the catalog issue that exists", () => {
  // "The New Rai #24" — the exact book that started this. It is gcd 55613
  // and it already has a cover.
  const hit = matchIssue(RAI_1994_ISSUES, "24");
  assert.ok(hit);
  assert.equal(hit.gcd_id, 55613);
});

test("an issue the volume does not carry returns null, never a near miss", () => {
  // Rai (1994) starts at 24. Asking it for #1 must not hand back #24.
  assert.equal(matchIssue(RAI_1994_ISSUES, "1"), null);
  assert.equal(matchIssue(RAI_1994_ISSUES, "99"), null);
});

test("issue numbers match across the ways people write them", () => {
  assert.equal(matchIssue(RAI_1994_ISSUES, "#24")?.gcd_id, 55613);
  assert.equal(matchIssue(RAI_1994_ISSUES, "024")?.gcd_id, 55613);
  assert.equal(matchIssue(RAI_1994_ISSUES, " 24 ")?.gcd_id, 55613);
});

test("an empty issue number matches nothing rather than the first row", () => {
  assert.equal(matchIssue(RAI_1994_ISSUES, ""), null);
  assert.equal(matchIssue(RAI_1994_ISSUES, null), null);
});

test("a title we genuinely do not have reports none, so the form stays usable", () => {
  assert.deepEqual(chooseSeries([], { releaseYear: 1994 }), { status: "none" });
});

test("a single matching volume needs no year at all", () => {
  const onlyOne = [RAI_VOLUMES[2]];
  const result = chooseSeries(onlyOne, {});
  assert.equal(result.status, "matched");
  assert.equal(result.series.gcd_id, 60935);
});

test("a year one off still lands, because cover dates disagree with GCD", () => {
  const result = chooseSeries(RAI_VOLUMES.filter((s) => s.year_start_cached < 2000), {
    releaseYear: 1995,
  });
  assert.equal(result.status, "matched");
  assert.equal(result.series.gcd_id, 60935);
});

test("a blank year is not a year, and a series without one is not a match for it", () => {
  // Number("") and Number(null) are both 0. Before plausibleYear() this made
  // "no year given" select exactly the series that have no year recorded,
  // and then report that the catalog lacks the issue.
  const withNullYears = [
    { id: "n1", gcd_id: 1, title: "Amazing Spider-Man", year_start_cached: null, issue_count_cached: 1 },
    { id: "n2", gcd_id: 2, title: "The Amazing Spider-Man", year_start_cached: 1963, issue_count_cached: 650 },
  ];
  const result = chooseSeries(withNullYears, { releaseYear: "" });
  assert.equal(result.status, "ambiguous");
  assert.equal(result.candidates.length, 2, "both volumes must stay in play");
});

test("garbage in the year field is ignored rather than acted on", () => {
  for (const bad of ["", null, undefined, "n/a", 0, 12, 99999, NaN]) {
    const result = chooseSeries(RAI_VOLUMES, { releaseYear: bad });
    assert.equal(result.status, "ambiguous", `year ${JSON.stringify(bad)} should not decide`);
    assert.equal(result.candidates.length, 10);
  }
});

test("a real year still decides, including as a string", () => {
  assert.equal(chooseSeries(RAI_VOLUMES, { releaseYear: "1994" }).series.gcd_id, 60935);
  assert.equal(chooseSeries(RAI_VOLUMES, { releaseYear: 1994 }).series.gcd_id, 60935);
});
