import { test } from "node:test";
import assert from "node:assert/strict";
import { formatValue, listingName, listingNumber, offerHref, shippingLabel } from "./marketplaceFormat.js";
import { collectedTag } from "./seriesFormat.js";

test("prices show to the cent", () => {
  assert.equal(formatValue(4.05), "$4.05");
  assert.equal(formatValue(4), "$4.00");
  assert.equal(formatValue(1234.5), "$1,234.50");
  assert.equal(formatValue(null), null);
});

test("shipping label keeps unset apart from free", () => {
  assert.equal(shippingLabel({ shipping: null }), null);
  assert.equal(shippingLabel({ shipping: 0 }), "Free shipping");
  assert.equal(shippingLabel({ shipping: 5 }), "+ $5.00 shipping");
});

test("trades read as volumes, comics keep their number", () => {
  const trade = { title: "The Wicked + The Divine", issueNumber: "4", format: "TPB" };
  assert.equal(listingName(trade), "The Wicked + The Divine Vol. 4 TPB");
  assert.equal(listingNumber({ ...trade, format: null }), "#4");
  assert.equal(listingNumber({ ...trade, issueNumber: "[nn]" }), "TPB");
  assert.equal(listingNumber({ ...trade, issueNumber: "[nn]", format: null }), "");
  assert.equal(listingNumber({ title: "Saga Omnibus", issueNumber: "1", format: "Omnibus" }), "Vol. 1");
  assert.equal(listingNumber({ ...trade, issueNumber: "1 - The Book of Certain Doom" }), "Vol. 1 TPB");
  assert.equal(listingNumber({ title: "X", issueNumber: "1/2", format: "HC" }), "#1/2 HC");
  assert.match(decodeURIComponent(offerHref({ ...trade, seller: "t", year: 2016 })), /Vol\. 4 TPB \(2016\)/);
});

test("only collected editions get a tag", () => {
  assert.equal(collectedTag({ name: "The Wicked + The Divine", publishing_format: "collected edition", binding: "trade paperback" }), "TPB");
  assert.equal(collectedTag({ name: "Absolute Batman", publishing_format: "ongoing series", binding: "saddle-stitched" }), null);
  assert.equal(collectedTag({ name: "Amory Wars", publishing_format: "limited series" }), null);
  assert.equal(collectedTag({}), null);
});
