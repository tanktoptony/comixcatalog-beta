import assert from "node:assert/strict";
import test from "node:test";

import { catalogBarcodeRow } from "./gcdBarcodes.js";

test("maps a GCD barcode to an accepted catalog printing and keeps its add-on", () => {
  assert.deepEqual(catalogBarcodeRow(123, "7 59606 08312 1 00111"), {
    gcd_issue_id: 123,
    upc: "75960608312100111",
    submitted_by: null,
    status: "accepted",
  });
});

test("rejects a barcode whose base has an invalid check digit", () => {
  assert.equal(catalogBarcodeRow(123, "75960608312200111"), null);
});

test("keeps a valid two digit add-on from an older comic barcode", () => {
  assert.equal(catalogBarcodeRow(123, "07148602458312")?.upc, "07148602458312");
});

test("rejects missing and invalid GCD issue ids", () => {
  assert.equal(catalogBarcodeRow(null, "759606083121"), null);
  assert.equal(catalogBarcodeRow(-1, "759606083121"), null);
});
