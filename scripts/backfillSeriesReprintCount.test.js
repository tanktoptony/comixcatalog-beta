import test from "node:test";
import assert from "node:assert/strict";
import { planReprintUpdates } from "./backfillSeriesReprintCount.js";

test("separates changed and unchanged rows", () => {
  const result = planReprintUpdates([
    { id: "a", gcd_id: 10, reprint_count: 2 },
    { id: "b", gcd_id: 20, reprint_count: 7 },
  ], new Map([[10, 5], [20, 7]]));
  assert.deepEqual(result.updates, [{ id: "a", gcd_id: 10, reprint_count: 5 }]);
  assert.equal(result.changed, 1);
  assert.equal(result.unchanged, 1);
});

test("missing dump count stays zero without a write", () => {
  const result = planReprintUpdates([{ id: "a", gcd_id: 10, reprint_count: 0 }], new Map());
  assert.deepEqual(result.updates, []);
  assert.equal(result.unchanged, 1);
  assert.equal(result.missingInDump, 1);
});

test("null gcd_id is skipped", () => {
  const result = planReprintUpdates([{ id: "a", gcd_id: null, reprint_count: 4 }], new Map());
  assert.deepEqual(result.updates, []);
  assert.equal(result.skippedNullGcdId, 1);
});
