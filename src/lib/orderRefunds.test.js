import assert from "node:assert/strict";
import test from "node:test";
import { RefundPersistenceError, refundOrder } from "./orderRefunds.js";

function setup({ transferred = false, dbError = null } = {}) {
  const calls = [];
  const stripe = {
    refunds: { create: async (args, options) => { calls.push(["refund", args, options]); return { id: "re_1" }; } },
    transfers: { createReversal: async (...args) => { calls.push(["reversal", ...args]); return { id: "trr_1" }; } },
  };
  const db = { rpc: async (name, args) => { calls.push(["rpc", name, args]); return { data: { status: "refunded" }, error: dbError }; } };
  const order = { id: "order-1", total_cents: 1000, refunded_cents: 100, seller_net_cents: 800, stripe_payment_intent_id: "pi_1", stripe_transfer_id: transferred ? "tr_1" : null };
  return { calls, stripe, db, order };
}

test("refund bounds are rejected before Stripe", async () => {
  const value = setup();
  await assert.rejects(() => refundOrder({ ...value, amountCents: 0, reason: "reason", actorId: null, actorRole: "admin", notifyAdmin: async () => {} }), RangeError);
  await assert.rejects(() => refundOrder({ ...value, amountCents: 901, reason: "reason", actorId: null, actorRole: "admin", notifyAdmin: async () => {} }), RangeError);
  assert.equal(value.calls.length, 0);
});

test("reversal happens only after transfer and keys are stable", async () => {
  const first = setup({ transferred: true });
  await refundOrder({ ...first, amountCents: 200, reason: "Admin reason", actorId: null, actorRole: "admin", notifyAdmin: async () => {} });
  assert.equal(first.calls[0][2].idempotencyKey, "refund-order-1-100-200");
  assert.equal(first.calls[1][3].idempotencyKey, "refund-order-1-100-200-reversal");
  const second = setup();
  await refundOrder({ ...second, amountCents: 200, reason: "Admin reason", actorId: null, actorRole: "admin", notifyAdmin: async () => {} });
  assert.equal(second.calls.some(([kind]) => kind === "reversal"), false);
  assert.equal(second.calls[0][2].idempotencyKey, first.calls[0][2].idempotencyKey);
});

test("database failure after Stripe alerts and throws a typed error", async () => {
  const value = setup({ dbError: new Error("db down") });
  const notices = [];
  await assert.rejects(() => refundOrder({ ...value, amountCents: 200, reason: "Admin reason", actorId: null, actorRole: "admin", notifyAdmin: async (text) => notices.push(text) }), RefundPersistenceError);
  assert.equal(notices.length, 1);
});
