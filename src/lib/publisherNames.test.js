import test from "node:test";
import assert from "node:assert/strict";
import { canonicalPublisher } from "./publisherNames.js";

test("short and differently cased names map to the catalog spelling", () => {
  const cases = [
    ["DC", "DC Comics"],
    ["DC Comics ", "DC Comics"],
    ["Marvel", "Marvel Comics"],
    ["image", "Image Comics"],
    ["Boom ", "BOOM! Studios"],
    ["Boom Studios", "BOOM! Studios"],
    ["IDW", "IDW Publishing"],
    ["Mirage", "Mirage Studios"],
  ];
  for (const [input, expected] of cases) assert.equal(canonicalPublisher(input), expected, input);
});

test("other names keep their spelling, tidied", () => {
  assert.equal(canonicalPublisher("  Jason S.  Abrams "), "Jason S. Abrams");
  assert.equal(canonicalPublisher("DC Black Label"), "DC Black Label");
  assert.equal(canonicalPublisher("Vertigo"), "Vertigo");
  assert.equal(canonicalPublisher(null), "");
});
