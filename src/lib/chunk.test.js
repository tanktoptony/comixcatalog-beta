import { test } from "node:test";
import assert from "node:assert/strict";
import { chunk } from "./chunk.js";

test("2,500 library keys split into 1,000 + 1,000 + 500", () => {
  const keys = Array.from({ length: 2500 }, (_, i) => i);
  const parts = chunk(keys, 1000);
  assert.deepEqual(parts.map((p) => p.length), [1000, 1000, 500]);
  assert.deepEqual(parts.flat(), keys);
});

test("every piece fits under the route's 2,000-id cap", () => {
  const parts = chunk(Array.from({ length: 9999 }), 1000);
  assert.ok(parts.every((p) => p.length <= 2000));
});

test("empty and missing input give no pieces", () => {
  assert.deepEqual(chunk([], 1000), []);
  assert.deepEqual(chunk(undefined, 1000), []);
});

test("a bad size throws instead of looping forever", () => {
  assert.throws(() => chunk([1, 2], 0), RangeError);
});
