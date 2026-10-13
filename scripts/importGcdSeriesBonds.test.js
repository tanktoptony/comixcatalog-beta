import assert from "node:assert/strict";
import test from "node:test";

import { mapGcdSeriesBonds } from "./importGcdSeriesBonds.js";

test("maps supported bond types and filters subnumbering and merge", () => {
  const existing = new Set([1, 2, 3, 4]);
  const rows = [
    { origin_id: 1, target_id: 2, bond_type: "minor_name_numbering_continues", notes: " renamed " },
    { origin_id: 1, target_id: 3, bond_type: "subnumbering_continues", notes: "" },
    { origin_id: 2, target_id: 3, bond_type: "merge", notes: null },
    { origin_id: 3, target_id: 4, bond_type: "reboot", notes: null },
  ];
  const mapped = mapGcdSeriesBonds(rows, existing);
  assert.deepEqual(mapped.map((row) => row.gcd_bond_type), ["minor_name_numbering_continues", "reboot"]);
  assert.equal(mapped[0].note, "renamed");
});

test("skips a bond when either endpoint is absent from the catalog", () => {
  const rows = [{ origin_id: 1, target_id: 2, bond_type: "major_name_numbering_continues", notes: "" }];
  assert.deepEqual(mapGcdSeriesBonds(rows, new Set([1])), []);
});
