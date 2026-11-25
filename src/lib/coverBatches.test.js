import { test } from "node:test";
import assert from "node:assert/strict";
import { coverBatches, numbersByKey } from "./coverBatches.js";

test("numbers are grouped by series, blanks left out", () => {
  const map = numbersByKey([
    { s: 1, issue_number: "1" }, { s: 1, issue_number: "2" }, { s: 1, issue_number: "2" },
    { s: 2, issue_number: null }, { s: null, issue_number: "9" },
  ], (row) => row.s);
  assert.deepEqual([...map.keys()], [1]);
  assert.deepEqual([...map.get(1)], ["1", "2"]);
});

// 1,500 series with up to 700 numbers, about the largest collection on file.
test("a 10,000-book collection stays under the URL limit and loses nothing", () => {
  const rows = [];
  for (let s = 0; s < 1500; s += 1) for (let n = 1; n <= 7; n += 1) rows.push({ s: 100000 + s, issue_number: String(n * ((s % 100) + 1)) });
  const numbers = numbersByKey(rows, (row) => row.s);
  const batches = coverBatches([...numbers.keys()], numbers);
  const covered = new Set();
  for (const { group, numbers: list } of batches) {
    assert.ok(group.join(",").length + list.join(",").length < 6000);
    for (const key of group) for (const n of list) covered.add(key + "#" + n);
  }
  for (const row of rows) assert.ok(covered.has(row.s + "#" + row.issue_number));
});

test("one very long run is split, and nothing is an empty read", () => {
  const numbers = new Map([[7, new Set(Array.from({ length: 950 }, (_, i) => String(i + 1)))]]);
  assert.deepEqual(coverBatches([7], numbers).map((b) => b.numbers.length), [400, 400, 150]);
  assert.deepEqual(coverBatches([8], numbers), []);
  assert.deepEqual(coverBatches([], numbers), []);
});
