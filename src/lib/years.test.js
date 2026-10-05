import test from "node:test";
import assert from "node:assert/strict";
import { bestYearFor, parseYear } from "./years.js";

test("parseYear handles every input shape used by the former local helpers", () => {
  const cases = [
    [1963, 1963],
    ["1963", 1963],
    ["March 1963", 1963],
    ["1963-03-00", 1963],
    ["", null],
    [null, null],
    [undefined, null],
    ["garbage", null],
    [1800, 1800],
    [1799, null],
    [2199, 2199],
    [2200, null],
    [1963.5, null],
  ];

  for (const [input, expected] of cases) {
    assert.equal(parseYear(input), expected, String(input));
  }
});

test("bestYearFor prefers publication_date and falls back to key_date", () => {
  const cases = [
    [{ publication_date: "March 1963", key_date: "1963-03-00" }, 1963],
    [{ publication_date: "", key_date: "1963-03-00" }, 1963],
    [{ publication_date: null, key_date: 1963 }, 1963],
    [{ publication_date: "garbage", key_date: undefined }, null],
    [null, null],
  ];

  for (const [row, expected] of cases) {
    assert.equal(bestYearFor(row), expected);
  }
});
