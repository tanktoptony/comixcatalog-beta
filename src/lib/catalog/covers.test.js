import assert from "node:assert/strict";
import test from "node:test";
import { pickCovers, pickUniqueSiblingCover } from "./covers.js";

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
    cover({ id: 84, series_gcd_id: 84, issue_number: "2", series_year: 1984, cover_date: "1984-06-01", publisher: "Mirage Studios", storage_path: "tmnt-1984.jpg" }),
    cover({ id: 11, series_gcd_id: 11, issue_number: "2", series_year: 2011, storage_path: "tmnt-2011.jpg" }),
  ];
  const result = pickCovers(issues, rows);
  assert.equal(result.get(1).storage_path, "tmnt-1984.jpg");
  assert.deepEqual(
    { publisher: result.get(1).publisher, cover_date: result.get(1).cover_date, series_year: result.get(1).series_year },
    { publisher: "Mirage Studios", cover_date: "1984-06-01", series_year: 1984 }
  );
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

test("a gcd_issue_id link to another volume's cover is rejected by the year check", () => {
  // Teen Titans (2014-2016) #21 linked by id to a cover from the 2011 volume.
  const issue = {
    gcd_issue_id: 1700001, series_gcd_id: 75697, series_title: "Teen Titans",
    issue_number: "21", year: 2016, series_year_start: 2014, series_year_end: 2016,
  };
  const rows = [
    { id: "wrong", gcd_issue_id: 1700001, series_gcd_id: 75697, series_title: "Teen Titans",
      issue_number: "21", series_year: 2011, storage_path: "teen-titans/vol-43004/21.jpg" },
    { id: "right", gcd_issue_id: null, series_gcd_id: 75697, series_title: "Teen Titans",
      issue_number: "21", series_year: 2014, storage_path: "teen-titans/vol-75697/21.jpg" },
  ];
  const picked = pickCovers([issue], rows).get(1700001);
  assert.equal(picked?.storage_path, "teen-titans/vol-75697/21.jpg");
  assert.equal(picked?.tier, 2);
});

test("a title-matched cover is checked against the series span, not the issue year", () => {
  // Untagged volume-start year 1990; issue #40 published 1993 in a 1990-1994 run.
  const issue = {
    gcd_issue_id: 1800040, series_gcd_id: 4242, series_title: "Ghost Rider",
    issue_number: "40", year: 1993, series_year_start: 1990, series_year_end: 1994,
  };
  const rows = [
    { id: "t3", gcd_issue_id: null, series_gcd_id: null, series_title: "Ghost Rider",
      issue_number: "40", series_year: 1990, storage_path: "ghost-rider/vol-1990/40.jpg" },
  ];
  const picked = pickCovers([issue], rows).get(1800040);
  assert.equal(picked?.storage_path, "ghost-rider/vol-1990/40.jpg");
  assert.equal(picked?.tier, 3);
});

test("a unique same-book sibling cover qualifies", () => {
  const picked = pickUniqueSiblingCover(issue({
    series_gcd_id: 20,
    series_title: "The Example",
    year: 2000,
    publisher: "Image Comics",
  }), [cover({
    series_gcd_id: 21,
    series_title: "Example",
    series_year: 2001,
    publisher: "Image",
    storage_path: "sibling.jpg",
  })]);
  assert.equal(picked?.storage_path, "sibling.jpg");
  assert.equal(picked?.source, "sibling");
});

test("Tug & Buster 1998 Image #1 rejects the 1995 Art & Soul sibling", () => {
  const picked = pickUniqueSiblingCover(issue({
    series_gcd_id: 151248,
    series_title: "Tug & Buster",
    year: 1998,
    series_year_start: 1998,
    publisher: "Image Comics",
  }), [cover({
    series_gcd_id: 5447,
    series_title: "TUG & buster",
    series_year: 1995,
    cover_date: "1995-01-01",
    publisher: "Art & Soul",
    storage_path: "art-and-soul-1.jpg",
  })]);
  assert.equal(picked, null);
});

test("sibling fallback stays blank when more than one candidate qualifies", () => {
  const target = issue({ series_gcd_id: 20, year: 2000, publisher: null });
  assert.equal(pickUniqueSiblingCover(target, [
    cover({ series_gcd_id: 21, storage_path: "one.jpg" }),
    cover({ id: 2, series_gcd_id: 22, storage_path: "two.jpg" }),
  ]), null);
});
