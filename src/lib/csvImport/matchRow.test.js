// The Rai volumes below are the real rows that broke the importer on
// 2026-09-24, with the real publisher spellings from the live tables.
//
// Run: npm run test:csv-match

import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeKey,
  publisherMatches,
  issueKey,
  matchIssue,
  chooseSeries,
  ambiguityMessage,
} from "./matchRow.js";

const RAI = [
  { gcd_id: 4493, title: "Rai", year_start_cached: 1992, resolved_publisher_cached: "Valiant Comics" },
  { gcd_id: 60935, title: "Rai", year_start_cached: 1994, resolved_publisher_cached: "Valiant Comics" },
  { gcd_id: 80415, title: "Rai", year_start_cached: 2014, resolved_publisher_cached: "Valiant Comics" },
  { gcd_id: 152850, title: "Rai", year_start_cached: 2019, resolved_publisher_cached: "Valiant Comics" },
  { gcd_id: 167547, title: "Rai", year_start_cached: 2006, resolved_publisher_cached: "Valiant Comics" },
];

test("a year picks the volume out of five identically titled runs", () => {
  const r = chooseSeries(RAI, { releaseYear: 2014 });
  assert.equal(r.status, "matched");
  assert.equal(r.series.gcd_id, 80415);
});

test("without a year it refuses rather than guessing", () => {
  // The old importer's equivalent of guessing was inventing a sixth "Rai".
  // Picking any one of five at random would be just as wrong and harder to
  // notice, because the book would look imported.
  const r = chooseSeries(RAI, {});
  assert.equal(r.status, "ambiguous");
  assert.equal(r.candidates.length, 5);
});

test("the publisher alone does not resolve five volumes from one publisher", () => {
  const r = chooseSeries(RAI, { publisher: "Valiant Comics" });
  assert.equal(r.status, "ambiguous");
});

test("a year one off still lands, for cover-date drift", () => {
  const r = chooseSeries(RAI, { releaseYear: 2015 });
  assert.equal(r.status, "matched");
  assert.equal(r.series.gcd_id, 80415);
});

test("a year that separates nothing stays ambiguous", () => {
  const twins = [
    { gcd_id: 1, title: "X", year_start_cached: 2000, resolved_publisher_cached: "Marvel Comics" },
    { gcd_id: 2, title: "X", year_start_cached: 2000, resolved_publisher_cached: "Marvel Comics" },
  ];
  assert.equal(chooseSeries(twins, { releaseYear: 2000 }).status, "ambiguous");
});

test("a publisher breaks a tie between same-year volumes from different houses", () => {
  const twins = [
    { gcd_id: 1, title: "Nova", year_start_cached: 1994, resolved_publisher_cached: "Marvel Comics" },
    { gcd_id: 2, title: "Nova", year_start_cached: 1994, resolved_publisher_cached: "Image Comics" },
  ];
  const r = chooseSeries(twins, { publisher: "Image" });
  assert.equal(r.status, "matched");
  assert.equal(r.series.gcd_id, 2);
});

test("one candidate needs no disambiguation at all", () => {
  const r = chooseSeries([RAI[0]], {});
  assert.equal(r.status, "matched");
  assert.equal(r.series.gcd_id, 4493);
});

test("no candidates is 'none', which is not the same as ambiguous", () => {
  // "none" may legitimately become a local entry. "ambiguous" never may.
  assert.equal(chooseSeries([], {}).status, "none");
  assert.equal(chooseSeries(undefined, {}).status, "none");
});

test("publisher spellings that differ still count as the same publisher", () => {
  // The exact failure: the CSV says "Valiant Comics", the publishers table
  // has "Valiant" and "Valiant Entertainment LLC", and an equality check
  // matched none of them.
  assert.equal(publisherMatches("Valiant Comics", "Valiant"), true);
  assert.equal(publisherMatches("Valiant", "Valiant Entertainment LLC"), true);
  assert.equal(publisherMatches("DMG/Valiant Entertainment", "Valiant"), false);
  assert.equal(publisherMatches("Marvel Comics", "Marvel"), true);
  assert.equal(publisherMatches("Marvel", "DC Comics"), false);
  assert.equal(publisherMatches("", "Marvel"), false);
});

test("titles meet on the same normalization the search uses", () => {
  assert.equal(normalizeKey("Rai and the Future Force"), "raiandthefutureforce");
  assert.equal(normalizeKey("  X-Men  "), "xmen");
  assert.equal(normalizeKey("Spider-Man!"), "spiderman");
  assert.equal(normalizeKey(null), "");
});

test("issue numbers tolerate padding and a stray hash", () => {
  assert.equal(issueKey("#001").reduced, "1");
  assert.equal(issueKey(" 1 ").reduced, "1");
  assert.equal(issueKey("1A").reduced, "1a");
});

test("an exact issue beats a reduced one, so 1 never resolves to 1A", () => {
  const issues = [
    { gcd_id: 11, issue_number: "1A" },
    { gcd_id: 12, issue_number: "1" },
  ];
  assert.equal(matchIssue(issues, "1").gcd_id, 12);
  assert.equal(matchIssue(issues, "1A").gcd_id, 11);
});

test("a padded issue number still finds its issue", () => {
  assert.equal(matchIssue([{ gcd_id: 9, issue_number: "7" }], "007").gcd_id, 9);
});

test("a missing issue is null, never a nearby one", () => {
  assert.equal(matchIssue([{ gcd_id: 9, issue_number: "7" }], "8"), null);
  assert.equal(matchIssue([], "1"), null);
  assert.equal(matchIssue([{ gcd_id: 9, issue_number: "7" }], ""), null);
});

test("the ambiguity message names the years, because that is the fix", () => {
  const msg = ambiguityMessage("Rai", RAI);
  assert.match(msg, /5 volumes/);
  assert.match(msg, /1992, 1994, 2006, 2014, 2019/);
  assert.match(msg, /release_year/);
  assert.match(msg, /nothing was imported/);
});

test("same-year volumes get advice that actually works", () => {
  // Two runs called Rai both start in 2014, 16 issues and 4. Telling the
  // user to add a release_year column would be advice that cannot help.
  const tied = [
    { title: "Rai", year_start_cached: 2014, issue_count_cached: 16 },
    { title: "Rai", year_start_cached: 2014, issue_count_cached: 4 },
  ];
  const msg = ambiguityMessage("Rai", tied);
  assert.match(msg, /a year cannot separate/);
  assert.match(msg, /16 issues/);
  assert.match(msg, /4 issues/);
  assert.doesNotMatch(msg, /Add a release_year column/);
});

test("distinct years still get the release_year advice", () => {
  const msg = ambiguityMessage("Rai", [
    { title: "Rai", year_start_cached: 1992, issue_count_cached: 34 },
    { title: "Rai", year_start_cached: 2014, issue_count_cached: 16 },
  ]);
  assert.match(msg, /Add a release_year column/);
  assert.match(msg, /1992, 2014/);
});
