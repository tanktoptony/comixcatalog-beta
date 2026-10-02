import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wantlistMatches,
  queryScore,
  readFilters,
  isBrowsing,
  filterListings,
  facetCounts,
  sortListings,
  paginate,
  landingSections,
  PAGE_SIZE,
} from "./marketplaceFacets.js";

const L = (o) => ({
  title: "X-Men",
  issueNumber: "1",
  publisher: "Marvel Comics",
  seller: "tony",
  year: 1963,
  grade: null,
  slab: null,
  price: null,
  estValue: null,
  wantCount: 0,
  listedAt: "2026-10-01T00:00:00Z",
  ...o,
});

const listings = [
  L({ id: 1, title: "X-Men", issueNumber: "1", year: 1963, slab: "CGC", grade: 9.4, estValue: 900, wantCount: 3, listedAt: "2026-10-01T01:00:00Z" }),
  L({ id: 2, title: "X-Men", issueNumber: "10", year: 1965, grade: 6.5, estValue: 120, listedAt: "2026-10-01T02:00:00Z" }),
  L({ id: 3, title: "X-Men", issueNumber: "2", year: 1964, estValue: 40, wantCount: 1, listedAt: "2026-10-01T03:00:00Z", seller: "pete" }),
  L({ id: 4, title: "Batman", publisher: "DC Comics", issueNumber: "1", year: 1940, price: 5, estValue: 2000, listedAt: "2026-09-30T00:00:00Z", seller: "pete" }),
  L({ id: 5, title: "Spawn", publisher: null, issueNumber: "1", year: 1992, estValue: null, listedAt: "2026-09-29T00:00:00Z" }),
];

test("readFilters drops a series without its publisher and bad sort/page", () => {
  const f = readFilters(new URLSearchParams("series=X-Men&sort=bogus&page=-3&q=  xmen "));
  assert.equal(f.series, null);
  // A search with no valid sort ranks by best match.
  assert.equal(f.sort, "relevance");
  assert.equal(readFilters(new URLSearchParams("view=all")).sort, "newest");
  assert.equal(readFilters(new URLSearchParams("sort=relevance")).sort, "newest", "no query, nothing to rank by");
  assert.equal(f.page, 1);
  assert.equal(f.q, "xmen");
  assert.equal(isBrowsing(readFilters(new URLSearchParams(""))), false);
  assert.equal(isBrowsing(f), true);
});

test("filters combine and search matches title + issue words", () => {
  const f = readFilters({ publisher: "Marvel Comics", series: "X-Men", format: "raw" });
  assert.deepEqual(filterListings(listings, f).map((l) => l.id), [2, 3]);
  assert.deepEqual(filterListings(listings, readFilters({ q: "x-men #10" })).map((l) => l.id), [2]);
  assert.deepEqual(filterListings(listings, readFilters({ q: "pete batman" })).map((l) => l.id), [4]);
  assert.deepEqual(filterListings(listings, readFilters({ publisher: "Other publishers" })).map((l) => l.id), [5]);
});

test("price filter uses the asking price over the est. value", () => {
  // Batman is worth $2,000 but asks $5.
  assert.deepEqual(filterListings(listings, readFilters({ price: "0-10" })).map((l) => l.id), [4]);
});

test("a facet's counts ignore its own selection but apply the others", () => {
  const f = readFilters({ publisher: "Marvel Comics", format: "slabbed" });
  const c = facetCounts(listings, f);
  // Publisher counts apply format=slabbed only: one slabbed Marvel, zero DC.
  assert.deepEqual(c.publisher, [["Marvel Comics", 1]]);
  // Format counts apply publisher=Marvel only: 1 slabbed, 2 raw.
  assert.deepEqual(c.format, [["raw", 2], ["slabbed", 1]]);
  assert.deepEqual(c.series, [["X-Men", 1]]);
  assert.equal(facetCounts(listings, readFilters({})).series, undefined, "no series facet without a publisher");
});

test("grade and decade buckets", () => {
  const c = facetCounts(listings, readFilters({}));
  assert.deepEqual(c.grade, [["9.0-10", 1], ["6.0-7.9", 1]]);
  assert.deepEqual(c.decade.map(([d]) => d), ["1990s", "1960s", "1940s"]);
});

test("sorts: value uses asking price; unknown values sink; title orders issues numerically", () => {
  assert.deepEqual(sortListings(listings, "value-desc").map((l) => l.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(sortListings(listings, "value-asc").map((l) => l.id), [4, 3, 2, 1, 5]);
  assert.deepEqual(sortListings(listings, "title").map((l) => l.id), [4, 5, 1, 3, 2]);
  assert.deepEqual(sortListings(listings, "newest").map((l) => l.id), [3, 2, 1, 4, 5]);
});

test("pagination clamps and counts past one page", () => {
  const many = Array.from({ length: PAGE_SIZE * 2 + 3 }, (_, i) => L({ id: i }));
  const p = paginate(many, 3);
  assert.equal(p.pages, 3);
  assert.equal(p.items.length, 3);
  assert.equal(paginate(many, 99).page, 3);
  assert.equal(paginate([], 1).pages, 1);
});

test("landing shelves", () => {
  const s = landingSections(listings, 2);
  assert.deepEqual(s.justListed.map((l) => l.id), [3, 2]);
  assert.deepEqual(s.mostWanted.map((l) => l.id), [1, 3]);
  assert.deepEqual(s.mostValuable.map((l) => l.id), [1, 2]);
  assert.deepEqual(s.publishers[0], ["Marvel Comics", 3]);
  assert.deepEqual(s.sellers, [["tony", 3], ["pete", 2]]);
});

test("search follows the catalog search rules", () => {
  const xs = [
    L({ id: "xm1", title: "The X-Men", issueNumber: "1", year: 1963, publisher: "Marvel Comics" }),
    L({ id: "xm91", title: "X-Men", issueNumber: "1", year: 1991, publisher: "Marvel Comics" }),
    L({ id: "uxm", title: "The Uncanny X-Men", issueNumber: "141", year: 1981, publisher: "Marvel Comics" }),
    L({ id: "asm", title: "The Amazing Spider-Man", issueNumber: "300", year: 1988, publisher: "Marvel Comics", seller: "pete" }),
    L({ id: "hulk", title: "The Incredible Hulk", issueNumber: "181 [Newsstand]", year: 1974, publisher: "Marvel Comics" }),
    L({ id: "gs", title: "Gunslinger", issueNumber: "1", year: 2021, publisher: "Image Comics", seller: "cc_admin" }),
  ];
  const ids = (q) => sortListings(filterListings(xs, readFilters({ q })), "relevance", q).map((l) => l.id);
  // Punctuation and case don't matter.
  assert.deepEqual(ids("xmen").slice(0, 2).sort(), ["xm1", "xm91"]);
  assert.ok(ids("spiderman").includes("asm"));
  assert.ok(ids("amazing spider man").includes("asm"));
  // A leading "The" doesn't matter, and an exact title outranks a longer one.
  assert.equal(ids("the x-men")[0] === "xm1" || ids("the x-men")[0] === "xm91", true);
  assert.ok(ids("x-men").indexOf("uxm") > 1);
  // Trailing number = issue; a variant suffix still matches the base issue.
  assert.deepEqual(ids("hulk 181"), ["hulk"]);
  assert.deepEqual(ids("amazing spider-man #300"), ["asm"]);
  assert.deepEqual(ids("hulk 180"), []);
  // Four digits = year, with a year of slack.
  assert.deepEqual(ids("x-men 1991"), ["xm91"]);
  assert.deepEqual(ids("x-men (1963)"), ["xm1"]);
  // Seller and publisher still searchable.
  assert.deepEqual(ids("@pete"), ["asm"]);
  assert.deepEqual(ids("image gunslinger"), ["gs"]);
  assert.equal(queryScore(xs[0], "batman"), 0);
});

test("wantlist matches: on your list, not your own copies, cheapest first", () => {
  const ls = [
    L({ id: "a", gcdIssueId: 10, price: 30, seller: "pete" }),
    L({ id: "b", gcdIssueId: 10, estValue: 12, seller: "tony" }),
    L({ id: "c", gcdIssueId: 10, estValue: 20, seller: "dan" }),
    L({ id: "d", gcdIssueId: 99, price: 5, seller: "dan" }),
  ];
  assert.deepEqual(wantlistMatches(ls, new Set([10]), "tony").map((l) => l.id), ["c", "a"]);
  assert.deepEqual(wantlistMatches(ls, new Set(), "tony"), []);
  assert.deepEqual(wantlistMatches(ls, null, "tony"), []);
  const f = readFilters(new URLSearchParams("wants=1"));
  assert.equal(f.wants, true);
  assert.equal(isBrowsing(f), true);
});
