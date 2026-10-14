import assert from "node:assert/strict";
import test from "node:test";
import { pickSeriesCoversStaged } from "./covers.js";

const issue = (series, id, number) => ({ gcd_issue_id: id, series_gcd_id: series, issue_number: number });

// Resolver stand-in: returns covers for ids in `covered` and records each batch.
function fakeResolver(covered) {
  const batches = [];
  return {
    batches,
    resolve: async (batch) => {
      batches.push(batch.map((i) => i.gcd_issue_id));
      return new Map(batch.filter((i) => covered.has(i.gcd_issue_id)).map((i) => [i.gcd_issue_id, { storage_path: `p${i.gcd_issue_id}` }]));
    },
  };
}

test("a covered #1 wins and later issues are never resolved", async () => {
  const series = [{ id: "a", gcd_id: 1 }];
  const issues = [issue(1, 13, "3"), issue(1, 11, "1"), issue(1, 12, "2")];
  const r = fakeResolver(new Set([11, 12, 13]));
  const picked = await pickSeriesCoversStaged(series, issues, r.resolve);
  assert.equal(picked.get("a").storage_path, "p11");
  assert.deepEqual(r.batches, [[11]]);
});

test("no covered #1: lowest-numbered covered issue, found in the second stage", async () => {
  const series = [{ id: "a", gcd_id: 1 }];
  const issues = [issue(1, 11, "1"), issue(1, 12, "2"), issue(1, 13, "3"), issue(1, 14, "4")];
  const r = fakeResolver(new Set([13, 14]));
  const picked = await pickSeriesCoversStaged(series, issues, r.resolve, { stageSize: 3 });
  assert.equal(picked.get("a").storage_path, "p13");
  assert.deepEqual(r.batches, [[11], [12, 13]]);
});

test("only a deep issue is covered: the full pass still finds it", async () => {
  const series = [{ id: "a", gcd_id: 1 }];
  const issues = [1, 2, 3, 4, 5].map((n) => issue(1, 10 + n, String(n)));
  const r = fakeResolver(new Set([15]));
  const picked = await pickSeriesCoversStaged(series, issues, r.resolve, { stageSize: 2 });
  assert.equal(picked.get("a").storage_path, "p15");
  assert.deepEqual(r.batches, [[11], [12], [13, 14, 15]]);
});

test("a series with no #1 and a series with no covers at all", async () => {
  const series = [{ id: "a", gcd_id: 1 }, { id: "b", gcd_id: 2 }];
  const issues = [issue(1, 15, "5"), issue(1, 16, "6"), issue(2, 21, "1"), issue(2, 22, "2")];
  const r = fakeResolver(new Set([16]));
  const picked = await pickSeriesCoversStaged(series, issues, r.resolve);
  assert.equal(picked.get("a").storage_path, "p16");
  assert.equal(picked.has("b"), false);
});

test("same pick as resolving everything, including variant ties in input order", async () => {
  const series = [{ id: "a", gcd_id: 1 }];
  // Two printings of #2 (same number): the earlier one in input order wins, as before.
  const issues = [issue(1, 31, "1"), issue(1, 33, "2"), issue(1, 32, "2"), issue(1, 34, "3")];
  const covered = new Set([32, 33, 34]);
  const staged = await pickSeriesCoversStaged(series, issues, fakeResolver(covered).resolve);
  assert.equal(staged.get("a").storage_path, "p33");
});
