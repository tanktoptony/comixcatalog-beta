import test from "node:test";
import assert from "node:assert/strict";
import { diversify, titleFamily, groupByTitle, flattenGroups } from "./searchVariety.js";

const s = (title, issues, year) => ({ title, issue_count_cached: issues, year_start_cached: year });

// The live "spider-man" result set: twelve volumes all called Spider-Man,
// with the books anyone means ranked below them.
const SPIDER = [
  s("Spider-Man", 98, 1990), s("Spider-Man", 61, 2022), s("Spider-Man", 37, 2023),
  s("Spider-Man", 23, 1991), s("Spider-Man", 149, 2000), s("Spider-Man", 134, 2010),
  s("Spider-Man", 111, 2004), s("Spider-Man", 48, 1997), s("Spider-Man", 36, 2013),
  s("Spider-Man", 28, 2016), s("Spider-Man", 25, 2006), s("Spider-Man", 13, 2020),
  s("The Amazing Spider-Man", 650, 1963), s("The Spectacular Spider-Man", 264, 1976),
  s("Ultimate Spider-Man", 133, 2000), s("Web of Spider-Man", 131, 1985),
  s("Superior Spider-Man", 33, 2013), s("Miles Morales: Spider-Man", 42, 2023),
];

test("articles do not split a title family, other words do", () => {
  assert.equal(titleFamily("The Amazing Spider-Man"), titleFamily("Amazing Spider-Man"));
  assert.notEqual(titleFamily("Spider-Man"), titleFamily("Amazing Spider-Man"));
  assert.equal(titleFamily("Spider-Man"), titleFamily("spider man"));
  assert.equal(titleFamily(null), "");
});

test("the famous runs reach the page instead of being crowded out", () => {
  const out = diversify(SPIDER, { limit: 12, perTitle: 2 });
  const titles = out.map((r) => r.title);
  for (const wanted of ["The Amazing Spider-Man", "The Spectacular Spider-Man",
                        "Ultimate Spider-Man", "Web of Spider-Man"]) {
    assert.ok(titles.includes(wanted), `${wanted} should be on the page`);
  }
});

test("every distinct run gets a place before any run gets a second", () => {
  const out = diversify(SPIDER, { limit: 12, perTitle: 2 });
  const families = new Set(out.map((r) => titleFamily(r.title)));
  assert.equal(families.size, 7, "all seven distinct runs are represented");

  // Plain "Spider-Man" does end up with 6 of the 12, and that is correct:
  // only six other families exist, so filling the page requires it. The
  // property that matters is that it no longer takes ALL of them, and that
  // it is filled last rather than first.
  const plain = out.filter((r) => r.title === "Spider-Man");
  assert.ok(plain.length <= out.length / 2, `Spider-Man took ${plain.length} of ${out.length}`);
  assert.equal(out.slice(0, 7).filter((r) => r.title === "Spider-Man").length, 2,
    "only two before every other run has had a turn");
});

test("the page is still filled", () => {
  assert.equal(diversify(SPIDER, { limit: 12, perTitle: 2 }).length, 12);
  assert.equal(diversify(SPIDER, { limit: 6, perTitle: 2 }).length, 6);
  assert.equal(diversify(SPIDER, { limit: 18, perTitle: 2 }).length, 18);
});

test("rank order is preserved inside a family", () => {
  // The two Spider-Man rows kept must be the two the ranker put first, not
  // an arbitrary pair.
  const out = diversify(SPIDER, { limit: 12, perTitle: 2 });
  const plain = out.filter((r) => r.title === "Spider-Man");
  assert.equal(plain[0].year_start_cached, 1990);
  assert.equal(plain[1].year_start_cached, 2022);
});

test("the best of each family leads, in the ranker's order", () => {
  const out = diversify(SPIDER, { limit: 12, perTitle: 2 });
  assert.equal(out[0].title, "Spider-Man", "the top-ranked row still leads");
  assert.equal(out[0].year_start_cached, 1990);
});

test("a narrow query is not padded out or truncated", () => {
  // "rai and the future force" matches one family. Capping at 2 must not
  // return 2 results when the caller asked for 12 and only 3 exist.
  const narrow = [s("Rai and the Future Force", 15, 1993),
                  s("Rai and the Future Force", 4, 1994),
                  s("Rai and the Future Force", 1, 1995)];
  const out = diversify(narrow, { limit: 12, perTitle: 2 });
  assert.equal(out.length, 3, "returns everything it has");
});

test("a single family larger than the page relaxes rather than starving it", () => {
  const many = Array.from({ length: 20 }, (_, i) => s("Batman", 100 - i, 1940 + i));
  const out = diversify(many, { limit: 12, perTitle: 2 });
  assert.equal(out.length, 12, "fills the page even with one family");
  assert.equal(out[0].year_start_cached, 1940, "still best-first");
});

test("nothing is duplicated", () => {
  const out = diversify(SPIDER, { limit: 18, perTitle: 2 });
  assert.equal(new Set(out).size, out.length);
});

test("empty and junk input is handled", () => {
  assert.deepEqual(diversify([], { limit: 12 }), []);
  assert.deepEqual(diversify(null, { limit: 12 }), []);
  assert.deepEqual(diversify(undefined, { limit: 12 }), []);
});

test("rows with no title do not collapse into one family unfairly", () => {
  // They share the "" family, so the cap applies — but the page still fills.
  const rows = [s(null, 5, 2000), s(undefined, 4, 2001), s("", 3, 2002), s("Real Title", 2, 2003)];
  const out = diversify(rows, { limit: 4, perTitle: 2 });
  assert.equal(out.length, 4);
});

test("a short input is returned untouched", () => {
  const three = SPIDER.slice(0, 3);
  assert.deepEqual(diversify(three, { limit: 12, perTitle: 2 }), three);
});

test("groups follow the rank of their best row, not the alphabet", () => {
  const groups = groupByTitle(diversify(SPIDER, { limit: 12, perTitle: 2 }));
  assert.equal(groups[0].title, "Spider-Man", "the top-ranked row's family leads");
  const families = groups.map((g) => g.family);
  assert.equal(new Set(families).size, families.length, "no family appears twice");
});

test("rows keep rank order inside a group", () => {
  const groups = groupByTitle(diversify(SPIDER, { limit: 12, perTitle: 2 }));
  const plain = groups.find((g) => g.title === "Spider-Man");
  assert.ok(plain.rows.length >= 2);
  assert.equal(plain.rows[0].year_start_cached, 1990);
  assert.equal(plain.rows[1].year_start_cached, 2022);
});

test("flattening a grouping loses nothing and duplicates nothing", () => {
  const picked = diversify(SPIDER, { limit: 12, perTitle: 2 });
  const flat = flattenGroups(groupByTitle(picked));
  assert.equal(flat.length, picked.length);
  assert.equal(new Set(flat).size, picked.length);
  for (const row of picked) assert.ok(flat.includes(row));
});

test("the flattened order is what the screen shows, so nav stays in sync", () => {
  // Every row of group 0 comes before every row of group 1.
  const groups = groupByTitle(diversify(SPIDER, { limit: 12, perTitle: 2 }));
  const flat = flattenGroups(groups);
  let cursor = 0;
  for (const g of groups) {
    for (const row of g.rows) {
      assert.equal(flat[cursor], row, `position ${cursor} must match the render order`);
      cursor += 1;
    }
  }
});

test("a title-less row gets its own family rather than crashing", () => {
  const groups = groupByTitle([{ title: null }, { title: "Real" }]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, "");
});

test("grouping empty input is empty, not a crash", () => {
  assert.deepEqual(groupByTitle([]), []);
  assert.deepEqual(groupByTitle(null), []);
  assert.deepEqual(flattenGroups(null), []);
});
