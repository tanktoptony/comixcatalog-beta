import test from "node:test";
import assert from "node:assert/strict";
import { runMarketplaceSweep } from "./marketplaceSweep.js";

function dbFor({ expired = [], due = [], dbSweep = {} }) {
  const calls = [];
  return {
    calls,
    from: (table) => table === "orders" ? {
      select: () => ({
        in: () => ({ lt: () => ({ gt: () => ({ order: () => ({ limit: async () => ({ data: expired, error: null }) }) }) }) }),
        eq: (field, value) => ({
          maybeSingle: async () => ({ data: expired.find((order) => order.id === value), error: null }),
          gte: () => ({ lte: () => ({ limit: async () => ({ data: [], error: null }) }) }),
        }),
      }),
    } : table === "order_feedback" ? {
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
    } : {
      select: () => ({
        eq: () => ({ single: async () => ({ data: { stripe_account_id: "acct" }, error: null }) }),
      }),
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      return {
        data: name === "mkt_payout_due" ? due : name === "order_sweep_db" ? dbSweep : name === "mkt_feedback_sweep" ? 0 : null,
        error: null,
      };
    },
  };
}

test("refunded payouts skip and one failed transfer does not stop another", async () => {
  const due = [
    { id: "r", refunded_cents: 1 },
    { id: "a", refunded_cents: 0, seller_id: "s", seller_net_cents: 10, stripe_charge_id: "ch" },
    { id: "b", refunded_cents: 0, seller_id: "s", seller_net_cents: 20, stripe_charge_id: "ch2" },
  ];
  const db = dbFor({ due });
  const seen = [];
  const stripe = {
    transfers: {
      create: async (params) => {
        seen.push(params.metadata.order_id);
        if (params.metadata.order_id === "a") throw new Error("fail");
        return { id: "tr" };
      },
    },
  };
  const summary = await runMarketplaceSweep({ db, stripe, notifyAdmin: async () => {}, log: () => {} });
  assert.deepEqual(seen, ["a", "b"]);
  assert.equal(summary.skippedRefunded, 1);
  assert.equal(summary.transferred, 1);
  assert.equal(summary.errors, 1);
});

test("Stripe session status selects paid, expire-and-cancel, or cancel paths", async () => {
  const orders = [
    { id: "complete", status: "awaiting_payment", stripe_checkout_session_id: "cs_complete", total_cents: 5, currency: "usd", livemode: false },
    { id: "open", status: "awaiting_payment", stripe_checkout_session_id: "cs_open" },
    { id: "expired", status: "awaiting_payment", stripe_checkout_session_id: "cs_expired" },
  ];
  const db = dbFor({ expired: orders });
  const expiredSessions = [];
  const stripe = {
    checkout: {
      sessions: {
        retrieve: async (id) => id === "cs_complete" ? {
          id,
          status: "complete",
          metadata: { order_id: "complete" },
          amount_total: 5,
          currency: "usd",
          payment_status: "paid",
          livemode: false,
          payment_intent: "pi",
        } : { id, status: id === "cs_open" ? "open" : "expired" },
        expire: async (id) => expiredSessions.push(id),
      },
    },
    paymentIntents: { retrieve: async () => ({ id: "pi", latest_charge: "ch" }) },
    refunds: { create: async () => {} },
    transfers: { create: async () => ({ id: "tr" }) },
  };
  const summary = await runMarketplaceSweep({ db, stripe, notifyAdmin: async () => {}, log: () => {} });
  assert.equal(summary.errors, 0);
  assert.deepEqual(expiredSessions, ["cs_open"]);
  assert.ok(db.calls.some((call) => call[0] === "order_transition" && call[1].p_order === "complete" && call[1].p_to === "paid"));
  assert.ok(db.calls.some((call) => call[0] === "order_transition" && call[1].p_order === "open" && call[1].p_to === "cancelled"));
  assert.ok(db.calls.some((call) => call[0] === "order_transition" && call[1].p_order === "expired" && call[1].p_to === "cancelled"));
});

test("database sweep failures contribute to total errors", async () => {
  const summary = await runMarketplaceSweep({
    db: dbFor({ dbSweep: { errors: 2 } }),
    stripe: {},
    notifyAdmin: async () => {},
    log: () => {},
  });
  assert.equal(summary.errors, 2);
});
