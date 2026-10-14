import { test } from "node:test";
import assert from "node:assert/strict";
import { buyerLimitMessage, BUYER_LIMIT_MESSAGES } from "./buyerLimits.js";

test("maps every database buyer-limit code to friendly copy", () => {
  for (const [code, message] of Object.entries(BUYER_LIMIT_MESSAGES)) {
    assert.equal(buyerLimitMessage({ code: "54000", message: `buyer limit: ${code}` }), message);
  }
});

test("ignores unrelated and malformed database errors", () => {
  assert.equal(buyerLimitMessage({ code: "42501", message: "buyer limit: cooldown" }), null);
  assert.equal(buyerLimitMessage({ code: "54000", message: "other failure" }), null);
  assert.equal(buyerLimitMessage(null), null);
});
