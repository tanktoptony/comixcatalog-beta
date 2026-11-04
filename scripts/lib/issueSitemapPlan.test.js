import { test } from "node:test";
import assert from "node:assert/strict";
import { CHUNK_WIDTH, chunkForId, planWrites, refusalReason, totalUrls } from "./issueSitemapPlan.js";

test("no chunk can pass Google's 50,000-URL limit", () => {
  assert.ok(CHUNK_WIDTH <= 50000);
});

test("an id always lands in the chunk for its range", () => {
  assert.equal(chunkForId(0), 0);
  assert.equal(chunkForId(49999), 0);
  assert.equal(chunkForId(50000), 1);
  // The real synthetic ids near 1e9 stay in integer range and get their own chunk.
  assert.equal(chunkForId(1001175659), 20023);
});

test("writes only the chunks whose list changed", () => {
  const existing = new Map([[0, [1, 2]], [1, [50001]], [2, [100001]]]);
  const computed = new Map([[0, [1, 2]], [1, [50001, 50002]], [3, [150001]]]);
  assert.deepEqual(planWrites(existing, computed), { upserts: [1, 3], deletes: [2] });
});

test("a same-length list with a different id still counts as changed", () => {
  assert.deepEqual(planWrites(new Map([[0, [1, 2]]]), new Map([[0, [1, 3]]])).upserts, [0]);
});

test("counts urls across chunks", () => {
  assert.equal(totalUrls(new Map([[0, [1, 2]], [1, [3]]])), 3);
});

test("refuses an empty or implausibly small run, even on the first night", () => {
  assert.match(refusalReason(0, 0), /expected at least/);
  assert.match(refusalReason(280000, 99999, { allowShrink: true }), /expected at least/);
});

test("refuses a sudden shrink unless told it is right", () => {
  assert.match(refusalReason(280000, 200000), /--allow-shrink/);
  assert.equal(refusalReason(280000, 200000, { allowShrink: true }), null);
});

test("accepts normal growth, a small shrink, and a first run", () => {
  assert.equal(refusalReason(280000, 281000), null);
  assert.equal(refusalReason(280000, 270000), null);
  assert.equal(refusalReason(0, 280000), null);
});
