import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, computeOrderAmounts, FEE_CONFIG, ORDER_STATUSES, TRANSITIONS } from "./orders.js";

const ROLES = ["buyer", "seller", "admin", "system", "stripe"];

test("allowed transitions and only allowed transitions pass", () => {
  for (const edge of TRANSITIONS) {
    for (const role of edge.roles) assert.equal(canTransition(edge.from, edge.to, role), true);
  }
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      for (const role of ROLES) {
        const expected = TRANSITIONS.some((edge) => edge.from === from && edge.to === to && edge.roles.includes(role));
        assert.equal(canTransition(from, to, role), expected, `${from} -> ${to} for ${role}`);
      }
    }
  }
});

test("party roles cannot perform authority-only transitions", () => {
  for (const to of ["delivered", "completed", "paid"]) {
    for (const from of ORDER_STATUSES) assert.equal(canTransition(from, to, "seller"), false);
  }
  for (const to of ["shipped", "paid"]) {
    for (const from of ORDER_STATUSES) assert.equal(canTransition(from, to, "buyer"), false);
  }
  for (const from of ORDER_STATUSES) {
    for (const role of ROLES.filter((role) => role !== "stripe")) assert.equal(canTransition(from, "paid", role), false);
  }
});

test("fee math uses integer cents", () => {
  assert.deepEqual(computeOrderAmounts({ priceCents: 100, shippingCents: 0 }), {
    item: 100, shipping: 0, tax: 0, total: 100, platformFee: 0, processingFee: 33, sellerNet: 67,
  });
  assert.deepEqual(computeOrderAmounts({ priceCents: 4999, shippingCents: 500 }), {
    item: 4999, shipping: 500, tax: 0, total: 5499, platformFee: 0, processingFee: 189, sellerNet: 5310,
  });
  assert.deepEqual(computeOrderAmounts({ priceCents: 10000000, shippingCents: 0 }), {
    item: 10000000, shipping: 0, tax: 0, total: 10000000, platformFee: 0, processingFee: 290030, sellerNet: 9709970,
  });
  for (let price = 100; price <= 10000000; price += 9973) {
    assert.ok(computeOrderAmounts({ priceCents: price, shippingCents: 0 }).sellerNet >= 0);
  }
});

test("SQL transition and fee constants stay in parity with JS", () => {
  const ordersSql = readFileSync(new URL("../../scripts/migrations/0066_marketplace_orders.sql", import.meta.url), "utf8");
  const feeSql = readFileSync(new URL("../../scripts/migrations/0070_stripe_events_payouts.sql", import.meta.url), "utf8");
  const block = ordersSql.match(/-- TRANSITION_VALUES_BEGIN([\s\S]*?)-- TRANSITION_VALUES_END/)[1];
  const grouped = new Map();
  for (const match of block.matchAll(/\('([^']+)','([^']+)','([^']+)'\)/g)) {
    const key = `${match[1]}|${match[2]}`;
    if (!grouped.has(key)) grouped.set(key, { from: match[1], to: match[2], roles: [] });
    grouped.get(key).roles.push(match[3]);
  }
  const sqlTransitions = [...grouped.values()];
  assert.deepEqual(sqlTransitions, TRANSITIONS);
  const config = feeSql.match(/select '(\{"platform_fee_bps"[^']+\})'::jsonb/)[1];
  assert.deepEqual(JSON.parse(config), FEE_CONFIG);
});
