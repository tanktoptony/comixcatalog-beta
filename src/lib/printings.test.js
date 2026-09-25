// Barcodes in the shape a comic actually carries.
//
// BASE is a 12-digit UPC-A. Count the digits before trusting a fixture: the
// first draft of these tests used an 11-digit base, every parse returned
// null, and five tests failed for a reason that had nothing to do with the
// code under test.

import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUpc, isValidUpc, parseUpc, upcProblem, describeSubmission } from "./printings.js";

const BASE = "759606083120"; // 12 digits
const EAN = "9771234567896"; // 13 digits

test("the fixtures are the lengths they claim to be", () => {
  // The bug that broke the first draft of this file, asserted so it cannot
  // come back silently.
  assert.equal(BASE.length, 12);
  assert.equal(EAN.length, 13);
});

test("a barcode typed with spaces or dashes is the same barcode", () => {
  assert.equal(normalizeUpc("7 59606 08312 0"), BASE);
  assert.equal(normalizeUpc("759606-08312-0"), BASE);
  assert.equal(normalizeUpc("  759606083120  "), BASE);
  assert.equal(normalizeUpc(null), "");
  assert.equal(normalizeUpc(undefined), "");
});

test("the four lengths a comic actually carries are accepted", () => {
  assert.ok(isValidUpc(BASE), "12, UPC-A");
  assert.ok(isValidUpc(EAN), "13, EAN-13");
  assert.ok(isValidUpc(BASE + "00111"), "17, UPC-A plus supplement");
  assert.ok(isValidUpc(EAN + "00111"), "18, EAN-13 plus supplement");
});

test("a length no comic carries is refused rather than stored", () => {
  // Storing a typo in the one field meant to be exact defeats the field.
  assert.ok(!isValidUpc("75960608"), "8");
  assert.ok(!isValidUpc(BASE + "001"), "15");
  assert.ok(!isValidUpc(BASE + BASE), "24, a doubled scan");
  assert.ok(!isValidUpc(""));
});

test("13 digits is a real EAN-13, not a broken UPC", () => {
  // There is no way to tell a legitimate European printing from a truncated
  // 17. It is accepted, because refusing real barcodes is the worse error.
  assert.ok(isValidUpc(EAN));
  assert.equal(upcProblem(EAN), null);
});

test("a full barcode splits into base and supplement", () => {
  const parsed = parseUpc(BASE + " 00111");
  assert.equal(parsed.digits.length, 17);
  assert.equal(parsed.base, BASE);
  assert.equal(parsed.supplement, "00111");
  assert.equal(parsed.hasSupplement, true);
});

test("the supplement is kept whole and never decoded into an issue number", () => {
  // Published accounts of which digit means what disagree across publishers
  // and eras. Reporting "issue 30" from a slice would invent a fact about
  // someone's book, so the parser exposes no such field.
  const parsed = parseUpc(BASE + "30011");
  assert.equal(parsed.supplement, "30011");
  assert.equal(parsed.issueNumber, undefined);
  assert.equal(parsed.variantCode, undefined);
});

test("a barcode with no supplement reports none instead of guessing", () => {
  const parsed = parseUpc(BASE);
  assert.equal(parsed.supplement, null);
  assert.equal(parsed.hasSupplement, false);
  assert.equal(parsed.base, BASE);
});

test("an all-zero supplement is a printer placeholder, not data", () => {
  const parsed = parseUpc(BASE + "00000");
  assert.equal(parsed.supplement, "00000");
  assert.equal(parsed.hasSupplement, false);
});

test("an unparseable barcode is null, never a half-filled object", () => {
  assert.equal(parseUpc("abc"), null);
  assert.equal(parseUpc(""), null);
  assert.equal(parseUpc(null), null);
});

test("two covers of one issue share a base and differ in supplement", () => {
  // This is the whole point of keeping the supplement: it makes a
  // near-duplicate legible as a different printing rather than a mistake.
  const a = parseUpc(BASE + "00111");
  const b = parseUpc(BASE + "00121");
  assert.equal(a.base, b.base);
  assert.notEqual(a.supplement, b.supplement);
});

test("an empty field is not an error, because the barcode is optional", () => {
  assert.equal(upcProblem(""), null);
  assert.equal(upcProblem(null), null);
  assert.equal(upcProblem(BASE), null);
});

test("a wrong length says how many digits it got and what to do", () => {
  const short = upcProblem("7596");
  assert.match(short, /4 digits/);
  assert.match(short, /12 or 13/);

  const long = upcProblem(BASE + BASE);
  assert.match(long, /24 digits/);
  assert.match(long, /doubled scan/);

  const between = upcProblem(BASE + "001");
  assert.match(between, /15 digits/);
  assert.match(between, /Include either/);
});

test("a report with neither a name nor a barcode describes as nothing", () => {
  assert.equal(describeSubmission({}), null);
  assert.equal(describeSubmission({ printingName: "   ", upc: "" }), null);
});

test("a report describes itself with whichever halves it has", () => {
  assert.equal(describeSubmission({ printingName: "Newsstand" }), "Newsstand");
  assert.equal(describeSubmission({ upc: BASE }), BASE);
  assert.equal(
    describeSubmission({ printingName: "Cover B", upc: "7 59606 08312 0" }),
    `Cover B (${BASE})`
  );
});
