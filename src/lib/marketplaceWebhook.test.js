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
        update: (values) => ({
          eq: async (...args) => {
            calls.push(["update", table, values, ...args]);
            return { error: null };
          },
        }),
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

test("paid session stores card fingerprint and checks shared-card fraud", async () => {
  const deps = fake(base);
  deps.stripe.paymentIntents.retrieve = async () => ({
    id: "pi",
    latest_charge: {
      id: "ch",
      payment_method_details: {
        card: { fingerprint: "fp_same" },
      },
    },
  });
  deps.db.rpc = async (name, args) => {
    deps.calls.push([name, args]);
    if (name === "order_transition") deps.order.status = args.p_to;
    return { data: name === "mkt_flag_shared_card", error: null };
  };
  await handleMarketplaceEvent({
    id: "evt_paid",
    type: "checkout.session.completed",
    data: { object: session },
  }, deps);
  assert.ok(deps.calls.some((call) => call[0] === "update" && call[2].card_fingerprint === "fp_same"));
  assert.ok(deps.calls.some((call) => call[0] === "mkt_flag_shared_card"));
  assert.ok(deps.calls.some((call) => call[0] === "notify" && call[1].includes("Shared card fingerprint")));
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

function disputeDeps({ knownOrder = true, knownRefund = false } = {}) {
  const calls = [];
  const order = knownOrder ? { id: "00000000-0000-4000-8000-000000000001" } : null;
  return {
    calls,
    db: {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: table === "orders" ? order : knownRefund ? { id: "saved" } : null,
              error: null,
            }),
          }),
        }),
      }),
      rpc: async (name, args) => {
        calls.push([name, args]);
        return { data: null, error: null };
      },
    },
    stripe: {
      charges: {
        retrieve: async () => ({ transfer_group: order?.id }),
      },
      paymentIntents: {
        retrieve: async () => ({ metadata: { order_id: order?.id } }),
      },
    },
    notifyAdmin: async (message) => calls.push(["notify", message]),
  };
}

test("charge.refunded records dashboard refunds and skips our recorded refund", async () => {
  const dashboard = disputeDeps();
  await handleMarketplaceEvent({
    id: "evt_refund",
    type: "charge.refunded",
    data: { object: { transfer_group: dashboard.db ? "00000000-0000-4000-8000-000000000001" : "", refunds: { data: [{ id: "re_1", amount: 250 }] } } },
  }, dashboard);
  assert.equal(dashboard.calls.filter(([name]) => name === "order_record_refund").length, 1);
  const own = disputeDeps({ knownRefund: true });
  await handleMarketplaceEvent({
    id: "evt_echo",
    type: "charge.refunded",
    data: { object: { transfer_group: "00000000-0000-4000-8000-000000000001", refunds: { data: [{ id: "re_1", amount: 250 }] } } },
  }, own);
  assert.equal(own.calls.length, 0);
});

test("chargeback create, won, lost, and duplicate events use idempotent RPCs", async () => {
  for (const [status, won] of [["won", true], ["lost", false]]) {
    const deps = disputeDeps();
    await handleMarketplaceEvent({ id: `evt_${status}`, type: "charge.dispute.closed", data: { object: { id: `dp_${status}`, charge: "ch_1", status } } }, deps);
    const close = deps.calls.find(([name]) => name === "order_close_chargeback");
    assert.equal(close[1].p_won, won);
    await handleMarketplaceEvent({ id: `evt_${status}`, type: "charge.dispute.closed", data: { object: { id: `dp_${status}`, charge: "ch_1", status } } }, deps);
    assert.equal(deps.calls.filter(([name]) => name === "order_close_chargeback").length, 2);
  }
  const created = disputeDeps();
  await handleMarketplaceEvent({ id: "evt_created", type: "charge.dispute.created", data: { object: { id: "dp_1", charge: "ch_1" } } }, created);
  assert.ok(created.calls.some(([name]) => name === "order_record_chargeback"));
  assert.ok(created.calls.some(([name]) => name === "notify"));
});

test("closed before created is accepted and unknown chargeback orders are ignored", async () => {
  const reverse = disputeDeps();
  await handleMarketplaceEvent({ id: "evt_closed", type: "charge.dispute.closed", data: { object: { id: "dp_reverse", charge: "ch_1", status: "lost" } } }, reverse);
  assert.ok(reverse.calls.some(([name]) => name === "order_close_chargeback"));
  const unknown = disputeDeps({ knownOrder: false });
  await handleMarketplaceEvent({ id: "evt_unknown", type: "charge.dispute.created", data: { object: { id: "dp_unknown", charge: "ch_1" } } }, unknown);
  assert.equal(unknown.calls.length, 0);
});
