import test from "node:test";
import assert from "node:assert/strict";
import { buildCheckoutSessionParams, verifyPaidSession } from "./checkoutSession.js";

const order = {
  id: "order",
  listing_id: "listing",
  series_title: "Batman",
  issue_number: "1",
  condition: "NM",
  item_cents: 1000,
  shipping_cents: 250,
  total_cents: 1250,
  currency: "usd",
  livemode: false,
  checkout_expires_at: "2030-01-01T00:35:00.000Z",
  stripe_checkout_session_id: "cs_1",
  cover_path: "https://img.test/a.jpg",
  tampered_amount: 1,
};

test("checkout params are an order-only allowlist with a shorter Stripe expiry", () => {
  const now = Date.parse("2030-01-01T00:00:00.000Z");
  const params = buildCheckoutSessionParams(order, { siteUrl: "https://test", now });
  assert.equal(params.line_items[0].price_data.unit_amount, 1000);
  assert.equal(params.line_items[1].price_data.product_data.name, "Shipping");
  assert.equal(JSON.stringify(params).includes("tampered"), false);
  assert.equal(params.expires_at, Math.floor(now / 1000) + 31 * 60);
  assert.ok(params.expires_at < Date.parse(order.checkout_expires_at) / 1000);
  assert.equal(params.payment_intent_data.transfer_group, "order");
});

test("shipping is omitted at zero", () => {
  const params = buildCheckoutSessionParams(
    { ...order, shipping_cents: 0 },
    { siteUrl: "https://test", now: 1000 },
  );
  assert.equal(params.line_items.length, 1);
  assert.equal(params.expires_at, 1861);
});

test("paid session verifier rejects every mismatch", () => {
  const session = {
    id: "cs_1",
    metadata: { order_id: "order" },
    amount_total: 1250,
    currency: "usd",
    payment_status: "paid",
    livemode: false,
  };
  assert.equal(verifyPaidSession(session, order).ok, true);
  for (const [key, value] of [
    ["id", "bad"],
    ["amount_total", 3],
    ["currency", "eur"],
    ["payment_status", "unpaid"],
    ["livemode", true],
  ]) {
    assert.equal(verifyPaidSession({ ...session, [key]: value }, order).ok, false);
  }
  assert.equal(verifyPaidSession({ ...session, metadata: { order_id: "bad" } }, order).ok, false);
});
