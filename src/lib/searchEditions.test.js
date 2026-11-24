import test from "node:test";
import assert from "node:assert/strict";
import { baseEditions } from "./searchEditions.js";

const ids = (rows) => rows.map((r) => r.gcd_id);

test("Saga #1's other printings drop when the 1st printing is in the results", () => {
  const rows = [
    { gcd_id: 911609, issue_number: "1", variant_of_gcd_id: null },
    { gcd_id: 936528, issue_number: "2", variant_of_gcd_id: null },
    { gcd_id: 940950, issue_number: "1", variant_of_gcd_id: 911609 },
    { gcd_id: 941015, issue_number: "1", variant_of_gcd_id: "911609" },
  ];
  assert.deepEqual(ids(baseEditions(rows)), [911609, 936528]);
});

test("a variant whose base isn't in the results stays", () => {
  const rows = [{ gcd_id: 940950, variant_of_gcd_id: 911609 }];
  assert.deepEqual(ids(baseEditions(rows)), [940950]);
});

test("rows with no variant link are untouched, and the order holds", () => {
  const rows = [
    { gcd_id: 3, variant_of_gcd_id: null },
    { gcd_id: 1 },
    { gcd_id: 2, variant_of_gcd_id: undefined },
  ];
  assert.deepEqual(ids(baseEditions(rows)), [3, 1, 2]);
});
