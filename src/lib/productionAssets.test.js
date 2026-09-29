import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRequestLines, sniffImage, assetBaseName, uniqueFilename, titleKey } from "./productionAssets.js";

test("parses title, issue and year hints, inheriting years per title", () => {
  const rows = parseRequestLines(`
Uncanny X-Men #1 (1963)
Uncanny X-Men #129
X-Men #14 (1991 series)
X-Men #15
House of M #1
not a request
`);
  assert.deepEqual(
    rows.map((r) => [r.title, r.issue, r.year, r.yearSource]),
    [
      ["Uncanny X-Men", "1", 1963, "explicit"],
      ["Uncanny X-Men", "129", 1963, "inherited"],
      ["X-Men", "14", 1991, "explicit"],
      ["X-Men", "15", 1991, "inherited"],
      ["House of M", "1", null, null],
      [null, null, null, null],
    ]
  );
  assert.ok(rows[5].error);
});

test("a year on one title never leaks onto a different title", () => {
  const rows = parseRequestLines("X-Men #1 (1991)\nUncanny X-Men #1");
  assert.equal(rows[1].year, null);
});

test("titleKey ignores a leading article and punctuation", () => {
  assert.equal(titleKey("The X-Men"), titleKey("X-Men"));
  assert.notEqual(titleKey("Uncanny X-Men"), titleKey("X-Men"));
});

test("sniffImage trusts bytes, not labels", () => {
  assert.deepEqual(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), { mime: "image/jpeg", ext: "jpg" });
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).ext, "png");
  assert.equal(sniffImage(new TextEncoder().encode("<!DOCTYPE html>")), null);
  assert.equal(sniffImage(new TextEncoder().encode('{"error":"x"}')), null);
  assert.equal(sniffImage(new Uint8Array([])), null);
});

test("asset names are stable and collision-safe", () => {
  assert.equal(assetBaseName({ seriesTitle: "The Uncanny X-Men", issueNumber: "141", year: 1981 }), "uncanny-x-men-141-1981");
  assert.equal(assetBaseName({ seriesTitle: "X-Men", issueNumber: "1", year: null }), "x-men-001");
  const used = new Set();
  assert.equal(uniqueFilename("x-men-001", "jpg", used), "x-men-001.jpg");
  assert.equal(uniqueFilename("x-men-001", "jpg", used), "x-men-001-2.jpg");
});
