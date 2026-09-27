// The failing queries are real, taken from production on 2026-09-26.

import test from "node:test";
import assert from "node:assert/strict";
import { parseSearchQuery, yearMatches, yearScore } from "./searchQuery.js";

test("a trailing year becomes a filter instead of title text", () => {
  // "rai 1994" returned ZERO results live. The year normalized into the
  // title key as "rai1994", which matches nothing.
  assert.deepEqual(parseSearchQuery("rai 1994"), { title: "rai", year: 1994, issue: null });
  assert.deepEqual(parseSearchQuery("x-men 1991"), { title: "x-men", year: 1991, issue: null });
});

test("a trailing issue number still behaves as before", () => {
  // These already worked and must keep working.
  assert.deepEqual(parseSearchQuery("hulk 181"), { title: "hulk", year: null, issue: "181" });
  assert.deepEqual(parseSearchQuery("amazing spider-man 300"), {
    title: "amazing spider-man", year: null, issue: "300",
  });
  assert.deepEqual(parseSearchQuery("saga #1"), { title: "saga", year: null, issue: "1" });
});

test("four digits outside the year window is an issue number", () => {
  // Cerebus ran to 300; nothing runs to 3000, but 1899 is not a comic year
  // either and should be treated as an issue rather than silently filtering.
  assert.equal(parseSearchQuery("cerebus 1899").year, null);
  assert.equal(parseSearchQuery("cerebus 1899").issue, "1899");
  assert.equal(parseSearchQuery("cerebus 2100").issue, "2100");
});

test("a parenthesised year is picked up anywhere in the query", () => {
  // Collectors paste this straight off an eBay listing.
  assert.deepEqual(parseSearchQuery("Rai (1994)"), { title: "Rai", year: 1994, issue: null });
  assert.deepEqual(parseSearchQuery("(1963) Amazing Spider-Man"), {
    title: "Amazing Spider-Man", year: 1963, issue: null,
  });
});

test("a bare year is not treated as a filter with no title", () => {
  // Otherwise the title becomes empty and the query matches the entire
  // catalog, filtered only by year.
  assert.deepEqual(parseSearchQuery("1994"), { title: "1994", year: null, issue: null });
  assert.deepEqual(parseSearchQuery("(1994)"), { title: "(1994)", year: null, issue: null });
});

test("empty and junk input does not throw", () => {
  for (const v of ["", "   ", null, undefined]) {
    assert.deepEqual(parseSearchQuery(v), { title: "", year: null, issue: null });
  }
});

test("a title that merely contains digits is left alone", () => {
  assert.deepEqual(parseSearchQuery("Fantastic Four"), {
    title: "Fantastic Four", year: null, issue: null,
  });
  // Trailing number here is genuinely part of the name people type.
  assert.equal(parseSearchQuery("2000 AD").year, null, "leading year is not trailing");
});

test("the year window forgives cover-date drift by one", () => {
  const rai94 = { year_start_cached: 1994, year_end_cached: 1995 };
  assert.ok(yearMatches(rai94, 1994));
  assert.ok(yearMatches(rai94, 1993), "cover dated a year early");
  assert.ok(yearMatches(rai94, 1995));
  assert.ok(!yearMatches(rai94, 1988));
  assert.ok(!yearMatches(rai94, 2014), "must not match the 2014 volume");
});

test("a year inside a long run matches that run", () => {
  // "Batman 1975" should find the 1940 run, which was still going.
  const batman = { year_start_cached: 1940, year_end_cached: 2011 };
  assert.ok(yearMatches(batman, 1975));
  assert.ok(!yearMatches(batman, 2020));
});

test("a row with no year cannot satisfy a year filter", () => {
  assert.ok(!yearMatches({ year_start_cached: null }, 1994));
  assert.ok(!yearMatches({}, 1994));
  // But with no year asked for, everything passes.
  assert.ok(yearMatches({ year_start_cached: null }, null));
});

test("an exact start year outranks merely being in range", () => {
  const exact = { year_start_cached: 1994, year_end_cached: 1995 };
  const spans = { year_start_cached: 1940, year_end_cached: 2011 };
  assert.equal(yearScore(exact, 1994), 2);
  assert.equal(yearScore(spans, 1994), 1);
  assert.equal(yearScore(spans, 2020), 0);
  assert.equal(yearScore(exact, null), 0, "no year asked, no bonus");
});

test("year 0 and other falsy junk do not read as 'no year'", () => {
  // Number("") and Number(null) are 0, the trap that has bitten this repo
  // twice today already.
  assert.equal(parseSearchQuery("rai 0").year, null);
  assert.equal(parseSearchQuery("rai 0").issue, "0");
  assert.ok(!yearMatches({ year_start_cached: 0 }, 1994));
});
