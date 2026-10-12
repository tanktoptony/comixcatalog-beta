import { test } from "node:test";
import assert from "node:assert/strict";
import { isUnlinkedForSale, listingCompleteness } from "./listingCompleteness.js";

test("counts seller prices and copy photos, excluding rows without a marketplace listing", () => {
  const rows = [
    { id: "priced", status: "for_sale" },
    { id: "open", status: "for_sale" },
    { id: "local", status: "for_sale" },
    { id: "owned", status: "owned" },
  ];
  const listings = { priced: { price_cents: 2500 }, open: { price_cents: null } };
  const result = listingCompleteness(rows, listings, new Set(["open"]));
  assert.deepEqual(result.needsPrice.map((x) => x.id), ["open"]);
  assert.deepEqual(result.needsPhoto.map((x) => x.id), ["priced"]);
});

test("only for-sale rows without a catalog issue need the marketplace notice", () => {
  assert.equal(isUnlinkedForSale({ status: "for_sale", gcd_issue_id: null }), true);
  assert.equal(isUnlinkedForSale({ status: "for_sale", gcd_issue_id: 42 }), false);
  assert.equal(isUnlinkedForSale({ status: "owned", gcd_issue_id: null }), false);
});
