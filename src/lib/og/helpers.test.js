import test from "node:test";
import assert from "node:assert/strict";
import { coverLayout, fitTitle, formatCountDown } from "./helpers.js";
test("count formatter rounds down", () => {
  assert.equal(formatCountDown(2_499_999), "2.4M");
  assert.equal(formatCountDown(48_999), "48K");
  assert.equal(formatCountDown(2099), "2,099");
});
test("fitTitle shrinks long text", () => {
  assert.ok(fitTitle("Short") > fitTitle("A very long comic series title that must fit on two lines safely"));
});
test("cover layouts handle required counts", () => {
  assert.deepEqual(
    [0, 1, 5, 12].map((n) => coverLayout(n).columns),
    [0, 1, 3, 4],
  );
});
