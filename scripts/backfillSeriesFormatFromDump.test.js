import test from "node:test";
import assert from "node:assert/strict";
import { planSeriesFormatUpdates } from "./backfillSeriesFormatFromDump.js";

test("plans only changed mirrored series and normalizes empty values", () => {
  const formats = new Map([
    [1, { publishing_format: " collected edition ", binding: " ", notes: " Collects #1-4 ", publication_type: " book " }],
    [2, { publishing_format: "ongoing series", binding: null, notes: null, publication_type: "magazine" }],
  ]);
  const plan = planSeriesFormatUpdates([
    { gcd_id: 1, publishing_format: null, binding: "old", format_notes: null, publication_type: null },
    { gcd_id: 2, publishing_format: "ongoing series", binding: null, format_notes: null, publication_type: "magazine" },
    { gcd_id: 3, publishing_format: null, binding: null, format_notes: null, publication_type: null },
  ], formats);
  assert.deepEqual(plan, {
    updates: [{ gcd_id: 1, publishing_format: "collected edition", binding: null, format_notes: "Collects #1-4", publication_type: "book" }],
    changed: 1,
    unchanged: 1,
    missingInDump: 1,
  });
});
