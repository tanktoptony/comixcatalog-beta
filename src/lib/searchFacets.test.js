import assert from "node:assert/strict";
import test from "node:test";
import { buildFacets, filterResults, formatKeyOfLabel, workFormats } from "./searchFacets.js";

const empty = () => ({ formats: new Set(), decades: new Set(), publishers: new Set() });
const work = {
  id: "run", issue_count: 45, year_start: 2014, year_end: 2021,
  publisher: { name: "Image Comics" }, format_collected: false,
  editions: { groups: [
    { label: "TPB", books: 9 }, { label: "Deluxe", books: 4 }, { label: "Specials", books: 6 },
  ] },
};

test("format labels map into the displayed format facets", () => {
  assert.equal(formatKeyOfLabel("TPB"), "tpb");
  assert.equal(formatKeyOfLabel("Absolute"), "hc");
  assert.equal(formatKeyOfLabel("Library Edition"), "hc");
  assert.equal(formatKeyOfLabel("Compendium"), "omnibus");
  assert.equal(formatKeyOfLabel("Specials"), "specials");
  assert.equal(formatKeyOfLabel("Digest"), "other");
  assert.deepEqual(Object.fromEntries(workFormats(work)), { issues: 45, tpb: 9, hc: 4, specials: 6 });
});

test("works span every decade while issues use their own year", () => {
  const facets = buildFacets({ works: [work], issues: [{ year: 1999, publisher: "Vertigo" }], selected: empty() });
  assert.deepEqual(facets.decades.map(({ key, count }) => [key, count]), [["2020s", 1], ["2010s", 1], ["1990s", 1]]);
});

test("facet counts apply other facets but not their own", () => {
  const selected = empty();
  selected.publishers.add("image comics");
  const facets = buildFacets({
    works: [work, { ...work, id: "dc", publisher: { name: "DC" }, year_start: 1987, year_end: 1987 }],
    issues: [], selected,
  });
  assert.deepEqual(facets.publishers.map(({ key, count }) => [key, count]), [["dc", 1], ["image comics", 1]]);
  assert.deepEqual(facets.decades.map(({ key }) => key), ["2020s", "2010s"]);
});

test("filterResults limits edition groups and controls the run chip", () => {
  const selected = empty();
  selected.formats.add("tpb");
  const result = filterResults({ works: [work], issues: [], selected });
  assert.equal(result.works[0].showRun, false);
  assert.deepEqual(result.works[0].visibleGroups.map((group) => group.label), ["TPB"]);
});

test("issues are hidden when a non-issue format is selected", () => {
  const selected = empty();
  selected.formats.add("hc");
  const result = filterResults({ works: [work], issues: [{ id: "issue", year: 2018, publisher: "Image Comics" }], selected });
  assert.equal(result.works.length, 1);
  assert.equal(result.issues.length, 0);
});
