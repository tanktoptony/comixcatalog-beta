import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldEmail, THROTTLE_HOURS } from "./messageEmail.js";

const now = new Date("2026-10-09T18:00:00.000Z");

test("does not email a recipient who opted out", () => {
  assert.equal(shouldEmail({ optedOut: true, lastEmailedAt: null, now }), false);
});

test("emails when there is no prior conversation email", () => {
  assert.equal(shouldEmail({ optedOut: false, lastEmailedAt: null, now }), true);
});

test("does not email within the throttle window", () => {
  const lastEmailedAt = new Date(now.getTime() - (THROTTLE_HOURS * 60 * 60 * 1000 - 1));
  assert.equal(shouldEmail({ optedOut: false, lastEmailedAt, now }), false);
});

test("emails at the exact six-hour boundary", () => {
  const lastEmailedAt = new Date(now.getTime() - THROTTLE_HOURS * 60 * 60 * 1000);
  assert.equal(shouldEmail({ optedOut: false, lastEmailedAt, now }), true);
});
