import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_MARKETPLACE_RECORDS_MESSAGE,
  ACCOUNT_ORDERS_MESSAGE,
  accountDeletionDecision,
} from "./accountDeletion.js";

test("account deletion allows an account with no marketplace obligations", () => {
  assert.deepEqual(accountDeletionDecision(), {
    allowed: true,
    status: 200,
    message: null,
  });
});

for (const status of ["created", "awaiting_payment", "paid", "shipped", "delivered", "disputed"]) {
  test(`account deletion blocks a ${status} order`, () => {
    assert.deepEqual(accountDeletionDecision({ openOrders: [{ status }] }), {
      allowed: false,
      status: 409,
      message: ACCOUNT_ORDERS_MESSAGE,
    });
  });
}

test("account deletion blocks a completed order with an unpaid seller transfer", () => {
  assert.equal(accountDeletionDecision({ unpaidTransfers: [{ id: "order-1" }] }).status, 409);
});

test("account deletion blocks an open dispute", () => {
  assert.equal(accountDeletionDecision({ openDisputes: [{ id: "dispute-1" }] }).status, 409);
});

for (const [table, input] of [
  ["orders", { orders: [{ id: "order-1" }] }],
  ["seller_accounts", { sellerAccounts: [{ user_id: "user-1" }] }],
  ["order_email_log", { orderEmailLogs: [{ order_id: "order-1" }] }],
  ["order_feedback", { orderFeedback: [{ order_id: "order-1" }] }],
]) {
  test(`account deletion blocks before mutation when ${table} has a retained record`, () => {
    assert.deepEqual(accountDeletionDecision(input), {
      allowed: false,
      status: 409,
      message: ACCOUNT_MARKETPLACE_RECORDS_MESSAGE,
    });
  });
}

test("account deletion fails closed when the obligation check errors", () => {
  assert.deepEqual(accountDeletionDecision({ checkError: new Error("database unavailable") }), {
    allowed: false,
    status: 503,
    message: "Could not check marketplace orders. Please try again.",
  });
});
