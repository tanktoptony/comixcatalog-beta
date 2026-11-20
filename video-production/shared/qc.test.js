import test from "node:test";
import assert from "node:assert/strict";
import { textOnlySegments, findRetakeSuspects, findZeroRuns, maximumFrameDelta, maximumFlashDelta } from "./qc.js";

test("flash delta ignores fades and catches one- and two-frame flashes", () => {
  const fadeOut = [[80], [60], [40], [20], [10], [10], [10]];
  const fadeThroughBackground = [[80], [40], [10], [10], [10], [40], [80]];
  assert.equal(maximumFlashDelta(fadeOut), 0);
  assert.equal(maximumFlashDelta(fadeThroughBackground), 0);
  assert.equal(maximumFlashDelta([[20], [20], [90], [20], [20]]), 70);
  assert.equal(maximumFlashDelta([[20], [20], [90], [90], [20]]), 70);
  assert.equal(maximumFlashDelta([[50], [50], [10], [50], [50]]), 40);
  assert.equal(maximumFlashDelta([[20], [22], [21], [23]]), 1);
});

test("counts only image-free text cards", () => {
  const got = textOnlySegments([{ type: "chapter", at: 1 }, { type: "quote", asset: "a.jpg" }, { type: "end", at: 4 }, { type: "cover", asset: "b.jpg" }]);
  assert.deepEqual(got.map((x) => x.type), ["chapter", "end"]);
});

test("detects long words, section gaps, and repeated phrases", () => {
  const words = [
    { w: "one", s: 0, e: 1.3, section: 1 }, { w: "two", s: 1.4, e: 1.6, section: 1 }, { w: "three", s: 1.7, e: 1.9, section: 1 },
    { w: "one", s: 4, e: 4.2, section: 1 }, { w: "two", s: 4.3, e: 4.5, section: 1 }, { w: "three", s: 4.6, e: 4.8, section: 1 },
    { w: "later", s: 8, e: 8.2, section: 1 },
  ];
  const kinds = findRetakeSuspects(words).map((x) => x.kind);
  assert.ok(kinds.includes("long word")); assert.ok(kinds.includes("repeat")); assert.ok(kinds.includes("gap"));
});

test("finds exact zero runs in synthetic PCM", () => {
  const rate = 1000, data = new Int16Array(2000).fill(2); data.fill(0, 700, 735);
  assert.deepEqual(findZeroRuns(data, rate), [{ start: 0.7, end: 0.735, duration: 0.035 }]);
});

test("computes maximum edge delta", () => {
  assert.equal(maximumFrameDelta([[10, 20, 30, 40], [11, 26, 29, 40], [9, 24, 29, 41]]), 6);
});
