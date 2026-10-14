import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutMode, canUseCheckout } from "./marketplaceFlags.js";

test("checkout mode defaults and validates", () => {
  assert.equal(checkoutMode(), "off");
  assert.equal(checkoutMode("ALLOWLIST"), "allowlist");
  assert.equal(checkoutMode("on"), "on");
  assert.equal(checkoutMode("maybe"), "off");
});

test("checkout access honors on and the trimmed allowlist", () => {
  assert.equal(canUseCheckout("a", { MARKETPLACE_CHECKOUT: "on" }), true);
  assert.equal(canUseCheckout("a", { MARKETPLACE_CHECKOUT: "off", MARKETPLACE_CHECKOUT_ALLOWLIST: "a" }), false);
  assert.equal(canUseCheckout("b", { MARKETPLACE_CHECKOUT: "allowlist", MARKETPLACE_CHECKOUT_ALLOWLIST: "a, b ,c" }), true);
  assert.equal(canUseCheckout("z", { MARKETPLACE_CHECKOUT: "allowlist", MARKETPLACE_CHECKOUT_ALLOWLIST: "a,b" }), false);
});
