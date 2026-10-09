import assert from "node:assert/strict";
import test from "node:test";
import { indexCanonicalIssues, issueFor } from "./amoryWars.js";

test("canonical issue index chooses the lowest GCD id for duplicate printings", () => {
  const index = indexCanonicalIssues([
    { gcd_id: 20, series_gcd_id: 1, issue_number: "1 [Variant]" },
    { gcd_id: 10, series_gcd_id: 1, issue_number: "1" },
    { gcd_id: 30, series_gcd_id: 1, issue_number: "2" },
  ]);
  assert.equal(issueFor(index, 1, "1")?.gcd_id, 10);
  assert.equal(issueFor(index, 1, "2")?.gcd_id, 30);
  assert.equal(issueFor(index, 1, "3"), null);
});
