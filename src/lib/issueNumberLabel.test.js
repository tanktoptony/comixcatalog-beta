import assert from "node:assert/strict";
import test from "node:test";
import { isUnnumberedIssue, issueNumberSuffix } from "./issueNumberLabel.js";

test("GCD's unnumbered forms read as unnumbered", () => {
  for (const value of ["[nn]", "nn", "(nn)", " [NN] "]) assert.equal(isUnnumberedIssue(value), true);
  for (const value of ["1", "0", "Annual 1", "", null]) assert.equal(isUnnumberedIssue(value), false);
});

test("suffix drops the number only for unnumbered or missing", () => {
  assert.equal(issueNumberSuffix("12"), " #12");
  assert.equal(issueNumberSuffix("1 [Newsstand]"), " #1 [Newsstand]");
  assert.equal(issueNumberSuffix("[nn]"), "");
  assert.equal(issueNumberSuffix(""), "");
  assert.equal(issueNumberSuffix(null), "");
});
