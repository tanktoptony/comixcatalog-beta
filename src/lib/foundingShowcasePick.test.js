import test from "node:test";
import assert from "node:assert/strict";
import { fillMosaic, pickShowcase, pickShowcaseList } from "./foundingShowcasePick.js";

const covered = new Map([[1, { storage_path: "a.jpg" }], [2, { storage_path: "b.jpg" }], [3, { storage_path: "c.jpg" }]]);

test("picks the most valuable copy that has a cover", () => {
  const rows = [
    { gcd_issue_id: 1, market_value: 5, created_at: "2026-11-01" },
    { gcd_issue_id: 9, market_value: 900, created_at: "2026-11-02" },
    { gcd_issue_id: 2, auto_market_value: 40, created_at: "2026-10-01" },
  ];
  assert.equal(pickShowcase(rows, covered).gcd_issue_id, 2);
});

test("a hand-entered value outranks the automatic one", () => {
  const rows = [
    { gcd_issue_id: 1, market_value: 10, auto_market_value: 500 },
    { gcd_issue_id: 2, market_value: 50, auto_market_value: 1 },
  ];
  assert.equal(pickShowcase(rows, covered).gcd_issue_id, 2);
});

test("with no values, the newest covered copy wins", () => {
  const rows = [
    { gcd_issue_id: 1, created_at: "2026-09-01" },
    { gcd_issue_id: 3, created_at: "2026-11-15" },
  ];
  assert.equal(pickShowcase(rows, covered).gcd_issue_id, 3);
});

test("no covered copy means no book", () => {
  assert.equal(pickShowcase([{ gcd_issue_id: 9, market_value: 100 }], covered), null);
  assert.equal(pickShowcase([], covered), null);
  assert.equal(pickShowcase(null, covered), null);
});

test("the pass list is distinct, valued, and capped", () => {
  const rows = [
    { gcd_issue_id: 1, market_value: 5 },
    { gcd_issue_id: 1, market_value: 3 },
    { gcd_issue_id: 9, market_value: 900 },
    { gcd_issue_id: 3, market_value: 50 },
    { gcd_issue_id: 2, market_value: 20 },
  ];
  assert.deepEqual(pickShowcaseList(rows, covered, 2).map((r) => r.gcd_issue_id), [3, 2]);
  assert.deepEqual(pickShowcaseList(rows, covered, 9).map((r) => r.gcd_issue_id), [3, 2, 1]);
});

test("the mosaic puts own covers first, then the wall, then repeats", () => {
  assert.deepEqual(fillMosaic(["a"], ["b", "a", "c"], 5), ["a", "b", "c", "a", "b"]);
  assert.deepEqual(fillMosaic([], ["x"], 3), ["x", "x", "x"]);
  assert.deepEqual(fillMosaic(null, [], 9), []);
});
