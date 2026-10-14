import assert from "node:assert/strict";
import test from "node:test";
import { pinCurrentRun } from "./searchCurrentRun.js";

const row = (title, start, end) => ({ title, year_start_cached: start, year_end_cached: end });
const exact = (r) => r.title === "Batman";

test("moves the newest ongoing exact match to second place", () => {
  const rows = [row("Batman", 1940, 2011), row("Batman", 2016, 2025), row("Batman", 2011, 2016), row("Batman", 2025, null)];
  assert.deepEqual(pinCurrentRun(rows, exact, 2026).map((r) => r.year_start_cached), [1940, 2025, 2016, 2011]);
});

test("leaves order alone when the top result is not an exact match", () => {
  const rows = [row("Batman Adventures", 1992, 1994), row("Batman", 1940, 2011), row("Batman", 2025, null)];
  assert.equal(pinCurrentRun(rows, exact, 2026), rows);
});

test("leaves order alone when no exact match is still running", () => {
  const rows = [row("Batman", 1940, 2011), row("Batman", 2016, 2020), row("Batman", 2011, 2016)];
  assert.equal(pinCurrentRun(rows, exact, 2026), rows);
});

test("ignores non-matching titles when choosing the current run", () => {
  const rows = [row("Batman", 1940, 2011), row("Batman", 2011, 2016), row("Batman Beyond", 2024, null)];
  assert.equal(pinCurrentRun(rows, exact, 2026), rows);
});
