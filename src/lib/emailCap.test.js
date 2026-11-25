import assert from "node:assert/strict";
import test from "node:test";
import { canSendOther, canSendSummary, loadRecentEmails, recentEmails } from "./emailCap.js";

const now = new Date("2026-11-29T15:00:00Z"); // a Sunday, digest time
const daysAgo = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();

test("a quiet week has room for everything", () => {
  const recent = recentEmails({}, now);
  assert.equal(canSendSummary(recent), true);
  assert.equal(canSendOther(recent), true);
});

test("one summary carrying many notices is one email", () => {
  const recent = recentEmails({ activityAt: Array(20).fill(daysAgo(2)) }, now);
  assert.deepEqual(recent, { activity: 1, total: 1 });
});

test("a summary waits a week after the last one but leaves room for the digest", () => {
  const recent = recentEmails({ activityAt: [daysAgo(2)] }, now);
  assert.equal(canSendSummary(recent), false);
  assert.equal(canSendOther(recent), true);
});

test("after two emails everything waits", () => {
  const recent = recentEmails({ activityAt: [daysAgo(2)], campaignAt: [daysAgo(3)] }, now);
  assert.equal(canSendSummary(recent), false);
  assert.equal(canSendOther(recent), false);
});

test("two nudges fill a new member's week", () => {
  const recent = recentEmails({ nudgeAt: [daysAgo(4), daysAgo(2)] }, now);
  assert.equal(canSendSummary(recent), false);
  assert.equal(canSendOther(recent), false);
});

test("last week's digest, sent late, never blocks this week's", () => {
  const recent = recentEmails({ activityAt: [daysAgo(1)], campaignAt: [daysAgo(6.6)] }, now);
  assert.equal(canSendOther(recent), true);
});

test("right-away emails were asked for and don't use up the cap", () => {
  const recent = recentEmails({ activityAt: [daysAgo(1), daysAgo(2), daysAgo(3)], mode: "instant" }, now);
  assert.equal(canSendOther(recent), true);
});

test("a failed read throws instead of sending uncapped", async () => {
  const chain = new Proxy({}, { get: (_, key) => (key === "then" ? (resolve) => resolve({ data: null, error: { message: "down" } }) : () => chain) });
  await assert.rejects(loadRecentEmails({ from: () => chain }, "u1", { now }), /recent emails read failed: down/);
});
