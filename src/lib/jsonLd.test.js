// Listing pages embed seller-written condition notes in JSON-LD. These guard
// the stored-XSS fix (audit S1, 2026-10-05).
//
// Run: npm run test:json-ld

import test from "node:test";
import assert from "node:assert/strict";
import { safeJsonLd } from "./jsonLd.js";

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const notes = "</script><script>alert(document.cookie)</script><b>x</b>";

test("seller text cannot close the script tag", () => {
  const out = safeJsonLd({ description: notes });
  assert.equal(out.includes("</script>"), false);
  assert.equal(out.includes("<"), false);
  assert.equal(out.includes(">"), false);
});

test("output still parses to the same data", () => {
  const data = { description: notes, name: "X-Men #1 & more", sep: `a${LS}b${PS}c` };
  assert.deepEqual(JSON.parse(safeJsonLd(data)), data);
});

test("line and paragraph separators are escaped", () => {
  const out = safeJsonLd({ s: `a${LS}b${PS}c` });
  assert.equal(out.includes(LS), false);
  assert.equal(out.includes(PS), false);
});
