import assert from "node:assert/strict";
import test from "node:test";
import {
  subscriptionProfileUpdate,
  subscriptionEventProfileUpdate,
  validateCheckoutSelection,
  validateMembershipEligibility,
} from "./stripeMembership.js";

const prices = {
  plusMonthlyPriceId: "price_plus_month",
  plusAnnualPriceId: "price_plus_year",
  proPriceId: "price_pro",
  foundingPriceId: "price_founding",
};

function subscription(priceId, status) {
  return { status, items: { data: [{ price: { id: priceId } }] } };
}

test("Collector+ monthly active grants Collector+", () => {
  assert.deepEqual(
    subscriptionProfileUpdate(subscription("price_plus_month", "active"), prices),
    { membership_tier: "collector_plus" }
  );
});

test("Collector+ deletion clears only Collector+", () => {
  const update = subscriptionEventProfileUpdate(
    "customer.subscription.deleted",
    subscription("price_plus_year", "active"),
    prices
  );
  assert.deepEqual(update, { membership_tier: null });
  assert.equal(Object.hasOwn(update, "is_founding_collector"), false);
  assert.equal(Object.hasOwn(update, "is_pro"), false);
});

test("legacy Pro deletion clears Pro but never founding", () => {
  const update = subscriptionEventProfileUpdate(
    "customer.subscription.deleted",
    subscription("price_pro", "active"),
    prices
  );
  assert.deepEqual(update, { is_pro: false });
  assert.equal(Object.hasOwn(update, "is_founding_collector"), false);
});

test("unknown price makes no profile change", () => {
  assert.equal(subscriptionProfileUpdate(subscription("price_other", "active"), prices), null);
});

test("checkout rejects unknown tiers and invalid Collector+ intervals", () => {
  assert.equal(validateCheckoutSelection({ tier: "other", interval: "month" }).status, 400);
  assert.equal(validateCheckoutSelection({ tier: "plus", interval: "week" }).status, 400);
});

test("checkout refuses every existing membership type", () => {
  for (const member of [
    { isPro: true },
    { isFounding: true },
    { membershipTier: "collector_plus" },
    { isAdmin: true },
  ]) {
    assert.deepEqual(validateMembershipEligibility(member), {
      error: "You already have a membership",
      status: 400,
    });
  }
});
