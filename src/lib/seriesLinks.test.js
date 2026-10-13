import assert from "node:assert/strict";
import test from "node:test";

import { seriesLinkDisplayLines } from "./seriesLinks.js";

const amory = { id: "amory", title: "Amory Wars", year_start_cached: 2007 };
const amoryTwo = { id: "amory-ii", title: "Amory Wars II", year_start_cached: 2008 };
const ultimate = { id: "ultimate", title: "The Second Stage Turbine Blade Ultimate Edition", year_start_cached: 2010 };

test("labels an outgoing continuation", () => {
  const rows = [{ from_gcd_id: 26099, to_gcd_id: 52493, kind: "continues", source: "gcd_bond", from_series: amory, to_series: amoryTwo }];
  assert.deepEqual(seriesLinkDisplayLines(rows, 26099), [{ label: "Continues in", title: "Amory Wars II", href: "/series/amory-ii", year: 2008, note: null, kind: "continues" }]);
});

test("labels an incoming continuation", () => {
  const rows = [{ from_gcd_id: 26099, to_gcd_id: 52493, kind: "continues", source: "gcd_bond", from_series: amory, to_series: amoryTwo }];
  assert.equal(seriesLinkDisplayLines(rows, 52493)[0].label, "Continued from");
  assert.equal(seriesLinkDisplayLines(rows, 52493)[0].title, "Amory Wars");
});

test("labels a collected edition", () => {
  const rows = [{ from_gcd_id: 26099, to_gcd_id: 51788, kind: "collected_in", source: "curated", from_series: amory, to_series: ultimate }];
  assert.equal(seriesLinkDisplayLines(rows, 26099)[0].label, "Collected in");
  assert.equal(seriesLinkDisplayLines(rows, 26099)[0].title, ultimate.title);
});

test("the collection's own page says what it collects", () => {
  const rows = [{ from_gcd_id: 26099, to_gcd_id: 51788, kind: "collected_in", source: "curated", from_series: amory, to_series: ultimate }];
  assert.equal(seriesLinkDisplayLines(rows, 51788)[0].label, "Collects");
  assert.equal(seriesLinkDisplayLines(rows, 51788)[0].title, "Amory Wars");
});

test("returns no display lines for an unlinked series", () => {
  assert.deepEqual(seriesLinkDisplayLines([], 26099), []);
});

test("a curated duplicate wins over a GCD bond", () => {
  const base = { from_gcd_id: 26099, to_gcd_id: 52493, kind: "continues", from_series: amory, to_series: amoryTwo };
  const lines = seriesLinkDisplayLines([
    { ...base, source: "gcd_bond", note: "database note" },
    { ...base, source: "curated", note: "Same continuing story." },
  ], 26099);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].note, "Same continuing story.");
});
