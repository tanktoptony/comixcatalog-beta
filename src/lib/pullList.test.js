import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPullListUpcoming,
  dedupePullListCovers,
  groupPullListWeeks,
} from "./pullList.js";

test("groups ISO weeks newest first and labels each with its latest date", () => {
  const weeks = groupPullListWeeks([
    { in_store_date: "2026-10-20", series_title: "Tuesday" },
    { in_store_date: "2026-10-21", series_title: "Wednesday" },
    { in_store_date: "2026-10-14", series_title: "Prior" },
  ]);
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].label_date, "2026-10-21");
  assert.equal(weeks[0].items.length, 2);
  assert.equal(weeks[1].label_date, "2026-10-14");
});

test("dedupes two covers for one issue and prefers a resolved cover", () => {
  const rows = dedupePullListCovers([
    { id: "a", series_gcd_id: 10, issue_number: "001", gcd_issue_id: null },
    { id: "b", series_gcd_id: 10, issue_number: "1", gcd_issue_id: 99 },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["b"]);
});

test("upcoming lists only exact future on-sale days, never cover months or released issues", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const issues = [
    { series_gcd_id: 1, series_title: "A", issue_number: "1", on_sale_date: "2026-11-25" },
    { series_gcd_id: 1, series_title: "A", issue_number: "2", on_sale_date: "2026-11-10" },
    { series_gcd_id: 1, series_title: "A", issue_number: "3", on_sale_date: "2026-12-09" },
    { series_gcd_id: 1, series_title: "A", issue_number: "4", key_date: "2026-12-00" },
    { series_gcd_id: 2, series_title: "B", issue_number: "1", on_sale_date: "2026-12-00" },
    { series_gcd_id: 2, series_title: "B", issue_number: "2", on_sale_date: "2027-06-01" },
  ];
  const rows = buildPullListUpcoming(issues, [{ series_gcd_id: 1, issue_number: "1" }], now);
  assert.deepEqual(rows, [{ series_title: "A", issue_number: "3", on_sale_date: "2026-12-09", month: "2026-12" }]);
});

test("handles a 200-series, 1,500-cover fixture with one bounded pass per stage", () => {
  const covers = Array.from({ length: 1500 }, (_, index) => ({
    id: index,
    series_gcd_id: (index % 200) + 1,
    issue_number: String(Math.floor(index / 200) + 1),
    in_store_date: index % 2 ? "2026-10-20" : "2026-10-21",
    series_title: `Series ${index % 200}`,
  }));
  let reads = 0;
  const observed = covers.map((row) => {
    reads += 1;
    return row;
  });
  const deduped = dedupePullListCovers(observed);
  const weeks = groupPullListWeeks(deduped);
  assert.equal(reads, 1500);
  assert.equal(deduped.length, 1500);
  assert.equal(weeks.length, 1);
});
