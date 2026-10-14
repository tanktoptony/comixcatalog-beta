import test from "node:test";
import assert from "node:assert/strict";
import { handleMarketplaceEvent } from "./marketplaceWebhook.js";

function fake(initialOrder, { transitionError } = {}) {
  const calls = [];
  const order = { ...initialOrder };
  return {
    calls,
    order,
    db: {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: table === "orders" ? order : { user_id: "seller" },
              error: null,
            }),
          }),
        }),
      }),
      rpc: async (name, args) => {
        calls.push([name, args]);
        if (name === "order_transition") {
          if (args.p_to === "paid" && transitionError) return { data: null, error: transitionError };
          order.status = args.p_to;
        }
        return { data: null, error: null };
      },
    },
    stripe: {
      refunds: { create: async (...args) => calls.push(["refund", ...args]) },
      paymentIntents: { retrieve: async () => ({ id: "pi", latest_charge: { id: "ch" } }) },
      accounts: {
        retrieve: async () => ({
          id: "acct",
          livemode: false,
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          requirements: { currently_due: [] },
        }),
      },
    },
    notifyAdmin: async (message) => calls.push(["notify", message]),
  };
}

const session = {
  id: "cs",
  metadata: { kind: "marketplace_order", order_id: "o" },
  amount_total: 100,
  currency: "usd",
  payment_status: "paid",
  livemode: false,
  payment_intent: "pi",
};
const base = {
  id: "o",
  status: "awaiting_payment",
  stripe_checkout_session_id: "cs",
  total_cents: 100,
  currency: "usd",
  livemode: false,
};

test("mismatch refunds, settles, alerts once, and replay is a no-op", async () => {
  const deps = fake(base);
  const event = {
    id: "evt",
    type: "checkout.session.completed",
    data: { object: { ...session, amount_total: 101 } },
  };
  await handleMarketplaceEvent(event, deps);
  assert.deepEqual(
    deps.calls.filter((call) => call[0] === "order_transition").map((call) => call[1].p_to),
    ["cancelled", "refunded"],
  );
  assert.equal(deps.calls.filter((call) => call[0] === "notify").length, 1);
  const count = deps.calls.length;
  await handleMarketplaceEvent(event, deps);
  assert.equal(deps.calls.length, count);
});

test("late paid session refunds then records refunded", async () => {
  const deps = fake({ ...base, status: "cancelled" });
  await handleMarketplaceEvent({
    id: "evt",
    type: "checkout.session.completed",
    data: { object: session },
  }, deps);
  assert.ok(deps.calls.some((call) => call[0] === "refund" && call[2].idempotencyKey === "refund-late-o"));
  assert.ok(deps.calls.some((call) => call[0] === "order_transition" && call[1].p_to === "refunded"));
});

test("paid transition failure alerts and rethrows", async () => {
  const failure = new Error("database refused payment");
  const deps = fake(base, { transitionError: failure });
  await assert.rejects(
    handleMarketplaceEvent({
      id: "evt",
      type: "checkout.session.completed",
      data: { object: session },
    }, deps),
    failure,
  );
  assert.ok(deps.calls.some((call) => call[0] === "notify" && call[1].includes("order o")));
  assert.ok(deps.calls.some((call) => call[0] === "notify" && call[1].includes(failure.message)));
});

test("expired completed order and non-marketplace session are no-ops", async () => {
  const deps = fake({ ...base, status: "completed" });
  await handleMarketplaceEvent({ id: "e", type: "checkout.session.expired", data: { object: session } }, deps);
  await handleMarketplaceEvent({
    id: "e2",
    type: "checkout.session.completed",
    data: { object: { ...session, metadata: {} } },
  }, deps);
  assert.equal(deps.calls.length, 0);
});

test("account update retrieves fresh and external update marks bank change", async () => {
  const deps = fake(base);
  await handleMarketplaceEvent({
    id: "e",
    type: "account.updated",
    account: "acct",
    data: { object: { id: "stale" } },
  }, deps);
  assert.ok(deps.calls.some((call) => call[0] === "mkt_upsert_seller_account"));
  await handleMarketplaceEvent({
    id: "e2",
    type: "account.external_account.updated",
    account: "acct",
    data: { object: {} },
  }, deps);
  assert.ok(deps.calls.some((call) => call[0] === "mkt_mark_bank_changed"));
});
