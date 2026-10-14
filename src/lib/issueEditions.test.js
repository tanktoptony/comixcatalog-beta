import test from "node:test";
import assert from "node:assert/strict";
import { buildVersionRows, orderReprintsUsFirst, redirectForEdition, resolveEditionRow } from "./issueEditions.js";

test("edition resolution falls back to the requested issue when columns are missing or null", () => {
  assert.deepEqual(resolveEditionRow({ gcd_id: 44, hasEditionColumns: false }, 44), { baseGcdId: 44, editionGcdId: 44, hasEditionColumns: false });
  assert.deepEqual(resolveEditionRow({ gcd_id: 44, base_gcd_issue_id: null, hasEditionColumns: true }, 44), { baseGcdId: 44, editionGcdId: 44, hasEditionColumns: true });
});

test("redirect decision only redirects a variant with a known, different base", () => {
  assert.equal(redirectForEdition({ requestedGcdId: 2, baseGcdId: 1, editionGcdId: 2, hasEditionColumns: true }), "/issue/gcd-1?edition=2");
  assert.equal(redirectForEdition({ requestedGcdId: 1, baseGcdId: 1, editionGcdId: 1, hasEditionColumns: true }), null);
  assert.equal(redirectForEdition({ requestedGcdId: 2, baseGcdId: 2, editionGcdId: 2, hasEditionColumns: false }), null);
});

test("versions sort the base first and variants by on-sale date", () => {
  const rows = buildVersionRows([
    { gcd_id: 3, variant_name: "Late", details: { on_sale_date: "2000-03-01" } },
    { gcd_id: 1, details: { on_sale_date: "2000-02-01" } },
    { gcd_id: 2, variant_name: "Early", details: { on_sale_date: "2000-01-01" } },
  ], 1);
  assert.deepEqual(rows.map((row) => row.gcdId), [1, 2, 3]);
});

test("reprints put US editions first", () => {
  const rows = orderReprintsUsFirst([{ countryCode: "CA", year: 2020 }, { countryCode: "US", year: 1990 }, { countryCode: "US", year: 2024 }]);
  assert.deepEqual(rows.map((row) => `${row.countryCode}-${row.year}`), ["US-2024", "US-1990", "CA-2020"]);
});
