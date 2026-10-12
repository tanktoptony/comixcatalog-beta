import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseActivationNudge, hasOwnedOrForSale, signTipsUnsubscribeToken, verifyTipsUnsubscribeToken } from "./activationNudges.js";

const now = new Date("2026-10-12T12:00:00.000Z");
const cutoff = "2026-10-10T00:00:00.000Z";
const profile = (overrides = {}) => ({ username: "reader", created_at: "2026-10-11T11:00:00.000Z", email_tips: true, nudge1_sent_at: null, nudge2_sent_at: null, ...overrides });

test("chooses nudge one in the 24 to 72 hour window", () => assert.equal(chooseActivationNudge(profile(), cutoff, now), 1));
test("chooses nudge two at 72 hours", () => assert.equal(chooseActivationNudge(profile({ created_at: "2026-10-09T12:00:00.000Z" }), "2026-10-09T00:00:00.000Z", now), 2));
test("does not send before 24 hours", () => assert.equal(chooseActivationNudge(profile({ created_at: "2026-10-11T13:00:00.000Z" }), cutoff, now), null));
test("excludes both test accounts", () => {
  assert.equal(chooseActivationNudge(profile({ username: "test_tony" }), cutoff, now), null);
  assert.equal(chooseActivationNudge(profile({ username: "TEST_TONY_DEPAUL" }), cutoff, now), null);
});
test("excludes unsubscribed and already-sent members", () => {
  assert.equal(chooseActivationNudge(profile({ email_tips: false }), cutoff, now), null);
  assert.equal(chooseActivationNudge(profile({ nudge1_sent_at: now.toISOString() }), cutoff, now), null);
  assert.equal(chooseActivationNudge(profile({ created_at: "2026-10-09T12:00:00.000Z", nudge2_sent_at: now.toISOString() }), "2026-10-09T00:00:00.000Z", now), null);
});
test("pre-cutoff members can never be emailed", () => assert.equal(chooseActivationNudge(profile({ created_at: "2026-10-09T23:59:59.999Z" }), cutoff, now), null));
test("zero-book re-check counts owned and for-sale books, but not wishlist books", () => {
  assert.equal(hasOwnedOrForSale([]), false);
  assert.equal(hasOwnedOrForSale([{ status: "wishlist" }]), false);
  assert.equal(hasOwnedOrForSale([{ status: "owned" }]), true);
  assert.equal(hasOwnedOrForSale([{ status: "for_sale" }]), true);
});
test("tips unsubscribe tokens sign and verify without login", () => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-that-is-not-used-in-production";
  const id = "5bbf47c4-b351-4f56-8f4f-67597f4328ca";
  const token = signTipsUnsubscribeToken(id);
  assert.equal(verifyTipsUnsubscribeToken(token), id);
  assert.equal(verifyTipsUnsubscribeToken(`${token}x`), null);
});
