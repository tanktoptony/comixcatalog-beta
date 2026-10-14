import { test } from "node:test";
import assert from "node:assert/strict";
import { SELLER_BLOCK_MESSAGES, sellerBlockMessage, sellerStatusSummary } from "./sellerStanding.js";

test("every stable block code has seller copy", () => {
  for (const code of Object.keys(SELLER_BLOCK_MESSAGES)) assert.equal(typeof sellerBlockMessage(code), "string");
  assert.equal(sellerBlockMessage(null), "Buyers can check out on this one.");
});

test("seller status covers each state", () => {
  assert.equal(sellerStatusSummary(null).state, "not_started");
  assert.equal(sellerStatusSummary({ tier: "new", charges_enabled: false }).state, "pending");
  assert.equal(sellerStatusSummary({ tier: "limited" }).state, "restricted");
  assert.equal(sellerStatusSummary({ tier: "new", charges_enabled: true, details_submitted: true, payouts_enabled: true }).state, "ready");
});
