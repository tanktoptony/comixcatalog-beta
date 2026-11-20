import { test } from "node:test";
import assert from "node:assert/strict";
import { communityLine, discountLabel, guideDiscount, guideGradeLabel, isUnderGuide, totalWithShipping } from "./marketplaceDeals.js";

test("guide discounts require a price and positive guide", () => {
  assert.ok(Math.abs(guideDiscount({ price: 71, guide: { value: 100 } }) - 0.29) < Number.EPSILON);
  assert.equal(guideDiscount({ price: null, guide: { value: 100 } }), null);
  assert.equal(guideDiscount({ price: 10, guide: { value: 0 } }), null);
});

test("under-guide threshold and label", () => {
  assert.equal(isUnderGuide({ price: 95, guide: { value: 100 } }), true);
  assert.equal(isUnderGuide({ price: 96, guide: { value: 100 } }), false);
  assert.equal(discountLabel({ price: 71, guide: { value: 100 } }), "29% under guide");
});

test("total requires known price and shipping", () => {
  assert.equal(totalWithShipping({ price: 20, shipping: 5 }), 25);
  assert.equal(totalWithShipping({ price: 20, shipping: null }), null);
});

test("community line shows only counts publicCounts kept", () => {
  assert.equal(communityLine({ have: 14, want: 3 }), "14 collectors have it · 3 want it");
  assert.equal(communityLine({ have: 1200, want: null }), "1,200 collectors have it");
  assert.equal(communityLine({ have: null, want: null }), null);
  assert.equal(communityLine(null), null);
});

test("guide grade label", () => {
  assert.equal(guideGradeLabel("ungraded"), "raw");
  assert.equal(guideGradeLabel(null), "raw");
  assert.equal(guideGradeLabel("9.4"), "9.4");
});
