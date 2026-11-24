import assert from "node:assert/strict";
import test from "node:test";
import { suggestVersion } from "./labelEdition.js";

const base = { gcdId: 1, name: "Regular edition", isBase: true };
const on = (...names) => [base, ...names.map((name, index) => ({ gcdId: index + 2, name, isBase: false }))];
const pick = (label, versions, seriesTitle = "", currentGcdId = 1) =>
  suggestVersion(label, versions, { seriesTitle, currentGcdId })?.name ?? null;

// Real labels from members' libraries and the GCD names they mean.
test("the same version worded differently is found", () => {
  assert.equal(pick("Cover B Dan Mora Variant", on("Dan Mora Cardstock Variant Cover", "Jim Lee Cardstock Variant Cover")), "Dan Mora Cardstock Variant Cover");
  assert.equal(pick("1:100 Adam Kubert Virgin Variant", on("Adam Kubert Virgin Art", "Adam Kubert Cover")), "Adam Kubert Virgin Art");
  assert.equal(pick("Cover G Lucio Parrillo Foil Variant", on("Foil Cover G - Lucio Parrillo")), "Foil Cover G - Lucio Parrillo");
  assert.equal(pick("Cover B Xermánico Variant", on("Xermanico Cover")), "Xermanico Cover");
  assert.equal(pick("2nd Printing", on("Second Printing", "Third Printing")), "Second Printing");
});

test("extra words on either side mean no suggestion", () => {
  assert.equal(pick("Kris Anka Variant", on("Kris Anka Design Variant")), null);
  assert.equal(pick("Lee Bermejo Variant", on("InStockTrades.com Lee Bermejo Cover")), null);
  assert.equal(pick("Alex Ross Virgin Variant", on("Alex Ross Cover")), null);
  assert.equal(pick("Patrick Gleason Variant", on("Patrick Gleason Virgin Cover")), null);
});

test("printings and cover letters have to agree", () => {
  assert.equal(pick("Dan Mora Variant", on("Second Printing Dan Mora Cover")), null);
  assert.equal(pick("2nd Printing Dan Mora", on("Third Printing Dan Mora Cover")), null);
  assert.equal(pick("Cover B Frank Cho Variant", on("Cover C - Frank Cho")), null);
});

test("two versions that fit are never guessed between", () => {
  assert.equal(pick("Skottie Young Variant", on("Skottie Young Cover", "Variant Cover Skottie Young")), null);
});

test("a label that says nothing specific gets no suggestion", () => {
  assert.equal(pick("Variant", on("Variant Cover")), null);
  assert.equal(pick("", on("Dan Mora Cover")), null);
  assert.equal(pick("Batman Variant", on("Variant Cover"), "Batman"), null);
});

test("only copies still saved as the regular edition are asked", () => {
  const versions = on("Dan Mora Cover", "Jim Lee Cover");
  assert.equal(pick("Dan Mora Variant", versions, "", 3), null);
  assert.equal(pick("Dan Mora Variant", versions, "", 2), null);
  assert.equal(pick("Regular edition", versions), null);
  assert.equal(suggestVersion("Dan Mora", null, { currentGcdId: 1 }), null);
});
