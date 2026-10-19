import test from "node:test";
import assert from "node:assert/strict";
import { ageSpanLabel, filterSeriesVolumes, heroKeyCovers } from "./seriesPage.js";

test("ageSpanLabel uses the key timeline boundaries", () => {
  assert.equal(ageSpanLabel(1938, 2024), "Golden Age → Modern");
  assert.equal(ageSpanLabel(1956, 1969), "Silver");
  assert.equal(ageSpanLabel(null, null), null);
});

test("filterSeriesVolumes keeps matching US runs and orders by year", () => {
  const rows = [
    { id: "later", title: "Batman", resolved_publisher_cached: "DC", us_market: true, issue_count_cached: 20, year_start_cached: 2011 },
    { id: "short", title: "Batman", resolved_publisher_cached: "DC", us_market: true, issue_count_cached: 4, year_start_cached: 1999 },
    { id: "book", title: "Batman", resolved_publisher_cached: "DC", us_market: true, issue_count_cached: 8, year_start_cached: 2001, publishing_format: "collected edition" },
    { id: "first", title: "BATMAN", resolved_publisher_cached: "dc", us_market: true, issue_count_cached: 100, year_start_cached: 1940 },
    { id: "foreign", title: "Batman", resolved_publisher_cached: "DC", us_market: false, issue_count_cached: 30, year_start_cached: 1970 },
  ];
  assert.deepEqual(filterSeriesVolumes(rows, { title: "Batman", publisher: "DC" }).map((row) => row.id), ["first", "later"]);
});

test("filterSeriesVolumes keeps the current run within the six-row cap", () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    id: String(index), title: "Run", resolved_publisher_cached: "Pub",
    us_market: true, issue_count_cached: 10, year_start_cached: 2000 + index,
  }));
  assert.deepEqual(
    filterSeriesVolumes(rows, { id: "7", title: "Run", publisher: "Pub" }).map((row) => row.id),
    ["0", "1", "2", "3", "4", "7"]
  );
});

test("heroKeyCovers prioritizes tier then issue number without duplicates", () => {
  const keys = [
    { tier: 2, issue_number: "1", cover: "c" },
    { tier: 1, issue_number: "20", cover: "b" },
    { tier: 1, issue_number: "3", cover: "a" },
    { tier: 1, issue_number: "4", cover: "front" },
  ];
  assert.deepEqual(heroKeyCovers(keys, "front"), ["a", "b"]);
});
