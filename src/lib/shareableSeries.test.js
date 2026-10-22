import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChecklistRows,
  buildKeysDescription,
  groupKeysByEra,
} from "./shareableSeries.js";

test("groupKeysByEra keeps era order and an unknown group", () => {
  const groups = groupKeysByEra([
    { gcd_issue_id: 3, year: null },
    { gcd_issue_id: 2, year: 1988 },
    { gcd_issue_id: 1, year: 1963 },
  ]);
  assert.deepEqual(groups.map((group) => group.label), ["Silver", "Copper", "Year unknown"]);
});

test("buildKeysDescription includes the count and first three major keys", () => {
  const description = buildKeysDescription({
    key_issues: [
      { issue_number: "1", reason: "First hero", tier: 1 },
      { issue_number: "4", reason: "First villain", tier: 1 },
      { issue_number: "8", reason: "New costume", tier: 1 },
      { issue_number: "9", reason: "Cameo", tier: 1 },
      { issue_number: "10", reason: "Origin detail", tier: 2 },
    ],
  });
  assert.equal(
    description,
    "5 key issues, 4 major. Major keys include #1: First hero; #4: First villain; #8: New costume."
  );
});

test("buildChecklistRows sorts issues and attaches key details", () => {
  const rows = buildChecklistRows([
    { id: "gcd-20", issue_number: "10", release_year: 1990, title: "Finale" },
    { id: "gcd-10", issue_number: "2", release_year: 1989, title: null },
  ], [
    { gcd_issue_id: 20, reason: "Final issue", tier: 1 },
  ]);
  assert.deepEqual(rows.map((row) => row.issueNumber), ["2", "10"]);
  assert.equal(rows[1].keyIssue.reason, "Final issue");
});
