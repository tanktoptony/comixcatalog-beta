import test from "node:test";
import assert from "node:assert/strict";
import { orderNextStep, orderTitle, orderTotals } from "./orderRows.js";

const base = { series_title: "Saga", issue_number: "1", total_cents: 1300 };
const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();

test("a fresh paid order asks the seller to ship and tells the buyer when", () => {
  const order = { ...base, status: "paid", paid_at: hoursAgo(1) };
  const seller = orderNextStep(order, "selling");
  assert.match(seller.text, /^Ship by \w{3} \d{1,2}$/);
  assert.equal(seller.tone, "action");
  const buyer = orderNextStep(order, "buying");
  assert.match(buyer.text, /^Seller ships by /);
  assert.equal(buyer.tone, "active");
});

test("a paid order past its ship-by day says late to the seller only", () => {
  const order = { ...base, status: "paid", paid_at: hoursAgo(24 * 10) };
  assert.match(orderNextStep(order, "selling").text, /Late/);
  assert.doesNotMatch(orderNextStep(order, "buying").text, /Late/);
});

test("shipped shows tracking, or says there is none", () => {
  const order = { ...base, status: "shipped", shipped_at: hoursAgo(30), tracking_carrier: "usps", tracking_number: "9400 1000" };
  assert.match(orderNextStep(order, "buying").text, /USPS 9400 1000$/);
  assert.match(orderNextStep({ ...order, tracking_number: null }, "selling").text, /no tracking$/);
});

test("completed shows payout to the seller and asks for missing feedback", () => {
  const order = { ...base, status: "completed", completed_at: hoursAgo(48), transferred_at: hoursAgo(24) };
  assert.match(orderNextStep(order, "selling").text, /^Payout sent /);
  assert.equal(orderNextStep({ ...order, transferred_at: null }, "selling").text, "Payout pending");
  const asking = orderNextStep({ ...order, needs_feedback: true }, "buying");
  assert.match(asking.text, /, leave feedback$/);
  assert.equal(asking.tone, "action");
  assert.equal(orderNextStep(order, "buying").tone, "done");
});

test("cancelled before payment reads as an unfinished checkout", () => {
  const order = { ...base, status: "cancelled", cancelled_at: hoursAgo(2) };
  assert.equal(orderNextStep(order, "selling").text, "Buyer didn't finish checkout");
  assert.equal(orderNextStep(order, "buying").text, "Checkout not finished");
});

test("refunds show the refunded amount and an open dispute wins over status", () => {
  assert.match(orderNextStep({ ...base, status: "refunded", refunded_at: hoursAgo(2), refunded_cents: 1300 }, "buying").text, /^\$13\.00 refunded /);
  assert.equal(orderNextStep({ ...base, status: "shipped", open_dispute: true }, "buying").tone, "problem");
});

test("multi-book orders are titled by count", () => {
  assert.equal(orderTitle({ ...base, items: [{}, {}, {}] }), "3 books");
  assert.equal(orderTitle(base), "Saga #1");
});

test("totals ignore test-mode orders and only count completed payouts", () => {
  const rows = [
    { status: "paid" },
    { status: "paid", test: true },
    { status: "shipped" },
    { status: "completed", transferred_at: hoursAgo(1), seller_net_cents: 1232 },
    { status: "refunded", transferred_at: hoursAgo(1), seller_net_cents: 999 },
  ];
  assert.deepEqual(orderTotals(rows, "selling").map((total) => total.value), [1, 1, 1, "$12.32"]);
  assert.deepEqual(orderTotals(rows, "buying").map((total) => total.value), [1, 1, 1]);
});
