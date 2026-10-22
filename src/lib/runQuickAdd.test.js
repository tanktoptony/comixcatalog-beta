import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRunQuickAddPayload,
  selectableIssueIds,
  selectIssueRange,
} from "./runQuickAdd.js";

const issues = ["gcd-9", "gcd-4", "gcd-12", "gcd-20"].map((id) => ({ id }));

test("selectIssueRange follows the supplied sort order in either direction", () => {
  assert.deepEqual(
    selectIssueRange(issues, "gcd-4", "gcd-20", new Set()),
    ["gcd-4", "gcd-12", "gcd-20"]
  );
  assert.deepEqual(
    selectIssueRange(issues, "gcd-20", "gcd-4", new Set()),
    ["gcd-4", "gcd-12", "gcd-20"]
  );
});

test("range and select all skip owned issues", () => {
  const owned = new Set(["gcd-12"]);
  assert.deepEqual(selectIssueRange(issues, "gcd-9", "gcd-20", owned), [
    "gcd-9",
    "gcd-4",
    "gcd-20",
  ]);
  assert.deepEqual(selectableIssueIds(issues, owned), ["gcd-9", "gcd-4", "gcd-20"]);
});

test("bulk payload keeps valid unique GCD ids and skips owned issues", () => {
  assert.deepEqual(
    buildRunQuickAddPayload(
      ["gcd-9", "local-id", "gcd-4", "gcd-9", "gcd-12"],
      new Set(["gcd-12"])
    ),
    { issue_ids: [9, 4] }
  );
});
