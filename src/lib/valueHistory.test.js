import { test } from "node:test";
import assert from "node:assert/strict";
import { rangeSlice, valueChange, chartPoints, withLivePoint } from "./valueHistory.js";

const row = (d, v, n = 10) => ({ snapshot_date: d, total_value: v, owned_count: n });
const rows = [row("2026-08-29", 1182.46), row("2026-09-28", 2485.64), row("2026-09-30", 2183.91), row("2026-10-01", 2183.91)];

test("range slices count back from the newest row", () => {
  assert.equal(rangeSlice(rows, "all").length, 4);
  assert.deepEqual(rangeSlice(rows, "30").map((r) => r.snapshot_date), ["2026-09-28", "2026-09-30", "2026-10-01"]);
  assert.deepEqual(rangeSlice([], "30"), []);
});

test("change runs from the range start to the live value", () => {
  const c = valueChange(rangeSlice(rows, "30"), 2040);
  assert.equal(c.from, "2026-09-28");
  assert.equal(Math.round(c.delta), -446);
  assert.ok(c.pct < 0);
  // No live value yet: falls back to the last snapshot.
  assert.equal(Math.round(valueChange(rows, null).delta), 1001);
  assert.equal(valueChange([], 5), null);
  // A collection that started at $0 has no percentage.
  assert.equal(valueChange([row("2026-10-01", 0)], 50).pct, null);
});

test("points fit the box, highest value on top, flat lines mid-chart", () => {
  const box = { W: 640, H: 180, PAD: { top: 12, right: 8, bottom: 8, left: 8 } };
  const p = chartPoints(rows, box);
  assert.equal(p[0].x, 8);
  assert.equal(p[p.length - 1].x, 632);
  const top = p.reduce((a, b) => (b.y < a.y ? b : a));
  assert.equal(top.row.snapshot_date, "2026-09-28");
  for (const q of p) assert.ok(q.y >= 12 && q.y <= 172);
  const flat = chartPoints([row("a", 50), row("b", 50)], box);
  assert.ok(flat[0].y > 40 && flat[0].y < 140);
});

test("the live value ends the line", () => {
  const w = withLivePoint(rows, 2040, "2026-10-02");
  assert.equal(w.length, 5);
  assert.equal(w[4].total_value, 2040);
  assert.equal(w[4].live, true);
  // A snapshot already taken today is replaced, not duplicated.
  assert.equal(withLivePoint(rows, 2040, "2026-10-01").length, 4);
  assert.equal(withLivePoint(rows, null, "2026-10-02").length, 4);
});
