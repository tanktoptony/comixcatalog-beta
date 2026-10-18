import assert from "node:assert/strict";
import test from "node:test";
import { eraForYear, packTimelineRows, sortKeyIssues, xForYear } from "./keyTimeline.js";

test("eraForYear uses the catalog age boundaries", () => {
  assert.equal(eraForYear(1955)?.id, "golden");
  assert.equal(eraForYear(1956)?.id, "silver");
  assert.equal(eraForYear(1970)?.id, "bronze");
  assert.equal(eraForYear(1985)?.id, "copper");
  assert.equal(eraForYear(1992)?.id, "modern");
  assert.equal(eraForYear(null), null);
});

test("xForYear maps and clamps years to the track", () => {
  assert.equal(xForYear(1950, 1940, 1960, 900), 450);
  assert.equal(xForYear(1930, 1940, 1960, 900), 0);
  assert.equal(xForYear(1970, 1940, 1960, 900), 900);
  assert.equal(xForYear(1950, 1950, 1950, 900), 450);
});

test("packTimelineRows places tier 1 first and prevents overlaps", () => {
  const packed = packTimelineRows([
    { id: "minor-a", tier: 2, x: 100, width: 34 },
    { id: "major", tier: 1, x: 110, width: 64 },
    { id: "minor-b", tier: 2, x: 150, width: 34 },
    { id: "minor-c", tier: 2, x: 220, width: 34 },
  ]);
  assert.equal(packed[0].id, "major");
  assert.equal(packed[0].row, 0);
  for (const row of new Set(packed.map((item) => item.row))) {
    const rowItems = packed.filter((item) => item.row === row).sort((a, b) => a.start - b.start);
    for (let index = 1; index < rowItems.length; index += 1) {
      assert.ok(rowItems[index - 1].end + 8 <= rowItems[index].start);
    }
  }
});

test("sortKeyIssues sorts numeric issues before named issues", () => {
  const sorted = sortKeyIssues(["100", "Annual 1", "24", "1", "16"].map((issue_number, index) => ({ issue_number, gcd_issue_id: index })));
  assert.deepEqual(sorted.map((issue) => issue.issue_number), ["1", "16", "24", "100", "Annual 1"]);
});
