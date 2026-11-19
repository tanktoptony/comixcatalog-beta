import assert from "node:assert/strict";
import test from "node:test";
import { compareExportItems, fetchInChunks } from "./exportData.js";

function labels(rows) {
  return rows.sort(compareExportItems).map((row) => row.label ?? row.issueNumber);
}

test("sorts numeric issues naturally and non-numeric issues last", () => {
  const make = (issueNumber) => ({ title: "Cerebus", seriesYear: 1977, issueNumber });
  assert.deepEqual(labels([make("207"), make("6"), make("181"), make("0")]), ["0", "6", "181", "207"]);
  assert.deepEqual(labels([make("2"), make("1A"), make("1")]), ["1", "1A", "2"]);
  assert.deepEqual(labels([make("Annual"), make("2")]), ["2", "Annual"]);
});

test("sorts equal titles by series year and then copy number", () => {
  const rows = [
    { title: "Batman", seriesYear: null, issueNumber: "1", copy_number: 1, label: "unknown" },
    { title: "batman", seriesYear: 2016, issueNumber: "1", copy_number: 2, label: "2016 copy 2" },
    { title: "Batman", seriesYear: 1940, issueNumber: "1", copy_number: 1, label: "1940" },
    { title: "Batman", seriesYear: 2016, issueNumber: "1", copy_number: 1, label: "2016 copy 1" },
  ];
  assert.deepEqual(labels(rows), ["1940", "2016 copy 1", "2016 copy 2", "unknown"]);
});

function fakeBuild(allRows, seenChunks) {
  return (ids) => {
    seenChunks.push(ids);
    const matching = allRows.filter((row) => ids.includes(row.lookup_id));
    return {
      order() {
        return {
          range(from, to) {
            return Promise.resolve({ data: matching.slice(from, Math.min(to + 1, from + 1000)), error: null });
          },
        };
      },
    };
  };
}

test("chunked lookups paginate every chunk and never send more than 500 ids", async () => {
  const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
  const rows = Array.from({ length: 2500 }, (_, i) => ({
    id: i + 1,
    lookup_id: (i % ids.length) + 1,
  }));
  const seenChunks = [];
  const result = await fetchInChunks(ids, fakeBuild(rows, seenChunks), "id");
  assert.equal(result.length, 2500);
  assert.deepEqual(seenChunks.map((chunk) => chunk.length), [500, 500, 500, 500, 200]);
  assert.ok(seenChunks.every((chunk) => chunk.length <= 500));
});
