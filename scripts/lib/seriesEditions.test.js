import assert from "node:assert/strict";
import test from "node:test";

import { buildSeriesEditions, normalizeWorkTitle } from "./seriesEditions.js";

const row = (gcd_id, title, issue_count, year_start = 2014) => ({ gcd_id, title, issue_count, year_start });
const format = (publishing_format, publisher_gcd_id = 1, binding = "") => ({ publishing_format, publisher_gcd_id, binding });

test("normalizes work titles", () => {
  assert.equal(normalizeWorkTitle(" The Wicked & The Divine: 1923 "), "wicked and the divine 1923");
});

test("builds the expected Wicked + The Divine links exactly", () => {
  const series = [
    row(81367, "The Wicked + The Divine", 45),
    row(98792, "The Wicked + The Divine", 9),
    row(104218, "The Wicked + The Divine", 4),
    row(224382, "The Wicked + The Divine Compendium", 1, 2024),
    row(106720, "The Wicked + The Divine: 1831", 1),
    row(121177, "The Wicked + The Divine: 1923", 1),
    row(119239, "The Wicked + The Divine Christmas Annual", 1),
    row(114362, "The Wicked + The Divine: 455 AD", 1),
    row(130503, "The Wicked + The Divine: 1373", 1),
    row(133194, "The Wicked + The Divine: The Funnies", 1),
    row(153229, "Image Firsts: The Wicked + The Divine", 1),
  ];
  const formats = new Map(series.map(({ gcd_id }) => [gcd_id, format("ongoing series", 99)]));
  formats.set(98792, format("collected editions", 99, "trade paperback"));
  formats.set(104218, format("Collected edition", 99, "Hardcover"));
  formats.set(224382, format("collected edition", 99));
  formats.set(106720, format("one-shot", 99));
  formats.set(121177, format("One-Shot", 99));
  formats.set(119239, format("", 99));
  formats.set(114362, format("One-Shot", 99));
  formats.set(130503, format("One-Shot", 99));
  formats.set(133194, format("Limited Series", 99));
  const sources = [
    { target: 98792, origin: 81367, issues: 46 },
    ...[[106720, 3], [121177, 3], [119239, 2], [114362, 2], [130503, 2], [133194, 2]]
      .map(([origin, issues]) => ({ target: 98792, origin, issues })),
    { target: 104218, origin: 81367, issues: 61 },
  ];
  assert.deepEqual(buildSeriesEditions({ series, formats, sources }), [
    { edition_gcd_id: 98792, work_gcd_id: 81367, role: "collected", source: "reprints", shared_issues: 46 },
    { edition_gcd_id: 104218, work_gcd_id: 81367, role: "collected", source: "reprints", shared_issues: 61 },
    { edition_gcd_id: 106720, work_gcd_id: 81367, role: "special", source: "reprints", shared_issues: 3 },
    { edition_gcd_id: 114362, work_gcd_id: 81367, role: "special", source: "reprints", shared_issues: 2 },
    { edition_gcd_id: 119239, work_gcd_id: 81367, role: "special", source: "reprints", shared_issues: 2 },
    { edition_gcd_id: 121177, work_gcd_id: 81367, role: "special", source: "reprints", shared_issues: 3 },
    { edition_gcd_id: 130503, work_gcd_id: 81367, role: "special", source: "reprints", shared_issues: 2 },
    { edition_gcd_id: 133194, work_gcd_id: 81367, role: "special", source: "reprints", shared_issues: 2 },
    { edition_gcd_id: 224382, work_gcd_id: 81367, role: "collected", source: "title", shared_issues: 0 },
  ]);
});

test("leaves an anthology unlinked when its top work is under half", () => {
  const series = [row(1, "Alpha", 20), row(2, "Beta", 20), row(3, "Anthology", 1), row(4, "Gamma", 10)];
  const formats = new Map([[1, format("ongoing")], [2, format("ongoing")], [3, format("collected edition")], [4, format("ongoing")]]);
  const sources = [{ target: 3, origin: 1, issues: 4 }, { target: 3, origin: 2, issues: 5 }, { target: 3, origin: 4, issues: 2 }];
  assert.deepEqual(buildSeriesEditions({ series, formats, sources }), []);
});

test("resolves collected-of-collected chains", () => {
  const series = [row(1, "Saga", 30), row(2, "Saga TPB", 6), row(3, "Saga Omnibus", 1)];
  const formats = new Map([[1, format("ongoing")], [2, format("collected edition")], [3, format("collected edition")]]);
  const sources = [{ target: 2, origin: 1, issues: 6 }, { target: 3, origin: 2, issues: 6 }];
  assert.deepEqual(buildSeriesEditions({ series, formats, sources }).map((link) => [link.edition_gcd_id, link.work_gcd_id]), [[2, 1], [3, 1]]);
});

test("special qualification checks publisher, title prefix, and issue count", () => {
  const series = [row(1, "Saga", 30), row(2, "Saga TPB", 6), row(3, "Saga Annual", 1), row(4, "Other Tale", 1), row(5, "Saga Extras", 13)];
  const formats = new Map([[1, format("ongoing", 1)], [2, format("collected edition", 1)], [3, format("one-shot", 2)], [4, format("one-shot", 1)], [5, format("limited", 1)]]);
  const sources = [1, 3, 4, 5].map((origin) => ({ target: 2, origin, issues: origin === 1 ? 20 : 2 }));
  assert.deepEqual(buildSeriesEditions({ series, formats, sources }).map((link) => link.edition_gcd_id), [2]);
});

test("title fallback ignores other publishers and later runs", () => {
  const series = [row(1, "Saga", 20, 2010), row(2, "Saga", 50, 2020), row(3, "Saga", 60, 2009), row(4, "Saga Deluxe Edition Book 1", 1, 2015)];
  const formats = new Map([[1, format("ongoing", 1)], [2, format("ongoing", 1)], [3, format("ongoing", 2)], [4, format("graphic novel", 1)]]);
  assert.deepEqual(buildSeriesEditions({ series, formats, sources: [] }), [
    { edition_gcd_id: 4, work_gcd_id: 1, role: "collected", source: "title", shared_issues: 0 },
  ]);
});

test("tie-breaks reprints by issue count then id and specials by shared count then id", () => {
  const series = [row(1, "Saga", 10), row(2, "Saga", 20), row(3, "Saga TPB", 2), row(4, "Saga HC", 2), row(5, "Saga Special", 1)];
  const formats = new Map([[1, format("ongoing")], [2, format("ongoing")], [3, format("collected edition")], [4, format("collected edition")], [5, format("one-shot")]]);
  const sources = [
    { target: 3, origin: 1, issues: 2 }, { target: 3, origin: 2, issues: 2 }, { target: 3, origin: 5, issues: 2 },
    { target: 4, origin: 1, issues: 2 }, { target: 4, origin: 5, issues: 2 },
  ];
  const links = buildSeriesEditions({ series, formats, sources });
  assert.equal(links.find((link) => link.edition_gcd_id === 3).work_gcd_id, 2);
  assert.equal(links.find((link) => link.edition_gcd_id === 5).work_gcd_id, 1);
});

test("reprint ties with equal catalog counts pick the lower work id", () => {
  const series = [row(1, "Alpha", 20), row(2, "Beta", 20), row(3, "Collected", 1)];
  const formats = new Map([[1, format("ongoing")], [2, format("ongoing")], [3, format("collected edition")]]);
  const sources = [{ target: 3, origin: 2, issues: 2 }, { target: 3, origin: 1, issues: 2 }];
  assert.equal(buildSeriesEditions({ series, formats, sources })[0].work_gcd_id, 1);
});

test("an earlier or ongoing short run is never a special of a later run", () => {
  const series = [
    row(1866, "The Incredible Hulk", 400, 1968),
    row(1515, "The Incredible Hulk", 6, 1962),
    row(2001, "The Incredible Hulk Annual", 6, 1968),
    row(2002, "The Incredible Hulk Special", 2, 1970),
    row(9001, "The Incredible Hulk", 10, 1990),
  ];
  const formats = new Map([
    [1866, format("was ongoing series")],
    [1515, format("one-shot")],
    [2001, format("was ongoing series")],
    [2002, format("one-shot")],
    [9001, format("collected edition", 1, "trade paperback")],
  ]);
  const sources = [
    { target: 9001, origin: 1866, issues: 8 },
    { target: 9001, origin: 1515, issues: 2 },
    { target: 9001, origin: 2001, issues: 1 },
    { target: 9001, origin: 2002, issues: 1 },
  ];
  assert.deepEqual(
    buildSeriesEditions({ series, formats, sources }).map((link) => [link.edition_gcd_id, link.work_gcd_id, link.role]),
    [[2002, 1866, "special"], [9001, 1866, "collected"]],
  );
});

test("a two-title crossover is not a special of either work", () => {
  const series = [
    row(5747, "JLA", 126, 1997),
    row(14839, "JLA / WildC.A.T.s", 1, 1997),
    row(5979, "JLA: Tomorrow Woman", 1, 1998),
    row(9002, "JLA", 4, 1999),
  ];
  const formats = new Map([
    [5747, format("was ongoing series")],
    [14839, format("one-shot")],
    [5979, format("one-shot")],
    [9002, format("collected edition", 1, "trade paperback")],
  ]);
  const sources = [
    { target: 9002, origin: 5747, issues: 20 },
    { target: 9002, origin: 14839, issues: 1 },
    { target: 9002, origin: 5979, issues: 1 },
  ];
  assert.deepEqual(
    buildSeriesEditions({ series, formats, sources }).map((link) => [link.edition_gcd_id, link.work_gcd_id, link.role]),
    [[5979, 5747, "special"], [9002, 5747, "collected"]],
  );
});
