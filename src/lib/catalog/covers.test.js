import assert from "node:assert/strict";
import test from "node:test";
import { pickCovers } from "./covers.js";

const issue = (overrides = {}) => ({
  gcd_issue_id: 1,
  series_gcd_id: 10,
  series_title: "Example",
  issue_number: "1",
  year: 2000,
  series_year_start: 2000,
  series_year_end: 2001,
  ...overrides,
});

const cover = (overrides = {}) => ({
  id: 1,
  gcd_issue_id: null,
  series_gcd_id: 10,
  series_title: "Example",
  issue_number: "1",
  series_year: 2000,
  cover_date: "2000-01-01",
  storage_path: "example.jpg",
  created_at: "2020-01-01",
  ...overrides,
});

test("TMNT volumes resolve #2 by series id", () => {
  const issues = [
    issue({ gcd_issue_id: 1, series_gcd_id: 84, series_title: "Teenage Mutant Ninja Turtles", issue_number: "2", year: 1984, series_year_start: 1984, series_year_end: 1993 }),
    issue({ gcd_issue_id: 2, series_gcd_id: 11, series_title: "Teenage Mutant Ninja Turtles", issue_number: "2", year: 2011, series_year_start: 2011, series_year_end: 2015 }),
  ];
  const rows = [
    cover({ id: 84, series_gcd_id: 84, issue_number: "2", series_year: 1984, storage_path: "tmnt-1984.jpg" }),
    cover({ id: 11, series_gcd_id: 11, issue_number: "2", series_year: 2011, storage_path: "tmnt-2011.jpg" }),
  ];
  const result = pickCovers(issues, rows);
  assert.equal(result.get(1).storage_path, "tmnt-1984.jpg");
  assert.equal(result.get(2).storage_path, "tmnt-2011.jpg");
});

test("Nova volumes resolve #4 independently", () => {
  const issues = [
    issue({ gcd_issue_id: 1, series_gcd_id: 94, series_title: "Nova", issue_number: "4", year: 1994, series_year_start: 1994, series_year_end: 1995 }),
    issue({ gcd_issue_id: 2, series_gcd_id: 13, series_title: "Nova", issue_number: "4", year: 2013, series_year_start: 2013, series_year_end: 2015 }),
  ];
  const rows = [cover({ series_gcd_id: 94, issue_number: "4", series_year: 1994, storage_path: "nova-94.jpg" }), cover({ id: 2, series_gcd_id: 13, issue_number: "4", series_year: 2013, storage_path: "nova-13.jpg" })];
  const result = pickCovers(issues, rows);
  assert.equal(result.get(1).storage_path, "nova-94.jpg");
  assert.equal(result.get(2).storage_path, "nova-13.jpg");
});

test("Robin 1993 rejects an untagged 2022 cover", () => {
  const result = pickCovers([
    issue({ series_gcd_id: 93, series_title: "Robin", year: 1993, series_year_start: 1993, series_year_end: 1993 }),
  ], [cover({ series_gcd_id: null, series_title: "Robin", series_year: 2022 })]);
  assert.equal(result.size, 0);
});

test("four X-O Manowar volumes each receive their own #1", () => {
  const years = [1992, 1997, 2012, 2017];
  const issues = years.map((year, index) => issue({ gcd_issue_id: index + 1, series_gcd_id: 100 + index, series_title: "X-O Manowar", year, series_year_start: year, series_year_end: year + 3 }));
  const rows = years.map((year, index) => cover({ id: index + 1, series_gcd_id: 100 + index, series_title: "X-O Manowar", series_year: year, storage_path: `xo-${year}.jpg` }));
  const result = pickCovers(issues, rows);
  years.forEach((year, index) => assert.equal(result.get(index + 1).storage_path, `xo-${year}.jpg`));
});

test("an untagged exact title variant resolves through tier 3", () => {
  const result = pickCovers([issue({ series_gcd_id: 50, series_title: "The Example" })], [
    cover({ series_gcd_id: null, series_title: "Example", storage_path: "untagged.jpg" }),
  ]);
  assert.equal(result.get(1).tier, 3);
});

test("tier 2 coverage for a series blocks its missing issue from tier 3", () => {
  const result = pickCovers([issue({ issue_number: "2" })], [
    cover({ issue_number: "1", storage_path: "tagged-sibling.jpg" }),
    cover({ id: 2, series_gcd_id: null, issue_number: "2", storage_path: "untagged.jpg" }),
  ]);
  assert.equal(result.size, 0);
});

test("tier 1 prefers matching series, then oldest created_at, then id", () => {
  const rows = [
    cover({ id: 9, gcd_issue_id: 1, series_gcd_id: 99, created_at: "2010-01-01", storage_path: "wrong-series.jpg" }),
    cover({ id: 3, gcd_issue_id: 1, created_at: "2020-01-01", storage_path: "new.jpg" }),
    cover({ id: 2, gcd_issue_id: 1, created_at: "2015-01-01", storage_path: "old-higher.jpg" }),
    cover({ id: 1, gcd_issue_id: 1, created_at: "2015-01-01", storage_path: "old-lowest.jpg" }),
  ];
  assert.equal(pickCovers([issue()], rows).get(1).storage_path, "old-lowest.jpg");
});

test("null storage paths are ignored", () => {
  assert.equal(pickCovers([issue()], [cover({ gcd_issue_id: 1, storage_path: null })]).size, 0);
});

test('"1 [Newsstand]" matches issue "1"', () => {
  const result = pickCovers([issue()], [cover({ issue_number: "1 [Newsstand]" })]);
  assert.equal(result.get(1).storage_path, "example.jpg");
});
