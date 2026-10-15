import test from "node:test";
import assert from "node:assert/strict";
import { NORMALIZE_EMAIL_TEST_VECTORS, normalizeEmail } from "./normalizeEmail.js";

test("normalizes the shared founding-inbox vectors", () => {
  for (const { input, expected } of NORMALIZE_EMAIL_TEST_VECTORS) {
    assert.equal(normalizeEmail(input), expected, input);
  }
});
