import assert from "node:assert/strict";
import test from "node:test";
import { publicCounts } from "./publicCounts.js";

test("publicCounts suppresses counts below the privacy threshold", () => {
  assert.deepEqual(publicCounts({ have: 4, want: 2, for_sale: 3, updated_at: "today" }), {
    have: 4, want: null, for_sale: 3, updated_at: "today",
  });
});

test("publicCounts returns null when no count is public", () => {
  assert.equal(publicCounts({ have: 2, want: 0, for_sale: 1 }), null);
  assert.equal(publicCounts(null), null);
});
