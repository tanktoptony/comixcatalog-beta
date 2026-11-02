import assert from "node:assert/strict";
import test from "node:test";
import { buildRunCompletion, MIN_RUN_SIZE } from "./runCompletion.js";

test("buildRunCompletion deduplicates variants and sorts missing numbers", () => {
  const runs = buildRunCompletion({
    ownedIssueRows: [
      { series_gcd_id: 9, issue_number: "1" },
      { series_gcd_id: 9, issue_number: "1 [Variant]" },
      { series_gcd_id: 9, issue_number: "10" },
    ],
    allIssueRows: ["1", "2", "3", "10"].map((issue_number) => ({ series_gcd_id: 9, issue_number })),
    seriesRows: [{ id: "series-id", gcd_id: 9, title: "A Run", resolved_publisher_cached: "Pub" }],
  });
  assert.equal(MIN_RUN_SIZE, 3);
  assert.deepEqual(runs[0].missing_numbers, ["2", "3"]);
  assert.equal(runs[0].owned, 2);
  assert.equal(runs[0].pct, 50);
});

test("buildRunCompletion keeps complete runs for callers to count", () => {
  const rows = ["1", "2", "3"].map((issue_number) => ({ series_gcd_id: 1, issue_number }));
  const [run] = buildRunCompletion({ ownedIssueRows: rows, allIssueRows: rows, seriesRows: [{ id: "s", gcd_id: 1, title: "Done" }] });
  assert.equal(run.owned, run.total);
});
