import { test } from "node:test";
import assert from "node:assert/strict";
import { toCents, validateListingEdit } from "./listingEdit.js";

test("dollar strings become cents", () => {
  assert.equal(toCents("25"), 2500);
  assert.equal(toCents("$1,250.50"), 125050);
  assert.equal(toCents(4.5), 450);
  assert.equal(toCents(""), null);
  assert.equal(toCents(null), null);
  assert.ok(Number.isNaN(toCents("twenty")));
  assert.ok(Number.isNaN(toCents("1.999")));
  assert.ok(Number.isNaN(toCents("-5")));
});

test("a full edit passes and only known fields go through", () => {
  const r = validateListingEdit({ price: "40", shipping: "5", acceptsOffers: true, conditionNotes: "  Light spine stress.  ", signed: true, seller_id: "x", status: "sold" });
  assert.deepEqual(r.patch, { price_cents: 4000, shipping_cents: 500, accepts_offers: true, signed: true, condition_notes: "Light spine stress." });
});

test("limits match the table's checks", () => {
  assert.match(validateListingEdit({ price: "0.50" }).error, /between \$1/);
  assert.match(validateListingEdit({ price: "100000.01" }).error, /between/);
  assert.equal(validateListingEdit({ price: "100000" }).patch.price_cents, 10000000);
  assert.match(validateListingEdit({ shipping: "1000.01" }).error, /more than/);
  assert.equal(validateListingEdit({ shipping: "0" }).patch.shipping_cents, 0);
  assert.match(validateListingEdit({ conditionNotes: "x".repeat(2001) }).error, /2,000/);
  assert.match(validateListingEdit({ price: "abc" }).error, /dollar amount/);
});

test("clearing a price is fine, unless offers are off too", () => {
  assert.equal(validateListingEdit({ price: "" }).patch.price_cents, null);
  assert.match(validateListingEdit({ price: "", acceptsOffers: false }).error, /make an offer/);
  assert.equal(validateListingEdit({ price: "30", acceptsOffers: false }).patch.accepts_offers, false);
  assert.equal(validateListingEdit({ conditionNotes: "   " }).patch.condition_notes, null);
  assert.match(validateListingEdit({}).error, /Nothing/);
  assert.match(validateListingEdit(null).error, /Nothing/);
});
