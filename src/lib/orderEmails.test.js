import test from "node:test";
import assert from "node:assert/strict";
import { orderEmailTemplate } from "./orderEmails.js";

const order = {
  id: "order-1",
  series_title: "Saga <script>",
  issue_number: "1 & 2",
  tracking_number: "ABC<12345",
  ship_to: { address: { line1: "10 Secret St", city: "Austin", state: "TX", postal_code: "78701" } },
};

test("order email templates escape values, link the order, and omit full addresses", () => {
  for (const [event, role] of [["paid", "buyer"], ["paid", "seller"], ["shipped", "buyer"], ["completed", "seller"]]) {
    const result = orderEmailTemplate(order, event, role);
    assert.match(result.html, /\/orders\/order-1/);
    assert.doesNotMatch(result.html, /<script>/);
    assert.doesNotMatch(result.html, /10 Secret St|78701/);
    assert.doesNotMatch(result.html, /—/);
  }
  assert.match(orderEmailTemplate(order, "paid", "seller").html, /Austin, TX/);
});
